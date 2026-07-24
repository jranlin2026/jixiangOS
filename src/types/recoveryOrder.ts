import type { ID, Timestamp } from './common';
import type { DataScopeDomain } from './role';
import type { BusinessAttachment } from './businessAttachment';
import type { OfficialPaymentChannel } from './commission';

export type RecoveryOrderStatus = '待审核' | '退回修改' | '审核驳回' | '待分账' | '已分账';
export type RecoveryOrderSettlementStatus = '未分账' | '待处理' | '待确认' | '待发放' | '已发放' | '已撤回';
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
  sourcePlatformId?: ID;
  sourcePlatformName?: string;
  sourceShopId?: ID;
  sourceShopName?: string;
  originalProduct: string;
  /** 成交时的产品配置快照，避免产品改名或改等级后历史订单漂移。 */
  originalProductId?: ID;
  originalProductLevel?: string;
  originalAmount: number;
  /** @deprecated 第一版不再做退款流程，保留仅兼容历史数据 */
  refundStatus?: string;
  recoveryAmount: number;
  recoveryAt?: Timestamp;
  officialPaymentChannel?: OfficialPaymentChannel;
  paymentOrderNo?: string;
  paymentAt?: Timestamp;
  paymentVoucher?: string;
  paymentVoucherName?: string;
  paymentVoucherPreview?: string;
  chatEvidence?: string;
  chatEvidenceName?: string;
  chatEvidencePreview?: string;
  /** 挽回付款、成交确认和沟通记录的统一凭证，最多 8 张图片。 */
  recoveryAttachments?: BusinessAttachment[];
  /** @deprecated 仅用于兼容历史数据 */
  paymentAttachments?: BusinessAttachment[];
  /** @deprecated 仅用于兼容历史数据 */
  chatAttachments?: BusinessAttachment[];
  recoveryUserId: ID;
  recoveryUserName: string;
  assistUserId?: ID;
  assistUserName?: string;
  remark?: string;
  status: RecoveryOrderStatus;
  settlementStatus?: RecoveryOrderSettlementStatus;
  /** 最近一次保存或调整分账的经办人和时间。 */
  settlementHandledBy?: string;
  settlementHandledAt?: Timestamp;
  /** 分账确认留痕。 */
  settlementConfirmedBy?: string;
  settlementConfirmedAt?: Timestamp;
  /** 提成发放时间；历史数据可从关联提成记录只读聚合。 */
  settlementPaidAt?: Timestamp;
  /** 撤回留痕，避免复用业务审核意见。 */
  settlementWithdrawnBy?: string;
  settlementWithdrawnAt?: Timestamp;
  settlementWithdrawReason?: string;
  auditReason?: string;
  auditorId?: ID;
  auditorName?: string;
  auditedAt?: Timestamp;
  commissionIds?: ID[];
  deletedAt?: Timestamp;
  deletedBy?: string;
  deleteReason?: string;
  /** 审核台清理只隐藏审核记录，不物理删除财务追溯所需的业务数据。 */
  reviewCleanedAt?: Timestamp;
  reviewCleanedBy?: string;
  reviewCleanupReason?: string;
  /** 财务分账清理只隐藏已废弃列表项，底层业务及提成留痕仍保留。 */
  settlementCleanedAt?: Timestamp;
  settlementCleanedById?: ID;
  settlementCleanedBy?: string;
  settlementCleanupReason?: string;
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
  sourcePlatformId?: ID;
  sourcePlatformName?: string;
  sourceShopId?: ID;
  sourceShopName?: string;
  originalProduct: string;
  originalProductId?: ID;
  originalProductLevel?: string;
  originalAmount: number;
  /** @deprecated 第一版不再做退款流程，保留仅兼容历史数据 */
  refundStatus?: string;
  recoveryAmount: number;
  recoveryAt?: Timestamp;
  officialPaymentChannel?: OfficialPaymentChannel;
  paymentOrderNo?: string;
  paymentAt?: Timestamp;
  paymentVoucher?: string;
  paymentVoucherName?: string;
  paymentVoucherPreview?: string;
  chatEvidence?: string;
  chatEvidenceName?: string;
  chatEvidencePreview?: string;
  recoveryAttachments?: BusinessAttachment[];
  /** @deprecated 仅用于兼容历史数据 */
  paymentAttachments?: BusinessAttachment[];
  /** @deprecated 仅用于兼容历史数据 */
  chatAttachments?: BusinessAttachment[];
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
  settlementStatuses?: RecoveryOrderSettlementStatus[];
  ownerId?: ID;
  /** 仅按挽回人员筛选，避免把提交人和协助人员混入结果。 */
  recoveryUserId?: ID;
  recoveryStartDate?: string;
  recoveryEndDate?: string;
  sortBy?: 'updatedAt' | 'createdAt' | 'recoveryAt';
  sortDirection?: 'asc' | 'desc';
  includeDeleted?: boolean;
  scopeDomain?: Extract<DataScopeDomain, 'recoveryOrders' | 'recoveryOrderApplications'>;
  page?: number;
  pageSize?: number;
}

export interface RecoverySettlementCounts {
  total: number;
  statusCounts: Record<string, number>;
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
