import assert from 'node:assert/strict';
import { buildMergeExecutionRequest } from './customerMergeApi';

const request = buildMergeExecutionRequest({
  mainCustomerId: 'c1', secondaryCustomerIds: ['c2'], reason: '重复客户',
  fieldDecisions: {}, tagDecision: { selectedTagIds: [] },
  precheckToken: 'token', idempotencyKey: 'merge-1',
});
assert.deepEqual(Object.keys(request).sort(), [
  'fieldDecisions', 'idempotencyKey', 'mainCustomerId', 'precheckToken',
  'reason', 'secondaryCustomerIds', 'tagDecision',
].sort());

console.log('customer merge api: ok');
