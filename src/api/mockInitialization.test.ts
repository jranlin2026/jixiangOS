import assert from 'node:assert/strict';
import { initializeMockData } from './mock';
import { STORAGE_KEYS } from '../shared/utils/constants';

const originalUseBackend = process.env.VITE_USE_BACKEND_API;
const originalApiBase = process.env.VITE_AI_API_BASE;
const originalFetch = globalThis.fetch;

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

try {
  process.env.VITE_USE_BACKEND_API = 'true';
  process.env.VITE_AI_API_BASE = 'http://127.0.0.1:3001/api';
  globalThis.fetch = async () => ({
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => JSON.stringify({ code: 0, data: true, message: 'success' }),
  } as Response);

  storage.clear();
  initializeMockData();

  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEYS.LEADS) || 'null'), []);
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEYS.CUSTOMERS) || 'null'), []);
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEYS.ORDERS) || 'null'), []);
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEYS.COMMISSIONS) || 'null'), []);
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEYS.FINANCE) || 'null'), {
    dailyRecords: [],
    channelROI: [],
  });
  assert.equal(storage.getItem(STORAGE_KEYS.INITIALIZED), 'true');
} finally {
  if (originalUseBackend === undefined) {
    delete process.env.VITE_USE_BACKEND_API;
  } else {
    process.env.VITE_USE_BACKEND_API = originalUseBackend;
  }
  if (originalApiBase === undefined) {
    delete process.env.VITE_AI_API_BASE;
  } else {
    process.env.VITE_AI_API_BASE = originalApiBase;
  }
  globalThis.fetch = originalFetch;
}
