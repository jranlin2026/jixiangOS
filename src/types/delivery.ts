import type { ID, ProductLevel, Timestamp } from './common';

export type DeliveryStage = string;
export type DeliveryProductType = ProductLevel;

export type DeliveryOverallStatus = '全部' | '待开始' | '交付中' | '超期' | '阻塞' | '待验收' | '已完成';
export type DeliveryTaskStatus = '待开始' | '进行中' | '已完成' | '已跳过';
export type DeliveryPriority = 'low' | 'normal' | 'high' | 'urgent';
export type DeliveryMaterialStatus = '缺失' | '已提供' | '需修改' | '已确认';
export type DeliveryExceptionType = '客户不提供资料' | '交付超期' | '销售承诺不一致' | '其他';
export type DeliveryExceptionStatus = '待主管处理' | '处理中' | '已解除';
export type DeliveryApprovalStatus = '未提交' | '待主管确认' | '已确认';
export type CustomerSuccessStatus = '未开始' | '维护中';

export interface DeliveryAttachment {
  id: ID;
  name: string;
  size?: number;
  fileType?: string;
  url?: string;
  uploadedBy: string;
  uploadedAt: Timestamp;
  remark?: string;
  mimeType?: string;
  category?: 'delivery-task-file';
  uploadedById?: ID;
  uploadedByName?: string;
}

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
  status: DeliveryTaskStatus | string;
  dueDate?: string;
  completedAt?: Timestamp;
  completedBy?: string;
  skippedAt?: Timestamp;
  skipReason?: string;
  isOptional?: boolean;
  attachments?: DeliveryAttachment[];
  resultFields?: Record<string, string>;
  records: DeliveryRecord[];
  updatedAt?: Timestamp;
}

export interface DeliveryMaterialItem {
  key: string;
  label: string;
  value?: string;
  status: DeliveryMaterialStatus;
  attachments?: DeliveryAttachment[];
  remark?: string;
}

export interface DeliverySnapshot {
  customer: {
    id: ID;
    name: string;
    company?: string;
    phone?: string;
    wechat?: string;
    industry?: string;
    city?: string;
    remark?: string;
  };
  order: {
    id: ID;
    orderNo: string;
    productName?: string;
    productLevel: string;
    orderType?: string;
    amount?: number;
    actualAmount?: number;
    paymentDate?: string;
    salesOwner?: string;
    notes?: string;
  };
}

export interface DeliveryException {
  id: ID;
  type: DeliveryExceptionType;
  description: string;
  status: DeliveryExceptionStatus;
  needsSupervisor: boolean;
  createdBy: string;
  createdAt: Timestamp;
  resolvedBy?: string;
  resolvedAt?: Timestamp;
  resolution?: string;
}

export interface DeliveryCreatableOrderSummary {
  orderId: ID;
  orderNo: string;
  customerId: ID;
  customerName: string;
  productName?: string;
  productType: DeliveryProductType;
  orderAmount?: number;
  paymentDate?: string;
  orderType?: string;
  salesOwner?: string;
}

export interface Delivery {
  id: ID;
  orderId: ID;
  orderNo: string;
  customerId: ID;
  customerName: string;
  productName?: string;
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
  materialItems?: DeliveryMaterialItem[];
  snapshot?: DeliverySnapshot;
  exceptions?: DeliveryException[];
  approvalStatus?: DeliveryApprovalStatus;
  supervisorConfirmedBy?: string;
  supervisorConfirmedAt?: Timestamp;
  supervisorNotes?: string;
  customerSuccessStatus?: CustomerSuccessStatus;
  assignmentMode?: 'auto' | 'manual';
  assignedAt?: Timestamp;
  assignedBy?: string;
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
