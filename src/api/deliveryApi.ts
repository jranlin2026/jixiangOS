import type {
  Delivery,
  DeliveryCreatableOrderSummary,
  DeliveryAttachment,
  DeliveryException,
  DeliveryExceptionType,
  DeliveryFilters,
  DeliveryListResponse,
  DeliveryOverallStatus,
  DeliveryStats,
  DeliveryTask,
  DeliveryTaskStatus,
} from '../types/delivery';
import type { ProductLevel } from '../types/common';
import type { Customer } from '../types/customer';
import type { Order } from '../types/order';
import type { Product } from '../types/product';
import type { ApiResponse } from './types';
import { createErrorResponse, createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { STORAGE_KEYS } from '../shared/utils/constants';
import { initializeMockData } from './mock';

const STATUS_ALL: DeliveryOverallStatus = '全部';
const STATUS_NOT_STARTED: Exclude<DeliveryOverallStatus, '全部'> = '待开始';
const STATUS_IN_PROGRESS: Exclude<DeliveryOverallStatus, '全部'> = '交付中';
const STATUS_OVERDUE: Exclude<DeliveryOverallStatus, '全部'> = '超期';
const STATUS_BLOCKED: Exclude<DeliveryOverallStatus, '全部'> = '阻塞';
const STATUS_PENDING_ACCEPTANCE: Exclude<DeliveryOverallStatus, '全部'> = '待验收';
const STATUS_COMPLETED: Exclude<DeliveryOverallStatus, '全部'> = '已完成';

const TASK_PENDING: DeliveryTaskStatus = '待开始';
const TASK_DOING: DeliveryTaskStatus = '进行中';
const TASK_DONE: DeliveryTaskStatus = '已完成';

const STATUS_OPTIONS: DeliveryOverallStatus[] = [
  STATUS_ALL,
  STATUS_NOT_STARTED,
  STATUS_IN_PROGRESS,
  STATUS_OVERDUE,
  STATUS_BLOCKED,
  STATUS_PENDING_ACCEPTANCE,
  STATUS_COMPLETED,
];

type DeliveryStepTemplate = {
  title: string;
  description: string;
  isOptional?: boolean;
};

const PRODUCT_NAME_ALIASES: Record<string, string> = {
  '浠ｇ悊': '代理',
  '璐寸墝': '贴牌',
  '鍚堜紮浜?': '合伙人',
  '鍚堜紮浜�': '合伙人',
  '璇剧▼': '课程',
};

function ensureInit(): void {
  initializeMockData();
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeProductLevel(productType?: string): ProductLevel {
  if (!productType) return '899';
  return PRODUCT_NAME_ALIASES[productType] || productType;
}

function getProductDeliveryStages(productType?: ProductLevel | string, productId?: string, productName?: string): string[] {
  const normalizedType = normalizeProductLevel(productType);
  const products = getStorageData<Product[]>(STORAGE_KEYS.PRODUCTS) || [];
  const productByName = productName ? products.find((item) => item.name === productName) : undefined;
  const matchingProductByName = productByName && normalizeProductLevel(productByName.level) === normalizedType ? productByName : undefined;
  const product = (productId ? products.find((item) => item.id === productId) : undefined)
    || matchingProductByName
    || products.find((item) => normalizeProductLevel(item.level) === normalizedType && item.isActive)
    || products.find((item) => normalizeProductLevel(item.level) === normalizedType);
  return (product?.deliveryStages || []).map((stage) => stage.trim()).filter(Boolean);
}

function toTemplate(stages: string[]): DeliveryStepTemplate[] {
  return stages.map((stage) => ({
    title: stage,
    description: `${stage}任务`,
  }));
}

function getTemplateByProduct(productType?: ProductLevel | string, productId?: string, productName?: string): DeliveryStepTemplate[] {
  return toTemplate(getProductDeliveryStages(productType, productId, productName));
}

function getTemplateByOrder(order: Order): DeliveryStepTemplate[] {
  return getTemplateByProduct(order.productLevel, order.productId, order.productName);
}

function getTemplateByDelivery(delivery: Delivery, order?: Order): DeliveryStepTemplate[] {
  const productType = normalizeProductLevel(delivery.productType || order?.productLevel);
  return getTemplateByProduct(productType, order?.productId, delivery.productName || order?.productName);
}

function getTemplateByProductType(productType: ProductLevel): DeliveryStepTemplate[] {
  return getTemplateByProduct(productType);
}

function getStagesByProductType(productType: ProductLevel): string[] {
  return getTemplateByProductType(productType).map((item) => item.title);
}

function getOrderPaymentDate(order?: Order): string | undefined {
  return order?.payments?.[0]?.paidAt || order?.createdAt;
}

function toCreatableOrderSummary(order: Order): DeliveryCreatableOrderSummary {
  return {
    orderId: order.id,
    orderNo: order.orderNo,
    customerId: order.customerId,
    customerName: order.customerName,
    productName: order.productName,
    productType: normalizeProductLevel(order.productLevel),
    orderAmount: order.actualAmount ?? order.amount,
    paymentDate: getOrderPaymentDate(order),
    orderType: order.orderType || order.dealScene,
    salesOwner: order.salesName || order.owner,
  };
}

function buildDeliveryFromOrder(order: Order): Delivery {
  const now = new Date().toISOString();
  const productType = normalizeProductLevel(order.productLevel);
  const stages = getTemplateByOrder(order).map((item) => item.title);
  return {
    id: createId('delivery'),
    orderId: order.id,
    orderNo: order.orderNo,
    customerId: order.customerId,
    customerName: order.customerName,
    productName: order.productName || productType,
    productType,
    currentStage: stages[0],
    stages,
    tasks: [],
    owner: order.successName || order.serviceName || '待分配',
    ownerId: order.successId || order.serviceId,
    salesOwner: order.salesName || order.owner,
    salesOwnerId: order.salesId,
    orderAmount: order.actualAmount ?? order.amount,
    paymentDate: getOrderPaymentDate(order),
    orderType: order.orderType || order.dealScene,
    status: STATUS_NOT_STARTED,
    priority: 'normal',
    progressPercent: 0,
    approvalStatus: '未提交',
    customerSuccessStatus: '未开始',
    createdAt: now,
    updatedAt: now,
  };
}

function readOrdersById(): Map<string, Order> {
  return new Map((getStorageData<Order[]>(STORAGE_KEYS.ORDERS) || []).map((order) => [order.id, order]));
}

function readCustomersById(): Map<string, Customer> {
  return new Map((getStorageData<Customer[]>(STORAGE_KEYS.CUSTOMERS) || []).map((customer) => [customer.id, customer]));
}

function isTerminalTask(task: DeliveryTask): boolean {
  return task.status === TASK_DONE || Boolean(task.completedAt);
}

function getProgressPercent(tasks: DeliveryTask[]): number {
  if (!tasks.length) return 0;
  const completed = tasks.filter(isTerminalTask).length;
  return Math.round((completed / tasks.length) * 100);
}

function makeStageTasks(delivery: Delivery, template: DeliveryStepTemplate[], currentStage: string): DeliveryTask[] {
  const taskByTitle = new Map((delivery.tasks || []).map((task) => [task.title, task]));
  const stages = template.map((item) => item.title);
  const fallbackCurrentIndex = Math.max(0, stages.indexOf(currentStage));

  const tasks = template.map((step, index) => {
    const existing = taskByTitle.get(step.title);
    const existingStatus = existing?.status === '已跳过' ? TASK_DONE : existing?.status;
    const status: DeliveryTaskStatus | string = existingStatus === TASK_DONE
      ? existingStatus
      : index < fallbackCurrentIndex
        ? TASK_DONE
        : index === fallbackCurrentIndex
          ? TASK_DOING
          : TASK_PENDING;

    return {
      id: existing?.id || `task-${delivery.id}-${index}`,
      title: step.title,
      description: existing?.description || step.description,
      assigneeId: existing?.assigneeId,
      assigneeName: existing?.assigneeName || delivery.owner,
      dueDate: existing?.dueDate,
      completedAt: status === TASK_DONE ? existing?.completedAt || delivery.updatedAt : existing?.completedAt,
      completedBy: existing?.completedBy,
      isOptional: step.isOptional || existing?.isOptional,
      attachments: existing?.attachments || [],
      resultFields: existing?.resultFields || {},
      records: existing?.records || [],
      updatedAt: existing?.updatedAt,
      status,
    };
  });

  const firstOpenIndex = tasks.findIndex((task) => !isTerminalTask(task));
  if (firstOpenIndex >= 0) {
    tasks.forEach((task, index) => {
      if (index === firstOpenIndex && task.status === TASK_PENDING) task.status = TASK_DOING;
      if (index > firstOpenIndex && task.status === TASK_DOING) task.status = TASK_PENDING;
    });
  }

  return tasks;
}

function buildSnapshot(delivery: Delivery, order?: Order, customer?: Customer) {
  return {
    customer: {
      id: delivery.customerId || order?.customerId || customer?.id || '',
      name: delivery.customerName || order?.customerName || customer?.name || '',
      company: customer?.company,
      phone: customer?.phone,
      wechat: customer?.wechat,
      industry: customer?.industry,
      city: customer?.city,
      remark: customer?.remark,
    },
    order: {
      id: delivery.orderId || order?.id || '',
      orderNo: delivery.orderNo || order?.orderNo || '',
      productName: delivery.productName || order?.productName,
      productLevel: normalizeProductLevel(delivery.productType || order?.productLevel),
      orderType: delivery.orderType || order?.orderType || order?.dealScene,
      amount: order?.amount,
      actualAmount: order?.actualAmount,
      paymentDate: delivery.paymentDate || getOrderPaymentDate(order),
      salesOwner: delivery.salesOwner || order?.salesName || order?.owner,
      notes: order?.notes,
    },
  };
}

function makeMaterialItems(delivery: Delivery, order?: Order, customer?: Customer) {
  const existingMap = new Map((delivery.materialItems || []).map((item) => [item.key, item]));
  const brandName = existingMap.get('brandName')?.value || customer?.company || customer?.name || delivery.customerName;
  const companyName = existingMap.get('companyName')?.value || customer?.company;

  const defaults = [
    { key: 'brandName', label: '品牌名', value: brandName },
    { key: 'companyName', label: '公司名', value: companyName },
    { key: 'domain', label: '域名', value: existingMap.get('domain')?.value },
    { key: 'logo', label: 'logo', value: existingMap.get('logo')?.value },
  ];

  return defaults.map((item) => {
    const existing = existingMap.get(item.key);
    const value = existing?.value || item.value;
    return {
      key: item.key,
      label: item.label,
      value,
      status: existing?.status || (value ? '已提供' : '缺失'),
      attachments: existing?.attachments || [],
      remark: existing?.remark,
    };
  });
}

function isPastDate(date?: string): boolean {
  if (!date) return false;
  const time = new Date(date).getTime();
  if (!Number.isFinite(time)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return time < today.getTime();
}

function hasOpenException(delivery: Delivery): boolean {
  return (delivery.exceptions || []).some((item) => item.status !== '已解除');
}

function deriveStatus(delivery: Delivery, stages: string[], tasks: DeliveryTask[]): Exclude<DeliveryOverallStatus, '全部'> {
  const currentIndex = stages.indexOf(delivery.currentStage);
  const progress = getProgressPercent(tasks);
  if (hasOpenException(delivery) || delivery.status === STATUS_BLOCKED || delivery.blockedReason) return STATUS_BLOCKED;
  if (delivery.approvalStatus === '已确认' || delivery.status === STATUS_COMPLETED || delivery.actualCompletedAt) return STATUS_COMPLETED;
  if (progress === 100 || delivery.approvalStatus === '待主管确认') return STATUS_PENDING_ACCEPTANCE;
  if (isPastDate(delivery.plannedCompletedAt)) return STATUS_OVERDUE;
  if (currentIndex <= 0 && progress === 0) return STATUS_NOT_STARTED;
  return STATUS_IN_PROGRESS;
}

function normalizeDelivery(delivery: Delivery, ordersById: Map<string, Order>, customersById: Map<string, Customer>): Delivery {
  const order = ordersById.get(delivery.orderId);
  const customer = customersById.get(delivery.customerId || order?.customerId || '');
  const productType = normalizeProductLevel(delivery.productType || order?.productLevel);
  const template = getTemplateByDelivery(delivery, order);
  const stages = template.map((item) => item.title);
  const existingCurrentStage = stages.includes(delivery.currentStage) ? delivery.currentStage : undefined;
  const firstOpenStage = delivery.tasks?.find((task) => !isTerminalTask(task) && stages.includes(task.title))?.title;
  const currentStage = existingCurrentStage || firstOpenStage || stages[0] || '';
  const tasks = makeStageTasks({ ...delivery, productType, currentStage }, template, currentStage);
  const progressPercent = getProgressPercent(tasks);
  const snapshot = delivery.snapshot || buildSnapshot({ ...delivery, productType }, order, customer);
  const materialItems = makeMaterialItems({ ...delivery, productType }, order, customer);
  const status = deriveStatus({ ...delivery, currentStage, productType, progressPercent }, stages, tasks);

  return {
    ...delivery,
    orderNo: delivery.orderNo || order?.orderNo || '',
    customerId: delivery.customerId || order?.customerId || '',
    customerName: delivery.customerName || order?.customerName || customer?.name || '',
    productName: delivery.productName || order?.productName || snapshot.order.productName || productType,
    productType,
    currentStage,
    stages,
    tasks,
    owner: delivery.owner || order?.successName || order?.serviceName || '待分配',
    ownerId: delivery.ownerId || order?.successId || order?.serviceId,
    salesOwner: delivery.salesOwner || order?.salesName || order?.owner,
    salesOwnerId: delivery.salesOwnerId || order?.salesId,
    orderAmount: delivery.orderAmount ?? order?.actualAmount ?? order?.amount,
    paymentDate: delivery.paymentDate || getOrderPaymentDate(order),
    orderType: delivery.orderType || order?.orderType || order?.dealScene,
    status,
    priority: delivery.priority || 'normal',
    progressPercent,
    materialItems,
    snapshot,
    exceptions: delivery.exceptions || [],
    approvalStatus: delivery.approvalStatus || (progressPercent === 100 ? '待主管确认' : '未提交'),
    customerSuccessStatus: delivery.customerSuccessStatus || (status === STATUS_COMPLETED ? '维护中' : '未开始'),
  };
}

function readDeliveries(): Delivery[] {
  ensureInit();
  const ordersById = readOrdersById();
  const customersById = readCustomersById();
  return (getStorageData<Delivery[]>(STORAGE_KEYS.DELIVERIES) || [])
    .map((delivery) => normalizeDelivery(delivery, ordersById, customersById))
    .filter((delivery) => delivery.stages.length > 0)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

function writeNormalizedDelivery(nextDelivery: Delivery): Delivery {
  const deliveries = getStorageData<Delivery[]>(STORAGE_KEYS.DELIVERIES) || [];
  const index = deliveries.findIndex((item) => item.id === nextDelivery.id);
  if (index >= 0) deliveries[index] = nextDelivery;
  setStorageData(STORAGE_KEYS.DELIVERIES, deliveries);
  const normalized = normalizeDelivery(nextDelivery, readOrdersById(), readCustomersById());
  return normalized;
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
  if (filters?.productType) filtered = filtered.filter((item) => item.productType === normalizeProductLevel(filters.productType));
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
      || (item.snapshot?.customer.company || '').toLowerCase().includes(q)
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
  return createSuccessResponse(readDeliveries().find((item) => item.id === id) || null);
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

async function fetchCreatableDeliveryOrders(search = ''): Promise<ApiResponse<DeliveryCreatableOrderSummary[]>> {
  ensureInit();
  await delay(120);
  const deliveries = getStorageData<Delivery[]>(STORAGE_KEYS.DELIVERIES) || [];
  const deliveryOrderIds = new Set(deliveries.map((item) => item.orderId));
  const deliveryIds = new Set(deliveries.map((item) => item.id));
  const keyword = search.trim().toLowerCase();
  const orders = (getStorageData<Order[]>(STORAGE_KEYS.ORDERS) || [])
    .filter((order) => order.status === '已确认')
    .filter((order) => order.status !== '已取消')
    .filter((order) => getTemplateByOrder(order).length > 0)
    .filter((order) => !deliveryOrderIds.has(order.id) && (!order.deliveryId || !deliveryIds.has(order.deliveryId)))
    .filter((order) => {
      if (!keyword) return true;
      return [
        order.orderNo,
        order.customerName,
        order.productName,
        order.productLevel,
        order.salesName,
        order.owner,
      ].some((value) => String(value || '').toLowerCase().includes(keyword));
    })
    .sort((a, b) => new Date(getOrderPaymentDate(b) || b.createdAt).getTime() - new Date(getOrderPaymentDate(a) || a.createdAt).getTime())
    .slice(0, 80);

  return createSuccessResponse(orders.map(toCreatableOrderSummary));
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
  await delay(160);
  const normalized = readDeliveries().find((item) => item.id === id);
  if (!normalized) return createSuccessResponse(null);

  const currentIndex = normalized.stages.indexOf(normalized.currentStage);
  const targetIndex = normalized.stages.indexOf(targetStage);
  if (targetIndex === -1) return createSuccessResponse(null);
  if (targetIndex !== currentIndex + 1) {
    return createErrorResponse('交付步骤只能按顺序推进');
  }

  const currentTask = normalized.tasks[currentIndex];
  if (!currentTask) return createSuccessResponse(null);
  return updateDeliveryTask(id, currentTask.id, { status: TASK_DONE });
}

async function revertDeliveryStage(id: string): Promise<ApiResponse<Delivery | null>> {
  ensureInit();
  await delay(160);
  const deliveries = getStorageData<Delivery[]>(STORAGE_KEYS.DELIVERIES) || [];
  const deliveryIndex = deliveries.findIndex((item) => item.id === id);
  if (deliveryIndex === -1) return createSuccessResponse(null);

  const normalized = readDeliveries().find((item) => item.id === id);
  if (!normalized) return createSuccessResponse(null);
  if (normalized.approvalStatus === '已确认' || normalized.status === STATUS_COMPLETED) {
    return createErrorResponse('交付已确认完成，不能返回上一步');
  }

  const currentIndex = normalized.tasks.findIndex((task) => task.status === TASK_DOING);
  if (currentIndex <= 0) {
    return createErrorResponse(currentIndex === 0 ? '当前已经是第一步' : '当前没有可回退的步骤');
  }

  const now = new Date().toISOString();
  const previousIndex = currentIndex - 1;
  const nextTasks = normalized.tasks.map((task, index) => {
    if (index < previousIndex) return { ...task };
    if (index === previousIndex) {
      return {
        ...task,
        status: TASK_DOING,
        completedAt: undefined,
        completedBy: undefined,
        skippedAt: undefined,
        skipReason: undefined,
        updatedAt: now,
      };
    }
    return {
      ...task,
      status: TASK_PENDING,
      completedAt: undefined,
      completedBy: undefined,
      skippedAt: undefined,
      skipReason: undefined,
      updatedAt: now,
    };
  });

  const nextDelivery: Delivery = {
    ...deliveries[deliveryIndex],
    ...normalized,
    tasks: nextTasks,
    currentStage: normalized.stages[previousIndex],
    progressPercent: getProgressPercent(nextTasks),
    approvalStatus: '未提交',
    actualCompletedAt: undefined,
    supervisorConfirmedBy: undefined,
    supervisorConfirmedAt: undefined,
    supervisorNotes: undefined,
    updatedAt: now,
  };
  nextDelivery.status = deriveStatus(nextDelivery, nextDelivery.stages, nextTasks);

  deliveries[deliveryIndex] = nextDelivery;
  setStorageData(STORAGE_KEYS.DELIVERIES, deliveries);
  return createSuccessResponse(normalizeDelivery(nextDelivery, readOrdersById(), readCustomersById()));
}

async function updateDelivery(id: string, data: Partial<Delivery>): Promise<ApiResponse<Delivery | null>> {
  ensureInit();
  await delay(160);
  const deliveries = getStorageData<Delivery[]>(STORAGE_KEYS.DELIVERIES) || [];
  const index = deliveries.findIndex((item) => item.id === id);
  if (index === -1) return createSuccessResponse(null);
  const next = { ...deliveries[index], ...data, updatedAt: new Date().toISOString() };
  deliveries[index] = next;
  setStorageData(STORAGE_KEYS.DELIVERIES, deliveries);
  return fetchDeliveryById(id);
}

async function createDeliveryFromOrder(orderId: string): Promise<ApiResponse<Delivery | null>> {
  ensureInit();
  await delay(160);
  const deliveries = getStorageData<Delivery[]>(STORAGE_KEYS.DELIVERIES) || [];
  if (deliveries.some((item) => item.orderId === orderId)) return createErrorResponse('该订单已经有交付单');

  const orders = getStorageData<Order[]>(STORAGE_KEYS.ORDERS) || [];
  const orderIndex = orders.findIndex((order) => order.id === orderId);
  if (orderIndex === -1) return createErrorResponse('订单不存在', 404);

  const order = orders[orderIndex];
  if (order.status !== '已确认') return createErrorResponse('只有已确认订单可以新建交付单');
  if (String(order.status) === '已取消') return createErrorResponse('已取消订单不能新建交付单');
  if (getTemplateByOrder(order).length === 0) {
    return createErrorResponse('该订单产品未配置交付阶段，无需创建交付单');
  }

  const delivery = buildDeliveryFromOrder(order);
  deliveries.unshift(delivery);
  setStorageData(STORAGE_KEYS.DELIVERIES, deliveries);
  orders[orderIndex] = { ...order, deliveryId: delivery.id, updatedAt: new Date().toISOString() };
  setStorageData(STORAGE_KEYS.ORDERS, orders);

  return createSuccessResponse(normalizeDelivery(delivery, readOrdersById(), readCustomersById()));
}

async function updateDeliveryTask(deliveryId: string, taskId: string, data: Partial<DeliveryTask>): Promise<ApiResponse<Delivery | null>> {
  ensureInit();
  await delay(160);
  const deliveries = getStorageData<Delivery[]>(STORAGE_KEYS.DELIVERIES) || [];
  const deliveryIndex = deliveries.findIndex((item) => item.id === deliveryId);
  if (deliveryIndex === -1) return createSuccessResponse(null);

  const normalized = readDeliveries().find((item) => item.id === deliveryId);
  if (!normalized) return createSuccessResponse(null);
  const taskIndex = normalized.tasks.findIndex((task) => task.id === taskId);
  if (taskIndex === -1) return createSuccessResponse(null);

  const firstOpenIndex = normalized.tasks.findIndex((task) => !isTerminalTask(task));
  if (firstOpenIndex !== -1 && taskIndex > firstOpenIndex) {
    return createErrorResponse('请先完成当前步骤，再处理后续步骤');
  }

  const now = new Date().toISOString();
  const currentTask = normalized.tasks[taskIndex];
  const nextStatus = data.status || currentTask.status;
  if (nextStatus === '已跳过') {
    return createErrorResponse('当前版本不支持跳过交付步骤');
  }

  const nextTasks = normalized.tasks.map((task, index) => {
    if (task.id !== taskId) return { ...task };
    return {
      ...task,
      ...data,
      completedAt: nextStatus === TASK_DONE ? data.completedAt || task.completedAt || now : data.completedAt,
      skippedAt: undefined,
      skipReason: undefined,
      updatedAt: now,
      status: nextStatus,
    };
  });

  const nextOpenIndex = nextTasks.findIndex((task) => !isTerminalTask(task));
  if (nextOpenIndex >= 0) {
    nextTasks.forEach((task, index) => {
      if (index === nextOpenIndex && task.status === TASK_PENDING) task.status = TASK_DOING;
      if (index > nextOpenIndex && task.status === TASK_DOING) task.status = TASK_PENDING;
    });
  }

  const allDone = nextOpenIndex === -1;
  const currentStage = allDone ? normalized.stages[normalized.stages.length - 1] : normalized.stages[nextOpenIndex];
  const progressPercent = getProgressPercent(nextTasks);
  const nextDelivery: Delivery = {
    ...deliveries[deliveryIndex],
    ...normalized,
    tasks: nextTasks,
    currentStage,
    progressPercent,
    approvalStatus: allDone ? '待主管确认' : normalized.approvalStatus || '未提交',
    updatedAt: now,
  };
  nextDelivery.status = deriveStatus(nextDelivery, nextDelivery.stages, nextTasks);

  deliveries[deliveryIndex] = nextDelivery;
  setStorageData(STORAGE_KEYS.DELIVERIES, deliveries);
  return createSuccessResponse(normalizeDelivery(nextDelivery, readOrdersById(), readCustomersById()));
}

async function addDeliveryAttachment(
  deliveryId: string,
  taskId: string,
  attachment: Omit<DeliveryAttachment, 'id' | 'uploadedAt'> & Partial<Pick<DeliveryAttachment, 'id' | 'uploadedAt'>>,
): Promise<ApiResponse<Delivery | null>> {
  const delivery = readDeliveries().find((item) => item.id === deliveryId);
  if (!delivery) return createSuccessResponse(null);
  const task = delivery.tasks.find((item) => item.id === taskId);
  if (!task) return createSuccessResponse(null);
  const nextAttachment: DeliveryAttachment = {
    ...attachment,
    id: attachment.id || createId('file'),
    uploadedAt: attachment.uploadedAt || new Date().toISOString(),
  };
  return updateDeliveryTask(deliveryId, taskId, {
    attachments: [...(task.attachments || []), nextAttachment],
  });
}

async function addDeliveryException(
  deliveryId: string,
  input: {
    type: DeliveryExceptionType;
    description: string;
    createdBy?: string;
    needsSupervisor?: boolean;
  },
): Promise<ApiResponse<Delivery | null>> {
  ensureInit();
  await delay(120);
  if (!input.description.trim()) return createErrorResponse('请填写异常说明');
  const normalized = readDeliveries().find((item) => item.id === deliveryId);
  if (!normalized) return createSuccessResponse(null);
  const now = new Date().toISOString();
  const exception: DeliveryException = {
    id: createId('delivery-exception'),
    type: input.type,
    description: input.description.trim(),
    status: '待主管处理',
    needsSupervisor: input.needsSupervisor ?? true,
    createdBy: input.createdBy || '系统管理员',
    createdAt: now,
  };
  return updateDelivery(deliveryId, {
    exceptions: [...(normalized.exceptions || []), exception],
    blockedReason: exception.description,
    status: STATUS_BLOCKED,
  });
}

async function resolveDeliveryException(
  deliveryId: string,
  exceptionId: string,
  input: { resolvedBy?: string; resolution: string },
): Promise<ApiResponse<Delivery | null>> {
  ensureInit();
  await delay(120);
  if (!input.resolution.trim()) return createErrorResponse('请填写异常处理结果');
  const normalized = readDeliveries().find((item) => item.id === deliveryId);
  if (!normalized) return createSuccessResponse(null);
  const now = new Date().toISOString();
  const exceptions = (normalized.exceptions || []).map((item) => (
    item.id === exceptionId
      ? {
          ...item,
          status: '已解除' as const,
          resolvedBy: input.resolvedBy || '客户成功主管',
          resolvedAt: now,
          resolution: input.resolution.trim(),
        }
      : item
  ));
  const hasOpen = exceptions.some((item) => item.status !== '已解除');
  return updateDelivery(deliveryId, {
    exceptions,
    blockedReason: hasOpen ? normalized.blockedReason : undefined,
    status: hasOpen ? STATUS_BLOCKED : undefined,
  });
}

async function confirmDeliveryCompletion(
  deliveryId: string,
  input: { confirmedBy?: string; notes?: string },
): Promise<ApiResponse<Delivery | null>> {
  ensureInit();
  await delay(160);
  const normalized = readDeliveries().find((item) => item.id === deliveryId);
  if (!normalized) return createSuccessResponse(null);
  if (hasOpenException(normalized)) return createErrorResponse('存在未解除异常，不能确认交付完成');
  const unfinished = normalized.tasks.find((task) => !isTerminalTask(task));
  if (unfinished) return createErrorResponse(`步骤「${unfinished.title}」未完成，不能主管确认`);

  const now = new Date().toISOString();
  return updateDelivery(deliveryId, {
    approvalStatus: '已确认',
    supervisorConfirmedBy: input.confirmedBy || '客户成功主管',
    supervisorConfirmedAt: now,
    supervisorNotes: input.notes?.trim(),
    actualCompletedAt: now,
    status: STATUS_COMPLETED,
    customerSuccessStatus: '维护中',
  });
}

async function deleteDelivery(id: string): Promise<ApiResponse<boolean>> {
  ensureInit();
  await delay(120);
  const deliveries = getStorageData<Delivery[]>(STORAGE_KEYS.DELIVERIES) || [];
  const target = deliveries.find((item) => item.id === id);
  if (!target) return createSuccessResponse(false);

  setStorageData(STORAGE_KEYS.DELIVERIES, deliveries.filter((item) => item.id !== id));

  const orders = getStorageData<Order[]>(STORAGE_KEYS.ORDERS) || [];
  const nextOrders = orders.map((order) => (
    order.deliveryId === id ? { ...order, deliveryId: undefined, updatedAt: new Date().toISOString() } : order
  ));
  setStorageData(STORAGE_KEYS.ORDERS, nextOrders);

  return createSuccessResponse(true);
}

export const deliveryApi = {
  fetchDeliveries,
  fetchDeliveryById,
  fetchDeliveryStagesByProductType,
  fetchDeliveriesByProductType,
  fetchCreatableDeliveryOrders,
  fetchDeliveryStats,
  advanceDeliveryStage,
  revertDeliveryStage,
  updateDelivery,
  createDeliveryFromOrder,
  updateDeliveryTask,
  addDeliveryAttachment,
  addDeliveryException,
  resolveDeliveryException,
  confirmDeliveryCompletion,
  deleteDelivery,
};
