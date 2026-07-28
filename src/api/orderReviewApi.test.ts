import assert from 'node:assert/strict';
import { orderApi } from './orderApi';
import { canReviewOrderApplications, orderReviewApi } from './orderReviewApi';
import { refundApi } from './refundApi';
import { authApi } from './authApi';
import { STORAGE_KEYS } from '../shared/utils/constants';
import { AUTH_SESSION_STORAGE_KEY } from '../shared/utils/auth';
import { PERMISSION_KEYS, roleHasPermission } from '../shared/utils/permissions';
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
    {
      id: 'role-sales',
      name: zh.sales,
      code: 'sales_consultant',
      permissions: [{ module: PERMISSION_KEYS.ORDER_CREATE, actions: ['read', 'write'] }],
      dataScopes: { orderApplications: 'self', orders: 'self' },
      memberCount: 1,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
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

const rolesBeforeGlobalCreatorAttempt = storage.getItem(STORAGE_KEYS.ROLES) || '[]';
storage.setItem(STORAGE_KEYS.ROLES, JSON.stringify(
  (JSON.parse(rolesBeforeGlobalCreatorAttempt) as any[]).map((role) => (
    role.code === 'sales_consultant'
      ? { ...role, dataScopes: { ...role.dataScopes, orderApplications: 'all', orders: 'all' } }
      : role
  )),
));
storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({ userId: 'user-sales-b', token: 'token-user-sales-b', remember: true, createdAt: now }));
assert.equal(
  (await orderReviewApi.fetchOrderApplications({ pageSize: 20 })).data.items.some((item) => item.id === submitRes.data.id),
  true,
  '全局数据范围的订单创建人必须真实可见其他人的退回申请',
);
const nonApplicantResubmit = await orderReviewApi.updateReturnedOrderApplication(submitRes.data.id, {
  ...orderPayload,
  notes: 'Global creator tried to bypass applicant ownership',
});
assert.equal(nonApplicantResubmit.code, 403, '即使具有新增订单写权限且全局可见，也只有原申请人可以重提');
assert.equal(
  (await orderReviewApi.fetchOrderApplicationById(submitRes.data.id)).data?.status,
  zh.returned,
  '非申请人的失败重提不得改变申请状态或数据',
);
storage.setItem(STORAGE_KEYS.ROLES, rolesBeforeGlobalCreatorAttempt);

storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({ userId: 'user-sales', token: 'token-user-sales', remember: true, createdAt: now }));
const rolesBeforeOrderCreatePermissionRevocation = storage.getItem(STORAGE_KEYS.ROLES) || '[]';
storage.setItem(STORAGE_KEYS.ROLES, JSON.stringify(
  (JSON.parse(rolesBeforeOrderCreatePermissionRevocation) as any[]).map((role) => (
    role.code === 'sales_consultant'
      ? {
          ...role,
          permissions: role.permissions.filter((permission: { module: string }) => permission.module !== PERMISSION_KEYS.ORDER_CREATE),
        }
      : role
  )),
));
const applicantWithoutCreateWrite = await orderReviewApi.updateReturnedOrderApplication(submitRes.data.id, {
  ...orderPayload,
  notes: 'Applicant without create permission',
});
assert.equal(applicantWithoutCreateWrite.code, 403, '原申请人失去新增订单写权限后不得重提');
assert.equal(
  (await orderReviewApi.fetchOrderApplicationById(submitRes.data.id)).data?.status,
  zh.returned,
  '权限拒绝不得改变退回申请',
);
storage.setItem(STORAGE_KEYS.ROLES, rolesBeforeOrderCreatePermissionRevocation);

const resubmitRes = await orderReviewApi.updateReturnedOrderApplication(submitRes.data.id, {
  ...orderPayload,
  notes: 'Voucher added',
});
assert.equal(resubmitRes.code, 0);
assert.equal(resubmitRes.data?.status, zh.pendingReview);

storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({ userId: 'user-finance', token: 'token-user-finance', remember: true, createdAt: now }));
const [approveRes, concurrentApproveRes] = await Promise.all([
  orderReviewApi.approveOrderApplication(submitRes.data.id),
  orderReviewApi.approveOrderApplication(submitRes.data.id),
]);
assert.equal(approveRes.code, 0);
assert.equal(concurrentApproveRes.code, 0);
assert.equal(approveRes.data?.status, zh.approved);
assert.equal(concurrentApproveRes.data?.status, zh.approved);
assert.ok(approveRes.data?.orderId);
assert.equal(concurrentApproveRes.data?.orderId, approveRes.data?.orderId, '并发审核必须返回同一入库结果');
assert.equal(concurrentApproveRes.data?.orderNo, approveRes.data?.orderNo, '并发审核必须返回同一正式订单号');

