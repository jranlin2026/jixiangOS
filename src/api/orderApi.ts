import type { Order, OrderFilters, OrderStats } from '../types/order';
import type { Customer } from '../types/customer';
import type { Commission, CommissionRole } from '../types/commission';
import type { ApiResponse, PaginatedResponse } from './types';
import { createErrorResponse, createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { STORAGE_KEYS, DEFAULT_PAGE_SIZE, normalizeResourceOwnership } from '../shared/utils/constants';
import { initializeMockData } from './mock';
import { commissionRuleApi } from './commissionRuleApi';
import { deliveryApi } from './deliveryApi';
import { syncLifecycleByOrder, syncOpportunityRefundedByOrderId } from './lifecycleSync';
import { v4 as uuidv4 } from 'uuid';
import { getCurrentOperatorName, SYSTEM_OPERATOR } from '../shared/utils/currentOperator';
import { filterVisibleOrders } from '../shared/utils/dataVisibility';

function ensureInit(): void {
  initializeMockData();
}

/** 角色 → 部门映射（Mock） */
const ROLE_DEPARTMENT_MAP: Record<CommissionRole, string> = {
  '销售': '销售部',
  '线索': '市场部',
  '客户成功': '客户成功部',
  '售后': '售后服务部',
  '招商主管': '招商部',
  '销售主管': '销售部',
};

function getPrimaryPaymentDate(order: Order): string {
  return order.payments?.[0]?.paidAt || order.createdAt;
}

function normalizeOrder(order: Order): Order {
  return {
    ...order,
    resourceOwnership: normalizeResourceOwnership(order.resourceOwnership || order.sourceType),
  };
}

function enrichOrderDataFromCustomer(data: Omit<Order, 'id' | 'createdAt' | 'updatedAt' | 'orderNo'>): Omit<Order, 'id' | 'createdAt' | 'updatedAt' | 'orderNo'> {
  if (!data.customerId) return data;
  const customers = getStorageData<Customer[]>(STORAGE_KEYS.CUSTOMERS) || [];
  const customer = customers.find((item) => item.id === data.customerId);
  if (!customer) return data;
  return {
    ...data,
    sourceType: customer.leadSource || data.sourceType,
    leadSource: customer.leadSource || data.leadSource,
    leadInputBy: customer.leadInputBy || data.leadInputBy,
    leadContributorId: customer.leadContributorId || data.leadContributorId,
    leadContributorName: customer.leadContributorName || data.leadContributorName,
    resourceOwnership: normalizeResourceOwnership(customer.sourceType || data.resourceOwnership || data.sourceType),
  };
}

function validateOrderAttribution(data: Pick<Order, 'resourceOwnership' | 'sourceType' | 'leadContributorId' | 'leadContributorName'>): string | null {
  if (normalizeResourceOwnership(data.resourceOwnership || data.sourceType) === '个人资源' && !data.leadContributorId && !data.leadContributorName) {
    return '个人资源必须填写线索贡献人';
  }
  return null;
}

function syncCustomerOrderStats(order: Order, allOrders: Order[], operator = SYSTEM_OPERATOR): void {
  const customers = getStorageData<Customer[]>(STORAGE_KEYS.CUSTOMERS) || [];
  const customerIdx = customers.findIndex(
    (customer) => customer.id === order.customerId
      || customer.company === order.customerName
      || customer.name === order.customerName,
  );

  if (customerIdx === -1) return;

  const customer = customers[customerIdx];
  const relatedOrders = allOrders.filter(
    (item) => item.customerId === customer.id
      || item.customerName === customer.company
      || item.customerName === customer.name,
  );
  const latestOrder = relatedOrders
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] || order;
  const existingGrowthPath = customer.growthPath || [];
  const existingActivities = customer.activityRecords || [];
  const shouldAppendMilestone = relatedOrders.some((item) => item.id === order.id)
    && !existingGrowthPath.some((item) => item.orderId === order.id || item.orderNo === order.orderNo);
  const hasOrderActivity = existingActivities.some((item) => item.relatedType === 'order' && item.relatedId === order.id && item.type === 'order');
  const hasRefundActivity = existingActivities.some((item) => item.relatedType === 'order' && item.relatedId === order.id && item.type === 'refund');
  const nextGrowthPath = shouldAppendMilestone
    ? [
      ...existingGrowthPath,
      {
        id: `milestone-${uuidv4().slice(0, 8)}`,
        date: getPrimaryPaymentDate(order).slice(0, 10),
        title: `签约${order.productLevel}产品`,
        description: `订单${order.orderNo}，实付${Number(order.actualAmount || order.amount).toLocaleString('zh-CN')}元`,
        productLevel: order.productLevel,
        orderId: order.id,
        orderNo: order.orderNo,
      },
    ]
    : existingGrowthPath;
  const now = new Date().toISOString();
  const nextActivities = [
    ...((shouldAppendMilestone || !hasOrderActivity) ? [{
      id: `act-${uuidv4().slice(0, 8)}`,
      type: 'order' as const,
      title: `创建了订单 ${order.orderNo}`,
      content: `签约${order.productLevel}，实付${Number(order.actualAmount || order.amount).toLocaleString('zh-CN')}元`,
      operator,
      relatedId: order.id,
      relatedType: 'order' as const,
      createdAt: order.createdAt || now,
    }] : []),
    ...((order.refundStatus && order.refundStatus !== '无' && !hasRefundActivity) ? [{
      id: `act-${uuidv4().slice(0, 8)}`,
      type: 'refund' as const,
      title: `订单退款状态更新为 ${order.refundStatus}`,
      content: order.refundReason || undefined,
      operator,
      relatedId: order.id,
      relatedType: 'order' as const,
      createdAt: now,
    }] : []),
    ...existingActivities,
  ];

  customers[customerIdx] = {
    ...customer,
    productLevel: latestOrder.productLevel,
    orderCount: relatedOrders.length,
    totalSpent: relatedOrders.reduce((sum, item) => sum + (Number(item.actualAmount) || 0), 0),
    growthPath: nextGrowthPath,
    activityRecords: nextActivities,
    updatedAt: now,
  };

  setStorageData(STORAGE_KEYS.CUSTOMERS, customers);
}

