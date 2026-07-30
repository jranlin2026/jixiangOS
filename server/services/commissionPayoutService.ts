import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { failure, success } from '../api/response';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import {
  applyRecoveryCommissionBusinessTimes,
  getCommissionTierBucketKey,
  isRecoveryCommission,
  selectCurrentCommissionRounds,
} from '../../src/shared/utils/commissionConfiguration';
import {
  calculateCommissionBusinessMetrics,
  calculateCommissionStatusMetrics,
  resolveFormalOrderPaidAmount,
  resolveRecoveryBusinessAmount,
} from '../../src/shared/utils/commissionMonthlyMetrics';
import { isSuperAdmin } from '../../src/shared/utils/permissions';
import { isRecoveryCommissionRelatedToOrder } from '../../src/shared/utils/recoveryOrderDeletion';
import type { AuthenticatedUser } from '../../src/types/auth';
import type {
  Commission,
  CommissionCorrectionRecord,
  CommissionPayoutEmployeeRow,
  CommissionPayoutRecord,
  CommissionPayoutWorkspace,
  IssueCommissionPayoutInput,
} from '../../src/types/commission';
import type { RecoveryOrder } from '../../src/types/recoveryOrder';
import type { Order } from '../../src/types/order';
import { resolveCommissionCorrectionStatuses } from './commissionCorrectionService';
import { selectLatestCommissionCorrections } from './commissionCorrectionRecordSelection';
import { lockCommissionLedger } from './commissionLedgerLock';

type PayoutPrisma = Pick<PrismaClient, 'businessRecord' | '$transaction'>;
type PayoutTransaction = Prisma.TransactionClient;

export interface CommissionPayoutServiceOptions {
  now?: () => Date;
  id?: () => string;
  recordFinanceTransaction?: (transaction: PayoutTransaction, payout: CommissionPayoutRecord) => Promise<unknown>;
}

const FINAL_COMMISSION_STATUSES = new Set<Commission['status']>(['已发放', '已取消', '已撤回', '已冲销']);
const INCLUDED_PERIOD_WORKSPACE_STATUSES = new Set<Commission['status']>([
  '待确认', '待发放', '已发放', '已取消', '已撤回', '待冲销', '已冲销',
]);
const INACTIVE_COMMISSION_STATUSES = new Set<Commission['status']>(['已取消', '已撤回', '待冲销', '已冲销']);

const asObject = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const periodOf = (commission: Commission) => String(commission.paymentDate || commission.createdAt || '').slice(0, 7);
const ownerKey = (commission: Commission) => commission.ownerId || `name:${commission.owner}`;
const recordData = (value: Commission | CommissionPayoutRecord | RecoveryOrder) => value as unknown as Prisma.InputJsonValue;

function parseCorrectionRecord(value: unknown): CommissionCorrectionRecord | null {
  const data = asObject(value);
  if (!data.id || !Array.isArray(data.impacts) || !Array.isArray(data.legs)) return null;
  return data as unknown as CommissionCorrectionRecord;
}

function normalizeCommissionRound(value: unknown): Commission {
  const commission = asObject(value) as unknown as Commission;
  const version = Number(commission.settlementVersion || 1);
  return {
    ...commission,
    settlementVersion: Number.isInteger(version) && version > 0 ? version : 1,
  };
}

