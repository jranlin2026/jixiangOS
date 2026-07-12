import assert from 'node:assert/strict';
import { clearBackendToken, writeBackendToken } from '../api/backendClient';
import useCustomerStore from './useCustomerStore';

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
  writeBackendToken('customer-session');
  globalThis.fetch = (async () => new Response(JSON.stringify({
    code: 400,
    data: null,
    message: '客户资料未保存',
  }), { status: 400, headers: { 'content-type': 'application/json' } })) as typeof fetch;

  await assert.rejects(() => useCustomerStore.getState().create({
    name: '失败客户',
    company: '',
    phone: '13800000000',
    owner: '销售',
    sourceType: '公司资源',
    customerLevel: 'L1',
  }), /客户资料未保存/);
} finally {
  useCustomerStore.getState().reset();
  clearBackendToken();
  globalThis.fetch = originalFetch;
  if (originalUseBackend === undefined) delete process.env.VITE_USE_BACKEND_API;
  else process.env.VITE_USE_BACKEND_API = originalUseBackend;
  if (originalApiBase === undefined) delete process.env.VITE_AI_API_BASE;
  else process.env.VITE_AI_API_BASE = originalApiBase;
}
