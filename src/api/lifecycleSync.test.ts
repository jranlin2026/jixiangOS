import assert from 'node:assert/strict';
import { claimFromPublicPool, releaseToPublicPool, syncLifecycleByOrder } from './lifecycleSync';
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

const seed = () => {
  storage.clear();
  storage.setItem(STORAGE_KEYS.LEADS, JSON.stringify([{
    id: 'lead-1',
    customerId: 'customer-1',
    name: 'Alice',
    company: 'ACME',
    phone: '13900000001',
    source: 'Live',
    status: '新线索',
    lifecycleStatusCode: 'pending_followup',
    owner: 'Wang',
    createdAt: now,
    updatedAt: now,
    followUpRecords: [],
  }]));
  storage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([{
    id: 'customer-1',
    name: 'Alice',
    company: 'ACME',
    phone: '13900000001',
    customerLevel: 'L1潜客',
    lifecycleStatusCode: 'pending_followup',
    owner: 'Wang',
    totalSpent: 0,
    orderCount: 0,
    growthPath: [],
    growthRecords: [],
    createdAt: now,
    updatedAt: now,
  }]));
  storage.setItem(STORAGE_KEYS.OPPORTUNITIES, JSON.stringify([]));
};

seed();

const order = {
  id: 'order-1',
  orderNo: 'SO-1',
  customerId: 'customer-1',
  customerName: 'ACME',
} as any;

syncLifecycleByOrder(order, 'ordered');

let leads = JSON.parse(storage.getItem(STORAGE_KEYS.LEADS) || '[]');
let customers = JSON.parse(storage.getItem(STORAGE_KEYS.CUSTOMERS) || '[]');
assert.equal(leads[0].lifecycleStatusCode, 'ordered');
assert.equal(leads[0].orderId, 'order-1');
assert.equal(customers[0].lifecycleStatusCode, 'ordered');

syncLifecycleByOrder(order, 'refunded');
leads = JSON.parse(storage.getItem(STORAGE_KEYS.LEADS) || '[]');
customers = JSON.parse(storage.getItem(STORAGE_KEYS.CUSTOMERS) || '[]');
assert.equal(leads[0].lifecycleStatusCode, 'refunded');
assert.equal(customers[0].lifecycleStatusCode, 'refunded');

releaseToPublicPool({ customerId: 'customer-1' }, 'No intent', 'System Admin');
leads = JSON.parse(storage.getItem(STORAGE_KEYS.LEADS) || '[]');
customers = JSON.parse(storage.getItem(STORAGE_KEYS.CUSTOMERS) || '[]');
assert.equal(leads[0].lifecycleStatusCode, 'refunded');
assert.equal(leads[0].assignedTo, undefined);
assert.equal(customers[0].lifecycleStatusCode, 'public_pool');
assert.equal(customers[0].releaseReason, 'No intent');

claimFromPublicPool({ customerId: 'customer-1' }, 'Li');
leads = JSON.parse(storage.getItem(STORAGE_KEYS.LEADS) || '[]');
customers = JSON.parse(storage.getItem(STORAGE_KEYS.CUSTOMERS) || '[]');
assert.equal(leads[0].lifecycleStatusCode, 'refunded');
assert.equal(leads[0].owner, 'Wang');
assert.equal(leads[0].assignedTo, undefined);
assert.equal(customers[0].lifecycleStatusCode, 'pending_followup');
assert.equal(customers[0].owner, 'Li');
assert.equal(customers[0].releaseReason, undefined);
