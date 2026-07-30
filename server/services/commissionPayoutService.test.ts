import assert from 'node:assert/strict';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { Commission, CommissionCorrectionRecord } from '../../src/types/commission';
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
  if (where.orderId !== undefined && row.orderId !== where.orderId) return false;
  if (where.recordId !== undefined) {
    if (typeof where.recordId === 'string' && row.recordId !== where.recordId) return false;
    if (where.recordId.in && !where.recordId.in.includes(row.recordId)) return false;
  }
  if (where.status !== undefined) {
    if (typeof where.status === 'string' && row.status !== where.status) return false;
    if (where.status.in && !where.status.in.includes(row.status)) return false;
  }
  if (where.data?.path) {
    const field = String(where.data.path).replace(/^\$\./, '');
    if (row.data?.[field] !== where.data.equals) return false;
  }
  if (where.OR && !where.OR.some((condition: any) => matches(row, condition))) return false;
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
        return await callback({
          businessRecord,
          $queryRaw: async (query: { values?: unknown[] }) => {
            const values = Array.isArray(query?.values) ? query.values : [];
            if (values[0] !== STORAGE_KEYS.RECOVERY_ORDERS) return [];
            const row = rows.get(key(String(values[0]), String(values[1])));
            return row ? [clone(row)] : [];
          },
        });
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
    record(STORAGE_KEYS.COMMISSIONS, commission('review-a', '待确认', {
      payoutPlanId: 'plan-review-a',
    }) as unknown as Record<string, unknown>),
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
  const tiers = [
    { minAmount: 0, maxAmount: 30_000, rate: 8 },
    { minAmount: 30_000, maxAmount: 50_000, rate: 10 },
    { minAmount: 50_000, rate: 15 },
  ];
  const tiered = (id: string, orderId: string, performanceAmount: number) => commission(id, '待发放', {
    orderId,
    orderNo: `ORD-${orderId}`,
    paymentDate: '2026-06-20T08:00:00.000Z',
    performanceAmount,
    orderAmount: performanceAmount,
    commissionAmount: 0,
    commissionRate: 0,
    ruleCalculationType: 'tiered_percentage',
    payoutPlanId: 'tier-plan',
    payoutPlanName: '销售月度阶梯',
    payoutPlanVersion: 1,
    payoutPlanSnapshot: {
      id: 'tier-plan', name: '销售月度阶梯', commissionType: 'tiered_percentage',
      commissionValue: 0, version: 1, tiers,
    },
  });
  const db = fakePrisma([
    record(STORAGE_KEYS.COMMISSIONS, tiered('tier-payout-a', 'tier-a', 10_000) as unknown as Record<string, unknown>),
    record(STORAGE_KEYS.COMMISSIONS, tiered('tier-payout-b', 'tier-b', 20_000) as unknown as Record<string, unknown>),
  ]);
  const service = createCommissionPayoutService(db.prisma, { now: () => new Date(NOW), id: () => 'tier-payout' });
  const workspace = await service.getPendingWorkspace();
  const employee = workspace.data?.employees.find((row) => row.ownerId === 'sales-1');
  assert.equal(employee?.pendingPayAmount, 3_000, '待办提成必须按当月累计业绩重算阶梯金额，不能展示为 0');
  assert.deepEqual(employee?.commissions.map((item) => item.commissionAmount), [1_000, 2_000]);
  const issued = await service.issue({ ownerIds: ['sales-1'], issuedAt: NOW, paymentMethod: '银行转账' }, finance);
  assert.equal(issued.code, 0, issued.message);
  assert.equal(issued.data?.totalAmount, 3_000, '发放时必须使用已重算的月度阶梯金额');
  assert.equal((db.rows.get(key(STORAGE_KEYS.COMMISSIONS, 'tier-payout-a'))?.data as Commission).commissionAmount, 1_000);
  assert.equal((db.rows.get(key(STORAGE_KEYS.COMMISSIONS, 'tier-payout-b'))?.data as Commission).commissionAmount, 2_000);
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

