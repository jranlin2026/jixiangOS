import assert from 'node:assert/strict';
import {
  backendRequest,
  clearBackendToken,
  persistBackendStorageValue,
  readBackendToken,
  syncBackendStorageFromServer,
  writeBackendToken,
} from './backendClient';
import { STORAGE_KEYS } from '../shared/utils/constants';

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

  const marketLead = {
    id: 'lead-market-1',
    name: '市场录入线索',
    inputBy: '市场专员',
    owner: '销售一号',
    assignedTo: '销售一号',
  };
  const nextFlowConfig = {
    autoAssignEnabled: true,
    participantUserIds: ['user-sales-a', 'user-sales-b'],
    lastAssignedIndex: 1,
  };
  storage.set(STORAGE_KEYS.LEADS, JSON.stringify([marketLead]));
  storage.set(STORAGE_KEYS.LEAD_FLOW_CONFIG, JSON.stringify(nextFlowConfig));

  const releasePendingWrites: Array<() => void> = [];
  globalThis.fetch = async (url, init) => {
    if (init?.method === 'PUT') {
      await new Promise<void>((resolve) => releasePendingWrites.push(resolve));
      return {
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify({ code: 0, data: true, message: 'success' }),
      } as Response;
    }

    assert.equal(String(url), 'http://127.0.0.1:3001/api/storage');
    return {
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => JSON.stringify({
        code: 0,
        data: {
          [STORAGE_KEYS.LEADS]: [],
          [STORAGE_KEYS.LEAD_FLOW_CONFIG]: {
            ...nextFlowConfig,
            lastAssignedIndex: 0,
          },
        },
        message: 'success',
      }),
    } as Response;
  };

  persistBackendStorageValue(STORAGE_KEYS.LEADS, [marketLead]);
  persistBackendStorageValue(STORAGE_KEYS.LEAD_FLOW_CONFIG, nextFlowConfig);

  await syncBackendStorageFromServer(0);

  assert.deepEqual(JSON.parse(storage.get(STORAGE_KEYS.LEADS) || '[]'), [marketLead]);
  assert.equal(JSON.parse(storage.get(STORAGE_KEYS.LEAD_FLOW_CONFIG) || '{}').lastAssignedIndex, 1);
  releasePendingWrites.forEach((release) => release());
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
