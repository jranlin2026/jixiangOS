import assert from 'node:assert/strict';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { assertCustomerCanBeSoftDeleted } from './customerDeletePolicy';

let deleteCalls = 0;
const txWithOrder = {
  businessRecord: {
    findMany: async () => [
      { id: 'root', domain: STORAGE_KEYS.CUSTOMERS, recordId: 'c-1', customerId: 'c-1', data: { id: 'c-1', activityRecords: [], growthPath: [], growthRecords: [] } },
      { id: 'order', domain: STORAGE_KEYS.ORDERS, recordId: 'o-1', customerId: 'c-1', data: { customerId: 'c-1' } },
    ],
    deleteMany: async () => { deleteCalls += 1; },
  },
  leadRecord: { findMany: async () => [], deleteMany: async () => { deleteCalls += 1; } },
  customerTodo: { findMany: async () => [], deleteMany: async () => { deleteCalls += 1; } },
  appStorage: { findUnique: async () => null },
};

await assert.rejects(
  () => assertCustomerCanBeSoftDeleted(txWithOrder as any, 'c-1'),
  /存在关联业务，不能删除：订单关联/,
);
assert.equal(deleteCalls, 0, '删除策略只能检查，不能删除关联记录');

const txWithIntrinsicOnly = {
  businessRecord: {
    findMany: async () => [{
      id: 'root', domain: STORAGE_KEYS.CUSTOMERS, recordId: 'c-2', customerId: 'c-2',
      data: {
        id: 'c-2',
        activityRecords: [{ id: 'follow', type: 'follow', attachments: [] }],
        growthPath: [{ id: 'growth' }], growthRecords: [{ reason: '升级' }], manualTagIds: ['tag-1'],
      },
    }],
  },
  leadRecord: { findMany: async () => [] },
  customerTodo: { findMany: async () => [] },
  appStorage: { findUnique: async () => null },
};
await assert.doesNotReject(() => assertCustomerCanBeSoftDeleted(txWithIntrinsicOnly as any, 'c-2'));

const txWithConvertedLead = {
  businessRecord: {
    findMany: async () => [{
      id: 'root', domain: STORAGE_KEYS.CUSTOMERS, recordId: 'c-3', customerId: 'c-3',
      data: { id: 'c-3', activityRecords: [], growthPath: [], growthRecords: [] },
    }],
  },
  leadRecord: { findMany: async () => [{ id: 'lead-c-3', data: { id: 'lead-c-3', customerId: 'c-3' } }] },
  customerTodo: { findMany: async () => [] },
  appStorage: { findUnique: async () => null },
};
await assert.rejects(
  () => assertCustomerCanBeSoftDeleted(txWithConvertedLead as any, 'c-3'),
  /线索关联/,
);
await assert.doesNotReject(() => assertCustomerCanBeSoftDeleted(
  txWithConvertedLead as any,
  'c-3',
  { cascadeLinkedLeads: true },
));

console.log('customer delete policy tests passed');
