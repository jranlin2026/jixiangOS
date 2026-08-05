import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { failure, success, type ApiResponse } from '../api/response';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { buildDataVisibilityScopeForUser, type DataVisibilityScope } from '../../src/shared/utils/dataVisibility';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { Customer } from '../../src/types/customer';
import type { Order, OrderChangeLog, OrderCorrectionInput, OrderCorrectionPrecheck } from '../../src/types/order';
import type { Product } from '../../src/types/product';
import type { Department } from '../../src/types/department';
import type { Role } from '../../src/types/role';
import type { User } from '../../src/types/settings';
import type { Delivery } from '../../src/types/delivery';
import { allocateOrderItemActualAmounts, canonicalizeOrderItems } from '../../src/shared/utils/orderItems';
import type {
  Commission,
  CommissionCorrectionPreview,
  CommissionCorrectionRecord,
  CommissionManualEntitlementDraft,
  CommissionOperationLog,
  CommissionPostPayoutEntryContext,
  CommissionPayoutCorrectionContext,
  CommissionPayoutRecord,
  OfficialPaymentChannel,
  PostPayoutEntitlementStrategy,
} from '../../src/types/commission';
import { mapPrismaRole, mapPrismaUser } from '../db/prismaMappers';
import { hasPermission, isSuperAdmin, PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import { isRecoveryCommission, selectCurrentCommissionRounds } from '../../src/shared/utils/commissionConfiguration';
import {
  createCustomerBusinessRecordRepository,
  CustomerWriteConflictError,
} from './customerBusinessRecordRepository';
import { buildCommissionCorrectionImpact, findOverlappingFinancialCorrection } from './commissionCorrectionImpactService';
import { persistCommissionCorrection } from './commissionCorrectionService';
import { lockCommissionLedger } from './commissionLedgerLock';
import { createFinanceTransactionService } from './financeTransactionService';

type OrderCommandPrisma = Pick<PrismaClient, 'businessRecord' | 'user' | 'role' | 'department' | '$transaction'>;

type LockedOrderRow = {
  id: string;
  domain: string;
  recordId: string;
  data: unknown;
};

type Directory = {
  users: User[];
  roles: Role[];
  departments: Department[];
};

export interface OrderCommandServiceOptions {
  now?: () => Date;
  rebuildPendingCommissions?: (
    transaction: Prisma.TransactionClient,
    order: Order,
    changedAt: string,
  ) => Promise<void>;
  previewCommissions?: (
    transaction: Prisma.TransactionClient,
    order: Order,
    changedAt: string,
  ) => Promise<Commission[]>;
}

const MAX_TRANSACTION_ATTEMPTS = 3;
const SERVER_FIELDS = new Set([
  'id',
  'orderNo',
  'createdAt',
  'updatedAt',
  'createdById',
  'createdByName',
  'deletedAt',
  'deletedBy',
  'deleteReason',
  'sourceApplicationId',
  'approvalDownstreamEffects',
  'changeHistory',
  'commissionId',
  'deliveryId',
]);
const IMMUTABLE_RELATION_FIELDS = new Set([
  'customerId',
  'customerName',
  'owner',
  'salesId',
  'salesName',
  'leadInputBy',
  'leadContributorId',
  'leadContributorName',
  'leadSource',
  'sourceName',
  'sourceType',
  'resourceOwnership',
]);
const FINANCIAL_FIELDS = new Set([
  'productId',
  'productName',
  'productLevel',
  'items',
  'standardTotalAmount',
  'orderType',
  'amount',
  'actualAmount',
  'paymentMethod',
  'status',
  'refundStatus',
  'refundAmount',
  'refundReason',
  'dealScene',
  'proofStatus',
  'originalOrderId',
  'performanceBaseAmount',
  'isExternalTalentOrder',
]);
const DIRECT_EDIT_FIELDS = new Set([
  'notes',
  'sourcePlatformId',
  'sourcePlatformName',
  'sourceShopId',
  'sourceShopName',
  'thirdPartyOrderNo',
  'payments',
  'dealEvidenceName',
  'dealEvidencePreview',
  'dealEvidenceAttachments',
]);
const EDIT_FIELD_LABELS: Record<string, string> = {
  notes: '备注',
  sourcePlatformId: '来源平台',
  sourcePlatformName: '来源平台',
  sourceShopId: '来源店铺',
  sourceShopName: '来源店铺',
  thirdPartyOrderNo: '平台订单号',
  payments: '付款订单号或付款凭证',
  dealEvidenceName: '成交路径附件名称',
  dealEvidencePreview: '成交路径附件',
  dealEvidenceAttachments: '成交路径附件',
};
const CORRECTION_INPUT_FIELDS = new Set([
  'customerId',
  'productId',
  'items',
  'standardTotalAmount',
  'salesId',
  'orderType',
  'actualAmount',
  'payments',
  'officialPaymentChannel',
  'sourcePlatformId',
  'sourcePlatformName',
  'sourceShopId',
  'sourceShopName',
  'thirdPartyOrderNo',
  'notes',
  'resourceOwnership',
  'dealEvidenceName',
  'dealEvidencePreview',
  'dealEvidenceAttachments',
]);
const CORRECTION_FIELD_LABELS: Record<string, string> = {
  customerId: '客户',
  customerName: '客户名称',
  productId: '产品',
  productName: '产品名称',
  productLevel: '产品等级',
  items: '产品明细',
  standardTotalAmount: '产品总计',
  salesId: '销售负责人',
  salesName: '销售负责人',
  owner: '销售负责人',
  orderType: '订单类型',
  amount: '订单金额',
  actualAmount: '实付金额',
  performanceBaseAmount: '业绩核算金额',
  payments: '付款记录',
  officialPaymentChannel: '官方收款渠道',
  paymentMethod: '付款方式',
  sourcePlatformId: '来源平台',
  sourcePlatformName: '来源平台',
  sourceShopId: '来源店铺',
  sourceShopName: '来源店铺',
  thirdPartyOrderNo: '平台订单号',
  notes: '备注',
  resourceOwnership: '资源归属',
  leadSource: '线索来源',
  sourceName: '二级线索来源',
  leadInputBy: '线索录入人',
  leadContributorName: '线索贡献人',
  dealScene: '成交场景',
  proofStatus: '凭证状态',
  dealEvidenceName: '成交路径截图名称',
  dealEvidencePreview: '成交路径截图',
  dealEvidenceAttachments: '成交路径截图',
};
const OFFICIAL_PAYMENT_CHANNEL_VALUES = new Set<OfficialPaymentChannel>([
  '企业微信转账',
  '企业支付宝转账',
  '对公银行转账',
  '公司自营小店',
  '非官方渠道',
]);

class OrderCommandError extends Error {
  constructor(readonly responseCode: number, message: string) {
    super(message);
    this.name = 'OrderCommandError';
  }
}

function parseObject<T extends object>(value: unknown, label: string): T {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not object');
    return parsed as T;
  } catch {
    throw new OrderCommandError(409, `${label}数据损坏，请先修复数据`);
  }
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function hash(value: string, length = 12): string {
  return createHash('sha256').update(value).digest('hex').slice(0, length);
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function auditValue(value: unknown): string | number | boolean | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return JSON.stringify(value);
}

function correctionAuditValue(field: string, value: unknown): string | number | boolean | null {
  if (field === 'payments' && Array.isArray(value)) {
    return JSON.stringify(value.map((payment) => {
      const item = payment as Order['payments'][number];
      return {
        id: item.id,
        amount: item.amount,
        paymentMethod: item.paymentMethod,
        paidAt: item.paidAt,
        paymentOrderNo: item.paymentOrderNo || null,
        attachments: (item.attachments || []).map((attachment) => ({ id: attachment.id, name: attachment.name })),
      };
    }));
  }
  if (field === 'dealEvidencePreview') return value ? '已上传' : null;
  if (field === 'dealEvidenceAttachments' && Array.isArray(value)) {
    return JSON.stringify(value.map((attachment) => {
      const item = attachment as { id?: string; name?: string };
      return { id: item.id, name: item.name };
    }));
  }
  return auditValue(value);
}

function dealSceneFromOrderType(orderType: Order['orderType']): Order['dealScene'] {
  const scenes = new Set([
    '899成交', '新代理', '成交线索转代理', '成交线索转新代理',
    '代理升单', '代理复购', '转介绍成交', '智能体服务', '个人资源成交',
  ]);
  return scenes.has(orderType) ? orderType as Order['dealScene'] : undefined;
}

function prismaCode(error: unknown): unknown {
  return (error as { code?: unknown } | null)?.code;
}

async function loadDirectory(prisma: OrderCommandPrisma): Promise<Directory> {
  const [users, roles, departments] = await Promise.all([
    prisma.user.findMany(),
    prisma.role.findMany({ where: { isActive: true } }),
    prisma.department.findMany(),
  ]);
  return {
    users: users.map(mapPrismaUser),
    roles: roles.map(mapPrismaRole),
    departments: departments as unknown as Department[],
  };
}

function orderScope(directory: Directory, actor: AuthenticatedUser): DataVisibilityScope {
  return buildDataVisibilityScopeForUser(actor, directory.users, directory.roles, directory.departments, 'orders');
}

function orderIsVisible(order: Order, scope: DataVisibilityScope): boolean {
  if (scope.unrestricted) return true;
  // 权限判断只认稳定员工 ID。同名员工或历史姓名快照不能成为授权依据；
  // 缺少 salesId 的历史订单应先完成归属迁移，再开放写操作。
  return Boolean(order.salesId && scope.visibleUserIds.includes(order.salesId));
}

function changedFields(order: Order, patch: Partial<Order>): string[] {
  return Object.keys(patch).filter((field) => !sameValue(
    (order as unknown as Record<string, unknown>)[field],
    (patch as unknown as Record<string, unknown>)[field],
  ));
}

function assertPaymentMetadataOnly(order: Order, patch: Partial<Order>): void {
  if (!Object.prototype.hasOwnProperty.call(patch, 'payments')) return;
  if (!Array.isArray(patch.payments)) {
    throw new OrderCommandError(409, '普通资料编辑不能增删付款记录，请走订单更正');
  }
  const currentPayments = order.payments || [];
  if (!currentPayments.length && patch.payments.length === 1) {
    const payment = patch.payments[0];
    const paymentId = typeof payment?.id === 'string' ? payment.id.trim() : '';
    if (
      !paymentId
      || !sameValue(payment.amount, order.actualAmount)
      || !sameValue(payment.paymentMethod, order.paymentMethod)
      || !sameValue(payment.paidAt, order.createdAt)
    ) {
      throw new OrderCommandError(409, '历史订单补充首笔付款资料时，金额、方式和时间必须保持订单原值');
    }
    patch.payments = [{ ...payment, id: paymentId }];
    return;
  }
  if (patch.payments.length !== currentPayments.length) {
    throw new OrderCommandError(409, '普通资料编辑不能增删付款记录，请走订单更正');
  }
  patch.payments.forEach((payment, index) => {
    const current = currentPayments[index];
    if (!current || [
      'id',
      'amount',
      'paymentMethod',
      'paidAt',
    ].some((field) => !sameValue(
      (current as unknown as Record<string, unknown>)[field],
      (payment as unknown as Record<string, unknown>)[field],
    ))) {
      throw new OrderCommandError(409, '付款金额、方式和时间不能在资料编辑中修改，请走订单更正');
    }
  });
}

function assertAllowedPatch(order: Order, patch: Partial<Order>): string[] {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new OrderCommandError(400, '订单修改数据无效');
  }
  const changed = changedFields(order, patch);
  assertPaymentMetadataOnly(order, patch);
  const serverField = changed.find((field) => SERVER_FIELDS.has(field));
  if (serverField) throw new OrderCommandError(400, `字段 ${serverField} 由服务端维护，不能修改`);
  const relationField = changed.find((field) => IMMUTABLE_RELATION_FIELDS.has(field));
  if (relationField) throw new OrderCommandError(409, '客户和销售归属不能在正式订单编辑中修改');
  const financialField = changed.find((field) => FINANCIAL_FIELDS.has(field));
  if (financialField) {
    throw new OrderCommandError(409, '金额、产品、付款和订单状态不能直接修改，请走财务更正流程');
  }
  const unsupported = changed.find((field) => !DIRECT_EDIT_FIELDS.has(field));
  if (unsupported) throw new OrderCommandError(400, `字段 ${unsupported} 不支持在正式订单中直接修改`);
  return changed;
}