function resolveTieredPayoutAmounts(commissions: Commission[]): Commission[] {
  const currentRounds = selectCurrentCommissionRounds(commissions);
  const monthlyBaseByBucket = new Map<string, number>();
  currentRounds.forEach((commission) => {
    if (commission.ruleCalculationType !== 'tiered_percentage' || INACTIVE_COMMISSION_STATUSES.has(commission.status)) return;
    const key = `${periodOf(commission)}::${getCommissionTierBucketKey(commission)}`;
    monthlyBaseByBucket.set(key, roundMoney(
      (monthlyBaseByBucket.get(key) || 0) + Number(commission.performanceAmount || commission.orderAmount || 0),
    ));
  });

  return currentRounds.map((commission) => {
    if (commission.ruleCalculationType !== 'tiered_percentage'
      || commission.status === '已发放'
      || INACTIVE_COMMISSION_STATUSES.has(commission.status)) return commission;
    const key = `${periodOf(commission)}::${getCommissionTierBucketKey(commission)}`;
    const baseAmount = monthlyBaseByBucket.get(key) || 0;
    const tiers = (commission.payoutPlanSnapshot?.tiers || commission.tierSnapshot?.tiers || [])
      .slice()
      .sort((left, right) => left.minAmount - right.minAmount);
    const currentTier = tiers.find((tier) => (
      baseAmount >= tier.minAmount
      && (tier.maxAmount === undefined || baseAmount < tier.maxAmount)
    ));
    if (!currentTier) return commission;
    const nextTier = tiers.find((tier) => tier.minAmount > baseAmount);
    const performanceAmount = Number(commission.performanceAmount || commission.orderAmount || 0);
    const commissionAmount = roundMoney(performanceAmount * currentTier.rate / 100);
    const tierRange = currentTier.maxAmount === undefined
      ? `${currentTier.minAmount} 元以上`
      : `${currentTier.minAmount}-${currentTier.maxAmount} 元`;
    return {
      ...commission,
      commissionRate: currentTier.rate / 100,
      commissionAmount,
      tierSnapshot: {
        tiers,
        currentTier,
        nextTier,
        baseAmount,
        gapToNext: nextTier ? roundMoney(nextTier.minAmount - baseAmount) : 0,
      },
      formulaText: `${commission.role} · ${commission.payoutPlanSnapshot?.name || commission.payoutPlanName || '月度累计阶梯提成'}：本月累计业绩 ${baseAmount} 元，命中 ${tierRange} × ${currentTier.rate}%；本笔业绩 ${performanceAmount} × ${currentTier.rate}% = ${commissionAmount} 元`,
    };
  });
}

function normalizePayoutRecord(value: unknown): CommissionPayoutRecord | null {
  const data = asObject(value);
  const id = String(data.id || '').trim();
  if (!id) return null;
  const rawStatus = String(data.status || '');
  return {
    id,
    payoutNo: String(data.payoutNo || data.batchNo || id),
    period: String(data.issuedAt || data.paidAt || '').slice(0, 7) || String(data.period || ''),
    status: rawStatus === '已撤销' || rawStatus === '已作废' ? '已撤销' : '已发放',
    totalCount: Number(data.totalCount || 0),
    totalAmount: Number(data.totalAmount || 0),
    commissionIds: Array.isArray(data.commissionIds) ? data.commissionIds.map(String) : [],
    commissionSnapshots: Array.isArray(data.commissionSnapshots)
      ? data.commissionSnapshots as unknown as Commission[]
      : undefined,
    byOwner: Array.isArray(data.byOwner) ? data.byOwner as CommissionPayoutRecord['byOwner'] : [],
    createdAt: String(data.createdAt || data.generatedAt || data.paidAt || ''),
    createdById: String(data.createdById || data.paidById || ''),
    createdByName: String(data.createdByName || data.paidByName || ''),
    issuedAt: String(data.issuedAt || data.paidAt || data.createdAt || ''),
    issuedById: String(data.issuedById || data.paidById || data.createdById || ''),
    issuedByName: String(data.issuedByName || data.paidByName || data.createdByName || ''),
    paymentMethod: data.paymentMethod ? String(data.paymentMethod) : undefined,
    paymentReference: data.paymentReference ? String(data.paymentReference) : undefined,
    reversedAt: data.reversedAt ? String(data.reversedAt) : undefined,
    reversedById: data.reversedById ? String(data.reversedById) : undefined,
    reversedByName: data.reversedByName ? String(data.reversedByName) : undefined,
    reverseReason: data.reverseReason ? String(data.reverseReason) : undefined,
    note: data.note ? String(data.note) : undefined,
  };
}

const commissionRecordUpdate = (commission: Commission, changedAt: Date) => ({
  status: commission.status,
  owner: commission.owner || null,
  orderId: commission.orderId || null,
  amount: new Prisma.Decimal(commission.commissionAmount || 0),
  eventAt: commission.paymentDate ? new Date(commission.paymentDate) : null,
  data: recordData(commission),
  updatedAt: changedAt,
});