const ORDER_CHANGE_FIELDS: Array<{ field: keyof Order; label: string }> = [
  { field: 'customerId', label: '客户' },
  { field: 'customerName', label: '客户名称' },
  { field: 'productLevel', label: '产品等级/分类' },
  { field: 'orderType', label: '订单类型' },
  { field: 'amount', label: '订单金额' },
  { field: 'actualAmount', label: '实付金额' },
  { field: 'paymentMethod', label: '支付方式' },
  { field: 'status', label: '订单状态' },
  { field: 'refundStatus', label: '退款状态' },
  { field: 'owner', label: '销售负责人' },
  { field: 'leadInputBy', label: '线索贡献人' },
  { field: 'leadContributorName', label: '线索贡献人' },
  { field: 'sourceType', label: '来源类型' },
  { field: 'resourceOwnership', label: '资源归属' },
  { field: 'officialPaymentChannel', label: '官方收款渠道' },
  { field: 'isExternalTalentOrder', label: '外部达人成交' },
  { field: 'dealScene', label: '成交场景' },
  { field: 'proofStatus', label: '凭证状态' },
  { field: 'collaboratorName', label: '协同人员' },
  { field: 'collaboratorRole', label: '提成角色' },
  { field: 'collaboratorRatio', label: '协同比例' },
  { field: 'originalOrderId', label: '原始订单' },
  { field: 'performanceBaseAmount', label: '业绩核算基数' },
  { field: 'notes', label: '备注' },
  { field: 'payments', label: '付款记录' },
];

