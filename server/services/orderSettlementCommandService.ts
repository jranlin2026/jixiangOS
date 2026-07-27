import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { failure, success, type ApiResponse } from '../api/response';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { hasPermission, isSuperAdmin, PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { Commission, CommissionAdjustmentInput, CommissionOperationLog } from '../../src/types/commission';
import type { Order } from '../../src/types/order';

type OrderSettlementPrisma = Pick<PrismaClient, 'businessRecord' | '$transaction'>;
type Transaction = Prisma.TransactionClient;

class OrderSettlementCommandError extends Error {
  constructor(readonly code: number, message: string) {
    super(message);
  }
}

const jsonValue = (value: unknown) => value as Prisma.InputJsonValue;
const cleanText = (value: unknown) => String(value || '').trim();
const inactiveStatuses = new Set<Commission['status']>(['已撤回', '已取消', '已冲销']);

function parseObject<T>(value: unknown, label: string): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new OrderSettlementCommandError(500, `${label}数据损坏`);
  }
  return value as T;
}

function run<T>(task: () => Promise<T>): Promise<ApiResponse<T | null>> {
  return task()
    .then((data) => success(data))
    .catch((error) => {
      if (error instanceof OrderSettlementCommandError) return failure<T>(error.message, error.code);
      console.error('[order-settlement-command]', error);
      return failure<T>('订单分账操作失败', 500);
    });
}

function requireSettlementWrite(actor: AuthenticatedUser): void {
  if (!hasPermission(actor, PERMISSION_KEYS.FINANCE_SETTLEMENT, 'write')) {
    throw new OrderSettlementCommandError(403, '无订单分账操作权限');
  }
}

type SettlementOrder = Order & {
  settlementReopenPending?: boolean;
  settlementVersion?: number;
  settlementRoundId?: string;
};

async function readOrder(transaction: Transaction, orderId: string): Promise<SettlementOrder | null> {
  const row = await transaction.businessRecord.findUnique({
    where: { domain_recordId: { domain: STORAGE_KEYS.ORDERS, recordId: orderId } },
  });
  return row ? parseObject<SettlementOrder>(row.data, '订单') : null;
}

async function readCommissions(transaction: Transaction, orderId: string): Promise<Commission[]> {
  const rows = await transaction.businessRecord.findMany({
    where: {
      domain: STORAGE_KEYS.COMMISSIONS,
      OR: [
        { orderId },
        { data: { path: '$.orderId', equals: orderId } },
      ],
    },
    orderBy: { recordId: 'asc' },
  });
  return rows.map((row) => ({
    ...parseObject<Commission>(row.data, '订单分账'),
    id: row.recordId,
    orderId: row.orderId || orderId,
    status: (row.status || parseObject<Commission>(row.data, '订单分账').status) as Commission['status'],
    settlementVersion: Number.isInteger(Number((parseObject<Commission>(row.data, '订单分账').settlementVersion)))
      && Number(parseObject<Commission>(row.data, '订单分账').settlementVersion) > 0
      ? Number(parseObject<Commission>(row.data, '订单分账').settlementVersion)
      : 1,
  }));
}

function settlementRoundId(orderId: string, version: number): string {
  return `settlement-${orderId}-v${version}`;
}

