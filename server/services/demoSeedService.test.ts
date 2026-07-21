import assert from 'node:assert/strict';
import { seedDemoBusinessData } from './demoSeedService';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';

const storage = new Map<string, unknown>();
const leads: any[] = [];
const businessRecords: any[] = [];
const store = {
  appStorage: {
    upsert: async ({ where, create, update }: any) => storage.set(where.key, storage.has(where.key) ? update.value : create.value),
  },
  leadRecord: { upsert: async ({ create }: any) => leads.push(create) },
  businessRecord: { upsert: async ({ create }: any) => businessRecords.push(create) },
} as any;

await seedDemoBusinessData(store);
assert.ok(leads.length > 0);
assert.ok(businessRecords.length > 0);
assert.ok((storage.get(STORAGE_KEYS.CUSTOMERS) as unknown[]).length > 0);
assert.ok((storage.get(STORAGE_KEYS.ORDERS) as unknown[]).length > 0);

console.log('demo seed service tests passed');
