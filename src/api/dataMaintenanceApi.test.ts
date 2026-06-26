import assert from 'node:assert/strict';
import { clearBusinessTestData, resyncLocalCacheFromBackend } from './dataMaintenanceApi';
import { STORAGE_KEYS } from '../shared/utils/constants';

const originalFetch = globalThis.fetch;
const originalUseBackend = process.env.VITE_USE_BACKEND_API;
const originalApiBase = process.env.VITE_AI_API_BASE;

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

storage.clear();
storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
storage.setItem(STORAGE_KEYS.LEADS, JSON.stringify([{ id: 'lead-1' }]));
storage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([{ id: 'customer-1' }]));
storage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify([{ id: 'order-1' }]));
storage.setItem(STORAGE_KEYS.FINANCE, JSON.stringify({ dailyRecords: [{ id: 'f-1' }], channelROI: [{ id: 'r-1' }] }));
storage.setItem(STORAGE_KEYS.USERS, JSON.stringify([{
  id: 'user-custom',
  name: '自定义员工',
  account: 'custom_user',
  email: '',
  phone: '',
  role: '销售顾问',
  roleId: 'role-sales-consultant',
  departmentId: 'dept-sales',
  positionName: '销售顾问',
  isActive: true,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
}]));

const result = clearBusinessTestData();
assert.equal(result.code, 0);
assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEYS.LEADS) || 'null'), []);
assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEYS.CUSTOMERS) || 'null'), []);
assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEYS.ORDERS) || 'null'), []);
assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEYS.FINANCE) || 'null'), { dailyRecords: [], channelROI: [] });
assert.ok(JSON.parse(storage.getItem(STORAGE_KEYS.USERS) || '[]').some((user: { name?: string }) => user.name === '自定义员工'));
assert.ok(JSON.parse(storage.getItem(STORAGE_KEYS.DEPARTMENTS) || '[]').length > 0);
assert.ok(JSON.parse(storage.getItem(STORAGE_KEYS.ROLES) || '[]').length > 0);
assert.equal(storage.getItem(STORAGE_KEYS.INITIALIZED), 'true');

process.env.VITE_USE_BACKEND_API = 'true';
process.env.VITE_AI_API_BASE = 'http://127.0.0.1:3001/api';

try {
  storage.clear();
  storage.setItem('aaos_backend_auth_token', 'signed-in-token');
  storage.setItem('aaos_orders_view_config', JSON.stringify({ pageSize: 20 }));
  storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
  storage.setItem(STORAGE_KEYS.LEADS, JSON.stringify([{ id: 'stale-lead' }]));
  storage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([{ id: 'stale-customer' }]));
  storage.setItem('aaos_customer_contracts_customer-1', JSON.stringify([{ id: 'contract-cache' }]));

  const requestedMethods: string[] = [];
  globalThis.fetch = async (url, init) => {
    requestedMethods.push(init?.method || 'GET');
    assert.equal(String(url), 'http://127.0.0.1:3001/api/storage');
    return {
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => JSON.stringify({
        code: 0,
        data: {
          [STORAGE_KEYS.INITIALIZED]: true,
          [STORAGE_KEYS.LEADS]: [{ id: 'server-lead' }],
        },
        message: 'success',
      }),
    } as Response;
  };

  const resyncResult = await resyncLocalCacheFromBackend();

  assert.equal(resyncResult.code, 0);
  assert.deepEqual(requestedMethods, ['GET']);
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEYS.LEADS) || '[]'), [{ id: 'server-lead' }]);
  assert.equal(storage.getItem(STORAGE_KEYS.CUSTOMERS), null);
  assert.equal(storage.getItem('aaos_customer_contracts_customer-1'), null);
  assert.equal(storage.getItem('aaos_backend_auth_token'), 'signed-in-token');
  assert.deepEqual(JSON.parse(storage.getItem('aaos_orders_view_config') || '{}'), { pageSize: 20 });

  globalThis.fetch = async () => {
    throw new Error('network down');
  };

  const failedResyncResult = await resyncLocalCacheFromBackend();
  assert.equal(failedResyncResult.code, -1);
  assert.match(failedResyncResult.message, /重新同步失败/);
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
}
