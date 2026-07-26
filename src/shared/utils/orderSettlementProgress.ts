import type { Commission, CommissionOrderSummaryStatus } from '../../types/commission';
import type { OrderSettlementProgress } from '../../types/order';

const INACTIVE_STATUSES = new Set(['已撤回', '已取消', '待冲销', '已冲销', '异常']);

function issueText(commission: Commission): string {
  return [
    commission.auditReason,
    commission.frozenReason,
    commission.calculationNote,
    commission.formulaText,
    commission.payoutPlanName,
  ].filter(Boolean).join('；');
}

function requiresHandling(commission: Commission): boolean {
  const note = issueText(commission);
  const manual = Boolean(commission.isManualAdjusted)
    || commission.sourceType === '人工新增'
    || ['自定义金额', '财务人工', '人工新增'].some((keyword) => note.includes(keyword));
  const hasBasis = Boolean(commission.payoutPlanId || commission.payoutPlanName || manual);
  const unresolved = ['未匹配', '未命中', '暂不计算', '缺少', '不可用'].some((keyword) => note.includes(keyword));
  return commission.owner === '待分配'
    || !commission.ownerId
    || Boolean(commission.frozenReason)
    || note.includes('冻结')
    || !hasBasis
    || ((Number(commission.commissionAmount) || 0) === 0 && unresolved);
}

/** 正式订单列表与财务订单分账共用的进度口径。 */
export function deriveOrderSettlementProgress(commissions: Commission[]): CommissionOrderSummaryStatus {
  if (!commissions.length || commissions.some(requiresHandling)) return '待处理';
  if (commissions.every((commission) => INACTIVE_STATUSES.has(String(commission.status)))) return '已撤回';
  if (commissions.every((commission) => commission.status === '已发放')) return '已发放';
  if (commissions.every((commission) => commission.status === '待发放' || commission.status === '已发放')) return '待发放';
  return '待确认';
}

export function deriveOrderListSettlementProgress(commissions: Commission[]): OrderSettlementProgress {
  return deriveOrderSettlementProgress(commissions);
}
