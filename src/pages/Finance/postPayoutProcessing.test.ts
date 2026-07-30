import assert from 'node:assert/strict';
import type { Commission, CommissionPayoutRecord } from '../../types/commission';
import { buildPostPayoutProcessingContext } from './postPayoutProcessing';

const paidCommission = (overrides: Partial<Commission> = {}): Commission => ({
  id: 'commission-paid-1',
  orderId: 'order-1',
  orderNo: 'ORD-1',
  customerName: '客户A',
  productLevel: 'AI产品',
  orderAmount: 899,
  performanceAmount: 899,
  commissionRate: 0,
  commissionAmount: 120,
  role: '销售',
  ownerId: 'user-1',
  owner: '员工A',
  paymentDate: '2026-06-01T11:00:00.000Z',
  status: '已发放',
  sourceBusinessType: 'formal_order',
  createdAt: '2026-06-01T11:00:00.000Z',
  updatedAt: '2026-07-01T11:00:00.000Z',
  ...overrides,
} as Commission);

const payoutRecord: CommissionPayoutRecord = {
  id: 'payout-1',
  payoutNo: 'FF-202607-001',
  period: '2026-07',
  status: '已发放',
  totalCount: 1,
  totalAmount: 120,
  commissionIds: ['commission-paid-1'],
  commissionSnapshots: [paidCommission()],
  byOwner: [],
  createdAt: '2026-07-01T12:00:00.000Z',
  createdById: 'admin',
  createdByName: '超级管理员',
  issuedAt: '2026-07-01T12:00:00.000Z',
  issuedById: 'admin',
  issuedByName: '超级管理员',
};

const formal = buildPostPayoutProcessingContext(payoutRecord, paidCommission());
assert.deepEqual(formal, {
  payoutRecordId: 'payout-1',
  payoutNo: 'FF-202607-001',
  commissionId: 'commission-paid-1',
  sourceType: 'formal_order',
  sourceId: 'order-1',
  sourceBusinessNo: 'ORD-1',
  employee: '员工A',
  role: '销售',
  originalPaidAmount: 120,
  attributedPeriod: '2026-06',
});

const recovery = buildPostPayoutProcessingContext(payoutRecord, paidCommission({
  id: 'commission-recovery-1',
  orderId: 'legacy-order-id',
  orderNo: 'RCV-1',
  sourceBusinessType: 'after_sales_recovery',
  sourceRecoveryOrderId: 'recovery-1',
}));
assert.equal(recovery?.sourceType, 'after_sales_recovery');
assert.equal(recovery?.sourceId, 'recovery-1');

const refundRecovery = buildPostPayoutProcessingContext(payoutRecord, paidCommission({
  sourceBusinessType: 'refund_recovery',
  sourceRecoveryOrderId: 'refund-recovery-1',
}));
assert.equal(refundRecovery, null, '退款挽回等未支持来源不得误入正式订单更正');

const legacyRecovery = buildPostPayoutProcessingContext(payoutRecord, paidCommission({
  orderNo: 'RCV-LEGACY-1',
  sourceBusinessType: undefined,
  sourceRecoveryOrderId: 'legacy-recovery-1',
}));
assert.equal(legacyRecovery?.sourceType, 'after_sales_recovery', '有源挽回单关联的历史提成必须仍可发起售后挽回更正');
assert.equal(legacyRecovery?.sourceId, 'legacy-recovery-1');

const legacyRefundRecovery = buildPostPayoutProcessingContext(payoutRecord, paidCommission({
  sourceBusinessType: undefined,
  sourceRefundId: 'refund-legacy-1',
  sourceRecoveryOrderId: undefined,
  isRecoveryBonus: true,
}));
assert.equal(legacyRefundRecovery, null, '历史退款挽回提成不得误入正式订单或售后挽回更正');

console.log('post payout processing tests passed');
