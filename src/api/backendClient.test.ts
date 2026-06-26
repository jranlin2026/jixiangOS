import assert from 'node:assert/strict';
import { backendRequest, clearBackendToken, readBackendToken, writeBackendToken } from './backendClient';

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

  writeBackendToken('expired-token');
  globalThis.fetch = async () => ({
    status: 401,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => JSON.stringify({ code: 401, data: null, message: 'Unauthorized' }),
  } as Response);

  const unauthorized = await backendRequest('/settings/users');
  assert.equal(unauthorized.code, 401);
  assert.equal(readBackendToken(), null);

  globalThis.fetch = async () => ({
    status: 502,
    headers: new Headers({ 'content-type': 'text/html' }),
    text: async () => '<!DOCTYPE html><html>bad gateway</html>',
  } as Response);

  const htmlError = await backendRequest('/settings/users');
  assert.equal(htmlError.code, 502);
  assert.match(htmlError.message, /HTTP 502/);
} finally {
  clearBackendToken();
  globalThis.fetch = originalFetch;
  if (originalUseBackend === undefined) {
    delete process.env.VITE_USE_BACKEND_API;
  } else {
    process.env.VITE_USE_BACKEND_API = originalUseBackend;
  }
  if (originalApiBase === undefined) {
    delete process.env.VITE_AI_API_BASE;
  } else {
    process.env.VITE_AI_API_BASE = originalApiBase;
  }
}
