import assert from 'node:assert/strict';
import { STORAGE_KEYS } from '../shared/utils/constants';

const originalFetch = globalThis.fetch;
const originalUseBackend = process.env.VITE_USE_BACKEND_API;
const originalApiBase = process.env.VITE_AI_API_BASE;
const storage = new Map<string, string>();

Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => storage.get(key) || null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
    key: (index: number) => Array.from(storage.keys())[index] || null,
    get length() {
      return storage.size;
    },
  },
  configurable: true,
});

try {
  process.env.VITE_USE_BACKEND_API = 'true';
  process.env.VITE_AI_API_BASE = 'http://127.0.0.1:3001/api';
  storage.set(STORAGE_KEYS.INITIALIZED, 'true');
  storage.set(STORAGE_KEYS.COMMISSIONS, '[]');
  storage.set(STORAGE_KEYS.ORDERS, '[]');
  storage.set(STORAGE_KEYS.REFUNDS, '[]');
  storage.set(STORAGE_KEYS.FINANCE, JSON.stringify({
    dailyRecords: [],
    channelROI: [],
    incomes: [],
    expenses: [],
  }));

  const requestedUrls: string[] = [];
  globalThis.fetch = async (url) => {
    requestedUrls.push(String(url));
    return {
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => JSON.stringify({ code: 0, data: {}, message: 'success' }),
    } as Response;
  };

  const [{ commissionApi }, { financeApi }] = await Promise.all([
    import('./commissionApi'),
    import('./financeApi'),
  ]);

  await commissionApi.fetchCommissions({ page: 1, pageSize: 20 });
  await financeApi.fetchFinanceTransactions({ page: 1, pageSize: 20 });

  assert.deepEqual(requestedUrls, [
    'http://127.0.0.1:3001/api/storage?scope=commissions',
    'http://127.0.0.1:3001/api/storage?scope=finance-flow',
  ]);
} finally {
  globalThis.fetch = originalFetch;
  if (originalUseBackend === undefined) delete process.env.VITE_USE_BACKEND_API;
  else process.env.VITE_USE_BACKEND_API = originalUseBackend;
  if (originalApiBase === undefined) delete process.env.VITE_AI_API_BASE;
  else process.env.VITE_AI_API_BASE = originalApiBase;
}
