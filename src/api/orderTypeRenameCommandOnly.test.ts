import assert from 'node:assert/strict';
import { settingsApi } from './settingsApi';
import { clearStorageSyncFailure, subscribeStorageSyncFailures } from './storageSyncStatus';
import { STORAGE_KEYS } from '../shared/utils/constants';

const values = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    get length() { return values.size; },
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  },
  configurable: true,
});

const originalFetch = globalThis.fetch;
const originalBackendFlag = process.env.VITE_USE_BACKEND_API;

try {
  process.env.VITE_USE_BACKEND_API = 'true';
  values.set(STORAGE_KEYS.INITIALIZED, 'true');
  values.set(STORAGE_KEYS.ORDER_TYPE_CONFIGS, JSON.stringify([{
    id: 'order-type-1', name: '旧名称', description: '', isActive: true, sortOrder: 1,
    createdAt: '2026-07-24T00:00:00.000Z', updatedAt: '2026-07-24T00:00:00.000Z',
  }]));
  values.set(STORAGE_KEYS.ORDERS, JSON.stringify([{
    id: 'order-1', orderType: '旧名称', dealScene: '旧名称', updatedAt: '2026-07-24T00:00:00.000Z',
  }]));
  values.set(STORAGE_KEYS.COMMISSION_RULES, '[]');
  const requests: string[] = [];
  globalThis.fetch = (async (input) => {
    requests.push(String(input));
    return new Response(JSON.stringify({
      code: 0,
      data: String(input).includes('/settings/order-types/')
        ? { id: 'order-type-1', name: '新名称', description: '', isActive: true, sortOrder: 1,
          createdAt: '2026-07-24T00:00:00.000Z', updatedAt: '2026-07-24T01:00:00.000Z' }
        : true,
      message: 'success',
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  const failures: string[] = [];
  const unsubscribe = subscribeStorageSyncFailures((failure) => {
    if (failure) failures.push(`${failure.key}:${failure.message}`);
  });
  const result = await settingsApi.updateOrderTypeConfig('order-type-1', { name: '新名称' });
  await Promise.resolve();
  unsubscribe();
  clearStorageSyncFailure();

  assert.equal(result.code, 0);
  assert.deepEqual(requests, ['/api/settings/order-types/order-type-1']);
  assert.equal(failures.some((message) => message.includes('aaos_orders')), false,
    '订单类型改名不得触发 aaos_orders legacy 整表写');
} finally {
  globalThis.fetch = originalFetch;
  if (originalBackendFlag === undefined) delete process.env.VITE_USE_BACKEND_API;
  else process.env.VITE_USE_BACKEND_API = originalBackendFlag;
}
