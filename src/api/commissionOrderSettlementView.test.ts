import assert from 'node:assert/strict';
import { commissionApi } from './commissionApi';
import { orderApi } from './orderApi';
import { STORAGE_KEYS } from '../shared/utils/constants';
import { AUTH_SESSION_STORAGE_KEY } from '../shared/utils/auth';
import type { Commission } from '../types/commission';
import type { Order } from '../types/order';

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

const zh = {
  pendingConfirm: '\u5f85\u786e\u8ba4',
  pendingPay: '\u5f85\u53d1\u653e',
  paid: '\u5df2\u53d1\u653e',
  cancelled: '\u5df2\u53d6\u6d88',
  withdrawn: '\u5df2\u64a4\u56de',
  chargebackPending: '\u5f85\u51b2\u9500',
  chargedBack: '\u5df2\u51b2\u9500',
  pendingAssign: '\u5f85\u5206\u914d',
  salesRole: '\u9500\u552e',
  leadRole: '\u7ebf\u7d22',
  successRole: '\u5ba2\u6237\u6210\u529f',
  companyResource: '\u516c\u53f8\u8d44\u6e90',
  product: '\u4ee3\u7406',
  orderType: '\u65b0\u4ee3\u7406',
  none: '\u65e0',
  confirmed: '\u5df2\u786e\u8ba4',
  bankTransfer: '\u5bf9\u516c\u8f6c\u8d26',
  officialChannel: '\u5bf9\u516c\u94f6\u884c\u8f6c\u8d26',
} as const;

const now = '2026-06-19T08:00:00.000Z';

