import assert from 'node:assert/strict';
import { commissionApi, orderReviewApi } from './index';
import { STORAGE_KEYS } from '../shared/utils/constants';
import { AUTH_SESSION_STORAGE_KEY } from '../shared/utils/auth';
import type { Commission, CommissionRule } from '../types/commission';

const storage = (() => {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: storage,
  configurable: true,
});

const now = '2026-06-19T08:00:00.000Z';

const zh = {
  all: '\u5168\u90e8',
  finance: '\u8d22\u52a1',
  sales: '\u9500\u552e',
  salesRole: '\u9500\u552e',
  leadRole: '\u7ebf\u7d22',
  successRole: '\u5ba2\u6237\u6210\u529f',
  salesDept: '\u9500\u552e\u90e8',
  marketDept: '\u5e02\u573a\u90e8',
  successDept: '\u5ba2\u6237\u6210\u529f\u90e8',
  pendingReview: '\u5f85\u8d22\u52a1\u5ba1\u6838',
  approved: '\u5df2\u5165\u5e93',
  pendingConfirm: '\u5f85\u786e\u8ba4',
  pendingPay: '\u5f85\u53d1\u653e',
  none: '\u65e0',
  confirmed: '\u5df2\u786e\u8ba4',
  companyResource: '\u516c\u53f8\u8d44\u6e90',
  bankTransfer: '\u5bf9\u516c\u8f6c\u8d26',
  officialChannel: '\u5bf9\u516c\u94f6\u884c\u8f6c\u8d26',
  orderType: '899\u6210\u4ea4',
  scene: '899\u6210\u4ea4',
  product: '899',
} as const;

