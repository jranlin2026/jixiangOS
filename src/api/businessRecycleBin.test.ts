import assert from 'node:assert/strict';
import { businessRecycleBinApi, customerApi, leadApi, orderApi } from './index';
import { AUTH_SESSION_STORAGE_KEY } from '../shared/utils/auth';
import { STORAGE_KEYS } from '../shared/utils/constants';
import type { Commission } from '../types/commission';
import type { Customer } from '../types/customer';
import type { Lead } from '../types/lead';
import type { Order } from '../types/order';
import type { User } from '../types/settings';

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

const now = '2026-06-27T10:00:00.000Z';
const zh = {
  superAdmin: '\u8d85\u7ea7\u7ba1\u7406\u5458',
  sales: '\u9500\u552e',
  product: '\u4ee3\u7406',
  orderType: '\u65b0\u4ee3\u7406',
  confirmed: '\u5df2\u786e\u8ba4',
  refundNone: '\u65e0',
  bankTransfer: '\u5bf9\u516c\u8f6c\u8d26',
  pendingConfirm: '\u5f85\u786e\u8ba4',
  pendingPay: '\u5f85\u53d1\u653e',
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

function lead(overrides: Partial<Lead> & Pick<Lead, 'id' | 'name' | 'phone'>): Lead {
  return {
    company: 'Lead Company',
    source: '\u5b98\u7f51',
    status: '\u65b0\u7ebf\u7d22',
    owner: 'Sales A',
    followUpRecords: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as Lead;
}

function customer(overrides: Partial<Customer> & Pick<Customer, 'id' | 'name'>): Customer {
  return {
    company: `${overrides.name} Company`,
    phone: '13900000000',
    customerLevel: 'L1',
    owner: 'Sales A',
    totalSpent: 0,
    orderCount: 0,
    growthPath: [],
    growthRecords: [],
    activityRecords: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as Customer;
}

function order(overrides: Partial<Order> & Pick<Order, 'id' | 'orderNo' | 'customerId' | 'customerName'>): Order {
  return {
    productLevel: zh.product,
    orderType: zh.orderType,
    amount: 9800,
    actualAmount: 9800,
    paymentMethod: zh.bankTransfer,
    status: zh.confirmed,
    refundStatus: zh.refundNone,
    owner: 'Sales A',
    payments: [{
      id: `pay-${overrides.id}`,
      amount: 9800,
      paymentMethod: zh.bankTransfer,
      paidAt: now,
    }],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as Order;
}

function commission(overrides: Partial<Commission> & Pick<Commission, 'id' | 'orderId' | 'orderNo' | 'status'>): Commission {
  return {
    customerName: 'Customer A',
    productLevel: zh.product,
    orderAmount: 9800,
    commissionRate: 0,
    commissionAmount: 100,
    performanceAmount: 9800,
    resourceOwnership: '\u516c\u53f8\u8d44\u6e90',
    role: zh.sales,
    owner: 'Sales A',
    ownerId: 'user-sales',
    department: '\u9500\u552e\u90e8',
    paymentDate: now,
    sourceType: '\u81ea\u52a8\u89c4\u5219',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as Commission;
}

function loginAs(userId: string) {
  storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
    userId,
    token: `session-${userId}`,
    remember: false,
    createdAt: now,
    expiresAt: '2099-01-01T00:00:00.000Z',
  }));
}

function seed() {
  storage.clear();
  storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
  storage.setItem(STORAGE_KEYS.USERS, JSON.stringify([
    user({ id: 'user-admin', name: 'Admin', role: zh.superAdmin }),
    user({ id: 'user-sales', name: 'Sales A', role: zh.sales }),
  ]));
  storage.setItem(STORAGE_KEYS.LEADS, JSON.stringify([
    lead({ id: 'lead-a', name: 'Lead A', phone: '13900000001' }),
  ]));
  storage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([
    customer({ id: 'cust-a', name: 'Customer A', phone: '13900000002' }),
    customer({ id: 'cust-b', name: 'Customer B', phone: '13900000003' }),
  ]));
  storage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify([
    order({ id: 'order-a', orderNo: 'ORD-A', customerId: 'cust-a', customerName: 'Customer A' }),
    order({ id: 'order-b', orderNo: 'ORD-B', customerId: 'cust-b', customerName: 'Customer B' }),
  ]));
  storage.setItem(STORAGE_KEYS.COMMISSIONS, JSON.stringify([
    commission({ id: 'comm-order-b', orderId: 'order-b', orderNo: 'ORD-B', status: zh.pendingPay }),
  ]));
  loginAs('user-admin');
}