function baseCommission(overrides: Partial<Commission>): Commission {
  return {
    id: `comm-${overrides.role}-${overrides.owner}`,
    orderId: 'order-a',
    orderNo: 'ORD-A',
    customerName: 'Customer A',
    productLevel: zh.product,
    orderAmount: 9800,
    commissionRate: 0,
    commissionAmount: 100,
    performanceAmount: 9800,
    resourceOwnership: zh.companyResource,
    role: zh.salesRole,
    owner: 'Sales A',
    ownerId: 'user-sales',
    department: '\u9500\u552e\u90e8',
    departmentId: 'dept-sales',
    paymentDate: '2026-05-20T10:00:00.000Z',
    status: zh.pendingConfirm,
    commissionRuleId: 'rule-existing',
    payoutPlanName: '标准提成方案',
    sourceType: '\u81ea\u52a8\u89c4\u5219',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function baseOrder(overrides: Partial<Order> & Pick<Order, 'id' | 'orderNo' | 'actualAmount'>): Order {
  return {
    id: overrides.id,
    orderNo: overrides.orderNo,
    customerId: overrides.customerId || `cust-${overrides.id}`,
    customerName: overrides.customerName || `Customer ${overrides.id}`,
    productLevel: overrides.productLevel || zh.product,
    orderType: overrides.orderType || zh.orderType,
    amount: overrides.amount ?? overrides.actualAmount,
    actualAmount: overrides.actualAmount,
    paymentMethod: overrides.paymentMethod || zh.bankTransfer,
    officialPaymentChannel: overrides.officialPaymentChannel || zh.officialChannel,
    status: overrides.status || zh.confirmed,
    refundStatus: overrides.refundStatus || zh.none,
    owner: overrides.owner || 'Sales A',
    salesId: overrides.salesId,
    salesName: overrides.salesName,
    sourceType: overrides.sourceType || zh.companyResource,
    resourceOwnership: overrides.resourceOwnership || zh.companyResource,
    dealScene: overrides.dealScene || zh.orderType,
    proofStatus: overrides.proofStatus || '\u5df2\u4e0a\u4f20',
    payments: overrides.payments || [{
      id: `pay-${overrides.id}`,
      amount: overrides.actualAmount,
      paymentMethod: overrides.paymentMethod || zh.bankTransfer,
      paidAt: overrides.createdAt || '2026-05-20T10:00:00.000Z',
    }],
    createdAt: overrides.createdAt || '2026-05-20T10:00:00.000Z',
    updatedAt: overrides.updatedAt || overrides.createdAt || '2026-05-20T10:00:00.000Z',
  } as Order;
}

function seed() {
  storage.clear();
  storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
  storage.setItem(STORAGE_KEYS.USERS, JSON.stringify([
    { id: 'user-sales', name: 'Sales A', account: 'sales', email: '', phone: '', role: zh.salesRole, departmentId: 'dept-sales', isActive: true, createdAt: now, updatedAt: now },
    { id: 'user-lead', name: 'Lead A', account: 'lead', email: '', phone: '', role: zh.salesRole, departmentId: 'dept-market', isActive: true, createdAt: now, updatedAt: now },
    { id: 'user-admin', name: 'Admin', account: 'admin', email: '', phone: '', role: '超级管理员', roleId: 'role-super-admin', departmentId: 'dept-admin', isActive: true, createdAt: now, updatedAt: now },
  ]));
  storage.setItem(STORAGE_KEYS.ROLES, JSON.stringify([
    { id: 'role-super-admin', name: '超级管理员', code: 'super_admin', permissions: [{ module: '全部', actions: ['admin'] }], memberCount: 1, isActive: true, createdAt: now, updatedAt: now },
  ]));
  storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
    userId: 'user-admin',
    token: 'test-admin',
    remember: true,
    createdAt: now,
  }));
  storage.setItem(STORAGE_KEYS.DEPARTMENTS, JSON.stringify([
    { id: 'dept-sales', name: '\u9500\u552e\u90e8', code: 'SALES', memberCount: 1, isActive: true, createdAt: now, updatedAt: now },
    { id: 'dept-market', name: '\u5e02\u573a\u90e8', code: 'MARKET', memberCount: 1, isActive: true, createdAt: now, updatedAt: now },
    { id: 'dept-admin', name: '管理部', code: 'ADMIN', memberCount: 1, isActive: true, createdAt: now, updatedAt: now },
  ]));
  const orders: Order[] = [
    {
      id: 'order-a',
      orderNo: 'ORD-A',
      customerId: 'cust-a',
      customerName: 'Customer A',
      productLevel: zh.product,
      orderType: zh.orderType,
      amount: 9800,
      actualAmount: 9800,
      paymentMethod: zh.bankTransfer,
      officialPaymentChannel: zh.officialChannel,
      status: zh.confirmed,
      refundStatus: zh.none,
      owner: 'Sales A',
      sourceType: zh.companyResource,
      resourceOwnership: zh.companyResource,
      dealScene: zh.orderType,
      proofStatus: '\u5df2\u4e0a\u4f20',
      payments: [{ id: 'pay-a', amount: 9800, paidAt: '2026-05-20T10:00:00.000Z', method: zh.bankTransfer }],
      createdAt: now,
      updatedAt: now,
    } as any,
    {
      id: 'order-b',
      orderNo: 'ORD-B',
      customerId: 'cust-b',
      customerName: 'Customer B',
      productLevel: zh.product,
      orderType: zh.orderType,
      amount: 19800,
      actualAmount: 19800,
      paymentMethod: zh.bankTransfer,
      officialPaymentChannel: zh.officialChannel,
      status: zh.confirmed,
      refundStatus: zh.none,
      owner: 'Sales A',
      sourceType: zh.companyResource,
      resourceOwnership: zh.companyResource,
      dealScene: zh.orderType,
      proofStatus: '\u5df2\u4e0a\u4f20',
      payments: [{ id: 'pay-b', amount: 19800, paidAt: '2026-05-25T10:00:00.000Z', method: zh.bankTransfer }],
      createdAt: now,
      updatedAt: now,
    } as any,
    {
      id: 'order-c',
      orderNo: 'ORD-C',
      customerId: 'cust-c',
      customerName: 'Customer C',
      productLevel: zh.product,
      orderType: zh.orderType,
      amount: 899,
      actualAmount: 899,
      paymentMethod: zh.bankTransfer,
      officialPaymentChannel: zh.officialChannel,
      status: zh.confirmed,
      refundStatus: zh.none,
      owner: 'Sales A',
      sourceType: zh.companyResource,
      resourceOwnership: zh.companyResource,
      dealScene: zh.orderType,
      proofStatus: '\u5df2\u4e0a\u4f20',
      payments: [{ id: 'pay-c', amount: 899, paidAt: '2026-05-26T10:00:00.000Z', method: zh.bankTransfer }],
      createdAt: now,
      updatedAt: now,
    } as any,
    {
      id: 'order-d',
      orderNo: 'ORD-D',
      customerId: 'cust-d',
      customerName: 'Customer D',
      productLevel: zh.product,
      orderType: zh.orderType,
      amount: 1299,
      actualAmount: 1299,
      paymentMethod: zh.bankTransfer,
      officialPaymentChannel: zh.officialChannel,
      status: zh.confirmed,
      refundStatus: zh.none,
      owner: 'Sales A',
      sourceType: zh.companyResource,
      resourceOwnership: zh.companyResource,
      dealScene: zh.orderType,
      proofStatus: '\u5df2\u4e0a\u4f20',
      payments: [{ id: 'pay-d', amount: 1299, paidAt: '2026-05-27T10:00:00.000Z', method: zh.bankTransfer }],
      createdAt: now,
      updatedAt: now,
    } as any,
    {
      id: 'order-e',
      orderNo: 'ORD-E',
      customerId: 'cust-e',
      customerName: 'Customer E',
      productLevel: zh.product,
      orderType: zh.orderType,
      amount: 199,
      actualAmount: 199,
      paymentMethod: zh.bankTransfer,
      officialPaymentChannel: zh.officialChannel,
      status: zh.confirmed,
      refundStatus: zh.none,
      owner: 'Sales A',
      sourceType: zh.companyResource,
      resourceOwnership: zh.companyResource,
      dealScene: zh.orderType,
      proofStatus: '\u5df2\u4e0a\u4f20',
      payments: [{ id: 'pay-e', amount: 199, paidAt: '2026-06-28T10:00:00.000Z', method: zh.bankTransfer }],
      createdAt: now,
      updatedAt: now,
    } as any,
  ];
  storage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));
  storage.setItem(STORAGE_KEYS.COMMISSIONS, JSON.stringify([
    baseCommission({ id: 'comm-a-sales', role: zh.salesRole, owner: 'Sales A', ownerId: 'user-sales', commissionAmount: 100 }),
    baseCommission({ id: 'comm-a-lead', role: zh.leadRole, owner: 'Lead A', ownerId: 'user-lead', department: '\u5e02\u573a\u90e8', departmentId: 'dept-market', commissionAmount: 30 }),
    baseCommission({ id: 'comm-b-sales', orderId: 'order-b', orderNo: 'ORD-B', customerName: 'Customer B', role: zh.salesRole, owner: 'Sales A', ownerId: 'user-sales', commissionAmount: 200, status: zh.pendingPay, paymentDate: '2026-05-25T10:00:00.000Z' }),
    baseCommission({ id: 'comm-b-success', orderId: 'order-b', orderNo: 'ORD-B', customerName: 'Customer B', role: zh.successRole, owner: zh.pendingAssign, ownerId: undefined, commissionAmount: 50, status: zh.pendingConfirm, paymentDate: '2026-05-25T10:00:00.000Z' }),
    baseCommission({
      id: 'comm-e-unmatched',
      orderId: 'order-e',
      orderNo: 'ORD-E',
      customerName: 'Customer E',
      role: zh.salesRole,
      owner: 'Sales A',
      ownerId: 'user-sales',
      commissionAmount: 0,
      performanceAmount: 199,
      commissionRuleId: undefined,
      payoutPlanName: undefined,
      calculationNote: '\u8ba2\u5355\u5df2\u4ed8\u6b3e\uff0c\u4f46\u5f53\u524d\u89c4\u5219\u914d\u7f6e\u672a\u5339\u914d\u5230\u53ef\u7528\u63d0\u6210\u89c4\u5219',
      auditReason: '\u89c4\u5219\u672a\u547d\u4e2d',
      formulaText: '\u672a\u5339\u914d\u89c4\u5219\uff0c\u6682\u4e0d\u8ba1\u7b97\u91d1\u989d',
      paymentDate: '2026-06-28T10:00:00.000Z',
    }),
  ] satisfies Commission[]));
  storage.setItem(STORAGE_KEYS.COMMISSION_SETTLEMENT_BATCHES, JSON.stringify([]));
}

