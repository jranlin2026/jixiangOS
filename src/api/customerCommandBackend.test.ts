import assert from 'node:assert/strict';
import { customerApi } from './customerApi';
import { leadFlowApi } from './leadFlowApi';
import { clearBackendToken, writeBackendToken } from './backendClient';
import { LIFECYCLE_STATUS_CODES, STORAGE_KEYS } from '../shared/utils/constants';
import type { Customer } from '../types/customer';
import type { Lead } from '../types/lead';

const values = new Map<string, string>();
const storage = {
  get length() { return values.size; },
  key: (index: number) => Array.from(values.keys())[index] ?? null,
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
  removeItem: (key: string) => values.delete(key),
  clear: () => values.clear(),
};
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

const now = '2026-07-12T09:00:00.000Z';
const customer = (owner: string): Customer => ({
  id: 'customer-command',
  name: '客户A',
  company: 'A公司',
  phone: '13900000000',
  owner,
  customerLevel: 'L1',
  lifecycleStatusCode: owner === '公海' ? LIFECYCLE_STATUS_CODES.PUBLIC_POOL : LIFECYCLE_STATUS_CODES.PENDING_FOLLOWUP,
  lifecycleStatusUpdatedAt: now,
  totalSpent: 0,
  orderCount: 0,
  growthPath: [],
  growthRecords: [],
  activityRecords: [],
  createdAt: now,
  updatedAt: now,
});
const convertedLead: Lead = {
  id: 'lead-command',
  customerId: 'customer-from-lead',
  name: '线索A',
  company: 'A公司',
  phone: '13800000000',
  source: '转介绍',
  status: '新线索',
  owner: '销售A',
  assignedTo: '销售A',
  inputBy: '销售A',
  lifecycleStatusCode: LIFECYCLE_STATUS_CODES.FOLLOWING,
  followUpRecords: [],
  createdAt: now,
  updatedAt: now,
};

const originalFetch = globalThis.fetch;
const originalUseBackend = process.env.VITE_USE_BACKEND_API;
const originalApiBase = process.env.VITE_AI_API_BASE;

try {
  process.env.VITE_USE_BACKEND_API = 'true';
  process.env.VITE_AI_API_BASE = 'http://127.0.0.1:3001/api';
  storage.clear();
  storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
  storage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([customer('公海')]));
  storage.setItem(STORAGE_KEYS.LEADS, JSON.stringify([{ ...convertedLead, customerId: undefined }]));
  writeBackendToken('sales-session');

  const requests: Array<{ url: string; method: string; body?: unknown }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = String(init?.method || 'GET');
    requests.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    let data: Customer | Lead | boolean | null = null;
    if (url.endsWith('/customers/customer-command/claim')) data = customer('当前销售');
    if (url.endsWith('/customers/customer-command/assign')) data = customer('销售B');
    if (url.endsWith('/customers/customer-command') && method === 'PUT') data = { ...customer('销售B'), name: '服务端更新客户' };
    if (url.endsWith('/customers/customer-command') && method === 'DELETE') data = true;
    if (url.endsWith('/leads/lead-command/convert')) data = convertedLead;
    const found = data !== null;
    return new Response(JSON.stringify({ code: found ? 0 : 404, data, message: found ? 'success' : 'not found' }), {
      status: found ? 200 : 404,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  assert.equal((await customerApi.claimCustomerFromPublicPool('customer-command', '伪造用户名')).data?.owner, '当前销售');
  assert.equal((await customerApi.assignCustomerOwner('customer-command', '销售B', '主管分配')).data?.owner, '销售B');
  assert.equal((await customerApi.updateCustomer('customer-command', { name: '客户端伪造名称' })).data?.name, '服务端更新客户');
  assert.equal((await customerApi.deleteCustomer('customer-command', '重复客户')).data, true);
  assert.equal((await leadFlowApi.claimLeadAsCustomer('lead-command', '伪造用户名')).data?.customerId, 'customer-from-lead');

  assert.deepEqual(requests, [
    { url: 'http://127.0.0.1:3001/api/customers/customer-command/claim', method: 'POST', body: undefined },
    { url: 'http://127.0.0.1:3001/api/customers/customer-command/assign', method: 'POST', body: { owner: '销售B', reason: '主管分配' } },
    { url: 'http://127.0.0.1:3001/api/customers/customer-command', method: 'PUT', body: { name: '客户端伪造名称' } },
    { url: 'http://127.0.0.1:3001/api/customers/customer-command', method: 'DELETE', body: { reason: '重复客户' } },
    { url: 'http://127.0.0.1:3001/api/leads/lead-command/convert', method: 'POST', body: undefined },
  ]);
  assert.equal(requests.some((request) => request.method === 'PUT' && request.url.includes('/storage/')), false);
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEYS.CUSTOMERS) || '[]'), [], '服务端删除后只清理本地缓存，不得回写整包 storage');
} finally {
  clearBackendToken();
  globalThis.fetch = originalFetch;
  if (originalUseBackend === undefined) delete process.env.VITE_USE_BACKEND_API;
  else process.env.VITE_USE_BACKEND_API = originalUseBackend;
  if (originalApiBase === undefined) delete process.env.VITE_AI_API_BASE;
  else process.env.VITE_AI_API_BASE = originalApiBase;
}