function paymentMethodFromOfficialChannel(channel: OfficialPaymentChannel): Order['paymentMethod'] {
  if (channel === '企业微信转账' || channel === '公司自营小店') return '微信支付';
  if (channel === '企业支付宝转账') return '支付宝';
  if (channel === '对公银行转账') return '对公转账';
  return '银行转账';
}

async function replacePendingCommissions(
  transaction: Prisma.TransactionClient,
  current: Order,
  next: Order,
  changedAt: string,
  operator: string,
  rebuild?: OrderCommandServiceOptions['rebuildPendingCommissions'],
): Promise<void> {
  if (current.originalOrderId) {
    throw new OrderCommandError(409, '该订单关联历史订单冲销，收款渠道请走财务更正流程');
  }
  const rows = await transaction.$queryRaw<Array<{ recordId: string; status: string | null; data: unknown }>>(Prisma.sql`
    SELECT id, recordId, status, data
    FROM business_records
    WHERE domain = ${STORAGE_KEYS.COMMISSIONS}
      AND (
        orderId = ${current.id}
        OR JSON_UNQUOTE(JSON_EXTRACT(data, '$.orderId')) = ${current.id}
      )
    ORDER BY recordId ASC
    FOR UPDATE
  `);
  const commissions = rows.map((row) => parseObject<Commission>(row.data, '提成'));
  const locked = rows.find((row, index) => String(row.status || commissions[index].status || '') !== '待确认');
  if (locked) throw new OrderCommandError(409, '只有全部处于待确认状态的提成，才允许更正官方收款渠道');
  if (commissions.some((commission) => commission.isManualAdjusted || commission.sourceType === '人工新增')) {
    throw new OrderCommandError(409, '该订单存在人工新增或人工调整的提成，请走财务更正流程');
  }
  if (!rebuild) throw new OrderCommandError(503, '提成重算服务不可用，暂不能修改官方收款渠道');
  await transaction.businessRecord.deleteMany({
    where: { domain: STORAGE_KEYS.COMMISSIONS, recordId: { in: rows.map((row) => row.recordId) } },
  });
  await rebuild(transaction, next, changedAt);
  const rebuiltRows = await transaction.businessRecord.findMany({
    where: { domain: STORAGE_KEYS.COMMISSIONS, orderId: current.id },
  });
  const rebuilt = rebuiltRows.map((row) => parseObject<Commission>(row.data, '提成'));
  const splitSnapshot = rebuilt.map((commission) => ({
    role: commission.role,
    owner: commission.owner,
    ownerId: commission.ownerId,
    department: commission.department,
    commissionAmount: Number(commission.commissionAmount || 0),
    status: commission.status,
  }));
  const totalCommissionAmount = Math.round(
    splitSnapshot.reduce((sum, item) => sum + item.commissionAmount, 0) * 100,
  ) / 100;
  const log: CommissionOperationLog = {
    id: `comm-log-${hash(`${current.id}:payment-channel:${changedAt}`)}`,
    orderId: current.id,
    orderNo: current.orderNo,
    customerName: current.customerName,
    action: '更正收款渠道',
    operator,
    operatedAt: changedAt,
    reason: `官方收款渠道由${current.officialPaymentChannel || '-'}更正为${next.officialPaymentChannel || '-'}`,
    summary: `已按新收款渠道重新计算 ${rebuilt.length} 条待确认提成，合计 ${totalCommissionAmount} 元`,
    commissionCount: rebuilt.length,
    totalCommissionAmount,
    splitSnapshot,
  };
  await transaction.businessRecord.create({
    data: {
      id: `${STORAGE_KEYS.COMMISSION_OPERATION_LOGS}:${log.id}`,
      domain: STORAGE_KEYS.COMMISSION_OPERATION_LOGS,
      recordId: log.id,
      title: `${current.orderNo}-更正收款渠道`,
      status: log.action,
      orderId: current.id,
      amount: totalCommissionAmount,
      eventAt: new Date(changedAt),
      data: jsonValue(log),
    },
  });
}

async function validateStableOrderRelations(
  transaction: Prisma.TransactionClient,
  order: Order,
  directory: Directory,
): Promise<void> {
  if (!order.customerId || !order.productId || !order.salesId) {
    throw new OrderCommandError(409, '订单缺少客户、产品或销售稳定ID，不能继续编辑');
  }
  const [customerRow, productRow] = await Promise.all([
    transaction.businessRecord.findUnique({
      where: { domain_recordId: { domain: STORAGE_KEYS.CUSTOMERS, recordId: order.customerId } },
    }),
    transaction.businessRecord.findUnique({
      where: { domain_recordId: { domain: STORAGE_KEYS.PRODUCTS, recordId: order.productId } },
    }),
  ]);
  if (!customerRow) throw new OrderCommandError(409, '订单关联客户不存在');
  if (!productRow) throw new OrderCommandError(409, '订单关联产品不存在');
  const customer = parseObject<Customer>(customerRow.data, '客户');
  const product = parseObject<Product>(productRow.data, '产品');
  const customerNames = [customer.name, customer.company].map((value) => String(value || '').trim()).filter(Boolean);
  if (customer.id !== order.customerId || customer.deletedAt || !customerNames.includes(order.customerName)) {
    throw new OrderCommandError(409, '订单客户快照与客户稳定ID不一致');
  }
  if (
    product.id !== order.productId
    || product.isActive === false
    || product.name !== order.productName
    || product.level !== order.productLevel
  ) {
    throw new OrderCommandError(409, '订单产品快照与产品稳定ID不一致');
  }
  const sales = directory.users.find((user) => (
    user.id === order.salesId
    && user.isActive
    && (user.employmentStatus || 'active') === 'active'
  ));
  if (!sales || sales.name !== order.salesName || sales.name !== order.owner) {
    throw new OrderCommandError(409, '订单销售归属与销售稳定ID不一致');
  }
  if (directory.users.filter((user) => (
    user.isActive
    && (user.employmentStatus || 'active') === 'active'
    && user.name === sales.name
  )).length !== 1) {
    throw new OrderCommandError(409, '订单销售姓名重复，请先修复员工目录');
  }
}

async function lockOrder(transaction: Prisma.TransactionClient, orderId: string): Promise<Order> {
  const rows = await transaction.$queryRaw<LockedOrderRow[]>`
    SELECT id, domain, recordId, data
    FROM business_records
    WHERE domain = ${STORAGE_KEYS.ORDERS}
      AND recordId = ${orderId}
    LIMIT 1
    FOR UPDATE
  `;
  if (!rows[0]) throw new OrderCommandError(404, '订单不存在');
  const order = parseObject<Order>(rows[0].data, '订单');
  if (order.id !== orderId) throw new OrderCommandError(409, '订单标识与数据库记录不一致');
  return order;
}

async function recalculateCustomerProjection(
  transaction: Prisma.TransactionClient,
  customerId: string,
  changedAt: string,
): Promise<void> {
  const customerRecords = createCustomerBusinessRecordRepository(transaction);
  let snapshot;
  try {
    snapshot = await customerRecords.lockById(customerId);
  } catch (error) {
    if (
      error instanceof SyntaxError
      || (error instanceof Error && (
        error.message.startsWith('客户 BusinessRecord')
        || error.message.startsWith('客户ID')
        || error.message.startsWith('客户记录必须来自')
      ))
    ) {
      throw new OrderCommandError(409, `客户投影数据损坏：${error.message}`);
    }
    throw error;
  }
  if (!snapshot) return;
  const customer = snapshot.customer;
  const orderRows = await transaction.businessRecord.findMany({ where: { domain: STORAGE_KEYS.ORDERS } });
  const orders = orderRows
    .map((row) => parseObject<Order>(row.data, '订单'))
    .filter((order) => order.customerId === customerId && !order.deletedAt);
  const latest = [...orders].sort((left, right) => (
    new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  ))[0];
  const updated: Customer = {
    ...customer,
    productLevel: latest?.productLevel || customer.productLevel,
    orderCount: orders.length,
    totalSpent: Math.round(orders.reduce((sum, order) => sum + Number(order.actualAmount || 0), 0) * 100) / 100,
    updatedAt: changedAt,
  };
  try {
    await customerRecords.compareAndSave(snapshot, updated, new Date(changedAt));
  } catch (error) {
    if (error instanceof CustomerWriteConflictError) {
      throw new OrderCommandError(409, error.message);
    }
    throw error;
  }
}

