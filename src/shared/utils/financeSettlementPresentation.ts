import type {
  Commission,
  CommissionOperationLog,
} from '../../types/commission';
import type { Order } from '../../types/order';
import { formatCurrency } from './formatters';

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

export interface CommissionSplitAmountSummary {
  confirmedAmount: number;
  pendingTieredCount: number;
  pendingTieredPerformanceAmount: number;
}

export type CommissionSplitAmountPresentation = {
  kind: 'amount' | 'pending_tiered';
  primaryText: string;
  secondaryText?: string;
};

export function getActiveCommissions(rows: Commission[]): Commission[] {
  return rows.filter((row) => !INACTIVE_COMMISSION_STATUSES.has(String(row.status)));
}

export interface CurrentSettlementRoundRef {
  settlementVersion?: number;
  settlementRoundId?: string;
}

export function getCurrentSettlementRoundCommissions<T extends {
  status: string;
  settlementVersion?: number;
  settlementRoundId?: string;
}>(
  rows: T[],
  currentRound: CurrentSettlementRoundRef = {},
): T[] {
  const active = rows.filter((row) => !INACTIVE_COMMISSION_STATUSES.has(String(row.status)));
  if (!active.length) return [];

  if (currentRound.settlementRoundId) {
    const matchingRound = active.filter((row) => row.settlementRoundId === currentRound.settlementRoundId);
    if (matchingRound.length) return matchingRound;
  }

  if (currentRound.settlementVersion) {
    const matchingVersion = active.filter((row) => (
      Number(row.settlementVersion || 1) === Number(currentRound.settlementVersion)
    ));
    if (matchingVersion.length) return matchingVersion;
  }

  const latestVersion = Math.max(...active.map((row) => Number(row.settlementVersion || 1)));
  return active.filter((row) => Number(row.settlementVersion || 1) === latestVersion);
}

function isPendingMonthlyTieredCommission(row: Commission): boolean {
  return row.ruleCalculationType === 'tiered_percentage'
    && row.status !== '已发放'
    && Number(row.commissionAmount || 0) === 0;
}

export function summarizeCommissionSplitAmounts(rows: Commission[]): CommissionSplitAmountSummary {
  const active = getActiveCommissions(rows);
  const pendingTiered = active.filter(isPendingMonthlyTieredCommission);
  const pendingTieredIds = new Set(pendingTiered.map((row) => row.id));

  return {
    confirmedAmount: Math.round(
      active
        .filter((row) => !pendingTieredIds.has(row.id))
        .reduce((sum, row) => sum + Number(row.commissionAmount || 0), 0) * 100,
    ) / 100,
    pendingTieredCount: pendingTiered.length,
    pendingTieredPerformanceAmount: Math.max(
      0,
      ...pendingTiered.map((row) => Number(row.performanceAmount || row.orderAmount || 0)),
    ),
  };
}

export function getCommissionSplitLineAmountText(row: Commission): string {
  if (isPendingMonthlyTieredCommission(row)) return '月度阶梯';
  return formatCurrency(Number(row.commissionAmount || 0));
}

export function getCommissionSplitAmountPresentation(rows: Commission[]): CommissionSplitAmountPresentation {
  const summary = summarizeCommissionSplitAmounts(rows);
  if (summary.pendingTieredCount > 0) {
    return {
      kind: 'pending_tiered',
      primaryText: summary.confirmedAmount > 0
        ? `已确定 ${formatCurrency(summary.confirmedAmount)}`
        : '待月结',
      secondaryText: summary.confirmedAmount > 0
        ? '+ 阶梯提成待月结'
        : '月度阶梯提成',
    };
  }
  return {
    kind: 'amount',
    primaryText: `共 ${formatCurrency(summary.confirmedAmount)}`,
  };
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
