import type { ID, Timestamp, ProductLevel, OrderType, PaymentMethod, RefundStatus } from './common';
import type { CommissionScene, OfficialPaymentChannel, ProofStatus, ResourceOwnership } from './commission';

/** 订单状态 */
export type OrderStatus =
  | '待确认'
  | '已确认'
  | '处理中'
  | '已完成'
  | '退款中'
  | '已退款'
  | '已取消';

/** 订单支付记录 */
export interface OrderPayment {
  id: ID;
  amount: number;
  paymentMethod: PaymentMethod;
  paidAt: Timestamp;
  paymentOrderNo?: string;
  voucherName?: string;
  voucherPreview?: string;
  remark?: string;
}

export interface OrderChangeLog {
  id: ID;
  action: 'create' | 'update' | 'delete';
  operator: string;
  changedAt: Timestamp;
  summary: string;
  changes?: Array<{
    field: string;
    label: string;
    oldValue?: string | number | boolean | null;
    newValue?: string | number | boolean | null;
  }>;
}

export type OrderApplicationStatus = '待财务审核' | '退回修改' | '已入库' | '已驳回';

export interface OrderApplicationReviewLog {
  id: ID;
  action: 'submit' | 'resubmit' | 'approve' | 'return' | 'reject';
  operatorId?: ID;
  operatorName: string;
  reason?: string;
  createdAt: Timestamp;
}

/** 订单 */
export interface Order {
  id: ID;
  orderNo: string;
  customerId: ID;
  customerName: string;
  productName?: string;
  productLevel: ProductLevel;
  productId?: ID;
  orderType: OrderType;
  amount: number;
  actualAmount: number;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  refundStatus: RefundStatus;
  refundAmount?: number;
  refundReason?: string;
  owner: string;
  salesId?: ID;
  salesName?: string;
  /** 成交时的线索贡献人快照，用于线索分成，不随客户转交变化 */
  leadInputBy?: string;
  leadContributorId?: ID;
  leadContributorName?: string;
  leadSource?: string;
  successId?: ID;
  successName?: string;
  serviceId?: ID;
  serviceName?: string;
  sourceType?: string;
  /** 提成制度字段：资源归属 */
  resourceOwnership?: ResourceOwnership;
  /** 提成制度字段：官方收款渠道 */
  officialPaymentChannel?: OfficialPaymentChannel;
  /** 外部达人成交订单不计内部提成 */
  isExternalTalentOrder?: boolean;
  /** 提成制度场景 */
  dealScene?: CommissionScene;
  /** 凭证状态，转介绍/挽回/个人资源等场景使用 */
  proofStatus?: ProofStatus;
  /** 原 899 订单关系，用于转代理时冲销基础提成 */
  originalOrderId?: ID;
  /** 业绩核算基数，默认取 actualAmount */
  performanceBaseAmount?: number;
  commissionRuleId?: ID;
  /** 聊天记录、成交路径或客户确认截图 */
  dealEvidenceName?: string;
  dealEvidencePreview?: string;
  payments: OrderPayment[];
  commissionId?: ID;
  deliveryId?: ID;
  notes?: string;
  changeHistory?: OrderChangeLog[];
  deletedAt?: Timestamp;
  deletedBy?: string;
  deleteReason?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface OrderApplication {
  id: ID;
  applicationNo: string;
  status: OrderApplicationStatus;
  orderData: Omit<Order, 'id' | 'createdAt' | 'updatedAt' | 'orderNo'>;
  applicantId?: ID;
  applicantName: string;
  submittedAt: Timestamp;
  reviewerId?: ID;
  reviewerName?: string;
  reviewedAt?: Timestamp;
  reason?: string;
  orderId?: ID;
  orderNo?: string;
  reviewLogs: OrderApplicationReviewLog[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** 订单统计 */
export interface OrderStats {
  todayAmount: number;
  todayCount: number;
  monthAmount: number;
  monthCount: number;
  refundCount: number;
  refundAmount: number;
  upgradeCount: number;
  upgradeAmount: number;
}

/** 订单筛选参数 */
export interface OrderFilters {
  search?: string;
  customerId?: ID;
  productLevel?: ProductLevel;
  status?: OrderStatus;
  owner?: string;
  orderType?: OrderType;
  paymentMethod?: PaymentMethod;
  startDate?: string;
  endDate?: string;
  sortBy?: 'createdAt' | 'paymentDate';
  sortDirection?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface OrderApplicationFilters {
  search?: string;
  status?: OrderApplicationStatus;
  applicantName?: string;
  reviewerName?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}
