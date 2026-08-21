import type { PrismaClient } from '@prisma/client';
import { success, type ApiResponse } from '../api/response';
import {
  LIFECYCLE_STATUS_CODES,
  ROUTES,
  STORAGE_KEYS,
  normalizeLifecycleStatusCode,
} from '../../src/shared/utils/constants';
import {
  applyRecoveryCommissionBusinessTimes,
  isCommissionPendingHandling,
  isRecoveryCommission,
  selectCurrentCommissionRounds,
} from '../../src/shared/utils/commissionConfiguration';
import {
  buildDataVisibilityScopeForUser,
  type DataVisibilityScope,
} from '../../src/shared/utils/dataVisibility';
import {
  getUserRole,
  isSuperAdmin,
  PERMISSION_KEYS,
  canReceiveLead,
  roleHasPermission,
} from '../../src/shared/utils/permissions';
import { mapPrismaDepartment, mapPrismaRole, mapPrismaUser } from '../db/prismaMappers';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { Commission } from '../../src/types/commission';
import type { Customer } from '../../src/types/customer';
import type { CustomerTodo } from '../../src/types/customerTodo';
import type { FinanceTransaction } from '../../src/types/finance';
import type { Lead } from '../../src/types/lead';
import type { Order } from '../../src/types/order';
import type { OrderApplication } from '../../src/types/order';
import type { RecoveryOrder } from '../../src/types/recoveryOrder';
import type { Refund } from '../../src/types/refund';
import type {
  BusinessCockpitData,
  CockpitTrendPoint,
  DashboardDateRange,
} from '../../src/types/dashboard';
import {
  attributeFinanceTransactionsToOrders,
  createOrderPaymentReconciliationContext,
  reconcileOrderPayments,
} from './orderPaymentReconciliation';
import { buildCustomerBattleSnapshot } from '../../src/shared/utils/customerBattleState';

type BusinessCockpitPrisma = Pick<
  PrismaClient,
  'businessRecord' | 'leadRecord' | 'customerTodo' | 'user' | 'role' | 'department' | 'keyResult'
>;

export interface BusinessCockpitVisibility {
  unrestricted: boolean;
  visibleUserIds: string[];
  visibleUserNames: string[];
  canViewPublicPool?: boolean;
}

export interface BusinessCockpitQuery {
  startAt: string;
  endAt: string;
  visibility: BusinessCockpitVisibility;
  rankingUserIdByName?: Record<string, string>;
  visibilityByDomain?: Partial<Record<
    'orders' | 'recoveryOrders' | 'leads' | 'customers' | 'orderApplications',
    BusinessCockpitVisibility
  >>;
}

export interface BusinessCockpitRankingItem {
  userId?: string;
  name: string;
  amount: number;
  orderCount: number;
  paymentCount: number;
  assistCount?: number;
}

export interface BusinessCockpitSnapshot {
  range: { startAt: string; endAt: string };
  business: {
    formalOrderPaidAmount: number;
    formalOrderCount: number;
    formalPaymentCount: number;
    recoveryBusinessAmount: number;
    recoveryOrderCount: number;
  };
  salesRanking: BusinessCockpitRankingItem[];
  recoveryRanking: BusinessCockpitRankingItem[];
  trend: CockpitTrendPoint[];
  commissionHealth: {
    currentCommissionCount: number;
    pendingHandlingCount: number;
    pendingConfirmAmount: number;
    pendingPayAmount: number;
    paidAmount: number;
  };
  financeHealth: {
    formalOrderIncomeAmount: number;
    formalOrderAdjustmentAmount: number;
    formalOrderNetReceiptAmount: number;
    transactionCount: number;
    reconciliationIssueCount: number;
    reconciliationAmountIssueCount: number;
    reconciliationBusinessTimeIssueCount: number;
    reconciliationDifferenceAmount: number;
    reconciliationOrderIds: string[];
  };
  followUpHealth: {
    newLeadCount: number;
    followedLeadCount: number;
    pendingLeadCount: number;
    followingLeadCount: number;
    newCustomerCount: number;
    followedCustomerCount: number;
    pendingFollowUpCustomerCount: number;
    followingCustomerCount: number;
    pendingCustomerTodoCount: number;
    overdueCustomerTodoCount: number;
    completedCustomerTodoCount: number;
  };
  customerBattles: BusinessCockpitData['customerBattles'];
  customerBattleStages: BusinessCockpitData['customerBattleStages'];
  salesBattleProfiles: Array<{
    ownerId?: string;
    ownerName: string;
    customerCount: number;
    activeOpportunityCount: number;
    opportunityAmount: number;
    todayDueTodoCount: number;
    todayCompletedTodoCount: number;
    todayFollowUpCount: number;
    overdueCustomerCount: number;
    riskCustomerCount: number;
    missingNextActionCount: number;
    wonCount: number;
    lostCount: number;
    conversionRate: number;
    priorityCustomers: BusinessCockpitData['customerBattles'];
  }>;
  leadSources: Array<{ source: string; leadCount: number; followedCount: number; followRate: number; convertedCustomerCount: number; receiptAmount: number }>;
  orderHealth: {
    pendingReviewApplicationCount: number;
    returnedApplicationCount: number;
    approvedApplicationCount: number;
    pendingSettlementOrderCount: number;
    paymentlessConfirmedOrderCount: number;
  };
  refundHealth: {
    refundingOrderCount: number;
    refundedOrderCount: number;
    refundAmount: number;
  };
  dataQuality: {
    missingSalesIdentityPaymentCount: number;
    visibleLeadCount: number;
    newFollowedLeadCount: number;
  };
}

type BusinessRecordRow = { domain: string; recordId: string; data: unknown };
type BusinessCockpitSnapshotSource = {
  rows: BusinessRecordRow[];
  structuredLeadRows: Array<{ id: string; data: unknown }>;
  customerTodoRows: unknown[];
};

const MAX_RECONCILIATION_DRILLDOWN_ORDERS = 100;
const MANAGEMENT_DEPARTMENT_GROUPS: Array<{
  id: BusinessCockpitData['departmentStatuses'][number]['id'];
  name: string;
  matches: (departmentName: string) => boolean;
}> = [
  { id: 'sales', name: '销售部', matches: (name) => name.includes('销售') },
  { id: 'customer-success', name: '客户成功', matches: (name) => /客户成功|客户服务/.test(name) },
  { id: 'delivery', name: '售后/交付', matches: (name) => /售后|交付|技术/.test(name) },
  { id: 'academy', name: '商学院', matches: (name) => /商学|学院|培训|课程/.test(name) },
  { id: 'finance', name: '财务', matches: (name) => name.includes('财务') },
  { id: 'marketing', name: '市场/运营', matches: (name) => /市场|运营|增长/.test(name) },
];
const roundMoney = (value: number) => Number.isFinite(value)
  ? Math.round((value + Number.EPSILON) * 100) / 100
  : 0;
const finiteMoney = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? roundMoney(parsed) : 0;
};
const clean = (value: unknown) => String(value || '').trim();
const isPaymentRecord = (value: unknown): value is NonNullable<Order['payments']>[number] => Boolean(
  value && typeof value === 'object' && !Array.isArray(value),
);
const orderPayments = (order: Pick<Order, 'payments'>) => (
  Array.isArray(order.payments) ? order.payments.filter(isPaymentRecord) : []
);
const invalidPaymentStructure = (order: Pick<Order, 'payments'>) => (
  order.payments !== undefined
  && (!Array.isArray(order.payments) || order.payments.some((payment) => !isPaymentRecord(payment)))
);

function parseRecord<T extends object>(value: unknown): T | null {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as T : null;
  } catch {
    return null;
  }
}

