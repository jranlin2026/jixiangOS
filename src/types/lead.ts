import type { ID, Timestamp, ProductLevel } from './common';

/** 线索来源 */
export type LeadSource =
  | '官网'
  | '转介绍'
  | '广告'
  | '展会'
  | '社交媒体'
  | '电话营销'
  | '其他';

/** 线索状态 */
export type LeadStatus =
  | '新线索'
  | '已联系'
  | '已验证'
  | '方案中'
  | '谈判中'
  | '已成交'
  | '已流失';

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
  name: string;
  company?: string;
  phone: string;
  email?: string;
  source: LeadSource;
  status: LeadStatus;
  owner: string;
  estimatedAmount?: number;
  aiAnalysis?: LeadAIAnalysis;
  tags?: string[];
  sourceType?: string;
  sourceName?: string;
  sourceAccount?: string;
  score?: number;
  wechat?: string;
  industry?: string;
  city?: string;
  estimatedProductId?: ID;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  followUpRecords: FollowUpRecord[];
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
