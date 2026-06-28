import type { ID, Timestamp } from './common';

export type RecoveryOrderStatus = '待审核' | '审核通过' | '审核驳回' | '已生成提成';
export type RecoveryOrderMatchStatus = '已绑定客户' | '售后临时客户';

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
  refundStatus: string;
  recoveryAmount: number;
  paymentVoucher?: string;
  chatEvidence?: string;
  recoveryUserId: ID;
  recoveryUserName: string;
  assistUserId?: ID;
  assistUserName?: string;
  remark?: string;
  status: RecoveryOrderStatus;
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
  refundStatus: string;
  recoveryAmount: number;
  paymentVoucher?: string;
  chatEvidence?: string;
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
  ownerId?: ID;
  page?: number;
  pageSize?: number;
}

export interface RecoveryOrderStats {
  total: number;
  pendingReview: number;
  approved: number;
  rejected: number;
  generatedCommissionAmount: number;
}
