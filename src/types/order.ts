import type { ID, Timestamp, ProductLevel, OrderType, PaymentMethod, RefundStatus } from './common';
import type { CommissionRole, CommissionScene, OfficialPaymentChannel, ProofStatus, ResourceOwnership } from './commission';

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
  remark?: string;
}

/** 订单 */
export interface Order {
  id: ID;
  orderNo: string;
  customerId: ID;
  customerName: string;
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
  /** 协同人员信息，用于 80/20、50/50 等分成 */
  collaboratorName?: string;
  collaboratorRole?: CommissionRole;
  collaboratorRatio?: number;
  /** 原 899 订单关系，用于转代理时冲销基础提成 */
  originalOrderId?: ID;
  /** 业绩核算基数，默认取 actualAmount */
  performanceBaseAmount?: number;
  commissionRuleId?: ID;
  payments: OrderPayment[];
  commissionId?: ID;
  deliveryId?: ID;
  notes?: string;
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
  productLevel?: ProductLevel;
  status?: OrderStatus;
  owner?: string;
  orderType?: OrderType;
  paymentMethod?: PaymentMethod;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}
