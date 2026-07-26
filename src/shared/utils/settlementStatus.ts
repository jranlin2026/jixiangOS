import type { SettlementStatus } from '../../types/commission';

export const SETTLEMENT_STATUSES = [
  '待处理',
  '待确认',
  '待发放',
  '已发放',
  '已撤回',
] as const satisfies readonly SettlementStatus[];

export type SettlementStatusColor = 'warning' | 'info' | 'primary' | 'success' | 'default';

const SETTLEMENT_STATUS_SET = new Set<string>(SETTLEMENT_STATUSES);

const SETTLEMENT_STATUS_COLORS: Record<SettlementStatus, SettlementStatusColor> = {
  待处理: 'warning',
  待确认: 'info',
  待发放: 'primary',
  已发放: 'success',
  已撤回: 'default',
};

export function normalizeSettlementStatus(
  status?: string | null,
  fallback: SettlementStatus = '待处理',
): SettlementStatus {
  const value = String(status || '').trim();
  if (value === '待分账' || value === '未分账') return '待处理';
  if (value === '已分账') return '待发放';
  return SETTLEMENT_STATUS_SET.has(value) ? value as SettlementStatus : fallback;
}

export function getSettlementStatusColor(status: SettlementStatus): SettlementStatusColor {
  return SETTLEMENT_STATUS_COLORS[status];
}
