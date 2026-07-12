import assert from 'node:assert/strict';
import { clearBackendToken, writeBackendToken } from './backendClient';
import { orderApi } from './orderApi';
import { orderReviewApi } from './orderReviewApi';
import { STORAGE_KEYS } from '../shared/utils/constants';
import type { Order, OrderApplication } from '../types/order';

const values = new Map<string, string>();
const storage = {
  get length() { return values.size; },
  key: (index: number) => Array.from(values.keys())[index] ?? null,
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
  removeItem: (key: string) => values.delete(key),
  clear: () => values.clear(),
};
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

const originalFetch = globalThis.fetch;
const originalUseBackend = process.env.VITE_USE_BACKEND_API;
const originalApiBase = process.env.VITE_AI_API_BASE;
const now = '2026-07-12T16:00:00.000Z';

function order(id: string): Order {
  return {
    id,
    orderNo: `ORD-${id}`,
    customerId: 'customer-visible',
    customerName: '可见客户',
    productLevel: '899',
    orderType: '899成交',
    amount: 899,
    actualAmount: 899,
    paymentMethod: '对公转账',
    status: '已确认',
    refundStatus: '无',
    owner: '销售A',
    salesId: 'user-sales',
    salesName: '销售A',
    payments: [],
    createdAt: now,
    updatedAt: now,
  };
}

function application(id: string): OrderApplication {
  const source = order(`draft-${id}`);
  const { id: _id, orderNo: _orderNo, createdAt: _createdAt, updatedAt: _updatedAt, ...orderData } = source;
  return {
    id,
    applicationNo: `OAPP-${id}`,
    status: '待财务审核',
    orderData,
    applicantId: 'user-sales',
    applicantName: '销售A',
    submittedAt: now,
    reviewLogs: [],
    createdAt: now,
    updatedAt: now,
  };
}

try {
  process.env.VITE_USE_BACKEND_API = 'true';
  process.env.VITE_AI_API_BASE = 'http://127.0.0.1:3001/api';
  storage.clear();
  storage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify([order('stale-other-user-order')]));
  storage.setItem(STORAGE_KEYS.ORDER_APPLICATIONS, JSON.stringify([application('stale-other-user-application')]));
  storage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify([]));
  writeBackendToken('sales-session');

  const listedOrder = order('listed-order');
  const detailOrder = order('detail-order');
  const listedApplication = application('listed-application');
  const detailApplication = application('detail-application');
  const backendStats = {
    todayAmount: 899,
    todayCount: 1,
    monthAmount: 1798,
    monthCount: 2,
    refundCount: 0,
    refundAmount: 0,
    upgradeCount: 0,
    upgradeAmount: 0,
  };
  const requests: Array<{ url: string; method: string }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = String(init?.method || 'GET');
    requests.push({ url, method });
    let data: unknown = null;
    if (url.includes('/orders?')) {
      data = { items: [listedOrder], pagination: { page: 2, pageSize: 5, total: 6, totalPages: 2 } };
    } else if (url.endsWith('/orders/stats')) {
      data = backendStats;
    } else if (url.endsWith('/orders/detail-order')) {
      data = detailOrder;
    } else if (url.includes('/order-applications?')) {
      data = { items: [listedApplication], pagination: { page: 3, pageSize: 5, total: 11, totalPages: 3 } };
    } else if (url.endsWith('/order-applications/detail-application')) {
      data = detailApplication;
    }
    return new Response(JSON.stringify({ code: data ? 0 : 404, data, message: data ? 'success' : 'not found' }), {
      status: data ? 200 : 404,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  const listedOrders = await orderApi.fetchOrders({ search: '可见客户', page: 2, pageSize: 5 });
  assert.equal(listedOrders.code, 0);
  assert.deepEqual(listedOrders.data.items.map((item) => item.id), ['listed-order']);
  assert.equal(listedOrders.data.pagination.total, 6);
  assert.equal((await orderApi.fetchOrderById('detail-order')).data?.id, 'detail-order');
  assert.deepEqual((await orderApi.fetchOrderStats()).data, backendStats);

  const listedApplications = await orderReviewApi.fetchOrderApplications({ status: '待财务审核', page: 3, pageSize: 5 });
  assert.equal(listedApplications.code, 0);
  assert.deepEqual(listedApplications.data.items.map((item) => item.id), ['listed-application']);
  assert.equal(listedApplications.data.pagination.total, 11);
  assert.equal((await orderReviewApi.fetchOrderApplicationById('detail-application')).data?.id, 'detail-application');

  assert.equal(requests.some((request) => request.url.includes('/storage')), false);
  assert.ok(requests.every((request) => request.method === 'GET'));
  assert.match(requests[0].url, /\/orders\?/);
  assert.match(requests[0].url, /search=%E5%8F%AF%E8%A7%81%E5%AE%A2%E6%88%B7/);
  assert.match(requests[0].url, /page=2/);
  assert.equal(requests[2].url, 'http://127.0.0.1:3001/api/orders/stats');
  assert.match(requests[3].url, /\/order-applications\?/);
  assert.match(requests[3].url, /status=%E5%BE%85%E8%B4%A2%E5%8A%A1%E5%AE%A1%E6%A0%B8/);

  const cachedOrders = JSON.parse(storage.getItem(STORAGE_KEYS.ORDERS) || '[]') as Order[];
  const cachedApplications = JSON.parse(storage.getItem(STORAGE_KEYS.ORDER_APPLICATIONS) || '[]') as OrderApplication[];
  assert.ok(cachedOrders.some((item) => item.id === listedOrder.id));
  assert.ok(cachedOrders.some((item) => item.id === detailOrder.id));
  assert.ok(cachedApplications.some((item) => item.id === listedApplication.id));
  assert.ok(cachedApplications.some((item) => item.id === detailApplication.id));
} finally {
  clearBackendToken();
  globalThis.fetch = originalFetch;
  if (originalUseBackend === undefined) delete process.env.VITE_USE_BACKEND_API;
  else process.env.VITE_USE_BACKEND_API = originalUseBackend;
  if (originalApiBase === undefined) delete process.env.VITE_AI_API_BASE;
  else process.env.VITE_AI_API_BASE = originalApiBase;
}
