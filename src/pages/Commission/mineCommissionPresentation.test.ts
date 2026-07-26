import assert from 'node:assert/strict';
import type { Commission, CommissionPayoutPlan } from '../../types/commission';
import {
  buildMineCommissionIdentity,
  buildMineTieredCommissionItems,
  compareMineCommissionBusinessTime,
  getMineCommissionBusinessTime,
  resolveMineTierSnapshot,
} from './mineCommissionPresentation';

const tierCommission = {
  id: 'commission-1',
  orderId: 'order-1',
  orderNo: 'ORD-001',
  customerName: '馨尹',
  orderAmount: 59_800,
  performanceAmount: 59_800,
  role: '销售',
  status: '待发放',
  ruleCalculationType: 'tiered_percentage',
  payoutPlanId: 'plan-sales',
  payoutPlanName: '销售月度阶梯',
  tierSnapshot: {
    tiers: [
      { minAmount: 0, maxAmount: 30_000, rate: 8 },
      { minAmount: 30_000, maxAmount: 50_000, rate: 10 },
      { minAmount: 50_000, rate: 15 },
    ],
    currentTier: { minAmount: 50_000, rate: 15 },
    baseAmount: 59_800,
    gapToNext: 0,
  },
} as Commission;

const editedLivePlan = {
  id: 'plan-sales',
  name: '销售月度阶梯',
  commissionType: 'tiered_percentage',
  commissionValue: 0,
  tiers: [
    { minAmount: 0, maxAmount: 30_000, rate: 5 },
    { minAmount: 30_000, maxAmount: 60_000, rate: 12 },
    { minAmount: 60_000, rate: 18 },
  ],
  isActive: true,
  createdAt: '',
  updatedAt: '',
} as CommissionPayoutPlan;

const liveSnapshot = resolveMineTierSnapshot([tierCommission], [editedLivePlan], true);
assert.equal(liveSnapshot?.currentTier?.rate, 12, '当前月应该使用修改后的启用方案');
assert.equal(liveSnapshot?.gapToNext, 200, '当前月应该重新计算距离下一档的差额');

const historicalSnapshot = resolveMineTierSnapshot([tierCommission], [editedLivePlan], false);
assert.equal(historicalSnapshot?.currentTier?.rate, 15, '历史月份应继续使用分账快照');

assert.deepEqual(
  buildMineCommissionIdentity({ kind: 'individual', customerName: '馨尹', orderNo: 'ORD-001' }),
  { primary: '馨尹', secondary: 'ORD-001' },
  '单笔提成应将客户放在订单号上方',
);
const secondTierCommission = {
  ...tierCommission,
  id: 'commission-2',
  orderId: 'order-2',
  orderNo: 'ORD-002',
  customerName: '客户二',
  performanceAmount: 4_900,
} as Commission;
const tierItems = buildMineTieredCommissionItems([tierCommission, secondTierCommission]);
assert.equal(tierItems.length, 2, '月度阶梯标签显示2笔时，列表必须展示2条订单');
assert.deepEqual(tierItems[0].identity, { primary: '馨尹', secondary: 'ORD-001' });
assert.deepEqual(tierItems[1].identity, { primary: '客户二', secondary: 'ORD-002' });

const olderCommission = { ...tierCommission, id: 'older', paymentDate: '2026-07-01T09:00:00.000Z' } as Commission;
const newerCommission = { ...tierCommission, id: 'newer', paymentDate: '2026-07-02T09:00:00.000Z' } as Commission;
assert.equal(getMineCommissionBusinessTime(newerCommission), '2026-07-02T09:00:00.000Z');
assert.deepEqual(
  [olderCommission, newerCommission].sort(compareMineCommissionBusinessTime).map((item) => item.id),
  ['newer', 'older'],
  '提成明细应按业务成交时间倒序排列',
);

console.log('mine commission presentation tests passed');