const ordersAfterApprove = await orderApi.fetchOrders({ pageSize: 20 });
assert.equal(ordersAfterApprove.data.items.length, 1, '并发审核不得生成重复正式订单');
assert.equal(ordersAfterApprove.data.items[0].customerName, zh.customerName);
assert.equal(ordersAfterApprove.data.items[0].productName, zh.productName);
assert.equal(ordersAfterApprove.data.items[0].createdById, 'user-sales');
assert.equal(ordersAfterApprove.data.items[0].createdByName, 'Sales A');
assert.equal(ordersAfterApprove.data.items[0].sourceApplicationId, submitRes.data.id);
assert.equal(approveRes.data?.orderId, ordersAfterApprove.data.items[0].id);
assert.equal(approveRes.data?.orderNo, ordersAfterApprove.data.items[0].orderNo);

const storedCommissions = JSON.parse(storage.getItem(STORAGE_KEYS.COMMISSIONS) || '[]') as Commission[];
assert.equal(storedCommissions.length > 0, true);
assert.equal(
  new Set(storedCommissions.map((commission) => commission.orderId)).size,
  1,
  '并发审核不得为同一申请产生多套提成副作用',
);
assert.equal(
  (JSON.parse(storage.getItem(STORAGE_KEYS.DELIVERIES) || '[]') as Array<{ orderId: string }>).length,
  1,
  '并发审核不得为同一申请产生重复交付副作用',
);

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
const parallelSubmitA = await orderReviewApi.submitOrderApplication({
  ...orderPayload,
  customerId: 'cust-parallel-a',
  customerName: 'Parallel Customer A',
});
const parallelSubmitB = await orderReviewApi.submitOrderApplication({
  ...orderPayload,
  customerId: 'cust-parallel-b',
  customerName: 'Parallel Customer B',
});
storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({ userId: 'user-finance', token: 'token-user-finance', remember: true, createdAt: now }));
const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
const [parallelApproveA, parallelApproveB] = await (async () => {
  try {
    return await Promise.all([
      orderReviewApi.approveOrderApplication(parallelSubmitA.data.id),
      orderReviewApi.approveOrderApplication(parallelSubmitB.data.id),
    ]);
  } finally {
    if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
  }
})();
assert.equal(parallelApproveA.code, 0);
assert.equal(parallelApproveB.code, 0);
const parallelApplications = (await orderReviewApi.fetchOrderApplications({ pageSize: 20 })).data.items
  .filter((application) => [parallelSubmitA.data.id, parallelSubmitB.data.id].includes(application.id));
assert.equal(parallelApplications.length, 2, '不同申请并发通过后不得整数组覆盖丢失申请');
assert.equal(parallelApplications.every((application) => application.status === zh.approved && Boolean(application.orderId)), true);
const parallelOrders = (await orderApi.fetchOrders({ pageSize: 20 })).data.items;
assert.equal(parallelOrders.length, 2, '不同申请并发通过必须各生成一张正式订单');
assert.equal(new Set(parallelOrders.map((order) => order.sourceApplicationId)).size, 2);
const parallelDeliveries = JSON.parse(storage.getItem(STORAGE_KEYS.DELIVERIES) || '[]') as Array<{ orderId: string }>;
assert.equal(parallelDeliveries.length, 2, '不同申请并发通过必须各生成一套交付副作用');
assert.equal(new Set(parallelDeliveries.map((delivery) => delivery.orderId)).size, 2);
const parallelCommissions = JSON.parse(storage.getItem(STORAGE_KEYS.COMMISSIONS) || '[]') as Commission[];
const parallelCommissionCounts = parallelOrders.map((order) => (
  parallelCommissions.filter((commission) => commission.orderId === order.id).length
));
assert.equal(parallelCommissionCounts.every((count) => count > 0), true, '不同申请并发通过必须各生成提成副作用');
assert.equal(new Set(parallelCommissionCounts).size, 1, '相同订单数据并发通过不得重复或丢失任一套提成');

