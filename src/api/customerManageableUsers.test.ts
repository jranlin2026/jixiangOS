import assert from 'node:assert/strict';
import { customerApi } from './customerApi';
import { clearBackendToken, writeBackendToken } from './backendClient';
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
const originalUseBackend = process.env.VITE_USE_BACKEND_API;
const originalApiBase = process.env.VITE_AI_API_BASE;

try {
  process.env.VITE_USE_BACKEND_API = 'true';
  process.env.VITE_AI_API_BASE = 'http://127.0.0.1:3001/api';
  writeBackendToken('customer-session');
  values.set(STORAGE_KEYS.USERS, JSON.stringify([
    { id: 'user-stale', name: '越界过期用户', isActive: true },
  ]));

  const requests: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    requests.push(String(input));
    return new Response(JSON.stringify({
      code: 0,
      data: [{ id: 'user-actor', name: '当前用户', positionName: '销售' }],
      message: 'success',
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  const result = await customerApi.fetchManageableUsers();
  assert.deepEqual(result.data, [{ id: 'user-actor', name: '当前用户', positionName: '销售' }]);
  assert.equal(result.data.some((user) => user.id === 'user-stale'), false, '本地过期人员不得合并进服务端专用目录');
  assert.deepEqual(requests, ['http://127.0.0.1:3001/api/customers/manageable-users']);
} finally {
  clearBackendToken();
  globalThis.fetch = originalFetch;
  if (originalUseBackend === undefined) delete process.env.VITE_USE_BACKEND_API;
  else process.env.VITE_USE_BACKEND_API = originalUseBackend;
  if (originalApiBase === undefined) delete process.env.VITE_AI_API_BASE;
  else process.env.VITE_AI_API_BASE = originalApiBase;
}

console.log('customer manageable users api tests passed');
