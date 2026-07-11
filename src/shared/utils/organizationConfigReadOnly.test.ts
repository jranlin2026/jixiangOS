import assert from 'node:assert/strict';
import { ensureOrganizationConfigData } from './organizationConfig';
import { flushBackendStorageWrites } from '../../api/backendClient';

const storage = (() => {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

const originalFetch = globalThis.fetch;
const originalBackendFlag = process.env.VITE_USE_BACKEND_API;
let persistenceRequests = 0;
process.env.VITE_USE_BACKEND_API = 'true';
globalThis.fetch = async () => {
  persistenceRequests += 1;
  return new Response(JSON.stringify({ code: 0, data: null, message: 'ok' }), {
    headers: { 'content-type': 'application/json' },
  });
};

try {
  ensureOrganizationConfigData();
  await flushBackendStorageWrites();
  assert.equal(persistenceRequests, 0, '员工只读组织信息时不能触发管理员配置保存');
} finally {
  globalThis.fetch = originalFetch;
  if (originalBackendFlag === undefined) delete process.env.VITE_USE_BACKEND_API;
  else process.env.VITE_USE_BACKEND_API = originalBackendFlag;
}
