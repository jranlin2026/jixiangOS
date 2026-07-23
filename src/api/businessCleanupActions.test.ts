import assert from 'node:assert/strict';
import { leadFlowApi, orderReviewApi } from './index';
import { AUTH_SESSION_STORAGE_KEY } from '../shared/utils/auth';
import { STORAGE_KEYS } from '../shared/utils/constants';
import type { LeadIntakeRecord } from '../types/lead';
import type { Order, OrderApplication } from '../types/order';
import type { User } from '../types/settings';
import {
  clearStorageSyncFailure,
  subscribeStorageSyncFailures,
} from './storageSyncStatus';

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

const now = '2026-06-27T12:00:00.000Z';
const zh = {
  superAdmin: '\u8d85\u7ea7\u7ba1\u7406\u5458',
  sales: '\u9500\u552e',
  approved: '\u5df2\u5165\u5e93',
  pendingReview: '\u5f85\u8d22\u52a1\u5ba1\u6838',
  confirmed: '\u5df2\u786e\u8ba4',
  refundNone: '\u65e0',
  bankTransfer: '\u5bf9\u516c\u8f6c\u8d26',
  success: '\u5165\u5e93\u6210\u529f',
  failed: '\u5165\u5e93\u5931\u8d25',
} as const;

function user(overrides: Partial<User> & Pick<User, 'id' | 'name' | 'role'>): User {
  return {
    account: overrides.id,
    email: '',
    phone: '',
    departmentId: 'dept-sales',
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as User;
}

function order(overrides: Partial<Order> & Pick<Order, 'id' | 'orderNo'>): Order {
  return {
    customerId: 'cust-a',
    customerName: 'Customer A',
    productLevel: '\u4ee3\u7406',
    orderType: '\u65b0\u4ee3\u7406',
    amount: 9800,
    actualAmount: 9800,
    paymentMethod: zh.bankTransfer,
    status: zh.confirmed,
    refundStatus: zh.refundNone,
    owner: 'Sales A',
    payments: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as Order;
}

function application(overrides: Partial<OrderApplication> & Pick<OrderApplication, 'id' | 'applicationNo' | 'status'>): OrderApplication {
  return {
    orderData: {
      customerId: 'cust-a',
      customerName: 'Customer A',
      productLevel: '\u4ee3\u7406',
      orderType: '\u65b0\u4ee3\u7406',
      amount: 9800,
      actualAmount: 9800,
      paymentMethod: zh.bankTransfer,
      status: zh.confirmed,
      refundStatus: zh.refundNone,
      owner: 'Sales A',
      payments: [],
    } as any,
    applicantId: 'user-sales',
    applicantName: 'Sales A',
    submittedAt: now,
    reviewLogs: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as OrderApplication;
}

function intakeRecord(overrides: Partial<LeadIntakeRecord> & Pick<LeadIntakeRecord, 'id' | 'name' | 'status'>): LeadIntakeRecord {
  return {
    phone: '13900000001',
    source: '\u5b98\u7f51',
    inputBy: 'Sales A',
    matchedRule: '\u6d4b\u8bd5\u89c4\u5219',
    createdAt: now,
    ...overrides,
  } as LeadIntakeRecord;
}

function loginAs(userId: string) {
  storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
    userId,
    token: `token-${userId}`,
    remember: true,
    createdAt: now,
  }));
}

function seed() {
  storage.clear();
  storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
  storage.setItem(STORAGE_KEYS.USERS, JSON.stringify([
    user({ id: 'user-admin', name: 'Admin', role: zh.superAdmin }),
    user({ id: 'user-sales', name: 'Sales A', role: zh.sales }),
  ]));
  storage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify([
    order({ id: 'order-active', orderNo: 'ORD-ACTIVE' }),
    order({ id: 'order-deleted', orderNo: 'ORD-DELETED', deletedAt: now, deletedBy: 'Admin', deleteReason: 'test cleanup' }),
  ]));
  storage.setItem(STORAGE_KEYS.ORDER_APPLICATIONS, JSON.stringify([
    application({ id: 'app-active', applicationNo: 'OAPP-ACTIVE', status: zh.approved, orderId: 'order-active', orderNo: 'ORD-ACTIVE' }),
    application({ id: 'app-deleted', applicationNo: 'OAPP-DELETED', status: zh.approved, orderId: 'order-deleted', orderNo: 'ORD-DELETED' }),
    application({ id: 'app-pending', applicationNo: 'OAPP-PENDING', status: zh.pendingReview }),
  ]));
  storage.setItem(STORAGE_KEYS.LEAD_INTAKE_RECORDS, JSON.stringify([
    intakeRecord({ id: 'intake-a', name: 'Lead A', status: zh.success }),
    intakeRecord({ id: 'intake-b', name: 'Lead B', status: zh.failed, failureReason: 'duplicate' }),
  ]));
}

