import type { ID, Timestamp } from './common';

/** 线索来源，由系统设置维护 */
export type LeadSource = string;

/** 线索内部状态，录入时默认新线索，不再在表单中手动维护 */
export type LeadStatus = '新线索' | '已联系' | '已验证' | '方案中' | '谈判中' | '已成交' | '已流失';

/** 客资在系统内的生命周期状态，供线索人员查看 */
export type LeadLifecycleStatus = string;

export type LeadIntakeStatus = '入库成功' | '入库失败' | '待分配';
export type LeadUniqueKeyMode = 'phone' | 'wechat' | 'phone_or_wechat';

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
  lifecycleStatus?: LeadLifecycleStatus;
  lifecycleStatusUpdatedAt?: Timestamp;
  opportunityId?: ID;
  orderId?: ID;
  intakeStatus?: LeadIntakeStatus;
  intakeFailureReason?: string;
  inputBy?: string;
  assignedTo?: string;
  assignedAt?: Timestamp;
  assignmentRuleId?: ID;
  owner: string;
  estimatedAmount?: number;
  aiAnalysis?: LeadAIAnalysis;
  tags?: string[];
  sourceType?: string;
  sourceName?: string;
  sourceAccount?: string;
  remark?: string;
  score?: number;
  wechat?: string;
  industry?: string;
  city?: string;
  estimatedProductId?: ID;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  followUpRecords: FollowUpRecord[];
}

export interface LeadFlowConfig {
  id: ID;
  uniqueKeyMode: LeadUniqueKeyMode;
  interceptionEnabled: boolean;
  exemptionEnabled: boolean;
  orderMatchCustomerEnabled: boolean;
  autoAssignEnabled: boolean;
  assignmentMode: 'round_robin';
  participantUserIds: ID[];
  dailyLimitEnabled: boolean;
  dailyLimit: number;
  dailyRestartEnabled: boolean;
  failedInboundCompensationEnabled: boolean;
  inactiveMemberSkipEnabled: boolean;
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
  owner?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}
