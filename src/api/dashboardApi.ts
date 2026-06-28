import type { Customer, CustomerActivityRecord } from '../types/customer';
import type { Lead } from '../types/lead';
import type { Order, OrderApplication } from '../types/order';
import type { RecoveryOrder } from '../types/recoveryOrder';
import type { Delivery } from '../types/delivery';
import type { Commission } from '../types/commission';
import type { Role } from '../types/role';
import type {
  BusinessCockpitData,
  CockpitRankingItem,
  DashboardDateRange,
  HomeActivityItem,
  HomeQuickAction,
  HomeTaskItem,
  HomeWorkbenchData,
} from '../types/dashboard';
import type { ApiResponse } from './types';
import { createSuccessResponse, delay } from './types';
import { initializeMockData } from './mock';
import { getStorageData } from './mock/storage';
import {
  LIFECYCLE_STATUS_CODES,
  ROUTES,
  STORAGE_KEYS,
  normalizeLifecycleStatusCode,
} from '../shared/utils/constants';
import {
  filterVisibleCustomers,
  filterVisibleLeads,
  filterVisibleOrders,
  getCurrentDataVisibilityScope,
} from '../shared/utils/dataVisibility';
import { hasPermission, PERMISSION_KEYS, resolveUserPermissions } from '../shared/utils/permissions';
import { formatCurrency } from '../shared/utils/formatters';

function ensureInit(): void {
  initializeMockData();
}

function readArray<T>(key: string): T[] {
  return getStorageData<T[]>(key) || [];
}

function dayStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toIso(date: Date): string {
  return date.toISOString();
}

function getRange(range?: DashboardDateRange): { start: string; end: string; label: string } {
  const now = new Date();
  const preset = range?.preset || 'month';
  if (preset === 'today') {
    const start = dayStart(now);
    return { start: toIso(start), end: toIso(now), label: '今日' };
  }
  if (preset === 'week') {
    const start = dayStart(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000));
    return { start: toIso(start), end: toIso(now), label: '近7天' };
  }
  if (preset === 'custom' && range?.startDate && range?.endDate) {
    return {
      start: `${range.startDate}T00:00:00.000Z`,
      end: `${range.endDate}T23:59:59.999Z`,
      label: `${range.startDate} 至 ${range.endDate}`,
    };
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start: toIso(start), end: toIso(now), label: '本月' };
}

function inRange(value: string | undefined, start: string, end: string): boolean {
  if (!value) return false;
  return value >= start && value <= end;
}

function orderPaymentDate(order: Order): string {
  return order.payments?.[0]?.paidAt || order.createdAt;
}

function scopeLabel(): string {
  const scope = getCurrentDataVisibilityScope();
  if (scope.unrestricted) return '全公司';
  if (scope.visibleUserNames.length > 1) return '本部门';
  return scope.currentUser?.name ? `${scope.currentUser.name}的数据` : '我的数据';
}

function filterApplications(applications: OrderApplication[]): OrderApplication[] {
  const scope = getCurrentDataVisibilityScope('orderApplications');
  if (scope.unrestricted) return applications;
  return applications.filter((item) => (
    scope.visibleUserNames.includes(item.applicantName)
    || scope.visibleUserIds.includes(item.applicantId || '')
  ));
}

function filterRecoveryOrders(orders: RecoveryOrder[]): RecoveryOrder[] {
  const scope = getCurrentDataVisibilityScope();
  if (scope.unrestricted) return orders;
  return orders.filter((item) => (
    scope.visibleUserNames.includes(item.createdByName)
    || scope.visibleUserNames.includes(item.recoveryUserName)
    || scope.visibleUserNames.includes(item.assistUserName || '')
    || scope.visibleUserIds.includes(item.createdBy)
    || scope.visibleUserIds.includes(item.recoveryUserId)
    || scope.visibleUserIds.includes(item.assistUserId || '')
  ));
}

function filterDeliveries(deliveries: Delivery[]): Delivery[] {
  const scope = getCurrentDataVisibilityScope();
  if (scope.unrestricted) return deliveries;
  return deliveries.filter((item) => (
    scope.visibleUserNames.includes(item.owner)
    || item.tasks.some((task) => scope.visibleUserNames.includes(task.assigneeName || '') || scope.visibleUserIds.includes(task.assigneeId || ''))
  ));
}

