import assert from 'node:assert/strict';
import { customerApi } from './customerApi';
import { leadApi } from './leadApi';
import { clearBackendToken, flushBackendStorageWrites, writeBackendToken } from './backendClient';
import { AUTH_SESSION_STORAGE_KEY } from '../shared/utils/auth';
import { LEAD_STATUS, LIFECYCLE_STATUS_CODES, STORAGE_KEYS } from '../shared/utils/constants';
import type { Customer } from '../types/customer';
import type { Lead } from '../types/lead';

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
const originalUseBackend = process.env.VITE_USE_BACKEND_API;
const originalApiBase = process.env.VITE_AI_API_BASE;
const now = '2026-07-11T08:00:00.000Z';

const activeCustomer: Customer = {
  id: 'cust-release-regression',
  name: '待释放客户',
  company: '待释放公司',
  phone: '13900000001',
  owner: '销售A',
  lifecycleStatusCode: LIFECYCLE_STATUS_CODES.FOLLOWING,
  lifecycleStatusUpdatedAt: now,
  customerLevel: 'L1',
  totalSpent: 0,
  orderCount: 0,
  growthPath: [],
  growthRecords: [],
  activityRecords: [],
  createdAt: now,
  updatedAt: now,
};

const releasedCustomer: Customer = {
  ...activeCustomer,
  owner: '公海',
  lifecycleStatusCode: LIFECYCLE_STATUS_CODES.PUBLIC_POOL,
  publicPoolAt: now,
  updatedAt: now,
};

storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
storage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([activeCustomer]));
const activeLead: Lead = {
  id: 'lead-release-regression',
  customerId: activeCustomer.id,
  name: activeCustomer.name,
  company: activeCustomer.company,
  phone: activeCustomer.phone,
  wechat: '',
  source: '手工录入',
  status: LEAD_STATUS.NEW,
  owner: '销售A',
  assignedTo: '销售A',
  lifecycleStatusCode: LIFECYCLE_STATUS_CODES.FOLLOWING,
  lifecycleStatus: '跟进中',
  inputBy: '销售A',
  followUpRecords: [],
  createdAt: now,
  updatedAt: now,
};
storage.setItem(STORAGE_KEYS.LEADS, JSON.stringify([activeLead]));
storage.setItem(STORAGE_KEYS.LEAD_INTAKE_RECORDS, JSON.stringify([]));
storage.setItem(STORAGE_KEYS.USERS, JSON.stringify([{
  id: 'user-sales-a',
  name: '销售A',
  account: 'sales-a',
  email: '',
  phone: '',
  role: '销售顾问',
  isActive: true,
  createdAt: now,
  updatedAt: now,
}]));
storage.setItem(STORAGE_KEYS.LEAD_FLOW_CONFIG, JSON.stringify({
  id: 'lead-flow-global',
  uniqueKeyMode: 'phone_or_wechat',
  interceptionEnabled: true,
  autoAssignEnabled: true,
  autoClaimAfterAssignmentEnabled: true,
  assignmentMode: 'round_robin',
  participantUserIds: ['user-sales-a'],
  dailyLimitEnabled: false,
  dailyLimit: 200,
  lastAssignedIndex: -1,
  updatedAt: now,
}));
storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
  userId: 'user-sales-a',
  token: 'test-token',
  remember: true,
  createdAt: now,
}));

let serverCustomers: Customer[] = [activeCustomer];
let serverLeads: Lead[] = [activeLead];

try {
  process.env.VITE_USE_BACKEND_API = 'true';
  process.env.VITE_AI_API_BASE = 'http://127.0.0.1:3001/api';
  writeBackendToken('session-test');

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = String(init?.method || 'GET');
    if (method === 'POST' && url.endsWith('/customers/cust-release-regression/release')) {
      serverCustomers = [releasedCustomer];
      serverLeads = [{
        ...activeLead,
        owner: '公海',
        assignedTo: undefined,
        lifecycleStatusCode: LIFECYCLE_STATUS_CODES.PUBLIC_POOL,
        lifecycleStatus: '流失公海',
      }];
      return new Response(JSON.stringify({ code: 0, data: releasedCustomer, message: 'success' }), {
        headers: { 'content-type': 'application/json' },
      });
    }
    if (method === 'POST' && url.endsWith('/leads')) {
      const body = JSON.parse(String(init?.body || '{}')) as Partial<Lead>;
      const createdLead: Lead = {
        ...body,
        id: 'lead-new-regression',
        name: body.name || '新增线索',
        phone: body.phone || '',
        source: body.source || '手工录入',
        status: body.status || LEAD_STATUS.NEW,
        owner: body.owner || '待分配',
        inputBy: '销售A',
        followUpRecords: [],
        createdAt: now,
        updatedAt: now,
      };
      serverLeads = [createdLead, ...serverLeads];
      return new Response(JSON.stringify({ code: 0, data: createdLead, message: 'success' }), {
        headers: { 'content-type': 'application/json' },
      });
    }
    if (method === 'PUT' && url.endsWith(`/storage/${encodeURIComponent(STORAGE_KEYS.CUSTOMERS)}`)) {
      const body = JSON.parse(String(init?.body || '{}')) as { value?: Customer[] };
      serverCustomers = body.value || [];
    }
    if (method === 'PUT' && url.endsWith(`/storage/${encodeURIComponent(STORAGE_KEYS.LEADS)}`)) {
      const body = JSON.parse(String(init?.body || '{}')) as { value?: Lead[] };
      serverLeads = body.value || [];
    }
    return new Response(JSON.stringify({ code: 0, data: null, message: 'success' }), {
      headers: { 'content-type': 'application/json' },
    });
  };

  const releaseResult = await customerApi.releaseCustomerToPublicPool(activeCustomer.id, '销售放弃跟进');
  assert.equal(releaseResult.code, 0);

  const createResult = await leadApi.createLead({
    name: '新增线索',
    company: '新增线索公司',
    phone: '13900000002',
    wechat: '',
    source: '手工录入',
    sourceType: '公司资源',
    status: LEAD_STATUS.NEW,
    inputBy: '销售A',
    owner: '销售A',
  });
  assert.equal(createResult.code, 0);
  await flushBackendStorageWrites();

  const releasedAfterLeadCreation = serverCustomers.find((customer) => customer.id === activeCustomer.id);
  assert.equal(releasedAfterLeadCreation?.owner, '公海', '新增线索后，已释放客户不能恢复原销售归属');
  assert.equal(
    releasedAfterLeadCreation?.lifecycleStatusCode,
    LIFECYCLE_STATUS_CODES.PUBLIC_POOL,
    '新增线索后，已释放客户必须继续留在公海池',
  );
  const releasedLeadAfterLeadCreation = serverLeads.find((lead) => lead.id === activeLead.id);
  assert.equal(releasedLeadAfterLeadCreation?.owner, '公海', '新增线索后，关联旧线索不能恢复原销售归属');
  assert.equal(releasedLeadAfterLeadCreation?.assignedTo, undefined, '公海线索不能残留销售分配');
  assert.equal(releasedLeadAfterLeadCreation?.lifecycleStatusCode, LIFECYCLE_STATUS_CODES.PUBLIC_POOL);
} finally {
  clearBackendToken();
  globalThis.fetch = originalFetch;
  if (originalUseBackend === undefined) delete process.env.VITE_USE_BACKEND_API;
  else process.env.VITE_USE_BACKEND_API = originalUseBackend;
  if (originalApiBase === undefined) delete process.env.VITE_AI_API_BASE;
  else process.env.VITE_AI_API_BASE = originalApiBase;
}
