import assert from 'node:assert/strict';
import type { Commission, CommissionPayoutPlan } from '../../types/commission';
import {
  buildCommissionPayoutPlanSnapshot,
  getCommissionTierBucketKey,
  isAfterSalesRecoveryCommission,
  isRecoveryCommission,
  resolveCommissionTierSnapshotSource,
} from './commissionConfiguration';

const plan: CommissionPayoutPlan = {
  id: 'plan-recovery-tiered',
  name: '售后挽回阶梯奖',
  commissionType: 'tiered_percentage',
  commissionValue: 0,
  tiers: [
    { minAmount: 0, maxAmount: 10000, rate: 5 },
    { minAmount: 10000, rate: 8 },
  ],
  version: 3,
  isActive: true,
  description: '挽回人员月度累计',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-26T00:00:00.000Z',
};

const snapshot = buildCommissionPayoutPlanSnapshot(plan);
assert.equal(snapshot.version, 3);
assert.equal(snapshot.name, '售后挽回阶梯奖');
assert.equal(snapshot.tiers?.length, 2);

const commission = {
  id: 'commission-1',
  ownerId: 'employee-1',
  owner: '员工一',
  role: '挽回人员',
  payoutPlanId: plan.id,
  payoutPlanVersion: 3,
  payoutPlanSnapshot: snapshot,
} as Commission;

assert.equal(
  getCommissionTierBucketKey(commission),
  'employee-1::挽回人员::plan-recovery-tiered::v3',
);
assert.equal(resolveCommissionTierSnapshotSource(commission, [plan]).length, 2);

const legacyCommission = {
  ...commission,
  payoutPlanVersion: undefined,
  payoutPlanSnapshot: undefined,
  tierSnapshot: undefined,
} as Commission;
assert.equal(
  resolveCommissionTierSnapshotSource(legacyCommission, [plan]).length,
  2,
  '历史提成缺少快照时应能按方案 ID 补齐档位',
);

const legacyAfterSalesRecovery = {
  ...commission,
  orderId: 'recovery-legacy-1',
  orderNo: 'RCV-LEGACY-1',
  sourceRecoveryOrderId: 'recovery-legacy-1',
  sourceBusinessType: undefined,
} as Commission;
assert.equal(isAfterSalesRecoveryCommission(legacyAfterSalesRecovery), true);
assert.equal(isRecoveryCommission(legacyAfterSalesRecovery), true);

const legacyRefundRecovery = {
  ...commission,
  orderId: 'formal-order-1',
  orderNo: 'ORD-LEGACY-1',
  sourceRefundId: 'refund-legacy-1',
  sourceBusinessType: undefined,
  isRecoveryBonus: true,
} as Commission;
assert.equal(isAfterSalesRecoveryCommission(legacyRefundRecovery), false);
assert.equal(isRecoveryCommission(legacyRefundRecovery), true, '历史退款挽回不得误判为正式订单');
