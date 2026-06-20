import type { ID, ProductLevel, Timestamp } from './common';

export type DeliveryStage = string;

export type DeliveryProductType = ProductLevel;

export type DeliveryOverallStatus = '全部' | '待开始' | '交付中' | '超期' | '阻塞' | '待验收' | '已完成';

export type DeliveryPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface DeliveryRecord {
  id: ID;
  content: string;
  createdBy: string;
  attachments?: string[];
  createdAt: Timestamp;
}

export interface DeliveryTask {
  id: ID;
  title: string;
  description: string;
  assigneeId?: ID;
  assigneeName?: string;
  status: string;
  dueDate?: string;
  completedAt?: Timestamp;
  records: DeliveryRecord[];
}

export interface Delivery {
  id: ID;
  orderId: ID;
  orderNo: string;
  customerId: ID;
  customerName: string;
  productType: DeliveryProductType;
  currentStage: DeliveryStage;
  stages: DeliveryStage[];
  tasks: DeliveryTask[];
  owner: string;
  ownerId?: ID;
  salesOwner?: string;
  salesOwnerId?: ID;
  orderAmount?: number;
  paymentDate?: string;
  orderType?: string;
  status?: Exclude<DeliveryOverallStatus, '全部'>;
  priority?: DeliveryPriority;
  plannedCompletedAt?: string;
  actualCompletedAt?: Timestamp;
  blockedReason?: string;
  progressPercent?: number;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface DeliveryFilters {
  productType?: DeliveryProductType;
  stage?: DeliveryStage;
  owner?: string;
  ownerId?: ID;
  salesOwner?: string;
  status?: DeliveryOverallStatus;
  priority?: DeliveryPriority | '';
  paymentStart?: string;
  paymentEnd?: string;
  plannedStart?: string;
  plannedEnd?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface DeliveryListResponse {
  items: Delivery[];
  total: number;
  page: number;
  pageSize: number;
}

export type DeliveryStatusCounts = Record<DeliveryOverallStatus, number>;

export interface DeliveryStageCount {
  stage: string;
  count: number;
}

export interface DeliveryOwnerWorkload {
  owner: string;
  ownerId?: ID;
  total: number;
  overdue: number;
  blocked: number;
  completed: number;
}

export interface DeliveryStats {
  total: number;
  statusCounts: DeliveryStatusCounts;
  stageCounts: DeliveryStageCount[];
  ownerWorkload: DeliveryOwnerWorkload[];
  overdueCount: number;
}
