import assert from 'node:assert/strict';
import { initializeMockData } from './mock';
import { CLEAN_INSTALL_EMPTY_STORAGE_KEYS, STORAGE_KEYS } from '../shared/utils/constants';

const originalUseBackend = process.env.VITE_USE_BACKEND_API;
const originalApiBase = process.env.VITE_AI_API_BASE;
const originalFetch = globalThis.fetch;
let fetchCalls = 0;

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
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return {
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => JSON.stringify({ code: 0, data: true, message: 'success' }),
    } as Response;
  };

  storage.clear();
  initializeMockData();

  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEYS.LEADS) || 'null'), []);
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEYS.CUSTOMERS) || 'null'), []);
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEYS.ORDERS) || 'null'), []);
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEYS.COMMISSIONS) || 'null'), []);
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEYS.DELIVERIES) || 'null'), []);
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEYS.USERS) || 'null'), []);
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEYS.DEPARTMENTS) || 'null'), []);
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEYS.POSITIONS) || 'null'), []);
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEYS.ROLES) || 'null'), []);
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEYS.PRODUCTS) || 'null'), []);
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEYS.PRODUCT_LEVELS) || 'null'), []);
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEYS.REFUNDS) || 'null'), []);
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEYS.COMMISSION_RULES) || 'null'), []);
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEYS.TAGS) || 'null'), []);
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEYS.FINANCE) || 'null'), {
    dailyRecords: [],
    channelROI: [],
  });
  for (const key of CLEAN_INSTALL_EMPTY_STORAGE_KEYS) {
    assert.deepEqual(JSON.parse(storage.getItem(key) || '[]'), [], `${key} 在后端纯净模式下必须为空`);
  }
  assert.equal(storage.getItem(STORAGE_KEYS.INITIALIZED), 'true');
  assert.equal(fetchCalls, 0, 'backend mode must not persist the local initialization marker');
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
