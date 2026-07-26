import assert from 'node:assert/strict';
import { commissionApi } from './commissionApi';
import { clearBackendToken, writeBackendToken } from './backendClient';
import { STORAGE_KEYS } from '../shared/utils/constants';

const values = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    get length() { return values.size; },
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  },
  configurable: true,
});

const originalFetch = globalThis.fetch;
const originalUseBackend = process.env.VITE_USE_BACKEND_API;
const originalApiBase = process.env.VITE_AI_API_BASE;

try {
  process.env.VITE_USE_BACKEND_API = 'true';
  process.env.VITE_AI_API_BASE = 'http://127.0.0.1:3001/api';
  writeBackendToken('finance-session');
  const requests: Array<{ url: string; method: string; body?: unknown }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = String(init?.method || 'GET');
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    requests.push({ url, method, body });
    const data = url.includes('/storage?scope=runtime')
      ? { [STORAGE_KEYS.COMMISSIONS]: [], [STORAGE_KEYS.COMMISSION_OPERATION_LOGS]: [] }
      : url.endsWith('/withdraw')
        ? []
        : true;
    return new Response(JSON.stringify({ code: 0, data, message: 'success' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  assert.equal((await commissionApi.resetOrderCommissions('order-1', '重新配置')).code, 0);
  assert.equal((await commissionApi.withdrawOrderCommissions('order-2', '订单退款')).code, 0);
  assert.equal((await commissionApi.cleanupDeletedSourceOrderCommissions('order-3', '清理废弃留痕')).code, 0);

  const commandRequests = requests.filter((request) => request.url.includes('/order-settlements/'));
  assert.deepEqual(commandRequests.map((request) => ({
    path: request.url.replace('http://127.0.0.1:3001/api', ''),
    method: request.method,
    body: request.body,
  })), [
    { path: '/order-settlements/order-1/reset', method: 'POST', body: { reason: '重新配置' } },
    { path: '/order-settlements/order-2/withdraw', method: 'POST', body: { reason: '订单退款' } },
    { path: '/order-settlements/order-3/cleanup', method: 'POST', body: { reason: '清理废弃留痕' } },
  ]);
  assert.equal(
    requests.filter((request) => request.url.includes('/storage?scope=runtime')).length,
    3,
    '每个记录级命令成功后都应重新水合财务缓存',
  );
} finally {
  clearBackendToken();
  globalThis.fetch = originalFetch;
  if (originalUseBackend === undefined) delete process.env.VITE_USE_BACKEND_API;
  else process.env.VITE_USE_BACKEND_API = originalUseBackend;
  if (originalApiBase === undefined) delete process.env.VITE_AI_API_BASE;
  else process.env.VITE_AI_API_BASE = originalApiBase;
}
