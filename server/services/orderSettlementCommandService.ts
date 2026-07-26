import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { failure, success, type ApiResponse } from '../api/response';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { hasPermission, isSuperAdmin, PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { Commission, CommissionOperationLog } from '../../src/types/commission';
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

async function readOrder(transaction: Transaction, orderId: string): Promise<Order | null> {
  const row = await transaction.businessRecord.findUnique({
    where: { domain_recordId: { domain: STORAGE_KEYS.ORDERS, recordId: orderId } },
  });
  return row ? parseObject<Order>(row.data, '订单') : null;
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
  }));
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
        if (!commissions.length) throw new OrderSettlementCommandError(409, '该订单没有可重置的分账记录');
        if (commissions.some((commission) => commission.status !== '待确认')) {
          throw new OrderSettlementCommandError(409, '只能重置全部处于待确认阶段的订单分账');
        }
        const changedAt = now().toISOString();
        await transaction.businessRecord.deleteMany({
          where: {
            domain: STORAGE_KEYS.COMMISSIONS,
            recordId: { in: commissions.map((commission) => commission.id) },
          },
        });
        await appendLog(transaction, id, order, commissions, '重置分账', cleanReason, actor, changedAt);
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
        if (commissions.some((commission) => !inactiveStatuses.has(commission.status))) {
          throw new OrderSettlementCommandError(409, '该废弃分账仍有活动提成，请先撤回或完成财务处理');
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
