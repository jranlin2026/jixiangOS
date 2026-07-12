import assert from 'node:assert/strict';
import { leadApi } from './leadApi';
import { leadFlowApi } from './leadFlowApi';
import { clearBackendToken, writeBackendToken } from './backendClient';
import { LIFECYCLE_STATUS_CODES, STORAGE_KEYS } from '../shared/utils/constants';
import type { FollowUpRecord, Lead } from '../types/lead';

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

const now = '2026-07-12T12:00:00.000Z';
const lead: Lead = {
  id: 'lead-write-command',
  name: '原线索',
  company: '原公司',
  phone: '+8613800000000',
  source: '转介绍',
  status: '新线索',
  lifecycleStatusCode: LIFECYCLE_STATUS_CODES.PENDING_FOLLOWUP,
  lifecycleStatus: '待跟进',
  owner: '销售甲',
  assignedTo: '销售甲',
  inputBy: '销售甲',
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
  storage.setItem(STORAGE_KEYS.LEADS, JSON.stringify([lead]));
  writeBackendToken('lead-command-session');

  const follow: FollowUpRecord = {
    id: 'follow-server',
    leadId: lead.id,
    type: '电话',
    content: '服务端跟进记录',
    createdBy: '销售甲',
    createdAt: now,
  };
  const requests: Array<{ url: string; method: string; body?: unknown }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = String(init?.method || 'GET');
    requests.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    let data: Lead | FollowUpRecord | boolean | null = null;
    if (url.endsWith('/leads') && method === 'POST') data = { ...lead, id: 'lead-server-create', name: '服务端新建线索' };
    if (url.endsWith(`/leads/${lead.id}`) && method === 'PUT') data = { ...lead, name: '服务端更新线索' };
    if (url.endsWith(`/leads/${lead.id}/follow-ups`)) data = follow;
    if (url.endsWith(`/leads/${lead.id}/assign`)) data = { ...lead, owner: '销售乙', assignedTo: '销售乙' };
    if (url.endsWith(`/leads/${lead.id}`) && method === 'DELETE') data = true;
    const found = data !== null;
    return new Response(JSON.stringify({ code: found ? 0 : 404, data, message: found ? 'success' : 'not found' }), {
      status: found ? 200 : 404,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  assert.equal((await leadApi.createLead({
    name: '客户端新建线索',
    company: '新公司',
    phone: '13900000000',
    source: '官网',
    status: '新线索',
    owner: '待分配',
    inputBy: '伪造录入人',
  })).data?.name, '服务端新建线索');
  assert.equal((await leadApi.updateLead(lead.id, { name: '客户端伪造名称' })).data?.name, '服务端更新线索');
  assert.equal((await leadApi.addFollowUpRecord(lead.id, {
    type: '电话',
    content: '客户端跟进内容',
    createdBy: '伪造人员',
  })).data?.createdBy, '销售甲');
  assert.equal((await leadFlowApi.manualAssignLead(lead.id, '销售乙')).data?.owner, '销售乙');
  assert.equal((await leadApi.deleteLead(lead.id, '重复线索')).data, true);

  assert.deepEqual(requests, [
    {
      url: 'http://127.0.0.1:3001/api/leads',
      method: 'POST',
      body: {
        name: '客户端新建线索',
        company: '新公司',
        phone: '13900000000',
        source: '官网',
        status: '新线索',
        owner: '待分配',
        inputBy: '伪造录入人',
      },
    },
    { url: `http://127.0.0.1:3001/api/leads/${lead.id}`, method: 'PUT', body: { name: '客户端伪造名称' } },
    {
      url: `http://127.0.0.1:3001/api/leads/${lead.id}/follow-ups`,
      method: 'POST',
      body: { type: '电话', content: '客户端跟进内容', createdBy: '伪造人员' },
    },
    { url: `http://127.0.0.1:3001/api/leads/${lead.id}/assign`, method: 'POST', body: { owner: '销售乙' } },
    { url: `http://127.0.0.1:3001/api/leads/${lead.id}`, method: 'DELETE', body: { reason: '重复线索' } },
  ]);
  assert.equal(requests.some((request) => request.url.includes('/storage/')), false);
  assert.deepEqual(
    (JSON.parse(storage.getItem(STORAGE_KEYS.LEADS) || '[]') as Lead[]).map((item) => item.id),
    ['lead-server-create'],
  );
} finally {
  clearBackendToken();
  globalThis.fetch = originalFetch;
  if (originalUseBackend === undefined) delete process.env.VITE_USE_BACKEND_API;
  else process.env.VITE_USE_BACKEND_API = originalUseBackend;
  if (originalApiBase === undefined) delete process.env.VITE_AI_API_BASE;
  else process.env.VITE_AI_API_BASE = originalApiBase;
}
