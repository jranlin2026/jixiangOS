import type { ID, Timestamp, ProductLevel, CustomerLevel } from './common';
import type { LifecycleStatusCode } from './settings';

/** 成长里程碑 */
export interface GrowthMilestone {
  id: ID;
  date: string;
  title: string;
  description: string;
  productLevel: ProductLevel;
  orderId?: ID;
  orderNo?: string;
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

export type CustomerActivityType =
  | 'create'
  | 'update'
  | 'transfer'
  | 'follow'
  | 'order'
  | 'refund'
  | 'ai'
  | 'note';

export interface CustomerActivityRecord {
  id: ID;
  type: CustomerActivityType;
  title: string;
  content?: string;
  operator: string;
  createdAt: Timestamp;
  changes?: Array<{
    field: string;
    label: string;
    oldValue?: string | number | boolean | null;
    newValue?: string | number | boolean | null;
  }>;
  relatedId?: ID;
  relatedType?: 'order' | 'refund' | 'lead' | 'opportunity';
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
  /** 最新成交产品分类，由订单同步；客户新增时不手动维护 */
  productLevel?: ProductLevel;
  customerLevel: CustomerLevel;
  lifecycleStatusCode?: LifecycleStatusCode;
  lifecycleStatusUpdatedAt?: Timestamp;
  publicPoolAt?: Timestamp;
  releasedBy?: string;
  releaseReason?: string;
  wechat?: string;
  industry?: string;
  city?: string;
  /** 归属销售 */
  /** 销售负责人 */
  owner: string;
  /** 归属开始日期 */
  ownerSince?: Timestamp;
  /** 保护期天数，默认730天 */
  ownerProtectDays?: number;
  totalSpent: number;
  orderCount: number;
  growthPath: GrowthMilestone[];
  growthRecords: CustomerGrowthRecord[];
  activityRecords?: CustomerActivityRecord[];
  aiPortrait?: AICustomerPortrait;
  tags?: string[];
  /** 线索录入人 */
  leadInputBy?: string;
  /** 线索来源 */
  leadSource?: string;
  /** 客户备注 */
  remark?: string;
  /** 原销转人员 */
  originalSalesTransferBy?: string;
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
  lifecycleStatusCode?: LifecycleStatusCode;
  owner?: string;
  page?: number;
  pageSize?: number;
}

export type CustomerCreateInput = Omit<
  Customer,
  'id' | 'createdAt' | 'updatedAt' | 'growthPath' | 'growthRecords' | 'orderCount' | 'totalSpent' | 'productLevel'
> & {
  productLevel?: ProductLevel;
};
