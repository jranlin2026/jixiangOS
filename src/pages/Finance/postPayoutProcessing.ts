import type {
  Commission,
  CommissionPostPayoutEntryContext,
  CommissionPayoutRecord,
} from '../../types/commission';
import {
  isAfterSalesRecoveryCommission,
  isRecoveryCommission,
} from '../../shared/utils/commissionConfiguration';

export type PostPayoutProcessingSourceType = 'formal_order' | 'after_sales_recovery';
export type PostPayoutProcessingContext = CommissionPostPayoutEntryContext;

export function buildPostPayoutProcessingContext(
  payoutRecord: CommissionPayoutRecord,
  commission: Commission,
): PostPayoutProcessingContext | null {
  const afterSalesRecovery = isAfterSalesRecoveryCommission(commission);
  const recoverySource = isRecoveryCommission(commission);
  const sourceType = afterSalesRecovery
    ? 'after_sales_recovery'
    : recoverySource
      ? null
      : 'formal_order';
  const sourceId = sourceType === 'after_sales_recovery'
    ? commission.sourceRecoveryOrderId || commission.orderId || ''
    : commission.orderId || '';
  if (!sourceType || !sourceId) return null;

  return {
    payoutRecordId: payoutRecord.id,
    payoutNo: payoutRecord.payoutNo,
    commissionId: commission.id,
    sourceType,
    sourceId,
    sourceBusinessNo: commission.orderNo,
    employee: commission.owner,
    role: commission.role,
    originalPaidAmount: Number(commission.commissionAmount || 0),
    attributedPeriod: String(commission.paymentDate || commission.createdAt).slice(0, 7),
  };
}
