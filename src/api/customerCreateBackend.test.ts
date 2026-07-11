import assert from 'node:assert/strict';
import { customerApi } from './customerApi';
import { clearBackendToken, writeBackendToken } from './backendClient';
import { STORAGE_KEYS } from '../shared/utils/constants';

const originalFetch = globalThis.fetch;
const originalUseBackend = process.env.VITE_USE_BACKEND_API;
const originalApiBase = process.env.VITE_AI_API_BASE;

const storage = new Map<string, string>();
(globalThis as any).localStorage = {
  get length() {
    return storage.size;
  },
  key: (index: number) => Array.from(storage.keys())[index] || null,
  getItem: (key: string) => storage.get(key) || null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
};

try {
  process.env.VITE_USE_BACKEND_API = 'true';
  process.env.VITE_AI_API_BASE = 'http://127.0.0.1:3001/api';
  writeBackendToken('session-test');

  const requests: Array<{ url: string; method: string }> = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), method: String(init?.method || 'GET') });
    return {
      status: 201,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => JSON.stringify({
        code: 0,
        data: {
          id: 'cust-server',
          name: '新客户',
          company: '新客户公司',
          phone: '13800000000',
          customerLevel: 'L1',
          owner: '销售',
          totalSpent: 0,
          orderCount: 0,
          growthPath: [],
          growthRecords: [],
          activityRecords: [],
          createdAt: '2026-07-10T00:00:00.000Z',
          updatedAt: '2026-07-10T00:00:00.000Z',
        },
        message: 'success',
      }),
    } as Response;
  };

  const result = await customerApi.createCustomer({
    name: '新客户',
    company: '新客户公司',
    phone: '13800000000',
    customerLevel: 'L1',
    owner: '销售',
    sourceType: '公司资源',
  });

  assert.equal(result.code, 0);
  assert.deepEqual(requests, [{
    url: 'http://127.0.0.1:3001/api/customers',
    method: 'POST',
  }]);
  const cachedCustomers = JSON.parse(storage.get(STORAGE_KEYS.CUSTOMERS) || '[]');
  assert.equal(cachedCustomers.length, 1);
  assert.equal(cachedCustomers[0].id, 'cust-server');
  assert.equal(cachedCustomers[0].phone, '+8613800000000');
} finally {
  clearBackendToken();
  globalThis.fetch = originalFetch;
  if (originalUseBackend === undefined) delete process.env.VITE_USE_BACKEND_API;
  else process.env.VITE_USE_BACKEND_API = originalUseBackend;
  if (originalApiBase === undefined) delete process.env.VITE_AI_API_BASE;
  else process.env.VITE_AI_API_BASE = originalApiBase;
}
