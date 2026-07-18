import assert from 'node:assert/strict';
import {
  CUSTOMER_MERGE_FIELDS,
  isCustomerMergeExecutionInput,
} from '../../src/types/customerMerge';

assert.deepEqual(CUSTOMER_MERGE_FIELDS, [
  'name', 'phone', 'wechat', 'email', 'company', 'ownerId', 'lifecycleStatusCode',
]);
assert.equal(isCustomerMergeExecutionInput({ mainCustomerId: 'c1' }), false);
assert.equal(isCustomerMergeExecutionInput({
  mainCustomerId: 'c1',
  secondaryCustomerIds: ['c2'],
  reason: '同一客户重复录入',
  precheckToken: 'token',
  idempotencyKey: 'merge-click-1',
  fieldDecisions: {},
  tagDecision: { selectedTagIds: [] },
}), true);

console.log('customer merge contracts: ok');
