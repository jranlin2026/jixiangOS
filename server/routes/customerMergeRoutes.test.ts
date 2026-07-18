import assert from 'node:assert/strict';
import {
  parseCustomerMergeConfirmation,
  parseCustomerMergePrecheck,
} from './customerMergeRoutes';

const precheck = parseCustomerMergePrecheck({
  mainCustomerId: 'c1', secondaryCustomerIds: ['c2'],
  fieldDecisions: { name: { sourceCustomerId: 'c1' } },
  tagDecision: { selectedTagIds: [] }, reason: '重复录入',
});
assert.equal(precheck.mainCustomerId, 'c1');
assert.throws(() => parseCustomerMergePrecheck({ ...precheck, serverGuard: true }), /不允许的字段/);
assert.deepEqual(parseCustomerMergeConfirmation({
  ...precheck, precheckToken: 'token', idempotencyKey: 'merge-1',
}), { ...precheck, precheckToken: 'token', idempotencyKey: 'merge-1' });
assert.throws(() => parseCustomerMergeConfirmation({ ...precheck, precheckToken: 'token', idempotencyKey: 'merge-1', serverGuard: true }), /不允许的字段/);

console.log('customer merge routes: ok');
