import type { ID, Timestamp, ProductLevel, OrderType, PaymentMethod, RefundStatus } from './common';
import type { CommissionScene, OfficialPaymentChannel, ProofStatus, ResourceOwnership, SettlementStatus } from './commission';
import type { BusinessAttachment } from './businessAttachment';
import type { BusinessImportMetadata } from './businessImport';

/** 订单状态 */
export type OrderStatus =
  | '待确认'
  | '已确认'
  | '处理中'
  | '已完成'
  | '退款中'
  | '已退款'
  | '已取消';

/** 正式订单列表的分账状态，与售后挽回和财务分账保持一致。 */
export type OrderSettlementProgress = SettlementStatus;

/** 订单支付记录 */
export interface OrderPayment {
  id: ID;
  amount: number;
  paymentMethod: PaymentMethod;
  paidAt: Timestamp;
  paymentOrderNo?: string;
  voucherName?: string;
  voucherPreview?: string;
  attachments?: BusinessAttachment[];
  remark?: string;
}

/** 订单产品明细；名称、等级和单价均为提交时快照。 */
export interface OrderItem {
  id: ID;
  productId: ID;
  productName: string;
  productLevel: ProductLevel;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  isPrimary: boolean;
  sortOrder: number;
  /** 审核通过后按标准小计分摊的实付金额。 */
  allocatedActualAmount?: number;
}

export interface OrderItemInput {
  /** 已存在明细的稳定 ID，用于正式订单更正时保持交付关联。 */
  id?: ID;
  productId: ID;
  quantity: number;
  isPrimary?: boolean;
}

export interface OrderChangeLog {
  id: ID;
  action: 'create' | 'update' | 'correct' | 'delete';
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

/** 超级管理员对已审核正式订单发起的受控更正。 */
export interface OrderCorrectionInput {
  reason: string;
  data: Partial<Order>;
}

export type OrderCorrectionBlockReason =
  | 'order_deleted'
  | 'refund_in_progress'
  | 'manual_commission'
  | 'payout_started'
  | 'commission_withdrawn'
  | 'unsupported_commission_status'
  | 'rebuild_unavailable';

export interface OrderCorrectionPrecheck {
  allowed: boolean;
  reasonCode?: OrderCorrectionBlockReason;
  message: string;
  commissionCount: number;
  manualCommissionCount: number;
  commissionStatuses: string[];
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
export interface Order extends Partial<BusinessImportMetadata> {
  id: ID;
  orderNo: string;
  customerId: ID;
  customerName: string;
  productName?: string;
  productLevel: ProductLevel;
  productId?: ID;
  /** 多产品订单明细；legacy product* 字段始终投影主产品。 */
  items?: OrderItem[];
  standardTotalAmount?: number;
  orderType: OrderType;
  amount: number;
  actualAmount: number;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  /** 由当前有效分账记录汇总得出，仅用于列表和财务视图。 */
  settlementStatus?: OrderSettlementProgress;
  refundStatus: RefundStatus;
  refundAmount?: number;
  refundReason?: string;
  owner: string;
  salesId?: ID;
  salesName?: string;
  /** 订单申请的实际提交人快照，与销售负责人分开归因 */
  createdById?: ID;
  createdByName?: string;
  /** 来源申请，用于历史订单创建人回溯 */
  sourceApplicationId?: ID;
  /** 成交时的线索贡献人快照，用于线索分成，不随客户转交变化 */
  leadInputBy?: string;
  leadContributorId?: ID;
  leadContributorName?: string;
  leadSource?: string;
  /** 线索来源二级明细，与 leadSource 一起固化为订单快照。 */
  sourceName?: string;
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
  /** 外部平台的展示订单号，不参与提成冲销关系 */
  thirdPartyOrderNo?: string;
  /** 业绩核算基数，默认取 actualAmount */
  performanceBaseAmount?: number;
  commissionRuleId?: ID;
  /** 聊天记录、成交路径或客户确认截图 */
  dealEvidenceName?: string;
  dealEvidencePreview?: string;
  dealEvidenceAttachments?: BusinessAttachment[];
  payments: OrderPayment[];
  commissionId?: ID;
  deliveryId?: ID;
  deliveryIds?: ID[];
  notes?: string;
  changeHistory?: OrderChangeLog[];
  deletedAt?: Timestamp;
  deletedBy?: string;
  deleteReason?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface OrderApplication extends Partial<BusinessImportMetadata> {
  id: ID;
  applicationNo: string;
  status: OrderApplicationStatus;
  orderData: Omit<Order, 'id' | 'createdAt' | 'updatedAt' | 'orderNo' | 'createdById' | 'createdByName' | 'sourceApplicationId'>;
  applicantId?: ID;
  applicantName: string;
  submittedAt: Timestamp;
  reviewerId?: ID;
  reviewerName?: string;
  reviewedAt?: Timestamp;
  reason?: string;
  orderId?: ID;
  orderNo?: string;
  /** 审核列表投影字段：正式源订单已软删除或已不存在。 */
  sourceOrderDeleted?: boolean;
  sourceOrderDeletedAt?: Timestamp;
  reviewCleanedAt?: Timestamp;
  reviewCleanedBy?: string;
  reviewCleanupReason?: string;
  reviewLogs: OrderApplicationReviewLog[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type OrderApprovalEffectStatus = 'applied' | 'deferred';

export interface OrderApprovalEffectState {
  customerOrderStats: OrderApprovalEffectStatus;
  commissionGeneration: OrderApprovalEffectStatus;
  deliveryCreation: OrderApprovalEffectStatus;
  customerLifecycle: OrderApprovalEffectStatus;
}

export interface OrderApprovalResult {
  application: OrderApplication;
  order: Order;
  replayed: boolean;
  downstreamEffects: OrderApprovalEffectState;
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
  refundStatus?: RefundStatus;
  settlementStatus?: OrderSettlementProgress;
  owner?: string;
  orderType?: OrderType;
  paymentMethod?: PaymentMethod;
  startDate?: string;
  endDate?: string;
  paymentStartDate?: string;
  paymentEndDate?: string;
  sortBy?: 'createdAt' | 'paymentDate';
  sortDirection?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface OrderApplicationFilters {
  search?: string;
  status?: OrderApplicationStatus;
  statuses?: OrderApplicationStatus[];
  applicantName?: string;
  reviewerName?: string;
  owner?: string;
  startDate?: string;
  endDate?: string;
  paymentStartDate?: string;
  paymentEndDate?: string;
  sortBy?: 'createdAt' | 'paymentDate';
  sortDirection?: 'asc' | 'desc';
  importBatchId?: string;
  page?: number;
  pageSize?: number;
}
