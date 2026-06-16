import type { Order, OrderFilters, OrderStats } from '../types/order';
import type { Commission, CommissionRole } from '../types/commission';
import type { ApiResponse, PaginatedResponse } from './types';
import { createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { STORAGE_KEYS, DEFAULT_PAGE_SIZE } from '../shared/utils/constants';
import { initializeMockData } from './mock';
import { commissionRuleApi } from './commissionRuleApi';
import { deliveryApi } from './deliveryApi';
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
  };
  orders.unshift(newOrder);

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
  return createSuccessResponse(newOrder);
}

async function updateOrder(id: string, data: Partial<Order>): Promise<ApiResponse<Order | null>> {
  ensureInit();
  await delay(200);
  const orders = getStorageData<Order[]>(STORAGE_KEYS.ORDERS) || [];
  const idx = orders.findIndex((o) => o.id === id);
  if (idx === -1) return createSuccessResponse(null);
  orders[idx] = { ...orders[idx], ...data, updatedAt: new Date().toISOString() };
  setStorageData(STORAGE_KEYS.ORDERS, orders);
  return createSuccessResponse(orders[idx]);
}

async function deleteOrder(id: string): Promise<ApiResponse<boolean>> {
  ensureInit();
  await delay(150);
  const orders = getStorageData<Order[]>(STORAGE_KEYS.ORDERS) || [];
  setStorageData(STORAGE_KEYS.ORDERS, orders.filter((o) => o.id !== id));
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
