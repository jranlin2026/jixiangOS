import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { failure, success } from '../api/response';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { isSuperAdmin } from '../../src/shared/utils/permissions';
import type { AuthenticatedUser } from '../../src/types/auth';
import type {
  Commission,
  CommissionPayoutEmployeeRow,
  CommissionPayoutRecord,
  CommissionPayoutWorkspace,
  IssueCommissionPayoutInput,
} from '../../src/types/commission';
import type { RecoveryOrder } from '../../src/types/recoveryOrder';

type PayoutPrisma = Pick<PrismaClient, 'businessRecord' | '$transaction'>;
type PayoutTransaction = Prisma.TransactionClient;

export interface CommissionPayoutServiceOptions {
  now?: () => Date;
  id?: () => string;
  recordFinanceTransaction?: (transaction: PayoutTransaction, payout: CommissionPayoutRecord) => Promise<unknown>;
}

const FINAL_COMMISSION_STATUSES = new Set<Commission['status']>(['已发放', '已取消', '已撤回', '已冲销']);
const INCLUDED_WORKSPACE_STATUSES = new Set<Commission['status']>(['待确认', '待发放', '已发放']);

const asObject = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const periodOf = (commission: Commission) => String(commission.paymentDate || commission.createdAt || '').slice(0, 7);
const ownerKey = (commission: Commission) => commission.ownerId || `name:${commission.owner}`;
const recordData = (value: Commission | CommissionPayoutRecord | RecoveryOrder) => value as unknown as Prisma.InputJsonValue;

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
    const [recoveryRow, relatedRows] = await Promise.all([
      tx.businessRecord.findUnique({
        where: { domain_recordId: { domain: STORAGE_KEYS.RECOVERY_ORDERS, recordId: recoveryId } },
      }),
      tx.businessRecord.findMany({ where: { domain: STORAGE_KEYS.COMMISSIONS, orderId: recoveryId } }),
    ]);
    if (!recoveryRow) continue;
    const related = relatedRows.map((row) => asObject(row.data) as unknown as Commission);
    const active = related.filter((item) => !['已取消', '已撤回', '已冲销'].includes(item.status));
    const settlementStatus = active.some((item) => item.status === '待确认')
      ? '待确认'
      : active.some((item) => item.status === '待发放')
        ? '待发放'
        : active.length > 0 && active.every((item) => FINAL_COMMISSION_STATUSES.has(item.status))
          ? '已发放'
          : '待处理';
    const recovery = asObject(recoveryRow.data) as unknown as RecoveryOrder;
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

