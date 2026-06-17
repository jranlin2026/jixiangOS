import type { Order, OrderFilters, OrderStats } from '../types/order';
import type { Customer } from '../types/customer';
import type { Commission, CommissionRole } from '../types/commission';
import type { ApiResponse, PaginatedResponse } from './types';
import { createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { STORAGE_KEYS, DEFAULT_PAGE_SIZE } from '../shared/utils/constants';
import { initializeMockData } from './mock';
import { commissionRuleApi } from './commissionRuleApi';
import { deliveryApi } from './deliveryApi';
import { syncLeadLifecycleByCustomerName, syncOpportunityRefundedByOrderId } from './lifecycleSync';
import { v4 as uuidv4 } from 'uuid';

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

/** 角色 → 从订单中取人员姓名 */
function getPersonByRole(order: Order, role: CommissionRole): string {
  switch (role) {
    case '销售': return order.salesName || order.owner;
    case '线索': return order.resourceOwnership === '个人资源' || order.sourceType === '转介绍' ? order.owner : '系统分配';
    case '客户成功': return order.successName || '待分配';
    case '售后': return order.serviceName || '待分配';
    case '招商主管': return '待分配';
    case '销售主管': return '待分配';
    default: return order.owner;
  }
}

function getPrimaryPaymentDate(order: Order): string {
  return order.payments?.[0]?.paidAt || order.createdAt;
}

function syncCustomerOrderStats(order: Order, allOrders: Order[]): void {
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
  const shouldAppendMilestone = relatedOrders.some((item) => item.id === order.id)
    && !existingGrowthPath.some((item) => item.orderId === order.id || item.orderNo === order.orderNo);
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

  customers[customerIdx] = {
    ...customer,
    productLevel: latestOrder.productLevel,
    orderCount: relatedOrders.length,
    totalSpent: relatedOrders.reduce((sum, item) => sum + (Number(item.actualAmount) || 0), 0),
    growthPath: nextGrowthPath,
    updatedAt: new Date().toISOString(),
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

async function fetchOrders(filters?: OrderFilters): Promise<ApiResponse<PaginatedResponse<Order>>> {
  ensureInit();
  await delay(200);
  const all = getStorageData<Order[]>(STORAGE_KEYS.ORDERS) || [];
  let filtered = [...all];

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
  const orders = getStorageData<Order[]>(STORAGE_KEYS.ORDERS) || [];
  return createSuccessResponse(orders.find((o) => o.id === id) || null);
}

async function fetchOrderStats(): Promise<ApiResponse<OrderStats>> {
  ensureInit();
  await delay(200);
  const orders = getStorageData<Order[]>(STORAGE_KEYS.ORDERS) || [];
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
  const orders = getStorageData<Order[]>(STORAGE_KEYS.ORDERS) || [];
  const now = new Date().toISOString();
  const orderNo = `ORD-${now.slice(0, 7).replace('-', '')}-${String(orders.length + 1).padStart(4, '0')}`;

  const newOrder: Order = {
    ...data,
    id: `order-${uuidv4().slice(0, 8)}`,
    orderNo,
    createdAt: now,
    updatedAt: now,
    changeHistory: [{
      id: `hist-${uuidv4().slice(0, 8)}`,
      action: 'create',
      operator: data.owner || '系统',
      changedAt: now,
      summary: '创建订单',
    }],
  };
  orders.unshift(newOrder);
  syncCustomerOrderStats(newOrder, orders);

  // ===== 多角色自动分佣引擎 =====
  // 根据订单制度字段匹配所有适用规则
  const calcRes = await commissionRuleApi.calculateCommissionsForOrder(newOrder);

  if (calcRes.code === 0 && calcRes.data.length > 0) {
    commissionRuleApi.clawbackBaseCommissions(newOrder, calcRes.data);
    const commissions = getStorageData<Commission[]>(STORAGE_KEYS.COMMISSIONS) || [];

    for (const calc of calcRes.data) {
      const personName = calc.ownerOverride || getPersonByRole(newOrder, calc.role);
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
        role: calc.role,
        owner: personName,
        department: calc.departmentOverride || ROLE_DEPARTMENT_MAP[calc.role],
        status: calc.status,
        commissionRuleId: calc.ruleId,
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
    tasks: [],
    owner: newOrder.owner,
    createdAt: now,
    updatedAt: now,
  });
  setStorageData(STORAGE_KEYS.DELIVERIES, deliveries);

  setStorageData(STORAGE_KEYS.ORDERS, orders);
  syncLeadLifecycleByCustomerName(newOrder.customerName, '已转订单', { orderId: newOrder.id });
  return createSuccessResponse(newOrder);
}

async function updateOrder(id: string, data: Partial<Order>): Promise<ApiResponse<Order | null>> {
  ensureInit();
  await delay(200);
  const orders = getStorageData<Order[]>(STORAGE_KEYS.ORDERS) || [];
  const idx = orders.findIndex((o) => o.id === id);
  if (idx === -1) return createSuccessResponse(null);
  const now = new Date().toISOString();
  const existing = orders[idx];
  const changes = buildOrderChanges(existing, data);
  const history = existing.changeHistory || [];
  orders[idx] = {
    ...existing,
    ...data,
    changeHistory: changes.length > 0
      ? [{
        id: `hist-${uuidv4().slice(0, 8)}`,
        action: 'update',
        operator: data.owner || existing.owner || '系统',
        changedAt: now,
        summary: `修改了 ${changes.map((item) => item.label).join('、')}`,
        changes,
      }, ...history]
      : history,
    updatedAt: now,
  };
  setStorageData(STORAGE_KEYS.ORDERS, orders);
  syncCustomerOrderStats(orders[idx], orders);
  if (orders[idx].refundStatus === '退款已完成' || orders[idx].status === '已退款') {
    syncLeadLifecycleByCustomerName(orders[idx].customerName, '已退款', { orderId: orders[idx].id });
    syncOpportunityRefundedByOrderId(orders[idx].id);
  } else {
    syncLeadLifecycleByCustomerName(orders[idx].customerName, '已转订单', { orderId: orders[idx].id });
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