seed('user-sales');
const approveReturnRaceSubmit = await orderReviewApi.submitOrderApplication({
  ...orderPayload,
  customerId: 'cust-approve-return-race',
  customerName: 'Approve Return Race Customer',
});
storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({ userId: 'user-finance', token: 'token-user-finance', remember: true, createdAt: now }));
const approveBeforeReturn = orderReviewApi.approveOrderApplication(approveReturnRaceSubmit.data.id);
await new Promise((resolve) => setTimeout(resolve, 200));
const [approveRaceResult, returnRaceResult] = await Promise.all([
  approveBeforeReturn,
  orderReviewApi.returnOrderApplication(approveReturnRaceSubmit.data.id, '并发退回'),
]);
assert.equal(approveRaceResult.code, 0, '先进入全局审核锁的通过操作应成功');
assert.notEqual(returnRaceResult.code, 0, '同一申请通过后，并发退回必须在锁内重读并失败');
const approveReturnRaceApplication = await orderReviewApi.fetchOrderApplicationById(approveReturnRaceSubmit.data.id);
assert.equal(approveReturnRaceApplication.data?.status, zh.approved);
assert.deepEqual(approveReturnRaceApplication.data?.reviewLogs.map((log) => log.action), ['approve', 'submit']);
assert.equal((await orderApi.fetchOrders({ pageSize: 20 })).data.items.length, 1);
assert.equal((JSON.parse(storage.getItem(STORAGE_KEYS.DELIVERIES) || '[]') as unknown[]).length, 1);
assert.equal((JSON.parse(storage.getItem(STORAGE_KEYS.COMMISSIONS) || '[]') as Commission[]).length > 0, true);

seed('user-sales');
const approveRejectRaceSubmit = await orderReviewApi.submitOrderApplication({
  ...orderPayload,
  customerId: 'cust-approve-reject-race',
  customerName: 'Approve Reject Race Customer',
});
storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({ userId: 'user-finance', token: 'token-user-finance', remember: true, createdAt: now }));
const approveBeforeReject = orderReviewApi.approveOrderApplication(approveRejectRaceSubmit.data.id);
await new Promise((resolve) => setTimeout(resolve, 200));
const [approveRejectResult, rejectRaceResult] = await Promise.all([
  approveBeforeReject,
  orderReviewApi.rejectOrderApplication(approveRejectRaceSubmit.data.id, '并发驳回'),
]);
assert.equal(approveRejectResult.code, 0, '先进入全局审核锁的通过操作应成功');
assert.notEqual(rejectRaceResult.code, 0, '同一申请通过后，并发驳回必须在锁内重读并失败');
const approveRejectRaceApplication = await orderReviewApi.fetchOrderApplicationById(approveRejectRaceSubmit.data.id);
assert.equal(approveRejectRaceApplication.data?.status, zh.approved);
assert.deepEqual(approveRejectRaceApplication.data?.reviewLogs.map((log) => log.action), ['approve', 'submit']);
assert.equal((await orderApi.fetchOrders({ pageSize: 20 })).data.items.length, 1);
assert.equal((JSON.parse(storage.getItem(STORAGE_KEYS.DELIVERIES) || '[]') as unknown[]).length, 1);
assert.equal((JSON.parse(storage.getItem(STORAGE_KEYS.COMMISSIONS) || '[]') as Commission[]).length > 0, true);

seed('user-sales');
const directOrderNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
const [directSameSourceA, directSameSourceB] = await (async () => {
  try {
    return await Promise.all([
      orderApi.createOrder({
        ...orderPayload,
        sourceApplicationId: 'oa-direct-concurrent-same-source',
      }),
      orderApi.createOrder({
        ...orderPayload,
        sourceApplicationId: 'oa-direct-concurrent-same-source',
      }),
    ]);
  } finally {
    if (directOrderNavigatorDescriptor) Object.defineProperty(globalThis, 'navigator', directOrderNavigatorDescriptor);
  }
})();
assert.equal(directSameSourceA.code, 0);
assert.equal(directSameSourceB.code, 0);
assert.equal(directSameSourceB.data.id, directSameSourceA.data.id, '同源并发直接建单必须返回同一张正式订单');
const directSameSourceOrders = (await orderApi.fetchOrders({ pageSize: 20 })).data.items;
assert.equal(directSameSourceOrders.length, 1, '同源并发直接建单只能生成一张正式订单');
const directSameSourceDeliveries = JSON.parse(storage.getItem(STORAGE_KEYS.DELIVERIES) || '[]') as Array<{ orderId: string }>;
assert.equal(directSameSourceDeliveries.length, 1, '同源并发直接建单只能生成一套交付副作用');
assert.equal(directSameSourceDeliveries[0].orderId, directSameSourceOrders[0].id);
const directSameSourceCommissions = JSON.parse(storage.getItem(STORAGE_KEYS.COMMISSIONS) || '[]') as Commission[];
assert.equal(directSameSourceCommissions.length > 0, true);
assert.deepEqual(
  [...new Set(directSameSourceCommissions.map((commission) => commission.orderId))],
  [directSameSourceOrders[0].id],
  '同源并发直接建单只能生成一套提成副作用',
);
const directSameSourceCustomer = (JSON.parse(storage.getItem(STORAGE_KEYS.CUSTOMERS) || '[]') as any[])
  .find((customer) => customer.id === orderPayload.customerId);
