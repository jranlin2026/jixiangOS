import type { OrderApplicationStatus } from '../../types/order';
import type { RecoveryOrderStatus } from '../../types/recoveryOrder';

export type ReviewQueueView = 'pending' | 'processed' | 'all';
export type UnifiedReviewStatus = '待审核' | '退回修改' | '已驳回' | '已通过' | '已删除（留痕）';

export const REVIEW_QUEUE_OPTIONS: Array<{ value: ReviewQueueView; label: string }> = [
  { value: 'pending', label: '待审核/退回修改' },
  { value: 'processed', label: '已处理' },
  { value: 'all', label: '全部记录' },
];

export function getOrderApplicationReviewStatuses(
  view: ReviewQueueView,
): OrderApplicationStatus[] | undefined {
  if (view === 'pending') return ['待财务审核', '退回修改'];
  if (view === 'processed') return ['已入库', '已驳回'];
  return undefined;
}

export function getRecoveryOrderReviewStatuses(
  view: ReviewQueueView,
): RecoveryOrderStatus[] | undefined {
  if (view === 'pending') return ['待审核', '退回修改'];
  if (view === 'processed') return ['待分账', '已分账', '审核驳回'];
  return undefined;
}

export function getOrderApplicationUnifiedReviewStatus(
  status: OrderApplicationStatus,
): UnifiedReviewStatus {
  if (status === '待财务审核') return '待审核';
  if (status === '已入库') return '已通过';
  return status;
}

export function getRecoveryOrderUnifiedReviewStatus(
  status: RecoveryOrderStatus,
  deleted = false,
): UnifiedReviewStatus {
  if (deleted) return '已删除（留痕）';
  if (status === '审核驳回') return '已驳回';
  if (status === '待分账' || status === '已分账') return '已通过';
  return status;
}