const payoutRecordUpdate = (record: CommissionPayoutRecord, changedAt: Date) => ({
  title: record.payoutNo,
  status: record.status,
  owner: record.issuedByName,
  amount: new Prisma.Decimal(record.totalAmount),
  eventAt: new Date(record.issuedAt),
  data: recordData(record),
  updatedAt: changedAt,
});

const recoveryRecordUpdate = (order: RecoveryOrder, changedAt: Date) => ({
  title: order.recoveryNo,
  status: order.status,
  owner: order.recoveryUserName,
  customerId: order.customerId || null,
  orderId: order.id,
  amount: new Prisma.Decimal(order.recoveryAmount || 0),
  eventAt: order.recoveryAt ? new Date(order.recoveryAt) : null,
  data: recordData(order),
  updatedAt: changedAt,
});

const payoutNo = (period: string, id: string) => (
  `FF-${period.replace('-', '')}-${id.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase()}`
);

async function lockCommissionRows(tx: PayoutTransaction): Promise<void> {
  if (typeof tx.$queryRaw !== 'function') return;
  await tx.$queryRaw(Prisma.sql`
    SELECT id FROM business_records
    WHERE domain = ${STORAGE_KEYS.COMMISSIONS}
    FOR UPDATE
  `);
}

function canReversePayout(actor: AuthenticatedUser): boolean {
  return isSuperAdmin(actor) || /财务.*(经理|主管|负责人)|(经理|主管|负责人).*财务/.test(String(actor.role || ''));
}

function recoveryIdsFor(commissions: Commission[]): string[] {
  return [...new Set(commissions
    .filter((item) => (
      item.sourceBusinessType === 'after_sales_recovery'
      || item.sourceBusinessType === 'refund_recovery'
      || Boolean(item.sourceRecoveryOrderId)
      || String(item.orderNo || '').startsWith('RCV-')
    ))
    .map((item) => item.sourceRecoveryOrderId || item.orderId)
    .filter(Boolean))];
}

async function syncRecoverySettlementStatuses(
  tx: PayoutTransaction,
  recoveryIds: string[],
  changedAt: Date,
  actor: AuthenticatedUser,
  reason?: string,
): Promise<void> {
  for (const recoveryId of recoveryIds) {
    const lockedRecoveryRows = await tx.$queryRaw<Array<{ data: unknown }>>(Prisma.sql`
      SELECT data
      FROM business_records
      WHERE domain = ${STORAGE_KEYS.RECOVERY_ORDERS}
        AND recordId = ${recoveryId}
      LIMIT 1
      FOR UPDATE
    `);
    const recoveryRow = lockedRecoveryRows[0];
    if (!recoveryRow) continue;
    const recovery = asObject(recoveryRow.data) as unknown as RecoveryOrder;
    const commissionIds = Array.from(new Set(recovery.commissionIds || []));
    const relatedRows = await tx.businessRecord.findMany({
      where: {
        domain: STORAGE_KEYS.COMMISSIONS,
        OR: [
          { orderId: recoveryId },
          { data: { path: '$.sourceRecoveryOrderId', equals: recoveryId } },
          ...(commissionIds.length ? [{ recordId: { in: commissionIds } }] : []),
        ],
      },
    });
    const related = relatedRows
      .map((row) => {
        const commission = normalizeCommissionRound(row.data);
        return {
          ...commission,
          id: row.recordId || commission.id,
          orderId: row.orderId || commission.orderId,
        };
      })
      .filter((commission) => isRecoveryCommissionRelatedToOrder(
        recoveryId,
        new Set(commissionIds),
        commission,
      ));
    const active = related.filter((item) => !['已取消', '已撤回', '已冲销'].includes(item.status));
    const settlementStatus = active.some((item) => item.status === '待确认')
      ? '待确认'
      : active.some((item) => item.status === '待发放')
        ? '待发放'
        : active.length > 0 && active.every((item) => FINAL_COMMISSION_STATUSES.has(item.status))
          ? '已发放'
          : '待处理';
    const changedAtIso = changedAt.toISOString();
    const summary = settlementStatus === '已发放'
      ? '售后挽回订单提成已发放'
      : recovery.settlementStatus === '已发放' && settlementStatus === '待发放'
        ? '撤销售后挽回订单提成发放'
        : `售后挽回订单分账状态更新为${settlementStatus}`;
    const updated = {
      ...recovery,
      settlementStatus,
      settlementPaidAt: settlementStatus === '已发放' ? changedAtIso : undefined,
      updatedAt: changedAtIso,
      changeHistory: settlementStatus === recovery.settlementStatus
        ? recovery.changeHistory
        : [{
            id: `rch-${randomUUID()}`,
            action: 'settlement' as const,
            operatorId: actor.id,
            operator: actor.name,
            changedAt: changedAtIso,
            reason: String(reason || '').trim() || undefined,
            summary,
          }, ...(recovery.changeHistory || [])],
    } as RecoveryOrder;
    await tx.businessRecord.update({
      where: { domain_recordId: { domain: STORAGE_KEYS.RECOVERY_ORDERS, recordId: recoveryId } },
      data: recoveryRecordUpdate(updated, changedAt),
    });
  }
}