function formatPaymentChangeValue(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  if (!value.length) return null;

  return value.map((payment: any, index) => {
    const parts = [
      `第${index + 1}笔`,
      payment.amount !== undefined ? `金额:${payment.amount}` : '',
      payment.paymentMethod ? `方式:${payment.paymentMethod}` : '',
      payment.paidAt ? `日期:${String(payment.paidAt).slice(0, 10)}` : '',
      payment.paymentOrderNo ? `单号:${payment.paymentOrderNo}` : '',
      payment.voucherName ? `凭证:${payment.voucherName}` : '',
    ].filter(Boolean);
    return parts.join(' · ');
  }).join('；');
}

function normalizeChangeValue(value: unknown): string | number | boolean | null {
  if (value === undefined || value === '') return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value;
  const paymentValue = formatPaymentChangeValue(value);
  if (paymentValue) return paymentValue;
  return JSON.stringify(value);
}

function buildOrderChanges(before: Order, data: Partial<Order>) {
  return ORDER_CHANGE_FIELDS
    .filter(({ field }) => Object.prototype.hasOwnProperty.call(data, field))
    .map(({ field, label }) => ({
      field: String(field),
      label,
      oldValue: normalizeChangeValue(before[field]),
      newValue: normalizeChangeValue(data[field]),
    }))
    .filter((item) => item.oldValue !== item.newValue);
}

function syncCommissionRefundState(order: Order): void {
  if (!order.refundStatus || order.refundStatus === '无') return;

  const commissions = getStorageData<Commission[]>(STORAGE_KEYS.COMMISSIONS) || [];
  const isRefundDone = order.refundStatus === '退款已完成' || order.status === '已退款';
  const reason = isRefundDone
    ? '退款完成，取消未发放提成'
    : `订单退款流程中（${order.refundStatus}），冻结未发放提成`;
  let changed = false;

  const nextCommissions = commissions.map((commission) => {
    if (commission.orderId !== order.id || commission.status === '已发放') return commission;
    changed = true;
    return {
      ...commission,
      status: isRefundDone ? '已取消' as const : '待确认' as const,
      auditReason: reason,
      frozenReason: reason,
      updatedAt: new Date().toISOString(),
    };
  });

  if (changed) setStorageData(STORAGE_KEYS.COMMISSIONS, nextCommissions);
}

async function fetchOrders(filters?: OrderFilters): Promise<ApiResponse<PaginatedResponse<Order>>> {
  ensureInit();
  await delay(200);
  const raw = getStorageData<Order[]>(STORAGE_KEYS.ORDERS) || [];
  const all = raw.map(normalizeOrder);
  if (JSON.stringify(raw) !== JSON.stringify(all)) setStorageData(STORAGE_KEYS.ORDERS, all);
  let filtered = filterVisibleOrders(all);

  if (filters?.search) {
    const q = filters.search.toLowerCase();
    filtered = filtered.filter(
      (o) => o.orderNo.toLowerCase().includes(q) || o.customerName.toLowerCase().includes(q),
    );
  }
  if (filters?.customerId) {
    filtered = filtered.filter((o) => o.customerId === filters.customerId);
  }
  if (filters?.productLevel) {
    filtered = filtered.filter((o) => o.productLevel === filters.productLevel);
  }
  if (filters?.status) {
    filtered = filtered.filter((o) => o.status === filters.status);
  }
  if (filters?.owner) {
    filtered = filtered.filter((o) => o.owner === filters.owner);
  }
  if (filters?.orderType) {
    filtered = filtered.filter((o) => o.orderType === filters.orderType);
  }
  if (filters?.paymentMethod) {
    filtered = filtered.filter((o) => o.paymentMethod === filters.paymentMethod);
  }
  if (filters?.startDate) {
    filtered = filtered.filter((o) => o.createdAt >= filters.startDate!);
  }
  if (filters?.endDate) {
    filtered = filtered.filter((o) => o.createdAt <= filters.endDate!);
  }

  if (filters?.sortBy === 'paymentDate') {
    filtered.sort((a, b) => {
      const aTime = new Date(getPrimaryPaymentDate(a)).getTime();
      const bTime = new Date(getPrimaryPaymentDate(b)).getTime();
      return filters.sortDirection === 'asc' ? aTime - bTime : bTime - aTime;
    });
  } else if (filters?.sortBy === 'createdAt') {
    filtered.sort((a, b) => {
      const aTime = new Date(a.createdAt).getTime();
      const bTime = new Date(b.createdAt).getTime();
      return filters.sortDirection === 'asc' ? aTime - bTime : bTime - aTime;
    });
  }

  const page = filters?.page || 1;
  const pageSize = filters?.pageSize || DEFAULT_PAGE_SIZE;
  const total = filtered.length;
  const totalPages = Math.ceil(total / pageSize);
  const items = filtered.slice((page - 1) * pageSize, page * pageSize);

  return createSuccessResponse({ items, pagination: { page, pageSize, total, totalPages } });
}

