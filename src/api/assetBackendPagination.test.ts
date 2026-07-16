import assert from 'node:assert/strict';

const originalFetch = globalThis.fetch;
const originalStorage = globalThis.localStorage;
const originalUseBackend = process.env.VITE_USE_BACKEND_API;
const originalApiBase = process.env.VITE_AI_API_BASE;

const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
    key: (index: number) => Array.from(storage.keys())[index] ?? null,
    get length() { return storage.size; },
  },
});

try {
  process.env.VITE_USE_BACKEND_API = 'true';
  process.env.VITE_AI_API_BASE = 'http://127.0.0.1:3001/api';
  storage.set('aaos_backend_auth_token', 'asset-test-token');
  const requests: string[] = [];
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    return {
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => JSON.stringify({
        code: 0,
        data: {
          items: [{ id: 'device-page-2', deviceName: '分页设备' }],
          pagination: { page: 2, pageSize: 20, total: 41, totalPages: 3 },
        },
        message: 'success',
      }),
    } as Response;
  };

  const { assetApi } = await import('./assetApi');
  const response = await assetApi.fetchDevices({ search: '分页', page: 2, pageSize: 20 });

  assert.equal(response.code, 0);
  assert.equal(response.data.items[0]?.id, 'device-page-2');
  assert.equal(response.data.pagination.total, 41);
  assert.deepEqual(requests, [
    'http://127.0.0.1:3001/api/assets/devices?search=%E5%88%86%E9%A1%B5&page=2&pageSize=20',
  ]);
  assert.ok(requests.every((url) => !url.includes('/storage')));
} finally {
  globalThis.fetch = originalFetch;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: originalStorage });
  if (originalUseBackend === undefined) delete process.env.VITE_USE_BACKEND_API;
  else process.env.VITE_USE_BACKEND_API = originalUseBackend;
  if (originalApiBase === undefined) delete process.env.VITE_AI_API_BASE;
  else process.env.VITE_AI_API_BASE = originalApiBase;
}

