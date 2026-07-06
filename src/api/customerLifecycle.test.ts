import assert from 'node:assert/strict';
import { customerApi } from './customerApi';
import { leadApi } from './leadApi';
import { STORAGE_KEYS } from '../shared/utils/constants';
import { AUTH_SESSION_STORAGE_KEY } from '../shared/utils/auth';

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

Object.defineProperty(globalThis, 'localStorage', {
  value: storage,
  configurable: true,
});

const now = '2026-06-19T08:00:00.000Z';

storage.clear();
storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
storage.setItem(STORAGE_KEYS.USERS, JSON.stringify([{
  id: 'user-admin',
  name: '系统管理员',
  account: 'admin',
  email: '',
  phone: '',
  role: '超级管理员',
  roleId: 'role-admin',
  departmentId: 'dept-admin',
  isActive: true,
  createdAt: now,
  updatedAt: now,
}]));
storage.setItem(STORAGE_KEYS.ROLES, JSON.stringify([{
  id: 'role-admin',
  name: '超级管理员',
  code: 'super_admin',
  permissions: [{ module: '全部', actions: ['admin'] }],
  memberCount: 1,
  isActive: true,
  createdAt: now,
  updatedAt: now,
}]));
storage.setItem(STORAGE_KEYS.DEPARTMENTS, JSON.stringify([{
  id: 'dept-admin',
  name: '总经办',
  code: 'ADMIN',
  memberCount: 1,
  isActive: true,
  createdAt: now,
  updatedAt: now,
}]));
storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
  userId: 'user-admin',
  token: 'token-admin',
  remember: true,
  createdAt: now,
}));
storage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([
  {
    id: 'customer-active',
    name: 'Active Customer',
    company: 'Active Co',
    phone: '13900000001',
    customerLevel: 'L1',
    lifecycleStatusCode: 'following',
    owner: 'Wang',
    totalSpent: 0,
    orderCount: 0,
    growthPath: [],
    growthRecords: [],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'customer-public',
    name: 'Public Customer',
    company: 'Public Co',
    phone: '13900000002',
    customerLevel: 'L1',
    lifecycleStatusCode: 'public_pool',
    owner: 'Public Pool',
    totalSpent: 0,
    orderCount: 0,
    growthPath: [],
    growthRecords: [],
    createdAt: now,
    updatedAt: now,
  },
]));
storage.setItem(STORAGE_KEYS.LEADS, JSON.stringify([{
  id: 'lead-active',
  customerId: 'customer-active',
  name: 'Active Customer',
  company: 'Active Co',
  phone: '13900000001',
  source: 'Live',
  status: 'new',
  lifecycleStatusCode: 'following',
  owner: 'Wang',
  createdAt: now,
  updatedAt: now,
  followUpRecords: [],
}, {
  id: 'lead-public',
  customerId: 'customer-public',
  name: 'Public Customer',
  company: 'Public Co',
  phone: '13900000002',
  source: 'Live',
  status: 'public_pool',
  lifecycleStatusCode: 'public_pool',
  owner: 'Public Pool',
  createdAt: now,
  updatedAt: now,
  followUpRecords: [],
}]));
storage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify([]));

const defaultRes = await customerApi.fetchCustomers({ pageSize: 10 });
assert.equal(defaultRes.code, 0);
assert.deepEqual(defaultRes.data.items.map((item) => item.id), ['customer-active']);

const publicPoolRes = await customerApi.fetchCustomers({ pageSize: 10, lifecycleStatusCode: 'public_pool' });
assert.equal(publicPoolRes.code, 0);
assert.deepEqual(publicPoolRes.data.items.map((item) => item.id), ['customer-public']);

const claimRes = await customerApi.claimCustomerFromPublicPool('customer-public', 'Li');
assert.equal(claimRes.code, 0);
assert.equal(claimRes.data?.lifecycleStatusCode, 'pending_followup');
assert.equal(claimRes.data?.owner, 'Li');

const leadsAfterClaim = JSON.parse(storage.getItem(STORAGE_KEYS.LEADS) || '[]');
assert.equal(leadsAfterClaim.find((lead: { id: string }) => lead.id === 'lead-public')?.lifecycleStatusCode, 'pending_followup');

const releaseRes = await customerApi.releaseCustomerToPublicPool('customer-active', 'No intent');
assert.equal(releaseRes.code, 0);
assert.equal(releaseRes.data?.lifecycleStatusCode, 'public_pool');
assert.equal(releaseRes.data?.releaseReason, 'No intent');

const leadsAfterRelease = JSON.parse(storage.getItem(STORAGE_KEYS.LEADS) || '[]');
const releasedLead = leadsAfterRelease.find((lead: { id: string }) => lead.id === 'lead-active');
assert.equal(releasedLead?.lifecycleStatusCode, 'public_pool');
assert.equal(releasedLead?.owner, 'Wang');

storage.setItem(STORAGE_KEYS.LEADS, JSON.stringify(leadsAfterRelease.map((lead: { id: string }) => (
  lead.id === 'lead-active' ? { ...lead, lifecycleStatusCode: 'following' } : lead
))));

const healedLead = await leadApi.fetchLeadById('lead-active');
assert.equal(healedLead.code, 0);
assert.equal(healedLead.data?.lifecycleStatusCode, 'public_pool');
