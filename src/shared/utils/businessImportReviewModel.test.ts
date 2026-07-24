import assert from 'node:assert/strict';
import {
  buildBusinessImportReviewRequest,
  createBusinessImportReviewSingleFlight,
  failedBusinessImportReviewSelection,
  isImportedPendingReviewRecord,
  selectAllImportedReviewBatch,
  toggleImportedReviewId,
  updateImportedReviewPageSelection,
  type BusinessImportReviewSelection,
} from './businessImportReviewModel';

const empty: BusinessImportReviewSelection = { mode: 'ids', ids: [] };
const firstPage = toggleImportedReviewId(empty, 'imported-1');
const secondPage = toggleImportedReviewId(firstPage, 'imported-2');
assert.deepEqual(secondPage, { mode: 'ids', ids: ['imported-1', 'imported-2'] }, 'explicit IDs remain selected across pages');
assert.deepEqual(toggleImportedReviewId(secondPage, 'imported-1'), { mode: 'ids', ids: ['imported-2'] });

assert.equal(isImportedPendingReviewRecord({ importBatchId: 'batch-1', status: '待财务审核' }, 'orders'), true);
assert.equal(isImportedPendingReviewRecord({ status: '待财务审核' }, 'orders'), false, 'manual order applications are never selectable');
assert.equal(isImportedPendingReviewRecord({ importBatchId: 'batch-1', status: '退回修改' }, 'orders'), false);
assert.equal(isImportedPendingReviewRecord({ importBatchId: 'batch-1', status: '待审核' }, 'recovery_orders'), true);
assert.equal(isImportedPendingReviewRecord({ importBatchId: 'batch-1', status: '待分账' }, 'recovery_orders'), false);

const importedOrderPage = [
  { id: 'imported-1', importBatchId: 'batch-1', status: '待财务审核' },
  { id: 'manual-1', status: '待财务审核' },
];
assert.deepEqual(
  updateImportedReviewPageSelection(empty, importedOrderPage, 'orders', true, false),
  empty,
  'a read-only reviewer cannot select imported records through the page-select handler',
);
assert.deepEqual(
  updateImportedReviewPageSelection(empty, importedOrderPage, 'orders', true, true),
  { mode: 'ids', ids: ['imported-1'] },
  'a writable reviewer can select only imported pending records from the page',
);

const batchSelection = selectAllImportedReviewBatch('batch-1');
assert.deepEqual(
  buildBusinessImportReviewRequest('orders', 'approve', batchSelection, ''),
  { module: 'orders', action: 'approve', importBatchId: 'batch-1' },
);
assert.deepEqual(
  buildBusinessImportReviewRequest('recovery_orders', 'return', secondPage, '  资料不完整  '),
  { module: 'recovery_orders', action: 'return', ids: ['imported-1', 'imported-2'], reason: '资料不完整' },
);
assert.throws(
  () => buildBusinessImportReviewRequest('orders', 'reject', secondPage, '  '),
  /请填写驳回原因/,
);
assert.throws(
  () => buildBusinessImportReviewRequest('orders', 'approve', empty, ''),
  /请选择/,
);

const retry = failedBusinessImportReviewSelection({
  totalCount: 3,
  successCount: 1,
  failedCount: 2,
  results: [
    { id: 'imported-1', success: true, code: 0, message: 'ok' },
    { id: 'imported-2', success: false, code: 409, message: '状态变化' },
    { id: 'imported-3', success: false, code: 500, message: '失败' },
  ],
});
assert.deepEqual(retry, { mode: 'ids', ids: ['imported-2', 'imported-3'] }, 'mixed-result retry keeps only failures');

let executions = 0;
let release!: () => void;
const gate = new Promise<void>((resolve) => { release = resolve; });
const once = createBusinessImportReviewSingleFlight(async () => {
  executions += 1;
  await gate;
  return executions;
});
const first = once();
const duplicate = once();
assert.equal(first, duplicate, 'double-submit returns the active request');
release();
assert.equal(await first, 1);
assert.equal(await once(), 2, 'a completed request can be retried');
