import assert from 'node:assert/strict';
import { commissionApi } from './commissionApi';
import { STORAGE_KEYS } from '../shared/utils/constants';
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
    sourceType: '\u81ea\u52a8\u89c4\u5219',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function seed() {
  storage.clear();
  storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
  storage.setItem(STORAGE_KEYS.USERS, JSON.stringify([
    { id: 'user-sales', name: 'Sales A', account: 'sales', email: '', phone: '', role: zh.salesRole, departmentId: 'dept-sales', isActive: true, createdAt: now, updatedAt: now },
    { id: 'user-lead', name: 'Lead A', account: 'lead', email: '', phone: '', role: zh.salesRole, departmentId: 'dept-market', isActive: true, createdAt: now, updatedAt: now },
  ]));
  storage.setItem(STORAGE_KEYS.DEPARTMENTS, JSON.stringify([
    { id: 'dept-sales', name: '\u9500\u552e\u90e8', code: 'SALES', memberCount: 1, isActive: true, createdAt: now, updatedAt: now },
    { id: 'dept-market', name: '\u5e02\u573a\u90e8', code: 'MARKET', memberCount: 1, isActive: true, createdAt: now, updatedAt: now },
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
  ];
  storage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));
  storage.setItem(STORAGE_KEYS.COMMISSIONS, JSON.stringify([
    baseCommission({ id: 'comm-a-sales', role: zh.salesRole, owner: 'Sales A', ownerId: 'user-sales', commissionAmount: 100 }),
    baseCommission({ id: 'comm-a-lead', role: zh.leadRole, owner: 'Lead A', ownerId: 'user-lead', department: '\u5e02\u573a\u90e8', departmentId: 'dept-market', commissionAmount: 30 }),
    baseCommission({ id: 'comm-b-sales', orderId: 'order-b', orderNo: 'ORD-B', customerName: 'Customer B', role: zh.salesRole, owner: 'Sales A', ownerId: 'user-sales', commissionAmount: 200, status: zh.pendingPay, paymentDate: '2026-05-25T10:00:00.000Z' }),
    baseCommission({ id: 'comm-b-success', orderId: 'order-b', orderNo: 'ORD-B', customerName: 'Customer B', role: zh.successRole, owner: zh.pendingAssign, ownerId: undefined, commissionAmount: 50, status: zh.pendingConfirm, paymentDate: '2026-05-25T10:00:00.000Z' }),
  ] satisfies Commission[]));
  storage.setItem(STORAGE_KEYS.COMMISSION_SETTLEMENT_BATCHES, JSON.stringify([]));
}

seed();

assert.equal(typeof (commissionApi as any).fetchCommissionOrderSummaries, 'function');
assert.equal(typeof (commissionApi as any).fetchMonthlyCommissionPayouts, 'function');
assert.equal(typeof (commissionApi as any).payMonthlyOwnerCommissions, 'function');
assert.equal(typeof (commissionApi as any).payMonthlyCommissionBatch, 'function');

const summariesRes = await (commissionApi as any).fetchCommissionOrderSummaries({ pageSize: 20 });
assert.equal(summariesRes.code, 0);
assert.equal(summariesRes.data.items.length, 2);
const orderA = summariesRes.data.items.find((item: any) => item.orderId === 'order-a');
const orderB = summariesRes.data.items.find((item: any) => item.orderId === 'order-b');
assert.equal(orderA.status, '\u5f85\u786e\u8ba4');
assert.equal(orderA.totalCommissionAmount, 130);
assert.deepEqual(orderA.splitSummary.map((item: any) => `${item.role}:${item.amount}`).sort(), [`${zh.salesRole}:100`, `${zh.leadRole}:30`].sort());
assert.equal(orderB.status, '\u5f85\u5904\u7406');
assert.equal(orderB.pendingAssignCount, 1);

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