function filterCommissions(commissions: Commission[]): Commission[] {
  const scope = getCurrentDataVisibilityScope();
  if (scope.unrestricted) return commissions;
  return commissions.filter((item) => (
    scope.visibleUserNames.includes(item.owner)
    || scope.visibleUserIds.includes(item.ownerId || '')
  ));
}

function makeTask(id: string, title: string, count: number, path: string, tone: HomeTaskItem['tone'], description: string): HomeTaskItem {
  return { id, title, count, path, tone, description };
}

function pushIfAllowed(actions: HomeQuickAction[], permissionKey: string, action: HomeQuickAction): void {
  const scope = getCurrentDataVisibilityScope();
  const roles = readArray<Role>(STORAGE_KEYS.ROLES);
  const user = scope.currentUser
    ? {
      role: scope.currentUser.role,
      permissions: resolveUserPermissions(scope.currentUser, roles),
      isActive: scope.currentUser.isActive,
    }
    : null;
  if (!scope.currentUser || hasPermission(user, permissionKey)) actions.push(action);
}

function getRecentActivities(customers: Customer[], leads: Lead[], orders: Order[], applications: OrderApplication[]): HomeActivityItem[] {
  const customerActivities = customers.flatMap((customer) => (
    (customer.activityRecords || []).slice(0, 3).map((item: CustomerActivityRecord) => ({
      id: `${customer.id}-${item.id}`,
      title: item.title,
      content: item.content || customer.company || customer.name,
      module: '客户',
      path: ROUTES.CUSTOMERS,
      createdAt: item.createdAt,
    }))
  ));
  const leadActivities = leads.slice(0, 6).map((lead) => ({
    id: `lead-${lead.id}`,
    title: `${lead.name} ${lead.intakeStatus || '线索更新'}`,
    content: lead.company || lead.source || '线索资料',
    module: '线索',
    path: ROUTES.LEADS,
    createdAt: lead.updatedAt,
  }));
  const orderActivities = orders.slice(0, 6).map((order) => ({
    id: `order-${order.id}`,
    title: `${order.orderNo} ${order.status}`,
    content: `${order.customerName} / ${formatCurrency(order.actualAmount || order.amount)}`,
    module: '订单',
    path: ROUTES.ORDERS,
    createdAt: order.updatedAt,
  }));
  const applicationActivities = applications.slice(0, 6).map((application) => ({
    id: `application-${application.id}`,
    title: `${application.applicationNo} ${application.status}`,
    content: application.orderData.customerName,
    module: '订单审核',
    path: `${ROUTES.ORDERS}?tab=review`,
    createdAt: application.updatedAt,
  }));
  return [...customerActivities, ...leadActivities, ...orderActivities, ...applicationActivities]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8);
}