function employeeRows(commissions: Commission[]): CommissionPayoutEmployeeRow[] {
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
      pendingConfirmAmount: 0,
      pendingPayAmount: 0,
      paidAmount: 0,
      totalAmount: 0,
      commissions: [],
      orderIds: new Set<string>(),
    };
    row.commissionCount += 1;
    row.orderIds.add(commission.orderId);
    row.commissions.push(commission);
    const amount = Number(commission.commissionAmount || 0);
    if (commission.status === '待确认') row.pendingConfirmAmount = roundMoney(row.pendingConfirmAmount + amount);
    if (commission.status === '待发放') row.pendingPayAmount = roundMoney(row.pendingPayAmount + amount);
    if (commission.status === '已发放') row.paidAmount = roundMoney(row.paidAmount + amount);
    row.totalAmount = roundMoney(row.totalAmount + amount);
    grouped.set(key, row);
  });
  return [...grouped.values()].map(({ orderIds, ...row }) => ({ ...row, orderCount: orderIds.size }))
    .sort((left, right) => right.pendingPayAmount - left.pendingPayAmount || left.owner.localeCompare(right.owner, 'zh-CN'));
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
    const [commissionRows, recordResult] = await Promise.all([
      prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.COMMISSIONS } }),
      listRecords(period),
    ]);
    const commissions = commissionRows
      .map((row) => asObject(row.data) as unknown as Commission)
      .filter((item) => periodOf(item) === period && INCLUDED_WORKSPACE_STATUSES.has(item.status));
    const employees = employeeRows(commissions);
    return success<CommissionPayoutWorkspace>({
      period,
      summary: {
        pendingEmployeeCount: employees.filter((row) => row.pendingPayAmount > 0).length,
        pendingPayAmount: roundMoney(employees.reduce((sum, row) => sum + row.pendingPayAmount, 0)),
        pendingConfirmAmount: roundMoney(employees.reduce((sum, row) => sum + row.pendingConfirmAmount, 0)),
        paidEmployeeCount: employees.filter((row) => row.paidAmount > 0).length,
        paidAmount: roundMoney(employees.reduce((sum, row) => sum + row.paidAmount, 0)),
      },
      employees,
      records: recordResult.data || [],
    });
  };

  const getPendingWorkspace = async () => {
    const commissionRows = await prisma.businessRecord.findMany({
      where: { domain: STORAGE_KEYS.COMMISSIONS, status: { in: ['待确认', '待发放'] } },
    });
    const commissions = commissionRows
      .map((row) => asObject(row.data) as unknown as Commission)
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
      await lockCommissionRows(tx);
      const rows = await tx.businessRecord.findMany({
        where: { domain: STORAGE_KEYS.COMMISSIONS, status: '待发放' },
        orderBy: [{ eventAt: 'asc' }, { createdAt: 'asc' }],
      });
      const requested = new Set(requestedOwnerIds);
      const eligible = rows
        .map((row) => asObject(row.data) as unknown as Commission)
        .filter((item) => requested.has(ownerKey(item)));
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
    return prisma.$transaction(async (tx) => {
      await lockCommissionRows(tx);
      const row = await tx.businessRecord.findUnique({
        where: { domain_recordId: { domain: STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES, recordId: id } },
      });
      const payout = normalizePayoutRecord(row?.data);
      if (!payout) return failure<CommissionPayoutRecord>('发放记录不存在', 404);
      if (payout.status === '已撤销') return failure<CommissionPayoutRecord>('该发放记录已经撤销', 409);
      const rows = await tx.businessRecord.findMany({
        where: { domain: STORAGE_KEYS.COMMISSIONS, recordId: { in: payout.commissionIds } },
      });
      const commissions = rows.map((item) => asObject(item.data) as unknown as Commission);
      if (commissions.length !== payout.commissionIds.length) return failure<CommissionPayoutRecord>('发放记录中的提成明细已不完整', 409);

      for (const commission of commissions) {
        if (commission.status !== '已发放' || commission.batchId !== id) {
          return failure<CommissionPayoutRecord>('发放记录中的提成状态已变化，不能直接撤销', 409);
        }
      }
      for (const commission of commissions) {
        const restored = { ...commission, status: '待发放' as const, updatedAt: now().toISOString() } as Commission & Record<string, unknown>;
        delete restored.batchId;
        delete restored.paidAt;
        delete restored.payoutRecordId;
        await tx.businessRecord.update({
          where: { domain_recordId: { domain: STORAGE_KEYS.COMMISSIONS, recordId: commission.id } },
          data: commissionRecordUpdate(restored as Commission, now()),
        });
      }
      await syncRecoverySettlementStatuses(tx, recoveryIdsFor(commissions), now(), actor, reason);
      const reversed: CommissionPayoutRecord = {
        ...payout,
        status: '已撤销',
        reversedAt: now().toISOString(),
        reversedById: actor.id,
        reversedByName: actor.name,
        reverseReason: String(reason).trim(),
      };
      await tx.businessRecord.update({
        where: { domain_recordId: { domain: STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES, recordId: id } },
        data: payoutRecordUpdate(reversed, now()),
      });
      return success(reversed, '发放已撤销，相关提成已恢复为待发放');
    });
  };

  return { getPendingWorkspace, getRecordsWorkspace, getPeriodWorkspace, listRecords, issue, reverse };
}
