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