seed();

assert.equal(typeof (commissionApi as any).fetchCommissionOrderSummaries, 'function');
assert.equal(typeof (commissionApi as any).fetchMonthlyCommissionPayouts, 'function');
assert.equal(typeof (commissionApi as any).payMonthlyOwnerCommissions, 'function');
assert.equal(typeof (commissionApi as any).payMonthlyCommissionBatch, 'function');
assert.equal(typeof (commissionApi as any).fetchCommissionOrderSummaryStatusCounts, 'function');
assert.equal(typeof (commissionApi as any).fetchCreatableCommissionOrders, 'function');
assert.equal(typeof (commissionApi as any).startCommissionChargeback, 'function');
assert.equal(typeof (commissionApi as any).completeCommissionChargeback, 'function');
assert.equal(typeof (commissionApi as any).deleteOrderCommissions, 'function');

const deleteNoCommissionOrder = await orderApi.deleteOrder('order-c');
assert.equal(deleteNoCommissionOrder.code, 0);
assert.equal((await orderApi.fetchOrderById('order-c')).data, null);

const deletePendingCommissionOrder = await orderApi.deleteOrder('order-a');
assert.notEqual(deletePendingCommissionOrder.code, 0);
assert.match(deletePendingCommissionOrder.message || '', /已有分账/);
assert.notEqual((await orderApi.fetchOrderById('order-a')).data, null);