function employeeRows(
  commissions: Commission[],
  orders: Order[] = [],
  recoveryOrders: RecoveryOrder[] = [],
  amountFor?: (commission: Commission) => number,
): CommissionPayoutEmployeeRow[] {
  const grouped = new Map<string, CommissionPayoutEmployeeRow & { orderIds: Set<string> }>();
  commissions.forEach((commission) => {
    const key = ownerKey(commission);
    const row = grouped.get(key) || {
      ownerId: key,
      owner: commission.owner,
      departmentId: commission.departmentId,
      department: commission.department,
      orderCount: 0,
      commissionCount: 0,
      formalOrderCount: 0,
      recoveryOrderCount: 0,
      formalOrderPaidAmount: 0,
      recoveryBusinessAmount: 0,
      statusCounts: { pendingHandling: 0, pendingConfirm: 0, pendingPay: 0, paid: 0, withdrawn: 0 },
      pendingConfirmAmount: 0,
      pendingPayAmount: 0,
      paidAmount: 0,
      withdrawnAmount: 0,
      totalAmount: 0,
      commissions: [],
      orderIds: new Set<string>(),
    };
    row.commissionCount += 1;
    row.orderIds.add(commission.orderId);
    row.commissions.push(commission);
    grouped.set(key, row);
  });
  return [...grouped.values()].map(({ orderIds, ...row }) => {
    const businessMetrics = calculateCommissionBusinessMetrics(row.commissions, orders, recoveryOrders);
    const statusMetrics = calculateCommissionStatusMetrics(row.commissions, amountFor);
    return {
      ...row,
      ...businessMetrics,
      ...statusMetrics,
      orderCount: orderIds.size,
    };
  })
    .sort((left, right) => right.pendingPayAmount - left.pendingPayAmount || left.owner.localeCompare(right.owner, 'zh-CN'));
}

type CorrectionAmounts = Pick<CommissionPayoutEmployeeRow,
  | 'correctionOriginalPaidAmount'
  | 'correctionEntitlementAmount'
  | 'correctionSupplementAmount'
  | 'correctionRecoverAmount'
  | 'pendingCorrectionSupplementAmount'
  | 'pendingCorrectionRecoverAmount'> & {
    ownerId: string;
    owner: string;
    departmentId?: string;
    department: string;
  };