function seed(userId = 'user-finance') {
  storage.clear();
  storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
  storage.setItem(STORAGE_KEYS.USERS, JSON.stringify([
    { id: 'user-sales', name: 'Sales A', account: 'sales', email: '', phone: '', role: zh.sales, roleId: 'role-sales', departmentId: 'dept-sales', isActive: true, createdAt: now, updatedAt: now },
    { id: 'user-lead', name: 'Lead A', account: 'lead', email: '', phone: '', role: zh.sales, roleId: 'role-sales', departmentId: 'dept-market', isActive: true, createdAt: now, updatedAt: now },
    { id: 'user-success', name: 'Success A', account: 'success', email: '', phone: '', role: zh.successRole, roleId: 'role-success', departmentId: 'dept-success', isActive: true, createdAt: now, updatedAt: now },
    { id: 'user-finance', name: 'Finance A', account: 'finance', email: '', phone: '', role: zh.finance, roleId: 'role-finance', departmentId: 'dept-finance', isActive: true, createdAt: now, updatedAt: now },
  ]));
  storage.setItem(STORAGE_KEYS.ROLES, JSON.stringify([
    { id: 'role-sales', name: zh.sales, code: 'sales_consultant', permissions: [], memberCount: 2, isActive: true, createdAt: now, updatedAt: now },
    { id: 'role-success', name: zh.successRole, code: 'customer_success', permissions: [], memberCount: 1, isActive: true, createdAt: now, updatedAt: now },
    { id: 'role-finance', name: zh.finance, code: 'finance_specialist', permissions: [{ module: zh.all, actions: ['admin'] }], memberCount: 1, isActive: true, createdAt: now, updatedAt: now },
  ]));
  storage.setItem(STORAGE_KEYS.DEPARTMENTS, JSON.stringify([
    { id: 'dept-sales', name: zh.salesDept, code: 'SALES', memberCount: 1, isActive: true, createdAt: now, updatedAt: now },
    { id: 'dept-market', name: zh.marketDept, code: 'MARKET', memberCount: 1, isActive: true, createdAt: now, updatedAt: now },
    { id: 'dept-success', name: zh.successDept, code: 'SUCCESS', memberCount: 1, isActive: true, createdAt: now, updatedAt: now },
    { id: 'dept-finance', name: zh.finance, code: 'FINANCE', memberCount: 1, isActive: true, createdAt: now, updatedAt: now },
  ]));
  storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({ userId, token: `token-${userId}`, remember: true, createdAt: now }));
  storage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([
    { id: 'cust-direct', name: 'Direct Customer', company: 'Direct Customer', phone: '13900000001', customerLevel: 'L1', owner: 'Sales A', totalSpent: 0, orderCount: 0, growthPath: [], growthRecords: [], sourceType: zh.companyResource, createdAt: now, updatedAt: now },
    { id: 'cust-lead', name: 'Lead Customer', company: 'Lead Customer', phone: '13900000002', customerLevel: 'L1', owner: 'Sales A', leadInputBy: 'Sales A', leadContributorId: 'user-lead', leadContributorName: 'Lead A', totalSpent: 0, orderCount: 0, growthPath: [], growthRecords: [], sourceType: zh.companyResource, createdAt: now, updatedAt: now },
  ]));
  storage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify([]));
  storage.setItem(STORAGE_KEYS.ORDER_APPLICATIONS, JSON.stringify([]));
  storage.setItem(STORAGE_KEYS.COMMISSIONS, JSON.stringify([]));
  storage.setItem(STORAGE_KEYS.COMMISSION_SETTLEMENT_BATCHES, JSON.stringify([]));
  storage.setItem(STORAGE_KEYS.DELIVERIES, JSON.stringify([]));
  storage.setItem(STORAGE_KEYS.REFUNDS, JSON.stringify([]));
  storage.setItem(STORAGE_KEYS.COMMISSION_RULES, JSON.stringify([
    {
      id: 'rule-sales',
      name: 'Sales 899',
      productLevel: zh.product,
      orderType: zh.orderType,
      sourceType: '',
      scene: zh.scene,
      resourceOwnership: zh.companyResource,
      paymentChannels: [zh.officialChannel],
      excludeExternalTalent: true,
      role: zh.salesRole,
      commissionType: 'fixed',
      commissionValue: 120,
      isActive: true,
      priority: 1,
    },
    {
      id: 'rule-lead',
      name: 'Lead 899',
      productLevel: zh.product,
      orderType: zh.orderType,
      sourceType: '',
      scene: zh.scene,
      resourceOwnership: zh.companyResource,
      paymentChannels: [zh.officialChannel],
      excludeExternalTalent: true,
      role: zh.leadRole,
      commissionType: 'fixed',
      commissionValue: 30,
      isActive: true,
      priority: 2,
    },
  ] satisfies CommissionRule[]));
}

async function approveOrder(customerId: string, customerName: string, leadInputBy?: string) {
  const submitRes = await orderReviewApi.submitOrderApplication({
    customerId,
    customerName,
    productLevel: zh.product,
    orderType: zh.orderType,
    amount: 899,
    actualAmount: 899,
    paymentMethod: zh.bankTransfer,
    officialPaymentChannel: zh.officialChannel,
    status: zh.confirmed,
    refundStatus: zh.none,
    owner: 'Sales A',
    salesId: 'user-sales',
    salesName: 'Sales A',
    sourceType: zh.companyResource,
    resourceOwnership: zh.companyResource,
    dealScene: zh.scene,
    proofStatus: '\u5df2\u4e0a\u4f20',
    leadInputBy,
    payments: [],
  } as any);
  assert.equal(submitRes.data.status, zh.pendingReview);
  const approveRes = await orderReviewApi.approveOrderApplication(submitRes.data.id);
  assert.equal(approveRes.data?.status, zh.approved);
  assert.ok(approveRes.data?.orderId);
  return approveRes.data.orderId!;
}

assert.equal(typeof (commissionApi as any).fetchCommissionsByOrder, 'function');
assert.equal(typeof (commissionApi as any).saveOrderCommissionAdjustments, 'function');
assert.equal(typeof (commissionApi as any).confirmOrderCommissions, 'function');
assert.equal(typeof (commissionApi as any).fetchCommissionOperationLogs, 'function');