{
  const recoveryId = 'recovery-json-linked-sibling';
  const issuedCommission = commission('recovery-issued-member', '待发放', {
    orderId: recoveryId,
    orderNo: 'RCV-JSON-LINKED',
    sourceRecoveryOrderId: recoveryId,
    sourceBusinessType: 'after_sales_recovery',
  });
  const siblingCommission = commission('recovery-json-only-sibling', '待发放', {
    orderId: recoveryId,
    orderNo: 'RCV-JSON-LINKED',
    ownerId: 'sales-2',
    owner: '销售B',
    sourceRecoveryOrderId: recoveryId,
    sourceBusinessType: 'after_sales_recovery',
  });
  const siblingRecord = record(STORAGE_KEYS.COMMISSIONS, siblingCommission as unknown as Record<string, unknown>);
  siblingRecord.orderId = null;
  const recovery = {
    id: recoveryId,
    recoveryNo: 'RCV-JSON-LINKED',
    status: '已分账',
    settlementStatus: '待发放',
    commissionIds: [issuedCommission.id, siblingCommission.id],
    recoveryUserName: issuedCommission.owner,
    recoveryAmount: 1_798,
    createdAt: NOW,
    updatedAt: NOW,
  };
  const db = fakePrisma([
    record(STORAGE_KEYS.COMMISSIONS, issuedCommission as unknown as Record<string, unknown>),
    siblingRecord,
    record(STORAGE_KEYS.RECOVERY_ORDERS, recovery),
  ]);
  const service = createCommissionPayoutService(db.prisma, { now: () => new Date(NOW), id: () => 'payout-json-linked' });
  const issued = await service.issue({ ownerIds: [issuedCommission.ownerId!], issuedAt: NOW, paymentMethod: '银行转账' }, finance);
  assert.equal(issued.code, 0, issued.message);
  assert.equal(
    (db.rows.get(key(STORAGE_KEYS.RECOVERY_ORDERS, recoveryId))?.data as any).settlementStatus,
    '待发放',
    '同一挽回单仍有仅 JSON 关联的待发放提成时，源单不能误标为已发放',
  );
}

{
  const historical = commission('formal-history-v1', '已撤回', {
    orderId: 'formal-round', orderNo: 'ORD-FORMAL-ROUND', settlementVersion: 1, commissionAmount: 100,
  });
  const current = commission('formal-current-v2', '待发放', {
    orderId: 'formal-round', orderNo: 'ORD-FORMAL-ROUND', settlementVersion: 2, commissionAmount: 60,
  });
  const db = fakePrisma([
    record(STORAGE_KEYS.COMMISSIONS, historical as unknown as Record<string, unknown>),
    record(STORAGE_KEYS.COMMISSIONS, current as unknown as Record<string, unknown>),
  ]);
  const service = createCommissionPayoutService(db.prisma, { now: () => new Date(NOW) });
  const workspace = await service.getPeriodWorkspace('2026-07');
  assert.deepEqual(
    workspace.data?.employees.flatMap((employee) => employee.commissions.map((item) => item.id)),
    ['formal-current-v2'],
    '服务端发放工作台不得返回正式订单历史撤回轮次',
  );
}

{
  const recoveryId = 'recovery-created-after-business-month';
  const historicalDateCommission = commission('recovery-wrong-created-month', '待发放', {
    orderId: recoveryId,
    orderNo: 'RCV-20260725-BUSINESS-JUNE',
    sourceRecoveryOrderId: recoveryId,
    sourceBusinessType: 'after_sales_recovery',
    paymentDate: '2026-07-25T12:36:40.000Z',
    createdAt: '2026-07-25T12:36:40.000Z',
    updatedAt: '2026-07-25T12:49:00.000Z',
  });
  const recovery = {
    id: recoveryId,
    recoveryNo: historicalDateCommission.orderNo,
    recoveryAt: '2026-06-15T08:00:00.000Z',
    recoveryAmount: historicalDateCommission.orderAmount,
    commissionIds: [historicalDateCommission.id],
    createdAt: historicalDateCommission.createdAt,
    updatedAt: historicalDateCommission.updatedAt,
  };
  const db = fakePrisma([
    record(STORAGE_KEYS.COMMISSIONS, historicalDateCommission as unknown as Record<string, unknown>),
    record(STORAGE_KEYS.RECOVERY_ORDERS, recovery),
  ]);
  const service = createCommissionPayoutService(db.prisma, { now: () => new Date(NOW) });
  const july = await service.getPeriodWorkspace('2026-07');
  const june = await service.getPeriodWorkspace('2026-06');
  assert.equal(july.data?.employees.length, 0, '售后挽回不得按分账创建月份归入月报');
  assert.deepEqual(
    june.data?.employees.flatMap((employee) => employee.commissions.map((item) => item.paymentDate)),
    ['2026-06-15T08:00:00.000Z'],
    '售后挽回必须按关联挽回单的成交时间归月',
  );
  assert.equal(june.data?.employees[0]?.recoveryBusinessAmount, 899, '售后员工必须显示关联挽回成交额');
  assert.equal(june.data?.employees[0]?.recoveryOrderCount, 1);
  assert.equal(june.data?.employees[0]?.formalOrderCount, 0);
  assert.equal(june.data?.summary.recoveryBusinessAmount, 899, '顶部售后挽回成交额必须按挽回单全局去重');
}