async function buildCorrectedOrder(
  transaction: Prisma.TransactionClient,
  order: Order,
  patch: Partial<Order>,
  directory: Directory,
  changedAt: string,
): Promise<Order> {
  const next: Order = { ...order, updatedAt: changedAt };

  if (patch.customerId && patch.customerId !== order.customerId) {
    const customerRow = await transaction.businessRecord.findUnique({
      where: { domain_recordId: { domain: STORAGE_KEYS.CUSTOMERS, recordId: patch.customerId } },
    });
    if (!customerRow) throw new OrderCommandError(409, '更正后的客户不存在');
    const customer = parseObject<Customer>(customerRow.data, '客户');
    if (customer.deletedAt) throw new OrderCommandError(409, '更正后的客户已删除');
    next.customerId = customer.id;
    next.customerName = String(customer.name || customer.company || '').trim();
    next.leadInputBy = customer.leadInputBy;
    next.leadContributorId = customer.leadContributorId;
    next.leadContributorName = customer.leadContributorName;
    next.leadSource = customer.leadSource;
    next.sourceName = customer.sourceName;
    next.sourceType = customer.leadSource || next.sourceType;
    next.resourceOwnership = (customer.sourceType as Order['resourceOwnership']) || next.resourceOwnership;
  }

  if (Array.isArray(patch.items) && patch.items.length) {
    const productRows = await Promise.all(patch.items.map((item) => transaction.businessRecord.findUnique({
      where: { domain_recordId: { domain: STORAGE_KEYS.PRODUCTS, recordId: item.productId } },
    })));
    const products = productRows.filter(Boolean).map((row) => parseObject<Product>(row!.data, '产品'));
    let canonical;
    try {
      canonical = canonicalizeOrderItems(patch.items, products);
    } catch (error) {
      throw new OrderCommandError(409, error instanceof Error ? error.message : '更正后的产品明细无效');
    }
    const primary = canonical.items.find((item) => item.isPrimary) || canonical.items[0];
    next.items = allocateOrderItemActualAmounts(canonical.items, Number(patch.actualAmount ?? next.actualAmount));
    next.standardTotalAmount = canonical.standardTotalAmount;
    next.amount = canonical.standardTotalAmount;
    next.productId = primary.productId;
    next.productName = primary.productName;
    next.productLevel = primary.productLevel;
  } else if (patch.productId && patch.productId !== order.productId) {
    const productRow = await transaction.businessRecord.findUnique({
      where: { domain_recordId: { domain: STORAGE_KEYS.PRODUCTS, recordId: patch.productId } },
    });
    if (!productRow) throw new OrderCommandError(409, '更正后的产品不存在');
    const product = parseObject<Product>(productRow.data, '产品');
    if (!product.isActive) throw new OrderCommandError(409, '更正后的产品已停用');
    next.productId = product.id;
    next.productName = product.name;
    next.productLevel = product.level;
  }

  if (patch.salesId && patch.salesId !== order.salesId) {
    const sales = directory.users.find((user) => (
      user.id === patch.salesId
      && user.isActive
      && (user.employmentStatus || 'active') === 'active'
    ));
    if (!sales) throw new OrderCommandError(409, '更正后的销售负责人不存在或已停用');
    next.salesId = sales.id;
    next.salesName = sales.name;
    next.owner = sales.name;
  }

  for (const field of CORRECTION_INPUT_FIELDS) {
    if (['customerId', 'productId', 'salesId', 'items', 'standardTotalAmount'].includes(field)) continue;
    if (!Object.prototype.hasOwnProperty.call(patch, field)) continue;
    (next as unknown as Record<string, unknown>)[field] = (patch as unknown as Record<string, unknown>)[field];
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'thirdPartyOrderNo')) {
    next.thirdPartyOrderNo = String(patch.thirdPartyOrderNo || '').trim() || undefined;
  }
  for (const field of ['sourcePlatformId', 'sourcePlatformName', 'sourceShopId', 'sourceShopName'] as const) {
    if (Object.prototype.hasOwnProperty.call(patch, field)) {
      next[field] = String(patch[field] || '').trim() || undefined;
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'officialPaymentChannel')) {
    if (!OFFICIAL_PAYMENT_CHANNEL_VALUES.has(patch.officialPaymentChannel as OfficialPaymentChannel)) {
      throw new OrderCommandError(400, '官方收款渠道无效');
    }
    next.paymentMethod = paymentMethodFromOfficialChannel(patch.officialPaymentChannel!);
  }
  if (!Number.isFinite(Number(next.actualAmount)) || Number(next.actualAmount) <= 0) {
    throw new OrderCommandError(400, '实付金额必须大于0');
  }
  next.actualAmount = Math.round(Number(next.actualAmount) * 100) / 100;
  if (next.actualAmount <= 0) throw new OrderCommandError(400, '实付金额必须至少为0.01元');
  const paymentsChanged = Object.prototype.hasOwnProperty.call(patch, 'payments');
  const amountChanged = !sameValue(order.actualAmount, next.actualAmount);
  if (amountChanged) {
    if (!next.items?.length) next.amount = next.actualAmount;
    else next.items = allocateOrderItemActualAmounts(next.items, next.actualAmount);
    next.performanceBaseAmount = next.actualAmount;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'orderType')) {
    next.dealScene = dealSceneFromOrderType(next.orderType);
  }
  if (paymentsChanged || amountChanged) {
    if (order.payments !== undefined && (
      !Array.isArray(order.payments)
      || order.payments.some((payment) => !payment || typeof payment !== 'object' || Array.isArray(payment))
    )) {
      throw new OrderCommandError(409, '历史付款数据异常，请先修复付款记录');
    }
    if (!Array.isArray(next.payments) || !next.payments.length) {
      throw new OrderCommandError(400, '更正实付金额时必须提供付款记录');
    }
    const paymentIds = new Set<string>();
    next.payments = next.payments.map((payment, index) => {
      const amount = Math.round(Number(payment?.amount) * 100) / 100;
      if (typeof payment?.id !== 'string' || !Number.isFinite(amount) || amount <= 0) {
        throw new OrderCommandError(400, `第 ${index + 1} 笔付款数据无效`);
      }
      const paymentId = payment.id.trim();
      if (!paymentId) {
        throw new OrderCommandError(400, `第 ${index + 1} 笔付款缺少唯一标识`);
      }
      if (paymentIds.has(paymentId)) {
        throw new OrderCommandError(400, `第 ${index + 1} 笔付款标识重复`);
      }
      paymentIds.add(paymentId);
      if (typeof payment.paidAt !== 'string'
        || !payment.paidAt.trim()
        || Number.isNaN(new Date(payment.paidAt.trim()).getTime())) {
        throw new OrderCommandError(400, `第 ${index + 1} 笔付款时间无效`);
      }
      return {
        ...payment,
        id: paymentId,
        amount,
        paidAt: payment.paidAt.trim(),
        paymentMethod: next.paymentMethod,
      };
    });
    const correctedPaymentsById = new Map(next.payments.map((payment) => [payment.id, payment]));
    for (const existingPayment of Array.isArray(order.payments) ? order.payments : []) {
      if (typeof existingPayment.id !== 'string' || !existingPayment.id.trim() || existingPayment.id !== existingPayment.id.trim()) {
        throw new OrderCommandError(409, '历史付款记录标识异常，请先修复付款数据');
      }
      const correctedPayment = correctedPaymentsById.get(existingPayment.id);
      if (!correctedPayment) {
        throw new OrderCommandError(409, '已有付款记录不能删除或更换标识；新增收款请保留原付款并新增一笔付款记录');
      }
      if (Math.round(correctedPayment.amount * 100) > Math.round(Number(existingPayment.amount) * 100)) {
        throw new OrderCommandError(409, '已有付款金额不能直接调高；请保留原金额并将增加部分新增为一笔付款记录');
      }
      if (correctedPayment.paidAt !== existingPayment.paidAt) {
        throw new OrderCommandError(409, '已有付款时间属于不可变资金记录，不能直接修改；请通过财务异常处理流程更正');
      }
    }
    const paymentTotalInCents = next.payments.reduce((sum, payment) => sum + Math.round(payment.amount * 100), 0);
    if (paymentTotalInCents !== Math.round(next.actualAmount * 100)) {
      throw new OrderCommandError(400, '分笔付款合计必须等于实付金额');
    }
  }
  const evidenceChanged = paymentsChanged || [
    'dealEvidenceName', 'dealEvidencePreview', 'dealEvidenceAttachments',
  ].some((field) => Object.prototype.hasOwnProperty.call(patch, field));
  if (evidenceChanged) {
    const hasProof = next.payments?.some((payment) => (
      Boolean(payment.voucherName || payment.voucherPreview || payment.attachments?.length)
    )) || Boolean(next.dealEvidenceName || next.dealEvidencePreview || next.dealEvidenceAttachments?.length);
    next.proofStatus = hasProof ? '已上传' : '待补充';
  }
  return next;
}

async function lockOrderCommissions(
  transaction: Prisma.TransactionClient,
  orderId: string,
): Promise<Array<{ row: { status: string | null; data: unknown }; commission: Commission }>> {
  const rows = await transaction.$queryRaw<Array<{ status: string | null; data: unknown }>>(Prisma.sql`
    SELECT id, recordId, status, data
    FROM business_records
    WHERE domain = ${STORAGE_KEYS.COMMISSIONS}
      AND (
        orderId = ${orderId}
        OR JSON_UNQUOTE(JSON_EXTRACT(data, '$.orderId')) = ${orderId}
      )
    ORDER BY recordId ASC
    FOR UPDATE
  `);
  return rows.map((row) => ({ row, commission: parseObject<Commission>(row.data, '提成') }));
}

function orderHasActiveRefundOrReversal(order: Order): boolean {
  return Boolean(
    order.originalOrderId
    || ['退款中', '已退款'].includes(order.status)
    || !['', '无', '退款已拒绝'].includes(String(order.refundStatus || '')),
  );
}

const INACTIVE_COMMISSION_STATUSES = new Set<Commission['status']>(['已撤回', '已取消', '待冲销', '已冲销']);

function isManualFormalCommission(commission: Commission): boolean {
  return !commission.correctionCaseId
    && !isRecoveryCommission(commission)
    && Boolean(commission.isManualAdjusted || commission.sourceType === '人工新增');
}

const POST_PAYOUT_ENTITLEMENT_STRATEGIES = new Set<PostPayoutEntitlementStrategy>([
  'preserve_manual',
  'recalculate_rules',
  'manual_correct',
]);

function validateEntitlementStrategyInput(input: OrderCorrectionInput): string | undefined {
  const strategy = input.entitlementStrategy;
  if (strategy && !POST_PAYOUT_ENTITLEMENT_STRATEGIES.has(strategy)) {
    return '发放后更正处理方式无效，请重新选择';
  }
  if (strategy === 'manual_correct' && !input.manualEntitlements?.length) {
    return '人工修正应得必须完整填写更正后的分账结果';
  }
  if (strategy !== 'manual_correct' && input.manualEntitlements?.length) {
    return '仅“人工修正应得”可以提交人工分账结果';
  }
  return undefined;
}

