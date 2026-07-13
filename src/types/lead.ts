import type { ID, Timestamp } from './common';
import type { LifecycleStatusCode } from './settings';

/** 线索来源，由系统设置维护 */
export type LeadSource = string;

/** 线索内部状态，录入时默认新线索，不再在表单中手动维护 */
export type LeadStatus = '新线索' | '已联系' | '已验证' | '方案中' | '谈判中' | '已成交' | '已流失';

/** 客资在系统内的生命周期状态，供线索人员查看 */
export type LeadLifecycleStatus = string;

export type LeadIntakeStatus = '入库成功' | '入库失败' | '待分配';
export type LeadUniqueKeyMode = 'phone_or_wechat';

/** 跟进方式 */
export type FollowUpType = '电话' | '微信' | '邮件' | '上门' | '会议' | '其他';

/** 跟进记录 */
export interface FollowUpRecord {
  id: ID;
  leadId: ID;
  type: FollowUpType;
  content: string;
  nextFollowUpDate?: string;
  createdBy: string;
  createdAt: Timestamp;
}

/** AI 升级概率分析 */
export interface LeadAIAnalysis {
  upgradeProbability: number;
  reasons: string[];
  suggestions: string[];
  analyzedAt: Timestamp;
}

export interface LeadChangeLog {
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

/** 线索 */
export interface Lead {
  id: ID;
  customerId?: ID;
  name: string;
  company?: string;
  phone: string;
  email?: string;
  source: LeadSource;
  status: LeadStatus;
  lifecycleStatusCode?: LifecycleStatusCode;
  lifecycleStatus?: LeadLifecycleStatus;
  lifecycleStatusUpdatedAt?: Timestamp;
  opportunityId?: ID;
  orderId?: ID;
  intakeStatus?: LeadIntakeStatus;
  intakeFailureReason?: string;
  /** 线索录入人：操作留痕，不等同于贡献人 */
  inputBy?: string;
  /** 线索贡献人：资源归属和线索分成依据 */
  leadContributorId?: ID;
  leadContributorName?: string;
  assignedTo?: string;
  assignedAt?: Timestamp;
  assignmentRuleId?: ID;
  owner: string;
  estimatedAmount?: number;
  aiAnalysis?: LeadAIAnalysis;
  /** @deprecated 仅用于读取待清理的历史数据；线索端不得再写入、展示或继承。 */
  tags?: string[];
  /** @deprecated 仅用于读取待清理的历史数据；线索端不得再写入、展示或继承。 */
  manualTagIds?: ID[];
  sourceType?: string;
  sourceName?: string;
  sourceAccount?: string;
  remark?: string;
  score?: number;
  wechat?: string;
  industry?: string;
  city?: string;
  estimatedProductId?: ID;
  changeHistory?: LeadChangeLog[];
  deletedAt?: Timestamp;
  deletedBy?: string;
  deleteReason?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  followUpRecords: FollowUpRecord[];
}

export interface LeadFlowConfig {
  id: ID;
  uniqueKeyMode: LeadUniqueKeyMode;
  interceptionEnabled: boolean;
  autoAssignEnabled: boolean;
  autoClaimAfterAssignmentEnabled: boolean;
  assignmentMode: 'round_robin';
  participantUserIds: ID[];
  dailyLimitEnabled: boolean;
  dailyLimit: number;
  lastAssignedIndex: number;
  updatedAt: Timestamp;
}

export interface LeadIntakeRecord {
  id: ID;
  leadId?: ID;
  customerId?: ID;
  name: string;
  company?: string;
  phone?: string;
  wechat?: string;
  source?: LeadSource;
  inputBy?: string;
  assignedTo?: string;
  status: LeadIntakeStatus;
  matchedRule: string;
  failureReason?: string;
  collisionTargetType?: '客户' | '线索';
  collisionTargetId?: ID;
  collisionTargetName?: string;
  createdAt: Timestamp;
}

/** 线索筛选参数 */
export interface LeadFilters {
  search?: string;
  source?: LeadSource;
  status?: LeadStatus;
  lifecycleStatusCode?: LifecycleStatusCode;
  owner?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}