async function fetchHomeWorkbench(): Promise<ApiResponse<HomeWorkbenchData>> {
  ensureInit();
  await delay(100);
  const leads = filterVisibleLeads(readArray<Lead>(STORAGE_KEYS.LEADS));
  const customers = filterVisibleCustomers(readArray<Customer>(STORAGE_KEYS.CUSTOMERS));
  const orders = filterVisibleOrders(readArray<Order>(STORAGE_KEYS.ORDERS));
  const applications = filterApplications(readArray<OrderApplication>(STORAGE_KEYS.ORDER_APPLICATIONS));
  const recoveryOrders = filterRecoveryOrders(readArray<RecoveryOrder>(STORAGE_KEYS.RECOVERY_ORDERS));
  const deliveries = filterDeliveries(readArray<Delivery>(STORAGE_KEYS.DELIVERIES));
  const commissions = filterCommissions(readArray<Commission>(STORAGE_KEYS.COMMISSIONS));

  const pendingLeads = leads.filter((item) => normalizeLifecycleStatusCode(item.lifecycleStatusCode) === LIFECYCLE_STATUS_CODES.PENDING_FOLLOWUP);
  const followingCustomers = customers.filter((item) => normalizeLifecycleStatusCode(item.lifecycleStatusCode) === LIFECYCLE_STATUS_CODES.FOLLOWING);
  const returnedApplications = applications.filter((item) => item.status === '退回修改');
  const pendingApplications = applications.filter((item) => item.status === '待财务审核');
  const pendingRecoveryOrders = recoveryOrders.filter((item) => item.status === '待审核' || item.status === '待分账');
  const activeDeliveries = deliveries.filter((item) => item.tasks.some((task) => task.status === '待开始' || task.status === '进行中'));
  const pendingCommissions = commissions.filter((item) => item.status === '待确认' || item.owner === '待分配' || !item.ownerId);

  const quickActions: HomeQuickAction[] = [];
  pushIfAllowed(quickActions, PERMISSION_KEYS.LEADS, { id: 'lead', label: '新增线索', path: ROUTES.LEADS, icon: 'lead' });
  pushIfAllowed(quickActions, PERMISSION_KEYS.CUSTOMERS, { id: 'customer', label: '新增客户', path: ROUTES.CUSTOMERS, icon: 'customer' });
  pushIfAllowed(quickActions, PERMISSION_KEYS.ORDERS, { id: 'order', label: '提交订单申请', path: ROUTES.ORDERS, icon: 'order' });
  pushIfAllowed(quickActions, PERMISSION_KEYS.ORDERS, { id: 'review', label: '订单审核台', path: `${ROUTES.ORDERS}?tab=review`, icon: 'review' });
  pushIfAllowed(quickActions, PERMISSION_KEYS.FINANCE_SETTLEMENT, { id: 'commission', label: '分账处理', path: `${ROUTES.FINANCE}?tab=settlement`, icon: 'commission' });
  pushIfAllowed(quickActions, PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE, { id: 'recovery', label: '新建挽回订单', path: ROUTES.AFTER_SALES, icon: 'refund' });
  pushIfAllowed(quickActions, PERMISSION_KEYS.DELIVERY, { id: 'delivery', label: '交付推进', path: ROUTES.DELIVERY, icon: 'delivery' });
  pushIfAllowed(quickActions, PERMISSION_KEYS.AI_ASSISTANT, { id: 'ai', label: 'AI助手', path: ROUTES.AI_ASSISTANT, icon: 'ai' });

  const today = new Date();
  return createSuccessResponse({
    todayLabel: today.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }),
    scopeLabel: scopeLabel(),
    tasks: [
      makeTask('pending-leads', '待跟进线索', pendingLeads.length, ROUTES.LEADS, 'warning', '还没有开始跟进的线索'),
      makeTask('following-customers', '跟进中客户', followingCustomers.length, ROUTES.CUSTOMERS, 'primary', '需要持续推进的客户'),
      makeTask('returned-orders', '退回订单申请', returnedApplications.length, `${ROUTES.ORDERS}?tab=review`, 'error', '销售需要修改后重新提交'),
      makeTask('pending-review', '待审核订单', pendingApplications.length, `${ROUTES.ORDERS}?tab=review`, 'warning', '财务待处理的订单申请'),
      makeTask('pending-commission', '待处理分账', pendingCommissions.length, `${ROUTES.FINANCE}?tab=settlement`, 'info', '待确认或待分配的分账记录'),
      makeTask('pending-recovery', '售后挽回待处理', pendingRecoveryOrders.length, ROUTES.AFTER_SALES, 'warning', '待审核或待分账的售后挽回订单'),
      makeTask('delivery', '交付进行中', activeDeliveries.length, ROUTES.DELIVERY, 'primary', '未完成的交付单'),
    ],
    quickActions: quickActions.slice(0, 8),
    activities: getRecentActivities(customers, leads, orders, applications),
    personalMetrics: [
      { label: '可见线索', value: String(leads.length), tone: 'primary' },
      { label: '可见客户', value: String(customers.length), tone: 'success' },
      { label: '正式订单', value: String(orders.length), tone: 'info' },
      { label: '待办任务', value: String(pendingLeads.length + returnedApplications.length + pendingApplications.length + pendingCommissions.length + pendingRecoveryOrders.length), tone: 'warning' },
    ],
  });
}

function rankByName(items: Array<{ name?: string; amount?: number }>): CockpitRankingItem[] {
  const map = new Map<string, CockpitRankingItem>();
  items.forEach((item) => {
    const name = item.name || '未填写';
    const current = map.get(name) || { name, count: 0, amount: 0 };
    current.count += 1;
    current.amount += item.amount || 0;
    map.set(name, current);
  });
  return Array.from(map.values()).sort((a, b) => b.amount - a.amount || b.count - a.count).slice(0, 5);
}

