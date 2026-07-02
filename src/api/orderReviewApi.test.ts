import assert from 'node:assert/strict';
import { orderApi } from './orderApi';
import { canReviewOrderApplications, orderReviewApi } from './orderReviewApi';
import { refundApi } from './refundApi';
import { authApi } from './authApi';
import { STORAGE_KEYS } from '../shared/utils/constants';
import { AUTH_SESSION_STORAGE_KEY } from '../shared/utils/auth';
import { PERMISSION_KEYS } from '../shared/utils/permissions';
import type { Commission } from '../types/commission';

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
  all: '\u5168\u90e8',
  finance: '\u8d22\u52a1',
  sales: '\u9500\u552e',
  pendingReview: '\u5f85\u8d22\u52a1\u5ba1\u6838',
  returned: '\u9000\u56de\u4fee\u6539',
  approved: '\u5df2\u5165\u5e93',
  rejected: '\u5df2\u9a73\u56de',
  pendingPay: '\u5f85\u53d1\u653e',
  paid: '\u5df2\u53d1\u653e',
  cancelled: '\u5df2\u53d6\u6d88',
  withdrawn: '\u5df2\u64a4\u56de',
  chargebackPending: '\u5f85\u51b2\u9500',
  refundException: '\u5df2\u53d1\u653e\u540e\u9000\u6b3e',
  confirmed: '\u5df2\u786e\u8ba4',
  none: '\u65e0',
  completedRefund: '\u9000\u6b3e\u5df2\u5b8c\u6210',
  bankTransfer: '\u5bf9\u516c\u8f6c\u8d26',
  officialChannel: '\u5bf9\u516c\u94f6\u884c\u8f6c\u8d26',
  salesRole: '\u9500\u552e',
  department: '\u9500\u552e\u90e8',
  customerName: '\u5ba2\u6237A',
  product: '899',
  productName: '极享 899 基础版',
} as const;

const now = '2026-06-19T08:00:00.000Z';

const orderPayload = {
  customerId: 'cust-1',
  customerName: zh.customerName,
  productId: 'prod-899-basic',
  productLevel: zh.product,
  orderType: 'new',
  amount: 899,
  actualAmount: 899,
  paymentMethod: zh.bankTransfer,
  status: zh.confirmed,
  refundStatus: zh.none,
  owner: 'Sales A',
  salesId: 'user-sales',
  salesName: 'Sales A',
  sourceType: 'company',
  resourceOwnership: '\u516c\u53f8\u8d44\u6e90',
  officialPaymentChannel: zh.officialChannel,
  proofStatus: '\u5df2\u4e0a\u4f20',
  payments: [],
} as any;

function seed(userId = 'user-sales') {
  storage.clear();
  storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
  storage.setItem(STORAGE_KEYS.USERS, JSON.stringify([
    { id: 'user-sales', name: 'Sales A', account: 'sales', email: '', phone: '', role: zh.sales, roleId: 'role-sales', departmentId: 'dept-sales', isActive: true, createdAt: now, updatedAt: now },
    { id: 'user-sales-b', name: 'Sales B', account: 'sales_b', email: '', phone: '', role: zh.sales, roleId: 'role-sales', departmentId: 'dept-sales', isActive: true, createdAt: now, updatedAt: now },
    { id: 'user-finance', name: 'Finance A', account: 'finance', email: '', phone: '', role: zh.finance, roleId: 'role-finance', departmentId: 'dept-finance', isActive: true, createdAt: now, updatedAt: now },
  ]));
  storage.setItem(STORAGE_KEYS.ROLES, JSON.stringify([
    { id: 'role-sales', name: zh.sales, code: 'sales_consultant', permissions: [], memberCount: 1, isActive: true, createdAt: now, updatedAt: now },
    { id: 'role-finance', name: zh.finance, code: 'finance_specialist', permissions: [{ module: zh.all, actions: ['admin'] }], memberCount: 1, isActive: true, createdAt: now, updatedAt: now },
  ]));
  storage.setItem(STORAGE_KEYS.DEPARTMENTS, JSON.stringify([
    { id: 'dept-sales', name: zh.department, code: 'SALES', memberCount: 1, isActive: true, createdAt: now, updatedAt: now },
    { id: 'dept-finance', name: zh.finance, code: 'FINANCE', memberCount: 1, isActive: true, createdAt: now, updatedAt: now },
  ]));
  storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({ userId, token: `token-${userId}`, remember: true, createdAt: now }));
  storage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([
    { id: 'cust-1', name: zh.customerName, company: zh.customerName, phone: '13900000000', customerLevel: 'L1', owner: 'Sales A', totalSpent: 0, orderCount: 0, growthPath: [], growthRecords: [], createdAt: now, updatedAt: now },
  ]));
  storage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify([
    { id: 'prod-899-basic', name: zh.productName, level: zh.product, price: 899, description: '', features: [], deliveryStages: [], isActive: true, sortOrder: 1, createdAt: now, updatedAt: now },
  ]));
  storage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify([]));
  storage.setItem(STORAGE_KEYS.COMMISSIONS, JSON.stringify([]));
  storage.setItem(STORAGE_KEYS.DELIVERIES, JSON.stringify([]));
  storage.setItem(STORAGE_KEYS.REFUNDS, JSON.stringify([]));
}