seed();

loginAs('user-sales');
const salesCleanupApp = await orderReviewApi.cleanupDeletedSourceOrderApplication('app-deleted', 'cleanup stale approved application');
assert.notEqual(salesCleanupApp.code, 0);
const salesCleanupIntake = await leadFlowApi.cleanupIntakeRecord('intake-a', 'cleanup intake');
assert.notEqual(salesCleanupIntake.code, 0);

loginAs('user-admin');
const cleanupWithoutReason = await orderReviewApi.cleanupDeletedSourceOrderApplication('app-deleted', '');
assert.notEqual(cleanupWithoutReason.code, 0);
const cleanupActiveApplication = await orderReviewApi.cleanupDeletedSourceOrderApplication('app-active', 'active order still exists');
assert.notEqual(cleanupActiveApplication.code, 0);
const cleanupPendingApplication = await orderReviewApi.cleanupDeletedSourceOrderApplication('app-pending', 'not approved');
assert.notEqual(cleanupPendingApplication.code, 0);

const cleanupApplication = await orderReviewApi.cleanupDeletedSourceOrderApplication('app-deleted', 'cleanup stale approved application');
assert.equal(cleanupApplication.code, 0);
const applicationsAfterCleanup = await orderReviewApi.fetchOrderApplications({ pageSize: 20 });
assert.equal(applicationsAfterCleanup.data.items.some((item) => item.id === 'app-deleted'), false);
assert.equal((JSON.parse(storage.getItem(STORAGE_KEYS.ORDER_APPLICATIONS) || '[]') as OrderApplication[]).some((item) => item.id === 'app-deleted'), false);

const cleanupIntakeWithoutReason = await leadFlowApi.cleanupIntakeRecord('intake-a', '');
assert.notEqual(cleanupIntakeWithoutReason.code, 0);
const cleanupIntake = await leadFlowApi.cleanupIntakeRecord('intake-a', 'wrong test intake');
assert.equal(cleanupIntake.code, 0);
const intakeAfterCleanup = await leadFlowApi.fetchIntakeRecords({ pageSize: 20 });
assert.equal(intakeAfterCleanup.data.items.some((item) => item.id === 'intake-a'), false);
assert.equal((JSON.parse(storage.getItem(STORAGE_KEYS.LEAD_INTAKE_RECORDS) || '[]') as LeadIntakeRecord[]).some((item) => item.id === 'intake-a'), false);

// Production uses command-only storage for order applications. Cleanup must
// call a record-level backend command instead of attempting a legacy table save.
seed();
loginAs('user-admin');
process.env.VITE_USE_BACKEND_API = 'true';
const backendRequests: Array<{ url: string; method: string; body: string }> = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  backendRequests.push({
    url: String(input),
    method: String(init?.method || 'GET'),
    body: String(init?.body || ''),
  });
  return new Response(JSON.stringify({ code: 0, message: 'success', data: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}) as typeof fetch;
const syncFailures: string[] = [];
const unsubscribeSyncFailure = subscribeStorageSyncFailures((failure) => {
  if (failure) syncFailures.push(failure.message);
});
const productionCleanup = await orderReviewApi.cleanupDeletedSourceOrderApplication(
  'app-deleted',
  'cleanup stale approved application',
);
await Promise.resolve();
unsubscribeSyncFailure();
clearStorageSyncFailure();
delete process.env.VITE_USE_BACKEND_API;
globalThis.fetch = originalFetch;
assert.equal(productionCleanup.code, 0);
assert.deepEqual(backendRequests, [{
  url: '/api/order-applications/app-deleted',
  method: 'DELETE',
  body: JSON.stringify({ reason: 'cleanup stale approved application' }),
}]);
assert.equal(
  syncFailures.some((message) => message.includes('aaos_order_applications 只能通过记录级命令保存')),
  false,
  '生产清理不得触发 command-only legacy 整表写错误',
);
