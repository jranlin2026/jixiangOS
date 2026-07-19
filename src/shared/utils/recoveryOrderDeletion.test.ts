import assert from 'node:assert/strict';
import {
  isInactiveRecoveryCommissionStatus,
  isRecoveryCommissionRelatedToOrder,
  isRecoveryOrderDeletionLocked,
} from './recoveryOrderDeletion';

assert.equal(isRecoveryOrderDeletionLocked({ status: '待分账', settlementStatus: '待处理' }), false);
assert.equal(isRecoveryOrderDeletionLocked({ status: '已分账', settlementStatus: '待确认' }), true);
assert.equal(isRecoveryOrderDeletionLocked({ status: '已分账', settlementStatus: '待发放' }), true);
assert.equal(isRecoveryOrderDeletionLocked({ status: '已分账', settlementStatus: '已撤回' }), false);

assert.equal(isInactiveRecoveryCommissionStatus('已撤回'), true);
assert.equal(isInactiveRecoveryCommissionStatus('已取消'), true);
assert.equal(isInactiveRecoveryCommissionStatus('已冲销'), true);
assert.equal(isInactiveRecoveryCommissionStatus('待确认'), false);
assert.equal(isInactiveRecoveryCommissionStatus('待发放'), false);
assert.equal(isInactiveRecoveryCommissionStatus('已发放'), false);

const commissionIds = new Set(['commission-linked']);
assert.equal(isRecoveryCommissionRelatedToOrder('recovery-1', commissionIds, { id: 'commission-linked' }), true);
assert.equal(isRecoveryCommissionRelatedToOrder('recovery-1', commissionIds, { orderId: 'recovery-1' }), true);
assert.equal(isRecoveryCommissionRelatedToOrder('recovery-1', commissionIds, { sourceRecoveryOrderId: 'recovery-1' }), true);
assert.equal(isRecoveryCommissionRelatedToOrder('recovery-1', commissionIds, { id: 'commission-other', orderId: 'recovery-2' }), false);

console.log('recovery order deletion policy tests passed');