const summariesRes = await (commissionApi as any).fetchCommissionOrderSummaries({ pageSize: 20 });
assert.equal(summariesRes.code, 0);
assert.equal(summariesRes.data.items.length, 3);
const orderA = summariesRes.data.items.find((item: any) => item.orderId === 'order-a');
const orderB = summariesRes.data.items.find((item: any) => item.orderId === 'order-b');
const orderE = summariesRes.data.items.find((item: any) => item.orderId === 'order-e');
assert.equal(orderA.status, '\u5f85\u786e\u8ba4');
assert.equal(orderA.totalCommissionAmount, 130);
assert.equal(orderA.resourceOwnership, zh.companyResource);
assert.equal(orderA.refundStatus, zh.none);
assert.equal(orderA.salesOwner, 'Sales A');
assert.equal(orderA.officialPaymentChannel, zh.officialChannel);
assert.equal(orderA.createdAt, now);
assert.deepEqual(orderA.splitSummary.map((item: any) => `${item.role}:${item.amount}`).sort(), [`${zh.salesRole}:100`, `${zh.leadRole}:30`].sort());
assert.equal(orderB.status, '\u5f85\u5904\u7406');
assert.equal(orderB.pendingAssignCount, 1);
assert.equal(orderE.status, '\u5f85\u5904\u7406');
assert.equal(orderE.pendingAssignCount, 0);

const confirmUnmatchedRes = await (commissionApi as any).confirmOrderCommissions('order-e', 'should be blocked');
assert.notEqual(confirmUnmatchedRes.code, 0);
assert.match(confirmUnmatchedRes.message || '', /\u672a\u5904\u7406|\u5904\u7406\u5206\u8d26/);

const statusCountsRes = await (commissionApi as any).fetchCommissionOrderSummaryStatusCounts({ pageSize: 20 });
assert.equal(statusCountsRes.code, 0);
assert.deepEqual(statusCountsRes.data, {
  '\u5168\u90e8': 3,
  '\u5f85\u5904\u7406': 2,
  '\u5f85\u786e\u8ba4': 1,
  '\u5f85\u53d1\u653e': 0,
  '\u5df2\u53d1\u653e': 0,
  '\u5df2\u64a4\u56de': 0,
});

const creatableOrdersRes = await (commissionApi as any).fetchCreatableCommissionOrders({ pageSize: 20 });
assert.equal(creatableOrdersRes.code, 0);
assert.deepEqual(
  creatableOrdersRes.data.items.map((item: any) => item.orderId),
  ['order-d'],
);
assert.equal(creatableOrdersRes.data.items[0].orderNo, 'ORD-D');
assert.equal(creatableOrdersRes.data.items[0].customerName, 'Customer D');

const createManualSplitRes = await (commissionApi as any).saveOrderCommissionAdjustments('order-d', [{
  orderId: 'order-d',
  role: zh.salesRole,
  ownerId: 'user-sales',
  commissionAmount: 88,
  commissionRate: 0,
  performanceAmount: 899,
  calculationNote: 'Manual first split',
}], 'Create manual split for missing order');
assert.equal(createManualSplitRes.code, 0);
assert.equal((createManualSplitRes.data as Commission[]).length, 1);
assert.equal((createManualSplitRes.data as Commission[])[0].sourceType, '\u4eba\u5de5\u65b0\u589e');
const creatableAfterManualCreate = await (commissionApi as any).fetchCreatableCommissionOrders({ pageSize: 20 });
assert.equal(
  creatableAfterManualCreate.data.items.some((item: any) => item.orderId === 'order-d'),
  false,
);

