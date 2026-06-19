import type {
  CustomerSuccessFilters,
  CustomerSuccessFollowUp,
  CustomerSuccessStats,
  CustomerSuccessTask,
  CustomerSuccessTaskStatus,
} from '../types/customerSuccess';
import type { Customer } from '../types/customer';
import type { Order } from '../types/order';
import type { Refund } from '../types/refund';
import type { UpgradeOpportunity } from '../types/upgrade';
import type { ApiResponse, PaginatedResponse } from './types';
import { createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { DEFAULT_PAGE_SIZE, STORAGE_KEYS } from '../shared/utils/constants';
import { initializeMockData } from './mock';
import { v4 as uuidv4 } from 'uuid';
import { getCurrentOperatorName } from '../shared/utils/currentOperator';

function ensureInit(): void {
  initializeMockData();
  const existing = getStorageData<CustomerSuccessTask[]>(STORAGE_KEYS.CUSTOMER_SUCCESS_TASKS);
  if (existing && existing.length > 0) return;

  const customers = getStorageData<Customer[]>(STORAGE_KEYS.CUSTOMERS) || [];
  const orders = getStorageData<Order[]>(STORAGE_KEYS.ORDERS) || [];
  const refunds = getStorageData<Refund[]>(STORAGE_KEYS.REFUNDS) || [];
  const opportunities = getStorageData<UpgradeOpportunity[]>(STORAGE_KEYS.UPGRADE_POOL) || [];
  const now = new Date();
  const tasks: CustomerSuccessTask[] = [];

  customers.slice(0, 10).forEach((customer, idx) => {
    const hasRisk = customer.aiPortrait?.riskLevel === '高' || (customer.tags || []).some((tag) => tag.includes('风险'));
    if (hasRisk) {
      tasks.push(createTask(customer, '风险', '高', '客户存在流失风险', '查看使用活跃度并安排专项回访', '客户', idx + 1));
    } else if (idx % 2 === 0) {
      tasks.push(createTask(customer, '回访', '中', '客户例行回访', '确认近期使用效果并挖掘升级需求', '客户', idx + 3));
    }
  });

  orders.filter((order) => order.orderType === '续费').slice(0, 5).forEach((order, idx) => {
    tasks.push({
      id: `cs-${uuidv4().slice(0, 8)}`,
      customerId: order.customerId,
      customerName: order.customerName,
      taskType: '续费',
      title: '续费客户跟进',
      description: `订单 ${order.orderNo} 为续费场景，请确认服务周期和下一次续费风险。`,
      priority: '中',
      status: '待处理',
      ownerName: order.successName || order.owner || '客户成功',
      dueDate: addDays(now, idx + 5),
      source: '订单',
      relatedId: order.id,
      followUps: [],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  });

  opportunities.slice(0, 6).forEach((opp, idx) => {
    tasks.push({
      id: `cs-${uuidv4().slice(0, 8)}`,
      customerId: opp.customerId,
      customerName: opp.customerName,
      taskType: '升单',
      title: `${opp.targetProduct}升单推进`,
      description: opp.reason,
      priority: opp.probability >= 75 ? '高' : '中',
      status: '待处理',
      ownerName: opp.ownerName,
      dueDate: addDays(now, idx + 2),
      source: '升单池',
      relatedId: opp.id,
      followUps: [],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  });

  refunds.filter((refund) => (refund.riskTags || []).length > 0).slice(0, 5).forEach((refund, idx) => {
    tasks.push({
      id: `cs-${uuidv4().slice(0, 8)}`,
      customerId: refund.customerId,
      customerName: refund.customerName,
      taskType: '服务',
      title: '退款风险服务跟进',
      description: refund.refundReason,
      priority: '高',
      status: '待处理',
      ownerName: refund.recoveryTask?.assignedToName || '客户成功',
      dueDate: addDays(now, idx + 1),
      source: '退款风险',
      relatedId: refund.id,
      followUps: [],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  });

  setStorageData(STORAGE_KEYS.CUSTOMER_SUCCESS_TASKS, tasks);
}

function addDays(date: Date, days: number): string {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
}

function createTask(customer: Customer, taskType: CustomerSuccessTask['taskType'], priority: CustomerSuccessTask['priority'], title: string, description: string, source: CustomerSuccessTask['source'], days: number): CustomerSuccessTask {
  const now = new Date();
  return {
    id: `cs-${uuidv4().slice(0, 8)}`,
    customerId: customer.id,
    customerName: customer.name,
    taskType,
    title,
    description,
    priority,
    status: '待处理',
    ownerName: customer.owner || '客户成功',
    dueDate: addDays(now, days),
    source,
    followUps: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

async function getTasks(filters?: CustomerSuccessFilters): Promise<ApiResponse<PaginatedResponse<CustomerSuccessTask>>> {
  ensureInit();
  await delay(150);
  let items = getStorageData<CustomerSuccessTask[]>(STORAGE_KEYS.CUSTOMER_SUCCESS_TASKS) || [];
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    items = items.filter((item) => item.customerName.toLowerCase().includes(q) || item.title.toLowerCase().includes(q));
  }
  if (filters?.taskType) items = items.filter((item) => item.taskType === filters.taskType);
  if (filters?.status) items = items.filter((item) => item.status === filters.status);
  if (filters?.priority) items = items.filter((item) => item.priority === filters.priority);
  if (filters?.ownerName) items = items.filter((item) => item.ownerName === filters.ownerName);
  items = [...items].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const page = filters?.page || 1;
  const pageSize = filters?.pageSize || DEFAULT_PAGE_SIZE;
  const total = items.length;
  return createSuccessResponse({ items: items.slice((page - 1) * pageSize, page * pageSize), pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
}

async function getStats(): Promise<ApiResponse<CustomerSuccessStats>> {
  ensureInit();
  await delay(100);
  const tasks = getStorageData<CustomerSuccessTask[]>(STORAGE_KEYS.CUSTOMER_SUCCESS_TASKS) || [];
  const today = new Date().toISOString().slice(0, 10);
  return createSuccessResponse({
    pending: tasks.filter((item) => item.status === '待处理').length,
    overdue: tasks.filter((item) => item.status !== '已完成' && item.dueDate < today).length,
    highRisk: tasks.filter((item) => item.taskType === '风险').length,
    renewal: tasks.filter((item) => item.taskType === '续费').length,
    upgrade: tasks.filter((item) => item.taskType === '升单').length,
  });
}

async function updateStatus(id: string, status: CustomerSuccessTaskStatus): Promise<ApiResponse<CustomerSuccessTask | null>> {
  ensureInit();
  await delay(100);
  const tasks = getStorageData<CustomerSuccessTask[]>(STORAGE_KEYS.CUSTOMER_SUCCESS_TASKS) || [];
  const task = tasks.find((item) => item.id === id);
  if (!task) return createSuccessResponse(null);
  task.status = status;
  task.updatedAt = new Date().toISOString();
  setStorageData(STORAGE_KEYS.CUSTOMER_SUCCESS_TASKS, tasks);
  return createSuccessResponse(task);
}

async function addFollowUp(id: string, content: string, createdBy = getCurrentOperatorName()): Promise<ApiResponse<CustomerSuccessTask | null>> {
  ensureInit();
  await delay(100);
  const tasks = getStorageData<CustomerSuccessTask[]>(STORAGE_KEYS.CUSTOMER_SUCCESS_TASKS) || [];
  const task = tasks.find((item) => item.id === id);
  if (!task) return createSuccessResponse(null);
  const record: CustomerSuccessFollowUp = { id: uuidv4(), content, createdBy, createdAt: new Date().toISOString() };
  task.followUps.unshift(record);
  task.status = task.status === '待处理' ? '跟进中' : task.status;
  task.updatedAt = record.createdAt;
  setStorageData(STORAGE_KEYS.CUSTOMER_SUCCESS_TASKS, tasks);
  return createSuccessResponse(task);
}

export const customerSuccessApi = {
  getTasks,
  getStats,
  updateStatus,
  addFollowUp,
};
