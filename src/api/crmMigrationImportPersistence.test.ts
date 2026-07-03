import assert from 'node:assert/strict';
import { STORAGE_KEYS } from '../shared/utils/constants';
import { crmMigrationTestUtils } from './crmMigrationApi';

const originalFetch = globalThis.fetch;
const originalUseBackend = process.env.VITE_USE_BACKEND_API;
const originalApiBase = process.env.VITE_AI_API_BASE;
const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const storage = new Map<string, string>();

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    get length() {
      return storage.size;
    },
    getItem: (key: string) => storage.get(key) || null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    key: (index: number) => Array.from(storage.keys())[index] || null,
  },
});

try {
  process.env.VITE_USE_BACKEND_API = 'true';
  process.env.VITE_AI_API_BASE = 'http://127.0.0.1:3001/api';
  storage.set(STORAGE_KEYS.CUSTOMERS, JSON.stringify([]));
  storage.set(STORAGE_KEYS.LEADS, JSON.stringify([]));

  globalThis.fetch = async () => ({
    status: 500,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => JSON.stringify({ code: 500, data: null, message: 'database write failed' }),
  } as Response);

  const importResult = await crmMigrationTestUtils.importMigrationTables({ teamCustomers: [] });
  assert.equal(importResult.code, -1);
  assert.match(importResult.message, /后台数据库保存失败/);
} finally {
  globalThis.fetch = originalFetch;
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
  if (originalLocalStorage) {
    Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
  } else {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  }
}