function employeeRowsWithCorrectionMetrics(
  rows: CommissionPayoutEmployeeRow[],
  corrections: CommissionCorrectionRecord[],
  period: string,
): CommissionPayoutEmployeeRow[] {
  const metrics = new Map<string, CorrectionAmounts>();
  const ensure = (ownerId: string | undefined, owner: string, departmentId?: string, department = '') => {
    const key = ownerId || `name:${owner}`;
    const current = metrics.get(key) || {
      ownerId: key,
      owner,
      departmentId,
      department,
      correctionOriginalPaidAmount: 0,
      correctionEntitlementAmount: 0,
      correctionSupplementAmount: 0,
      correctionRecoverAmount: 0,
      pendingCorrectionSupplementAmount: 0,
      pendingCorrectionRecoverAmount: 0,
    };
    metrics.set(key, current);
    return current;
  };
  // 原已发/更正后应得是当前业务口径，同一源单只看最新一次更正；
  // 补发/追回是已经产生的差额流水，必须保留所有历史更正里的真实处理记录。
  selectLatestCommissionCorrections(corrections).forEach((correction) => {
    correction.impacts.forEach((impact) => {
      if (impact.originalPeriod === period) {
        const row = ensure(impact.originalOwnerId, impact.originalOwner);
        row.correctionOriginalPaidAmount = roundMoney(Number(row.correctionOriginalPaidAmount || 0) + impact.originalPaidAmount);
      }
      if (impact.correctedPeriod === period) {
        const row = ensure(impact.correctedOwnerId, impact.correctedOwner);
        row.correctionEntitlementAmount = roundMoney(Number(row.correctionEntitlementAmount || 0) + impact.correctedEntitlementAmount);
      }
    });
  });
  corrections.forEach((correction) => {
    correction.legs.filter((leg) => leg.period === period).forEach((leg) => {
      const row = ensure(leg.ownerId, leg.owner, leg.departmentId, leg.department || '');
      if (leg.kind === '补发') {
        row.correctionSupplementAmount = roundMoney(Number(row.correctionSupplementAmount || 0) + leg.amount);
        if (!['已处理', '已取消'].includes(leg.status)) {
          row.pendingCorrectionSupplementAmount = roundMoney(Number(row.pendingCorrectionSupplementAmount || 0) + leg.amount);
        }
      } else {
        row.correctionRecoverAmount = roundMoney(Number(row.correctionRecoverAmount || 0) + leg.amount);
        if (leg.status === '待处理') {
          row.pendingCorrectionRecoverAmount = roundMoney(Number(row.pendingCorrectionRecoverAmount || 0) + leg.amount);
        }
      }
    });
  });
  const byOwner = new Map(rows.map((row) => [row.ownerId || `name:${row.owner}`, { ...row }]));
  metrics.forEach((amounts, key) => {
    const existing = byOwner.get(key);
    if (existing) {
      byOwner.set(key, { ...existing, ...amounts, ownerId: existing.ownerId, owner: existing.owner, department: existing.department });
      return;
    }
    byOwner.set(key, {
      ...amounts,
      orderCount: 0,
      commissionCount: 0,
      formalOrderCount: 0,
      recoveryOrderCount: 0,
      formalOrderPaidAmount: 0,
      recoveryBusinessAmount: 0,
      statusCounts: { pendingHandling: 0, pendingConfirm: 0, pendingPay: 0, paid: 0, withdrawn: 0 },
      pendingConfirmAmount: 0,
      pendingPayAmount: 0,
      paidAmount: 0,
      withdrawnAmount: 0,
      totalAmount: 0,
      commissions: [],
    });
  });
  return [...byOwner.values()].sort((left, right) => (
    right.pendingPayAmount - left.pendingPayAmount || left.owner.localeCompare(right.owner, 'zh-CN')
  ));
}

