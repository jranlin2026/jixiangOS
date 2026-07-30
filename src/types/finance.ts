import type { ID, Timestamp, PaymentMethod, ProductLevel } from './common';

/** 渠道类型 */
export type ChannelType = '搜索引擎' | '社交媒体' | '展会' | '转介绍' | '直销';

/** 财务日记录 */
export interface FinanceDailyRecord {
  date: string;
  revenue: number;
  cost: number;
  profit: number;
  orderCount: number;
  refundAmount: number;
  newCustomers: number;
}

/** 渠道 ROI */
export interface ChannelROI {
  channel: ChannelType;
  investment: number;
  revenue: number;
  leads: number;
  conversions: number;
  roi: number;
  costPerLead: number;
}

/** 财务收入记录 */
export interface FinanceIncome {
  id: ID;
  orderId: ID;
  orderNo: string;
  amount: number;
  paymentMethod: PaymentMethod;
  customerName: string;
  productName?: string;
  productLevel: ProductLevel;
  receivedAt: Timestamp;
}

/** 财务支出记录 */
export interface FinanceExpense {
  id: ID;
  category: string;
  amount: number;
  description: string;
  approvedBy?: string;
  paidAt?: Timestamp;
}

export type FinanceTransactionDirection = 'income' | 'expense';

export type FinanceTransactionSourceType =
  | 'order_payment'
  | 'order_payment_adjustment'
  | 'commission_payout';

export interface FinanceTransaction {
  id: ID;
  transactionNo: string;
  type: string;
  direction: FinanceTransactionDirection;
  sourceType: FinanceTransactionSourceType;
  sourceDomain: string;
  sourceId: ID;
  sourceEventId: string;
  sourceModule: string;
  amount: number;
  status: string;
  relatedBusiness: string;
  orderId?: ID;
  orderNo?: string;
  customerId?: ID;
  customerName?: string;
  productName?: string;
  productLevel?: ProductLevel;
  paymentMethod?: PaymentMethod;
  paymentReference?: string;
  operatorId?: ID;
  operatorName?: string;
  occurredAt: Timestamp;
  reason?: string;
  attachmentIds?: ID[];
  reversalOfId?: ID;
  sourceStatus?: string;
  createdAt: Timestamp;
}

export interface FinanceTransactionFilters {
  search?: string;
  orderIds?: ID[];
  type?: string;
  direction?: FinanceTransactionDirection | '';
  status?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

export interface FinanceTransactionSummary {
  incomeAmount: number;
  expenseAmount: number;
  netAmount: number;
  transactionCount: number;
}

export type FinancePaymentEvidenceIssueCode =
  | 'invalid_payment'
  | 'missing_original'
  | 'duplicate_original'
  | 'invalid_original'
  | 'invalid_adjustment'
  | 'amount_mismatch'
  | 'business_time_mismatch';

export interface FinancePaymentEvidence {
  paymentId: ID;
  paymentReference?: string;
  paidAt: Timestamp;
  expectedAmount: number;
  ledgerAmount: number;
  differenceAmount: number;
  issues: FinancePaymentEvidenceIssueCode[];
}

export interface FinanceOrderEvidenceIssue {
  orderId: ID;
  orderNo: string;
  customerName: string;
  paymentCount: number;
  expectedPaymentAmount: number;
  ledgerNetAmount: number;
  differenceAmount: number;
  issueCount: number;
  orderIssues: string[];
  paymentEvidence: FinancePaymentEvidence[];
}

export interface FinanceTransactionFilterCoverage {
  requestedOrderCount: number;
  matchedOrderIds: ID[];
  missingOrderCount: number;
  orderDetailsRestricted: boolean;
  missingOrders: Array<{
    orderId: ID;
    orderNo: string;
    customerName: string;
    paymentCount: number;
    paymentAmount: number;
  }>;
  evidenceIssueOrderCount: number;
  evidenceIssuePaymentCount: number;
  evidenceDetailsRestricted: boolean;
  evidenceIssueOrders: FinanceOrderEvidenceIssue[];
}

export interface FinanceTransactionPage {
  items: FinanceTransaction[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  summary: FinanceTransactionSummary;
  filterCoverage?: FinanceTransactionFilterCoverage;
}

/** 财务统计 */
export interface FinanceStats {
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  totalOrders: number;
  totalRefund: number;
  avgOrderValue: number;
}

/** 财务筛选参数 */
export interface FinanceFilters {
  startDate?: string;
  endDate?: string;
  granularity?: 'day' | 'week' | 'month';
  channel?: ChannelType;
}
