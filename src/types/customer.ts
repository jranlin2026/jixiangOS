import type { ID, Timestamp, ProductLevel, CustomerLevel } from './common';
import type { LifecycleStatusCode, LifecycleStatusConfig } from './settings';
import type { CustomerTagFilterMode } from './tag';

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
  | 'note'
  | 'todo';

export interface CustomerActivityRecord {
  id: ID;
  type: CustomerActivityType;
  title: string;
  content?: string;
  attachments?: CustomerActivityAttachment[];
  operator: string;
  createdAt: Timestamp;
  changes?: Array<{
    field: string;
    label: string;
    oldValue?: string | number | boolean | null;
    newValue?: string | number | boolean | null;
  }>;
  relatedId?: ID;
  relatedType?: 'order' | 'refund' | 'lead' | 'opportunity' | 'todo';
}

export type CustomerActivityAttachmentCategory = 'image' | 'document' | 'audio' | 'other';

export interface CustomerActivityAttachment {
  id: ID;
  name: string;
  size: number;
  type: string;
  category: CustomerActivityAttachmentCategory;
  dataUrl: string;
  uploadedAt: Timestamp;
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
  /** 销售负责人稳定标识；权限判断必须优先使用此字段 */
  ownerId?: ID;
  /** 导入/历史数据的负责人解析状态 */
  ownerIdentityStatus?: 'resolved' | 'unresolved' | 'ambiguous' | 'public_pool';
  /** 上一任销售负责人 */
  previousOwner?: string;
  /** 最近分配人 */
  assignedBy?: string;
  /** 最近分配时间 */
  assignedAt?: Timestamp;
  /** 最近分配原因 */
  assignmentReason?: string;
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
  manualTagIds?: ID[];
  /** 线索录入人 */
  leadInputBy?: string;
  /** 线索贡献人：资源归属和线索分成依据 */
  leadContributorId?: ID;
  leadContributorName?: string;
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
  deletedAt?: Timestamp;
  deletedBy?: string;
  deleteReason?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * 生命周期策略接受扩展状态 code，但现有客户字段继续使用受控的 LifecycleStatusCode。
 * 这样历史配置可以先被审计/归一化，而不会扩大客户写模型的类型范围。
 */
export type CustomerLifecycleStatus = Omit<LifecycleStatusConfig, 'code'> & { code: string };

export interface CustomerLifecycleConfig {
  statuses: CustomerLifecycleStatus[];
  enabledStatusCodes: string[];
  transitions: Record<string, string[]>;
}

/** 客户筛选参数 */
export interface CustomerFilters {
  search?: string;
  productLevel?: ProductLevel;
  customerLevel?: CustomerLevel;
  lifecycleStatusCode?: LifecycleStatusCode;
  owner?: string;
  followStatus?: 'has_follow' | 'no_follow';
  sourceType?: string;
  leadSource?: string;
  industry?: string;
  city?: string;
  tagIds?: ID[];
  tagMatch?: CustomerTagFilterMode;
  withoutTags?: boolean;
  missingTagGroupId?: ID;
  tag?: string; // one-release compatibility for the old free-text URL
  page?: number;
  pageSize?: number;
}

export type CustomerCreateInput = Omit<
  Customer,
  'id' | 'createdAt' | 'updatedAt' | 'growthPath' | 'growthRecords' | 'orderCount' | 'totalSpent' | 'productLevel'
> & {
  productLevel?: ProductLevel;
};

/** 客户写操作中可选的最小人员投影。 */
export interface CustomerManageableUser {
  id: ID;
  name: string;
  positionName?: string;
}
