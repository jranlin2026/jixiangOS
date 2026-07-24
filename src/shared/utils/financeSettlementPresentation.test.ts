import assert from 'node:assert/strict';
import test from 'node:test';
import type { Commission, CommissionOperationLog } from '../../types/commission';
import {
  formatLeadSourcePath,
  getActiveCommissions,
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

test('完整线索来源去重并保留层级', () => {
  assert.equal(formatLeadSourcePath({ leadSource: '抖音', sourceName: '直播' }), '抖音 / 直播');
  assert.equal(formatLeadSourcePath({ leadSource: '官网', sourceName: '官网' }), '官网');
  assert.equal(formatLeadSourcePath({ leadSource: '', sourceName: undefined }), '');
});