{
  const fixedCommission = commission('fixed-formal-business-amount', '待发放', {
    orderId: 'fixed-formal-order',
    orderNo: 'ORD-FIXED-BUSINESS-AMOUNT',
    ruleCalculationType: 'fixed',
    commissionAmount: 50,
    orderAmount: 899,
    performanceAmount: 899,
    sourceBusinessType: 'formal_order',
  });
  const formalOrder = {
    id: 'fixed-formal-order',
    orderNo: fixedCommission.orderNo,
    actualAmount: 899,
    payments: [{ id: 'payment-fixed', amount: 899, paidAt: fixedCommission.paymentDate }],
    createdAt: fixedCommission.paymentDate,
    updatedAt: fixedCommission.paymentDate,
  };
  const db = fakePrisma([
    record(STORAGE_KEYS.COMMISSIONS, fixedCommission as unknown as Record<string, unknown>),
    record(STORAGE_KEYS.ORDERS, formalOrder),
  ]);
  const service = createCommissionPayoutService(db.prisma, { now: () => new Date(NOW) });
  const workspace = await service.getPeriodWorkspace('2026-07');
  const employee = workspace.data?.employees.find((row) => row.ownerId === fixedCommission.ownerId);
  assert.equal(employee?.formalOrderPaidAmount, 899, '固定提成员工也必须显示关联正式订单实付');
  assert.equal(employee?.formalOrderCount, 1);
  assert.equal(employee?.recoveryOrderCount, 0);
  assert.equal(workspace.data?.summary.formalOrderPaidAmount, 899, '顶部正式订单实付必须来自业务订单而不是阶梯业绩');
}

{
  const paid = commission('correction-caliber-paid', '已发放', {
    orderId: 'correction-caliber-order',
    orderNo: 'ORD-CORRECTION-CALIBER',
    commissionAmount: 100,
    paidAt: '2026-07-20T08:00:00.000Z',
  });
  const zeroDifferenceCorrection = (
    id: string,
    correctionNo: string,
    createdAt: string,
  ): CommissionCorrectionRecord => ({
    id,
    correctionNo,
    sourceBusinessType: 'formal_order',
    sourceBusinessId: paid.orderId,
    sourceBusinessNo: paid.orderNo,
    sourceRevision: `revision-${id}`,
    beforeBusinessSnapshot: {},
    afterBusinessSnapshot: {},
    affectedPeriods: ['2026-07'],
    affectedEmployeeCount: 1,
    affectedCommissionCount: 1,
    originalPaidAmount: 100,
    correctedEntitlementAmount: 100,
    supplementAmount: 0,
    recoverAmount: 0,
    impacts: [{
      id: `impact-${id}`,
      sourceCommissionId: paid.id,
      role: paid.role,
      originalOwnerId: paid.ownerId,
      originalOwner: paid.owner,
      correctedOwnerId: paid.ownerId,
      correctedOwner: paid.owner,
      originalPeriod: '2026-07',
      correctedPeriod: '2026-07',
      originalPaidAmount: 100,
      correctedEntitlementAmount: 100,
      deltaAmount: 0,
      action: '无需差额',
      payoutRecordIds: [],
    }],
    legs: [],
    impactHash: `hash-${id}`,
    reason: '同源业务资料连续更正',
    status: '无差额',
    createdById: superAdmin.id,
    createdByName: superAdmin.name,
    createdAt,
    updatedAt: createdAt,
  });
  const firstFinancialCorrection: CommissionCorrectionRecord = {
    ...zeroDifferenceCorrection(
      'correction-caliber-1', 'COR-202607-000020', '2026-07-30T09:00:00.000Z',
    ),
    correctedEntitlementAmount: 120,
    supplementAmount: 20,
    impacts: [{
      ...zeroDifferenceCorrection('unused', 'unused', NOW).impacts[0],
      id: 'impact-correction-caliber-1',
      correctedEntitlementAmount: 120,
      deltaAmount: 20,
      action: '补发',
    }],
    legs: [{
      id: 'leg-correction-caliber-1',
      impactId: 'impact-correction-caliber-1',
      kind: '补发',
      ownerId: paid.ownerId,
      owner: paid.owner,
      departmentId: paid.departmentId,
      department: paid.department,
      role: paid.role,
      period: '2026-07',
      amount: 20,
      sourceCommissionIds: [paid.id],
      status: '待发放',
    }],
    status: '待处理',
  };
  const latestMetadataCorrection: CommissionCorrectionRecord = {
    ...zeroDifferenceCorrection(
      'correction-caliber-2', 'COR-202607-000021', '2026-07-30T10:00:00.000Z',
    ),
    correctedEntitlementAmount: 120,
    impacts: [{
      ...zeroDifferenceCorrection('unused-latest', 'unused-latest', NOW).impacts[0],
      id: 'impact-correction-caliber-2',
      correctedEntitlementAmount: 120,
      deltaAmount: 0,
      action: '无需差额',
    }],
  };
  const db = fakePrisma([
    record(STORAGE_KEYS.COMMISSIONS, paid as unknown as Record<string, unknown>),
    record(STORAGE_KEYS.COMMISSION_CORRECTIONS, firstFinancialCorrection as unknown as Record<string, unknown>),
    record(STORAGE_KEYS.COMMISSION_CORRECTIONS, latestMetadataCorrection as unknown as Record<string, unknown>),
  ]);
  const workspace = await createCommissionPayoutService(db.prisma, { now: () => new Date(NOW) })
    .getPeriodWorkspace('2026-07');
  const employee = workspace.data?.employees.find((row) => row.ownerId === paid.ownerId);
  assert.equal(employee?.correctionOriginalPaidAmount, 100, '员工汇总必须只采用同源最新更正口径');
  assert.equal(employee?.correctionEntitlementAmount, 120);
  assert.equal(employee?.correctionSupplementAmount, 20, '员工汇总必须保留更早已生成的补发流水');
  assert.equal(employee?.pendingCorrectionSupplementAmount, 20);
  assert.equal(workspace.data?.summary.correctionOriginalPaidAmount, 100);
  assert.equal(workspace.data?.summary.correctionEntitlementAmount, 120);
  assert.equal(workspace.data?.summary.correctionSupplementAmount, 20);
}

