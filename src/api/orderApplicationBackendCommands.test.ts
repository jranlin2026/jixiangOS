import assert from 'node:assert/strict';
import { clearBackendToken, flushBackendStorageWrites, writeBackendToken } from './backendClient';
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
const now = '2026-07-12T12:00:00.000Z';
const orderData = {
  customerId: 'customer-1',
  customerName: '客户端客户名',
  productId: 'product-1',
  productName: '客户端产品名',
  productLevel: '899',
  orderType: '899成交',
  amount: 899,
  actualAmount: 899,
  paymentMethod: '对公转账',
  status: '已确认',
  refundStatus: '无',
  owner: '伪造销售',
  salesId: 'user-other',
  salesName: '伪造销售',
  payments: [],
} as OrderApplication['orderData'];

function application(id: string, status: OrderApplication['status']): OrderApplication {
  return {
    id,
    applicationNo: `OAPP-${id}`,
    status,
    orderData: {
      ...orderData,
      customerName: '数据库客户',
      productName: '数据库产品',
      owner: '销售小王',
      salesId: 'user-sales',
      salesName: '销售小王',
    },
    applicantId: 'user-sales',
    applicantName: '销售小王',
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
  storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
  storage.setItem(STORAGE_KEYS.ORDER_APPLICATIONS, JSON.stringify([
    application('oa-resubmit', '退回修改'),
    application('oa-return', '待财务审核'),
    application('oa-reject', '待财务审核'),
  ]));
  storage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify([] as Order[]));
  writeBackendToken('employee-session');

  const requests: Array<{ url: string; method: string; body: unknown }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = String(init?.method || 'GET');
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    requests.push({ url, method, body });

    let data: OrderApplication | null = null;
    if (method === 'POST' && url.endsWith('/order-applications')) data = application('oa-submitted', '待财务审核');
    if (method === 'POST' && url.endsWith('/order-applications/oa-resubmit/resubmit')) data = application('oa-resubmit', '待财务审核');
    if (method === 'POST' && url.endsWith('/order-applications/oa-return/return')) {
      data = { ...application('oa-return', '退回修改'), reason: '补凭证' };
    }
    if (method === 'POST' && url.endsWith('/order-applications/oa-reject/reject')) {
      data = { ...application('oa-reject', '已驳回'), reason: '付款无效' };
    }

    return new Response(JSON.stringify(data
      ? { code: 0, data, message: 'success' }
      : { code: 403, data: null, message: 'Legacy storage write is disabled' }), {
      status: data ? 200 : 403,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  const submitted = await orderReviewApi.submitOrderApplication(orderData);
  assert.equal(submitted.code, 0);
  assert.equal(submitted.data.id, 'oa-submitted');

  const resubmitted = await orderReviewApi.updateReturnedOrderApplication('oa-resubmit', {
    ...orderData,
    notes: '已补凭证',
  });
  assert.equal(resubmitted.code, 0);
  assert.equal(resubmitted.data?.status, '待财务审核');

  const returned = await orderReviewApi.returnOrderApplication('oa-return', '补凭证');
  assert.equal(returned.code, 0);
  assert.equal(returned.data?.status, '退回修改');

  const rejected = await orderReviewApi.rejectOrderApplication('oa-reject', '付款无效');
  assert.equal(rejected.code, 0);
  assert.equal(rejected.data?.status, '已驳回');

  await flushBackendStorageWrites();
  assert.deepEqual(requests, [
    {
      url: 'http://127.0.0.1:3001/api/order-applications',
      method: 'POST',
      body: { orderData },
    },
    {
      url: 'http://127.0.0.1:3001/api/order-applications/oa-resubmit/resubmit',
      method: 'POST',
      body: { orderData: { ...orderData, notes: '已补凭证' } },
    },
    {
      url: 'http://127.0.0.1:3001/api/order-applications/oa-return/return',
      method: 'POST',
      body: { reason: '补凭证' },
    },
    {
      url: 'http://127.0.0.1:3001/api/order-applications/oa-reject/reject',
      method: 'POST',
      body: { reason: '付款无效' },
    },
  ]);
  assert.equal(requests.some((request) => request.method === 'PUT' && request.url.includes('/storage/')), false);

  const cached = JSON.parse(storage.getItem(STORAGE_KEYS.ORDER_APPLICATIONS) || '[]') as OrderApplication[];
  assert.equal(cached.find((item) => item.id === 'oa-submitted')?.status, '待财务审核');
  assert.equal(cached.find((item) => item.id === 'oa-resubmit')?.status, '待财务审核');
  assert.equal(cached.find((item) => item.id === 'oa-return')?.status, '退回修改');
  assert.equal(cached.find((item) => item.id === 'oa-reject')?.status, '已驳回');
} finally {
  clearBackendToken();
  globalThis.fetch = originalFetch;
  if (originalUseBackend === undefined) delete process.env.VITE_USE_BACKEND_API;
  else process.env.VITE_USE_BACKEND_API = originalUseBackend;
  if (originalApiBase === undefined) delete process.env.VITE_AI_API_BASE;
  else process.env.VITE_AI_API_BASE = originalApiBase;
}