const createSplitWithCalculationTypesRes = await (commissionApi as any).saveOrderCommissionAdjustments('order-d', [{
  orderId: 'order-d',
  role: zh.salesRole,
  ownerId: 'user-sales',
  ruleCalculationType: 'percentage',
  commissionAmount: 0,
  commissionRate: 0.1,
  performanceAmount: 899,
  calculationNote: 'Percentage manual split',
}, {
  orderId: 'order-d',
  role: zh.leadRole,
  ownerId: 'user-lead',
  ruleCalculationType: 'fixed',
  commissionAmount: 30,
  commissionRate: 0,
  performanceAmount: 899,
  calculationNote: 'Fixed manual split',
}, {
  orderId: 'order-d',
  role: zh.salesRole,
  ownerId: 'user-sales',
  ruleCalculationType: 'tiered_percentage',
  commissionAmount: 999,
  commissionRate: 0.2,
  performanceAmount: 899,
  calculationNote: 'Tiered manual split',
}], 'Create split with calculation types');
assert.equal(createSplitWithCalculationTypesRes.code, 0);
const calculationRows = createSplitWithCalculationTypesRes.data as Commission[];
const percentageRow = calculationRows.find((item) => item.calculationNote?.includes('Percentage manual split'));
const fixedRow = calculationRows.find((item) => item.calculationNote?.includes('Fixed manual split'));
const tieredRow = calculationRows.find((item) => item.calculationNote?.includes('Tiered manual split'));
assert.equal(percentageRow?.ruleCalculationType, 'percentage');
assert.equal(percentageRow?.commissionRate, 0.1);
assert.equal(percentageRow?.commissionAmount, 89.9);
assert.equal(fixedRow?.ruleCalculationType, 'fixed');
assert.equal(fixedRow?.commissionAmount, 30);
assert.equal(tieredRow?.ruleCalculationType, 'tiered_percentage');
assert.equal(tieredRow?.commissionRate, 0);
assert.equal(tieredRow?.commissionAmount, 0);
assert.match(tieredRow?.formulaText || '', /缺少销售阶梯规则/);

const removePendingConfirmLineRes = await (commissionApi as any).saveOrderCommissionAdjustments('order-a', [
  {
    id: 'comm-a-sales',
    orderId: 'order-a',
    role: zh.salesRole,
    ownerId: 'user-sales',
    commissionAmount: 100,
    commissionRate: 0,
    performanceAmount: 9800,
    calculationNote: 'Keep sales only',
  },
], 'Remove pending lead split');
assert.equal(removePendingConfirmLineRes.code, 0);
assert.deepEqual(
  (removePendingConfirmLineRes.data as Commission[]).map((item) => item.id),
  ['comm-a-sales'],
);

const removePendingPayLineRes = await (commissionApi as any).saveOrderCommissionAdjustments('order-b', [
  {
    id: 'comm-b-success',
    orderId: 'order-b',
    role: zh.successRole,
    ownerId: 'user-lead',
    commissionAmount: 50,
    commissionRate: 0,
    performanceAmount: 19800,
    calculationNote: 'Try removing payable sales line',
  },
], 'Try removing payable split');
assert.notEqual(removePendingPayLineRes.code, 0);
assert.match(removePendingPayLineRes.message || '', /待确认/);

const deletePendingOrderSplitRes = await (commissionApi as any).deleteOrderCommissions('order-a', 'Delete pending order split');
assert.equal(deletePendingOrderSplitRes.code, 0);
assert.equal(deletePendingOrderSplitRes.data, true);
assert.deepEqual(((await commissionApi.fetchCommissionsByOrder('order-a')).data || []).map((item: Commission) => item.id), []);
let deleteLogs = ((await (commissionApi as any).fetchCommissionOperationLogs('order-a')).data || []);
assert.ok(
  deleteLogs.some((item: any) => item.action === '删除分账' && item.reason === 'Delete pending order split'),
  '删除整笔订单分账后应写入操作历史',
);
const deleteLockedOrderSplitRes = await (commissionApi as any).deleteOrderCommissions('order-b', 'Try deleting payable split');
assert.notEqual(deleteLockedOrderSplitRes.code, 0);
assert.match(deleteLockedOrderSplitRes.message || '', /待确认/);
assert.equal(((await commissionApi.fetchCommissionsByOrder('order-b')).data || []).length, 2);

