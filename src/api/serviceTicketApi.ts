import type {
  ServiceTicket,
  ServiceTicketFilters,
  ServiceTicketLog,
  ServiceTicketStats,
  ServiceTicketStatus,
} from '../types/serviceTicket';
import type { Refund } from '../types/refund';
import type { ApiResponse, PaginatedResponse } from './types';
import { createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { DEFAULT_PAGE_SIZE, STORAGE_KEYS } from '../shared/utils/constants';
import { initializeMockData } from './mock';
import { v4 as uuidv4 } from 'uuid';

function ensureInit(): void {
  initializeMockData();
  const existing = getStorageData<ServiceTicket[]>(STORAGE_KEYS.SERVICE_TICKETS);
  if (existing && existing.length > 0) return;

  const refunds = getStorageData<Refund[]>(STORAGE_KEYS.REFUNDS) || [];
  const now = new Date().toISOString();
  const tickets: ServiceTicket[] = refunds.slice(0, 8).map((refund, index) => ({
    id: `ticket-${uuidv4().slice(0, 8)}`,
    ticketNo: `TK${new Date().getFullYear()}${String(index + 1).padStart(4, '0')}`,
    customerId: refund.customerId,
    customerName: refund.customerName,
    orderId: refund.orderId,
    orderNo: refund.orderNo,
    refundId: refund.id,
    category: refund.refundCategory === '服务不满意' ? '退款前风险' : refund.refundCategory === '产品质量' ? '故障' : '咨询',
    title: `售后处理 - ${refund.refundReason}`,
    description: refund.refundReason,
    priority: refund.estimatedLossAmount && refund.estimatedLossAmount > 20000 ? '高' : '中',
    status: index % 3 === 0 ? '处理中' : '待处理',
    ownerName: refund.recoveryTask?.assignedToName || refund.applicantName || '售后',
    source: '退款',
    logs: refund.recoveryLogs?.slice(0, 2).map((log) => ({
      id: log.id,
      content: log.content,
      operatorName: log.operatorName,
      nextFollowUpAt: log.nextFollowUpAt,
      createdAt: log.createdAt,
    })) || [],
    createdAt: refund.createdAt || now,
    updatedAt: refund.updatedAt || now,
  }));
  setStorageData(STORAGE_KEYS.SERVICE_TICKETS, tickets);
}

async function getTickets(filters?: ServiceTicketFilters): Promise<ApiResponse<PaginatedResponse<ServiceTicket>>> {
  ensureInit();
  await delay(150);
  let items = getStorageData<ServiceTicket[]>(STORAGE_KEYS.SERVICE_TICKETS) || [];
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    items = items.filter((item) => item.ticketNo.toLowerCase().includes(q) || item.customerName.toLowerCase().includes(q) || item.title.toLowerCase().includes(q));
  }
  if (filters?.category) items = items.filter((item) => item.category === filters.category);
  if (filters?.status) items = items.filter((item) => item.status === filters.status);
  if (filters?.priority) items = items.filter((item) => item.priority === filters.priority);
  if (filters?.ownerName) items = items.filter((item) => item.ownerName === filters.ownerName);
  items = [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const page = filters?.page || 1;
  const pageSize = filters?.pageSize || DEFAULT_PAGE_SIZE;
  const total = items.length;
  return createSuccessResponse({ items: items.slice((page - 1) * pageSize, page * pageSize), pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
}

async function getStats(): Promise<ApiResponse<ServiceTicketStats>> {
  ensureInit();
  await delay(100);
  const tickets = getStorageData<ServiceTicket[]>(STORAGE_KEYS.SERVICE_TICKETS) || [];
  return createSuccessResponse({
    pending: tickets.filter((item) => item.status === '待处理').length,
    processing: tickets.filter((item) => item.status === '处理中').length,
    waitingCustomer: tickets.filter((item) => item.status === '待客户反馈').length,
    resolved: tickets.filter((item) => item.status === '已解决').length,
    highPriority: tickets.filter((item) => item.priority === '高').length,
  });
}

async function createTicket(data: Omit<ServiceTicket, 'id' | 'ticketNo' | 'logs' | 'createdAt' | 'updatedAt'>): Promise<ApiResponse<ServiceTicket>> {
  ensureInit();
  await delay(150);
  const tickets = getStorageData<ServiceTicket[]>(STORAGE_KEYS.SERVICE_TICKETS) || [];
  const now = new Date().toISOString();
  const ticket: ServiceTicket = {
    ...data,
    id: `ticket-${uuidv4().slice(0, 8)}`,
    ticketNo: `TK${new Date().getFullYear()}${String(tickets.length + 1).padStart(4, '0')}`,
    logs: [],
    createdAt: now,
    updatedAt: now,
  };
  setStorageData(STORAGE_KEYS.SERVICE_TICKETS, [ticket, ...tickets]);
  return createSuccessResponse(ticket);
}

async function updateStatus(id: string, status: ServiceTicketStatus): Promise<ApiResponse<ServiceTicket | null>> {
  ensureInit();
  await delay(100);
  const tickets = getStorageData<ServiceTicket[]>(STORAGE_KEYS.SERVICE_TICKETS) || [];
  const ticket = tickets.find((item) => item.id === id);
  if (!ticket) return createSuccessResponse(null);
  ticket.status = status;
  ticket.updatedAt = new Date().toISOString();
  setStorageData(STORAGE_KEYS.SERVICE_TICKETS, tickets);
  return createSuccessResponse(ticket);
}

async function addLog(id: string, data: Omit<ServiceTicketLog, 'id' | 'createdAt'>): Promise<ApiResponse<ServiceTicket | null>> {
  ensureInit();
  await delay(100);
  const tickets = getStorageData<ServiceTicket[]>(STORAGE_KEYS.SERVICE_TICKETS) || [];
  const ticket = tickets.find((item) => item.id === id);
  if (!ticket) return createSuccessResponse(null);
  const now = new Date().toISOString();
  ticket.logs.unshift({ ...data, id: uuidv4(), createdAt: now });
  ticket.status = ticket.status === '待处理' ? '处理中' : ticket.status;
  ticket.updatedAt = now;
  setStorageData(STORAGE_KEYS.SERVICE_TICKETS, tickets);
  return createSuccessResponse(ticket);
}

export const serviceTicketApi = {
  getTickets,
  getStats,
  createTicket,
  updateStatus,
  addLog,
};
