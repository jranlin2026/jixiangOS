import assert from 'node:assert/strict';
import { orderReviewApi } from './orderReviewApi';
import { clearBackendToken, writeBackendToken } from './backendClient';
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
const now = '2026-07-12T08:00:00.000Z';
const application: OrderApplication = {
  id: 'oa-backend-approval',
  applicationNo: 'OAPP-20260712-0001',
  status: '已入库',
  orderData: {
    customerId: 'customer-1',
    customerName: '客户A',
    productLevel: '899',
    orderType: '新购',
    amount: 899,
    actualAmount: 899,
    paymentMethod: '对公转账',
    status: '已确认',
    refundStatus: '无',
    owner: '销售A',
    payments: [],
  },
  applicantId: 'user-sales',
  applicantName: '销售A',
  submittedAt: now,
  reviewerId: 'user-finance',
  reviewerName: '财务A',
  reviewedAt: now,
  orderId: 'order-backend-approval',
  orderNo: 'ORD-20260712-BACKEND',
  reviewLogs: [],
  createdAt: now,
  updatedAt: now,
};
const order: Order = {
  ...application.orderData,
  id: application.orderId!,
  orderNo: application.orderNo!,
  createdAt: now,
  updatedAt: now,
};

try {
  process.env.VITE_USE_BACKEND_API = 'true';
  process.env.VITE_AI_API_BASE = 'http://127.0.0.1:3001/api';
  storage.clear();
  storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
  storage.setItem(STORAGE_KEYS.ORDER_APPLICATIONS, JSON.stringify([{ ...application, status: '待财务审核' }]));
  storage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify([]));
  writeBackendToken('finance-session');

  const requests: Array<{ url: string; method: string }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = String(init?.method || 'GET');
    requests.push({ url, method });
    if (method === 'POST' && url.endsWith('/order-applications/oa-backend-approval/approve')) {
      return new Response(JSON.stringify({
        code: 0,
        data: {
          application,
          order,
          replayed: false,
          downstreamEffects: {
            customerOrderStats: 'applied',
            commissionGeneration: 'applied',
            deliveryCreation: 'applied',
            customerLifecycle: 'applied',
          },
        },
        message: 'success',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ code: 404, data: null, message: 'unexpected request' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  const result = await orderReviewApi.approveOrderApplication(application.id);
  assert.equal(result.code, 0);
  assert.equal(result.data?.status, '已入库');
  assert.deepEqual(requests, [{
    url: 'http://127.0.0.1:3001/api/order-applications/oa-backend-approval/approve',
    method: 'POST',
  }]);
  assert.equal(requests.some((request) => request.method === 'PUT' && request.url.includes('/storage/')), false);
  assert.equal(
    (JSON.parse(storage.getItem(STORAGE_KEYS.ORDER_APPLICATIONS) || '[]') as OrderApplication[])[0].status,
    '已入库',
  );
  assert.equal(
    (JSON.parse(storage.getItem(STORAGE_KEYS.ORDERS) || '[]') as Order[])[0].id,
    order.id,
  );
} finally {
  clearBackendToken();
  globalThis.fetch = originalFetch;
  if (originalUseBackend === undefined) delete process.env.VITE_USE_BACKEND_API;
  else process.env.VITE_USE_BACKEND_API = originalUseBackend;
  if (originalApiBase === undefined) delete process.env.VITE_AI_API_BASE;
  else process.env.VITE_AI_API_BASE = originalApiBase;
}