seed();
const confirmRes = await commissionApi.confirmOrderCommissions('order-a', 'order summary confirm');
assert.equal(confirmRes.code, 0);
const confirmedSummaries = await (commissionApi as any).fetchCommissionOrderSummaries({ status: '\u5f85\u53d1\u653e', pageSize: 20 });
assert.equal(confirmedSummaries.data.items.some((item: any) => item.orderId === 'order-a'), true);

const payoutsRes = await (commissionApi as any).fetchMonthlyCommissionPayouts('2026-05');
assert.equal(payoutsRes.code, 0);
const salesPayout = payoutsRes.data.find((item: any) => item.ownerId === 'user-sales');
assert.equal(salesPayout.orderCount, 2);
assert.equal(salesPayout.pendingPayAmount, 300);
assert.equal(salesPayout.paidAmount, 0);

const payOwnerRes = await (commissionApi as any).payMonthlyOwnerCommissions('2026-05', 'user-sales');
assert.equal(payOwnerRes.code, 0);
const refreshedPayouts = await (commissionApi as any).fetchMonthlyCommissionPayouts('2026-05');
const paidSales = refreshedPayouts.data.find((item: any) => item.ownerId === 'user-sales');
assert.equal(paidSales.pendingPayAmount, 0);
assert.equal(paidSales.paidAmount, 300);

const payBatchRes = await (commissionApi as any).payMonthlyCommissionBatch('2026-05');
assert.equal(payBatchRes.code, 0);

seed();
await commissionApi.confirmOrderCommissions('order-a', 'order summary confirm');
await commissionApi.updateCommissionStatus('comm-a-lead', zh.paid);
await commissionApi.updateCommissionStatus('comm-b-success', zh.withdrawn);
const monthlyStatementRes = await (commissionApi as any).fetchMonthlyCommissionPayouts('2026-05');
assert.equal(monthlyStatementRes.code, 0);
const monthlySales = monthlyStatementRes.data.find((item: any) => item.ownerId === 'user-sales');
assert.equal(monthlySales.pendingConfirmAmount, 0);
assert.equal(monthlySales.pendingPayAmount, 300);
assert.equal(monthlySales.paidAmount, 0);
assert.equal(monthlySales.exceptionAmount, 0);
assert.equal(monthlySales.totalAmount, 300);
const monthlyLead = monthlyStatementRes.data.find((item: any) => item.ownerId === 'user-lead');
assert.equal(monthlyLead.pendingConfirmAmount, 0);
assert.equal(monthlyLead.pendingPayAmount, 0);
assert.equal(monthlyLead.paidAmount, 30);
assert.equal(monthlyLead.totalAmount, 30);
const monthlyPendingAssign = monthlyStatementRes.data.find((item: any) => item.owner === zh.pendingAssign);
assert.equal(monthlyPendingAssign.pendingConfirmAmount, 0);
assert.equal(monthlyPendingAssign.pendingPayAmount, 0);
assert.equal(monthlyPendingAssign.withdrawnAmount, 50);
assert.equal(monthlyPendingAssign.totalAmount, 0);

const manualWithdrawWithoutReason = await (commissionApi as any).withdrawOrderCommissions('order-a', '');
assert.notEqual(manualWithdrawWithoutReason.code, 0);
const manualWithdrawRes = await (commissionApi as any).withdrawOrderCommissions('order-a', '订单退款撤回');
assert.notEqual(manualWithdrawRes.code, 0);
assert.match(manualWithdrawRes.message || '', /第一版不支持系统内冲销/);
const deletePaidCommissionOrder = await orderApi.deleteOrder('order-a');
assert.notEqual(deletePaidCommissionOrder.code, 0);
assert.match(deletePaidCommissionOrder.message || '', /已发放提成|第一版/);

