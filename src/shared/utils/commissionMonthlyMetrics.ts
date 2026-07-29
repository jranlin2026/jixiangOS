import type { Commission, CommissionPayoutStatusCounts } from '../../types/commission';
import type { Order } from '../../types/order';
import type { RecoveryOrder } from '../../types/recoveryOrder';
import { isCommissionPendingHandling, isRecoveryCommission } from './commissionConfiguration';

const roundMoney = (value: number) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const WITHDRAWN_STATUSES = new Set<Commission['status']>(['已取消', '已撤回', '待冲销', '已冲销']);

export interface CommissionBusinessMetrics {
  formalOrderCount: number;
  recoveryOrderCount: number;
  formalOrderPaidAmount: number;
  recoveryBusinessAmount: number;
}

export interface CommissionStatusMetrics {
  statusCounts: CommissionPayoutStatusCounts;
  pendingConfirmAmount: number;
  pendingPayAmount: number;
  paidAmount: number;
  withdrawnAmount: number;
  totalAmount: number;
}

export function resolveFormalOrderPaidAmount(order: Order | undefined, commission: Commission): number {
  const payments = Array.isArray(order?.payments)
    ? order.payments.filter((payment) => Number(payment.amount) > 0)
    : [];
  if (payments.length) return roundMoney(payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
  return roundMoney(Number(order?.actualAmount || commission.orderAmount || 0));
}

export function resolveRecoveryBusinessAmount(
  recoveryOrder: RecoveryOrder | undefined,
  commission: Commission,
): number {
  return roundMoney(Number(recoveryOrder?.recoveryAmount || commission.orderAmount || 0));
}

export function calculateCommissionBusinessMetrics(
  commissions: Commission[],
  orders: Order[],
  recoveryOrders: RecoveryOrder[],
): CommissionBusinessMetrics {
  const ordersById = new Map(orders.map((order) => [order.id, order]));
  const recoveryOrdersById = new Map(recoveryOrders.map((order) => [order.id, order]));
  const formalByOrderId = new Map(commissions
    .filter((commission) => !isRecoveryCommission(commission))
    .map((commission) => [commission.orderId, commission]));
  const recoveryByOrderId = new Map(commissions
    .filter(isRecoveryCommission)
    .map((commission) => [commission.sourceRecoveryOrderId || commission.orderId, commission]));
  return {
    formalOrderCount: formalByOrderId.size,
    recoveryOrderCount: recoveryByOrderId.size,
    formalOrderPaidAmount: roundMoney([...formalByOrderId.entries()].reduce((sum, [orderId, commission]) => (
      sum + resolveFormalOrderPaidAmount(ordersById.get(orderId), commission)
    ), 0)),
    recoveryBusinessAmount: roundMoney([...recoveryByOrderId.entries()].reduce((sum, [recoveryId, commission]) => (
      sum + resolveRecoveryBusinessAmount(recoveryOrdersById.get(recoveryId), commission)
    ), 0)),
  };
}

export function calculateCommissionStatusMetrics(
  commissions: Commission[],
  amountFor: (commission: Commission) => number = (commission) => Number(commission.commissionAmount || 0),
): CommissionStatusMetrics {
  const metrics: CommissionStatusMetrics = {
    statusCounts: { pendingHandling: 0, pendingConfirm: 0, pendingPay: 0, paid: 0, withdrawn: 0 },
    pendingConfirmAmount: 0,
    pendingPayAmount: 0,
    paidAmount: 0,
    withdrawnAmount: 0,
    totalAmount: 0,
  };
  commissions.forEach((commission) => {
    const amount = roundMoney(amountFor(commission));
    const pendingHandling = commission.status === '待确认' && isCommissionPendingHandling(commission);
    if (pendingHandling) metrics.statusCounts.pendingHandling += 1;
    if (commission.status === '待确认' && !pendingHandling) {
      metrics.statusCounts.pendingConfirm += 1;
      metrics.pendingConfirmAmount = roundMoney(metrics.pendingConfirmAmount + amount);
      metrics.totalAmount = roundMoney(metrics.totalAmount + amount);
    }
    if (commission.status === '待发放') {
      metrics.statusCounts.pendingPay += 1;
      metrics.pendingPayAmount = roundMoney(metrics.pendingPayAmount + amount);
      metrics.totalAmount = roundMoney(metrics.totalAmount + amount);
    }
    if (commission.status === '已发放') {
      metrics.statusCounts.paid += 1;
      metrics.paidAmount = roundMoney(metrics.paidAmount + amount);
      metrics.totalAmount = roundMoney(metrics.totalAmount + amount);
    }
    if (WITHDRAWN_STATUSES.has(commission.status)) {
      metrics.statusCounts.withdrawn += 1;
      metrics.withdrawnAmount = roundMoney(metrics.withdrawnAmount + amount);
    }
  });
  return metrics;
}
