import assert from 'node:assert/strict';
import {
  isBackendCommandOnlyStorageKey,
  persistBackendStorageValue,
} from './backendClient';
import { STORAGE_KEYS } from '../shared/utils/constants';

const originalUseBackend = process.env.VITE_USE_BACKEND_API;
const originalFetch = globalThis.fetch;
const values = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  },
  configurable: true,
});

try {
  process.env.VITE_USE_BACKEND_API = 'true';
  let requests = 0;
  globalThis.fetch = (async () => {
    requests += 1;
    throw new Error('不应请求 legacy storage');
  }) as typeof fetch;
  for (const key of [
    STORAGE_KEYS.CUSTOMERS,
    STORAGE_KEYS.LEADS,
    STORAGE_KEYS.ORDERS,
    STORAGE_KEYS.ORDER_APPLICATIONS,
    STORAGE_KEYS.DELIVERIES,
  ]) {
    assert.equal(isBackendCommandOnlyStorageKey(key), true, `${key} 必须 command-only`);
    await assert.rejects(() => persistBackendStorageValue(key, []), /记录级命令/);
  }
  assert.equal(requests, 0);
} finally {
  globalThis.fetch = originalFetch;
  if (originalUseBackend === undefined) delete process.env.VITE_USE_BACKEND_API;
  else process.env.VITE_USE_BACKEND_API = originalUseBackend;
}
