import type { Commission, CommissionPayoutEmployeeRow } from '../../types/commission';
import { isCommissionPendingHandling } from '../../shared/utils/commissionConfiguration';

export type PendingCommissionFilter = '全部' | '待处理' | '待确认' | '待发放';

export function pendingCommissionStatusLabel(commission: Commission): Exclude<PendingCommissionFilter, '全部'> {
  if (commission.status === '待确认' && isCommissionPendingHandling(commission)) return '待处理';
  return commission.status === '待发放' ? '待发放' : '待确认';
}

export function buildPendingEmployeePresentation(row: CommissionPayoutEmployeeRow) {
  return {
    business: {
      total: row.orderCount,
      formal: row.formalOrderCount,
      recovery: row.recoveryOrderCount,
    },
    pendingHandling: { count: row.statusCounts.pendingHandling },
    pendingConfirm: {
      count: row.statusCounts.pendingConfirm,
      amount: row.pendingConfirmAmount,
    },
    pendingPay: {
      count: row.statusCounts.pendingPay,
      amount: row.pendingPayAmount,
    },
    canIssue: row.pendingPayAmount > 0,
  };
}

export function filterPendingEmployeeCommissions(
  commissions: Commission[],
  filter: PendingCommissionFilter,
): Commission[] {
  if (filter === '全部') return commissions;
  if (filter === '待处理') {
    return commissions.filter((commission) => (
      commission.status === '待确认' && isCommissionPendingHandling(commission)
    ));
  }
  if (filter === '待确认') {
    return commissions.filter((commission) => (
      commission.status === '待确认' && !isCommissionPendingHandling(commission)
    ));
  }
  return commissions.filter((commission) => commission.status === '待发放');
}
