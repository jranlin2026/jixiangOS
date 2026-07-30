import type { ID, Timestamp } from './common';
import type { DataScopeDomain } from './role';
import type { BusinessAttachment } from './businessAttachment';
import type { CommissionPayoutCorrectionContext, OfficialPaymentChannel, SettlementStatus } from './commission';
import type { BusinessImportMetadata } from './businessImport';

/** 新单审核通过后统一写“审核通过”；“待分账/已分账”仅兼容历史存储。 */
export type RecoveryOrderStatus = '待审核' | '退回修改' | '审核驳回' | '审核通过' | '待分账' | '已分账';
/** “未分账”仅用于兼容历史存储；对外展示必须归一化为五态分账状态。 */
export type RecoveryOrderSettlementStatus = '未分账' | SettlementStatus;
export type RecoveryOrderMatchStatus = '手工填写' | '已绑定客户' | '售后临时客户';
export type RecoveryCrmIdentityStatus = '待识别' | '已匹配客户' | '已匹配线索' | '待创建线索' | '身份冲突' | '已创建线索';

export type RecoveryOrderChangeAction = 'create' | 'edit' | 'correct' | 'review' | 'settlement' | 'delete';

export interface RecoveryOrderChangeLog {
  id: ID;
  action: RecoveryOrderChangeAction;
  operatorId?: ID;
  operator: string;
  changedAt: Timestamp;
  reason?: string;
  summary: string;
  changes?: Array<{ field: string; label: string; before?: unknown; after?: unknown }>;
}

export type RecoveryOrderCorrectionBlockReason =
  | 'not_approved'
  | 'order_deleted'
  | 'payout_started'
  | 'settlement_processing'
  | 'unsupported_settlement_status';

export interface RecoveryOrderCorrectionPrecheck {
  allowed: boolean;
  reasonCode?: RecoveryOrderCorrectionBlockReason;
  message: string;
  commissionCount: number;
  commissionStatuses: string[];
  settlementStatus: RecoveryOrderSettlementStatus;
  mode: 'standard' | 'post_payout';
  requiresImpactPreview: boolean;
}

export interface RecoveryOrder extends Partial<BusinessImportMetadata> {
  id: ID;
  recoveryNo: string;
  thirdPartyOrderNo: string;
  customerId: ID;
  customerName: string;
  customerPhone?: string;
  customerWechat?: string;
  customerMatchStatus: RecoveryOrderMatchStatus;
  /** 售后原始填报快照；不得被 CRM 标准名称覆盖。 */
  submittedCustomerName?: string;
  /** 盲匹配只向售后暴露抽象状态，不暴露 CRM 客户资料。 */
  crmIdentityStatus?: RecoveryCrmIdentityStatus;
  linkedLeadId?: ID;
  leadSyncStatus?: '不需要' | '待同步' | '已关联' | '已创建' | '失败';
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
  /** 当前保存轮次；历史未标记记录默认第一轮。 */
  settlementVersion?: number;
  /** 当前保存轮次的标识；用于关联同一轮的提成明细。 */
  settlementRoundId?: ID;
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
  changeHistory?: RecoveryOrderChangeLog[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** 审核通过后的非核算资料编辑，不改变审核和分账状态。 */
export interface RecoveryOrderMetadataEditInput {
  sourcePlatform?: string;
  sourcePlatformId?: ID;
  sourcePlatformName?: string;
  sourceShopId?: ID;
  sourceShopName?: string;
  paymentOrderNo?: string;
  recoveryAttachments?: BusinessAttachment[];
  remark?: string;
}

/** 正式售后挽回单更正；data 使用完整表单以便服务端重新执行全量校验。 */
export interface RecoveryOrderCorrectionInput {
  reason: string;
  data: RecoveryOrderInput;
  /** 已发放后更正必须提交与最新预览一致的影响哈希。 */
  expectedImpactHash?: string;
  /** 从发放记录进入时携带，用于锁定不可变的原发快照。 */
  payoutContext?: CommissionPayoutCorrectionContext;
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
  importBatchId?: string;
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
  roleId?: ID;
  roleCode?: string;
  roleNameSnapshot?: string;
  ownerId: ID;
  payoutPlanId?: ID;
  payoutPlanName?: string;
  payoutPlanVersion?: number;
  payoutPlanSnapshot?: import('./commission').CommissionPayoutPlanSnapshot;
  tierSnapshot?: import('./commission').CommissionTierSnapshot;
  commissionAmount: number;
  commissionRate?: number;
  performanceAmount?: number;
  calculationNote?: string;
  ruleCalculationType?: 'fixed' | 'percentage' | 'tiered_percentage';
}