function inspectCorrectionEligibility(
  order: Order,
  lockedCommissions: Array<{ row: { status: string | null }; commission: Commission }>,
  rebuildAvailable: boolean,
  postPayoutPreviewAvailable = false,
  allowPostPayout = false,
  hasProtectedPayoutContext = false,
  payoutHistoryIssue?: string,
  allowManualPostPayout = false,
  protectedPaidSnapshots: Commission[] = [],
): OrderCorrectionPrecheck {
  const allCommissions = lockedCommissions.map(({ commission }) => commission);
  const currentIds = new Set(selectCurrentCommissionRounds(allCommissions).map((commission) => commission.id));
  const currentRows = lockedCommissions.filter(({ commission }) => currentIds.has(commission.id));
  const commissions = currentRows.map(({ commission }) => commission);
  const statuses = currentRows.map(({ row, commission }) => String(row.status || commission.status || ''));
  const uniqueStatuses = Array.from(new Set(statuses.filter(Boolean)));
  const currentManualRows = currentRows.filter(({ row, commission }) => {
    const status = (String(row.status || commission.status || '') || commission.status) as Commission['status'];
    return !INACTIVE_COMMISSION_STATUSES.has(status)
      && isManualFormalCommission(commission);
  });
  const currentManualRoles = new Set(currentManualRows.map(({ commission }) => commission.role));
  const protectedManualRows = protectedPaidSnapshots
    .filter((commission) => isManualFormalCommission(commission) && !currentManualRoles.has(commission.role))
    .map((commission) => ({ commission, status: '已发放' }));
  const manualSources = [
    ...currentManualRows.map(({ row, commission }) => ({
      commission,
      status: String(row.status || commission.status || ''),
    })),
    ...protectedManualRows,
  ];
  const manualCommissionCount = manualSources.length;
  const manualCommissions: CommissionManualEntitlementDraft[] = manualSources.map(({ commission }) => ({
    sourceCommissionId: commission.id,
    role: commission.role,
    ownerId: commission.ownerId || '',
    owner: commission.owner,
    departmentId: commission.departmentId,
    department: commission.department,
    performanceAmount: Number(commission.performanceAmount ?? commission.orderAmount ?? 0),
    commissionAmount: Number(commission.commissionAmount || 0),
    calculationNote: commission.calculationNote,
  }));
  const hasPaid = statuses.includes('已发放') || hasProtectedPayoutContext;
  const blocked = (
    reasonCode: NonNullable<OrderCorrectionPrecheck['reasonCode']>,
    message: string,
  ): OrderCorrectionPrecheck => ({
    allowed: false,
    mode: hasPaid ? 'post_payout' : 'standard',
    requiresImpactPreview: hasPaid,
    reasonCode,
    message,
    commissionCount: commissions.length,
    manualCommissionCount,
    commissionStatuses: uniqueStatuses,
    manualCommissions,
  });
  if (order.deletedAt) return blocked('order_deleted', '已删除订单不能更正');
  if (orderHasActiveRefundOrReversal(order)) {
    return blocked('refund_in_progress', '该订单已进入退款或冲正链路，请走订单冲正流程');
  }
  if (payoutHistoryIssue) {
    return blocked('payout_started', payoutHistoryIssue);
  }
  const manualRowsAreSupported = manualSources.every(({ status }) => (
    ['待确认', '待发放', '已发放'].includes(status)
  ));
  if (manualCommissionCount > 0 && !(allowManualPostPayout && manualRowsAreSupported)) {
    return blocked('manual_commission', `该订单存在 ${manualCommissionCount} 条人工新增或人工调整的分账，请从原发放记录进入“发放后更正”处理`);
  }
  if (hasProtectedPayoutContext
    && !allowManualPostPayout
    && statuses.some((status) => ['待确认', '待发放'].includes(status))) {
    return blocked('payout_started', '当前仍有待确认或待发放分账，请先在财务撤回相关分账后再更正');
  }
  if (statuses.some((status) => ['待冲销', '已冲销'].includes(status))) {
    return blocked('payout_started', '该订单提成正在冲销或已冲销，请先完成冲销流程');
  }
  if (hasPaid) {
    if (!allowPostPayout) {
      return blocked('payout_started', '该订单已有提成发放，仅超级管理员可通过“发放后处理”留痕更正');
    }
    if (!postPayoutPreviewAvailable) {
      return blocked('rebuild_unavailable', '发放后影响测算服务不可用，暂不能更正订单');
    }
    return {
      allowed: true,
      mode: 'post_payout',
      requiresImpactPreview: true,
      message: '已发放事实将永久保留；保存前必须核对影响范围，差额通过补发或追回处理',
      commissionCount: commissions.length,
      manualCommissionCount,
      commissionStatuses: uniqueStatuses,
      manualCommissions,
    };
  }
  if (statuses.some((status) => ['已撤回', '已取消'].includes(status))) {
    return blocked('commission_withdrawn', '该订单分账已撤回或取消，请先在财务中心处理');
  }
  const unsupported = statuses.find((status) => status && !['待确认', '待发放'].includes(status));
  if (unsupported) return blocked('unsupported_commission_status', `分账状态“${unsupported}”不支持自动重算，请先到财务中心处理`);
  if (!rebuildAvailable) return blocked('rebuild_unavailable', '提成重算服务不可用，暂不能更正订单');
  return {
    allowed: true,
    mode: 'standard',
    requiresImpactPreview: false,
    message: commissions.length ? '当前分账可以随订单更正自动撤回并重算' : '当前订单可以更正',
    commissionCount: commissions.length,
    manualCommissionCount,
    commissionStatuses: uniqueStatuses,
    manualCommissions,
  };
}

function assertCorrectableCommissions(
  order: Order,
  lockedCommissions: Array<{ row: { status: string | null }; commission: Commission }>,
  rebuildAvailable: boolean,
  postPayoutPreviewAvailable = false,
  allowPostPayout = false,
  hasProtectedPayoutContext = false,
  payoutHistoryIssue?: string,
  allowManualPostPayout = false,
  protectedPaidSnapshots: Commission[] = [],
): Commission[] {
  const eligibility = inspectCorrectionEligibility(
    order,
    lockedCommissions,
    rebuildAvailable,
    postPayoutPreviewAvailable,
    allowPostPayout,
    hasProtectedPayoutContext,
    payoutHistoryIssue,
    allowManualPostPayout,
    protectedPaidSnapshots,
  );
  if (!eligibility.allowed) throw new OrderCommandError(409, eligibility.message);
  return selectCurrentCommissionRounds(lockedCommissions.map(({ commission }) => commission));
}

function isFormalOrderCommission(commission: Commission, orderId: string): boolean {
  return commission.orderId === orderId && !isRecoveryCommission(commission) && !commission.correctionCaseId;
}

function parsePayoutRecord(value: unknown): CommissionPayoutRecord {
  return parseObject<CommissionPayoutRecord>(value, '提成发放记录');
}

async function hasValidFormalOrderPayoutContext(
  transaction: Prisma.TransactionClient,
  orderId: string,
  context?: CommissionPayoutCorrectionContext,
): Promise<boolean> {
  if (!context?.payoutRecordId || !context.commissionId) return false;
  const row = await transaction.businessRecord.findUnique({
    where: {
      domain_recordId: {
        domain: STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES,
        recordId: context.payoutRecordId,
      },
    },
  });
  if (!row) return false;
  const payout = parsePayoutRecord(row.data);
  if (String(row.status || payout.status || '') !== '已发放') return false;
  if (!payout.commissionIds.includes(context.commissionId)) return false;
  const snapshot = payout.commissionSnapshots?.find((commission) => commission.id === context.commissionId);
  return Boolean(
    snapshot
    && snapshot.orderId === orderId
    && !isRecoveryCommission(snapshot),
  );
}

async function inspectFormalOrderPayoutHistory(
  transaction: Prisma.TransactionClient,
  orderId: string,
  knownCommissions: Commission[],
): Promise<{
  snapshots: Commission[];
  postPayoutContext?: CommissionPostPayoutEntryContext;
  issue?: string;
}> {
  const rows = await transaction.businessRecord.findMany({
    where: { domain: STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES },
  });
  const snapshots = new Map<string, Commission>();
  const entryCandidates: Array<{
    issuedAt: string;
    context: CommissionPostPayoutEntryContext;
  }> = [];
  const knownById = new Map(knownCommissions.map((commission) => [commission.id, commission]));
  let issue: string | undefined;
  for (const row of rows) {
    const payout = parsePayoutRecord(row.data);
    if (String(row.status || payout.status || '') !== '已发放') continue;
    const includedIds = new Set(payout.commissionIds || []);
    const validSnapshotIds = new Set<string>();
    for (const snapshot of payout.commissionSnapshots || []) {
      if (!includedIds.has(snapshot.id) || !isFormalOrderCommission(snapshot, orderId)) continue;
      validSnapshotIds.add(snapshot.id);
      if (snapshots.has(snapshot.id)) {
        issue ||= `提成 ${snapshot.id} 同时出现在多个有效发放单，请先由财务核对历史发放记录`;
        continue;
      }
      snapshots.set(snapshot.id, snapshot);
      entryCandidates.push({
        issuedAt: String(payout.issuedAt || snapshot.paymentDate || snapshot.createdAt || ''),
        context: {
          payoutRecordId: payout.id,
          payoutNo: payout.payoutNo,
          commissionId: snapshot.id,
          sourceType: 'formal_order',
          sourceId: orderId,
          sourceBusinessNo: snapshot.orderNo,
          employee: snapshot.owner,
          role: snapshot.role,
          originalPaidAmount: Number(snapshot.commissionAmount || 0),
          attributedPeriod: String(snapshot.paymentDate || snapshot.createdAt).slice(0, 7),
        },
      });
    }
    for (const commissionId of includedIds) {
      if (validSnapshotIds.has(commissionId)) continue;
      const known = knownById.get(commissionId);
      if (known && isFormalOrderCommission(known, orderId)) {
        issue ||= `历史已发提成 ${commissionId} 缺少逐笔发放快照，无法安全更正，请先由财务核对历史发放记录`;
      }
    }
  }
  entryCandidates.sort((left, right) => (
    right.issuedAt.localeCompare(left.issuedAt)
    || right.context.commissionId.localeCompare(left.context.commissionId)
  ));
  return {
    snapshots: Array.from(snapshots.values()),
    postPayoutContext: issue ? undefined : entryCandidates[0]?.context,
    issue,
  };
}

function cloneOrderCorrectionSnapshot(value: Order): Record<string, unknown> {
  const cloned = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  // 预览与正式提交是两次请求，执行时间必然不同。
  // 并发校验由 sourceRevision 承担，易变审计字段不参与影响哈希。
  delete cloned.updatedAt;
  delete cloned.changeHistory;
  return cloned;
}

async function buildPaidOrderCorrectionPreview(
  transaction: Prisma.TransactionClient,
  order: Order,
  next: Order,
  changedAt: string,
  previewCommissions: NonNullable<OrderCommandServiceOptions['previewCommissions']>,
  entitlementStrategy: PostPayoutEntitlementStrategy = 'recalculate_rules',
  manualEntitlements: CommissionManualEntitlementDraft[] = [],
  directory?: Directory,
): Promise<{ preview: CommissionCorrectionPreview; expectedTarget: Commission[] }> {
  const [commissionRows, payoutRows, correctionRows, expectedTarget] = await Promise.all([
    transaction.businessRecord.findMany({ where: { domain: STORAGE_KEYS.COMMISSIONS } }),
    transaction.businessRecord.findMany({ where: { domain: STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES } }),
    transaction.businessRecord.findMany({ where: { domain: STORAGE_KEYS.COMMISSION_CORRECTIONS } }),
    previewCommissions(transaction, next, changedAt),
  ]);
  const previousCorrections = correctionRows
    .map((row) => parseObject<CommissionCorrectionRecord>(row.data, '提成更正记录'));
  const payoutRecords = payoutRows.map((row) => parsePayoutRecord(row.data));
  const beforeCommissions = commissionRows.map((row) => {
    const commission = parseObject<Commission>(row.data, '提成');
    return {
      ...commission,
      status: (String(row.status || commission.status || '') || commission.status) as Commission['status'],
    };
  });
  const currentTarget = selectCurrentCommissionRounds(beforeCommissions)
    .filter((commission) => isFormalOrderCommission(commission, order.id));
  const currentManual = currentTarget.filter(isManualFormalCommission);
  const currentManualRoles = new Set(currentManual.map((commission) => commission.role));
  const protectedManualById = new Map<string, Commission>();
  payoutRecords.forEach((payout) => {
    if (payout.status !== '已发放') return;
    const includedIds = new Set(payout.commissionIds || []);
    (payout.commissionSnapshots || []).forEach((snapshot) => {
      if (!includedIds.has(snapshot.id)
        || !isFormalOrderCommission(snapshot, order.id)
        || !isManualFormalCommission(snapshot)
        || currentManualRoles.has(snapshot.role)) return;
      protectedManualById.set(snapshot.id, snapshot);
    });
  });
  const manualSources = [...currentManual, ...protectedManualById.values()];
  const retainedManual = manualSources
    .map((commission) => ({
      ...commission,
      customerName: next.customerName,
      productLevel: next.productLevel,
      orderAmount: next.actualAmount,
      paymentDate: next.payments?.[0]?.paidAt || commission.paymentDate,
      updatedAt: changedAt,
    }));
  const correctedManual = entitlementStrategy === 'manual_correct'
    ? buildManualEntitlementTarget(manualSources, manualEntitlements, next, directory, changedAt)
    : [];
  const manualTarget = entitlementStrategy === 'manual_correct' ? correctedManual : retainedManual;
  const claimedExpectedIds = new Set<string>();
  if (entitlementStrategy === 'preserve_manual' || entitlementStrategy === 'manual_correct') {
    manualTarget.forEach((commission) => {
      const matched = closestExpectedCommission(commission, expectedTarget, claimedExpectedIds);
      if (matched) claimedExpectedIds.add(matched.id);
    });
  }
  const effectiveExpectedTarget = entitlementStrategy === 'preserve_manual' || entitlementStrategy === 'manual_correct'
    ? [
      ...expectedTarget.filter((commission) => !claimedExpectedIds.has(commission.id)),
      ...manualTarget,
    ]
    : expectedTarget;
  const afterCommissions = [
    ...beforeCommissions.filter((commission) => !isFormalOrderCommission(commission, order.id)),
    ...effectiveExpectedTarget,
  ];
  const preview = buildCommissionCorrectionImpact({
    sourceBusinessType: 'formal_order',
    sourceBusinessId: order.id,
    sourceBusinessNo: order.orderNo,
    sourceRevision: order.updatedAt,
    beforeBusinessSnapshot: cloneOrderCorrectionSnapshot(order),
    afterBusinessSnapshot: cloneOrderCorrectionSnapshot(next),
    beforeCommissions,
    afterCommissions,
    payoutRecords,
    entitlementStrategy,
  });
  const overlapping = findOverlappingFinancialCorrection(preview, previousCorrections);
  if (overlapping) {
    throw new Error(`当前已有差额更正 ${overlapping.correctionNo} 涉及同一已发放提成，为避免阶梯联动或跨源单重复补发、追回，当前不支持叠加更正`);
  }
  return { preview, expectedTarget: effectiveExpectedTarget };
}