seed();

const deleteLeadRes = await leadApi.deleteLead('lead-a', 'duplicate lead');
assert.equal(deleteLeadRes.code, 0);
assert.equal((await leadApi.fetchLeads({ pageSize: 50 })).data.items.some((item) => item.id === 'lead-a'), false);

let recycleList = await businessRecycleBinApi.fetchRecycleBinItems({ type: 'lead', pageSize: 50 });
assert.equal(recycleList.code, 0);
assert.equal(recycleList.data.items.length, 1);
assert.equal(recycleList.data.items[0].id, 'lead-a');
assert.equal(recycleList.data.items[0].deleteReason, 'duplicate lead');

const restoreLeadRes = await businessRecycleBinApi.restoreRecycleBinItem('lead', 'lead-a');
assert.equal(restoreLeadRes.code, 0);
assert.equal((await leadApi.fetchLeads({ pageSize: 50 })).data.items.some((item) => item.id === 'lead-a'), true);

await leadApi.deleteLead('lead-a', 'cleanup lead');
const purgeLeadRes = await businessRecycleBinApi.permanentlyDeleteRecycleBinItem('lead', 'lead-a', 'confirmed cleanup');
assert.equal(purgeLeadRes.code, 0);
recycleList = await businessRecycleBinApi.fetchRecycleBinItems({ type: 'lead', pageSize: 50 });
assert.equal(recycleList.data.items.length, 0);
assert.equal((JSON.parse(storage.getItem(STORAGE_KEYS.LEADS) || '[]') as Lead[]).some((item) => item.id === 'lead-a'), false);

const deleteCustomerWithOrder = await customerApi.deleteCustomer('cust-a', 'has order');
assert.notEqual(deleteCustomerWithOrder.code, 0);
assert.match(deleteCustomerWithOrder.message || '', /\u8ba2\u5355|\u5173\u8054/);

const deleteOrderWithPayableCommission = await orderApi.deleteOrder('order-b', 'has payable commission');
assert.notEqual(deleteOrderWithPayableCommission.code, 0);
assert.match(deleteOrderWithPayableCommission.message || '', /\u5206\u8d26|\u63d0\u6210|\u51b2\u9500/);

const deleteOrderRes = await orderApi.deleteOrder('order-a', 'wrong order');
assert.equal(deleteOrderRes.code, 0);
assert.equal((await orderApi.fetchOrders({ pageSize: 50 })).data.items.some((item) => item.id === 'order-a'), false);
const recycleOrders = await businessRecycleBinApi.fetchRecycleBinItems({ type: 'order', pageSize: 50 });
assert.equal(recycleOrders.data.items.some((item) => item.id === 'order-a'), true);

loginAs('user-sales');
const nonAdminList = await businessRecycleBinApi.fetchRecycleBinItems({ pageSize: 50 });
assert.notEqual(nonAdminList.code, 0);
const nonAdminRestore = await businessRecycleBinApi.restoreRecycleBinItem('order', 'order-a');
assert.notEqual(nonAdminRestore.code, 0);

const previousBackendFlag = process.env.VITE_USE_BACKEND_API;
process.env.VITE_USE_BACKEND_API = 'true';
seed();
storage.setItem(STORAGE_KEYS.LEADS, JSON.stringify([
  lead({
    id: 'lead-backend-purge',
    name: 'Backend Purge Lead',
    phone: '13900000009',
    deletedAt: now,
    deletedBy: 'Admin',
    deleteReason: 'backend purge guard',
  }),
]));
const blockedBackendPurge = await businessRecycleBinApi.permanentlyDeleteRecycleBinItem(
  'lead',
  'lead-backend-purge',
  'confirmed cleanup',
);
assert.notEqual(blockedBackendPurge.code, 0);
assert.match(blockedBackendPurge.message || '', /服务器|暂不支持/);
assert.equal(
  (JSON.parse(storage.getItem(STORAGE_KEYS.LEADS) || '[]') as Lead[]).some((item) => item.id === 'lead-backend-purge'),
  true,
);
if (previousBackendFlag === undefined) delete process.env.VITE_USE_BACKEND_API;
else process.env.VITE_USE_BACKEND_API = previousBackendFlag;
