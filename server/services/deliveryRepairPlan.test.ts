import assert from 'node:assert/strict';
import type { Delivery } from '../../src/types/delivery';
import type { Order } from '../../src/types/order';
import { buildDeliveryRepairPlan } from './deliveryRepairPlan';

const baseOrder = (id: string, deliveryId?: string): Order => ({
  id, orderNo: `ORD-${id}`, customerId: `customer-${id}`, customerName: `客户-${id}`,
  productId: 'product-1', productName: '代理', productLevel: '代理', orderType: '新购', amount: 9800, actualAmount: 9800,
  paymentMethod: '对公转账', status: '已确认', refundStatus: '无', owner: '销售A', payments: [],
  deliveryId, createdAt: '2026-07-15T00:00:00.000Z', updatedAt: '2026-07-15T00:00:00.000Z',
});
const delivery = (id: string, orderId: string): Delivery => ({
  id, orderId, orderNo: `ORD-${orderId}`, customerId: `customer-${orderId}`, customerName: `客户-${orderId}`,
  productType: '代理', currentStage: '合同签订', stages: ['合同签订'], tasks: [], owner: '待分配',
  status: '待开始', createdAt: '2026-07-15T00:00:00.000Z', updatedAt: '2026-07-15T00:00:00.000Z',
});

const plan = buildDeliveryRepairPlan(
  [baseOrder('linked', 'delivery-linked'), baseOrder('missing-link'), baseOrder('missing-delivery'), baseOrder('dangling', 'delivery-gone')],
  [delivery('delivery-linked', 'linked'), delivery('delivery-missing-link', 'missing-link')],
);

assert.deepEqual(plan.linkRepairs, [{ orderId: 'missing-link', deliveryId: 'delivery-missing-link' }]);
assert.deepEqual(plan.createFromOrderIds, ['missing-delivery', 'dangling']);
assert.deepEqual(plan.conflicts, []);

const conflict = buildDeliveryRepairPlan([baseOrder('conflict', 'delivery-a')], [delivery('delivery-b', 'conflict')]);
assert.equal(conflict.conflicts.length, 1);
assert.deepEqual(conflict.createFromOrderIds, []);
