import assert from 'node:assert/strict';
import { customerApi } from './customerApi';
import { leadApi } from './leadApi';
import { businessRecycleBinApi } from './businessRecycleBinApi';
import { STORAGE_KEYS } from '../shared/utils/constants';
import { AUTH_SESSION_STORAGE_KEY } from '../shared/utils/auth';
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

const at = '2026-07-21T00:00:00.000Z';
const customer = (id: string): Customer => ({
  id, name: id, company: `${id}-company`, phone: '13800000000', customerLevel: 'L1',
  owner: '管理员', totalSpent: 0, orderCount: 0, growthPath: [], growthRecords: [],
  createdAt: at, updatedAt: at,
});
const lead = (id: string, customerId?: string): Lead => ({
  id, customerId, name: id, company: `${id}-company`, phone: '13800000000', source: '测试',
  status: '新线索', owner: '管理员', followUpRecords: [], createdAt: at, updatedAt: at,
});

const originalUseBackend = process.env.VITE_USE_BACKEND_API;
try {
  process.env.VITE_USE_BACKEND_API = 'false';
  storage.clear();
  storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
  storage.setItem(STORAGE_KEYS.USERS, JSON.stringify([{
    id: 'admin', name: '管理员', account: 'admin', role: '超级管理员', isActive: true,
    createdAt: at, updatedAt: at,
  }]));
  storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
    userId: 'admin', token: 'local-test', remember: false, createdAt: at, expiresAt: '2099-01-01T00:00:00.000Z',
  }));
  storage.setItem(STORAGE_KEYS.ORDERS, '[]');

  const firstCustomer = customer('customer-1');
  const linked = lead('lead-linked', firstCustomer.id);
  const sameContactOnly = lead('lead-same-contact');
  const previouslyDeleted = { ...lead('lead-old-deleted', firstCustomer.id), deletedAt: at, deletionCascadeId: 'old-batch' };
  storage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([firstCustomer]));
  storage.setItem(STORAGE_KEYS.LEADS, JSON.stringify([linked, sameContactOnly, previouslyDeleted]));

  assert.equal((await customerApi.deleteCustomer(firstCustomer.id, '联合删除')).code, 0);
  let customers = JSON.parse(storage.getItem(STORAGE_KEYS.CUSTOMERS) || '[]') as Customer[];
  let leads = JSON.parse(storage.getItem(STORAGE_KEYS.LEADS) || '[]') as Lead[];
  const cascadeId = customers[0].deletionCascadeId;
  assert.ok(cascadeId);
  assert.equal(leads.find((item) => item.id === linked.id)?.deletionCascadeId, cascadeId);
  assert.equal(leads.find((item) => item.id === sameContactOnly.id)?.deletedAt, undefined, '相同联系方式不能代替稳定 customerId');
  assert.equal(leads.find((item) => item.id === previouslyDeleted.id)?.deletionCascadeId, 'old-batch', '历史已删除线索不得并入新批次');

  assert.equal((await businessRecycleBinApi.restoreRecycleBinItem('lead', linked.id)).code, 0);
  customers = JSON.parse(storage.getItem(STORAGE_KEYS.CUSTOMERS) || '[]') as Customer[];
  leads = JSON.parse(storage.getItem(STORAGE_KEYS.LEADS) || '[]') as Lead[];
  assert.equal(customers[0].deletedAt, undefined);
  assert.equal(leads.find((item) => item.id === linked.id)?.deletedAt, undefined);
  assert.ok(leads.find((item) => item.id === previouslyDeleted.id)?.deletedAt, '恢复只能恢复同一联合删除批次');

  const secondCustomer = customer('customer-2');
  storage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([secondCustomer]));
  storage.setItem(STORAGE_KEYS.LEADS, JSON.stringify([
    lead('lead-entry', secondCustomer.id), lead('lead-sibling', secondCustomer.id), sameContactOnly,
  ]));
  assert.equal((await leadApi.deleteLead('lead-entry', '从线索入口联合删除')).code, 0);
  customers = JSON.parse(storage.getItem(STORAGE_KEYS.CUSTOMERS) || '[]') as Customer[];
  leads = JSON.parse(storage.getItem(STORAGE_KEYS.LEADS) || '[]') as Lead[];
  assert.ok(customers[0].deletedAt);
  assert.equal(leads.filter((item) => item.customerId === secondCustomer.id).every((item) => Boolean(item.deletedAt)), true);
  assert.equal(leads.find((item) => item.id === sameContactOnly.id)?.deletedAt, undefined);
} finally {
  if (originalUseBackend === undefined) delete process.env.VITE_USE_BACKEND_API;
  else process.env.VITE_USE_BACKEND_API = originalUseBackend;
}
