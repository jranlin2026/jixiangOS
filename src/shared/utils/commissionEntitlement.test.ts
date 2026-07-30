import assert from 'node:assert/strict';
import type { Commission, CommissionTier } from '../../types/commission';
import { resolveCommissionEntitlements } from './commissionEntitlement';

const tiers: CommissionTier[] = [
  { minAmount: 0, maxAmount: 30_000, rate: 8 },
  { minAmount: 30_000, rate: 10 },
];

const commission = (
  id: string,
  overrides: Partial<Commission> = {},
): Commission => ({
  id,
  orderId: `order-${id}`,
  orderNo: `ORD-${id}`,
  customerName: '测试客户',
  productLevel: '899',
  orderAmount: 10_000,
  performanceAmount: 10_000,
  commissionRate: 0,
  commissionAmount: 0,
  payoutPlanId: 'tier-plan',
  payoutPlanName: '销售月度阶梯',
  payoutPlanVersion: 1,
  payoutPlanSnapshot: {
    id: 'tier-plan',
    name: '销售月度阶梯',
    version: 1,
    commissionType: 'tiered_percentage',
    commissionValue: 0,
    tiers,
  },
  ruleCalculationType: 'tiered_percentage',
  role: '销售',
  owner: '销售A',
  ownerId: 'sales-a',
  department: '销售部',
  paymentDate: '2026-06-15T08:00:00.000Z',
  status: '待发放',
  settlementVersion: 2,
  createdAt: '2026-06-15T08:00:00.000Z',
  updatedAt: '2026-06-15T08:00:00.000Z',
  ...overrides,
});

const input: Commission[] = [
  commission('june-paid', {
    status: '已发放',
    orderAmount: 20_000,
    performanceAmount: 20_000,
    commissionAmount: 1_600,
    commissionRate: 0.08,
  }),
  commission('june-pending', {
    orderAmount: 15_000,
    performanceAmount: 15_000,
  }),
  commission('july', {
    paymentDate: '2026-07-01T08:00:00.000Z',
    orderAmount: 10_000,
    performanceAmount: 10_000,
  }),
  commission('other-owner', {
    owner: '销售B',
    ownerId: 'sales-b',
    orderAmount: 20_000,
    performanceAmount: 20_000,
  }),
  commission('other-plan', {
    payoutPlanId: 'other-plan',
    payoutPlanName: '另一方案',
    payoutPlanSnapshot: {
      id: 'other-plan',
      name: '另一方案',
      version: 1,
      commissionType: 'tiered_percentage',
      commissionValue: 0,
      tiers: [{ minAmount: 0, rate: 5 }],
    },
    orderAmount: 50_000,
    performanceAmount: 50_000,
  }),
  commission('withdrawn-history', {
    status: '已撤回',
    settlementVersion: 1,
    orderAmount: 1_000_000,
    performanceAmount: 1_000_000,
  }),
  commission('correction-supplement', {
    orderId: 'order-june-paid',
    orderNo: 'ORD-june-paid',
    status: '待确认',
    settlementVersion: undefined,
    ruleCalculationType: 'fixed',
    payoutPlanId: undefined,
    payoutPlanSnapshot: undefined,
    commissionRate: 0,
    commissionAmount: 200,
    performanceAmount: 0,
    correctionCaseId: 'correction-1',
    correctionDeltaType: '补发',
  }),
];
const untouched = structuredClone(input);

const result = resolveCommissionEntitlements(input);
const byId = new Map(result.map((item) => [item.id, item]));

assert.equal(result.length, 6, '返回当前轮次提成，并独立保留更正补发差额');
assert.equal(byId.get('june-paid')?.commissionAmount, 2_000, '已发放提成也必须按新的月度阶梯计算应得额');
assert.equal(byId.get('june-pending')?.commissionAmount, 1_500);
assert.equal(byId.get('june-paid')?.tierSnapshot?.baseAmount, 35_000);
assert.equal(byId.get('july')?.commissionAmount, 800, '不同月份不得合并阶梯业绩');
assert.equal(byId.get('other-owner')?.commissionAmount, 1_600, '不同员工不得合并阶梯业绩');
assert.equal(byId.get('other-plan')?.commissionAmount, 2_500, '不同方案不得合并阶梯业绩');
assert.equal(byId.has('withdrawn-history'), false, '历史撤回轮次不得进入应得额计算');
assert.equal(byId.get('correction-supplement')?.commissionAmount, 200, '第2轮及更高轮次后生成的补发差额不得被当作第1轮过滤');
assert.deepEqual(input, untouched, '应得额计算不得修改输入快照');

console.log('commission entitlement tests passed');