function buildManualEntitlementTarget(
  currentTarget: Commission[],
  drafts: CommissionManualEntitlementDraft[],
  next: Order,
  directory: Directory | undefined,
  changedAt: string,
): Commission[] {
  if (!directory) throw new OrderCommandError(503, '员工目录不可用，暂不能人工修正应得');
  const manualCurrent = currentTarget.filter((commission) => (
    commission.isManualAdjusted || commission.sourceType === '人工新增'
  ));
  const draftById = new Map(drafts.map((draft) => [draft.sourceCommissionId, draft]));
  if (draftById.size !== drafts.length || manualCurrent.some((commission) => !draftById.has(commission.id))) {
    throw new OrderCommandError(400, '请完整填写每一条人工分账的更正结果');
  }
  if (drafts.some((draft) => !manualCurrent.some((commission) => commission.id === draft.sourceCommissionId))) {
    throw new OrderCommandError(400, '人工更正中包含不属于当前订单的分账');
  }
  return manualCurrent.map((commission) => {
    const draft = draftById.get(commission.id)!;
    const role = String(draft.role || '').trim();
    const performanceAmount = Math.round(Number(draft.performanceAmount) * 100) / 100;
    const commissionAmount = Math.round(Number(draft.commissionAmount) * 100) / 100;
    if (!role || !draft.ownerId) throw new OrderCommandError(400, '人工更正必须填写提成角色和员工');
    if (!Number.isFinite(performanceAmount) || performanceAmount < 0) {
      throw new OrderCommandError(400, '人工更正的业绩金额不能小于0');
    }
    if (!Number.isFinite(commissionAmount) || commissionAmount < 0) {
      throw new OrderCommandError(400, '人工更正的提成金额不能小于0');
    }
    const selectedUser = directory.users.find((user) => user.id === draft.ownerId);
    const keepingHistoricalOwner = draft.ownerId === commission.ownerId;
    if (!selectedUser && !keepingHistoricalOwner) throw new OrderCommandError(409, '更正后的提成员工不存在');
    if (selectedUser && !keepingHistoricalOwner && (
      !selectedUser.isActive || (selectedUser.employmentStatus || 'active') !== 'active'
    )) {
      throw new OrderCommandError(409, '不能将更正后的提成分配给已停用或已离职员工');
    }
    const departmentId = selectedUser?.departmentId || draft.departmentId || commission.departmentId;
    const department = directory.departments.find((item) => item.id === departmentId)?.name
      || draft.department
      || commission.department;
    const owner = selectedUser?.name || commission.owner;
    return {
      ...commission,
      customerName: next.customerName,
      productLevel: next.productLevel,
      orderAmount: next.actualAmount,
      performanceAmount,
      commissionRate: 0,
      commissionAmount,
      scene: next.dealScene,
      resourceOwnership: next.resourceOwnership,
      proofStatus: next.proofStatus,
      paymentDate: next.payments?.[0]?.paidAt || commission.paymentDate,
      role,
      ownerId: draft.ownerId,
      owner,
      departmentId,
      department,
      payoutPlanId: undefined,
      payoutPlanName: undefined,
      payoutPlanVersion: undefined,
      payoutPlanSnapshot: undefined,
      tierSnapshot: undefined,
      commissionRuleId: undefined,
      ruleCalculationType: 'fixed',
      sourceType: '人工新增',
      isManualAdjusted: true,
      calculationNote: String(draft.calculationNote || '').trim() || `发放后人工更正应得 ${commissionAmount} 元`,
      formulaText: `发放后人工更正应得 ${commissionAmount} 元`,
      updatedAt: changedAt,
    };
  });
}

function closestExpectedCommission(
  current: Commission,
  expected: Commission[],
  claimedIds: Set<string>,
): Commission | undefined {
  const exact = expected.find((item) => item.id === current.id && !claimedIds.has(item.id));
  if (exact) return exact;
  const candidates = expected.filter((item) => item.role === current.role && !claimedIds.has(item.id));
  return candidates.sort((left, right) => {
    const score = (item: Commission) => (
      ((item.ownerId || `name:${item.owner}`) === (current.ownerId || `name:${current.owner}`) ? 8 : 0)
      + (item.commissionRuleId && item.commissionRuleId === current.commissionRuleId ? 4 : 0)
      + (item.productLevel === current.productLevel ? 2 : 0)
      + (item.payoutPlanId && item.payoutPlanId === current.payoutPlanId ? 1 : 0)
    );
    return score(right) - score(left) || left.id.localeCompare(right.id);
  })[0];
}

async function applyPaidOrderCommissionProjection(
  transaction: Prisma.TransactionClient,
  order: Order,
  next: Order,
  lockedCommissionRows: Array<{ row: { status: string | null }; commission: Commission }>,
  expectedTarget: Commission[],
  changedAt: string,
  protectedPaidSnapshots: Commission[] = [],
): Promise<{ preservedPaid: number; rebuiltPending: number }> {
  const currentIds = new Set(selectCurrentCommissionRounds(lockedCommissionRows.map(({ commission }) => commission)).map((item) => item.id));
  const claimedExpectedIds = new Set<string>();
  const protectedExpectedByCommissionId = new Map<string, Commission>();
  const existingIds = new Set(lockedCommissionRows.map(({ commission }) => commission.id));
  let preservedPaid = 0;
  let rebuiltPending = 0;

  // 历史发放快照可能已不在当前提成表中，但它仍代表已实际发放的应得额度。
  // 先用快照占住对应的新规则结果，避免后续再次生成一笔整额待确认提成。
  for (const snapshot of protectedPaidSnapshots.sort((left, right) => left.id.localeCompare(right.id))) {
    const expected = closestExpectedCommission(snapshot, expectedTarget, claimedExpectedIds);
    if (!expected) continue;
    claimedExpectedIds.add(expected.id);
    protectedExpectedByCommissionId.set(snapshot.id, expected);
  }

  for (const { row, commission } of lockedCommissionRows) {
    if (!currentIds.has(commission.id) || !isFormalOrderCommission(commission, order.id)) continue;
    const currentStatus = (String(row.status || commission.status || '') || commission.status) as Commission['status'];
    const protectedExpected = protectedExpectedByCommissionId.get(commission.id);
    const expected = protectedExpected || closestExpectedCommission(commission, expectedTarget, claimedExpectedIds);
    if (expected && !protectedExpected) claimedExpectedIds.add(expected.id);

    if (currentStatus === '已发放') {
      const projected: Commission = {
        ...commission,
        customerName: next.customerName,
        orderNo: next.orderNo,
        productLevel: expected?.productLevel || next.productLevel,
        orderAmount: expected?.orderAmount ?? next.actualAmount,
        performanceAmount: expected?.performanceAmount ?? commission.performanceAmount,
        paymentDate: expected?.paymentDate || next.payments?.[0]?.paidAt || commission.paymentDate,
        resourceOwnership: expected?.resourceOwnership ?? next.resourceOwnership,
        scene: expected?.scene ?? next.dealScene,
        updatedAt: changedAt,
        // 以下是原发放事实，任何更正都不得覆盖。
        commissionAmount: commission.commissionAmount,
        ownerId: commission.ownerId,
        owner: commission.owner,
        departmentId: commission.departmentId,
        department: commission.department,
        role: commission.role,
        status: currentStatus,
        paidAt: commission.paidAt,
        payoutRecordId: commission.payoutRecordId,
      };
      await transaction.businessRecord.update({
        where: { domain_recordId: { domain: STORAGE_KEYS.COMMISSIONS, recordId: commission.id } },
        data: {
          title: `${next.orderNo}-${commission.role}`,
          status: projected.status,
          owner: projected.owner,
          customerId: next.customerId,
          orderId: next.id,
          amount: projected.commissionAmount,
          eventAt: new Date(projected.paymentDate || changedAt),
          data: jsonValue(projected),
        },
      });
      preservedPaid += 1;
      continue;
    }

    if (INACTIVE_COMMISSION_STATUSES.has(currentStatus)) continue;
    if (expected) {
      const rebuilt: Commission = { ...expected, id: commission.id, status: '待确认', updatedAt: changedAt };
      await transaction.businessRecord.update({
        where: { domain_recordId: { domain: STORAGE_KEYS.COMMISSIONS, recordId: commission.id } },
        data: {
          title: `${next.orderNo}-${rebuilt.role}`,
          status: rebuilt.status,
          owner: rebuilt.owner,
          customerId: next.customerId,
          orderId: next.id,
          amount: rebuilt.commissionAmount,
          eventAt: new Date(rebuilt.paymentDate || changedAt),
          data: jsonValue(rebuilt),
        },
      });
      rebuiltPending += 1;
    } else {
      const withdrawn: Commission = {
        ...commission,
        status: '已撤回',
        auditReason: '发放后更正订单，原未发放分账已撤回',
        updatedAt: changedAt,
      };
      await transaction.businessRecord.update({
        where: { domain_recordId: { domain: STORAGE_KEYS.COMMISSIONS, recordId: commission.id } },
        data: { status: withdrawn.status, eventAt: new Date(changedAt), data: jsonValue(withdrawn) },
      });
    }
  }

  for (const expected of expectedTarget) {
    if (claimedExpectedIds.has(expected.id)) continue;
    if (existingIds.has(expected.id)) continue;
    const pending: Commission = { ...expected, status: '待确认', updatedAt: changedAt };
    await transaction.businessRecord.create({ data: {
      id: `${STORAGE_KEYS.COMMISSIONS}:${pending.id}`,
      domain: STORAGE_KEYS.COMMISSIONS,
      recordId: pending.id,
      title: `${next.orderNo}-${pending.role}`,
      status: pending.status,
      owner: pending.owner,
      customerId: next.customerId,
      orderId: next.id,
      amount: pending.commissionAmount,
      eventAt: new Date(pending.paymentDate || changedAt),
      data: jsonValue(pending),
    } });
    rebuiltPending += 1;
  }
  return { preservedPaid, rebuiltPending };
}

