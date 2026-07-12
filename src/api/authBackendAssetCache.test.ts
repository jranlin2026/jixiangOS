import assert from 'node:assert/strict';
import { authApi } from './authApi';
import { clearBackendToken } from './backendClient';
import { AUTH_SESSION_STORAGE_KEY } from '../shared/utils/auth';
import { STORAGE_KEYS } from '../shared/utils/constants';
import { PERMISSION_KEYS } from '../shared/utils/permissions';

const originalFetch = globalThis.fetch;
const originalUseBackend = process.env.VITE_USE_BACKEND_API;
const originalApiBase = process.env.VITE_AI_API_BASE;

const storage = new Map<string, string>();
(globalThis as any).localStorage = {
  get length() {
    return storage.size;
  },
  key: (index: number) => Array.from(storage.keys())[index] ?? null,
  getItem: (key: string) => storage.get(key) || null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
};

try {
  process.env.VITE_USE_BACKEND_API = 'true';
  process.env.VITE_AI_API_BASE = 'http://127.0.0.1:3001/api';
  storage.clear();
  storage.set(STORAGE_KEYS.ASSET_DEVICES, JSON.stringify([{ id: 'admin-device', imei: 'ADMIN-RAW', imeiMasked: 'ADMIN-***' }]));
  storage.set(STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS, JSON.stringify([{ id: 'admin-account', loginAccount: 'admin_raw', loginAccountMasked: 'admin_***' }]));
  storage.set(STORAGE_KEYS.ORDERS, JSON.stringify([{ id: 'admin-order', salesId: 'user-admin' }]));
  storage.set(STORAGE_KEYS.ORDER_APPLICATIONS, JSON.stringify([{ id: 'admin-application', applicantId: 'user-admin' }]));
  storage.set(STORAGE_KEYS.DELIVERIES, JSON.stringify([{ id: 'admin-delivery', ownerId: 'user-admin' }]));
  storage.set(STORAGE_KEYS.RECOVERY_ORDERS, JSON.stringify([{ id: 'admin-recovery', createdBy: 'user-admin' }]));

  const putRequests: string[] = [];
  globalThis.fetch = async (url, init) => {
    const path = String(url);
    if (init?.method === 'PUT') {
      putRequests.push(path);
      return {
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify({ code: 0, data: true, message: 'success' }),
      } as Response;
    }
    if (path.endsWith('/auth/login')) {
      return {
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify({
          code: 0,
          data: {
            token: 'employee-token',
            user: {
              id: 'user-sales',
              name: '童双全',
              account: 'shuangquan',
              email: 'sales@example.com',
              phone: '',
              role: '销售专员',
              roleId: 'role-sales',
              departmentId: 'dept-sales',
              isActive: true,
              permissions: [{ module: PERMISSION_KEYS.ASSETS_OVERVIEW, actions: ['read'] }],
            },
          },
          message: 'success',
        }),
      } as Response;
    }
    if (path.endsWith('/storage?scope=runtime')) {
      return {
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify({
          code: 0,
          data: {},
          message: 'success',
        }),
      } as Response;
    }
    return {
      status: 404,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => JSON.stringify({ code: 404, data: null, message: 'not found' }),
    } as Response;
  };

  const login = await authApi.login({ account: 'shuangquan', password: '1234567', remember: false });
  assert.equal(login.code, 0);
  assert.equal(storage.get('aaos_backend_auth_token'), 'employee-token');
  assert.equal(JSON.parse(storage.get(AUTH_SESSION_STORAGE_KEY) || '{}').userId, 'user-sales');
  assert.equal(storage.get(STORAGE_KEYS.ASSET_DEVICES), undefined);
  assert.equal(storage.get(STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS), undefined);
  assert.equal(storage.get(STORAGE_KEYS.ORDERS), undefined);
  assert.equal(storage.get(STORAGE_KEYS.ORDER_APPLICATIONS), undefined);
  assert.equal(storage.get(STORAGE_KEYS.DELIVERIES), undefined);
  assert.equal(storage.get(STORAGE_KEYS.RECOVERY_ORDERS), undefined);

  storage.set(STORAGE_KEYS.ORDERS, JSON.stringify([{ id: 'employee-order', salesId: 'user-sales' }]));
  storage.set(STORAGE_KEYS.ORDER_APPLICATIONS, JSON.stringify([{ id: 'employee-application', applicantId: 'user-sales' }]));
  storage.set(STORAGE_KEYS.DELIVERIES, JSON.stringify([{ id: 'employee-delivery', ownerId: 'user-sales' }]));
  storage.set(STORAGE_KEYS.RECOVERY_ORDERS, JSON.stringify([{ id: 'employee-recovery', createdBy: 'user-sales' }]));
  await authApi.logout();
  assert.equal(storage.get(STORAGE_KEYS.ORDERS), undefined);
  assert.equal(storage.get(STORAGE_KEYS.ORDER_APPLICATIONS), undefined);
  assert.equal(storage.get(STORAGE_KEYS.DELIVERIES), undefined);
  assert.equal(storage.get(STORAGE_KEYS.RECOVERY_ORDERS), undefined);
  assert.deepEqual(putRequests, []);
} finally {
  clearBackendToken();
  globalThis.fetch = originalFetch;
  if (originalUseBackend === undefined) delete process.env.VITE_USE_BACKEND_API;
  else process.env.VITE_USE_BACKEND_API = originalUseBackend;
  if (originalApiBase === undefined) delete process.env.VITE_AI_API_BASE;
  else process.env.VITE_AI_API_BASE = originalApiBase;
}