function buildSavedCommission(
  order: Order,
  row: CommissionAdjustmentInput,
  actor: AuthenticatedUser,
  reason: string,
  changedAt: string,
  version: number,
): Commission {
  const performanceAmount = Number(row.performanceAmount ?? order.performanceBaseAmount ?? order.actualAmount ?? order.amount) || 0;
  const calculationType = row.ruleCalculationType || (Number(row.commissionRate || 0) > 0 ? 'percentage' : 'fixed');
  const commissionRate = calculationType === 'percentage' ? Number(row.commissionRate || 0) : 0;
  const commissionAmount = calculationType === 'tiered_percentage'
    ? 0
    : calculationType === 'percentage'
      ? Math.round(performanceAmount * commissionRate * 100) / 100
      : Math.round(Number(row.commissionAmount || 0) * 100) / 100;
  if (!row.role || !row.ownerId || !cleanText(row.owner)) throw new OrderSettlementCommandError(400, '请完整填写提成角色和分账人员');
  if (commissionAmount < 0) throw new OrderSettlementCommandError(400, '提成金额不能小于 0');
  return {
    id: `comm-${randomUUID().slice(0, 12)}`,
    orderId: order.id,
    orderNo: order.orderNo,
    customerName: order.customerName,
    productLevel: order.productLevel,
    orderAmount: Number(order.actualAmount ?? order.amount) || 0,
    performanceAmount,
    commissionRate,
    commissionAmount,
    scene: order.dealScene,
    resourceOwnership: order.resourceOwnership,
    proofStatus: order.proofStatus,
    calculationNote: cleanText(row.calculationNote) || '财务人工调整分账',
    formulaText: calculationType === 'tiered_percentage'
      ? '月度累计阶梯提成，按员工月度业绩结算'
      : calculationType === 'percentage'
        ? `业绩金额 ${performanceAmount} × ${Math.round(commissionRate * 10000) / 100}% = ${commissionAmount} 元`
        : `固定提成 ${commissionAmount} 元`,
    payoutPlanId: row.payoutPlanId,
    payoutPlanName: row.payoutPlanName,
    payoutPlanVersion: row.payoutPlanVersion || row.payoutPlanSnapshot?.version,
    payoutPlanSnapshot: row.payoutPlanSnapshot,
    ruleCalculationType: calculationType,
    tierSnapshot: calculationType === 'tiered_percentage' ? row.tierSnapshot : undefined,
    role: row.role,
    owner: cleanText(row.owner),
    ownerId: row.ownerId,
    department: cleanText(row.department),
    departmentId: row.departmentId,
    paymentDate: row.paymentDate || order.payments?.[0]?.paidAt || order.createdAt,
    status: '待确认',
    commissionRuleId: row.commissionRuleId,
    sourceType: '人工新增',
    isManualAdjusted: true,
    adjustReason: reason,
    adjustedBy: actor.name,
    adjustedAt: changedAt,
    settlementRoundId: settlementRoundId(order.id, version),
    settlementVersion: version,
    createdAt: changedAt,
    updatedAt: changedAt,
  };
}

