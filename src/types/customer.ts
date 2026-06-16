import type { ID, Timestamp, ProductLevel, CustomerLevel } from './common';

/** 成长里程碑 */
export interface GrowthMilestone {
  id: ID;
  date: string;
  title: string;
  description: string;
  productLevel: ProductLevel;
}

/** 客户成长记录 */
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

/** AI 客户画像 */
export interface AICustomerPortrait {
  riskLevel: '低' | '中' | '高';
  upgradePotential: '低' | '中' | '高';
  satisfaction: number;
  predictedNextPurchase?: string;
  keyInsights: string[];
  analyzedAt: Timestamp;
  teamSize?: string;
  accountCount?: number;
  budgetLevel?: '低' | '中' | '高';
  activityLevel?: '低' | '中' | '高';
  upgradeProbability?: number;
  aiSummary?: string;
}

/** 客户 */
export interface Customer {
  id: ID;
  name: string;
  company: string;
  phone: string;
  email?: string;
  productLevel: ProductLevel;
  customerLevel: CustomerLevel;
  wechat?: string;
  industry?: string;
  city?: string;
  /** 归属销售 */
  owner: string;
  /** 归属开始日期 */
  ownerSince?: Timestamp;
  /** 保护期天数，默认730天 */
  ownerProtectDays?: number;
  totalSpent: number;
  orderCount: number;
  growthPath: GrowthMilestone[];
  growthRecords: CustomerGrowthRecord[];
  aiPortrait?: AICustomerPortrait;
  tags?: string[];
  sourceType?: string;
  sourceName?: string;
  sourceAccount?: string;
  score?: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** 客户筛选参数 */
export interface CustomerFilters {
  search?: string;
  productLevel?: ProductLevel;
  customerLevel?: CustomerLevel;
  owner?: string;
  page?: number;
  pageSize?: number;
}
