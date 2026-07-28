import assert from 'node:assert/strict';
import test from 'node:test';
import type { Commission, CommissionOperationLog } from '../../types/commission';
import {
  getCommissionSplitLineAmountText,
  getCommissionSplitAmountPresentation,
  formatLeadSourcePath,
  getActiveCommissions,
  getCurrentSettlementRoundCommissions,
  summarizeCommissionSplitAmounts,
  summarizeCommissionProcessing,
} from './financeSettlementPresentation';

const baseCommission: Commission = {
  id: 'commission-active',
  orderId: 'order-1',
  orderNo: 'ORD-1',
  customerName: '客户甲',
  productLevel: '899',
  orderAmount: 899,
  commissionRate: 0.1,
  commissionAmount: 89.9,
  performanceAmount: 899,
  role: '销售',
  owner: '童双全',
  department: '销售部',
  status: '待发放',
  paidAt: '2026-07-24T11:00:00.000Z',
  createdAt: '2026-07-24T09:00:00.000Z',
  updatedAt: '2026-07-24T10:00:00.000Z',
};

const logs: CommissionOperationLog[] = [
  {
    id: 'log-confirm',
    orderId: 'order-1',
    orderNo: 'ORD-1',
    customerName: '客户甲',
    action: '确认分账',
    operator: '财务甲',
    operatedAt: '2026-07-24T10:00:00.000Z',
    summary: '确认分账',
  },
  {
    id: 'log-withdraw',
    orderId: 'order-1',
    orderNo: 'ORD-1',
    customerName: '客户甲',
    action: '撤回提成',
    operator: '财务乙',
    operatedAt: '2026-07-24T12:00:00.000Z',
    reason: '金额录入错误',
    summary: '撤回提成',
  },
];

test('只汇总有效分账并提取最新处理留痕', () => {
  const withdrawn: Commission = {
    ...baseCommission,
    id: 'commission-withdrawn',
    commissionAmount: 20,
    status: '已撤回',
    paidAt: undefined,
  };

  const summary = summarizeCommissionProcessing([baseCommission, withdrawn], logs);

  assert.deepEqual(getActiveCommissions([baseCommission, withdrawn]).map((row) => row.id), ['commission-active']);
  assert.equal(summary.totalCommissionAmount, 89.9);
  assert.equal(summary.performanceAmount, 899);
  assert.equal(summary.withdrawnCount, 1);
  assert.equal(summary.settlementOperator, '财务乙');
  assert.equal(summary.confirmedAt, '2026-07-24T10:00:00.000Z');
  assert.equal(summary.paidAt, '2026-07-24T11:00:00.000Z');
  assert.equal(summary.withdrawReason, '金额录入错误');
});

test('调整售后挽回分账时只读取当前有效轮次', () => {
  const historicalWithdrawn: Commission = {
    ...baseCommission,
    id: 'commission-history-v1',
    status: '已撤回',
    settlementVersion: 1,
    settlementRoundId: 'recovery-order-1-v1',
  };
  const staleActiveRound: Commission = {
    ...baseCommission,
    id: 'commission-stale-v2',
    status: '待确认',
    settlementVersion: 2,
    settlementRoundId: 'recovery-order-1-v2',
  };
  const currentRound: Commission = {
    ...baseCommission,
    id: 'commission-current-v3',
    status: '待确认',
    commissionAmount: 2,
    settlementVersion: 3,
    settlementRoundId: 'recovery-order-1-v3',
  };

  assert.deepEqual(
    getCurrentSettlementRoundCommissions(
      [historicalWithdrawn, staleActiveRound, currentRound],
      { settlementVersion: 3, settlementRoundId: 'recovery-order-1-v3' },
    ).map((row) => row.id),
    ['commission-current-v3'],
  );
});

test('完整线索来源去重并保留层级', () => {
  assert.equal(formatLeadSourcePath({ leadSource: '抖音', sourceName: '直播' }), '抖音 / 直播');
  assert.equal(formatLeadSourcePath({ leadSource: '官网', sourceName: '官网' }), '官网');
  assert.equal(formatLeadSourcePath({ leadSource: '', sourceName: undefined }), '');
});

test('未月结的销售阶梯提成不作为零元确定金额展示', () => {
  const tiered: Commission = {
    ...baseCommission,
    id: 'commission-tiered-pending',
    ruleCalculationType: 'tiered_percentage',
    commissionRate: 0,
    commissionAmount: 0,
    performanceAmount: 5960,
    status: '待确认',
    paidAt: undefined,
  };

  assert.deepEqual(summarizeCommissionSplitAmounts([tiered]), {
    confirmedAmount: 0,
    pendingTieredCount: 1,
    pendingTieredPerformanceAmount: 5960,
  });
  assert.deepEqual(getCommissionSplitAmountPresentation([tiered]), {
    kind: 'pending_tiered',
    primaryText: '待月结',
    secondaryText: '月度阶梯提成',
  });
});

test('固定提成与未月结阶梯提成混合时分开展示确定金额', () => {
  const tiered: Commission = {
    ...baseCommission,
    id: 'commission-tiered-mixed',
    ruleCalculationType: 'tiered_percentage',
    commissionRate: 0,
    commissionAmount: 0,
    performanceAmount: 5960,
    status: '待确认',
    paidAt: undefined,
  };
  const fixed: Commission = {
    ...baseCommission,
    id: 'commission-fixed-mixed',
    ruleCalculationType: 'fixed',
    commissionRate: 0,
    commissionAmount: 298,
    performanceAmount: 5960,
    status: '待确认',
    paidAt: undefined,
  };

  assert.deepEqual(getCommissionSplitAmountPresentation([tiered, fixed]), {
    kind: 'pending_tiered',
    primaryText: '已确定 ¥298.00',
    secondaryText: '+ 阶梯提成待月结',
  });
});

test('未月结阶梯提成的人员明细显示计算方式而不是零元', () => {
  const tiered: Commission = {
    ...baseCommission,
    id: 'commission-tiered-line',
    ruleCalculationType: 'tiered_percentage',
    commissionRate: 0,
    commissionAmount: 0,
    performanceAmount: 5960,
    status: '待确认',
    paidAt: undefined,
  };

  assert.equal(getCommissionSplitLineAmountText(tiered), '月度阶梯');

  const calculatedTiered: Commission = {
    ...tiered,
    commissionAmount: 596,
    status: '待发放',
  };
  assert.equal(getCommissionSplitLineAmountText(calculatedTiered), '¥596.00');
  assert.deepEqual(getCommissionSplitAmountPresentation([calculatedTiered]), {
    kind: 'amount',
    primaryText: '共 ¥596.00',
  });
});