assert.equal(directSameSourceCustomer.orderCount, 1);
assert.equal(directSameSourceCustomer.growthPath.length, 1);
assert.equal(directSameSourceCustomer.activityRecords.length, 1);

seed('user-sales');
const concurrentFailureOriginalSetItem = storage.setItem;
let concurrentFirstDeliveryWriteFailed = false;
storage.setItem = (key: string, value: string) => {
  if (!concurrentFirstDeliveryWriteFailed && key === STORAGE_KEYS.DELIVERIES) {
    concurrentFirstDeliveryWriteFailed = true;
    throw new Error('injected first concurrent delivery write failure');
  }
  return concurrentFailureOriginalSetItem(key, value);
};
const [directFailedSource, directSuccessfulSource] = await Promise.all([
  orderApi.createOrder({
    ...orderPayload,
    sourceApplicationId: 'oa-direct-concurrent-failed-source',
  }),
  orderApi.createOrder({
    ...orderPayload,
    sourceApplicationId: 'oa-direct-concurrent-success-source',
  }),
]);
storage.setItem = concurrentFailureOriginalSetItem;
assert.equal(concurrentFirstDeliveryWriteFailed, true);
assert.notEqual(directFailedSource.code, 0, '首个直接建单故障必须返回失败');
assert.equal(directSuccessfulSource.code, 0, directSuccessfulSource.message);
const directAfterFailureOrders = (await orderApi.fetchOrders({ pageSize: 20 })).data.items;
assert.equal(directAfterFailureOrders.length, 1, '首个事务回滚不得覆盖随后成功的不同来源订单');
assert.equal(directAfterFailureOrders[0].sourceApplicationId, 'oa-direct-concurrent-success-source');
const directAfterFailureDeliveries = JSON.parse(storage.getItem(STORAGE_KEYS.DELIVERIES) || '[]') as Array<{ orderId: string }>;
assert.equal(directAfterFailureDeliveries.length, 1);
assert.equal(directAfterFailureDeliveries[0].orderId, directSuccessfulSource.data.id);
const directAfterFailureCommissions = JSON.parse(storage.getItem(STORAGE_KEYS.COMMISSIONS) || '[]') as Commission[];
assert.equal(directAfterFailureCommissions.length > 0, true, '旧快照回滚不得清掉随后成功订单的提成');
assert.equal(directAfterFailureCommissions.every((commission) => commission.orderId === directSuccessfulSource.data.id), true);
const directAfterFailureCustomer = (JSON.parse(storage.getItem(STORAGE_KEYS.CUSTOMERS) || '[]') as any[])
  .find((customer) => customer.id === orderPayload.customerId);
assert.equal(directAfterFailureCustomer.orderCount, 1);
assert.equal(directAfterFailureCustomer.growthPath.length, 1);
assert.equal(directAfterFailureCustomer.activityRecords.length, 1);