seed();
const withdrawBeforeDelete = await (commissionApi as any).withdrawOrderCommissions('order-a', '全部撤回后删除订单');
assert.equal(withdrawBeforeDelete.code, 0);
assert.equal((withdrawBeforeDelete.data as Commission[]).every((item) => item.status === zh.withdrawn), true);
const deleteWithdrawnOrder = await orderApi.deleteOrder('order-a');
assert.equal(deleteWithdrawnOrder.code, 0);
assert.equal((await orderApi.fetchOrderById('order-a')).data, null);
const deletedOrderSummaries = await (commissionApi as any).fetchCommissionOrderSummaries({ status: zh.withdrawn, pageSize: 20 });
const deletedOrderSummary = deletedOrderSummaries.data.items.find((item: any) => item.orderId === 'order-a');
assert.equal(deletedOrderSummary.sourceOrderDeleted, true);
assert.equal(deletedOrderSummary.status, zh.withdrawn);
const cleanupWithdrawnRes = await (commissionApi as any).cleanupDeletedSourceOrderCommissions('order-a', '清理已废弃测试分账');
assert.equal(cleanupWithdrawnRes.code, 0);
const cleanedSummaries = await (commissionApi as any).fetchCommissionOrderSummaries({ status: zh.withdrawn, pageSize: 20 });
assert.equal(cleanedSummaries.data.items.some((item: any) => item.orderId === 'order-a'), false);
const cleanupLogs = ((await (commissionApi as any).fetchCommissionOperationLogs('order-a')).data || []);
assert.equal(cleanupLogs.some((item: any) => item.action === '清理废弃分账' && item.reason === '清理已废弃测试分账'), true);

seed();
await commissionApi.confirmOrderCommissions('order-a', 'prepare chargeback');
await commissionApi.updateCommissionStatus('comm-a-sales', zh.paid);
await commissionApi.updateCommissionStatus('comm-a-lead', zh.paid);
const startChargebackRes = await (commissionApi as any).startCommissionChargeback('order-a', '退款后需要追回已发提成');
assert.notEqual(startChargebackRes.code, 0);
assert.match(startChargebackRes.message || '', /第一版不支持系统内冲销/);
const completeChargebackRes = await (commissionApi as any).completeCommissionChargeback('order-a', {
  method: '下月提成抵扣',
  amount: 130,
  reason: '已在 6 月提成中抵扣',
});
assert.notEqual(completeChargebackRes.code, 0);
assert.match(completeChargebackRes.message || '', /第一版不支持系统内冲销/);
const paidPayoutsAfterBlockedChargeback = await (commissionApi as any).fetchMonthlyCommissionPayouts('2026-05');
assert.equal(
  paidPayoutsAfterBlockedChargeback.data.some((item: any) => item.commissions.some((commission: Commission) => commission.orderId === 'order-a')),
  true,
);
const deleteChargedBackOrder = await orderApi.deleteOrder('order-a');
assert.notEqual(deleteChargedBackOrder.code, 0);
assert.match(deleteChargedBackOrder.message || '', /第一版不支持系统内冲销/);
const cleanupChargedBackRes = await (commissionApi as any).cleanupDeletedSourceOrderCommissions('order-a', '不能清理冲销链路');
assert.notEqual(cleanupChargedBackRes.code, 0);

seed();
const preConfirmStatementRes = await (commissionApi as any).fetchMonthlyCommissionPayouts('2026-05');
assert.equal(preConfirmStatementRes.code, 0);
const preConfirmSales = preConfirmStatementRes.data.find((item: any) => item.ownerId === 'user-sales');
assert.equal(preConfirmSales.pendingConfirmAmount, 100);
assert.equal(preConfirmSales.pendingPayAmount, 200);
assert.equal(preConfirmSales.totalAmount, 300);