async function fetchOrderById(id: string): Promise<ApiResponse<Order | null>> {
  ensureInit();
  await delay(150);
  const raw = getStorageData<Order[]>(STORAGE_KEYS.ORDERS) || [];
  const orders = raw.map(normalizeOrder);
  if (JSON.stringify(raw) !== JSON.stringify(orders)) setStorageData(STORAGE_KEYS.ORDERS, orders);
  return createSuccessResponse(filterVisibleOrders(orders).find((o) => o.id === id) || null);
}

async function fetchOrderStats(): Promise<ApiResponse<OrderStats>> {
  ensureInit();
  await delay(200);
  const orders = filterVisibleOrders((getStorageData<Order[]>(STORAGE_KEYS.ORDERS) || []).map(normalizeOrder));
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const todayOrders = orders.filter((o) => o.createdAt >= today);
  const monthOrders = orders.filter((o) => o.createdAt >= monthStart);
  const refundOrders = orders.filter((o) => o.refundStatus !== '无');
  const upgradeOrders = orders.filter(
    (o) => o.orderType === '升级' || o.orderType === '代理升单',
  );

  const stats: OrderStats = {
    todayAmount: todayOrders.reduce((s, o) => s + o.amount, 0),
    todayCount: todayOrders.length,
    monthAmount: monthOrders.reduce((s, o) => s + o.amount, 0),
    monthCount: monthOrders.length,
    refundCount: refundOrders.length,
    refundAmount: refundOrders.reduce((s, o) => s + (o.refundAmount || 0), 0),
    upgradeCount: upgradeOrders.length,
    upgradeAmount: upgradeOrders.reduce((s, o) => s + o.amount, 0),
  };

  return createSuccessResponse(stats);
}

