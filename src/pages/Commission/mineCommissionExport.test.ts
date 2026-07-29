import assert from 'node:assert/strict';
import type { Commission, MonthlyCommissionPayout } from '../../types/commission';
import { buildMineCommissionExportResult } from './mineCommissionExport';

const commission = (id: string, overrides: Partial<Commission>): Commission => ({
  id,
  orderId: `order-${id}`,
  orderNo: `ORD-${id}`,
  customerName: `客户-${id}`,
  productLevel: '899',
  orderAmount: 10_000,
  commissionRate: 0,
  commissionAmount: 500,
  role: '销售',
  owner: '测试员工',
  ownerId: 'user-1',
  department: '销售部',
  status: '待发放',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  ...overrides,
});

const tiered = commission('tiered', {
  ruleCalculationType: 'tiered_percentage',
  performanceAmount: 80_000,
  commissionAmount: 0,
  payoutPlanName: '销售月度阶梯',
});
const ordinary = commission('ordinary', { commissionAmount: 500, payoutPlanName: '普通固定提成' });
const recovery = commission('recovery', {
  commissionAmount: 30,
  role: '挽回人员',
  sourceBusinessType: 'after_sales_recovery',
});

const payout: MonthlyCommissionPayout = {
  period: '2026-07',
  owner: '测试员工',
  ownerId: 'user-1',
  department: '销售部',
  orderCount: 3,
  monthlyPaidAmount: 90_000,
  pendingConfirmAmount: 0,
  pendingPayAmount: 4_530,
  paidAmount: 0,
  exceptionAmount: 0,
  withdrawnAmount: 0,
  chargebackAmount: 0,
  totalAmount: 4_530,
  status: '待发放',
  formalOrderCount: 2,
  recoveryOrderCount: 1,
  formalOrderPaidAmount: 20_000,
  recoveryBusinessAmount: 699,
  statusCounts: {
    pendingHandling: 0,
    pendingConfirm: 0,
    pendingPay: 3,
    paid: 0,
    withdrawn: 0,
  },
  commissions: [tiered, ordinary, recovery],
  roleSummaries: [{
    role: '销售',
    orderCount: 1,
    monthlyPaidAmount: 80_000,
    pendingConfirmAmount: 0,
    pendingPayAmount: 4_000,
    paidAmount: 0,
    exceptionAmount: 0,
    withdrawnAmount: 0,
    chargebackAmount: 0,
    totalAmount: 4_000,
    status: '待发放',
    isTiered: true,
    tierSnapshot: {
      tiers: [{ minAmount: 50_000, maxAmount: 100_000, rate: 5 }],
      currentTier: { minAmount: 50_000, maxAmount: 100_000, rate: 5 },
      baseAmount: 80_000,
      gapToNext: 20_000,
    },
    commissions: [tiered],
  }],
};

const result = buildMineCommissionExportResult('2026-07', [payout], '测试员工');
assert.deepEqual(result.sheetNames, ['月度汇总', '提成明细']);
assert.equal(result.filename, '我的提成明细-测试员工-2026-07.xlsx');
assert.equal(result.summaryRows[0].tierPerformanceAmount, 80_000);
assert.equal(result.summaryRows[0].tierRate, '5%');
assert.equal(result.summaryRows[0].tierCommissionAmount, 4_000);
assert.equal(result.summaryRows[0].ordinaryCommissionAmount, 500);
assert.equal(result.summaryRows[0].recoveryCommissionAmount, 30);
assert.equal(result.summaryRows[0].formalOrderPaidAmount, 20_000);
assert.equal(result.summaryRows[0].recoveryBusinessAmount, 699);
assert.equal(result.summaryRows[0].formalOrderCount, 2);
assert.equal(result.summaryRows[0].recoveryOrderCount, 1);
assert.equal(result.summaryRows[0].statusDistribution, '待处理0 / 待确认0 / 待发放3 / 已发放0 / 已撤回0');
assert.equal(result.summaryColumns.some((column) => column.label === '关联订单实付金额'), false);
assert.equal(result.detailRows.length, 3);
assert.equal(result.detailRows.find((row) => row.commissionType === '月度阶梯提成')?.commissionAmount, 4_000);
assert.equal(result.detailRows.find((row) => row.commissionType === '售后挽回提成')?.businessSource, '售后挽回');

const historicalRecovery = commission('historical-recovery', {
  orderNo: 'RCV-HISTORICAL',
  status: '已发放',
  payoutPlanId: undefined,
  payoutPlanName: undefined,
});
const fallbackResult = buildMineCommissionExportResult('2026-07', [{
  ...payout,
  formalOrderCount: undefined,
  recoveryOrderCount: undefined,
  formalOrderPaidAmount: undefined,
  recoveryBusinessAmount: undefined,
  statusCounts: undefined,
  commissions: [historicalRecovery],
}], '测试员工');
assert.equal(fallbackResult.summaryRows[0].formalOrderCount, 0, 'RCV 历史单号不得误归正式订单');
assert.equal(fallbackResult.summaryRows[0].recoveryOrderCount, 1);
assert.equal(fallbackResult.summaryRows[0].statusDistribution, '待处理0 / 待确认0 / 待发放0 / 已发放1 / 已撤回0');

const paidTiered = { ...tiered, status: '已发放' as const, commissionAmount: 3_500 };
const paidTieredResult = buildMineCommissionExportResult('2026-07', [{
  ...payout,
  paidAmount: 3_500,
  pendingPayAmount: 0,
  totalAmount: 3_500,
  status: '已发放',
  commissions: [paidTiered],
}], '测试员工');
assert.equal(
  paidTieredResult.detailRows[0].commissionAmount,
  3_500,
  '已发放阶梯提成必须保留发放快照金额，不得按当前档位重算',
);

console.log('mine commission export tests passed');
