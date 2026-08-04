import assert from 'node:assert/strict';
import { settingsApi } from './settingsApi';

const originalFetch = globalThis.fetch;
const originalUseBackend = process.env.VITE_USE_BACKEND_API;
const originalApiBase = process.env.VITE_AI_API_BASE;
const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

try {
  process.env.VITE_USE_BACKEND_API = 'true';
  process.env.VITE_AI_API_BASE = 'http://127.0.0.1:3001/api';
  (globalThis as any).localStorage = {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  };
  globalThis.fetch = async () => ({
    status: 403,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => JSON.stringify({ code: 403, data: null, message: 'Forbidden' }),
  } as Response);

  const result = await settingsApi.fetchLeadSourceConfigs();
  assert.equal(result.code, 403, '线索来源读取失败不能伪装成成功的空列表');
  assert.equal(result.message, 'Forbidden');

  globalThis.fetch = async () => {
    throw new TypeError('Failed to fetch');
  };
  const networkFailure = await settingsApi.fetchLeadSourceConfigs();
  assert.notEqual(networkFailure.code, 0, '线索来源网络失败不能伪装成成功的空列表');
  assert.match(networkFailure.message, /线索来源读取失败/);
} finally {
  globalThis.fetch = originalFetch;
  if (originalLocalStorage) Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
  if (originalUseBackend === undefined) delete process.env.VITE_USE_BACKEND_API;
  else process.env.VITE_USE_BACKEND_API = originalUseBackend;
  if (originalApiBase === undefined) delete process.env.VITE_AI_API_BASE;
  else process.env.VITE_AI_API_BASE = originalApiBase;
}