async function createOrder(data: Omit<Order, 'id' | 'createdAt' | 'updatedAt' | 'orderNo'>): Promise<ApiResponse<Order>> {
  ensureInit();
  await delay(200);
  const orderData = enrichOrderDataFromCustomer(data);
  const validationError = validateOrderAttribution(orderData);
  if (validationError) return createErrorResponse(validationError);
  const orders = getStorageData<Order[]>(STORAGE_KEYS.ORDERS) || [];
  const now = new Date().toISOString();
  const operator = getCurrentOperatorName(orderData.owner);
  const orderNo = `ORD-${now.slice(0, 10).replace(/-/g, '')}-${String(orders.length + 1).padStart(4, '0')}`;

  const newOrder: Order = {
    ...orderData,
    id: `order-${uuidv4().slice(0, 8)}`,
    orderNo,
    resourceOwnership: normalizeResourceOwnership(orderData.resourceOwnership || orderData.sourceType),
    createdAt: now,
    updatedAt: now,
    changeHistory: [{
      id: `hist-${uuidv4().slice(0, 8)}`,
      action: 'create',
      operator,
      changedAt: now,
      summary: '创建订单',
    }],
  };
  orders.unshift(newOrder);
  syncCustomerOrderStats(newOrder, orders, operator);
  const commissionPaymentDate = newOrder.payments?.[0]?.paidAt || newOrder.createdAt;

  // ===== 多角色自动分佣引擎 =====
  // 根据订单制度字段匹配所有适用规则
  const calcRes = await commissionRuleApi.calculateCommissionsForOrder(newOrder);

  if (calcRes.code === 0) {
    commissionRuleApi.clawbackBaseCommissions(newOrder, calcRes.data);
    const commissions = getStorageData<Commission[]>(STORAGE_KEYS.COMMISSIONS) || [];

    for (const calc of calcRes.data) {
      const assignee = commissionRuleApi.resolveCommissionRoleAssignee(newOrder, calc.role);
      const resolvedPersonName = calc.ownerOverride || assignee.owner;
      const personName = calc.ownerOverride || commissionRuleApi.resolveCommissionRoleOwner(newOrder, calc.role) || '待分配';
      commissions.unshift({
        id: `comm-${uuidv4().slice(0, 8)}`,
        orderId: newOrder.id,
        orderNo: newOrder.orderNo,
        customerName: newOrder.customerName,
        productLevel: newOrder.productLevel,
        orderAmount: newOrder.actualAmount || newOrder.amount,
        commissionRate: calc.commissionRate,
        commissionAmount: calc.commissionAmount,
        performanceAmount: calc.performanceAmount,
        scene: calc.scene,
        resourceOwnership: calc.resourceOwnership,
        proofStatus: calc.proofStatus,
        calculationNote: calc.calculationNote,
        auditReason: calc.auditReason,
        evidenceRequired: calc.evidenceRequired,
        evidenceStatus: calc.evidenceStatus,
        formulaText: calc.formulaText,
        role: calc.role,
        owner: resolvedPersonName,
        ownerId: calc.ownerOverride ? undefined : assignee.ownerId,
        department: calc.departmentOverride || assignee.department || ROLE_DEPARTMENT_MAP[calc.role],
        departmentId: calc.departmentOverride ? undefined : assignee.departmentId,
        paymentDate: commissionPaymentDate,
        status: calc.status,
        commissionRuleId: calc.ruleId,
        sourceType: '自动规则',
        createdAt: now,
        updatedAt: now,
      });
    }

    if (calcRes.data.length === 0) {
      const salesAssignee = commissionRuleApi.resolveCommissionRoleAssignee(newOrder, '销售');
      commissions.unshift({
        id: `comm-${uuidv4().slice(0, 8)}`,
        orderId: newOrder.id,
        orderNo: newOrder.orderNo,
        customerName: newOrder.customerName,
        productLevel: newOrder.productLevel,
        orderAmount: newOrder.actualAmount || newOrder.amount,
        commissionRate: 0,
        commissionAmount: 0,
        performanceAmount: newOrder.performanceBaseAmount || newOrder.actualAmount || newOrder.amount,
        scene: newOrder.dealScene,
        resourceOwnership: newOrder.resourceOwnership,
        proofStatus: newOrder.proofStatus,
        calculationNote: '订单已付款，但当前规则配置未匹配到可用提成规则，需要财务检查产品等级、订单类型、成交场景、资源归属和收款渠道。',
        auditReason: '规则未命中',
        evidenceRequired: true,
        evidenceStatus: '已齐全',
        formulaText: '未匹配规则，暂不计算金额',
        role: '销售',
        owner: salesAssignee.owner || newOrder.salesName || newOrder.owner,
        ownerId: salesAssignee.ownerId,
        departmentId: salesAssignee.departmentId,
        paymentDate: commissionPaymentDate,
        department: ROLE_DEPARTMENT_MAP['销售'],
        status: '待确认',
        sourceType: '自动规则',
        createdAt: now,
        updatedAt: now,
      });
    }
    setStorageData(STORAGE_KEYS.COMMISSIONS, commissions);
  }

  // 自动创建交付
  const deliveries = getStorageData<any[]>(STORAGE_KEYS.DELIVERIES) || [];
  const stagesRes = await deliveryApi.fetchDeliveryStagesByProductType(data.productLevel);
  const stages = stagesRes.code === 0 && stagesRes.data.length
    ? stagesRes.data
    : ['合同签订', '需求确认', '系统部署', '验收完成'];

  deliveries.unshift({
    id: `delivery-${uuidv4().slice(0, 8)}`,
    orderId: newOrder.id,
    orderNo: newOrder.orderNo,
    customerId: newOrder.customerId,
    customerName: newOrder.customerName,
    productType: data.productLevel,
    currentStage: stages[0],
    stages,
    tasks: stages.map((stage: string, index: number) => ({
      id: `task-${uuidv4().slice(0, 8)}`,
      title: stage,
      description: `${stage}任务`,
      status: index === 0 ? '进行中' : '待开始',
      records: [],
    })),
    owner: '待分配',
    salesOwner: newOrder.salesName || newOrder.owner,
    salesOwnerId: newOrder.salesId,
    orderAmount: newOrder.actualAmount,
    paymentDate: newOrder.payments?.[0]?.paidAt || newOrder.createdAt,
    orderType: newOrder.orderType || newOrder.dealScene,
    status: '待开始',
    priority: 'normal',
    progressPercent: 0,
    createdAt: now,
    updatedAt: now,
  });
  setStorageData(STORAGE_KEYS.DELIVERIES, deliveries);

  setStorageData(STORAGE_KEYS.ORDERS, orders);
  syncLifecycleByOrder(newOrder, 'ordered');
  return createSuccessResponse(newOrder);
}

