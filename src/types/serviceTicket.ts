import type { ID, Timestamp } from './common';

export type ServiceTicketCategory = '咨询' | '故障' | '培训' | '交付问题' | '退款前风险';
export type ServiceTicketStatus = '待处理' | '处理中' | '待客户反馈' | '已解决' | '已关闭';
export type ServiceTicketPriority = '低' | '中' | '高';

export interface ServiceTicketLog {
  id: ID;
  content: string;
  operatorName: string;
  nextFollowUpAt?: Timestamp;
  createdAt: Timestamp;
}

export interface ServiceTicket {
  id: ID;
  ticketNo: string;
  customerId: ID;
  customerName: string;
  orderId?: ID;
  orderNo?: string;
  refundId?: ID;
  category: ServiceTicketCategory;
  title: string;
  description: string;
  priority: ServiceTicketPriority;
  status: ServiceTicketStatus;
  ownerName: string;
  source: '客户' | '订单' | '退款' | '手动';
  logs: ServiceTicketLog[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ServiceTicketFilters {
  search?: string;
  category?: ServiceTicketCategory;
  status?: ServiceTicketStatus;
  priority?: ServiceTicketPriority;
  ownerName?: string;
  page?: number;
  pageSize?: number;
}

export interface ServiceTicketStats {
  pending: number;
  processing: number;
  waitingCustomer: number;
  resolved: number;
  highPriority: number;
}