export function createCommissionPayoutService(prisma: PayoutPrisma, options: CommissionPayoutServiceOptions = {}) {
  const now = options.now || (() => new Date());
  const createId = options.id || randomUUID;

  const listRecords = async (period?: string) => {
    const rows = await prisma.businessRecord.findMany({
      where: { domain: STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES },
      orderBy: [{ eventAt: 'desc' }, { createdAt: 'desc' }],
    });
    const records = rows
      .map((row) => normalizePayoutRecord(row.data))
      .filter((row): row is CommissionPayoutRecord => Boolean(row));
    return success(period ? records.filter((record) => record.period === period) : records);
  };

  const getPeriodWorkspace = async (period: string) => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return failure<CommissionPayoutWorkspace>('请选择正确的提成月份', 400);
    const [commissionRows, recoveryRows, orderRows, correctionRows, recordResult] = await Promise.all([
      prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.COMMISSIONS } }),
      prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.RECOVERY_ORDERS } }),
      prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.ORDERS } }),
      prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.COMMISSION_CORRECTIONS } }),
      listRecords(),
    ]);
    const recoveryOrders = recoveryRows.map((row) => asObject(row.data) as unknown as RecoveryOrder);
    const orders = orderRows.map((row) => asObject(row.data) as unknown as Order);
    const allCommissions = commissionRows.map((row) => {
      const commission = normalizeCommissionRound(row.data);
      return { ...commission, status: (String(row.status || commission.status) || commission.status) as Commission['status'] };
    });
    const commissionStatusById = new Map(allCommissions.map((commission) => [commission.id, commission.status]));
    const corrections = resolveCommissionCorrectionStatuses(
      correctionRows
        .map((row) => parseCorrectionRecord(row.data))
        .filter((row): row is CommissionCorrectionRecord => Boolean(row)),
      commissionStatusById,
    );
    const commissions = resolveTieredPayoutAmounts(applyRecoveryCommissionBusinessTimes(
      allCommissions,
      recoveryOrders,
    ))
      .filter((item) => periodOf(item) === period && INCLUDED_PERIOD_WORKSPACE_STATUSES.has(item.status));
    const payoutSnapshotByCommission = new Map<string, Commission>();
    (recordResult.data || []).forEach((record) => (record.commissionSnapshots || []).forEach((snapshot) => {
      if (!payoutSnapshotByCommission.has(snapshot.id)) payoutSnapshotByCommission.set(snapshot.id, snapshot);
    }));
    const ordersById = new Map(orders.map((order) => [order.id, order]));
    const recoveryOrdersById = new Map(recoveryOrders.map((order) => [order.id, order]));
    const displayCommissions = commissions.map((commission) => {
      const snapshot = commission.status === '已发放' ? payoutSnapshotByCommission.get(commission.id) : undefined;
      const businessAmount = isRecoveryCommission(commission)
        ? resolveRecoveryBusinessAmount(recoveryOrdersById.get(commission.sourceRecoveryOrderId || commission.orderId), commission)
        : resolveFormalOrderPaidAmount(ordersById.get(commission.orderId), commission);
      return {
        ...commission,
        orderAmount: businessAmount,
        commissionAmount: snapshot?.commissionAmount ?? commission.commissionAmount,
      };
    });
    const amountFor = (commission: Commission) => Number(
      (commission.status === '已发放' ? payoutSnapshotByCommission.get(commission.id)?.commissionAmount : undefined)
      ?? commission.commissionAmount
      ?? 0,
    );
    const employees = employeeRowsWithCorrectionMetrics(
      employeeRows(displayCommissions, orders, recoveryOrders, amountFor),
      corrections,
      period,
    );
    const businessMetrics = calculateCommissionBusinessMetrics(displayCommissions, orders, recoveryOrders);
    return success<CommissionPayoutWorkspace>({
      period,
      summary: {
        pendingEmployeeCount: employees.filter((row) => row.pendingPayAmount > 0).length,
        pendingPayAmount: roundMoney(employees.reduce((sum, row) => sum + row.pendingPayAmount, 0)),
        pendingConfirmAmount: roundMoney(employees.reduce((sum, row) => sum + row.pendingConfirmAmount, 0)),
        paidEmployeeCount: employees.filter((row) => row.paidAmount > 0).length,
        paidAmount: roundMoney(employees.reduce((sum, row) => sum + row.paidAmount, 0)),
        formalOrderPaidAmount: businessMetrics.formalOrderPaidAmount,
        recoveryBusinessAmount: businessMetrics.recoveryBusinessAmount,
        pendingHandlingCount: employees.reduce((sum, row) => sum + row.statusCounts.pendingHandling, 0),
        pendingConfirmCount: employees.reduce((sum, row) => sum + row.statusCounts.pendingConfirm, 0),
        pendingPayCount: employees.reduce((sum, row) => sum + row.statusCounts.pendingPay, 0),
        withdrawnAmount: roundMoney(employees.reduce((sum, row) => sum + row.withdrawnAmount, 0)),
        totalCommissionAmount: roundMoney(employees.reduce((sum, row) => sum + row.totalAmount, 0)),
        formalOrderCount: businessMetrics.formalOrderCount,
        recoveryOrderCount: businessMetrics.recoveryOrderCount,
        correctionOriginalPaidAmount: roundMoney(employees.reduce((sum, row) => sum + Number(row.correctionOriginalPaidAmount || 0), 0)),
        correctionEntitlementAmount: roundMoney(employees.reduce((sum, row) => sum + Number(row.correctionEntitlementAmount || 0), 0)),
        correctionSupplementAmount: roundMoney(employees.reduce((sum, row) => sum + Number(row.correctionSupplementAmount || 0), 0)),
        correctionRecoverAmount: roundMoney(employees.reduce((sum, row) => sum + Number(row.correctionRecoverAmount || 0), 0)),
        pendingCorrectionSupplementAmount: roundMoney(employees.reduce((sum, row) => sum + Number(row.pendingCorrectionSupplementAmount || 0), 0)),
        pendingCorrectionRecoverAmount: roundMoney(employees.reduce((sum, row) => sum + Number(row.pendingCorrectionRecoverAmount || 0), 0)),
      },
      employees,
      records: (recordResult.data || []).filter((record) => record.period === period),
    });
  };

  const getPendingWorkspace = async () => {
    const [commissionRows, recoveryRows] = await Promise.all([
      prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.COMMISSIONS } }),
      prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.RECOVERY_ORDERS } }),
    ]);
    const recoveryOrders = recoveryRows.map((row) => asObject(row.data) as unknown as RecoveryOrder);
    const commissions = resolveTieredPayoutAmounts(applyRecoveryCommissionBusinessTimes(
      commissionRows.map((row) => normalizeCommissionRound(row.data)),
      recoveryOrders,
    ))
      .filter((item) => item.status === '待确认' || item.status === '待发放');
    const employees = employeeRows(commissions);
    return success<CommissionPayoutWorkspace>({
      period: '全部',
      summary: {
        pendingEmployeeCount: employees.filter((row) => row.pendingPayAmount > 0).length,
        pendingPayAmount: roundMoney(employees.reduce((sum, row) => sum + row.pendingPayAmount, 0)),
        pendingConfirmAmount: roundMoney(employees.reduce((sum, row) => sum + row.pendingConfirmAmount, 0)),
        paidEmployeeCount: 0,
        paidAmount: 0,
        formalOrderPaidAmount: 0,
        recoveryBusinessAmount: 0,
        pendingHandlingCount: employees.reduce((sum, row) => sum + row.statusCounts.pendingHandling, 0),
        pendingConfirmCount: employees.reduce((sum, row) => sum + row.statusCounts.pendingConfirm, 0),
        pendingPayCount: employees.reduce((sum, row) => sum + row.statusCounts.pendingPay, 0),
        withdrawnAmount: 0,
        totalCommissionAmount: roundMoney(employees.reduce((sum, row) => sum + row.totalAmount, 0)),
        formalOrderCount: 0,
        recoveryOrderCount: 0,
      },
      employees,
      records: [],
    });
  };

  const getRecordsWorkspace = async () => {
    const recordResult = await listRecords();
    return success<CommissionPayoutWorkspace>({
      period: '全部',
      summary: {
        pendingEmployeeCount: 0,
        pendingPayAmount: 0,
        pendingConfirmAmount: 0,
        paidEmployeeCount: 0,
        paidAmount: 0,
        formalOrderPaidAmount: 0,
        recoveryBusinessAmount: 0,
        pendingHandlingCount: 0,
        pendingConfirmCount: 0,
        pendingPayCount: 0,
        withdrawnAmount: 0,
        totalCommissionAmount: 0,
        formalOrderCount: 0,
        recoveryOrderCount: 0,
      },
      employees: [],
      records: recordResult.data || [],
    });
  };

  const issue = async (input: IssueCommissionPayoutInput, actor: AuthenticatedUser) => {
    const requestedOwnerIds = [...new Set((input.ownerIds || []).map(String).filter(Boolean))];
    if (requestedOwnerIds.length === 0) return failure<CommissionPayoutRecord>('请至少选择一名待发放员工', 400);
    if (!input.issuedAt || Number.isNaN(new Date(input.issuedAt).getTime())) return failure<CommissionPayoutRecord>('请填写发放时间', 400);
    if (!String(input.paymentMethod || '').trim()) return failure<CommissionPayoutRecord>('请选择发放方式', 400);
    const issuedAt = new Date(input.issuedAt).toISOString();
    const period = issuedAt.slice(0, 7);

    return prisma.$transaction(async (tx) => {
      await lockCommissionLedger(tx);
      await lockCommissionRows(tx);
      const [rows, recoveryRows] = await Promise.all([
        tx.businessRecord.findMany({
          where: { domain: STORAGE_KEYS.COMMISSIONS },
          orderBy: [{ eventAt: 'asc' }, { createdAt: 'asc' }],
        }),
        tx.businessRecord.findMany({ where: { domain: STORAGE_KEYS.RECOVERY_ORDERS } }),
      ]);
      const requested = new Set(requestedOwnerIds);
      const recoveryOrders = recoveryRows.map((row) => asObject(row.data) as unknown as RecoveryOrder);
      const eligible = resolveTieredPayoutAmounts(applyRecoveryCommissionBusinessTimes(
        rows.map((row) => normalizeCommissionRound(row.data)),
        recoveryOrders,
      ))
        .filter((item) => item.status === '待发放' && requested.has(ownerKey(item)));
      const foundOwners = new Set(eligible.map(ownerKey));
      if (requestedOwnerIds.some((id) => !foundOwners.has(id))) {
        return failure<CommissionPayoutRecord>('部分员工的待发放金额已经变化，请刷新后重试', 409);
      }

      const id = createId();
      const changedAt = now();
      const commissionSnapshots = eligible.map((commission) => ({
        ...commission,
        status: '已发放' as const,
        batchId: id,
        payoutRecordId: id,
        paidAt: issuedAt,
        updatedAt: changedAt.toISOString(),
      } as Commission & { payoutRecordId: string }));
      const snapshots = employeeRows(eligible).map((row) => ({
        ownerId: row.ownerId,
        owner: row.owner,
        departmentId: row.departmentId,
        department: row.department,
        count: row.commissionCount,
        amount: row.pendingPayAmount,
      }));
      const payout: CommissionPayoutRecord = {
        id,
        payoutNo: payoutNo(period, id),
        period,
        status: '已发放',
        totalCount: eligible.length,
        totalAmount: roundMoney(eligible.reduce((sum, item) => sum + Number(item.commissionAmount || 0), 0)),
        commissionIds: eligible.map((item) => item.id),
        commissionSnapshots,
        byOwner: snapshots,
        createdAt: changedAt.toISOString(),
        createdById: actor.id,
        createdByName: actor.name,
        issuedAt,
        issuedById: actor.id,
        issuedByName: actor.name,
        paymentMethod: String(input.paymentMethod).trim(),
        paymentReference: String(input.paymentReference || '').trim() || undefined,
        note: String(input.note || '').trim() || undefined,
      };

      for (const paid of commissionSnapshots) {
        await tx.businessRecord.update({
          where: { domain_recordId: { domain: STORAGE_KEYS.COMMISSIONS, recordId: paid.id } },
          data: commissionRecordUpdate(paid, changedAt),
        });
      }
      await syncRecoverySettlementStatuses(tx, recoveryIdsFor(eligible), changedAt, actor, input.note);
      await tx.businessRecord.create({
        data: {
          id: `${STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES}:${id}`,
          domain: STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES,
          recordId: id,
          ...payoutRecordUpdate(payout, changedAt),
          createdAt: changedAt,
        },
      });
      if (options.recordFinanceTransaction) await options.recordFinanceTransaction(tx, payout);
      return success(payout, `已向${snapshots.length}名员工发放提成`);
    });
  };

  const reverse = async (id: string, reason: string, actor: AuthenticatedUser) => {
    if (!canReversePayout(actor)) return failure<CommissionPayoutRecord>('只有超级管理员或财务负责人可以撤销发放', 403);
    if (!String(reason || '').trim()) return failure<CommissionPayoutRecord>('请填写撤销原因', 400);
    void id;
    return failure<CommissionPayoutRecord>('本版不支持撤销发放，请线下处理', 409);
  };

  return { getPendingWorkspace, getRecordsWorkspace, getPeriodWorkspace, listRecords, issue, reverse };
}
