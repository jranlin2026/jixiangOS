import assert from 'node:assert/strict';
import {
  REVIEW_QUEUE_OPTIONS,
  getOrderApplicationReviewStatuses,
  getRecoveryOrderReviewStatuses,
} from './reviewQueue';

assert.deepEqual(
  REVIEW_QUEUE_OPTIONS.map((option) => option.label),
  ['待处理', '退回修改', '已处理', '全部记录'],
);

assert.deepEqual(getOrderApplicationReviewStatuses('pending'), ['待财务审核']);
assert.deepEqual(getOrderApplicationReviewStatuses('returned'), ['退回修改']);
assert.deepEqual(getOrderApplicationReviewStatuses('processed'), ['已入库', '已驳回']);
assert.equal(getOrderApplicationReviewStatuses('all'), undefined);

assert.deepEqual(getRecoveryOrderReviewStatuses('pending'), ['待审核']);
assert.deepEqual(getRecoveryOrderReviewStatuses('returned'), ['退回修改']);
assert.deepEqual(getRecoveryOrderReviewStatuses('processed'), ['待分账', '已分账', '审核驳回']);
assert.equal(getRecoveryOrderReviewStatuses('all'), undefined);
