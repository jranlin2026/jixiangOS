import assert from 'node:assert/strict';
import { clearBackendToken, writeBackendToken } from './backendClient';
import { recoveryOrderApi } from './recoveryOrderApi';
import type { RecoveryOrder } from '../types/recoveryOrder';

const originalFetch = globalThis.fetch;
const originalUseBackend = process.env.VITE_USE_BACKEND_API;
const originalApiBase = process.env.VITE_AI_API_BASE;
const inlineProof = `data:image/png;base64,${'A'.repeat(10_000)}`;
const storageValues = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    get length() { return storageValues.size; },
    key: (index: number) => Array.from(storageValues.keys())[index] ?? null,
    getItem: (key: string) => storageValues.get(key) ?? null,
    setItem: (key: string, value: string) => storageValues.set(key, value),
    removeItem: (key: string) => storageValues.delete(key),
    clear: () => storageValues.clear(),
  },
  configurable: true,
});
const detail = {
  id: 'recovery-1',
  paymentVoucherPreview: inlineProof,
  chatEvidencePreview: inlineProof,
} as RecoveryOrder;

try {
  process.env.VITE_USE_BACKEND_API = 'true';
  process.env.VITE_AI_API_BASE = 'http://127.0.0.1:3001/api';
  writeBackendToken('test-session');
  let requestedUrl = '';
  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify({ code: 0, data: detail, message: 'success' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  const response = await recoveryOrderApi.fetchRecoveryOrderById(
    detail.id,
    'recoveryOrderApplications',
  );
  assert.equal(
    requestedUrl,
    'http://127.0.0.1:3001/api/recovery-orders/recovery-1?scopeDomain=recoveryOrderApplications',
  );
  assert.equal(response.data?.paymentVoucherPreview, inlineProof);
  assert.equal(response.data?.chatEvidencePreview, inlineProof);
} finally {
  clearBackendToken();
  globalThis.fetch = originalFetch;
  if (originalUseBackend === undefined) delete process.env.VITE_USE_BACKEND_API;
  else process.env.VITE_USE_BACKEND_API = originalUseBackend;
  if (originalApiBase === undefined) delete process.env.VITE_AI_API_BASE;
  else process.env.VITE_AI_API_BASE = originalApiBase;
}