seed('user-sales');
const concurrentUpdateTarget = await orderApi.createOrder({
  ...orderPayload,
  sourceApplicationId: 'oa-concurrent-update-target',
});
assert.equal(concurrentUpdateTarget.code, 0);
const concurrentUpdateOriginalSetItem = storage.setItem;
let concurrentUpdateCreateFailed = false;
storage.setItem = (key: string, value: string) => {
  if (!concurrentUpdateCreateFailed && key === STORAGE_KEYS.DELIVERIES) {
    concurrentUpdateCreateFailed = true;
    throw new Error('injected create failure during concurrent update');
  }
  return concurrentUpdateOriginalSetItem(key, value);
};
const [concurrentFailedCreate, concurrentSuccessfulUpdate] = await Promise.all([
  orderApi.createOrder({
    ...orderPayload,
    sourceApplicationId: 'oa-concurrent-update-failed-create',
  }),
  orderApi.updateOrder(concurrentUpdateTarget.data.id, {
    notes: '并发修改必须在建单回滚后保留',
  }),
]);
storage.setItem = concurrentUpdateOriginalSetItem;
assert.equal(concurrentUpdateCreateFailed, true);
assert.notEqual(concurrentFailedCreate.code, 0);
assert.equal(concurrentSuccessfulUpdate.code, 0);
assert.equal(concurrentSuccessfulUpdate.data?.notes, '并发修改必须在建单回滚后保留');
const persistedConcurrentUpdate = await orderApi.fetchOrderById(concurrentUpdateTarget.data.id);
assert.equal(
  persistedConcurrentUpdate.data?.notes,
  '并发修改必须在建单回滚后保留',
  '建单事务的旧快照回滚不得覆盖同时成功的订单修改',
);
assert.equal((await orderApi.fetchOrders({ pageSize: 20 })).data.items.length, 1);

seed('user-sales');
const atomicStorageKeys = [
  STORAGE_KEYS.ORDERS,
  STORAGE_KEYS.COMMISSIONS,
  STORAGE_KEYS.DELIVERIES,
  STORAGE_KEYS.CUSTOMERS,
  STORAGE_KEYS.LEADS,
] as const;
const atomicSnapshot = new Map(atomicStorageKeys.map((key) => [key, storage.getItem(key)]));
const originalStorageSetItem = storage.setItem;
let deliveryWriteFailed = false;
storage.setItem = (key: string, value: string) => {
  if (!deliveryWriteFailed && key === STORAGE_KEYS.DELIVERIES) {
    deliveryWriteFailed = true;
    throw new Error('injected delivery write failure');
  }
  return originalStorageSetItem(key, value);
};
const failedAtomicCreate = await orderApi.createOrder({
  ...orderPayload,
  sourceApplicationId: 'oa-atomic-create',
}).catch((error: unknown) => ({
  code: -1,
  data: null,
  message: error instanceof Error ? error.message : 'injected failure',
}));
storage.setItem = originalStorageSetItem;
assert.equal(deliveryWriteFailed, true, '故障必须发生在客户统计和提成写入之后的交付写入阶段');
assert.notEqual(failedAtomicCreate.code, 0);
atomicStorageKeys.forEach((key) => {
  assert.equal(storage.getItem(key), atomicSnapshot.get(key), `建单失败后 ${key} 必须精确回滚`);
});

let customerWriteCount = 0;
let lifecycleWriteFailed = false;
storage.setItem = (key: string, value: string) => {
  if (key === STORAGE_KEYS.CUSTOMERS) {
    customerWriteCount += 1;
    if (customerWriteCount === 2) {
      lifecycleWriteFailed = true;
      throw new Error('injected lifecycle write failure');
    }
  }
  return originalStorageSetItem(key, value);
};
const failedLifecycleCreate = await orderApi.createOrder({
  ...orderPayload,
  sourceApplicationId: 'oa-atomic-lifecycle-create',
}).catch((error: unknown) => ({
  code: -1,
  data: null,
  message: error instanceof Error ? error.message : 'injected failure',
}));
storage.setItem = originalStorageSetItem;
assert.equal(lifecycleWriteFailed, true, '故障必须发生在订单、交付和客户统计均已写入后的生命周期阶段');
assert.notEqual(failedLifecycleCreate.code, 0);
atomicStorageKeys.forEach((key) => {
  assert.equal(storage.getItem(key), atomicSnapshot.get(key), `生命周期写入失败后 ${key} 必须精确回滚`);
});

const atomicRetry = await orderApi.createOrder({
  ...orderPayload,
  sourceApplicationId: 'oa-atomic-create',
});
assert.equal(atomicRetry.code, 0, atomicRetry.message);
assert.equal((JSON.parse(storage.getItem(STORAGE_KEYS.ORDERS) || '[]') as unknown[]).length, 1);
const atomicRetryDeliveries = JSON.parse(storage.getItem(STORAGE_KEYS.DELIVERIES) || '[]') as Array<{ orderId: string }>;
assert.equal(atomicRetryDeliveries.length, 1);
assert.equal(atomicRetryDeliveries[0].orderId, atomicRetry.data.id);
const atomicRetryCommissions = JSON.parse(storage.getItem(STORAGE_KEYS.COMMISSIONS) || '[]') as Commission[];
assert.equal(atomicRetryCommissions.length > 0, true);
assert.equal(atomicRetryCommissions.every((commission) => commission.orderId === atomicRetry.data.id), true);
const atomicRetryCustomer = (JSON.parse(storage.getItem(STORAGE_KEYS.CUSTOMERS) || '[]') as any[])
  .find((customer) => customer.id === orderPayload.customerId);