function timestamp(value: unknown): number {
  const parsed = new Date(String(value || '')).getTime();
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function inRange(value: unknown, startAt: number, endAt: number): boolean {
  const time = timestamp(value);
  return Number.isFinite(time) && time >= startAt && time <= endAt;
}

function isLeadConversionInRange(customer: Customer, startAt: number, endAt: number): boolean {
  return (customer.activityRecords || []).some((record) => (
    record.type === 'create'
    && (record.relatedType === 'lead'
      || ['线索转为客户', '线索自动领取创建客户'].includes(record.title))
    && inRange(record.createdAt, startAt, endAt)
  ));
}

function isCustomerFollowInRange(customer: Customer, startAt: number, endAt: number): boolean {
  return (customer.activityRecords || []).some((record) => (
    record.type === 'follow'
    && record.title !== '历史最后跟进记录'
    && inRange(record.createdAt, startAt, endAt)
  ));
}

function visibleIdentity(
  id: unknown,
  name: unknown,
  visibility: BusinessCockpitVisibility,
): boolean {
  if (visibility.unrestricted) return true;
  const normalizedId = clean(id);
  if (normalizedId) return visibility.visibleUserIds.includes(normalizedId);
  const normalizedName = clean(name);
  return Boolean(normalizedName && visibility.visibleUserNames.includes(normalizedName));
}

function visibleOrder(order: Order, visibility: BusinessCockpitVisibility): boolean {
  return visibleIdentity(order.salesId, order.salesName || order.owner, visibility);
}

function visibleRecovery(order: RecoveryOrder, visibility: BusinessCockpitVisibility): boolean {
  if (visibility.unrestricted) return true;
  return [
    [order.recoveryUserId, order.recoveryUserName],
    [order.assistUserId, order.assistUserName],
    [order.createdBy, order.createdByName],
  ].some(([id, name]) => visibleIdentity(id, name, visibility));
}

function visibleCommission(commission: Commission, visibility: BusinessCockpitVisibility): boolean {
  return visibleIdentity(commission.ownerId, commission.owner, visibility);
}

function visibleLead(lead: Lead, visibility: BusinessCockpitVisibility): boolean {
  if (visibility.unrestricted) return true;
  const identities: Array<[unknown, unknown]> = [
    [lead.ownerId, lead.owner],
    [lead.assignedToId, lead.assignedTo],
    [lead.leadContributorId, lead.leadContributorName],
    [undefined, lead.inputBy],
  ];
  return identities.some(([id, name]) => visibleIdentity(id, name, visibility));
}

function visibleCustomer(customer: Customer, visibility: BusinessCockpitVisibility): boolean {
  if (visibility.unrestricted) return true;
  if (
    visibility.canViewPublicPool
    && normalizeLifecycleStatusCode(customer.lifecycleStatusCode) === LIFECYCLE_STATUS_CODES.PUBLIC_POOL
  ) return true;
  return [
    [customer.ownerId, customer.owner],
    [customer.leadContributorId, customer.leadContributorName],
  ].some(([id, name]) => visibleIdentity(id, name, visibility));
}

function visibleApplication(application: OrderApplication, visibility: BusinessCockpitVisibility): boolean {
  return visibleIdentity(application.applicantId, application.applicantName, visibility);
}

function rankingKey(userId: unknown, name: unknown): string {
  return clean(userId) || `name:${clean(name) || '未填写'}`;
}

function sortRanking(rows: BusinessCockpitRankingItem[]): BusinessCockpitRankingItem[] {
  return rows.sort((left, right) => (
    right.amount - left.amount
    || right.orderCount - left.orderCount
    || left.name.localeCompare(right.name, 'zh-CN')
  )).slice(0, 5);
}

function visibilityFor(
  query: BusinessCockpitQuery,
  domain: keyof NonNullable<BusinessCockpitQuery['visibilityByDomain']>,
): BusinessCockpitVisibility {
  return query.visibilityByDomain?.[domain] || query.visibility;
}

function normalizeTodo(row: unknown): CustomerTodo | null {
  if (!row || typeof row !== 'object') return null;
  const source = row as Record<string, unknown>;
  const rawStatus = clean(source.status).toLowerCase();
  const status = rawStatus === 'pending'
    ? 'pending'
    : rawStatus === 'completed'
      ? 'completed'
      : rawStatus === 'canceled' || rawStatus === 'cancelled'
        ? 'canceled'
        : undefined;
  if (!status || !clean(source.id) || !clean(source.customerId)) return null;
  const iso = (value: unknown): string | undefined => {
    const time = timestamp(value);
    return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
  };
  return {
    ...(source as unknown as CustomerTodo),
    id: clean(source.id),
    customerId: clean(source.customerId),
    status,
    dueAt: iso(source.dueAt) || '',
    completedAt: iso(source.completedAt),
    canceledAt: iso(source.canceledAt),
    createdAt: iso(source.createdAt) || '',
    updatedAt: iso(source.updatedAt) || '',
  };
}

function shanghaiDateKey(value: unknown): string | undefined {
  const time = timestamp(value);
  if (!Number.isFinite(time)) return undefined;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(time));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year && values.month && values.day
    ? `${values.year}-${values.month}-${values.day}`
    : undefined;
}

function shanghaiDateParts(value: Date): { year: number; month: number; day: number } {
  const key = shanghaiDateKey(value) || value.toISOString().slice(0, 10);
  const [year, month, day] = key.split('-').map(Number);
  return { year, month, day };
}

function resolveDateRange(
  range: DashboardDateRange,
  now: Date,
): { startAt: string; endAt: string; label: string } {
  const today = shanghaiDateKey(now) || now.toISOString().slice(0, 10);
  let startDate = today;
  let endDate = today;
  let label = '今日';
  if (range.preset === 'week') {
    const { year, month, day } = shanghaiDateParts(now);
    const currentDate = new Date(Date.UTC(year, month - 1, day));
    const weekday = currentDate.getUTCDay() || 7;
    currentDate.setUTCDate(currentDate.getUTCDate() - weekday + 1);
    startDate = currentDate.toISOString().slice(0, 10);
    label = '本周';
  } else if (range.preset === 'month') {
    startDate = `${today.slice(0, 7)}-01`;
    label = '本月';
  } else if (range.preset === 'custom') {
    startDate = clean(range.startDate) || today;
    endDate = clean(range.endDate) || startDate;
    label = `${startDate} 至 ${endDate}`;
  }
  const startAt = new Date(`${startDate}T00:00:00.000+08:00`).toISOString();
  const endAt = range.preset === 'custom'
    ? new Date(`${endDate}T23:59:59.999+08:00`).toISOString()
    : now.toISOString();
  return { startAt, endAt, label };
}

function previousComparableRange(
  range: DashboardDateRange,
  resolved: { startAt: string; endAt: string },
): { startAt: string; endAt: string } {
  const start = new Date(resolved.startAt);
  const end = new Date(resolved.endAt);
  if (range.preset === 'month') {
    const shiftShanghaiMonth = (value: Date) => {
      const local = new Date(value.getTime() + 8 * 60 * 60 * 1000);
      const year = local.getUTCFullYear();
      const month = local.getUTCMonth();
      const day = local.getUTCDate();
      const targetMonthLastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
      return new Date(Date.UTC(
        year,
        month - 1,
        Math.min(day, targetMonthLastDay),
        local.getUTCHours(),
        local.getUTCMinutes(),
        local.getUTCSeconds(),
        local.getUTCMilliseconds(),
      ) - 8 * 60 * 60 * 1000);
    };
    return { startAt: shiftShanghaiMonth(start).toISOString(), endAt: shiftShanghaiMonth(end).toISOString() };
  }
  const offset = range.preset === 'today'
    ? 24 * 60 * 60 * 1000
    : range.preset === 'week'
      ? 7 * 24 * 60 * 60 * 1000
      : end.getTime() - start.getTime() + 1;
  return {
    startAt: new Date(start.getTime() - offset).toISOString(),
    endAt: new Date(end.getTime() - offset).toISOString(),
  };
}

function toCockpitVisibility(scope: DataVisibilityScope): BusinessCockpitVisibility {
  return {
    unrestricted: scope.unrestricted,
    visibleUserIds: scope.visibleUserIds,
    visibleUserNames: scope.visibleUserNames,
    canViewPublicPool: scope.canViewPublicPool,
  };
}

type CockpitDomainScopes = Record<
  'orders' | 'recoveryOrders' | 'leads' | 'customers' | 'orderApplications',
  Pick<DataVisibilityScope, 'unrestricted' | 'dataScopeLevel' | 'canViewPublicPool'>
>;

export function resolveBusinessCockpitScopeLabel(scopes: CockpitDomainScopes): string {
  const labels = Object.values(scopes).map((scope) => {
    if (scope.unrestricted || scope.dataScopeLevel === 'all') return '全公司';
    if (scope.dataScopeLevel === 'self') return '我的数据';
    return '本部门';
  });
  if (scopes.customers.canViewPublicPool && !scopes.customers.unrestricted) {
    return '按业务权限范围';
  }
  return new Set(labels).size === 1 ? labels[0] : '按业务权限范围';
}