async function fetchBusinessCockpit(range?: DashboardDateRange): Promise<ApiResponse<BusinessCockpitData>> {
  ensureInit();
  await delay(120);
  const { start, end, label } = getRange(range);
  const leads = filterVisibleLeads(readArray<Lead>(STORAGE_KEYS.LEADS)).filter((item) => inRange(item.createdAt, start, end));
  const customers = filterVisibleCustomers(readArray<Customer>(STORAGE_KEYS.CUSTOMERS)).filter((item) => inRange(item.createdAt, start, end));
  const applications = filterApplications(readArray<OrderApplication>(STORAGE_KEYS.ORDER_APPLICATIONS)).filter((item) => inRange(item.submittedAt, start, end));
  const orders = filterVisibleOrders(readArray<Order>(STORAGE_KEYS.ORDERS)).filter((item) => inRange(orderPaymentDate(item), start, end));
  const recoveryOrders = filterRecoveryOrders(readArray<RecoveryOrder>(STORAGE_KEYS.RECOVERY_ORDERS)).filter((item) => inRange(item.createdAt, start, end));
  const commissions = filterCommissions(readArray<Commission>(STORAGE_KEYS.COMMISSIONS)).filter((item) => inRange(item.paymentDate || item.createdAt, start, end));

  const orderAmount = orders.reduce((sum, item) => sum + (item.actualAmount || item.amount || 0), 0);
  const recoveryAmount = recoveryOrders.reduce((sum, item) => sum + (item.recoveryAmount || 0), 0);
  const reviewedOrders = applications.filter((item) => item.status === '已入库').length;
  const pendingApplications = applications.filter((item) => item.status === '待财务审核').length;
  const pendingCommissions = commissions.filter((item) => item.status === '待确认' || item.owner === '待分配' || !item.ownerId).length;
  const paidCommissions = commissions.filter((item) => item.status === '已发放').length;

  return createSuccessResponse({
    rangeLabel: label,
    scopeLabel: scopeLabel(),
    kpis: [
      { id: 'amount', label: '成交金额', value: formatCurrency(orderAmount), subValue: `${orders.length} 笔正式订单`, tone: 'primary' },
      { id: 'lead', label: '新增线索', value: String(leads.length), subValue: `${customers.length} 个新增客户`, tone: 'info' },
      { id: 'recovery', label: '挽回金额', value: formatCurrency(recoveryAmount), subValue: `${recoveryOrders.length} 笔售后挽回`, tone: 'success' },
      { id: 'review', label: '待审核订单', value: String(pendingApplications), subValue: '订单审核台待处理', tone: 'warning' },
      { id: 'commission', label: '待确认分账', value: String(pendingCommissions), subValue: `${paidCommissions} 条已发放`, tone: 'success' },
    ],
    funnel: [
      { id: 'lead', label: '线索入库', count: leads.length },
      { id: 'customer', label: '客户沉淀', count: customers.length },
      { id: 'application', label: '订单申请', count: applications.length },
      { id: 'order', label: '财务入库', count: reviewedOrders || orders.length, amount: orderAmount },
      { id: 'commission', label: '分账确认', count: commissions.filter((item) => item.status === '待发放' || item.status === '已发放').length },
    ],
    salesRanking: rankByName(orders.map((item) => ({ name: item.salesName || item.owner, amount: item.actualAmount || item.amount }))),
    contributorRanking: rankByName(orders.map((item) => ({ name: item.leadContributorName, amount: item.actualAmount || item.amount }))).filter((item) => item.name !== '未填写'),
    sourceConversion: rankByName(orders.map((item) => ({ name: item.leadSource || item.sourceType, amount: item.actualAmount || item.amount }))),
    productRevenue: rankByName(orders.map((item) => ({ name: item.productLevel, amount: item.actualAmount || item.amount }))),
    riskTasks: [
      { id: 'review', title: '待审核订单', count: pendingApplications, path: `${ROUTES.ORDERS}?tab=review`, tone: 'warning' },
      { id: 'commission', title: '待处理分账', count: pendingCommissions, path: `${ROUTES.FINANCE}?tab=settlement`, tone: 'info' },
      { id: 'recovery', title: '售后挽回待处理', count: recoveryOrders.filter((item) => item.status === '待审核' || item.status === '待分账').length, path: ROUTES.AFTER_SALES, tone: 'warning' },
      { id: 'returned', title: '退回订单申请', count: applications.filter((item) => item.status === '退回修改').length, path: `${ROUTES.ORDERS}?tab=review`, tone: 'error' },
    ],
  });
}

export const dashboardApi = {
  fetchHomeWorkbench,
  fetchBusinessCockpit,
};
