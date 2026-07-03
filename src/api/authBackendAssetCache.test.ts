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
    if (path.endsWith('/storage')) {
      return {
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify({
          code: 0,
          data: {
            [STORAGE_KEYS.ASSET_DEVICES]: [{ id: 'employee-device', imei: 'EMP-***', imeiMasked: 'EMP-***' }],
            [STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS]: [{ id: 'employee-account', loginAccount: 'employee_***', loginAccountMasked: 'employee_***' }],
          },
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
  assert.deepEqual(JSON.parse(storage.get(STORAGE_KEYS.ASSET_DEVICES) || '[]'), [{ id: 'employee-device', imei: 'EMP-***', imeiMasked: 'EMP-***' }]);
  assert.deepEqual(JSON.parse(storage.get(STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS) || '[]'), [{ id: 'employee-account', loginAccount: 'employee_***', loginAccountMasked: 'employee_***' }]);
  assert.deepEqual(putRequests, []);
} finally {
  clearBackendToken();
  globalThis.fetch = originalFetch;
  if (originalUseBackend === undefined) delete process.env.VITE_USE_BACKEND_API;
  else process.env.VITE_USE_BACKEND_API = originalUseBackend;
  if (originalApiBase === undefined) delete process.env.VITE_AI_API_BASE;
  else process.env.VITE_AI_API_BASE = originalApiBase;
}