async function appendLog(
  transaction: Transaction,
  orderId: string,
  order: Order | null,
  commissions: Commission[],
  action: CommissionOperationLog['action'],
  reason: string,
  actor: AuthenticatedUser,
  operatedAt: string,
): Promise<void> {
  const first = commissions[0];
  const splitSnapshot = commissions.map((commission) => ({
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
    id: `comm-log-${randomUUID().slice(0, 8)}`,
    orderId,
    orderNo: order?.orderNo || first?.orderNo || orderId,
    customerName: order?.customerName || first?.customerName || '源订单已删除',
    action,
    operator: actor.name,
    operatedAt,
    reason,
    summary: `${action}，共 ${commissions.length} 条分账，合计 ${totalCommissionAmount} 元，原因：${reason}`,
    commissionCount: commissions.length,
    totalCommissionAmount,
    splitSnapshot,
  };
  await transaction.businessRecord.create({
    data: {
      id: `${STORAGE_KEYS.COMMISSION_OPERATION_LOGS}:${log.id}`,
      domain: STORAGE_KEYS.COMMISSION_OPERATION_LOGS,
      recordId: log.id,
      title: `${log.orderNo}-${action}`,
      status: action,
      orderId,
      amount: new Prisma.Decimal(totalCommissionAmount),
      eventAt: new Date(operatedAt),
      data: jsonValue(log),
    },
  });
}

export function createOrderSettlementCommandService(
  prisma: OrderSettlementPrisma,
  options: { now?: () => Date } = {},
) {
  const now = options.now || (() => new Date());

  return {
    async reset(orderId: string, reason: string, actor: AuthenticatedUser): Promise<ApiResponse<boolean | null>> {
      const id = cleanText(orderId);
      const cleanReason = cleanText(reason);
      if (!id) return failure('订单ID不能为空', 400);
      if (!cleanReason) return failure('重置订单分账必须填写原因', 400);
      return run(() => prisma.$transaction(async (transaction) => {
        requireSettlementWrite(actor);
        const order = await readOrder(transaction, id);
        if (!order || order.deletedAt) throw new OrderSettlementCommandError(409, '源订单不存在，不能重置分账');
        const commissions = await readCommissions(transaction, id);
        const activeCommissions = commissions.filter((commission) => !inactiveStatuses.has(commission.status));
        if (!activeCommissions.length) throw new OrderSettlementCommandError(409, '该订单没有可重置的分账记录');
        if (activeCommissions.some((commission) => commission.status !== '待确认')) {
          throw new OrderSettlementCommandError(409, '只能重置全部处于待确认阶段的订单分账');
        }
        const changedAt = now().toISOString();
        await transaction.businessRecord.deleteMany({
          where: {
            domain: STORAGE_KEYS.COMMISSIONS,
            recordId: { in: activeCommissions.map((commission) => commission.id) },
          },
        });
        await appendLog(transaction, id, order, activeCommissions, '重置分账', cleanReason, actor, changedAt);
        return true;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }));
    },

    async withdraw(orderId: string, reason: string, actor: AuthenticatedUser): Promise<ApiResponse<Commission[] | null>> {
      const id = cleanText(orderId);
      const cleanReason = cleanText(reason);
      if (!id) return failure('订单ID不能为空', 400);
      if (!cleanReason) return failure('撤回提成必须填写原因', 400);
      return run(() => prisma.$transaction(async (transaction) => {
        requireSettlementWrite(actor);
        const order = await readOrder(transaction, id);
        if (!order || order.deletedAt) throw new OrderSettlementCommandError(409, '源订单不存在，不能撤回分账');
        const commissions = await readCommissions(transaction, id);
        if (commissions.some((commission) => ['已发放', '待冲销'].includes(commission.status))) {
          throw new OrderSettlementCommandError(409, '提成已发放，第一版不支持系统内冲销，请财务线下处理');
        }
        const changedAt = now().toISOString();
        const updated = commissions.map((commission) => {
          if (!['待确认', '待发放'].includes(commission.status)) return commission;
          return {
            ...commission,
            status: '已撤回' as const,
            auditReason: cleanReason,
            frozenReason: undefined,
            calculationNote: [commission.calculationNote, `撤回提成：${cleanReason}。`].filter(Boolean).join(' '),
            updatedAt: changedAt,
          };
        });
        if (!updated.some((commission, index) => commission.status !== commissions[index].status)) {
          throw new OrderSettlementCommandError(409, '该订单没有可撤回提成');
        }
        await Promise.all(updated.map((commission) => transaction.businessRecord.update({
          where: { domain_recordId: { domain: STORAGE_KEYS.COMMISSIONS, recordId: commission.id } },
          data: { status: commission.status, data: jsonValue(commission), updatedAt: new Date(changedAt) },
        })));
        await appendLog(transaction, id, order, updated, '撤回提成', cleanReason, actor, changedAt);
        return updated;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }));
    },

    async reopen(orderId: string, reason: string, actor: AuthenticatedUser): Promise<ApiResponse<boolean | null>> {
      const id = cleanText(orderId);
      const cleanReason = cleanText(reason);
      if (!id) return failure('订单ID不能为空', 400);
      if (!cleanReason) return failure('重新分账必须填写原因', 400);
      return run(() => prisma.$transaction(async (transaction) => {
        requireSettlementWrite(actor);
        const order = await readOrder(transaction, id);
        if (!order || order.deletedAt) throw new OrderSettlementCommandError(409, '源订单不存在，不能重新分账');
        const commissions = await readCommissions(transaction, id);
        if (!commissions.length) throw new OrderSettlementCommandError(409, '该订单没有可重新分账的历史明细');
        if (commissions.some((commission) => commission.status !== '已撤回')) {
          throw new OrderSettlementCommandError(409, '只有已撤回的订单分账可以重新分账');
        }
        const changedAt = now().toISOString();
        const nextVersion = Math.max(...commissions.map((commission) => commission.settlementVersion || 1)) + 1;
        const next: SettlementOrder = {
          ...order,
          settlementReopenPending: true,
          settlementVersion: nextVersion,
          settlementRoundId: settlementRoundId(id, nextVersion),
          updatedAt: changedAt,
        };
        await transaction.businessRecord.update({
          where: { domain_recordId: { domain: STORAGE_KEYS.ORDERS, recordId: id } },
          data: { data: jsonValue(next), updatedAt: new Date(changedAt) },
        });
        await appendLog(transaction, id, order, commissions, '重新分账', cleanReason, actor, changedAt);
        return true;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }));
    },

    async save(
      orderId: string,
      rows: CommissionAdjustmentInput[],
      reason: string,
      actor: AuthenticatedUser,
    ): Promise<ApiResponse<Commission[] | null>> {
      const id = cleanText(orderId);
      const cleanReason = cleanText(reason);
      if (!id) return failure('订单ID不能为空', 400);
      if (!cleanReason) return failure('调整分账必须填写原因', 400);
      if (!Array.isArray(rows) || !rows.length) return failure('至少保留一条分账记录', 400);
      return run(() => prisma.$transaction(async (transaction) => {
        requireSettlementWrite(actor);
        const order = await readOrder(transaction, id);
        if (!order || order.deletedAt) throw new OrderSettlementCommandError(409, '源订单不存在，不能保存分账');
        const existing = await readCommissions(transaction, id);
        if (existing.some((commission) => commission.status === '已发放')) {
          throw new OrderSettlementCommandError(409, '提成已发放，请财务线下处理');
        }
        if (existing.some((commission) => commission.status === '待发放')) {
          throw new OrderSettlementCommandError(409, '分账已进入待发放阶段，不能直接保存');
        }
        const inactive = existing.filter((commission) => inactiveStatuses.has(commission.status));
        const active = existing.filter((commission) => !inactiveStatuses.has(commission.status));
        if (active.some((commission) => commission.status !== '待确认')) {
          throw new OrderSettlementCommandError(409, '当前分账状态不支持保存');
        }
        const hasWithdrawnHistory = inactive.some((commission) => commission.status === '已撤回');
        if (hasWithdrawnHistory && !order.settlementReopenPending) {
          throw new OrderSettlementCommandError(409, '已撤回的订单分账必须先重新分账');
        }
        const changedAt = now().toISOString();
        const version = order.settlementReopenPending
          ? Math.max(...existing.map((commission) => commission.settlementVersion || 1)) + 1
          : Math.max(1, ...active.map((commission) => commission.settlementVersion || 1));
        const saved = rows.map((row) => buildSavedCommission(order, row, actor, cleanReason, changedAt, version));
        if (active.length) {
          await transaction.businessRecord.deleteMany({
            where: { domain: STORAGE_KEYS.COMMISSIONS, recordId: { in: active.map((commission) => commission.id) } },
          });
        }
        for (const commission of saved) {
          await transaction.businessRecord.create({
            data: {
              id: `${STORAGE_KEYS.COMMISSIONS}:${commission.id}`,
              domain: STORAGE_KEYS.COMMISSIONS,
              recordId: commission.id,
              title: `${order.orderNo}-${commission.role}`,
              status: commission.status,
              owner: commission.owner,
              customerId: order.customerId,
              orderId: order.id,
              amount: new Prisma.Decimal(commission.commissionAmount),
              eventAt: new Date(commission.paymentDate || changedAt),
              data: jsonValue(commission),
            },
          });
        }
        const next: SettlementOrder = {
          ...order,
          settlementReopenPending: false,
          settlementVersion: version,
          settlementRoundId: settlementRoundId(id, version),
          updatedAt: changedAt,
        };
        await transaction.businessRecord.update({
          where: { domain_recordId: { domain: STORAGE_KEYS.ORDERS, recordId: id } },
          data: { data: jsonValue(next), updatedAt: new Date(changedAt) },
        });
        await appendLog(transaction, id, order, saved, '调整分账', cleanReason, actor, changedAt);
        return saved;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }));
    },

    async cleanup(orderId: string, reason: string, actor: AuthenticatedUser): Promise<ApiResponse<boolean | null>> {
      const id = cleanText(orderId);
      const cleanReason = cleanText(reason);
      if (!id) return failure('订单ID不能为空', 400);
      if (!cleanReason) return failure('清理废弃分账必须填写原因', 400);
      if (!isSuperAdmin(actor)) return failure('仅超级管理员可以清理废弃订单分账', 403);
      return run(() => prisma.$transaction(async (transaction) => {
        const order = await readOrder(transaction, id);
        if (order && !order.deletedAt) throw new OrderSettlementCommandError(409, '源订单仍存在，不能清理废弃记录');
        const commissions = await readCommissions(transaction, id);
        if (!commissions.length) throw new OrderSettlementCommandError(409, '没有可清理的废弃分账记录');
        if (commissions.some((commission) => commission.status === '已发放')) {
          throw new OrderSettlementCommandError(409, '提成已发放，请财务线下处理');
        }
        if (commissions.some((commission) => !inactiveStatuses.has(commission.status))) {
          throw new OrderSettlementCommandError(409, '该废弃分账仍有活动提成，请先撤回后再处理');
        }
        const existing = await transaction.businessRecord.findFirst({
          where: { domain: STORAGE_KEYS.COMMISSION_OPERATION_LOGS, orderId: id, status: '清理废弃分账' },
        });
        if (existing) return true;
        await appendLog(transaction, id, order, commissions, '清理废弃分账', cleanReason, actor, now().toISOString());
        return true;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }));
    },
  };
}
