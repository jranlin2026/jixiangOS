import assert from 'node:assert/strict';
import { leadFlowApi } from './leadFlowApi';
import { DEFAULT_LEAD_FLOW_CONFIG, LEAD_STATUS, STORAGE_KEYS } from '../shared/utils/constants';
import { AUTH_SESSION_STORAGE_KEY } from '../shared/utils/auth';
import type { Lead } from '../types/lead';

const storage = (() => {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
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
process.env.VITE_USE_BACKEND_API = 'true';

const now = '2026-07-11T08:00:00.000Z';
const lead: Lead = {
  id: 'lead-persistence-test',
  name: 'Persistence Lead',
  company: 'Persistence Company',
  phone: '13900000009',
  wechat: 'wx-persistence',
  source: 'Live',
  status: LEAD_STATUS.NEW,
  lifecycleStatus: '待跟进',
  inputBy: 'System Admin',
  assignedTo: 'System Admin',
  owner: 'System Admin',
  createdAt: now,
  updatedAt: now,
  followUpRecords: [],
};

storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
storage.setItem(STORAGE_KEYS.LEADS, JSON.stringify([lead]));
storage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([]));
storage.setItem(STORAGE_KEYS.LEAD_FLOW_CONFIG, JSON.stringify(DEFAULT_LEAD_FLOW_CONFIG));
storage.setItem(STORAGE_KEYS.USERS, JSON.stringify([{
  id: 'user-admin', name: 'System Admin', account: 'admin', email: '', phone: '',
  role: 'super_admin', isActive: true, createdAt: now, updatedAt: now,
}]));
storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
  userId: 'user-admin', token: 'test-token', remember: true, createdAt: now,
}));

globalThis.fetch = async (input) => {
  const url = String(input);
  if (url.includes(encodeURIComponent(STORAGE_KEYS.CUSTOMERS))) {
    return new Response('Internal Server Error', { status: 500 });
  }
  return new Response(JSON.stringify({ code: 0, data: null, message: 'ok' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

try {
  const result = await leadFlowApi.claimLeadAsCustomer(lead.id);
  assert.notEqual(result.code, 0, '客户存储失败时，领取线索不能伪成功');
  assert.match(result.message || '', /保存失败|未保存/);
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEYS.LEADS) || '[]'), [lead], '失败后必须恢复原线索');
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEYS.CUSTOMERS) || '[]'), [], '失败后不能残留幽灵客户');
} finally {
  globalThis.fetch = originalFetch;
  if (originalBackendFlag === undefined) delete process.env.VITE_USE_BACKEND_API;
  else process.env.VITE_USE_BACKEND_API = originalBackendFlag;
}
