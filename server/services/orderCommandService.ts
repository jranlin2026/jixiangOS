import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { failure, success, type ApiResponse } from '../api/response';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { buildDataVisibilityScopeForUser, type DataVisibilityScope } from '../../src/shared/utils/dataVisibility';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { Customer } from '../../src/types/customer';
import type { Order, OrderChangeLog } from '../../src/types/order';
import type { Product } from '../../src/types/product';
import type { Department } from '../../src/types/department';
import type { Role } from '../../src/types/role';
import type { User } from '../../src/types/settings';
import type {
  Commission,
  CommissionOperationLog,
  OfficialPaymentChannel,
} from '../../src/types/commission';
import { mapPrismaRole, mapPrismaUser } from '../db/prismaMappers';
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
  'sourceType',
  'resourceOwnership',
]);
const FINANCIAL_FIELDS = new Set([
  'productId',
  'productName',
  'productLevel',
  'orderType',
  'amount',
  'actualAmount',
  'paymentMethod',
  'payments',
  'status',
  'refundStatus',
  'refundAmount',
  'refundReason',
  'dealScene',
  'proofStatus',
  'originalOrderId',
  'performanceBaseAmount',
  'dealEvidenceName',
  'dealEvidencePreview',
  'dealEvidenceAttachments',
  'isExternalTalentOrder',
]);
const DIRECT_EDIT_FIELDS = new Set(['notes', 'thirdPartyOrderNo', 'officialPaymentChannel']);
const EDIT_FIELD_LABELS: Record<string, string> = {
  notes: '备注',
  thirdPartyOrderNo: '第三方平台订单号',
  officialPaymentChannel: '官方收款渠道',
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
  if (order.salesId) return scope.visibleUserIds.includes(order.salesId);
  return Boolean(
    (order.salesName && scope.visibleUserNames.includes(order.salesName))
    || (order.owner && scope.visibleUserNames.includes(order.owner)),
  );
}

function changedFields(order: Order, patch: Partial<Order>): string[] {
  return Object.keys(patch).filter((field) => !sameValue(
    (order as unknown as Record<string, unknown>)[field],
    (patch as unknown as Record<string, unknown>)[field],
  ));
}

function assertAllowedPatch(order: Order, patch: Partial<Order>): string[] {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new OrderCommandError(400, '订单修改数据无效');
  }
  const changed = changedFields(order, patch);
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
  if (
    changed.includes('officialPaymentChannel')
    && !OFFICIAL_PAYMENT_CHANNEL_VALUES.has(patch.officialPaymentChannel as OfficialPaymentChannel)
  ) {
    throw new OrderCommandError(400, '官方收款渠道无效');
  }
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

export function createOrderCommandService(
  prisma: OrderCommandPrisma,
  options: OrderCommandServiceOptions = {},
) {
  const now = options.now || (() => new Date());

  return {
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
            const nextChannel = changed.includes('officialPaymentChannel')
              ? patch.officialPaymentChannel as OfficialPaymentChannel
              : order.officialPaymentChannel;
            const next: Order = {
              ...order,
              ...(changed.includes('notes') ? { notes: patch.notes } : {}),
              ...(changed.includes('thirdPartyOrderNo') ? {
                thirdPartyOrderNo: String(patch.thirdPartyOrderNo || '').trim() || undefined,
              } : {}),
              ...(changed.includes('officialPaymentChannel') ? {
                officialPaymentChannel: nextChannel,
                paymentMethod: paymentMethodFromOfficialChannel(nextChannel!),
              } : {}),
              updatedAt: changedAt,
            };
            if (changed.includes('officialPaymentChannel')) {
              await replacePendingCommissions(
                transaction,
                order,
                next,
                changedAt,
                actor.name,
                options.rebuildPendingCommissions,
              );
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
            if (order.status === '退款中') throw new OrderCommandError(409, '退款流程中的订单不能删除');

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
