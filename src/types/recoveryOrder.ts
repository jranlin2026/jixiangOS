import type { ID, Timestamp } from './common';

export type RecoveryOrderStatus = '待审核' | '退回修改' | '审核驳回' | '待分账' | '已分账';
export type RecoveryOrderSettlementStatus = '未分账' | '待分账' | '已分账';
export type RecoveryOrderMatchStatus = '手工填写' | '已绑定客户' | '售后临时客户';

export interface RecoveryOrder {
  id: ID;
  recoveryNo: string;
  thirdPartyOrderNo: string;
  customerId: ID;
  customerName: string;
  customerPhone?: string;
  customerWechat?: string;
  customerMatchStatus: RecoveryOrderMatchStatus;
  sourcePlatform?: string;
  originalProduct: string;
  originalAmount: number;
  /** @deprecated 第一版不再做退款流程，保留仅兼容历史数据 */
  refundStatus?: string;
  recoveryAmount: number;
  paymentVoucher?: string;
  paymentVoucherName?: string;
  paymentVoucherPreview?: string;
  chatEvidence?: string;
  chatEvidenceName?: string;
  chatEvidencePreview?: string;
  recoveryUserId: ID;
  recoveryUserName: string;
  assistUserId?: ID;
  assistUserName?: string;
  remark?: string;
  status: RecoveryOrderStatus;
  settlementStatus?: RecoveryOrderSettlementStatus;
  auditReason?: string;
  auditorId?: ID;
  auditorName?: string;
  auditedAt?: Timestamp;
  commissionIds?: ID[];
  createdBy: ID;
  createdByName: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface RecoveryOrderInput {
  customerName: string;
  customerPhone?: string;
  customerWechat?: string;
  thirdPartyOrderNo: string;
  sourcePlatform?: string;
  originalProduct: string;
  originalAmount: number;
  /** @deprecated 第一版不再做退款流程，保留仅兼容历史数据 */
  refundStatus?: string;
  recoveryAmount: number;
  paymentVoucher?: string;
  paymentVoucherName?: string;
  paymentVoucherPreview?: string;
  chatEvidence?: string;
  chatEvidenceName?: string;
  chatEvidencePreview?: string;
  recoveryUserId: ID;
  recoveryUserName: string;
  assistUserId?: ID;
  assistUserName?: string;
  remark?: string;
  createdBy: ID;
  createdByName: string;
}

export interface RecoveryOrderFilters {
  search?: string;
  status?: RecoveryOrderStatus | '全部';
  statuses?: RecoveryOrderStatus[];
  settlementStatus?: RecoveryOrderSettlementStatus | '全部';
  ownerId?: ID;
  page?: number;
  pageSize?: number;
}

export interface RecoveryOrderStats {
  total: number;
  pendingReview: number;
  approved: number;
  rejected: number;
  waitingSettlement: number;
  settled: number;
  generatedCommissionAmount: number;
}

export interface RecoverySettlementInput {
  role: string;
  ownerId: ID;
  payoutPlanId?: ID;
  payoutPlanName?: string;
  commissionAmount: number;
  commissionRate?: number;
  performanceAmount?: number;
  calculationNote?: string;
  ruleCalculationType?: 'fixed' | 'percentage' | 'tiered_percentage';
}