seed();

const submitRes = await orderReviewApi.submitOrderApplication(orderPayload);
assert.equal(submitRes.code, 0);
assert.equal(submitRes.data.status, zh.pendingReview);
assert.equal(submitRes.data.orderData.productName, zh.productName);

storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({ userId: 'user-sales-b', token: 'token-user-sales-b', remember: true, createdAt: now }));
const otherSubmitRes = await orderReviewApi.submitOrderApplication({
  ...orderPayload,
  customerId: 'cust-other-submit',
  customerName: 'Other Submit Customer',
  owner: 'Sales A',
  salesId: 'user-sales',
  salesName: 'Sales A',
});
assert.equal(otherSubmitRes.code, 0);
assert.deepEqual((await orderReviewApi.fetchOrderApplications({ pageSize: 20 })).data.items.map((item) => item.id), [otherSubmitRes.data.id]);

storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({ userId: 'user-sales', token: 'token-user-sales', remember: true, createdAt: now }));
assert.deepEqual((await orderReviewApi.fetchOrderApplications({ pageSize: 20 })).data.items.map((item) => item.id), [submitRes.data.id]);

assert.equal((await orderApi.fetchOrders({ pageSize: 20 })).data.items.length, 0);
assert.equal(JSON.parse(storage.getItem(STORAGE_KEYS.COMMISSIONS) || '[]').length, 0);

storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({ userId: 'user-finance', token: 'token-user-finance', remember: true, createdAt: now }));
assert.deepEqual((await orderReviewApi.fetchOrderApplications({ pageSize: 20 })).data.items.map((item) => item.id), [otherSubmitRes.data.id, submitRes.data.id]);
const returnRes = await orderReviewApi.returnOrderApplication(submitRes.data.id, 'Need voucher');
assert.equal(returnRes.code, 0);
assert.equal(returnRes.data?.status, zh.returned);

storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({ userId: 'user-sales', token: 'token-user-sales', remember: true, createdAt: now }));
const resubmitRes = await orderReviewApi.updateReturnedOrderApplication(submitRes.data.id, {
  ...orderPayload,
  notes: 'Voucher added',
});
assert.equal(resubmitRes.code, 0);
assert.equal(resubmitRes.data?.status, zh.pendingReview);

storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({ userId: 'user-finance', token: 'token-user-finance', remember: true, createdAt: now }));
const approveRes = await orderReviewApi.approveOrderApplication(submitRes.data.id);
assert.equal(approveRes.code, 0);
assert.equal(approveRes.data?.status, zh.approved);
assert.ok(approveRes.data?.orderId);

const ordersAfterApprove = await orderApi.fetchOrders({ pageSize: 20 });
assert.equal(ordersAfterApprove.data.items.length, 1);
assert.equal(ordersAfterApprove.data.items[0].customerName, zh.customerName);
assert.equal(ordersAfterApprove.data.items[0].productName, zh.productName);
assert.equal(approveRes.data?.orderId, ordersAfterApprove.data.items[0].id);
assert.equal(approveRes.data?.orderNo, ordersAfterApprove.data.items[0].orderNo);

