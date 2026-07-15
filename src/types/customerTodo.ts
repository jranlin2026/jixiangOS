import type { ID, Timestamp } from './common';

export type CustomerTodoStatus = 'pending' | 'completed' | 'canceled';
export type CustomerTodoExecutionMethod = 'none' | 'phone' | 'wechat' | 'visit' | 'sms' | 'email';

export interface CustomerTodo {
  id: ID;
  customerId: ID;
  customerName: string;
  title: string;
  content?: string;
  status: CustomerTodoStatus;
  dueAt: Timestamp;
  executionMethod: CustomerTodoExecutionMethod;
  assigneeId: ID;
  assigneeName: string;
  createdById: ID;
  createdByName: string;
  completedAt?: Timestamp;
  completedById?: ID;
  completedByName?: string;
  canceledAt?: Timestamp;
  canceledById?: ID;
  canceledByName?: string;
  cancelReason?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CustomerTodoInput {
  title: string;
  content?: string;
  dueAt: Timestamp;
  executionMethod: CustomerTodoExecutionMethod;
  assigneeId: ID;
}