export function createBusinessCockpitService(
  prisma: BusinessCockpitPrisma,
  options: { now?: () => Date } = {},
) {
  const loadSnapshotSource = async (): Promise<BusinessCockpitSnapshotSource> => {
    const [storedRows, structuredLeadRows, customerTodoRows] = await Promise.all([
      prisma.businessRecord.findMany({
        where: { domain: { in: [
          STORAGE_KEYS.ORDERS,
          STORAGE_KEYS.RECOVERY_ORDERS,
          STORAGE_KEYS.COMMISSIONS,
          STORAGE_KEYS.FINANCE_TRANSACTIONS,
          STORAGE_KEYS.LEADS,
          STORAGE_KEYS.CUSTOMERS,
          STORAGE_KEYS.ORDER_APPLICATIONS,
          STORAGE_KEYS.REFUNDS,
        ] } },
      }),
      prisma.leadRecord.findMany({ select: { id: true, data: true } }),
      prisma.customerTodo.findMany(),
    ]);
    return {
      rows: storedRows as unknown as BusinessRecordRow[],
      structuredLeadRows: structuredLeadRows as Array<{ id: string; data: unknown }>,
      customerTodoRows,
    };
  };

  const getSnapshot = async (
    query: BusinessCockpitQuery,
    loadedSource?: BusinessCockpitSnapshotSource,
  ): Promise<ApiResponse<BusinessCockpitSnapshot>> => {
      const startAt = timestamp(query.startAt);
      const endAt = timestamp(query.endAt);
      const orderVisibility = visibilityFor(query, 'orders');
      const recoveryVisibility = visibilityFor(query, 'recoveryOrders');
      const leadVisibility = visibilityFor(query, 'leads');
      const customerVisibility = visibilityFor(query, 'customers');
      const applicationVisibility = visibilityFor(query, 'orderApplications');
      const source = loadedSource || await loadSnapshotSource();
      const { rows, structuredLeadRows } = source;
      const storedOrders = rows
        .filter((row) => row.domain === STORAGE_KEYS.ORDERS)
        .flatMap((row) => {
          const order = parseRecord<Order>(row.data);
          return order ? [{ ...order, id: row.recordId }] : [];
        });
      const allOrders = storedOrders.filter((order) => !order.deletedAt);
      const orders = allOrders.filter((order) => visibleOrder(order, orderVisibility));
      const allOrderIds = new Set(allOrders.map((order) => order.id));
      const visibleOrderIds = new Set(orders.map((order) => order.id));
      const allRecoveryOrders = rows
        .filter((row) => row.domain === STORAGE_KEYS.RECOVERY_ORDERS)
        .map((row) => parseRecord<RecoveryOrder>(row.data))
        .filter((order): order is RecoveryOrder => Boolean(order));
      const visibleRecoveryOrders = allRecoveryOrders
        .filter((order) => !order.deletedAt)
        .filter((order) => visibleRecovery(order, recoveryVisibility));
      const allRecoveryOrderIds = new Set(allRecoveryOrders.map((order) => order.id));
      const visibleRecoveryOrderIds = new Set(visibleRecoveryOrders.map((order) => order.id));
      const recoveryOrders = visibleRecoveryOrders
        .filter((order) => ['审核通过', '待分账', '已分账'].includes(order.status))
        .filter((order) => inRange(order.recoveryAt, startAt, endAt));
      const commissions = selectCurrentCommissionRounds(applyRecoveryCommissionBusinessTimes(rows
        .filter((row) => row.domain === STORAGE_KEYS.COMMISSIONS)
        .map((row) => parseRecord<Commission>(row.data))
        .filter((commission): commission is Commission => Boolean(commission)), allRecoveryOrders))
        .filter((commission) => {
          const recoveryRelated = isRecoveryCommission(commission);
          const sourceId = recoveryRelated
            ? commission.sourceRecoveryOrderId || commission.orderId
            : commission.orderId;
          const allSourceIds = recoveryRelated ? allRecoveryOrderIds : allOrderIds;
          const visibleSourceIds = recoveryRelated ? visibleRecoveryOrderIds : visibleOrderIds;
          if (sourceId && allSourceIds.has(sourceId)) return visibleSourceIds.has(sourceId);
          return visibleCommission(
            commission,
            recoveryRelated ? recoveryVisibility : orderVisibility,
          );
        })
        .filter((commission) => inRange(commission.paymentDate || commission.createdAt, startAt, endAt));
      const canonicalLeads = structuredLeadRows
        .flatMap((row) => {
          const lead = parseRecord<Lead>(row.data);
          return lead && !lead.deletedAt ? [{ ...lead, id: String(row.id || lead.id) }] : [];
        });
      const canonicalLeadIds = new Set(canonicalLeads.map((lead) => lead.id));
      const legacyLeads = rows
        .filter((row) => row.domain === STORAGE_KEYS.LEADS)
        .map((row) => parseRecord<Lead>(row.data))
        .filter((lead): lead is Lead => Boolean(lead && !lead.deletedAt))
        .filter((lead) => !canonicalLeadIds.has(lead.id));
      const leads = [...canonicalLeads, ...legacyLeads]
        .filter((lead) => visibleLead(lead, leadVisibility));
      const customers = rows
        .filter((row) => row.domain === STORAGE_KEYS.CUSTOMERS)
        .map((row) => parseRecord<Customer>(row.data))
        .filter((customer): customer is Customer => Boolean(customer && !customer.deletedAt && !customer.mergedIntoId))
        .filter((customer) => visibleCustomer(customer, customerVisibility));
      const applications = rows
        .filter((row) => row.domain === STORAGE_KEYS.ORDER_APPLICATIONS)
        .map((row) => parseRecord<OrderApplication>(row.data))
        .filter((application): application is OrderApplication => Boolean(application && !application.reviewCleanedAt))
        .filter((application) => visibleApplication(application, applicationVisibility));
      const visibleCustomerIds = new Set(customers.map((customer) => customer.id));
      const customerTodos = source.customerTodoRows
        .map(normalizeTodo)
        .filter((todo): todo is CustomerTodo => Boolean(todo))
        .filter((todo) => visibleCustomerIds.has(todo.customerId))
        .filter((todo) => visibleIdentity(todo.assigneeId, todo.assigneeName, customerVisibility));

      const formalOrderIds = new Set<string>();
      const formalPaymentAmountByOrder = new Map<string, number>();
      const salesRanking = new Map<string, BusinessCockpitRankingItem & { orderIds: Set<string> }>();
      const trendByDate = new Map<string, CockpitTrendPoint>();
      let formalOrderPaidAmount = 0;
      let formalPaymentCount = 0;
      let missingSalesIdentityPaymentCount = 0;
      orders.forEach((order) => {
        const payments = orderPayments(order).filter((payment) => (
          Number.isFinite(Number(payment.amount))
          && Number(payment.amount) > 0
          && inRange(payment.paidAt, startAt, endAt)
        ));
        if (!payments.length) return;
        formalOrderIds.add(order.id);
        const salesName = clean(order.salesName || order.owner);
        const salesId = clean(order.salesId) || query.rankingUserIdByName?.[salesName];
        const key = rankingKey(salesId, salesName);
        const current = salesRanking.get(key) || {
          userId: salesId || undefined,
          name: salesName || '未填写',
          amount: 0,
          orderCount: 0,
          paymentCount: 0,
          orderIds: new Set<string>(),
        };
        current.name = salesName || current.name;
        payments.forEach((payment) => {
          const amount = finiteMoney(payment.amount);
          formalOrderPaidAmount = roundMoney(formalOrderPaidAmount + amount);
          formalPaymentAmountByOrder.set(
            order.id,
            roundMoney((formalPaymentAmountByOrder.get(order.id) || 0) + amount),
          );
          formalPaymentCount += 1;
          current.amount = roundMoney(current.amount + amount);
          current.paymentCount += 1;
          if (!clean(order.salesId)) missingSalesIdentityPaymentCount += 1;
          const date = shanghaiDateKey(payment.paidAt);
          if (date) {
            const point = trendByDate.get(date) || {
              date,
              label: date.slice(5).replace('-', '/'),
              formalReceiptAmount: 0,
              recoveryAmount: 0,
            };
            point.formalReceiptAmount = roundMoney(point.formalReceiptAmount + amount);
            trendByDate.set(date, point);
          }
        });
        current.orderIds.add(order.id);
        current.orderCount = current.orderIds.size;
        salesRanking.set(key, current);
      });

      const recoveryRanking = new Map<string, BusinessCockpitRankingItem & { orderIds: Set<string> }>();
      let recoveryBusinessAmount = 0;
      recoveryOrders.forEach((order) => {
        const amount = finiteMoney(order.recoveryAmount);
        recoveryBusinessAmount = roundMoney(recoveryBusinessAmount + amount);
        const recoveryName = clean(order.recoveryUserName);
        const recoveryUserId = clean(order.recoveryUserId) || query.rankingUserIdByName?.[recoveryName];
        const key = rankingKey(recoveryUserId, recoveryName);
        const current = recoveryRanking.get(key) || {
          userId: recoveryUserId || undefined,
          name: recoveryName || '未填写',
          amount: 0,
          orderCount: 0,
          paymentCount: 0,
          orderIds: new Set<string>(),
        };
        current.name = recoveryName || current.name;
        current.amount = roundMoney(current.amount + amount);
        current.orderIds.add(order.id);
        current.orderCount = current.orderIds.size;
        recoveryRanking.set(key, current);
        const date = shanghaiDateKey(order.recoveryAt);
        if (date) {
          const point = trendByDate.get(date) || {
            date,
            label: date.slice(5).replace('-', '/'),
            formalReceiptAmount: 0,
            recoveryAmount: 0,
          };
          point.recoveryAmount = roundMoney(point.recoveryAmount + amount);
          trendByDate.set(date, point);
        }
      });

      const commissionHealth = commissions.reduce<BusinessCockpitSnapshot['commissionHealth']>((health, commission) => {
        const amount = finiteMoney(commission.commissionAmount);
        const pendingHandling = commission.status === '待确认' && isCommissionPendingHandling(commission);
        health.currentCommissionCount += 1;
        if (pendingHandling) health.pendingHandlingCount += 1;
        else if (commission.status === '待确认') health.pendingConfirmAmount = roundMoney(health.pendingConfirmAmount + amount);
        else if (commission.status === '待发放') health.pendingPayAmount = roundMoney(health.pendingPayAmount + amount);
        else if (commission.status === '已发放') health.paidAmount = roundMoney(health.paidAmount + amount);
        return health;
      }, {
        currentCommissionCount: 0,
        pendingHandlingCount: 0,
        pendingConfirmAmount: 0,
        pendingPayAmount: 0,
        paidAmount: 0,
      });

      const financeRecordIdByTransaction = new Map<FinanceTransaction, string>();
      const orderFinanceCandidates = rows
        .filter((row) => row.domain === STORAGE_KEYS.FINANCE_TRANSACTIONS)
        .flatMap((row) => {
          const transaction = parseRecord<FinanceTransaction>(row.data);
          if (!transaction || !['order_payment', 'order_payment_adjustment'].includes(transaction.sourceType)) return [];
          financeRecordIdByTransaction.set(transaction, row.recordId);
          return [transaction];
        });
      const financeOrderAttribution = attributeFinanceTransactionsToOrders(orderFinanceCandidates, storedOrders);
      const canonicalVisibleOrderIds = (transaction: FinanceTransaction) => [
        ...(financeOrderAttribution.get(transaction) || new Set<string>()),
      ].filter((orderId) => visibleOrderIds.has(orderId));
      const allFinanceTransactions = orderFinanceCandidates.filter((transaction) => (
        canonicalVisibleOrderIds(transaction).length > 0
      ));
      // KPI totals only trust canonical metadata. Event/reversal recovery is intentionally wider and
      // is reserved for anomaly detection so a hidden or malformed row cannot leak into visible totals.
      const strictVisibleFinanceTransactions = orderFinanceCandidates.filter((transaction) => (
        clean(transaction.sourceDomain) === STORAGE_KEYS.ORDERS
        && visibleOrderIds.has(clean(transaction.sourceId))
        && visibleOrderIds.has(clean(transaction.orderId))
        && [...(financeOrderAttribution.get(transaction) || new Set<string>())]
          .every((orderId) => visibleOrderIds.has(orderId))
        && clean(transaction.status) === '已确认'
      ));
      const financeTransactions = strictVisibleFinanceTransactions
        .filter((transaction) => inRange(transaction.occurredAt, startAt, endAt));
      const periodEvidenceFinanceTransactions = allFinanceTransactions
        .filter((transaction) => inRange(transaction.occurredAt, startAt, endAt));
      const periodFinanceOrderIds = new Set(periodEvidenceFinanceTransactions.flatMap(canonicalVisibleOrderIds));
      const invalidPaymentOrderIds = orders
        .filter((order) => (
          invalidPaymentStructure(order)
          || orderPayments(order).some((payment) => (
            !Number.isFinite(timestamp(payment.paidAt))
            || ((!Number.isFinite(Number(payment.amount)) || Number(payment.amount) <= 0)
              && inRange(payment.paidAt, startAt, endAt))
          ))
        ))
        .map((order) => order.id);
      const invalidTimeFinanceOrderIds = allFinanceTransactions
        .filter((transaction) => !Number.isFinite(timestamp(transaction.occurredAt)))
        .flatMap(canonicalVisibleOrderIds);
      const correctedPaymentOrderIds = orders
        .filter((order) => (order.changeHistory || []).some((change) => (
          change.action === 'correct'
          && inRange(change.changedAt, startAt, endAt)
          && (change.changes || []).some((item) => ['payments', 'actualAmount'].includes(item.field))
        )))
        .map((order) => order.id);
      const reconciliationOrderIds = new Set([
        ...formalPaymentAmountByOrder.keys(),
        ...periodFinanceOrderIds,
        ...invalidPaymentOrderIds,
        ...invalidTimeFinanceOrderIds,
        ...correctedPaymentOrderIds,
      ]);
      const orderById = new Map(orders.map((order) => [order.id, order]));
      const reconciliationContext = createOrderPaymentReconciliationContext(
        allFinanceTransactions,
        orders,
        financeRecordIdByTransaction,
      );
      let reconciliationAmountIssueCount = 0;
      let reconciliationBusinessTimeIssueCount = 0;
      let reconciliationIssueCount = 0;
      let reconciliationDifferenceAmount = 0;
      const reconciliationIssueOrderIds: string[] = [];
      const trustedFinanceRows = new Set<FinanceTransaction>();
      reconciliationOrderIds.forEach((orderId) => {
        const order = orderById.get(orderId);
        if (!order) return;
        const reconciliation = reconcileOrderPayments(order, reconciliationContext);
        reconciliation.trustedTransactions.forEach((transaction) => trustedFinanceRows.add(transaction));
        if (reconciliation.amountIssue) {
          reconciliationAmountIssueCount += 1;
          reconciliationDifferenceAmount = roundMoney(
            reconciliationDifferenceAmount + reconciliation.evidence.differenceAmount,
          );
        }
        if (reconciliation.businessTimeIssue) reconciliationBusinessTimeIssueCount += 1;
        if (reconciliation.amountIssue || reconciliation.businessTimeIssue) {
          reconciliationIssueCount += 1;
          reconciliationIssueOrderIds.push(orderId);
        }
      });
      const trustedFinanceTransactions = financeTransactions.filter((transaction) => trustedFinanceRows.has(transaction));
      const formalOrderIncomeAmount = roundMoney(trustedFinanceTransactions
        .filter((transaction) => transaction.sourceType === 'order_payment' && transaction.direction === 'income')
        .reduce((sum, transaction) => sum + finiteMoney(transaction.amount), 0));
      const formalOrderAdjustmentAmount = roundMoney(trustedFinanceTransactions
        .filter((transaction) => transaction.sourceType === 'order_payment_adjustment' && transaction.direction === 'expense')
        .reduce((sum, transaction) => sum + finiteMoney(transaction.amount), 0));
      const now = options.now?.() || new Date();
      const todosByCustomerId = new Map<string, CustomerTodo[]>();
      customerTodos.forEach((todo) => {
        const current = todosByCustomerId.get(todo.customerId) || [];
        current.push(todo);
        todosByCustomerId.set(todo.customerId, current);
      });
      const riskRank = { high: 3, medium: 2, low: 1 } as const;
      const allCustomerBattles: BusinessCockpitSnapshot['customerBattles'] = customers
        .filter((customer) => normalizeLifecycleStatusCode(customer.lifecycleStatusCode) !== LIFECYCLE_STATUS_CODES.PUBLIC_POOL)
        .map((customer) => {
          const battle = buildCustomerBattleSnapshot(customer, todosByCustomerId.get(customer.id) || [], now);
          return {
            customerId: customer.id,
            customerName: customer.name,
            company: customer.company || '',
            ...(customer.ownerId ? { ownerId: customer.ownerId } : {}),
            ownerName: customer.owner || '未分配',
            stageCode: battle.stage.code,
            stageLabel: battle.stage.label,
            opportunityAmount: battle.opportunityAmount || 0,
            ...(battle.nextAction ? { nextActionTitle: battle.nextAction.title, nextActionDueAt: battle.nextAction.dueAt } : {}),
            ...(battle.contactGapDays === null ? {} : { contactGapDays: battle.contactGapDays }),
            riskLevel: battle.risk.level,
            riskReason: battle.risk.reason,
          };
        })
        .sort((left, right) => (
          riskRank[right.riskLevel] - riskRank[left.riskLevel]
          || right.opportunityAmount - left.opportunityAmount
          || (right.contactGapDays || 0) - (left.contactGapDays || 0)
        ));
      const customerBattleStageMap = new Map<string, BusinessCockpitData['customerBattleStages'][number]>();
      allCustomerBattles.forEach((item) => {
        const current = customerBattleStageMap.get(item.stageCode) || {
          stageCode: item.stageCode, stageLabel: item.stageLabel, customerCount: 0, opportunityAmount: 0,
        };
        current.customerCount += 1;
        current.opportunityAmount = roundMoney(current.opportunityAmount + item.opportunityAmount);
        customerBattleStageMap.set(item.stageCode, current);
      });
      const customerBattleStages = [...customerBattleStageMap.values()]
        .sort((left, right) => right.opportunityAmount - left.opportunityAmount || right.customerCount - left.customerCount);
      const customerBattles = allCustomerBattles.slice(0, 12);
      const salesBattleProfileMap = new Map<string, BusinessCockpitSnapshot['salesBattleProfiles'][number]>();
      allCustomerBattles.forEach((item) => {
        const key = rankingKey(item.ownerId, item.ownerName);
        const current = salesBattleProfileMap.get(key) || {
          ...(item.ownerId ? { ownerId: item.ownerId } : {}),
          ownerName: item.ownerName,
          customerCount: 0,
          activeOpportunityCount: 0,
          opportunityAmount: 0,
          todayDueTodoCount: 0,
          todayCompletedTodoCount: 0,
          todayFollowUpCount: 0,
          overdueCustomerCount: 0,
          riskCustomerCount: 0,
          missingNextActionCount: 0,
          wonCount: 0,
          lostCount: 0,
          conversionRate: 0,
          priorityCustomers: [],
        };
        current.customerCount += 1;
        if (item.stageCode === 'won') current.wonCount += 1;
        else if (item.stageCode === 'lost') current.lostCount += 1;
        else if (item.stageCode !== 'not_set') {
          current.activeOpportunityCount += 1;
          current.opportunityAmount = roundMoney(current.opportunityAmount + item.opportunityAmount);
        }
        if (!['won', 'lost'].includes(item.stageCode)) {
          current.priorityCustomers.push(item);
          if (!item.nextActionTitle) current.missingNextActionCount += 1;
        }
        if (item.riskLevel !== 'low') current.riskCustomerCount += 1;
        if (
          !['won', 'lost'].includes(item.stageCode)
          && item.nextActionDueAt
          && timestamp(item.nextActionDueAt) < now.getTime()
        ) current.overdueCustomerCount += 1;
        salesBattleProfileMap.set(key, current);
      });
      const salesProfileForTodo = (todo: CustomerTodo) => {
        const key = rankingKey(todo.assigneeId, todo.assigneeName);
        const existing = salesBattleProfileMap.get(key);
        const profile = existing || {
          ...(todo.assigneeId ? { ownerId: todo.assigneeId } : {}),
          ownerName: todo.assigneeName || '未分配',
          customerCount: 0,
          activeOpportunityCount: 0,
          opportunityAmount: 0,
          todayDueTodoCount: 0,
          todayCompletedTodoCount: 0,
          todayFollowUpCount: 0,
          overdueCustomerCount: 0,
          riskCustomerCount: 0,
          missingNextActionCount: 0,
          wonCount: 0,
          lostCount: 0,
          conversionRate: 0,
          priorityCustomers: [],
        };
        salesBattleProfileMap.set(key, profile);
        return profile;
      };
      customerTodos.filter((todo) => (
        todo.status !== 'canceled' && shanghaiDateKey(todo.dueAt) === shanghaiDateKey(now)
      )).forEach((todo) => {
        salesProfileForTodo(todo).todayDueTodoCount += 1;
      });
      customerTodos.filter((todo) => (
        todo.status === 'completed'
        && Boolean(todo.completedAt)
        && shanghaiDateKey(todo.completedAt) === shanghaiDateKey(now)
      )).forEach((todo) => {
        salesProfileForTodo(todo).todayCompletedTodoCount += 1;
      });
      const todayFollowedCustomerIdsBySales = new Map<string, Set<string>>();
      customers.forEach((customer) => {
        (customer.activityRecords || []).filter((record) => (
          record.type === 'follow'
          && record.title !== '历史最后跟进记录'
          && shanghaiDateKey(record.createdAt) === shanghaiDateKey(now)
        )).forEach((record) => {
          const operatorName = clean(record.operator);
          const operatorId = query.rankingUserIdByName?.[operatorName]
            || (operatorName && operatorName === clean(customer.owner) ? clean(customer.ownerId) : '');
          const key = rankingKey(operatorId, operatorName);
          const customerIds = todayFollowedCustomerIdsBySales.get(key) || new Set<string>();
          customerIds.add(customer.id);
          todayFollowedCustomerIdsBySales.set(key, customerIds);
          if (!salesBattleProfileMap.has(key)) {
            salesBattleProfileMap.set(key, {
              ...(operatorId ? { ownerId: operatorId } : {}),
              ownerName: operatorName || '未分配',
              customerCount: 0,
              activeOpportunityCount: 0,
              opportunityAmount: 0,
              todayDueTodoCount: 0,
              todayCompletedTodoCount: 0,
              todayFollowUpCount: 0,
              overdueCustomerCount: 0,
              riskCustomerCount: 0,
              missingNextActionCount: 0,
              wonCount: 0,
              lostCount: 0,
              conversionRate: 0,
              priorityCustomers: [],
            });
          }
        });
      });
      todayFollowedCustomerIdsBySales.forEach((customerIds, key) => {
        const profile = salesBattleProfileMap.get(key);
        if (profile) profile.todayFollowUpCount = customerIds.size;
      });
      const salesBattleProfiles = [...salesBattleProfileMap.values()]
        .map((profile) => ({
          ...profile,
          conversionRate: profile.wonCount + profile.lostCount
            ? roundMoney(profile.wonCount / (profile.wonCount + profile.lostCount) * 100)
            : 0,
          priorityCustomers: profile.priorityCustomers.slice(0, 5),
        }))
        .sort((left, right) => (
          right.overdueCustomerCount - left.overdueCustomerCount
          || right.riskCustomerCount - left.riskCustomerCount
          || right.opportunityAmount - left.opportunityAmount
          || right.customerCount - left.customerCount
        ));
      const followUpHealth: BusinessCockpitSnapshot['followUpHealth'] = {
        newLeadCount: leads.filter((lead) => inRange(lead.createdAt, startAt, endAt)).length,
        followedLeadCount: leads.filter((lead) => (
          (lead.followUpRecords || []).some((record) => inRange(record.createdAt, startAt, endAt))
        )).length,
        pendingLeadCount: leads.filter((lead) => lead.lifecycleStatusCode === 'pending_followup').length,
        followingLeadCount: leads.filter((lead) => lead.lifecycleStatusCode === 'following').length,
        newCustomerCount: customers.filter((customer) => isLeadConversionInRange(customer, startAt, endAt)).length,
        followedCustomerCount: customers.filter((customer) => isCustomerFollowInRange(customer, startAt, endAt)).length,
        pendingFollowUpCustomerCount: customers.filter((customer) => customer.lifecycleStatusCode === 'pending_followup').length,
        followingCustomerCount: customers.filter((customer) => customer.lifecycleStatusCode === 'following').length,
        pendingCustomerTodoCount: customerTodos.filter((todo) => todo.status === 'pending').length,
        overdueCustomerTodoCount: customerTodos.filter((todo) => (
          todo.status === 'pending' && timestamp(todo.dueAt) < now.getTime()
        )).length,
        completedCustomerTodoCount: customerTodos.filter((todo) => (
          todo.status === 'completed' && inRange(todo.completedAt, startAt, endAt)
        )).length,
      };
      const leadSourceMap = new Map<string, BusinessCockpitSnapshot['leadSources'][number]>();
      const sourceItem = (sourceValue: unknown) => {
        const source = clean(sourceValue) || '未填写来源';
        const current = leadSourceMap.get(source) || { source, leadCount: 0, followedCount: 0, followRate: 0, convertedCustomerCount: 0, receiptAmount: 0 };
        leadSourceMap.set(source, current);
        return current;
      };
      leads.filter((lead) => inRange(lead.createdAt, startAt, endAt)).forEach((lead) => {
        const current = sourceItem(lead.source);
        current.leadCount += 1;
        if ((lead.followUpRecords || []).some((record) => inRange(record.createdAt, startAt, endAt))) current.followedCount += 1;
        current.followRate = roundMoney(current.followedCount / current.leadCount * 100);
      });
      customers.filter((customer) => isLeadConversionInRange(customer, startAt, endAt)).forEach((customer) => {
        sourceItem(customer.leadSource).convertedCustomerCount += 1;
      });
      const customerById = new Map(customers.map((customer) => [customer.id, customer]));
      formalOrderIds.forEach((orderId) => {
        const order = orders.find((item) => item.id === orderId);
        const customer = order ? customerById.get(order.customerId) : undefined;
        sourceItem(customer?.leadSource).receiptAmount = roundMoney(
          sourceItem(customer?.leadSource).receiptAmount + (formalPaymentAmountByOrder.get(orderId) || 0),
        );
      });
      const leadSources = [...leadSourceMap.values()].sort((left, right) => right.receiptAmount - left.receiptAmount || right.leadCount - left.leadCount || left.source.localeCompare(right.source, 'zh-CN'));
      const orderHealth: BusinessCockpitSnapshot['orderHealth'] = {
        pendingReviewApplicationCount: applications.filter((application) => application.status === '待财务审核').length,
        returnedApplicationCount: applications.filter((application) => application.status === '退回修改').length,
        approvedApplicationCount: applications.filter((application) => (
          application.status === '已入库'
          && inRange(application.reviewedAt || application.updatedAt, startAt, endAt)
        )).length,
        pendingSettlementOrderCount: orders.filter((order) => order.settlementStatus === '待处理').length,
        paymentlessConfirmedOrderCount: orders.filter((order) => (
          order.status === '已确认'
          && !orderPayments(order).some((payment) => (
            Number.isFinite(Number(payment.amount)) && Number(payment.amount) > 0
          ))
        )).length,
      };
      const refunds = rows
        .filter((row) => row.domain === STORAGE_KEYS.REFUNDS)
        .map((row) => parseRecord<Refund>(row.data))
        .filter((refund): refund is Refund => Boolean(refund && visibleOrderIds.has(refund.orderId)));
      const refundRecordOrderIds = new Set(refunds.map((refund) => refund.orderId));
      const activeRefundOrderIds = new Set(refunds
        .filter((refund) => !['挽回成功', '退款已完成', '退款已拒绝'].includes(refund.status))
        .map((refund) => refund.orderId));
      const completedRefunds = refunds.filter((refund) => (
        refund.status === '退款已完成'
        && inRange(refund.refundedAt || refund.completedAt, startAt, endAt)
      ));
      const completedRefundOrderIds = new Set(completedRefunds.map((refund) => refund.orderId));
      const legacyRefundingOrders = orders.filter((order) => (
        !refundRecordOrderIds.has(order.id)
        && (order.status === '退款中'
          || ['待分配', '挽回中', '待财务退款', '退款申请中', '退款已批准'].includes(order.refundStatus))
      ));
      const legacyRefundedOrders = orders.filter((order) => (
        !refundRecordOrderIds.has(order.id)
        && (order.status === '已退款' || order.refundStatus === '退款已完成')
        && inRange(order.updatedAt, startAt, endAt)
      ));

      return success({
        range: { startAt: query.startAt, endAt: query.endAt },
        business: {
          formalOrderPaidAmount,
          formalOrderCount: formalOrderIds.size,
          formalPaymentCount,
          recoveryBusinessAmount,
          recoveryOrderCount: recoveryOrders.length,
        },
        salesRanking: sortRanking([...salesRanking.values()].map(({ orderIds: _orderIds, ...item }) => item)),
        recoveryRanking: sortRanking([...recoveryRanking.values()].map(({ orderIds: _orderIds, ...item }) => item)),
        trend: [...trendByDate.values()].sort((left, right) => left.date.localeCompare(right.date)),
        commissionHealth,
        financeHealth: {
          formalOrderIncomeAmount,
          formalOrderAdjustmentAmount,
          formalOrderNetReceiptAmount: roundMoney(formalOrderIncomeAmount - formalOrderAdjustmentAmount),
          transactionCount: trustedFinanceTransactions.length,
          reconciliationIssueCount,
          reconciliationAmountIssueCount,
          reconciliationBusinessTimeIssueCount,
          reconciliationDifferenceAmount,
          reconciliationOrderIds: reconciliationIssueOrderIds.sort(),
        },
        customerBattles,
        customerBattleStages,
        salesBattleProfiles,
        followUpHealth,
        leadSources,
        orderHealth,
        refundHealth: {
          refundingOrderCount: activeRefundOrderIds.size + legacyRefundingOrders.length,
          refundedOrderCount: completedRefundOrderIds.size + legacyRefundedOrders.length,
          refundAmount: roundMoney(
            completedRefunds.reduce((sum, refund) => sum + finiteMoney(refund.refundAmount), 0)
            + legacyRefundedOrders.reduce((sum, order) => sum + finiteMoney(order.refundAmount), 0),
          ),
        },
        dataQuality: {
          missingSalesIdentityPaymentCount,
          visibleLeadCount: leads.length,
          newFollowedLeadCount: leads.filter((lead) => (
            inRange(lead.createdAt, startAt, endAt)
            && (lead.followUpRecords || []).some((record) => inRange(record.createdAt, startAt, endAt))
          )).length,
        },
      });
  };

  const get = async (
    range: DashboardDateRange,
    actor: AuthenticatedUser,
  ): Promise<ApiResponse<BusinessCockpitData>> => {
    const now = options.now?.() || new Date();
    const resolvedRange = resolveDateRange(range, now);
    const managementTargetQuery = typeof (prisma as any).keyResult?.findMany === 'function'
      ? (prisma as any).keyResult.findMany({
        where: {
          metricBinding: { is: { metricCode: 'FORMAL_ORDER_PAID_AMOUNT' } },
          objective: {
            status: 'PUBLISHED',
            cycle: {
              status: 'ACTIVE',
              cycleType: 'MONTH',
              startAt: { lte: new Date(resolvedRange.endAt) },
              endAt: { gte: new Date(resolvedRange.startAt) },
            },
          },
        },
        select: {
          targetValue: true,
          updatedAt: true,
          metricBinding: { select: { scopeType: true, scopeId: true } },
        },
        orderBy: { updatedAt: 'desc' },
      })
      : Promise.resolve([]);
    const [userRows, roleRows, departmentRows, managementTargetRows] = await Promise.all([
      prisma.user.findMany(),
      prisma.role.findMany({ where: { isActive: true } }),
      prisma.department.findMany(),
      managementTargetQuery,
    ]);
    const users = userRows.map(mapPrismaUser);
    const roles = roleRows.map(mapPrismaRole);
    const departments = departmentRows.map(mapPrismaDepartment);
    const actorRole = getUserRole(actor, roles);
    const canViewCustomerBattles = roleHasPermission(actorRole, PERMISSION_KEYS.CUSTOMER_LIST);
    const uniqueActiveUserByName = new Map<string, typeof users[number] | null>();
    users
      .filter((user) => user.isActive && (user.employmentStatus || 'active') === 'active')
      .forEach((user) => {
        const name = clean(user.name);
        if (!name) return;
        uniqueActiveUserByName.set(name, uniqueActiveUserByName.has(name) ? null : user);
      });
    const rankingUserIdByName = Object.fromEntries([...uniqueActiveUserByName.entries()]
      .filter((entry): entry is [string, typeof users[number]] => Boolean(entry[1]))
      .map(([name, user]) => [name, user.id]));
    const scopes = {
      orders: buildDataVisibilityScopeForUser(actor, users, roles, departments, 'orders'),
      recoveryOrders: buildDataVisibilityScopeForUser(actor, users, roles, departments, 'recoveryOrders'),
      leads: buildDataVisibilityScopeForUser(actor, users, roles, departments, 'leads'),
      customers: buildDataVisibilityScopeForUser(actor, users, roles, departments, 'customers'),
      orderApplications: buildDataVisibilityScopeForUser(actor, users, roles, departments, 'orderApplications'),
    };
    const snapshotQuery = {
      startAt: resolvedRange.startAt,
      endAt: resolvedRange.endAt,
      visibility: toCockpitVisibility(scopes.orders),
      rankingUserIdByName,
      visibilityByDomain: {
        orders: toCockpitVisibility(scopes.orders),
        recoveryOrders: toCockpitVisibility(scopes.recoveryOrders),
        leads: toCockpitVisibility(scopes.leads),
        customers: toCockpitVisibility(scopes.customers),
        orderApplications: toCockpitVisibility(scopes.orderApplications),
      },
    };
    const previousRange = previousComparableRange(range, resolvedRange);
    const snapshotSource = await loadSnapshotSource();
    const [snapshotResponse, previousSnapshotResponse] = await Promise.all([
      getSnapshot(snapshotQuery, snapshotSource),
      getSnapshot({ ...snapshotQuery, ...previousRange }, snapshotSource),
    ]);
    const snapshot = snapshotResponse.data;
    const previousSnapshot = previousSnapshotResponse.data;
    const userById = new Map(users.map((user) => [user.id, user]));
    const departmentById = new Map(departments.map((department) => [department.id, department.name]));
    const resolveProfileUser = (userId: string | undefined, name: string) => (
      userId ? userById.get(userId) : uniqueActiveUserByName.get(clean(name)) || undefined
    );
    const mapRanking = (item: BusinessCockpitRankingItem) => {
      const user = resolveProfileUser(item.userId, item.name);
      const stableUserId = user?.id;
      return {
        userId: stableUserId || (item.userId ? `unresolved:${item.userId}` : `legacy:${item.name}`),
        name: item.name,
        ...(user?.departmentId ? { department: departmentById.get(user.departmentId) } : {}),
        amount: item.amount,
        count: item.orderCount,
        averageAmount: item.orderCount ? roundMoney(item.amount / item.orderCount) : 0,
        ...(item.assistCount === undefined ? {} : { assistCount: item.assistCount }),
        identityStatus: stableUserId ? 'resolved' as const : item.userId ? 'unresolved' as const : 'legacy' as const,
      };
    };
    const mappedSalesRanking = snapshot.salesRanking.map(mapRanking);
    let companyTargetAmount: number | null = null;
    const salesTargetByUserId = new Map<string, number>();
    (managementTargetRows as any[]).forEach((row) => {
      const targetAmount = finiteMoney(row?.targetValue);
      const scopeType = clean(row?.metricBinding?.scopeType).toUpperCase();
      const scopeId = clean(row?.metricBinding?.scopeId);
      if (targetAmount <= 0) return;
      if (scopeType === 'COMPANY' && companyTargetAmount === null) {
        companyTargetAmount = targetAmount;
      } else if (scopeType === 'USER' && scopeId && !salesTargetByUserId.has(scopeId)) {
        salesTargetByUserId.set(scopeId, targetAmount);
      }
    });
    const profileRiskRank = { high: 3, medium: 2, low: 1 } as const;
    const salesBattleProfileMap = new Map<string, BusinessCockpitData['salesBattleProfiles'][number]>();
    snapshot.salesBattleProfiles.forEach((profile) => {
      const user = resolveProfileUser(profile.ownerId, profile.ownerName);
      if (!profile.customerCount && !user) return;
      if (!profile.customerCount && user && !canReceiveLead(user, roles)) return;
      const stableUserId = user?.id;
      const identityStatus = stableUserId ? 'resolved' as const : profile.ownerId ? 'unresolved' as const : 'legacy' as const;
      const key = stableUserId || (profile.ownerId ? `unresolved:${profile.ownerId}` : `legacy:${profile.ownerName}`);
      const ranking = mappedSalesRanking.find((item) => (
        item.userId === key || (!profile.ownerId && !stableUserId && item.name === profile.ownerName)
      ));
      const existing = salesBattleProfileMap.get(key);
      const priorityCustomers = [...(existing?.priorityCustomers || []), ...profile.priorityCustomers]
        .filter((item, index, items) => items.findIndex((candidate) => candidate.customerId === item.customerId) === index)
        .sort((left, right) => (
          profileRiskRank[right.riskLevel] - profileRiskRank[left.riskLevel]
          || right.opportunityAmount - left.opportunityAmount
        ))
        .slice(0, 5);
      const wonCount = (existing?.wonCount || 0) + profile.wonCount;
      const lostCount = (existing?.lostCount || 0) + profile.lostCount;
      const revenueAmount = Math.max(existing?.revenueAmount || 0, ranking?.amount || 0);
      const monthlyTargetAmount = stableUserId ? salesTargetByUserId.get(stableUserId) || null : null;
      salesBattleProfileMap.set(key, {
        userId: key,
        name: user?.name || profile.ownerName,
        ...(user?.departmentId ? { department: departmentById.get(user.departmentId) } : {}),
        identityStatus,
        revenueAmount,
        orderCount: Math.max(existing?.orderCount || 0, ranking?.count || 0),
        customerCount: (existing?.customerCount || 0) + profile.customerCount,
        activeOpportunityCount: (existing?.activeOpportunityCount || 0) + profile.activeOpportunityCount,
        opportunityAmount: roundMoney((existing?.opportunityAmount || 0) + profile.opportunityAmount),
        todayDueTodoCount: (existing?.todayDueTodoCount || 0) + profile.todayDueTodoCount,
        todayCompletedTodoCount: (existing?.todayCompletedTodoCount || 0) + profile.todayCompletedTodoCount,
        todayFollowUpCount: (existing?.todayFollowUpCount || 0) + profile.todayFollowUpCount,
        overdueCustomerCount: (existing?.overdueCustomerCount || 0) + profile.overdueCustomerCount,
        riskCustomerCount: (existing?.riskCustomerCount || 0) + profile.riskCustomerCount,
        missingNextActionCount: (existing?.missingNextActionCount || 0) + profile.missingNextActionCount,
        wonCount,
        lostCount,
        conversionRate: wonCount + lostCount ? roundMoney(wonCount / (wonCount + lostCount) * 100) : 0,
        monthlyTargetAmount,
        targetGapAmount: monthlyTargetAmount === null
          ? null : Math.max(0, roundMoney(monthlyTargetAmount - revenueAmount)),
        targetCompletionRate: monthlyTargetAmount === null
          ? null : roundMoney(revenueAmount / monthlyTargetAmount * 100),
        priorityCustomers,
      });
    });
    const mappedSalesProfileKeys = new Set(salesBattleProfileMap.keys());
    const salesBattleProfiles: BusinessCockpitData['salesBattleProfiles'] = [...salesBattleProfileMap.values()];
    const appendEmptyProfile = (ranking: {
      userId: string;
      name: string;
      department?: string;
      identityStatus: 'resolved' | 'legacy' | 'unresolved';
      amount: number;
      count: number;
    }) => {
      if (mappedSalesProfileKeys.has(ranking.userId)) return;
      mappedSalesProfileKeys.add(ranking.userId);
      const monthlyTargetAmount = ranking.identityStatus === 'resolved'
        ? salesTargetByUserId.get(ranking.userId) || null
        : null;
      salesBattleProfiles.push({
        userId: ranking.userId,
        name: ranking.name,
        ...(ranking.department ? { department: ranking.department } : {}),
        identityStatus: ranking.identityStatus || 'legacy',
        revenueAmount: ranking.amount,
        orderCount: ranking.count,
        customerCount: 0,
        activeOpportunityCount: 0,
        opportunityAmount: 0,
        todayDueTodoCount: 0,
        todayCompletedTodoCount: 0,
        todayFollowUpCount: 0,
        overdueCustomerCount: 0,
        riskCustomerCount: 0,
        missingNextActionCount: 0,
        wonCount: 0,
        lostCount: 0,
        conversionRate: 0,
        monthlyTargetAmount,
        targetGapAmount: monthlyTargetAmount === null
          ? null : Math.max(0, roundMoney(monthlyTargetAmount - ranking.amount)),
        targetCompletionRate: monthlyTargetAmount === null
          ? null : roundMoney(ranking.amount / monthlyTargetAmount * 100),
        priorityCustomers: [],
      });
    };
    mappedSalesRanking.forEach(appendEmptyProfile);
    const visibleSalesUserIds = new Set(scopes.customers.visibleUserIds);
    users.filter((user) => (
      user.isActive
      && (user.employmentStatus || 'active') === 'active'
      && visibleSalesUserIds.has(user.id)
      && canReceiveLead(user, roles)
    )).forEach((user) => appendEmptyProfile({
      userId: user.id,
      name: user.name,
      ...(user.departmentId ? { department: departmentById.get(user.departmentId) } : {}),
      identityStatus: 'resolved',
      amount: 0,
      count: 0,
    }));
    salesBattleProfiles.sort((left, right) => (
      right.overdueCustomerCount - left.overdueCustomerCount
      || right.riskCustomerCount - left.riskCustomerCount
      || right.opportunityAmount - left.opportunityAmount
      || right.revenueAmount - left.revenueAmount
    ));
    const visibleUserIds = new Set(scopes.customers.visibleUserIds);
    const visibleActiveUsers = users.filter((user) => (
      user.isActive
      && (user.employmentStatus || 'active') === 'active'
      && (scopes.customers.unrestricted || visibleUserIds.has(user.id))
    ));
    const departmentStatuses: BusinessCockpitData['departmentStatuses'] = MANAGEMENT_DEPARTMENT_GROUPS.map((group) => {
      const groupDepartmentNames = new Set(departments
        .filter((department) => department.isActive && group.matches(department.name))
        .map((department) => department.name));
      const memberIds = new Set(visibleActiveUsers
        .filter((user) => Boolean(user.departmentId && groupDepartmentNames.has(departmentById.get(user.departmentId) || '')))
        .map((user) => user.id));
      const attentionCount = salesBattleProfiles.filter((profile) => (
        memberIds.has(profile.userId)
        && (profile.overdueCustomerCount > 0 || profile.riskCustomerCount > 0)
      )).length;
      const available = group.id === 'sales' && canViewCustomerBattles;
      return {
        id: group.id,
        name: group.name,
        memberCount: memberIds.size,
        attentionCount,
        state: available ? (attentionCount > 0 ? 'attention' : 'normal') : 'building',
        available,
      };
    });
    const completedAmount = snapshot.business.formalOrderPaidAmount;
    const managementPerformance: BusinessCockpitData['managementPerformance'] = {
      completedAmount,
      targetAmount: companyTargetAmount,
      gapAmount: companyTargetAmount === null
        ? null : Math.max(0, roundMoney(companyTargetAmount - completedAmount)),
      completionRate: companyTargetAmount === null
        ? null : roundMoney(completedAmount / companyTargetAmount * 100),
      targetSource: companyTargetAmount === null ? 'unconfigured' : 'okr',
    };
    const canViewReconciliationEvidence = isSuperAdmin(actor);
    const financeFlowQuery = new URLSearchParams({ tab: 'flow' });
    if (canViewReconciliationEvidence && snapshot.financeHealth.reconciliationOrderIds.length) {
      financeFlowQuery.set('reconciliation', '1');
      financeFlowQuery.set(
        'orderIds',
        snapshot.financeHealth.reconciliationOrderIds.slice(0, MAX_RECONCILIATION_DRILLDOWN_ORDERS).join(','),
      );
      financeFlowQuery.set('reconciliationTotal', String(snapshot.financeHealth.reconciliationOrderIds.length));
      financeFlowQuery.set('reconciliationStartDate', shanghaiDateKey(resolvedRange.startAt) || '');
      financeFlowQuery.set('reconciliationEndDate', shanghaiDateKey(resolvedRange.endAt) || '');
    }
    const reconciliationDetails = canViewReconciliationEvidence ? [
      snapshot.financeHealth.reconciliationAmountIssueCount
        ? `金额或关联不一致 ${snapshot.financeHealth.reconciliationAmountIssueCount} 笔`
        : '',
      snapshot.financeHealth.reconciliationBusinessTimeIssueCount
        ? `业务时间不一致 ${snapshot.financeHealth.reconciliationBusinessTimeIssueCount} 笔`
        : '',
    ].filter(Boolean).join('，') : '';
    const reconciliationLimitNote = canViewReconciliationEvidence
      && snapshot.financeHealth.reconciliationOrderIds.length > MAX_RECONCILIATION_DRILLDOWN_ORDERS
      ? `；异常较多，下钻每批展示 ${MAX_RECONCILIATION_DRILLDOWN_ORDERS} 个订单，可继续查看下一批`
      : '';
    const riskCandidates: BusinessCockpitData['riskTasks'] = [
      {
        id: 'order-review', title: '待财务审核订单',
        count: snapshot.orderHealth.pendingReviewApplicationCount, path: `${ROUTES.ORDERS}?tab=review`, tone: 'warning',
      },
      {
        id: 'order-returned', title: '退回修改订单',
        count: snapshot.orderHealth.returnedApplicationCount, path: `${ROUTES.ORDERS}?tab=review`, tone: 'error',
      },
      {
        id: 'overdue-customer-todo', title: '逾期客户待办',
        count: snapshot.followUpHealth.overdueCustomerTodoCount, path: ROUTES.CUSTOMERS, tone: 'error',
      },
      {
        id: 'refund-processing', title: '退款处理中',
        count: snapshot.refundHealth.refundingOrderCount, path: ROUTES.AFTER_SALES, tone: 'warning',
      },
      {
        id: 'order-pending-settlement', title: '待处理订单分账',
        count: snapshot.orderHealth.pendingSettlementOrderCount, path: `${ROUTES.FINANCE}?tab=settlement`, tone: 'info',
      },
      {
        id: 'finance-reconciliation', title: '订单实付与资金流水不一致',
        count: snapshot.financeHealth.reconciliationIssueCount,
        ...(canViewReconciliationEvidence ? { amount: snapshot.financeHealth.reconciliationDifferenceAmount } : {}),
        path: `${ROUTES.FINANCE}?${financeFlowQuery.toString()}`, tone: 'error',
        description: canViewReconciliationEvidence
          ? `${reconciliationDetails}；请核对订单付款记录与收支流水${reconciliationLimitNote}`
          : '存在需核对的订单资金记录，具体差额与订单证据仅超级管理员可查看',
      },
    ];
    const riskTasks = riskCandidates.filter((item) => item.count > 0 || Number(item.amount || 0) > 0);
    const scopeLabel = resolveBusinessCockpitScopeLabel(scopes);
    const newLeadCount = snapshot.followUpHealth.newLeadCount;
    return success({
      rangeLabel: resolvedRange.label,
      scopeLabel,
      updatedAt: now.toISOString(),
      summary: {
        formalReceiptAmount: snapshot.business.formalOrderPaidAmount,
        recoveryAmount: snapshot.business.recoveryBusinessAmount,
        operatingAmount: roundMoney(snapshot.business.formalOrderPaidAmount + snapshot.business.recoveryBusinessAmount),
        formalOrderCount: snapshot.business.formalOrderCount,
        recoveryOrderCount: snapshot.business.recoveryOrderCount,
        newLeadCount,
        newCustomerCount: snapshot.followUpHealth.newCustomerCount,
      },
      comparison: {
        label: '上期同期',
        summary: {
          formalReceiptAmount: previousSnapshot.business.formalOrderPaidAmount,
          recoveryAmount: previousSnapshot.business.recoveryBusinessAmount,
          operatingAmount: roundMoney(previousSnapshot.business.formalOrderPaidAmount + previousSnapshot.business.recoveryBusinessAmount),
          formalOrderCount: previousSnapshot.business.formalOrderCount,
          recoveryOrderCount: previousSnapshot.business.recoveryOrderCount,
          newLeadCount: previousSnapshot.followUpHealth.newLeadCount,
          newCustomerCount: previousSnapshot.followUpHealth.newCustomerCount,
        },
        refundAmount: previousSnapshot.refundHealth.refundAmount,
        formalNetReceiptAmount: previousSnapshot.financeHealth.formalOrderNetReceiptAmount,
        trend: previousSnapshot.trend,
        startDate: shanghaiDateKey(previousRange.startAt) || '',
        endDate: shanghaiDateKey(previousRange.endAt) || '',
      },
      trend: snapshot.trend,
      salesRanking: mappedSalesRanking,
      recoveryRanking: snapshot.recoveryRanking.map(mapRanking),
      customerHealth: {
        newLeadCount,
        followedLeadCount: snapshot.dataQuality.newFollowedLeadCount,
        leadFollowRate: newLeadCount
          ? roundMoney(snapshot.dataQuality.newFollowedLeadCount / newLeadCount * 100)
          : 0,
        newCustomerCount: snapshot.followUpHealth.newCustomerCount,
        followingCustomerCount: snapshot.followUpHealth.followingCustomerCount,
        followedCustomerCount: snapshot.followUpHealth.followedCustomerCount,
        overdueTodoCount: snapshot.followUpHealth.overdueCustomerTodoCount,
      },
      customerBattles: canViewCustomerBattles ? snapshot.customerBattles : [],
      customerBattleStages: canViewCustomerBattles ? snapshot.customerBattleStages : [],
      salesBattleProfiles: canViewCustomerBattles ? salesBattleProfiles : [],
      leadSources: snapshot.leadSources,
      orderHealth: {
        formalOrderCount: snapshot.business.formalOrderCount,
        recoveryOrderCount: snapshot.business.recoveryOrderCount,
        pendingReviewCount: snapshot.orderHealth.pendingReviewApplicationCount,
        returnedApplicationCount: snapshot.orderHealth.returnedApplicationCount,
        refundingOrderCount: snapshot.refundHealth.refundingOrderCount,
        refundedOrderCount: snapshot.refundHealth.refundedOrderCount,
        refundAmount: snapshot.refundHealth.refundAmount,
      },
      financeHealth: {
        formalGrossReceiptAmount: snapshot.financeHealth.formalOrderIncomeAmount,
        formalAdjustmentAmount: -snapshot.financeHealth.formalOrderAdjustmentAmount,
        formalNetReceiptAmount: snapshot.financeHealth.formalOrderNetReceiptAmount,
        reconciliationIssueCount: snapshot.financeHealth.reconciliationIssueCount,
        reconciliationAmountIssueCount: canViewReconciliationEvidence
          ? snapshot.financeHealth.reconciliationAmountIssueCount : 0,
        reconciliationBusinessTimeIssueCount: canViewReconciliationEvidence
          ? snapshot.financeHealth.reconciliationBusinessTimeIssueCount : 0,
        reconciliationDifferenceAmount: canViewReconciliationEvidence
          ? snapshot.financeHealth.reconciliationDifferenceAmount : 0,
        reconciliationOrderIds: canViewReconciliationEvidence
          ? snapshot.financeHealth.reconciliationOrderIds : [],
        reconciliationDetailsRestricted: !canViewReconciliationEvidence
          && snapshot.financeHealth.reconciliationIssueCount > 0,
        pendingHandlingCommissionCount: snapshot.commissionHealth.pendingHandlingCount,
        pendingConfirmCommissionAmount: snapshot.commissionHealth.pendingConfirmAmount,
        pendingPayCommissionAmount: snapshot.commissionHealth.pendingPayAmount,
        paidCommissionAmount: snapshot.commissionHealth.paidAmount,
      },
      departmentStatuses,
      managementPerformance,
      riskTasks,
    });
  };

  return { get, getSnapshot };
}