seed();
storage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify([
  baseOrder({ id: 'tier-order-a', orderNo: 'TIER-A', actualAmount: 10000, salesId: 'user-sales', salesName: 'Sales A', createdAt: '2026-05-05T10:00:00.000Z' }),
  baseOrder({ id: 'tier-order-b', orderNo: 'TIER-B', actualAmount: 20000, salesId: 'user-sales', salesName: 'Sales A', createdAt: '2026-05-10T10:00:00.000Z' }),
  baseOrder({ id: 'tier-order-other-owner', orderNo: 'TIER-OTHER-OWNER', actualAmount: 50000, salesId: 'user-lead', salesName: 'Lead A', owner: 'Lead A', createdAt: '2026-05-12T10:00:00.000Z' }),
  baseOrder({ id: 'tier-order-other-month', orderNo: 'TIER-OTHER-MONTH', actualAmount: 50000, salesId: 'user-sales', salesName: 'Sales A', createdAt: '2026-04-12T10:00:00.000Z' }),
  baseOrder({ id: 'tier-order-cancelled', orderNo: 'TIER-CANCELLED', actualAmount: 50000, salesId: 'user-sales', salesName: 'Sales A', status: '\u5df2\u53d6\u6d88', createdAt: '2026-05-13T10:00:00.000Z' }),
  baseOrder({ id: 'tier-order-refunded', orderNo: 'TIER-REFUNDED', actualAmount: 50000, salesId: 'user-sales', salesName: 'Sales A', refundStatus: '\u9000\u6b3e\u5df2\u5b8c\u6210', createdAt: '2026-05-14T10:00:00.000Z' }),
]));
storage.setItem(STORAGE_KEYS.COMMISSIONS, JSON.stringify([
  baseCommission({
    id: 'tier-comm-a',
    orderId: 'tier-order-a',
    orderNo: 'TIER-A',
    customerName: 'Customer tier-order-a',
    owner: 'Sales A',
    ownerId: 'user-sales',
    status: zh.pendingPay,
    commissionAmount: 0,
    performanceAmount: 10000,
    commissionRate: 0,
    ruleCalculationType: 'tiered_percentage',
    tierSnapshot: {
      tiers: [
        { minAmount: 0, maxAmount: 30000, rate: 8 },
        { minAmount: 30000, maxAmount: 50000, rate: 10 },
        { minAmount: 50000, rate: 15 },
      ],
      baseAmount: 0,
      gapToNext: 0,
    },
    formulaText: '月度提成待计算',
    paymentDate: '2026-05-05T10:00:00.000Z',
  } as any),
  baseCommission({
    id: 'tier-comm-b',
    orderId: 'tier-order-b',
    orderNo: 'TIER-B',
    customerName: 'Customer tier-order-b',
    owner: 'Sales A',
    ownerId: 'user-sales',
    status: zh.pendingPay,
    commissionAmount: 0,
    performanceAmount: 20000,
    commissionRate: 0,
    ruleCalculationType: 'tiered_percentage',
    tierSnapshot: {
      tiers: [
        { minAmount: 0, maxAmount: 30000, rate: 8 },
        { minAmount: 30000, maxAmount: 50000, rate: 10 },
        { minAmount: 50000, rate: 15 },
      ],
      baseAmount: 0,
      gapToNext: 0,
    },
    formulaText: '月度提成待计算',
    paymentDate: '2026-05-10T10:00:00.000Z',
  } as any),
  baseCommission({
    id: 'fixed-comm-a',
    orderId: 'tier-order-a',
    orderNo: 'TIER-A',
    customerName: 'Customer tier-order-a',
    owner: 'Sales A',
    ownerId: 'user-sales',
    status: zh.pendingPay,
    commissionAmount: 123,
    performanceAmount: 10000,
    commissionRate: 0,
    ruleCalculationType: 'fixed',
    paymentDate: '2026-05-05T10:00:00.000Z',
  } as any),
]));

assert.equal(typeof (commissionApi as any).fetchMonthlyCommissionTierConfig, 'function');
assert.equal(typeof (commissionApi as any).saveMonthlyCommissionTierConfig, 'function');
const tierConfigRes = await (commissionApi as any).fetchMonthlyCommissionTierConfig('2026-05');
assert.equal(tierConfigRes.code, 0);
assert.deepEqual(tierConfigRes.data.tiers, [
  { minAmount: 0, maxAmount: 30000, rate: 8 },
  { minAmount: 30000, maxAmount: 50000, rate: 10 },
  { minAmount: 50000, rate: 15 },
]);
const tieredMonthlyRes = await (commissionApi as any).fetchMonthlyCommissionPayouts('2026-05');
assert.equal(tieredMonthlyRes.code, 0);
const tieredSales = tieredMonthlyRes.data.find((item: any) => item.ownerId === 'user-sales');
assert.equal(tieredSales.monthlyPaidAmount, 30000);
assert.equal(tieredSales.pendingPayAmount, 3123);
assert.equal(tieredSales.totalAmount, 3123);
assert.equal(tieredSales.commissions.find((item: any) => item.id === 'tier-comm-a').commissionAmount, 1000);
assert.equal(tieredSales.commissions.find((item: any) => item.id === 'tier-comm-b').commissionAmount, 2000);
assert.equal(tieredSales.commissions.find((item: any) => item.id === 'fixed-comm-a').commissionAmount, 123);
assert.match(tieredSales.commissions.find((item: any) => item.id === 'tier-comm-a').formulaText || '', /销售角色月累计阶梯业绩 30000/);
assert.match(tieredSales.commissions.find((item: any) => item.id === 'tier-comm-a').formulaText || '', /10%/);
