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
  CommissionOperationLog,
  OfficialPaymentChannel,
} from '../../src/types/commission';
import { mapPrismaRole, mapPrismaUser } from '../db/prismaMappers';
import { hasPermission, PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import {
  createCustomerBusinessRecordRepository,
  CustomerWriteConflictError,
} from './customerBusinessRecordRepository';

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
  'thirdPartyOrderNo',
  'payments',
  'dealEvidenceName',
  'dealEvidencePreview',
  'dealEvidenceAttachments',
]);
const EDIT_FIELD_LABELS: Record<string, string> = {
  notes: '备注',
  thirdPartyOrderNo: '第三方平台订单号',
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
  thirdPartyOrderNo: '第三方平台订单号',
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
    if (
      !payment?.id
      || !sameValue(payment.amount, order.actualAmount)
      || !sameValue(payment.paymentMethod, order.paymentMethod)
      || !sameValue(payment.paidAt, order.createdAt)
    ) {
      throw new OrderCommandError(409, '历史订单补充首笔付款资料时，金额、方式和时间必须保持订单原值');
    }
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
  const rows = await transaction.$queryRaw<Array<{ status: string | null; data: unknown }>>(Prisma.sql`
    SELECT id, recordId, status, data
    FROM business_records
    WHERE domain = ${STORAGE_KEYS.COMMISSIONS}
      AND orderId = ${current.id}
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
    where: { domain: STORAGE_KEYS.COMMISSIONS, orderId: current.id },
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
    if (!Array.isArray(next.payments) || !next.payments.length) {
      throw new OrderCommandError(400, '更正实付金额时必须提供付款记录');
    }
    next.payments = next.payments.map((payment, index) => {
      const amount = Math.round(Number(payment?.amount) * 100) / 100;
      if (!payment?.id || !Number.isFinite(amount) || amount <= 0) {
        throw new OrderCommandError(400, `第 ${index + 1} 笔付款数据无效`);
      }
      if (!payment.paidAt || Number.isNaN(new Date(payment.paidAt).getTime())) {
        throw new OrderCommandError(400, `第 ${index + 1} 笔付款时间无效`);
      }
      return {
        ...payment,
        amount,
        paymentMethod: next.paymentMethod,
      };
    });
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
      AND orderId = ${orderId}
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

function inspectCorrectionEligibility(
  order: Order,
  lockedCommissions: Array<{ row: { status: string | null }; commission: Commission }>,
  rebuildAvailable: boolean,
): OrderCorrectionPrecheck {
  const commissions = lockedCommissions.map(({ commission }) => commission);
  const statuses = lockedCommissions.map(({ row, commission }) => String(row.status || commission.status || ''));
  const uniqueStatuses = Array.from(new Set(statuses.filter(Boolean)));
  const manualCommissionCount = commissions.filter((commission) => (
    commission.isManualAdjusted || commission.sourceType === '人工新增'
  )).length;
  const blocked = (
    reasonCode: NonNullable<OrderCorrectionPrecheck['reasonCode']>,
    message: string,
  ): OrderCorrectionPrecheck => ({
    allowed: false,
    reasonCode,
    message,
    commissionCount: commissions.length,
    manualCommissionCount,
    commissionStatuses: uniqueStatuses,
  });
  if (order.deletedAt) return blocked('order_deleted', '已删除订单不能更正');
  if (orderHasActiveRefundOrReversal(order)) {
    return blocked('refund_in_progress', '该订单已进入退款或冲正链路，请走订单冲正流程');
  }
  if (manualCommissionCount > 0) {
    return blocked('manual_commission', `该订单存在 ${manualCommissionCount} 条人工新增或人工调整的分账，请先到财务中心处理`);
  }
  if (statuses.some((status) => ['已发放', '待冲销', '已冲销'].includes(status))) {
    return blocked('payout_started', '该订单提成已进入发放或冲销阶段，请走订单冲正流程');
  }
  if (statuses.some((status) => ['已撤回', '已取消'].includes(status))) {
    return blocked('commission_withdrawn', '该订单分账已撤回或取消，请先在财务中心处理');
  }
  const unsupported = statuses.find((status) => status && !['待确认', '待发放'].includes(status));
  if (unsupported) return blocked('unsupported_commission_status', `分账状态“${unsupported}”不支持自动重算，请先到财务中心处理`);
  if (!rebuildAvailable) return blocked('rebuild_unavailable', '提成重算服务不可用，暂不能更正订单');
  return {
    allowed: true,
    message: commissions.length ? '当前分账可以随订单更正自动撤回并重算' : '当前订单可以更正',
    commissionCount: commissions.length,
    manualCommissionCount,
    commissionStatuses: uniqueStatuses,
  };
}

function assertCorrectableCommissions(
  order: Order,
  lockedCommissions: Array<{ row: { status: string | null }; commission: Commission }>,
  rebuildAvailable: boolean,
): Commission[] {
  const eligibility = inspectCorrectionEligibility(order, lockedCommissions, rebuildAvailable);
  if (!eligibility.allowed) throw new OrderCommandError(409, eligibility.message);
  return lockedCommissions.map(({ commission }) => commission);
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

  return {
    async precheckCorrection(
      orderId: string,
      actor: AuthenticatedUser,
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
          return inspectCorrectionEligibility(order, lockedCommissionRows, Boolean(options.rebuildPendingCommissions));
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
      const directory = await loadDirectory(prisma);
      if (!hasPermission(actor, PERMISSION_KEYS.ORDER_CORRECT, 'write')) {
        return failure<Order>('无订单更正权限', 403);
      }
      const scope = orderScope(directory, actor);

      for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
        try {
          const corrected = await prisma.$transaction(async (transaction) => {
          const order = await lockOrder(transaction, cleanOrderId);
          if (!orderIsVisible(order, scope)) throw new OrderCommandError(403, '无权更正该订单');
          await validateStableOrderRelations(transaction, order, directory);
          const patch = input?.data || {};
          const changed = changedFields(order, patch);
          const serverField = changed.find((field) => SERVER_FIELDS.has(field));
          if (serverField) throw new OrderCommandError(400, `字段 ${serverField} 由服务端维护，不能更正`);
          const unsupported = changed.find((field) => !CORRECTION_INPUT_FIELDS.has(field));
          if (unsupported) throw new OrderCommandError(400, `字段 ${unsupported} 不支持订单更正`);
          if (!changed.length) return order;

          const lockedCommissionRows = await lockOrderCommissions(transaction, order.id);
          const rebuildPendingCommissions = options.rebuildPendingCommissions;
          const originalCommissions = assertCorrectableCommissions(order, lockedCommissionRows, Boolean(rebuildPendingCommissions));

          const changedAt = now().toISOString();
          const next = await buildCorrectedOrder(transaction, order, patch, directory, changedAt);
          const auditedChanges = Object.keys(CORRECTION_FIELD_LABELS).filter((field) => !sameValue(
            (order as unknown as Record<string, unknown>)[field],
            (next as unknown as Record<string, unknown>)[field],
          ));
          await syncCorrectedDelivery(transaction, order, next, changedAt);
          await transaction.businessRecord.deleteMany({
            where: { domain: STORAGE_KEYS.COMMISSIONS, orderId: order.id },
          });
          await rebuildPendingCommissions!(transaction, next, changedAt);
          const rebuiltRows = await transaction.businessRecord.findMany({
            where: { domain: STORAGE_KEYS.COMMISSIONS, orderId: order.id },
          });
          const rebuiltCommissions = rebuiltRows.map((row) => parseObject<Commission>(row.data, '提成'));
          const commissionLog: CommissionOperationLog = {
            id: `comm-log-${hash(`${order.id}:correction:${changedAt}`)}`,
            orderId: order.id,
            orderNo: order.orderNo,
            customerName: next.customerName,
            action: '更正订单',
            operator: actor.name,
            operatedAt: changedAt,
            reason,
            summary: `自动撤回 ${originalCommissions.length} 条原分账，重新生成 ${rebuiltCommissions.length} 条待确认分账`,
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
