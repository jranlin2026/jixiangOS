import type { ID, Timestamp } from './common';

export type CustomerSuccessTaskType = '续费' | '升单' | '风险' | '回访' | '服务';
export type CustomerSuccessTaskStatus = '待处理' | '跟进中' | '已完成' | '已关闭';
export type CustomerSuccessTaskPriority = '低' | '中' | '高';

export interface CustomerSuccessFollowUp {
  id: ID;
  content: string;
  createdBy: string;
  createdAt: Timestamp;
}

export interface CustomerSuccessTask {
  id: ID;
  customerId: ID;
  customerName: string;
  taskType: CustomerSuccessTaskType;
  title: string;
  description: string;
  priority: CustomerSuccessTaskPriority;
  status: CustomerSuccessTaskStatus;
  ownerName: string;
  dueDate: string;
  source: '客户' | '订单' | '升单池' | '退款风险' | '手动';
  relatedId?: ID;
  followUps: CustomerSuccessFollowUp[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CustomerSuccessFilters {
  search?: string;
  taskType?: CustomerSuccessTaskType;
  status?: CustomerSuccessTaskStatus;
  priority?: CustomerSuccessTaskPriority;
  ownerName?: string;
  page?: number;
  pageSize?: number;
}

export interface CustomerSuccessStats {
  pending: number;
  overdue: number;
  highRisk: number;
  renewal: number;
  upgrade: number;
}
