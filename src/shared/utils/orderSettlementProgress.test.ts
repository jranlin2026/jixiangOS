import assert from 'node:assert/strict';
import type { Commission } from '../../types/commission';
import { deriveOrderListSettlementProgress, deriveOrderSettlementProgress } from './orderSettlementProgress';

const split = (status: Commission['status'], overrides: Partial<Commission> = {}) => ({
  id: `split-${status}`,
  orderId: 'order-1',
  orderNo: 'ORD-1',
  customerName: '客户甲',
  productLevel: '课程',
  orderAmount: 2980,
  commissionRate: 0.1,
  commissionAmount: 298,
  role: '销售',
  owner: '销售甲',
  ownerId: 'user-1',
  department: '销售部',
  status,
  payoutPlanId: 'plan-1',
  payoutPlanName: '课程方案',
  createdAt: '2026-07-24T08:00:00.000Z',
  updatedAt: '2026-07-24T08:00:00.000Z',
  ...overrides,
}) as Commission;

assert.equal(deriveOrderSettlementProgress([]), '待处理', '没有分账记录时需要财务处理');
assert.equal(deriveOrderSettlementProgress([split('待确认', { ownerId: undefined })]), '待处理');
assert.equal(deriveOrderSettlementProgress([split('待确认')]), '待确认');
assert.equal(deriveOrderSettlementProgress([split('待发放'), split('已发放')]), '待发放');
assert.equal(deriveOrderSettlementProgress([split('已发放')]), '已发放');
assert.equal(deriveOrderSettlementProgress([split('已撤回')]), '已撤回');
assert.equal(
  deriveOrderSettlementProgress([
    split('已撤回', { id: 'history-v1', settlementVersion: 1, ownerId: undefined }),
    split('待发放', { id: 'current-v2', settlementVersion: 2 }),
  ]),
  '待发放',
  '历史已撤回轮次不应覆盖当前轮次的待发放状态',
);
assert.equal(
  deriveOrderSettlementProgress([
    split('已撤回', { id: 'history-v1', settlementVersion: 1 }),
    split('已发放', { id: 'current-v2', settlementVersion: 2 }),
  ]),
  '已发放',
  '已发放的当前轮次应保持终态',
);
assert.equal(deriveOrderListSettlementProgress([]), '待处理', '订单列表应使用统一的五态分账口径');
