import assert from 'node:assert/strict';
import {
  SETTLEMENT_STATUSES,
  getSettlementStatusColor,
  normalizeSettlementStatus,
} from './settlementStatus';

assert.deepEqual(SETTLEMENT_STATUSES, ['待处理', '待确认', '待发放', '已发放', '已撤回']);

assert.equal(normalizeSettlementStatus(undefined), '待处理');
assert.equal(normalizeSettlementStatus('待分账'), '待处理');
assert.equal(normalizeSettlementStatus('未分账'), '待处理');
assert.equal(normalizeSettlementStatus('已分账'), '待发放');
assert.equal(normalizeSettlementStatus('待确认'), '待确认');
assert.equal(normalizeSettlementStatus('未知状态', '已撤回'), '已撤回');

assert.deepEqual(
  SETTLEMENT_STATUSES.map((status) => getSettlementStatusColor(status)),
  ['warning', 'info', 'primary', 'success', 'default'],
);