seed();
const directOrderId = await approveOrder('cust-direct', 'Direct Customer');
let directCommissions = ((await (commissionApi as any).fetchCommissionsByOrder(directOrderId)).data || []) as Commission[];
assert.deepEqual(directCommissions.map((item) => item.role).sort(), [zh.salesRole].sort());
assert.equal(directCommissions.find((item) => item.role === zh.salesRole)?.owner, 'Sales A');
assert.equal(directCommissions.every((item) => item.status === zh.pendingConfirm), true);

const leadOrderId = await approveOrder('cust-lead', 'Lead Customer', 'Lead A');
let leadCommissions = ((await (commissionApi as any).fetchCommissionsByOrder(leadOrderId)).data || []) as Commission[];
assert.deepEqual(leadCommissions.map((item) => item.role).sort(), [zh.leadRole, zh.salesRole].sort());
assert.equal(leadCommissions.find((item) => item.role === zh.leadRole)?.owner, 'Lead A');
assert.equal(leadCommissions.every((item) => item.status === zh.pendingConfirm), true);

const invalidAdjustRes = await (commissionApi as any).saveOrderCommissionAdjustments(leadOrderId, leadCommissions, '');
assert.notEqual(invalidAdjustRes.code, 0);

const salesLine = leadCommissions.find((item) => item.role === zh.salesRole)!;
const adjustedRows = [
  { ...salesLine, commissionAmount: 100 },
  {
    orderId: leadOrderId,
    role: zh.successRole,
    ownerId: 'user-success',
    commissionAmount: 50,
    commissionRate: 0,
    performanceAmount: 899,
    calculationNote: 'Manual customer success split',
  },
];
const adjustRes = await (commissionApi as any).saveOrderCommissionAdjustments(leadOrderId, adjustedRows, 'Finance adjusted split');
assert.equal(adjustRes.code, 0);
leadCommissions = adjustRes.data as Commission[];
assert.equal(leadCommissions.length, 2);
assert.equal(leadCommissions.every((item) => item.status === zh.pendingConfirm), true);
assert.equal(leadCommissions.every((item) => item.isManualAdjusted), true);
assert.equal(leadCommissions.every((item) => item.adjustReason === 'Finance adjusted split'), true);
let operationLogs = ((await (commissionApi as any).fetchCommissionOperationLogs(leadOrderId)).data || []);
assert.ok(
  operationLogs.some((item: any) => item.action === '调整分账' && item.reason === 'Finance adjusted split'),
  '调整分账后应写入订单分账操作历史',
);
const adjustLog = operationLogs.find((item: any) => item.action === '调整分账' && item.reason === 'Finance adjusted split');
assert.ok(Array.isArray(adjustLog?.splitSnapshot), '调整分账历史应记录每个角色的分账快照');
assert.deepEqual(
  adjustLog.splitSnapshot
    .map((item: any) => `${item.role}:${item.owner}:${item.commissionAmount}`)
    .sort(),
  [`${zh.salesRole}:Sales A:100`, `${zh.successRole}:Success A:50`].sort(),
);

const batchBeforeConfirm = await commissionApi.generateSettlementBatch('2026-06');
assert.equal(batchBeforeConfirm.data.totalCount, 0);
assert.equal(batchBeforeConfirm.data.totalAmount, 0);

const confirmRes = await (commissionApi as any).confirmOrderCommissions(leadOrderId, 'Confirmed by finance');
assert.equal(confirmRes.code, 0);
assert.equal((confirmRes.data as Commission[]).every((item) => item.status === zh.pendingPay), true);
operationLogs = ((await (commissionApi as any).fetchCommissionOperationLogs(leadOrderId)).data || []);
assert.ok(
  operationLogs.some((item: any) => item.action === '确认分账' && item.reason === 'Confirmed by finance'),
  '确认分账后应写入订单分账操作历史',
);

const batchAfterConfirm = await commissionApi.generateSettlementBatch('2026-06');
assert.equal(batchAfterConfirm.data.totalCount, 2);
assert.equal(batchAfterConfirm.data.totalAmount, 150);
