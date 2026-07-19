import type { RecoveryOrder } from '../../types/recoveryOrder';

type RecoveryOrderDeletionState = Pick<RecoveryOrder, 'status' | 'settlementStatus'>;
type RecoveryCommissionReference = {
  id?: string;
  orderId?: string;
  sourceRecoveryOrderId?: string;
  status?: string;
};

const INACTIVE_COMMISSION_STATUSES = new Set(['已撤回', '已取消', '已冲销']);

export function isInactiveRecoveryCommissionStatus(status: unknown): boolean {
  return INACTIVE_COMMISSION_STATUSES.has(String(status || '').trim());
}

export function isRecoveryCommissionRelatedToOrder(
  orderId: string,
  commissionIds: ReadonlySet<string>,
  commission: RecoveryCommissionReference,
): boolean {
  return Boolean(
    (commission.id && commissionIds.has(commission.id))
    || commission.orderId === orderId
    || commission.sourceRecoveryOrderId === orderId,
  );
}

export function isRecoveryOrderDeletionLocked(order: RecoveryOrderDeletionState): boolean {
  const settlementStatus = String(order.settlementStatus || '未分账');
  if (settlementStatus === '已撤回') return false;
  return order.status === '已分账' || ['待确认', '待发放', '已发放', '待冲销'].includes(settlementStatus);
}
