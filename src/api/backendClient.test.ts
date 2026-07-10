import assert from 'node:assert/strict';
import {
  backendRequest,
  clearBackendToken,
  persistBackendStorageValue,
  readBackendToken,
  syncBackendStorageFromServer,
  writeBackendToken,
} from './backendClient';
import { initializeStorage } from './mock/storage';
import { AUTH_SESSION_STORAGE_KEY } from '../shared/utils/auth';
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

    assert.equal(String(url), 'http://127.0.0.1:3001/api/storage?scope=runtime');
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

  const writeRequests: string[] = [];
  globalThis.fetch = async (url, init) => {
    if (init?.method === 'PUT') {
      writeRequests.push(String(url));
      return {
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify({ code: 0, data: true, message: 'success' }),
      } as Response;
    }
    return {
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => JSON.stringify({
        code: 0,
        data: {
          [STORAGE_KEYS.RECOVERY_ORDERS]: [{ id: 'server-recovery-order' }],
        },
        message: 'success',
      }),
    } as Response;
  };
  storage.delete(STORAGE_KEYS.RECOVERY_ORDERS);

  initializeStorage(STORAGE_KEYS.RECOVERY_ORDERS, []);
  await syncBackendStorageFromServer(0);

  assert.deepEqual(JSON.parse(storage.get(STORAGE_KEYS.RECOVERY_ORDERS) || '[]'), [{ id: 'server-recovery-order' }]);
  assert.deepEqual(writeRequests, []);

  globalThis.fetch = async () => ({
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => JSON.stringify({
      code: 0,
      data: {
        [AUTH_SESSION_STORAGE_KEY]: {
          token: 'backend-user-admin',
          userId: 'user-admin',
          remember: true,
        },
        aaos_backend_auth_token: 'stale-backend-token',
        [STORAGE_KEYS.LEAD_SOURCE_CONFIGS]: [{ id: 'source-server' }],
      },
      message: 'success',
    }),
  } as Response);
  storage.set(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
    token: 'backend-user-sales',
    userId: 'user-sales',
    remember: true,
  }));
  storage.set('aaos_backend_auth_token', 'current-backend-token');

  await syncBackendStorageFromServer(0);

  assert.equal(JSON.parse(storage.get(AUTH_SESSION_STORAGE_KEY) || '{}').userId, 'user-sales');
  assert.equal(storage.get('aaos_backend_auth_token'), 'current-backend-token');
  assert.deepEqual(JSON.parse(storage.get(STORAGE_KEYS.LEAD_SOURCE_CONFIGS) || '[]'), [{ id: 'source-server' }]);

  const localOnlyWriteRequests: string[] = [];
  globalThis.fetch = async (url, init) => {
    if (init?.method === 'PUT' || init?.method === 'DELETE') {
      localOnlyWriteRequests.push(String(url));
    }
    return {
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => JSON.stringify({ code: 0, data: true, message: 'success' }),
    } as Response;
  };

  persistBackendStorageValue(AUTH_SESSION_STORAGE_KEY, { userId: 'user-admin' });
  persistBackendStorageValue('aaos_backend_auth_token', 'stale-token');

  assert.deepEqual(localOnlyWriteRequests, []);

  globalThis.fetch = async () => ({
    status: 403,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => JSON.stringify({ code: 403, data: null, message: 'Forbidden' }),
  } as Response);

  await assert.rejects(
    () => persistBackendStorageValue(STORAGE_KEYS.CUSTOMERS, []),
    /Forbidden/,
  );
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
