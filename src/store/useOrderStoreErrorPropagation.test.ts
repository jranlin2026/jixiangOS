import assert from 'node:assert/strict';
import { clearBackendToken, writeBackendToken } from '../api/backendClient';
import { STORAGE_KEYS } from '../shared/utils/constants';
import type { Order } from '../types/order';
import useOrderStore from './useOrderStore';

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
const sourceOrder: Order = {
  id: 'order-store', orderNo: 'ORD-STORE', customerId: 'customer-1', customerName: '客户',
  productLevel: '899', orderType: '899成交', amount: 899, actualAmount: 899,
  paymentMethod: '对公转账', status: '已确认', refundStatus: '无', owner: '销售',
  payments: [], createdAt: '2026-07-12T10:00:00.000Z', updatedAt: '2026-07-12T10:00:00.000Z',
};

try {
  process.env.VITE_USE_BACKEND_API = 'true';
  process.env.VITE_AI_API_BASE = 'http://127.0.0.1:3001/api';
  storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
  storage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify([sourceOrder]));
  writeBackendToken('sales-session');
  globalThis.fetch = (async () => new Response(JSON.stringify({
    code: 403,
    data: null,
    message: 'Forbidden',
  }), { status: 403, headers: { 'content-type': 'application/json' } })) as typeof fetch;

  await assert.rejects(() => useOrderStore.getState().update(sourceOrder.id, { notes: '不能保存' }), /Forbidden/);
  await assert.rejects(() => useOrderStore.getState().delete(sourceOrder.id), /Forbidden/);
  await assert.rejects(() => useOrderStore.getState().create({
    ...sourceOrder,
    id: undefined,
    orderNo: undefined,
    createdAt: undefined,
    updatedAt: undefined,
  } as unknown as Omit<Order, 'id' | 'orderNo' | 'createdAt' | 'updatedAt'>), /订单申请/);
} finally {
  useOrderStore.getState().reset();
  clearBackendToken();
  globalThis.fetch = originalFetch;
  if (originalUseBackend === undefined) delete process.env.VITE_USE_BACKEND_API;
  else process.env.VITE_USE_BACKEND_API = originalUseBackend;
  if (originalApiBase === undefined) delete process.env.VITE_AI_API_BASE;
  else process.env.VITE_AI_API_BASE = originalApiBase;
}
