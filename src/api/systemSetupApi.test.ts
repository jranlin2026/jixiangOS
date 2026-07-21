import assert from 'node:assert/strict';

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

const requests: Array<{ url: string; init?: RequestInit }> = [];
Object.defineProperty(globalThis, 'fetch', {
  configurable: true,
  value: async (url: string, init?: RequestInit) => {
    requests.push({ url, init });
    const initializing = url.endsWith('/initialize');
    return new Response(JSON.stringify({
      code: 0,
      data: initializing
        ? { installationId: 'installation-1', state: 'ACTIVE', initialized: true, setupAvailable: false, setupVersion: 1, companyName: '新企业' }
        : { installationId: 'installation-1', state: 'UNINITIALIZED', initialized: false, setupAvailable: true, setupVersion: 1, companyName: null },
      message: 'success',
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  },
});

const { systemSetupApi } = await import('./systemSetupApi');
const status = await systemSetupApi.getStatus();
assert.equal(status.data?.state, 'UNINITIALIZED');

const initialized = await systemSetupApi.initialize({
  setupToken: 'one-time-code', companyName: '新企业', adminName: '管理员', adminAccount: 'admin',
  adminEmail: 'admin@example.com', adminPhone: '', adminPassword: 'Strong-password-2026',
  organizationTemplate: 'minimal', includeDemoData: false,
});
assert.equal(initialized.data?.state, 'ACTIVE');
assert.equal(requests[1]?.init?.method, 'POST');
assert.equal(JSON.parse(String(requests[1]?.init?.body)).setupToken, 'one-time-code');

console.log('system setup api tests passed');
