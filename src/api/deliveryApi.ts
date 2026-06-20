import type {
  Delivery,
  DeliveryFilters,
  DeliveryListResponse,
  DeliveryOverallStatus,
  DeliveryStats,
  DeliveryTask,
} from '../types/delivery';
import type { ProductLevel } from '../types/common';
import type { Order } from '../types/order';
import type { Product } from '../types/product';
import type { ApiResponse } from './types';
import { createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import {
  DELIVERY_STAGES_899,
  DELIVERY_STAGES_AGENT,
  DELIVERY_STAGES_COURSE,
  DELIVERY_STAGES_OEM,
  STORAGE_KEYS,
} from '../shared/utils/constants';
import { initializeMockData } from './mock';

const STATUS_ALL: DeliveryOverallStatus = '全部';
const STATUS_NOT_STARTED: Exclude<DeliveryOverallStatus, '全部'> = '待开始';
const STATUS_IN_PROGRESS: Exclude<DeliveryOverallStatus, '全部'> = '交付中';
const STATUS_OVERDUE: Exclude<DeliveryOverallStatus, '全部'> = '超期';
const STATUS_BLOCKED: Exclude<DeliveryOverallStatus, '全部'> = '阻塞';
const STATUS_PENDING_ACCEPTANCE: Exclude<DeliveryOverallStatus, '全部'> = '待验收';
const STATUS_COMPLETED: Exclude<DeliveryOverallStatus, '全部'> = '已完成';

const TASK_PENDING = '待开始';
const TASK_DOING = '进行中';
const TASK_DONE = '已完成';

const STATUS_OPTIONS: DeliveryOverallStatus[] = [
  STATUS_ALL,
  STATUS_NOT_STARTED,
  STATUS_IN_PROGRESS,
  STATUS_OVERDUE,
  STATUS_BLOCKED,
  STATUS_PENDING_ACCEPTANCE,
  STATUS_COMPLETED,
];

function ensureInit(): void {
  initializeMockData();
}

const fallbackStages: Record<string, string[]> = {
  '899': [...DELIVERY_STAGES_899],
  课程: [...DELIVERY_STAGES_COURSE],
  代理: [...DELIVERY_STAGES_AGENT],
  贴牌: [...DELIVERY_STAGES_OEM],
  合伙人: [...DELIVERY_STAGES_AGENT],
};

function getStagesByProductType(productType: ProductLevel): string[] {
  const products = getStorageData<Product[]>(STORAGE_KEYS.PRODUCTS) || [];
  const product = products.find((item) => item.level === productType && item.isActive)
    || products.find((item) => item.level === productType);
  return product?.deliveryStages?.length ? product.deliveryStages : (fallbackStages[productType] || fallbackStages['899']);
}

function getOrderPaymentDate(order?: Order): string | undefined {
  return order?.payments?.[0]?.paidAt || order?.createdAt;
}

function makeStageTasks(delivery: Delivery, stages: string[], currentStage: string): DeliveryTask[] {
  const currentIndex = Math.max(0, stages.indexOf(currentStage));
  const taskByTitle = new Map((delivery.tasks || []).map((task) => [task.title, task]));
  return stages.map((stage, index) => {
    const existing = taskByTitle.get(stage);
    const status = index < currentIndex ? TASK_DONE : index === currentIndex ? TASK_DOING : TASK_PENDING;
    return {
      id: existing?.id || `task-${delivery.id}-${index}`,
      title: stage,
      description: existing?.description || `${stage}任务`,
      assigneeId: existing?.assigneeId,
      assigneeName: existing?.assigneeName || delivery.owner,
      dueDate: existing?.dueDate,
      completedAt: status === TASK_DONE ? existing?.completedAt || delivery.updatedAt : undefined,
      records: existing?.records || [],
      status,
    };
  });
}

function getProgressPercent(tasks: DeliveryTask[]): number {
  if (!tasks.length) return 0;
  const completed = tasks.filter((task) => task.status === TASK_DONE || Boolean(task.completedAt)).length;
  return Math.round((completed / tasks.length) * 100);
}

function isPastDate(date?: string): boolean {
  if (!date) return false;
  const time = new Date(date).getTime();
  if (!Number.isFinite(time)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return time < today.getTime();
}

function deriveStatus(delivery: Delivery, stages: string[], tasks: DeliveryTask[]): Exclude<DeliveryOverallStatus, '全部'> {
  const currentIndex = stages.indexOf(delivery.currentStage);
  const lastIndex = stages.length - 1;
  if (delivery.status === STATUS_BLOCKED || delivery.blockedReason) return STATUS_BLOCKED;
  if (delivery.status === STATUS_COMPLETED || delivery.actualCompletedAt || (lastIndex >= 0 && currentIndex === lastIndex && getProgressPercent(tasks) === 100)) {
    return STATUS_COMPLETED;
  }
  if (isPastDate(delivery.plannedCompletedAt)) return STATUS_OVERDUE;
  if (delivery.status === STATUS_PENDING_ACCEPTANCE || /验收|验付|确认/.test(delivery.currentStage)) return STATUS_PENDING_ACCEPTANCE;
  if (currentIndex <= 0 && getProgressPercent(tasks) === 0) return STATUS_NOT_STARTED;
  return STATUS_IN_PROGRESS;
}

function normalizeDelivery(delivery: Delivery, ordersById: Map<string, Order>): Delivery {
  const order = ordersById.get(delivery.orderId);
  const stages = Array.from(new Set([...getStagesByProductType(delivery.productType), ...(delivery.stages || [])]));
  const currentStage = stages.includes(delivery.currentStage) ? delivery.currentStage : stages[0];
  const tasks = makeStageTasks({ ...delivery, currentStage }, stages, currentStage);
  const progressPercent = delivery.progressPercent ?? getProgressPercent(tasks);
  const status = deriveStatus({ ...delivery, currentStage, progressPercent }, stages, tasks);

  return {
    ...delivery,
    orderNo: delivery.orderNo || order?.orderNo || '',
    customerId: delivery.customerId || order?.customerId || '',
    customerName: delivery.customerName || order?.customerName || '',
    productType: delivery.productType || order?.productLevel || '899',
    currentStage,
    stages,
    tasks,
    owner: delivery.owner || '待分配',
    salesOwner: delivery.salesOwner || order?.salesName || order?.owner,
    salesOwnerId: delivery.salesOwnerId || order?.salesId,
    orderAmount: delivery.orderAmount ?? order?.actualAmount ?? order?.amount,
    paymentDate: delivery.paymentDate || getOrderPaymentDate(order),
    orderType: delivery.orderType || order?.orderType || order?.dealScene,
    status,
    priority: delivery.priority || 'normal',
    progressPercent,
  };
}

function readDeliveries(): Delivery[] {
  ensureInit();
  const orders = getStorageData<Order[]>(STORAGE_KEYS.ORDERS) || [];
  const ordersById = new Map(orders.map((order) => [order.id, order]));
  return (getStorageData<Delivery[]>(STORAGE_KEYS.DELIVERIES) || [])
    .map((delivery) => normalizeDelivery(delivery, ordersById))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

function inDateRange(value: string | undefined, start?: string, end?: string): boolean {
  if (!start && !end) return true;
  if (!value) return false;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return false;
  if (start && time < new Date(start).getTime()) return false;
  if (end) {
    const endDate = new Date(end);
    endDate.setHours(23, 59, 59, 999);
    if (time > endDate.getTime()) return false;
  }
  return true;
}

function filterDeliveries(deliveries: Delivery[], filters?: DeliveryFilters): Delivery[] {
  let filtered = [...deliveries];
  if (filters?.productType) filtered = filtered.filter((item) => item.productType === filters.productType);
  if (filters?.stage) filtered = filtered.filter((item) => item.currentStage === filters.stage);
  if (filters?.owner) filtered = filtered.filter((item) => item.owner === filters.owner);
  if (filters?.ownerId) filtered = filtered.filter((item) => item.ownerId === filters.ownerId);
  if (filters?.salesOwner) filtered = filtered.filter((item) => item.salesOwner === filters.salesOwner);
  if (filters?.priority) filtered = filtered.filter((item) => item.priority === filters.priority);
  if (filters?.status && filters.status !== STATUS_ALL) filtered = filtered.filter((item) => item.status === filters.status);
  if (filters?.paymentStart || filters?.paymentEnd) {
    filtered = filtered.filter((item) => inDateRange(item.paymentDate, filters.paymentStart, filters.paymentEnd));
  }
  if (filters?.plannedStart || filters?.plannedEnd) {
    filtered = filtered.filter((item) => inDateRange(item.plannedCompletedAt, filters.plannedStart, filters.plannedEnd));
  }
  if (filters?.search?.trim()) {
    const q = filters.search.trim().toLowerCase();
    filtered = filtered.filter((item) => (
      item.customerName.toLowerCase().includes(q)
      || item.orderNo.toLowerCase().includes(q)
      || item.owner.toLowerCase().includes(q)
      || (item.salesOwner || '').toLowerCase().includes(q)
    ));
  }
  return filtered;
}

async function fetchDeliveries(filters?: DeliveryFilters): Promise<ApiResponse<DeliveryListResponse>> {
  await delay(160);
  const page = Math.max(1, Number(filters?.page) || 1);
  const pageSize = Math.max(1, Number(filters?.pageSize) || 10);
  const filtered = filterDeliveries(readDeliveries(), filters);
  const start = (page - 1) * pageSize;
  return createSuccessResponse({
    items: filtered.slice(start, start + pageSize),
    total: filtered.length,
    page,
    pageSize,
  });
}

async function fetchDeliveryById(id: string): Promise<ApiResponse<Delivery | null>> {
  await delay(120);
  const delivery = readDeliveries().find((item) => item.id === id) || null;
  return createSuccessResponse(delivery);
}

async function fetchDeliveryStagesByProductType(productType: ProductLevel): Promise<ApiResponse<string[]>> {
  ensureInit();
  await delay(80);
  return createSuccessResponse(getStagesByProductType(productType));
}

async function fetchDeliveriesByProductType(productType: ProductLevel): Promise<ApiResponse<Delivery[]>> {
  const res = await fetchDeliveries({ productType, page: 1, pageSize: 200, status: STATUS_ALL });
  return createSuccessResponse(res.data.items);
}

async function fetchDeliveryStats(filters?: DeliveryFilters): Promise<ApiResponse<DeliveryStats>> {
  await delay(120);
  const scopedFilters = { ...filters, status: STATUS_ALL, page: undefined, pageSize: undefined };
  const deliveries = filterDeliveries(readDeliveries(), scopedFilters);
  const statusCounts = Object.fromEntries(STATUS_OPTIONS.map((status) => [status, 0])) as DeliveryStats['statusCounts'];
  statusCounts[STATUS_ALL] = deliveries.length;

  const stageMap = new Map<string, number>();
  const ownerMap = new Map<string, DeliveryStats['ownerWorkload'][number]>();
  deliveries.forEach((delivery) => {
    statusCounts[delivery.status || STATUS_IN_PROGRESS] += 1;
    stageMap.set(delivery.currentStage, (stageMap.get(delivery.currentStage) || 0) + 1);
    const ownerKey = delivery.ownerId || delivery.owner || '待分配';
    const row = ownerMap.get(ownerKey) || {
      owner: delivery.owner || '待分配',
      ownerId: delivery.ownerId,
      total: 0,
      overdue: 0,
      blocked: 0,
      completed: 0,
    };
    row.total += 1;
    if (delivery.status === STATUS_OVERDUE) row.overdue += 1;
    if (delivery.status === STATUS_BLOCKED) row.blocked += 1;
    if (delivery.status === STATUS_COMPLETED) row.completed += 1;
    ownerMap.set(ownerKey, row);
  });

  return createSuccessResponse({
    total: deliveries.length,
    statusCounts,
    stageCounts: Array.from(stageMap.entries()).map(([stage, count]) => ({ stage, count })),
    ownerWorkload: Array.from(ownerMap.values()).sort((a, b) => b.total - a.total),
    overdueCount: statusCounts[STATUS_OVERDUE],
  });
}

async function advanceDeliveryStage(id: string, targetStage: string): Promise<ApiResponse<Delivery | null>> {
  ensureInit();
  await delay(200);
  const deliveries = getStorageData<Delivery[]>(STORAGE_KEYS.DELIVERIES) || [];
  const idx = deliveries.findIndex((item) => item.id === id);
  if (idx === -1) return createSuccessResponse(null);

  const normalized = readDeliveries().find((item) => item.id === id);
  if (!normalized || !normalized.stages.includes(targetStage)) return createSuccessResponse(null);

  const now = new Date().toISOString();
  const targetIndex = normalized.stages.indexOf(targetStage);
  const nextTasks = normalized.stages.map((stage, index) => {
    const existing = normalized.tasks.find((task) => task.title === stage);
    const status = index <= targetIndex ? TASK_DONE : TASK_PENDING;
    return {
      ...(existing || {
        id: `task-${id}-${index}`,
        title: stage,
        description: `${stage}任务`,
        records: [],
      }),
      status,
      completedAt: status === TASK_DONE ? existing?.completedAt || now : undefined,
    } as DeliveryTask;
  });
  const isComplete = targetIndex === normalized.stages.length - 1;
  const next: Delivery = {
    ...deliveries[idx],
    ...normalized,
    currentStage: targetStage,
    tasks: nextTasks,
    progressPercent: getProgressPercent(nextTasks),
    status: isComplete ? STATUS_COMPLETED : deriveStatus({ ...normalized, currentStage: targetStage }, normalized.stages, nextTasks),
    actualCompletedAt: isComplete ? normalized.actualCompletedAt || now : undefined,
    updatedAt: now,
  };

  deliveries[idx] = next;
  setStorageData(STORAGE_KEYS.DELIVERIES, deliveries);
  return createSuccessResponse(normalizeDelivery(next, new Map((getStorageData<Order[]>(STORAGE_KEYS.ORDERS) || []).map((order) => [order.id, order]))));
}

async function updateDelivery(id: string, data: Partial<Delivery>): Promise<ApiResponse<Delivery | null>> {
  ensureInit();
  await delay(160);
  const deliveries = getStorageData<Delivery[]>(STORAGE_KEYS.DELIVERIES) || [];
  const idx = deliveries.findIndex((item) => item.id === id);
  if (idx === -1) return createSuccessResponse(null);
  deliveries[idx] = { ...deliveries[idx], ...data, updatedAt: new Date().toISOString() };
  setStorageData(STORAGE_KEYS.DELIVERIES, deliveries);
  return fetchDeliveryById(id);
}

async function updateDeliveryTask(deliveryId: string, taskId: string, data: Partial<DeliveryTask>): Promise<ApiResponse<Delivery | null>> {
  ensureInit();
  await delay(160);
  const deliveries = getStorageData<Delivery[]>(STORAGE_KEYS.DELIVERIES) || [];
  const delivery = deliveries.find((item) => item.id === deliveryId);
  if (!delivery) return createSuccessResponse(null);

  const normalized = (await fetchDeliveryById(deliveryId)).data;
  if (!normalized) return createSuccessResponse(null);
  const taskIndex = normalized.tasks.findIndex((task) => task.id === taskId);
  if (taskIndex === -1) return createSuccessResponse(null);
  normalized.tasks[taskIndex] = {
    ...normalized.tasks[taskIndex],
    ...data,
    completedAt: data.status === TASK_DONE ? data.completedAt || new Date().toISOString() : data.completedAt,
  };
  return updateDelivery(deliveryId, {
    tasks: normalized.tasks,
    progressPercent: getProgressPercent(normalized.tasks),
  });
}

export const deliveryApi = {
  fetchDeliveries,
  fetchDeliveryById,
  fetchDeliveryStagesByProductType,
  fetchDeliveriesByProductType,
  fetchDeliveryStats,
  advanceDeliveryStage,
  updateDelivery,
  updateDeliveryTask,
};
