import assert from 'node:assert/strict';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { Commission } from '../../src/types/commission';
import { createCommissionPayoutService } from './commissionPayoutService';

const NOW = '2026-07-26T10:00:00.000Z';
const finance: AuthenticatedUser = {
  id: 'finance-1',
  name: '财务A',
  account: 'finance',
  email: 'finance@example.com',
  phone: '',
  role: '财务专员',
  roleId: 'finance-role',
  departmentId: 'finance-dept',
  isActive: true,
  permissions: [],
};
const financeManager: AuthenticatedUser = { ...finance, id: 'finance-manager', name: '财务经理', role: '财务经理' };
const superAdmin: AuthenticatedUser = { ...finance, id: 'admin-1', name: '系统管理员', role: '超级管理员' };

const commission = (
  id: string,
  status: Commission['status'],
  overrides: Partial<Commission> = {},
): Commission => ({
  id,
  orderId: 'order-1',
  orderNo: 'ORD-1',
  customerName: '测试客户',
  productLevel: '899',
  orderAmount: 899,
  commissionRate: 0.1,
  commissionAmount: 89.9,
  role: '销售',
  owner: '销售A',
  ownerId: 'sales-1',
  department: '销售部',
  departmentId: 'sales-dept',
  paymentDate: '2026-07-15T08:00:00.000Z',
  status,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const key = (domain: string, recordId: string) => `${domain}\u0000${recordId}`;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function record(domain: string, data: Record<string, unknown>) {
  const recordId = String(data.id);
  return {
    id: key(domain, recordId),
    domain,
    recordId,
    title: String(data.batchNo || data.orderNo || recordId),
    status: String(data.status || ''),
    owner: String(data.owner || data.createdByName || ''),
    customerId: null,
    orderId: data.orderId ? String(data.orderId) : null,
    amount: Number(data.totalAmount ?? data.commissionAmount ?? 0),
    eventAt: data.paymentDate || data.createdAt ? new Date(String(data.paymentDate || data.createdAt)) : null,
    data: clone(data),
    createdAt: new Date(String(data.createdAt || NOW)),
    updatedAt: new Date(String(data.updatedAt || data.createdAt || NOW)),
  };
}

function matches(row: any, where: any): boolean {
  if (!where) return true;
  if (where.domain !== undefined && row.domain !== where.domain) return false;
  if (where.recordId !== undefined) {
    if (typeof where.recordId === 'string' && row.recordId !== where.recordId) return false;
    if (where.recordId.in && !where.recordId.in.includes(row.recordId)) return false;
  }
  if (where.status !== undefined) {
    if (typeof where.status === 'string' && row.status !== where.status) return false;
    if (where.status.in && !where.status.in.includes(row.status)) return false;
  }
  return true;
}

function fakePrisma(seed: any[]) {
  const rows = new Map(seed.map((row) => [key(row.domain, row.recordId), clone(row)]));
  const businessRecord = {
    findMany: async ({ where }: any = {}) => [...rows.values()].filter((row) => matches(row, where)).map(clone),
    findUnique: async ({ where }: any) => {
      const id = where.domain_recordId
        ? key(where.domain_recordId.domain, where.domain_recordId.recordId)
        : String(where.id);
      return clone(rows.get(id) || null);
    },
    create: async ({ data }: any) => {
      const id = data.id || key(data.domain, data.recordId);
      if (rows.has(id)) throw new Error('duplicate');
      const value = { ...clone(data), id, createdAt: data.createdAt || new Date(NOW), updatedAt: data.updatedAt || new Date(NOW) };
      rows.set(key(data.domain, data.recordId), value);
      return clone(value);
    },
    update: async ({ where, data }: any) => {
      const id = where.domain_recordId
        ? key(where.domain_recordId.domain, where.domain_recordId.recordId)
        : String(where.id);
      const current = rows.get(id);
      if (!current) throw new Error('not found');
      const value = { ...current, ...clone(data), updatedAt: new Date(NOW) };
      rows.set(id, value);
      return clone(value);
    },
  };
  const prisma: any = {
    businessRecord,
    $transaction: async (callback: (tx: any) => Promise<unknown>) => {
      const snapshot = new Map([...rows.entries()].map(([id, value]) => [id, clone(value)]));
      try {
        return await callback({ businessRecord });
      } catch (error) {
        rows.clear();
        snapshot.forEach((value, id) => rows.set(id, value));
        throw error;
      }
    },
  };
  return { prisma, rows };
}

{
  const pending = commission('commission-atomic', '待发放');
  const db = fakePrisma([record(STORAGE_KEYS.COMMISSIONS, pending as unknown as Record<string, unknown>)]);
  const service = createCommissionPayoutService(db.prisma, {
    now: () => new Date(NOW), id: () => 'payout-atomic',
    recordFinanceTransaction: async () => { throw new Error('ledger write failed'); },
  });
  await assert.rejects(
    () => service.issue({ ownerIds: [pending.ownerId!], issuedAt: NOW, paymentMethod: '银行转账' }, finance),
    /ledger write failed/,
  );
  assert.equal((db.rows.get(key(STORAGE_KEYS.COMMISSIONS, pending.id))?.data as Commission).status, '待发放');
  assert.equal(db.rows.has(key(STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES, 'payout-atomic')), false, '流水写入失败时发放单和提成状态必须一起回滚');
}

{
  const db = fakePrisma([
    record(STORAGE_KEYS.COMMISSIONS, commission('pending-a', '待发放') as unknown as Record<string, unknown>),
    record(STORAGE_KEYS.COMMISSIONS, commission('review-a', '待确认') as unknown as Record<string, unknown>),
    record(STORAGE_KEYS.COMMISSIONS, commission('pending-b', '待发放', {
      ownerId: 'sales-2', owner: '销售B', commissionAmount: 200,
    }) as unknown as Record<string, unknown>),
    record(STORAGE_KEYS.COMMISSIONS, commission('pending-prior-month', '待发放', {
      paymentDate: '2026-06-20T08:00:00.000Z', commissionAmount: 50,
    }) as unknown as Record<string, unknown>),
    record(STORAGE_KEYS.COMMISSIONS, commission('paid-history', '已发放', {
      paymentDate: '2026-05-20T08:00:00.000Z', commissionAmount: 999,
    }) as unknown as Record<string, unknown>),
  ]);
  const service = createCommissionPayoutService(db.prisma, { now: () => new Date(NOW), id: () => 'payout-1' });
  const workspace = await service.getPendingWorkspace();
  assert.equal(workspace.code, 0);
  assert.equal(workspace.data?.summary.pendingEmployeeCount, 2);
  assert.equal(workspace.data?.summary.pendingPayAmount, 339.9, '待发放池必须跨月汇总');
  assert.equal(workspace.data?.summary.pendingConfirmAmount, 89.9);
  assert.equal(workspace.data?.employees.find((row) => row.ownerId === 'sales-1')?.pendingPayAmount, 139.9);
  assert.equal(workspace.data?.employees.find((row) => row.ownerId === 'sales-1')?.commissions[0]?.settlementVersion, 1, '旧提成明细未标记轮次时按第一轮读取');
  assert.equal(workspace.data?.summary.paidAmount, 0, '已发放历史不能混入待办池');
}

{
  const pendingA = commission('commission-a', '待发放');
  const pendingPriorMonth = commission('commission-prior-month', '待发放', {
    paymentDate: '2026-06-10T08:00:00.000Z', commissionAmount: 50,
  });
  const pendingB = commission('commission-b', '待发放', { ownerId: 'sales-2', owner: '销售B', commissionAmount: 200 });
  const db = fakePrisma([
    record(STORAGE_KEYS.COMMISSIONS, pendingA as unknown as Record<string, unknown>),
    record(STORAGE_KEYS.COMMISSIONS, pendingPriorMonth as unknown as Record<string, unknown>),
    record(STORAGE_KEYS.COMMISSIONS, pendingB as unknown as Record<string, unknown>),
  ]);
  let recordedFinancePayout: string | undefined;
  const service = createCommissionPayoutService(db.prisma, {
    now: () => new Date(NOW), id: () => 'payout-2',
    recordFinanceTransaction: async (_transaction, payout) => { recordedFinancePayout = payout.id; },
  });
  const result = await service.issue({
    ownerIds: ['sales-1'], issuedAt: NOW,
    paymentMethod: '银行转账', paymentReference: 'BANK-001',
  }, finance);
  assert.equal(result.code, 0, result.message);
  assert.equal(result.data?.status, '已发放');
  assert.equal(result.data?.period, '2026-07', '发放记录按实际发放时间归月');
  assert.equal(result.data?.totalAmount, 139.9, '发放员工时必须包含其跨月待发放提成');
  assert.equal(recordedFinancePayout, 'payout-2', '提成发放必须在同一事务中写入资金流水');
  assert.deepEqual(
    (result.data as any)?.commissionSnapshots?.map((item: Commission) => ({
      id: item.id,
      orderNo: item.orderNo,
      ownerId: item.ownerId,
      status: item.status,
      amount: item.commissionAmount,
    })),
    [
      { id: 'commission-a', orderNo: 'ORD-1', ownerId: 'sales-1', status: '已发放', amount: 89.9 },
      { id: 'commission-prior-month', orderNo: 'ORD-1', ownerId: 'sales-1', status: '已发放', amount: 50 },
    ],
    '发放记录必须保存发放时的逐笔提成快照，不能依赖后续可变的提成记录',
  );
  assert.equal((db.rows.get(key(STORAGE_KEYS.COMMISSIONS, 'commission-a'))?.data as Commission).status, '已发放');
  assert.equal((db.rows.get(key(STORAGE_KEYS.COMMISSIONS, 'commission-prior-month'))?.data as Commission).status, '已发放');
  assert.equal((db.rows.get(key(STORAGE_KEYS.COMMISSIONS, 'commission-b'))?.data as Commission).status, '待发放');
}

{
  const payoutRecord = (id: string, period: string) => ({
    id,
    payoutNo: `FF-${period.replace('-', '')}-${id}`,
    period,
    status: '已发放',
    totalCount: 1,
    totalAmount: 89.9,
    commissionIds: [`commission-${id}`],
    byOwner: [{ ownerId: 'sales-1', owner: '销售A', department: '销售部', count: 1, amount: 89.9 }],
    issuedAt: `${period}-26T08:00:00.000Z`,
    issuedById: finance.id,
    issuedByName: finance.name,
    paymentMethod: '银行转账',
    createdAt: `${period}-26T08:00:00.000Z`,
  });
  const db = fakePrisma([
    record(STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES, payoutRecord('june', '2026-06')),
    record(STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES, payoutRecord('july', '2026-07')),
  ]);
  const service = createCommissionPayoutService(db.prisma, { now: () => new Date(NOW) });
  const allRecords = await service.getRecordsWorkspace();
  assert.equal(allRecords.code, 0);
  assert.equal(allRecords.data?.period, '全部');
  assert.equal(allRecords.data?.records.length, 2, '发放记录必须跨月展示全部历史');
  assert.deepEqual(new Set(allRecords.data?.records.map((item) => item.period)), new Set(['2026-06', '2026-07']));
}

{
  const paid = commission('commission-recovery', '已发放', {
    orderId: 'recovery-1', orderNo: 'RCV-1', batchId: 'legacy-payout', paidAt: NOW,
  });
  const legacyPayout = {
    id: 'legacy-payout', batchNo: 'TCFF-202606-691189', period: '2026-07', status: '已付款',
    totalCount: 1, totalAmount: 89.9, commissionIds: [paid.id],
    byOwner: [{ ownerId: paid.ownerId, owner: paid.owner, department: paid.department, count: 1, amount: 89.9 }],
    createdAt: NOW, createdById: superAdmin.id, createdByName: superAdmin.name,
    paidAt: NOW, paidById: superAdmin.id, paidByName: superAdmin.name, paymentMethod: '银行转账',
  };
  const recovery = {
    id: 'recovery-1', recoveryNo: 'RCV-1', status: '审核通过', settlementStatus: '已发放',
    commissionIds: [paid.id], recoveryUserName: paid.owner, recoveryAmount: 899,
    createdAt: NOW, updatedAt: NOW,
  };
  const db = fakePrisma([
    record(STORAGE_KEYS.COMMISSIONS, paid as unknown as Record<string, unknown>),
    record(STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES, legacyPayout),
    record(STORAGE_KEYS.RECOVERY_ORDERS, recovery),
  ]);
  const service = createCommissionPayoutService(db.prisma, { now: () => new Date(NOW) });
  assert.equal((await service.reverse('legacy-payout', '测试误操作', finance)).code, 403, '普通财务不能撤销发放');
  const reversed = await service.reverse('legacy-payout', '测试误操作', financeManager);
  assert.equal(reversed.code, 409, reversed.message);
  assert.match(reversed.message, /线下处理/);
  assert.equal((db.rows.get(key(STORAGE_KEYS.COMMISSIONS, paid.id))?.data as Commission).status, '已发放');
  assert.equal((db.rows.get(key(STORAGE_KEYS.RECOVERY_ORDERS, recovery.id))?.data as any).settlementStatus, '已发放');
}

{
  const recoveryId = 'recovery-payout-history';
  const pending = commission('commission-recovery-payout-history', '待发放', {
    orderId: recoveryId,
    orderNo: 'RCV-PAYOUT-HISTORY',
    sourceRecoveryOrderId: recoveryId,
    sourceBusinessType: 'after_sales_recovery',
  });
  const recovery = {
    id: recoveryId,
    recoveryNo: 'RCV-PAYOUT-HISTORY',
    status: '已分账',
    settlementStatus: '待发放',
    commissionIds: [pending.id],
    recoveryUserName: pending.owner,
    recoveryAmount: 899,
    createdAt: NOW,
    updatedAt: NOW,
  };
  const db = fakePrisma([
    record(STORAGE_KEYS.COMMISSIONS, pending as unknown as Record<string, unknown>),
    record(STORAGE_KEYS.RECOVERY_ORDERS, recovery),
  ]);
  const service = createCommissionPayoutService(db.prisma, { now: () => new Date(NOW), id: () => 'payout-recovery-history' });
  const issued = await service.issue({ ownerIds: [pending.ownerId!], issuedAt: NOW, paymentMethod: '银行转账' }, finance);
  assert.equal(issued.code, 0, issued.message);
  const updated = db.rows.get(key(STORAGE_KEYS.RECOVERY_ORDERS, recoveryId))?.data as any;
  assert.equal(updated.settlementStatus, '已发放');
  assert.equal(updated.settlementPaidAt, NOW);
  assert.equal(updated.changeHistory?.[0]?.action, 'settlement');
  assert.match(updated.changeHistory?.[0]?.summary || '', /已发放/);
}

console.log('commission payout service tests passed');
