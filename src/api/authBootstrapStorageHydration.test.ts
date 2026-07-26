import assert from 'node:assert/strict';
import { authApi } from './authApi';
import { STORAGE_KEYS } from '../shared/utils/constants';

const values = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    get length() { return values.size; },
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  },
});

const originalFetch = globalThis.fetch;
const originalBackendFlag = process.env.VITE_USE_BACKEND_API;
process.env.VITE_USE_BACKEND_API = 'true';
values.set('aaos_backend_auth_token', 'existing-session-token');
values.set(STORAGE_KEYS.COMMISSION_PAYOUT_PLANS, JSON.stringify([
  { id: 'stale-plan', name: '浏览器旧方案' },
]));

const serverPlans = Array.from({ length: 13 }, (_, index) => ({
  id: `server-plan-${index + 1}`,
  name: `服务器方案${index + 1}`,
}));

globalThis.fetch = async (input) => {
  const url = String(input);
  if (url.endsWith('/auth/me')) {
    return new Response(JSON.stringify({
      code: 0,
      data: {
        id: 'user-admin',
        name: '系统管理员',
        account: 'admin',
        email: 'admin@example.com',
        phone: '',
        role: '超级管理员',
        roleId: 'role-super-admin',
        departmentId: 'dept-general',
        isActive: true,
        permissions: [],
      },
      message: 'success',
    }), { headers: { 'content-type': 'application/json' } });
  }
  if (url.endsWith('/storage?scope=runtime')) {
    return new Response(JSON.stringify({
      code: 0,
      data: { [STORAGE_KEYS.COMMISSION_PAYOUT_PLANS]: serverPlans },
      message: 'success',
    }), { headers: { 'content-type': 'application/json' } });
  }
  return new Response(JSON.stringify({ code: 404, data: null, message: 'unexpected request' }), {
    status: 404,
    headers: { 'content-type': 'application/json' },
  });
};

try {
  const currentUser = await authApi.getCurrentUser();
  assert.equal(currentUser.code, 0);
  const hydratedPlans = JSON.parse(values.get(STORAGE_KEYS.COMMISSION_PAYOUT_PLANS) || '[]');
  assert.equal(hydratedPlans.length, 13, '已登录用户重新打开系统时必须用服务器配置覆盖旧缓存');
} finally {
  globalThis.fetch = originalFetch;
  if (originalBackendFlag === undefined) delete process.env.VITE_USE_BACKEND_API;
  else process.env.VITE_USE_BACKEND_API = originalBackendFlag;
}
