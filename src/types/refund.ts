import type { ID, Timestamp, RefundStatus } from './common';

/** 退款分类 */
export type RefundCategory = '产品质量' | '服务不满意' | '预算调整' | '需求变更' | '其他';

/** 退款 */
export interface Refund {
  id: ID;
  refundNo: string;
  orderId: ID;
  orderNo: string;
  customerId: ID;
  customerName: string;
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
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}