async function syncCorrectedDelivery(
  transaction: Prisma.TransactionClient,
  current: Order,
  next: Order,
  changedAt: string,
): Promise<void> {
  const rows = await transaction.businessRecord.findMany({
    where: { domain: STORAGE_KEYS.DELIVERIES, orderId: current.id },
  });
  const currentItems = current.items?.length ? current.items : [{
    id: 'legacy-primary',
    productId: current.productId || '',
    productName: current.productName || current.productLevel,
    productLevel: current.productLevel,
    unitPrice: current.amount,
    quantity: 1,
    subtotal: current.amount,
    allocatedActualAmount: current.actualAmount,
    isPrimary: true,
    sortOrder: 1,
  }];
  const nextItems = next.items?.length ? next.items : [{
    id: 'legacy-primary',
    productId: next.productId || '',
    productName: next.productName || next.productLevel,
    productLevel: next.productLevel,
    unitPrice: next.amount,
    quantity: 1,
    subtotal: next.amount,
    allocatedActualAmount: next.actualAmount,
    isPrimary: true,
    sortOrder: 1,
  }];
  const parsedRows = rows.map((row) => ({ row, delivery: parseObject<Delivery>(row.data, '交付') }));
  const currentIds = new Set(currentItems.map((item) => item.id));
  const nextIds = new Set(nextItems.map((item) => item.id));
  if (rows.length && (
    currentIds.size !== nextIds.size
    || [...currentIds].some((id) => !nextIds.has(id))
  )) {
    throw new OrderCommandError(409, '该订单已生成交付单，不能增删产品明细；可更正已有明细的产品或数量');
  }
  const currentById = new Map(currentItems.map((item) => [item.id, item]));
  const nextById = new Map(nextItems.map((item) => [item.id, item]));
  const currentPrimary = currentItems.find((item) => item.isPrimary) || currentItems[0];
  const nextPrimary = nextItems.find((item) => item.isPrimary) || nextItems[0];
  const deliveryByItemId = new Map(parsedRows.map(({ row, delivery }) => [
    delivery.orderItemId || currentPrimary.id,
    row.recordId,
  ]));
  for (const nextItem of nextItems) {
    const currentItem = currentById.get(nextItem.id);
    if (currentItem?.productId === nextItem.productId || deliveryByItemId.has(nextItem.id)) continue;
    const productRow = await transaction.businessRecord.findUnique({
      where: { domain_recordId: { domain: STORAGE_KEYS.PRODUCTS, recordId: nextItem.productId } },
    });
    const product = productRow ? parseObject<Product>(productRow.data, '产品') : null;
    if (product?.deliveryStages?.some(Boolean)) {
      throw new OrderCommandError(409, '更正后的产品需要新建交付单，请先删除并重新提交订单');
    }
  }
  for (const { row, delivery } of parsedRows) {
    const itemId = delivery.orderItemId || currentPrimary.id;
    const currentItem = currentById.get(itemId) || currentPrimary;
    const nextItem = nextById.get(itemId) || (delivery.orderItemId ? undefined : nextPrimary);
    if (!nextItem) throw new OrderCommandError(409, '交付单关联的产品明细已不存在，请先处理交付单');
    const productChanged = currentItem.productId !== nextItem.productId;
    const relationChanged = current.customerId !== next.customerId || productChanged;
    if (relationChanged && delivery.status !== '待开始') {
      throw new OrderCommandError(409, '交付已经开始，客户或产品不能直接更正，请先处理交付单');
    }
    let correctedProduct: Product | null = null;
    if (productChanged && nextItem.productId) {
      const productRow = await transaction.businessRecord.findUnique({
        where: { domain_recordId: { domain: STORAGE_KEYS.PRODUCTS, recordId: nextItem.productId } },
      });
      correctedProduct = productRow ? parseObject<Product>(productRow.data, '产品') : null;
    }
    const correctedStages = correctedProduct?.deliveryStages?.filter(Boolean) || [];
    if (productChanged && !correctedStages.length) {
      throw new OrderCommandError(409, '更正后的产品未配置交付阶段，不能同步现有交付单');
    }
    const corrected: Delivery = {
      ...delivery,
      orderItemId: nextItem.id,
      customerId: next.customerId,
      customerName: next.customerName,
      productName: nextItem.productName,
      productType: nextItem.productLevel,
      productQuantity: nextItem.quantity,
      salesOwner: next.salesName || next.owner,
      salesOwnerId: next.salesId,
      orderAmount: nextItem.allocatedActualAmount ?? nextItem.subtotal,
      paymentDate: next.payments?.[0]?.paidAt || delivery.paymentDate,
      orderType: next.orderType,
      ...(correctedStages.length ? {
        currentStage: correctedStages[0],
        stages: correctedStages,
        tasks: correctedStages.map((stage, index) => ({
          id: `task-${hash(`${next.id}:${index}`, 12)}`,
          title: stage,
          description: `${stage}任务（数量 ${nextItem.quantity}）`,
          status: index === 0 ? '进行中' : '待开始',
          records: [],
        })),
        progressPercent: 0,
      } : {}),
      updatedAt: changedAt,
    };
    await transaction.businessRecord.update({
      where: { domain_recordId: { domain: STORAGE_KEYS.DELIVERIES, recordId: row.recordId } },
      data: {
        title: `${next.orderNo}-${nextItem.productName}`,
        status: corrected.status || null,
        owner: corrected.owner,
        customerId: next.customerId,
        orderId: next.id,
        amount: corrected.orderAmount,
        eventAt: new Date(changedAt),
        data: jsonValue(corrected),
      },
    });
  }
  const primaryDeliveryRecordId = deliveryByItemId.get(nextPrimary.id);
  if (primaryDeliveryRecordId) next.deliveryId = primaryDeliveryRecordId;
  if (parsedRows.length) next.deliveryIds = parsedRows.map(({ row }) => row.recordId);
}

