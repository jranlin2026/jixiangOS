import type { Delivery } from '../../src/types/delivery';
import type { Order } from '../../src/types/order';

export interface DeliveryRepairPlan {
  linkRepairs: Array<{ orderId: string; deliveryId: string }>;
  createFromOrderIds: string[];
  conflicts: Array<{ orderId: string; orderDeliveryId?: string; deliveryIds: string[]; reason: string }>;
}

export function buildDeliveryRepairPlan(orders: Order[], deliveries: Delivery[]): DeliveryRepairPlan {
  const deliveriesByOrder = new Map<string, Delivery[]>();
  deliveries.forEach((delivery) => {
    const list = deliveriesByOrder.get(delivery.orderId) || [];
    list.push(delivery);
    deliveriesByOrder.set(delivery.orderId, list);
  });

  const plan: DeliveryRepairPlan = { linkRepairs: [], createFromOrderIds: [], conflicts: [] };
  orders
    .filter((order) => !order.deletedAt && order.status === '已确认')
    .forEach((order) => {
      const matches = deliveriesByOrder.get(order.id) || [];
      if (matches.length > 1) {
        plan.conflicts.push({
          orderId: order.id,
          orderDeliveryId: order.deliveryId,
          deliveryIds: matches.map((delivery) => delivery.id),
          reason: '同一订单存在多张交付单',
        });
        return;
      }
      const existing = matches[0];
      if (!existing) {
        plan.createFromOrderIds.push(order.id);
        return;
      }
      if (order.deliveryId && order.deliveryId !== existing.id) {
        plan.conflicts.push({
          orderId: order.id,
          orderDeliveryId: order.deliveryId,
          deliveryIds: [existing.id],
          reason: '订单反向关联与实际交付单冲突',
        });
        return;
      }
      if (!order.deliveryId) plan.linkRepairs.push({ orderId: order.id, deliveryId: existing.id });
    });
  return plan;
}
