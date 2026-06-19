import assert from 'node:assert/strict';
import { customerApi } from './customerApi';
import { STORAGE_KEYS } from '../shared/utils/constants';

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
storage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([
  {
    id: 'customer-active',
    name: 'Active Customer',
    company: 'Active Co',
    phone: '13900000001',
    customerLevel: 'L1潜客',
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
    customerLevel: 'L1潜客',
    lifecycleStatusCode: 'public_pool',
    owner: '公海',
    totalSpent: 0,
    orderCount: 0,
    growthPath: [],
    growthRecords: [],
    createdAt: now,
    updatedAt: now,
  },
]));
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

const releaseRes = await customerApi.releaseCustomerToPublicPool('customer-active', 'No intent');
assert.equal(releaseRes.code, 0);
assert.equal(releaseRes.data?.lifecycleStatusCode, 'public_pool');
assert.equal(releaseRes.data?.releaseReason, 'No intent');