{
  const mixed = [
    commission('mixed-handling', '待确认', {
      orderId: 'mixed-order-handling', commissionAmount: 80,
      payoutPlanId: undefined, payoutPlanName: undefined, calculationNote: '缺少提成方案，暂不计算',
    }),
    commission('mixed-confirm', '待确认', {
      orderId: 'mixed-order-confirm', commissionAmount: 20, payoutPlanId: 'plan-confirm',
    }),
    commission('mixed-pay', '待发放', {
      orderId: 'mixed-order-pay', commissionAmount: 30, payoutPlanId: 'plan-pay',
    }),
    commission('mixed-paid', '已发放', {
      orderId: 'mixed-order-paid', commissionAmount: 40, payoutPlanId: 'plan-paid',
    }),
    commission('mixed-withdrawn', '已撤回', {
      orderId: 'mixed-order-withdrawn', commissionAmount: 50, payoutPlanId: 'plan-withdrawn',
    }),
  ];
  const pendingSnapshot = { ...mixed[2], commissionAmount: 25 };
  const paidSnapshot = { ...mixed[3], commissionAmount: 35 };
  const payoutBatch = {
    id: 'mixed-payout', payoutNo: 'FF-202608-MIXED', period: '2026-08', status: '已发放',
    totalCount: 2, totalAmount: 60, commissionIds: [mixed[2].id, mixed[3].id], commissionSnapshots: [pendingSnapshot, paidSnapshot],
    byOwner: [{ ownerId: 'sales-1', owner: '销售A', department: '销售部', count: 1, amount: 35 }],
    issuedAt: '2026-08-01T08:00:00.000Z', issuedById: finance.id, issuedByName: finance.name, paymentMethod: '银行转账', createdAt: '2026-08-01T08:00:00.000Z',
  };
  const db = fakePrisma([
    ...mixed.map((item) => record(STORAGE_KEYS.COMMISSIONS, item as unknown as Record<string, unknown>)),
    record(STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES, payoutBatch),
  ]);
  const service = createCommissionPayoutService(db.prisma, { now: () => new Date(NOW) });
  const workspace = await service.getPeriodWorkspace('2026-07');
  const employee = workspace.data?.employees[0];
  assert.deepEqual(employee?.statusCounts, {
    pendingHandling: 1,
    pendingConfirm: 1,
    pendingPay: 1,
    paid: 1,
    withdrawn: 1,
  }, '员工混合状态必须逐类展示，不能折叠成一个标签');
  assert.equal(employee?.pendingConfirmAmount, 20, '待处理即使保存了临时金额也不能进入待确认金额');
  assert.equal(employee?.pendingPayAmount, 30, '待发放金额必须使用当前金额，不得沿用历史发放快照');
  assert.equal(employee?.paidAmount, 35, '已发放金额必须使用发放时快照');
  assert.equal(employee?.commissions.find((item) => item.id === 'mixed-paid')?.commissionAmount, 35);
  assert.equal(employee?.withdrawnAmount, 50);
  assert.equal(employee?.totalAmount, 85, '本月提成总额只包含待确认、待发放和已发放');
  assert.equal(workspace.data?.summary.pendingHandlingCount, 1);
  assert.equal(workspace.data?.summary.pendingConfirmCount, 1, '顶部待确认必须同时提供笔数');
  assert.equal(workspace.data?.summary.pendingPayCount, 1, '顶部待发放必须同时提供笔数');
}

console.log('commission payout service tests passed');
