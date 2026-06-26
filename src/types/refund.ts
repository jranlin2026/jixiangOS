import type { ID, Timestamp, RefundStatus } from './common';

/** 退款分类 */
export type RefundCategory = '产品质量' | '服务不满意' | '预算调整' | '需求变更' | '其他';

export type RecoveryRole = '销售' | '客户成功' | '售后';
export type RecoveryTaskStatus = '待处理' | '进行中' | '成功' | '失败';
export type RecoveryLogResult = '跟进中' | '挽回成功' | '挽回失败';
export type RecoveryPriority = '低' | '中' | '高';

export interface RecoveryLog {
  id: ID;
  refundId: ID;
  operatorId: ID;
  operatorName: string;
  operatorRole: RecoveryRole;
  actionType: string;
  content: string;
  result: RecoveryLogResult;
  nextFollowUpAt?: Timestamp;
  voucherName?: string;
  createdAt: Timestamp;
}

export interface RecoveryTask {
  id: ID;
  refundId: ID;
  orderId: ID;
  orderNo: string;
  customerId: ID;
  customerName: string;
  assignedToUserId: ID;
  assignedToName: string;
  assignedToRole: RecoveryRole;
  status: RecoveryTaskStatus;
  priority: RecoveryPriority;
  attemptCount: number;
  maxAttempts: number;
  customerDemand?: string;
  recoverySolution?: string;
  nextFollowUpAt?: Timestamp;
  lockUntil?: Timestamp;
  assignReason?: string;
  resultNote?: string;
  successOperatorId?: ID;
  successOperatorName?: string;
  successMethod?: string;
  retainedAmount?: number;
  successTime?: Timestamp;
  failedReason?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** 退款 */
export interface Refund {
  id: ID;
  refundNo: string;
  orderId: ID;
  orderNo: string;
  customerId: ID;
  customerName: string;
  productName?: string;
  productLevel: string;
  orderAmount: number;
  refundAmount: number;
  refundReason: string;
  refundCategory: RefundCategory;
  status: RefundStatus;
  applicantId: ID;
  applicantName: string;
  approverId?: ID;
  approverName?: string;
  approvedAt?: Timestamp;
  rejectReason?: string;
  refundMethod?: string;
  refundVoucher?: string;
  refundSerialNo?: string;
  refundedAt?: Timestamp;
  recoveryTask?: RecoveryTask;
  recoveryLogs?: RecoveryLog[];
  recoveryRate?: number;
  recoveryCommissionAmount?: number;
  retainedAmount?: number;
  frozenCommissionAmount?: number;
  estimatedLossAmount?: number;
  riskTags?: string[];
  operationLogs?: string[];
  completedAt?: Timestamp;
  remark?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** 退款筛选参数 */
export interface RefundFilters {
  search?: string;
  status?: RefundStatus;
  refundCategory?: RefundCategory;
  productLevel?: string;
  owner?: string;
  minAmount?: number;
  maxAmount?: number;
  hasRecoveryLog?: boolean;
  isTimeout?: boolean;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

export interface RefundStats {
  toAssign: number;
  recovering: number;
  waitingFinance: number;
  recoverySuccess: number;
  completed: number;
  frozenCommissionAmount: number;
  estimatedLossAmount: number;
}
