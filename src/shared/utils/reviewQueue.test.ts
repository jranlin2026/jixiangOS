import assert from 'node:assert/strict';
import {
  REVIEW_QUEUE_OPTIONS,
  getOrderApplicationReviewStatuses,
  getRecoveryOrderReviewStatuses,
} from './reviewQueue';

assert.deepEqual(
  REVIEW_QUEUE_OPTIONS,
  [
    { value: 'pending', label: '待处理/待修改' },
    { value: 'processed', label: '已处理' },
    { value: 'all', label: '全部记录' },
  ],
);

assert.deepEqual(getOrderApplicationReviewStatuses('pending'), ['待财务审核', '退回修改']);
assert.deepEqual(getOrderApplicationReviewStatuses('processed'), ['已入库', '已驳回']);
assert.equal(getOrderApplicationReviewStatuses('all'), undefined);

assert.deepEqual(getRecoveryOrderReviewStatuses('pending'), ['待审核', '退回修改']);
assert.deepEqual(getRecoveryOrderReviewStatuses('processed'), ['待分账', '已分账', '审核驳回']);
assert.equal(getRecoveryOrderReviewStatuses('all'), undefined);
