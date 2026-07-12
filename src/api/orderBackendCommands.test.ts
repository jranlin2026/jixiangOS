import assert from 'node:assert/strict';
import { clearBackendToken, flushBackendStorageWrites, writeBackendToken } from './backendClient';
import { orderApi } from './orderApi';
import { STORAGE_KEYS } from '../shared/utils/constants';
import type { Order } from '../types/order';

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
const now = '2026-07-12T14:00:00.000Z';
const sourceOrder: Order = {
  id: 'order-backend',
  orderNo: 'ORD-20260712-BACKEND',
  customerId: 'customer-1',
  customerName: '数据库客户',
  productId: 'product-1',
  productName: '数据库产品',
  productLevel: '899',
  orderType: '899成交',
  amount: 899,
  actualAmount: 899,
  paymentMethod: '对公转账',
  status: '已确认',
  refundStatus: '无',
  owner: '销售小王',
  salesId: 'user-sales',
  salesName: '销售小王',
  resourceOwnership: '公司资源',
  payments: [],
  createdAt: now,
  updatedAt: now,
};

try {
  process.env.VITE_USE_BACKEND_API = 'true';
  process.env.VITE_AI_API_BASE = 'http://127.0.0.1:3001/api';
  storage.clear();
  storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
  storage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify([sourceOrder]));
  storage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([]));
  storage.setItem(STORAGE_KEYS.COMMISSIONS, JSON.stringify([]));
  storage.setItem(STORAGE_KEYS.DELIVERIES, JSON.stringify([]));
  storage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify([]));
  writeBackendToken('sales-session');

  const updatedOrder = { ...sourceOrder, notes: '服务端备注', updatedAt: '2026-07-12T14:01:00.000Z' };
  const deletedOrder = {
    ...updatedOrder,
    deletedAt: '2026-07-12T14:02:00.000Z',
    deletedBy: '销售小王',
    deleteReason: '重复订单',
    updatedAt: '2026-07-12T14:02:00.000Z',
  };
  const requests: Array<{ url: string; method: string; body: unknown }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = String(init?.method || 'GET');
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    requests.push({ url, method, body });

    let data: unknown = null;
    if (method === 'PUT' && url.endsWith('/orders/order-backend')) data = updatedOrder;
    if (method === 'DELETE' && url.endsWith('/orders/order-backend')) data = deletedOrder;
    return new Response(JSON.stringify(data
      ? { code: 0, data, message: 'success' }
      : { code: 403, data: null, message: 'Legacy storage write is disabled' }), {
      status: data ? 200 : 403,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  const directCreate = await orderApi.createOrder({
    ...sourceOrder,
    id: undefined,
    orderNo: undefined,
    createdAt: undefined,
    updatedAt: undefined,
  } as unknown as Omit<Order, 'id' | 'orderNo' | 'createdAt' | 'updatedAt'>);
  assert.equal(directCreate.code, 409);
  assert.match(directCreate.message, /订单申请/);
  assert.equal(requests.length, 0, '后端模式不得直接创建正式订单或调用旧 storage');

  const updated = await orderApi.updateOrder(sourceOrder.id, { notes: '服务端备注' });
  assert.equal(updated.code, 0);
  assert.equal(updated.data?.notes, '服务端备注');

  const deleted = await orderApi.deleteOrder(sourceOrder.id, '重复订单');
  assert.equal(deleted.code, 0);
  assert.equal(deleted.data, true);

  await flushBackendStorageWrites();
  assert.deepEqual(requests, [
    {
      url: 'http://127.0.0.1:3001/api/orders/order-backend',
      method: 'PUT',
      body: { data: { notes: '服务端备注' } },
    },
    {
      url: 'http://127.0.0.1:3001/api/orders/order-backend',
      method: 'DELETE',
      body: { reason: '重复订单' },
    },
  ]);
  assert.equal(requests.some((request) => request.url.includes('/storage/')), false);

  const cached = JSON.parse(storage.getItem(STORAGE_KEYS.ORDERS) || '[]') as Order[];
  assert.equal(cached.find((item) => item.id === sourceOrder.id)?.deletedAt, deletedOrder.deletedAt);
} finally {
  clearBackendToken();
  globalThis.fetch = originalFetch;
  if (originalUseBackend === undefined) delete process.env.VITE_USE_BACKEND_API;
  else process.env.VITE_USE_BACKEND_API = originalUseBackend;
  if (originalApiBase === undefined) delete process.env.VITE_AI_API_BASE;
  else process.env.VITE_AI_API_BASE = originalApiBase;
}