async function updateOrder(id: string, data: Partial<Order>): Promise<ApiResponse<Order | null>> {
  ensureInit();
  await delay(200);
  const orders = (getStorageData<Order[]>(STORAGE_KEYS.ORDERS) || []).map(normalizeOrder);
  const idx = orders.findIndex((o) => o.id === id);
  if (idx === -1) return createSuccessResponse(null);
  const now = new Date().toISOString();
  const existing = orders[idx];
  const changes = buildOrderChanges(existing, data);
  const history = existing.changeHistory || [];
  const operator = getCurrentOperatorName(existing.owner);
  orders[idx] = {
    ...existing,
    ...data,
    resourceOwnership: normalizeResourceOwnership(data.resourceOwnership || data.sourceType || existing.resourceOwnership || existing.sourceType),
    changeHistory: changes.length > 0
      ? [{
        id: `hist-${uuidv4().slice(0, 8)}`,
        action: 'update',
        operator,
        changedAt: now,
        summary: `修改了 ${changes.map((item) => item.label).join('、')}`,
        changes,
      }, ...history]
      : history,
    updatedAt: now,
  };
  setStorageData(STORAGE_KEYS.ORDERS, orders);
  syncCustomerOrderStats(orders[idx], orders, operator);
  syncCommissionRefundState(orders[idx]);
  if (orders[idx].refundStatus === '退款已完成' || orders[idx].status === '已退款') {
    syncLifecycleByOrder(orders[idx], 'refunded');
    syncOpportunityRefundedByOrderId(orders[idx].id);
  } else {
    syncLifecycleByOrder(orders[idx], 'ordered');
  }
  return createSuccessResponse(orders[idx]);
}

async function deleteOrder(id: string): Promise<ApiResponse<boolean>> {
  ensureInit();
  await delay(150);
  const orders = getStorageData<Order[]>(STORAGE_KEYS.ORDERS) || [];
  const target = orders.find((o) => o.id === id);
  const nextOrders = orders.filter((o) => o.id !== id);
  setStorageData(STORAGE_KEYS.ORDERS, nextOrders);
  if (target) syncCustomerOrderStats(target, nextOrders);
  return createSuccessResponse(true);
}

export const orderApi = {
  fetchOrders,
  fetchOrderById,
  fetchOrderStats,
  createOrder,
  updateOrder,
  deleteOrder,
};
