import type {
  Commission,
  CommissionOperationLog,
} from '../../types/commission';
import type { Order } from '../../types/order';

const INACTIVE_COMMISSION_STATUSES = new Set([
  '已撤回',
  '已取消',
  '待冲销',
  '已冲销',
]);

export interface CommissionProcessingSummary {
  totalCommissionAmount: number;
  performanceAmount: number;
  withdrawnCount: number;
  settlementOperator?: string;
  confirmedAt?: string;
  paidAt?: string;
  withdrawReason?: string;
}

export function getActiveCommissions(rows: Commission[]): Commission[] {
  return rows.filter((row) => !INACTIVE_COMMISSION_STATUSES.has(String(row.status)));
}

export function formatLeadSourcePath(order: Pick<Order, 'leadSource' | 'sourceName'>): string {
  return [...new Set(
    [order.leadSource, order.sourceName]
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  )].join(' / ');
}

export function summarizeCommissionProcessing(
  commissions: Commission[],
  logs: CommissionOperationLog[],
): CommissionProcessingSummary {
  const active = getActiveCommissions(commissions);
  const latestLogs = [...logs].sort((a, b) => (
    new Date(b.operatedAt).getTime() - new Date(a.operatedAt).getTime()
  ));
  const paidDates = active
    .map((row) => row.paidAt)
    .filter((value): value is string => Boolean(value))
    .sort();

  return {
    totalCommissionAmount: Math.round(
      active.reduce((sum, row) => sum + Number(row.commissionAmount || 0), 0) * 100,
    ) / 100,
    performanceAmount: Math.max(0, ...active.map((row) => Number(row.performanceAmount || 0))),
    withdrawnCount: commissions.filter((row) => row.status === '已撤回' || String(row.status) === '已取消').length,
    settlementOperator: latestLogs[0]?.operator,
    confirmedAt: latestLogs.find((log) => log.action === '确认分账')?.operatedAt,
    paidAt: paidDates[paidDates.length - 1],
    withdrawReason: latestLogs.find((log) => log.action === '撤回提成')?.reason,
  };
}
