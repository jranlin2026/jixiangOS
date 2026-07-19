import assert from 'node:assert/strict';
import type { Customer } from '../../types/customer';
import { CUSTOMER_MERGE_FIELDS } from '../../types/customerMerge';
import {
  buildCustomerMergeInput,
  buildInitialMergeDecisions,
  isCustomerMergeSelectionReady,
} from './customerMergeDialogModel';

const customer = (id: string, manualTagIds: string[] = []): Customer => ({
  id,
  name: id,
  company: '',
  phone: '',
  owner: '销售',
  customerLevel: 'L1',
  totalSpent: 0,
  orderCount: 0,
  growthPath: [],
  growthRecords: [],
  manualTagIds,
  createdAt: '2026-07-19T00:00:00.000Z',
  updatedAt: '2026-07-19T00:00:00.000Z',
});

const loaded = [customer('c1', ['t1']), customer('c2', ['t1', 't2'])];
assert.equal(isCustomerMergeSelectionReady(['c1', 'c2'], loaded), true);
assert.equal(isCustomerMergeSelectionReady(['c1', 'c2', 'c3'], loaded), false, '部分加载时必须禁止合并');
assert.equal(isCustomerMergeSelectionReady(['c1', 'c1'], [loaded[0]]), false, '去重后不足两位客户必须禁止合并');

const decisions = buildInitialMergeDecisions('c1');
assert.deepEqual(Object.keys(decisions), [...CUSTOMER_MERGE_FIELDS]);
const input = buildCustomerMergeInput(loaded, 'c1', decisions, '  重复客户  ');
assert.deepEqual(input.secondaryCustomerIds, ['c2']);
assert.deepEqual(input.tagDecision.selectedTagIds, ['t1', 't2']);
assert.equal(input.reason, '重复客户');

console.log('customer merge dialog model: ok');
