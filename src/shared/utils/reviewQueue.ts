import type { OrderApplicationStatus } from '../../types/order';
import type { RecoveryOrderStatus } from '../../types/recoveryOrder';

export type ReviewQueueView = 'pending' | 'returned' | 'processed' | 'all';

export const REVIEW_QUEUE_OPTIONS: Array<{ value: ReviewQueueView; label: string }> = [
  { value: 'pending', label: '待处理' },
  { value: 'returned', label: '退回修改' },
  { value: 'processed', label: '已处理' },
  { value: 'all', label: '全部记录' },
];

export function getOrderApplicationReviewStatuses(
  view: ReviewQueueView,
): OrderApplicationStatus[] | undefined {
  if (view === 'pending') return ['待财务审核'];
  if (view === 'returned') return ['退回修改'];
  if (view === 'processed') return ['已入库', '已驳回'];
  return undefined;
}

export function getRecoveryOrderReviewStatuses(
  view: ReviewQueueView,
): RecoveryOrderStatus[] | undefined {
  if (view === 'pending') return ['待审核'];
  if (view === 'returned') return ['退回修改'];
  if (view === 'processed') return ['待分账', '已分账', '审核驳回'];
  return undefined;
}