assert.equal(atomicRetryCustomer.orderCount, 1);
assert.equal(atomicRetryCustomer.totalSpent, orderPayload.actualAmount);
assert.equal(atomicRetryCustomer.growthPath.filter((item: { orderId?: string }) => item.orderId === atomicRetry.data.id).length, 1);
assert.equal(atomicRetryCustomer.activityRecords.filter((item: { relatedId?: string }) => item.relatedId === atomicRetry.data.id).length, 1);
const successfulAtomicSnapshot = new Map(atomicStorageKeys.map((key) => [key, storage.getItem(key)]));
const atomicIdempotentRetry = await orderApi.createOrder({
  ...orderPayload,
  sourceApplicationId: 'oa-atomic-create',
});
assert.equal(atomicIdempotentRetry.code, 0);
assert.equal(atomicIdempotentRetry.data.id, atomicRetry.data.id);
atomicStorageKeys.forEach((key) => {
  assert.equal(storage.getItem(key), successfulAtomicSnapshot.get(key), `幂等重试不得重复写入 ${key}`);
});

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
assert.deepEqual(
  (await orderReviewApi.fetchOrderApplications({ pageSize: 20 })).data.items.map((item) => item.id),
  [],
  '审核页面只读权限不得绕过 self 数据范围',
);

storage.setItem(STORAGE_KEYS.ROLES, JSON.stringify([
  { id: 'role-sales', name: zh.sales, code: 'sales_consultant', permissions: [], memberCount: 1, isActive: true, createdAt: now, updatedAt: now },
  { id: 'role-finance-viewer', name: '财务审核查看员', code: 'finance_viewer', permissions: [{ module: PERMISSION_KEYS.ORDER_REVIEW, actions: ['read'] }], dataScopes: { orderApplications: 'all', orders: 'all' }, memberCount: 1, isActive: true, createdAt: now, updatedAt: now },
]));
storage.setItem(STORAGE_KEYS.USERS, JSON.stringify(
  (JSON.parse(storage.getItem(STORAGE_KEYS.USERS) || '[]') as any[]).map((user) => (
    user.id === 'user-finance'
      ? { ...user, role: '财务审核查看员', roleId: 'role-finance-viewer' }
      : user
  )),
));
assert.deepEqual((await orderReviewApi.fetchOrderApplications({ pageSize: 20 })).data.items.map((item) => item.id), [permissionReviewSubmit.data.id]);
const financeWithPermissionApprove = await orderReviewApi.approveOrderApplication(permissionReviewSubmit.data.id);
assert.equal(financeWithPermissionApprove.code, 403, '只读审核权限不得执行审批写操作');

storage.setItem(STORAGE_KEYS.ROLES, JSON.stringify([
  { id: 'role-sales', name: zh.sales, code: 'sales_consultant', permissions: [], memberCount: 1, isActive: true, createdAt: now, updatedAt: now },
  { id: 'role-finance-viewer', name: '财务审核查看员', code: 'finance_viewer', permissions: [{ module: PERMISSION_KEYS.ORDER_REVIEW, actions: ['read', 'write'] }], dataScopes: { orderApplications: 'all', orders: 'all' }, memberCount: 1, isActive: true, createdAt: now, updatedAt: now },
]));
const financeWriteRole = (JSON.parse(storage.getItem(STORAGE_KEYS.ROLES) || '[]') as any[])[1];
assert.equal(roleHasPermission(financeWriteRole, PERMISSION_KEYS.ORDER_REVIEW, 'write'), true);
assert.equal(canReviewOrderApplications(), true);
const financeWithWritePermissionApprove = await orderReviewApi.approveOrderApplication(permissionReviewSubmit.data.id);
assert.equal(financeWithWritePermissionApprove.code, 0, financeWithWritePermissionApprove.message);
assert.equal(financeWithWritePermissionApprove.data?.status, zh.approved);

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