const storedCommissions = JSON.parse(storage.getItem(STORAGE_KEYS.COMMISSIONS) || '[]') as Commission[];
assert.equal(storedCommissions.length > 0, true);

const rejectSubmit = await orderReviewApi.submitOrderApplication({
  ...orderPayload,
  customerName: '\u5ba2\u6237B',
  customerId: 'cust-2',
});
const rejectRes = await orderReviewApi.rejectOrderApplication(rejectSubmit.data.id, 'Invalid payment');
assert.equal(rejectRes.code, 0);
assert.equal(rejectRes.data?.status, zh.rejected);
const rejectedUpdateRes = await orderReviewApi.updateReturnedOrderApplication(rejectSubmit.data.id, orderPayload);
assert.notEqual(rejectedUpdateRes.code, 0);
assert.equal((await orderApi.fetchOrders({ pageSize: 20 })).data.items.length, 1);

storage.setItem(STORAGE_KEYS.COMMISSIONS, JSON.stringify(storedCommissions.map((commission) => ({
  ...commission,
  status: zh.paid,
  paidAt: now,
}))));

const refundRes = await refundApi.createRefund({
  orderId: ordersAfterApprove.data.items[0].id,
  orderNo: ordersAfterApprove.data.items[0].orderNo,
  customerId: ordersAfterApprove.data.items[0].customerId,
  customerName: ordersAfterApprove.data.items[0].customerName,
  productLevel: ordersAfterApprove.data.items[0].productLevel,
  orderAmount: ordersAfterApprove.data.items[0].actualAmount,
  refundAmount: ordersAfterApprove.data.items[0].actualAmount,
  refundReason: 'Customer refund',
  refundCategory: '\u5176\u4ed6' as any,
  status: '\u5f85\u5206\u914d' as any,
  applicantId: 'user-sales',
  applicantName: 'Sales A',
});
assert.equal(refundRes.code, 0);
assert.equal(refundRes.data.productName, zh.productName);
const completeRefundRes = await refundApi.completeRefund(refundRes.data.id, zh.bankTransfer);
assert.equal(completeRefundRes.code, 0);

const commissionsAfterRefund = JSON.parse(storage.getItem(STORAGE_KEYS.COMMISSIONS) || '[]') as Commission[];
assert.equal(commissionsAfterRefund.every((commission) => commission.status === zh.paid), true);
assert.equal(commissionsAfterRefund.some((commission) => `${commission.auditReason || ''}${commission.calculationNote || ''}`.includes(zh.refundException)), false);

seed();
const unpaidSubmitRes = await orderReviewApi.submitOrderApplication(orderPayload);
storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({ userId: 'user-finance', token: 'token-user-finance', remember: true, createdAt: now }));
const unpaidApproveRes = await orderReviewApi.approveOrderApplication(unpaidSubmitRes.data.id);
assert.equal(unpaidApproveRes.code, 0);
const unpaidOrders = await orderApi.fetchOrders({ pageSize: 20 });
const unpaidRefundRes = await refundApi.createRefund({
  orderId: unpaidApproveRes.data!.orderId!,
  orderNo: unpaidApproveRes.data!.orderNo!,
  customerId: unpaidOrders.data.items[0].customerId,
  customerName: unpaidOrders.data.items[0].customerName,
  productLevel: unpaidOrders.data.items[0].productLevel,
  orderAmount: unpaidOrders.data.items[0].actualAmount,
  refundAmount: unpaidOrders.data.items[0].actualAmount,
  refundReason: 'Customer refund before payout',
  refundCategory: '\u5176\u4ed6' as any,
  status: '\u5f85\u5206\u914d' as any,
  applicantId: 'user-sales',
  applicantName: 'Sales A',
});
assert.equal(unpaidRefundRes.code, 0);
const unpaidCompleteRefundRes = await refundApi.completeRefund(unpaidRefundRes.data.id, zh.bankTransfer);
assert.equal(unpaidCompleteRefundRes.code, 0);
const unpaidCommissionsAfterRefund = JSON.parse(storage.getItem(STORAGE_KEYS.COMMISSIONS) || '[]') as Commission[];
assert.equal(unpaidCommissionsAfterRefund.length > 0, true);
assert.equal(unpaidCommissionsAfterRefund.every((commission) => commission.status === zh.withdrawn), true);

