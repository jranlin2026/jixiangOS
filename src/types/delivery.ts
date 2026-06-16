import type { ID, Timestamp, ProductLevel } from './common';

/** 交付阶段 */
export type DeliveryStage = string;

/** 交付产品类型/业务分类 */
export type DeliveryProductType = ProductLevel;

/** 交付子任务记录 */
export interface DeliveryRecord {
  id: ID;
  content: string;
  createdBy: string;
  attachments?: string[];
  createdAt: Timestamp;
}

/** 交付子任务 */
export interface DeliveryTask {
  id: ID;
  title: string;
  description: string;
  assigneeId?: ID;
  assigneeName?: string;
  status: '待开始' | '进行中' | '已完成' | '已跳过';
  dueDate?: string;
  completedAt?: Timestamp;
  records: DeliveryRecord[];
}

/** 交付 */
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
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** 交付筛选参数 */
export interface DeliveryFilters {
  productType?: DeliveryProductType;
  stage?: DeliveryStage;
  owner?: string;
  search?: string;
}
