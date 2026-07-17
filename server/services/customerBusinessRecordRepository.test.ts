import assert from 'node:assert/strict';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import type { Customer } from '../../src/types/customer';
import {
  CustomerWriteConflictError,
  createCustomerBusinessRecordRepository,
  mapCustomerBusinessRecord,
} from './customerBusinessRecordRepository';

const VERSION = new Date('2026-07-17T01:00:00.000Z');
const EVENT_AT = new Date('2026-07-17T02:00:00.000Z');
const value: Customer = {
  id: 'customer-repository', name: '客户', company: '公司', phone: '13800000000',
  owner: '销售', ownerId: 'user-sales', ownerIdentityStatus: 'resolved', customerLevel: 'L1',
  lifecycleStatusCode: 'following', totalSpent: 100, orderCount: 1, growthPath: [], growthRecords: [],
  createdAt: '2026-07-17T00:00:00.000Z', updatedAt: EVENT_AT.toISOString(),
};
const row = {
  id: `${STORAGE_KEYS.CUSTOMERS}:${value.id}`,
  domain: STORAGE_KEYS.CUSTOMERS,
  recordId: value.id,
  data: JSON.stringify(value),
  updatedAt: VERSION,
};

const snapshot = mapCustomerBusinessRecord(row);
assert.equal(snapshot.customer.id, value.id);
assert.equal(snapshot.rowId, row.id);
assert.equal(snapshot.businessRecordUpdatedAt.getTime(), VERSION.getTime());
assert.throws(
  () => mapCustomerBusinessRecord({ ...row, domain: STORAGE_KEYS.ORDERS }),
  /aaos_customers/,
  '映射器不得把其他 BusinessRecord 领域当客户',
);
assert.throws(
  () => mapCustomerBusinessRecord({ ...row, recordId: 'different-id' }),
  /客户ID/,
  '顶层 recordId 与 JSON id 不一致时 fail closed',
);

const updates: any[] = [];
const repository = createCustomerBusinessRecordRepository({
  businessRecord: {
    findUnique: async () => row,
    updateMany: async (args: any) => {
      updates.push(args);
      return { count: 1 };
    },
  },
  $queryRaw: async () => [row],
} as any);
assert.equal((await repository.findById(value.id))?.customer.id, value.id);
assert.equal((await repository.lockById(value.id))?.customer.id, value.id);
const changed = { ...value, name: '更新后客户' };
await repository.compareAndSave(snapshot, changed, EVENT_AT);
assert.equal(updates.length, 1);
assert.deepEqual(updates[0].where, {
  id: row.id,
  domain: STORAGE_KEYS.CUSTOMERS,
  recordId: value.id,
  updatedAt: VERSION,
});
assert.equal(updates[0].data.data.name, '更新后客户');
assert.equal(updates[0].data.owner, '销售');
assert.equal(updates[0].data.status, 'following');
assert.equal(updates[0].data.customerId, value.id);
assert.equal(updates[0].data.eventAt, EVENT_AT);

const conflictingRepository = createCustomerBusinessRecordRepository({
  businessRecord: { updateMany: async () => ({ count: 0 }) },
} as any);
await assert.rejects(
  () => conflictingRepository.compareAndSave(snapshot, changed, EVENT_AT),
  CustomerWriteConflictError,
  '版本已变化时不得覆盖并发写',
);

console.log('customer BusinessRecord repository tests passed');
