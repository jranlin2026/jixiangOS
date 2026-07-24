import type { CommissionOrderSummary } from '../../types/commission';
import type { Order } from '../../types/order';

export interface OrderSettlementRisk {
  severity: 'warning' | 'error';
  message: string;
}

const COMPLETE_EVIDENCE_STATUSES = new Set(['已齐全', '无需凭证']);

function hasPaymentEvidence(order: Order): boolean {
  return order.payments.some((payment) => (
    Boolean(payment.attachments?.length)
    || Boolean(payment.voucherName)
    || Boolean(payment.voucherPreview)
  ));
}

function hasDealEvidence(order: Order): boolean {
  return Boolean(order.dealEvidenceAttachments?.length)
    || Boolean(order.dealEvidenceName)
    || Boolean(order.dealEvidencePreview);
}

export function getOrderSettlementEvidenceStatus(summary: CommissionOrderSummary, order: Order | null): string {
  if (summary.sourceOrderDeleted) return '源订单已删除';

  const evidenceStatuses = summary.commissions
    .map((commission) => commission.evidenceStatus)
    .filter((status): status is NonNullable<typeof status> => Boolean(status));
  const blockingStatus = evidenceStatuses.find((status) => !COMPLETE_EVIDENCE_STATUSES.has(status));
  if (blockingStatus) return blockingStatus;
  if (evidenceStatuses.length) return '已齐全';
  if (!order) return '资料不可用';
  if (order.proofStatus === '待补充') return '待补充';
  if (hasPaymentEvidence(order) || hasDealEvidence(order) || order.proofStatus === '已上传') return '已上传';
  return '待核对';
}

export function getOrderSettlementRisks(summary: CommissionOrderSummary, order: Order | null): OrderSettlementRisk[] {
  if (summary.sourceOrderDeleted) {
    return [{ severity: 'error', message: '源订单已删除，当前只能查看分账快照和操作历史。' }];
  }
  if (!order) return [{ severity: 'error', message: '未能加载源订单资料，请重试后再处理分账。' }];

  const risks: OrderSettlementRisk[] = [];
  const paymentTotal = order.payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
  const actualAmount = Number(order.actualAmount) || 0;
  if (Math.abs(paymentTotal - actualAmount) > 0.01) {
    risks.push({
      severity: 'error',
      message: `付款合计 ${paymentTotal.toFixed(2)} 元与订单实付金额 ${actualAmount.toFixed(2)} 元不一致。`,
    });
  }

  const evidenceStatus = getOrderSettlementEvidenceStatus(summary, order);
  if (!COMPLETE_EVIDENCE_STATUSES.has(evidenceStatus) && evidenceStatus !== '已上传') {
    risks.push({ severity: 'warning', message: `凭证状态为“${evidenceStatus}”，请核对后再确认分账。` });
  }
  if (!hasPaymentEvidence(order) && !evidenceStatus.includes('付款')) {
    risks.push({ severity: 'warning', message: '未找到付款凭证，请核对源订单附件。' });
  }
  if (evidenceStatus.includes('成交路径') && !hasDealEvidence(order)) {
    risks.push({ severity: 'warning', message: '缺少成交路径凭证，请补充后再确认分账。' });
  }

  if (order.refundStatus && order.refundStatus !== '无') {
    const amountText = Number(order.refundAmount) > 0 ? `，退款金额 ${Number(order.refundAmount).toFixed(2)} 元` : '';
    risks.push({ severity: 'error', message: `订单当前为${order.refundStatus}${amountText}，请先核对退款影响。` });
  }
  if (summary.pendingAssignCount > 0) {
    risks.push({ severity: 'warning', message: `还有 ${summary.pendingAssignCount} 个分账角色未分配人员。` });
  }

  const activeCommissions = summary.commissions.filter((commission) => !['已取消', '已撤回', '已冲销'].includes(commission.status));
  if (activeCommissions.some((commission) => !commission.payoutPlanName && !commission.commissionRuleId)) {
    risks.push({ severity: 'warning', message: '存在未匹配提成方案的分账，请财务人工核对规则和金额。' });
  }

  return risks;
}