export function createOrderCommandService(
  prisma: OrderCommandPrisma,
  options: OrderCommandServiceOptions = {},
) {
  const now = options.now || (() => new Date());
  const financeTransactions = createFinanceTransactionService(prisma as unknown as Parameters<typeof createFinanceTransactionService>[0]);

  return {
    async precheckCorrection(
      orderId: string,
      actor: AuthenticatedUser,
      payoutContext?: CommissionPayoutCorrectionContext,
    ): Promise<ApiResponse<OrderCorrectionPrecheck | null>> {
      const cleanOrderId = String(orderId || '').trim();
      if (!cleanOrderId) return failure<OrderCorrectionPrecheck>('订单ID不能为空', 400);
      const directory = await loadDirectory(prisma);
      if (!hasPermission(actor, PERMISSION_KEYS.ORDER_CORRECT, 'write')) {
        return failure<OrderCorrectionPrecheck>('无订单更正权限', 403);
      }
      const scope = orderScope(directory, actor);
      try {
        const eligibility = await prisma.$transaction(async (transaction) => {
          const order = await lockOrder(transaction, cleanOrderId);
          if (!orderIsVisible(order, scope)) throw new OrderCommandError(403, '无权更正该订单');
          const lockedCommissionRows = await lockOrderCommissions(transaction, order.id);
          const hasProtectedPayoutContext = await hasValidFormalOrderPayoutContext(
            transaction,
            order.id,
            payoutContext,
          );
          const payoutHistory = await inspectFormalOrderPayoutHistory(
            transaction,
            order.id,
            lockedCommissionRows.map(({ commission }) => commission),
          );
          const hasProtectedPayout = hasProtectedPayoutContext
            || payoutHistory.snapshots.length > 0
            || Boolean(payoutHistory.issue);
          const eligibility = inspectCorrectionEligibility(
            order,
            lockedCommissionRows,
            Boolean(options.rebuildPendingCommissions),
            Boolean(options.previewCommissions),
            isSuperAdmin(actor),
            hasProtectedPayout,
            payoutHistory.issue,
            hasProtectedPayoutContext,
            payoutHistory.snapshots,
          );
          const withEntryContext = {
            ...eligibility,
            manualCommissions: isSuperAdmin(actor) ? eligibility.manualCommissions : undefined,
            postPayoutContext: isSuperAdmin(actor) ? payoutHistory.postPayoutContext : undefined,
          };
          return withEntryContext.allowed && isSuperAdmin(actor) && options.previewCommissions
            ? {
              ...withEntryContext,
              requiresImpactPreview: true,
              message: withEntryContext.mode === 'post_payout'
                ? withEntryContext.message
                : '保存前将统一预览对已发放提成及月度阶梯的联动影响',
            }
            : withEntryContext;
        }, {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          maxWait: 5_000,
          timeout: 10_000,
        });
        return success<OrderCorrectionPrecheck | null>(eligibility);
      } catch (error) {
        if (error instanceof OrderCommandError) return failure<OrderCorrectionPrecheck>(error.message, error.responseCode);
        throw error;
      }
    },

    async previewCorrection(
      orderId: string,
      input: OrderCorrectionInput,
      actor: AuthenticatedUser,
    ): Promise<ApiResponse<CommissionCorrectionPreview | null>> {
      const cleanOrderId = String(orderId || '').trim();
      const reason = String(input?.reason || '').trim();
      if (!cleanOrderId) return failure<CommissionCorrectionPreview>('订单ID不能为空', 400);
      if (!reason) return failure<CommissionCorrectionPreview>('订单更正必须填写原因', 400);
      const strategyError = validateEntitlementStrategyInput(input);
      if (strategyError) return failure<CommissionCorrectionPreview>(strategyError, 400);
      if (!hasPermission(actor, PERMISSION_KEYS.ORDER_CORRECT, 'write') || !isSuperAdmin(actor)) {
        return failure<CommissionCorrectionPreview>('仅超级管理员可测算已发放订单的更正影响', 403);
      }
      if (!options.previewCommissions) {
        return failure<CommissionCorrectionPreview>('发放后影响测算服务不可用', 503);
      }
      const directory = await loadDirectory(prisma);
      const scope = orderScope(directory, actor);
      try {
        const preview = await prisma.$transaction(async (transaction) => {
          const order = await lockOrder(transaction, cleanOrderId);
          if (!orderIsVisible(order, scope)) throw new OrderCommandError(403, '无权更正该订单');
          await validateStableOrderRelations(transaction, order, directory);
          const patch = input?.data || {};
          const changed = changedFields(order, patch);
          const serverField = changed.find((field) => SERVER_FIELDS.has(field));
          if (serverField) throw new OrderCommandError(400, `字段 ${serverField} 由服务端维护，不能更正`);
          const unsupported = changed.find((field) => !CORRECTION_INPUT_FIELDS.has(field));
          if (unsupported) throw new OrderCommandError(400, `字段 ${unsupported} 不支持订单更正`);
          const hasManualEntitlementCorrection = input.entitlementStrategy === 'manual_correct'
            && Boolean(input.manualEntitlements?.length);
          if (!changed.length && !hasManualEntitlementCorrection) {
            throw new OrderCommandError(400, '未检测到需要更正的内容');
          }
          const lockedCommissionRows = await lockOrderCommissions(transaction, order.id);
          const hasProtectedPayoutContext = await hasValidFormalOrderPayoutContext(
            transaction,
            order.id,
            input.payoutContext,
          );
          const payoutHistory = await inspectFormalOrderPayoutHistory(
            transaction,
            order.id,
            lockedCommissionRows.map(({ commission }) => commission),
          );
          const hasProtectedPayout = hasProtectedPayoutContext
            || payoutHistory.snapshots.length > 0
            || Boolean(payoutHistory.issue);
          const eligibility = inspectCorrectionEligibility(
            order,
            lockedCommissionRows,
            Boolean(options.rebuildPendingCommissions),
            true,
            true,
            hasProtectedPayout,
            payoutHistory.issue,
            Boolean(hasProtectedPayoutContext && input.entitlementStrategy),
            payoutHistory.snapshots,
          );
          if (!eligibility.allowed) throw new OrderCommandError(409, eligibility.message);
          const changedAt = now().toISOString();
          const next = await buildCorrectedOrder(transaction, order, patch, directory, changedAt);
          const result = await buildPaidOrderCorrectionPreview(
            transaction,
            order,
            next,
            changedAt,
            options.previewCommissions!,
            input.entitlementStrategy || 'recalculate_rules',
            input.manualEntitlements,
            directory,
          );
          return result.preview;
        }, {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          maxWait: 5_000,
          timeout: 15_000,
        });
        return success<CommissionCorrectionPreview | null>(preview);
      } catch (error) {
        if (error instanceof OrderCommandError) return failure<CommissionCorrectionPreview>(error.message, error.responseCode);
        return failure<CommissionCorrectionPreview>(String((error as Error)?.message || '更正影响测算失败'), 409);
      }
    },

    async update(
      orderId: string,
      patch: Partial<Order>,
      actor: AuthenticatedUser,
    ): Promise<ApiResponse<Order | null>> {
      const cleanOrderId = String(orderId || '').trim();
      if (!cleanOrderId) return failure<Order>('订单ID不能为空', 400);
      const directory = await loadDirectory(prisma);
      const scope = orderScope(directory, actor);

      for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
        try {
          const updated = await prisma.$transaction(async (transaction) => {
            const order = await lockOrder(transaction, cleanOrderId);
            if (!orderIsVisible(order, scope)) throw new OrderCommandError(403, '无权修改该订单');
            if (order.deletedAt) throw new OrderCommandError(409, '已删除订单不能修改');
            await validateStableOrderRelations(transaction, order, directory);
            const changed = assertAllowedPatch(order, patch);
            if (!changed.length) return order;
            const changedAt = now().toISOString();
            const next: Order = {
              ...order,
              ...(changed.includes('notes') ? { notes: patch.notes } : {}),
              ...(changed.includes('sourcePlatformId') ? {
                sourcePlatformId: String(patch.sourcePlatformId || '').trim() || undefined,
              } : {}),
              ...(changed.includes('sourcePlatformName') ? {
                sourcePlatformName: String(patch.sourcePlatformName || '').trim() || undefined,
              } : {}),
              ...(changed.includes('sourceShopId') ? {
                sourceShopId: String(patch.sourceShopId || '').trim() || undefined,
              } : {}),
              ...(changed.includes('sourceShopName') ? {
                sourceShopName: String(patch.sourceShopName || '').trim() || undefined,
              } : {}),
              ...(changed.includes('thirdPartyOrderNo') ? {
                thirdPartyOrderNo: String(patch.thirdPartyOrderNo || '').trim() || undefined,
              } : {}),
              ...(changed.includes('payments') ? { payments: patch.payments! } : {}),
              ...(changed.includes('dealEvidenceName') ? { dealEvidenceName: patch.dealEvidenceName } : {}),
              ...(changed.includes('dealEvidencePreview') ? { dealEvidencePreview: patch.dealEvidencePreview } : {}),
              ...(changed.includes('dealEvidenceAttachments') ? { dealEvidenceAttachments: patch.dealEvidenceAttachments } : {}),
              updatedAt: changedAt,
            };
            if (changed.some((field) => ['payments', 'dealEvidenceName', 'dealEvidencePreview', 'dealEvidenceAttachments'].includes(field))) {
              const hasProof = next.payments?.some((payment) => (
                Boolean(payment.voucherName || payment.voucherPreview || payment.attachments?.length)
              )) || Boolean(next.dealEvidenceName || next.dealEvidencePreview || next.dealEvidenceAttachments?.length);
              next.proofStatus = hasProof ? '已上传' : '待补充';
            }
            const changeLog: OrderChangeLog = {
              id: `hist-${hash(`${order.id}:update:${changedAt}`)}`,
              action: 'update',
              operator: actor.name,
              changedAt,
              summary: `修改了${changed.map((field) => EDIT_FIELD_LABELS[field]).join('、')}`,
              changes: changed.map((field) => ({
                field,
                label: EDIT_FIELD_LABELS[field],
                oldValue: auditValue((order as unknown as Record<string, unknown>)[field]),
                newValue: auditValue((next as unknown as Record<string, unknown>)[field]),
              })),
            };
            const saved: Order = {
              ...next,
              changeHistory: [changeLog, ...(order.changeHistory || [])],
            };
            await transaction.businessRecord.update({
              where: { domain_recordId: { domain: STORAGE_KEYS.ORDERS, recordId: cleanOrderId } },
              data: {
                title: saved.customerName || saved.orderNo,
                status: saved.status,
                owner: saved.salesName || saved.owner || null,
                customerId: saved.customerId,
                orderId: saved.id,
                amount: saved.actualAmount,
                eventAt: new Date(changedAt),
                data: jsonValue(saved),
              },
            });
            if ((!Array.isArray(order.payments) || order.payments.length === 0)
              && Array.isArray(saved.payments)
              && saved.payments.length > 0) {
              try {
                await financeTransactions.recordOrderPayments(transaction, saved, actor, changedAt);
              } catch (error) {
                throw new OrderCommandError(409, String((error as Error)?.message || '首笔付款资金流水写入失败'));
              }
            }
            return saved;
          }, {
            isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
            maxWait: 5_000,
            timeout: 10_000,
          });
          return success<Order | null>(updated);
        } catch (error) {
          if (error instanceof OrderCommandError) return failure<Order>(error.message, error.responseCode);
          if (prismaCode(error) === 'P2034' && attempt < MAX_TRANSACTION_ATTEMPTS) continue;
          if (prismaCode(error) === 'P2034') return failure<Order>('订单修改发生并发冲突，请刷新后重试', 409);
          throw error;
        }
      }
      return failure<Order>('订单修改发生并发冲突，请刷新后重试', 409);
    },

    async correct(
      orderId: string,
      input: OrderCorrectionInput,
      actor: AuthenticatedUser,
    ): Promise<ApiResponse<Order | null>> {
      const cleanOrderId = String(orderId || '').trim();
      const reason = String(input?.reason || '').trim();
      if (!cleanOrderId) return failure<Order>('订单ID不能为空', 400);
      if (!reason) return failure<Order>('订单更正必须填写原因', 400);
      const strategyError = validateEntitlementStrategyInput(input);
      if (strategyError) return failure<Order>(strategyError, 400);
      const directory = await loadDirectory(prisma);
      if (!hasPermission(actor, PERMISSION_KEYS.ORDER_CORRECT, 'write')) {
        return failure<Order>('无订单更正权限', 403);
      }
      const scope = orderScope(directory, actor);

      for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
        try {
          const corrected = await prisma.$transaction(async (transaction) => {
          await lockCommissionLedger(transaction);
          const order = await lockOrder(transaction, cleanOrderId);
          if (!orderIsVisible(order, scope)) throw new OrderCommandError(403, '无权更正该订单');
          await validateStableOrderRelations(transaction, order, directory);
          const patch = input?.data || {};
          const changed = changedFields(order, patch);
          const serverField = changed.find((field) => SERVER_FIELDS.has(field));
          if (serverField) throw new OrderCommandError(400, `字段 ${serverField} 由服务端维护，不能更正`);
          const unsupported = changed.find((field) => !CORRECTION_INPUT_FIELDS.has(field));
          if (unsupported) throw new OrderCommandError(400, `字段 ${unsupported} 不支持订单更正`);
          const hasManualEntitlementCorrection = input.entitlementStrategy === 'manual_correct'
            && Boolean(input.manualEntitlements?.length);
          if (!changed.length && !hasManualEntitlementCorrection) return order;

          const lockedCommissionRows = await lockOrderCommissions(transaction, order.id);
          const rebuildPendingCommissions = options.rebuildPendingCommissions;
          const currentCommissionIds = new Set(selectCurrentCommissionRounds(
            lockedCommissionRows.map(({ commission }) => commission),
          ).map((commission) => commission.id));
          const hasProtectedPayoutContext = await hasValidFormalOrderPayoutContext(
            transaction,
            order.id,
            input.payoutContext,
          );
          const payoutHistory = await inspectFormalOrderPayoutHistory(
            transaction,
            order.id,
            lockedCommissionRows.map(({ commission }) => commission),
          );
          const hasProtectedPayout = hasProtectedPayoutContext
            || payoutHistory.snapshots.length > 0
            || Boolean(payoutHistory.issue);
          const hasPaidCommission = hasProtectedPayout || lockedCommissionRows.some(({ row, commission }) => (
            currentCommissionIds.has(commission.id)
            && String(row.status || commission.status || '') === '已发放'
          ));
          if (hasPaidCommission && !isSuperAdmin(actor)) {
            throw new OrderCommandError(403, '仅超级管理员可更正已发放提成的订单');
          }
          const originalCommissions = assertCorrectableCommissions(
            order,
            lockedCommissionRows,
            Boolean(rebuildPendingCommissions),
            Boolean(options.previewCommissions),
            isSuperAdmin(actor),
            hasProtectedPayout,
            payoutHistory.issue,
            Boolean(hasProtectedPayoutContext && input.entitlementStrategy),
            payoutHistory.snapshots,
          );

          const changedAt = now().toISOString();
          const next = await buildCorrectedOrder(transaction, order, patch, directory, changedAt);
          const auditedChanges = Object.keys(CORRECTION_FIELD_LABELS).filter((field) => !sameValue(
            (order as unknown as Record<string, unknown>)[field],
            (next as unknown as Record<string, unknown>)[field],
          ));
          let preview: CommissionCorrectionPreview | undefined;
          let previewExpectedTarget: Commission[] | undefined;
          if (options.previewCommissions) {
            try {
              const result = await buildPaidOrderCorrectionPreview(
                transaction,
                order,
                next,
                changedAt,
                options.previewCommissions,
                input.entitlementStrategy || 'recalculate_rules',
                input.manualEntitlements,
                directory,
              );
              preview = result.preview;
              previewExpectedTarget = result.expectedTarget;
            } catch (error) {
              throw new OrderCommandError(409, String((error as Error)?.message || '更正影响测算失败'));
            }
          }
          const hasProtectedPayoutImpact = hasPaidCommission || Boolean(preview?.impacts.some((impact) => impact.payoutRecordIds.length > 0));
          if (hasProtectedPayoutImpact && !isSuperAdmin(actor)) {
            throw new OrderCommandError(403, '本次更正会影响已发放提成或月度阶梯，仅超级管理员可操作');
          }
          let rebuiltCommissions: Commission[] = [];
          let commissionSummary = '';
          if (hasProtectedPayoutImpact) {
            if (!options.previewCommissions || !preview) throw new OrderCommandError(503, '发放后影响测算服务不可用');
            const expectedImpactHash = String(input.expectedImpactHash || '').trim();
            if (!expectedImpactHash) throw new OrderCommandError(409, '请先预览并确认发放后更正影响');
            if (expectedImpactHash !== preview.impactHash) {
              throw new OrderCommandError(409, '提成或业务数据已变化，请重新预览更正影响后再确认');
            }
            await syncCorrectedDelivery(transaction, order, next, changedAt);
            const projection = await applyPaidOrderCommissionProjection(
              transaction,
              order,
              next,
              lockedCommissionRows,
              previewExpectedTarget || [],
              changedAt,
              payoutHistory.snapshots,
            );
            const correction = await persistCommissionCorrection(transaction, preview, reason, actor, { now: changedAt });
            const rebuiltRows = await transaction.businessRecord.findMany({
              where: { domain: STORAGE_KEYS.COMMISSIONS, orderId: order.id },
            });
            rebuiltCommissions = rebuiltRows.map((row) => parseObject<Commission>(row.data, '提成'));
            commissionSummary = `保留 ${projection.preservedPaid} 条原已发放记录，重算 ${projection.rebuiltPending} 条未发放分账；更正单 ${correction.correctionNo}，补发 ¥${preview.supplementAmount.toFixed(2)}，追回 ¥${preview.recoverAmount.toFixed(2)}`;
          } else {
            await syncCorrectedDelivery(transaction, order, next, changedAt);
            const commissionRecordIds = lockedCommissionRows
              .map(({ commission }) => commission)
              .filter((commission) => isFormalOrderCommission(commission, order.id))
              .map((commission) => commission.id);
            if (commissionRecordIds.length) {
              await transaction.businessRecord.deleteMany({
                where: { domain: STORAGE_KEYS.COMMISSIONS, recordId: { in: commissionRecordIds } },
              });
            }
            await rebuildPendingCommissions!(transaction, next, changedAt);
            const rebuiltRows = await transaction.businessRecord.findMany({
              where: { domain: STORAGE_KEYS.COMMISSIONS, orderId: order.id },
            });
            rebuiltCommissions = rebuiltRows.map((row) => parseObject<Commission>(row.data, '提成'));
            commissionSummary = `自动撤回 ${originalCommissions.length} 条原分账，重新生成 ${rebuiltCommissions.length} 条待确认分账`;
          }
          const commissionLog: CommissionOperationLog = {
            id: `comm-log-${hash(`${order.id}:correction:${changedAt}`)}`,
            orderId: order.id,
            orderNo: order.orderNo,
            customerName: next.customerName,
            action: '更正订单',
            operator: actor.name,
            operatedAt: changedAt,
            reason,
            summary: commissionSummary,
            commissionCount: rebuiltCommissions.length,
            totalCommissionAmount: Math.round(rebuiltCommissions.reduce((sum, item) => sum + Number(item.commissionAmount || 0), 0) * 100) / 100,
            splitSnapshot: rebuiltCommissions.map((item) => ({
              role: item.role,
              owner: item.owner,
              ownerId: item.ownerId,
              department: item.department,
              commissionAmount: Number(item.commissionAmount || 0),
              status: item.status,
            })),
          };
          await transaction.businessRecord.create({
            data: {
              id: `${STORAGE_KEYS.COMMISSION_OPERATION_LOGS}:${commissionLog.id}`,
              domain: STORAGE_KEYS.COMMISSION_OPERATION_LOGS,
              recordId: commissionLog.id,
              title: `${order.orderNo}-更正订单`,
              status: commissionLog.action,
              orderId: order.id,
              amount: commissionLog.totalCommissionAmount || 0,
              eventAt: new Date(changedAt),
              data: jsonValue(commissionLog),
            },
          });

          const changeLog: OrderChangeLog = {
            id: `hist-${hash(`${order.id}:correct:${changedAt}`)}`,
            action: 'correct',
            operator: actor.name,
            changedAt,
            summary: `订单更正：${reason}`,
            changes: auditedChanges.map((field) => ({
              field,
              label: CORRECTION_FIELD_LABELS[field] || field,
              oldValue: correctionAuditValue(field, (order as unknown as Record<string, unknown>)[field]),
              newValue: correctionAuditValue(field, (next as unknown as Record<string, unknown>)[field]),
            })),
          };
          next.changeHistory = [changeLog, ...(order.changeHistory || [])];
          await transaction.businessRecord.update({
            where: { domain_recordId: { domain: STORAGE_KEYS.ORDERS, recordId: cleanOrderId } },
            data: {
              title: next.customerName || next.orderNo,
              status: next.status,
              owner: next.salesName || next.owner || null,
              customerId: next.customerId,
              orderId: next.id,
              amount: next.actualAmount,
              eventAt: new Date(changedAt),
              data: jsonValue(next),
            },
          });
          const previousPayments = Array.isArray(order.payments) ? order.payments : [];
          const correctedPayments = Array.isArray(next.payments) ? next.payments : [];
          const previousPaymentIds = new Set(previousPayments.map((payment) => payment.id));
          const newPayments = correctedPayments.filter((payment) => !previousPaymentIds.has(payment.id));
          const previousPaymentsById = new Map(previousPayments.map((payment) => [payment.id, payment]));
          const decreasedPayments = correctedPayments.filter((payment) => {
            const previous = previousPaymentsById.get(payment.id);
            return previous && Math.round(payment.amount * 100) < Math.round(Number(previous.amount) * 100);
          });
          try {
            if (newPayments.length) {
              await financeTransactions.recordOrderPayments(
                transaction,
                { ...next, payments: newPayments },
                actor,
                changedAt,
              );
            }
            for (const [index, payment] of decreasedPayments.entries()) {
              await financeTransactions.recordOrderPaymentAdjustment(transaction, {
                order: next,
                paymentId: payment.id,
                actor,
                reason: `订单更正：${reason}`,
                occurredAt: changedAt,
                createdAt: changedAt,
                deferFinalReconciliation: index < decreasedPayments.length - 1,
              });
            }
          } catch (error) {
            throw new OrderCommandError(409, String((error as Error)?.message || '付款资金链更正失败，请先处理财务异常'));
          }
          if (order.customerId !== next.customerId) {
            await recalculateCustomerProjection(transaction, order.customerId, changedAt);
          }
          await recalculateCustomerProjection(transaction, next.customerId, changedAt);
          return next;
        }, {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          maxWait: 5_000,
          timeout: 10_000,
        });
          return success<Order | null>(corrected);
        } catch (error) {
          if (error instanceof OrderCommandError) return failure<Order>(error.message, error.responseCode);
          if (prismaCode(error) === 'P2034' && attempt < MAX_TRANSACTION_ATTEMPTS) continue;
          if (prismaCode(error) === 'P2034') return failure<Order>('订单更正发生并发冲突，请刷新后重试', 409);
          throw error;
        }
      }
      return failure<Order>('订单更正发生并发冲突，请刷新后重试', 409);
    },

    async softDelete(
      orderId: string,
      reason: string,
      actor: AuthenticatedUser,
    ): Promise<ApiResponse<Order | null>> {
      const cleanOrderId = String(orderId || '').trim();
      if (!cleanOrderId) return failure<Order>('订单ID不能为空', 400);
      const scope = orderScope(await loadDirectory(prisma), actor);

      for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
        try {
          const deleted = await prisma.$transaction(async (transaction) => {
            const order = await lockOrder(transaction, cleanOrderId);
            if (!orderIsVisible(order, scope)) throw new OrderCommandError(403, '无权删除该订单');
            if (order.deletedAt) return order;
            if (orderHasActiveRefundOrReversal(order)) {
              throw new OrderCommandError(409, '已进入退款、挽回或冲正流程的订单不能删除');
            }

            const [commissionRows, deliveryRows] = await Promise.all([
              transaction.businessRecord.findMany({ where: { domain: STORAGE_KEYS.COMMISSIONS, orderId: order.id } }),
              transaction.businessRecord.findMany({ where: { domain: STORAGE_KEYS.DELIVERIES, orderId: order.id } }),
            ]);
            const commissionStatuses = commissionRows.map((row) => String(row.status || parseObject<{ status?: string }>(row.data, '提成').status || ''));
            if (commissionStatuses.some((status) => status === '已发放' || status === '待冲销')) {
              throw new OrderCommandError(409, '该订单已有已发放提成，请先完成财务冲销');
            }
            if (commissionStatuses.some((status) => !['已撤回', '已取消', '已冲销'].includes(status))) {
              throw new OrderCommandError(409, '该订单仍有活动提成，请先在财务中心处理');
            }
            const hasActiveDelivery = deliveryRows.some((row) => (
              String(row.status || parseObject<{ status?: string }>(row.data, '交付').status || '') !== '已完成'
            ));
            if (hasActiveDelivery) throw new OrderCommandError(409, '该订单仍有活动交付，不能删除');

            const deletedAt = now().toISOString();
            const deleteReason = String(reason || '').trim() || '业务删除';
            const deleteLog: OrderChangeLog = {
              id: `hist-${hash(`${order.id}:delete:${deletedAt}`)}`,
              action: 'delete',
              operator: actor.name,
              changedAt: deletedAt,
              summary: `删除订单：${deleteReason}`,
            };
            const next: Order = {
              ...order,
              deletedAt,
              deletedBy: actor.name,
              deleteReason,
              changeHistory: [deleteLog, ...(order.changeHistory || [])],
              updatedAt: deletedAt,
            };
            await transaction.businessRecord.update({
              where: { domain_recordId: { domain: STORAGE_KEYS.ORDERS, recordId: cleanOrderId } },
              data: {
                status: next.status,
                owner: next.salesName || next.owner || null,
                customerId: next.customerId,
                orderId: next.id,
                amount: next.actualAmount,
                eventAt: new Date(deletedAt),
                data: jsonValue(next),
              },
            });
            await recalculateCustomerProjection(transaction, next.customerId, deletedAt);
            return next;
          }, {
            isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
            maxWait: 5_000,
            timeout: 10_000,
          });
          return success<Order | null>(deleted);
        } catch (error) {
          if (error instanceof OrderCommandError) return failure<Order>(error.message, error.responseCode);
          if (prismaCode(error) === 'P2034' && attempt < MAX_TRANSACTION_ATTEMPTS) continue;
          if (prismaCode(error) === 'P2034') return failure<Order>('订单删除发生并发冲突，请刷新后重试', 409);
          throw error;
        }
      }
      return failure<Order>('订单删除发生并发冲突，请刷新后重试', 409);
    },
  };
}
