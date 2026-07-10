import assert from 'node:assert/strict';
import { customerApi } from './customerApi';
import { clearBackendToken, writeBackendToken } from './backendClient';

const originalFetch = globalThis.fetch;
const originalUseBackend = process.env.VITE_USE_BACKEND_API;
const originalApiBase = process.env.VITE_AI_API_BASE;

const storage = new Map<string, string>();
(globalThis as any).localStorage = {
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
    const isRelease = String(url).endsWith('/customers/cust-test/release');
    return {
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => JSON.stringify({
        code: 0,
        data: {
          id: 'cust-test',
          name: '测试客户',
          company: '测试公司',
          phone: '13900000000',
          customerLevel: 'L1',
          owner: isRelease ? '公海' : '系统管理员',
          lifecycleStatusCode: isRelease ? 'public_pool' : 'following',
          totalSpent: 0,
          orderCount: 0,
          growthPath: [],
          growthRecords: [],
          activityRecords: [isRelease
            ? { id: 'act-release', type: 'transfer', title: '释放到公海', operator: '系统管理员', createdAt: '2026-07-10T00:00:00.000Z' }
            : { id: 'act-test', type: 'follow', title: '发表了跟进记录', operator: '系统管理员', createdAt: '2026-07-10T00:00:00.000Z' }],
          createdAt: '2026-07-10T00:00:00.000Z',
          updatedAt: '2026-07-10T00:00:00.000Z',
        },
        message: 'success',
      }),
    } as Response;
  };

  const result = await customerApi.addCustomerFollowUp('cust-test', { content: '线上跟进记录' });
  const releaseResult = await customerApi.releaseCustomerToPublicPool('cust-test', '测试释放到公海');

  assert.equal(result.code, 0);
  assert.equal(releaseResult.code, 0);
  assert.equal(releaseResult.data?.owner, '公海');
  assert.deepEqual(requests, [
    {
      url: 'http://127.0.0.1:3001/api/customers/cust-test/follow-ups',
      method: 'POST',
    },
    {
      url: 'http://127.0.0.1:3001/api/customers/cust-test/release',
      method: 'POST',
    },
  ]);
} finally {
  clearBackendToken();
  globalThis.fetch = originalFetch;
  if (originalUseBackend === undefined) delete process.env.VITE_USE_BACKEND_API;
  else process.env.VITE_USE_BACKEND_API = originalUseBackend;
  if (originalApiBase === undefined) delete process.env.VITE_AI_API_BASE;
  else process.env.VITE_AI_API_BASE = originalApiBase;
}
