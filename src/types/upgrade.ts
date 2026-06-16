import type { ID, Timestamp, CustomerLevel, ProductLevel } from './common';

/** 升单机会状态 */
export type UpgradeStatus = '待跟进' | '跟进中' | '已转化' | '已流失';

/** 升单跟进记录 */
export interface UpgradeFollowUp {
  id: ID;
  content: string;
  createdBy: string;
  createdAt: Timestamp;
}

/** 客户成长记录（升单池专用） */
export interface CustomerGrowthRecord {
  fromLevel: CustomerLevel;
  toLevel: CustomerLevel;
  fromProduct: ProductLevel;
  toProduct: ProductLevel;
  orderId?: ID;
  upgradeAmount: number;
  reason: string;
  createdAt: Timestamp;
}

/** 升单机会 */
export interface UpgradeOpportunity {
  id: ID;
  customerId: ID;
  customerName: string;
  currentLevel: CustomerLevel;
  currentProduct: ProductLevel;
  targetProduct: ProductLevel;
  targetLevel: CustomerLevel;
  probability: number;
  estimatedAmount: number;
  reason: string;
  suggestions: string[];
  status: UpgradeStatus;
  ownerName: string;
  lastFollowUpAt?: Timestamp;
  followUpCount: number;
  followUpRecords: UpgradeFollowUp[];
  aiAnalyzedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** 升单机会筛选参数 */
export interface UpgradeFilters {
  search?: string;
  status?: UpgradeStatus;
  currentLevel?: CustomerLevel;
  minProbability?: number;
  ownerName?: string;
  page?: number;
  pageSize?: number;
}