seed('user-sales');
storage.setItem(STORAGE_KEYS.ROLES, JSON.stringify([
  { id: 'role-sales', name: zh.sales, code: 'sales_consultant', permissions: [], memberCount: 1, isActive: true, createdAt: now, updatedAt: now },
  { id: 'role-finance', name: zh.finance, code: 'finance_specialist', permissions: [], memberCount: 1, isActive: true, createdAt: now, updatedAt: now },
]));
const permissionReviewSubmit = await orderReviewApi.submitOrderApplication(orderPayload);
assert.equal(permissionReviewSubmit.code, 0);

const salesWithoutPermissionApprove = await orderReviewApi.approveOrderApplication(permissionReviewSubmit.data.id);
assert.equal(salesWithoutPermissionApprove.code, 403);

storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({ userId: 'user-finance', token: 'token-user-finance', remember: true, createdAt: now }));
const financeWithoutPermissionApprove = await orderReviewApi.approveOrderApplication(permissionReviewSubmit.data.id);
assert.equal(financeWithoutPermissionApprove.code, 403);

storage.setItem(STORAGE_KEYS.ROLES, JSON.stringify([
  { id: 'role-sales', name: zh.sales, code: 'sales_consultant', permissions: [], memberCount: 1, isActive: true, createdAt: now, updatedAt: now },
  { id: 'role-finance', name: zh.finance, code: 'finance_specialist', permissions: [{ module: PERMISSION_KEYS.ORDER_REVIEW, actions: ['read'] }], dataScopes: { orderApplications: 'self' }, memberCount: 1, isActive: true, createdAt: now, updatedAt: now },
]));
assert.deepEqual((await orderReviewApi.fetchOrderApplications({ pageSize: 20 })).data.items.map((item) => item.id), [permissionReviewSubmit.data.id]);

storage.setItem(STORAGE_KEYS.ROLES, JSON.stringify([
  { id: 'role-sales', name: zh.sales, code: 'sales_consultant', permissions: [], memberCount: 1, isActive: true, createdAt: now, updatedAt: now },
  { id: 'role-finance', name: zh.finance, code: 'finance_specialist', permissions: [{ module: PERMISSION_KEYS.ORDER_REVIEW, actions: ['read'] }], dataScopes: { orderApplications: 'all', orders: 'all' }, memberCount: 1, isActive: true, createdAt: now, updatedAt: now },
]));
assert.deepEqual((await orderReviewApi.fetchOrderApplications({ pageSize: 20 })).data.items.map((item) => item.id), [permissionReviewSubmit.data.id]);
const financeWithPermissionApprove = await orderReviewApi.approveOrderApplication(permissionReviewSubmit.data.id);
assert.equal(financeWithPermissionApprove.code, 0);
assert.equal(financeWithPermissionApprove.data?.status, zh.approved);

storage.clear();
process.env.VITE_USE_BACKEND_API = 'true';
process.env.VITE_AI_API_BASE = 'http://127.0.0.1:3001/api';
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (url: string) => {
  if (String(url).endsWith('/auth/me')) {
    return new Response(JSON.stringify({
      code: 0,
      data: {
        id: 'user-admin',
        name: '系统管理员',
        account: 'admin',
        email: 'admin@company.com',
        phone: '',
        role: '超级管理员',
        roleId: 'role-super-admin',
        departmentId: 'dept-general',
        isActive: true,
        permissions: [{ module: zh.all, actions: ['admin'] }],
      },
      message: 'success',
    }), { status: 200 });
  }
  return new Response(JSON.stringify({ code: -1, data: null, message: 'unexpected request' }), { status: 404 });
}) as typeof fetch;

try {
  const backendCurrentUser = await authApi.getCurrentUser();
  assert.equal(backendCurrentUser.code, 0);
  assert.equal(canReviewOrderApplications(), true);
} finally {
  globalThis.fetch = originalFetch;
  delete process.env.VITE_USE_BACKEND_API;
  delete process.env.VITE_AI_API_BASE;
}
