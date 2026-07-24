import assert from 'node:assert/strict';
import {
  REVIEW_QUEUE_OPTIONS,
  getOrderApplicationUnifiedReviewStatus,
  getOrderApplicationReviewStatuses,
  getRecoveryOrderUnifiedReviewStatus,
  getRecoveryOrderReviewStatuses,
} from './reviewQueue';

assert.deepEqual(
  REVIEW_QUEUE_OPTIONS,
  [
    { value: 'pending', label: '待审核/退回修改' },
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

assert.equal(getOrderApplicationUnifiedReviewStatus('待财务审核'), '待审核');
assert.equal(getOrderApplicationUnifiedReviewStatus('退回修改'), '退回修改');
assert.equal(getOrderApplicationUnifiedReviewStatus('已驳回'), '已驳回');
assert.equal(getOrderApplicationUnifiedReviewStatus('已入库'), '已通过');
assert.equal(getOrderApplicationUnifiedReviewStatus('已入库', true), '已删除（留痕）');

assert.equal(getRecoveryOrderUnifiedReviewStatus('待审核'), '待审核');
assert.equal(getRecoveryOrderUnifiedReviewStatus('退回修改'), '退回修改');
assert.equal(getRecoveryOrderUnifiedReviewStatus('审核驳回'), '已驳回');
assert.equal(getRecoveryOrderUnifiedReviewStatus('待分账'), '已通过');
assert.equal(getRecoveryOrderUnifiedReviewStatus('已分账'), '已通过');
assert.equal(getRecoveryOrderUnifiedReviewStatus('已分账', true), '已删除（留痕）');
