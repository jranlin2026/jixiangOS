import assert from 'node:assert/strict';
import {
  CUSTOMER_BATCH_ACTION_LABELS,
  canSubmitBatchDialog,
  getBatchDialogPresentation,
  initialCustomerBatchDialogState,
} from './CustomerBatchActionDialog';

assert.equal(
  CUSTOMER_BATCH_ACTION_LABELS.release_to_pool,
  '释放到公海',
  '批量释放必须与单客户操作使用同一业务名称',
);

const precheck = {
  confirmationToken: 'opaque-token',
  expiresAt: '2026-07-18T10:00:00.000Z',
  totalCount: 3,
  executionMode: 'background' as const,
  selectionHash: 'selection-hash',
  inputHash: 'input-hash',
  itemResults: [
    { customerId: 'c-1', status: 'ready' as const, reason: '可执行' },
    { customerId: 'c-2', status: 'ready' as const, reason: '可执行' },
    { customerId: 'c-3', status: 'blocked' as const, reason: '客户权限已变化' },
  ],
};

assert.deepEqual(getBatchDialogPresentation(precheck), {
  executableCount: 2,
  blockedCount: 1,
  totalCount: 3,
  executionMode: 'background',
});

const initial = initialCustomerBatchDialogState();
assert.equal(canSubmitBatchDialog(initial), false);
assert.equal(canSubmitBatchDialog({ ...initial, reason: '团队调整' }), false, '没有预检令牌不能提交');
assert.equal(canSubmitBatchDialog({ ...initial, operation: 'transfer', reason: '团队调整', precheck }), true);
assert.equal(canSubmitBatchDialog({
  ...initial,
  reason: '清理测试客户',
  precheck,
  operation: 'soft_delete',
  deleteConfirmation: '确认删除',
}), false, '删除必须输入指定高风险确认文本');
assert.equal(canSubmitBatchDialog({
  ...initial,
  reason: '清理测试客户',
  precheck,
  operation: 'soft_delete',
  deleteConfirmation: '删除客户',
}), true);

console.log('customer batch action dialog tests passed');
