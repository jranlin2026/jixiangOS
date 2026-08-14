import { Prisma, type PrismaClient } from '@prisma/client';
import { failure, success } from '../api/response';
import { STORAGE_KEYS, DEFAULT_PAGE_SIZE } from '../../src/shared/utils/constants';
import type { PaginatedResponse } from '../../src/api/types';
import type { AuthenticatedUser } from '../../src/types/auth';
import type {
  Order,
  OrderApplication,
  OrderApplicationFilters,
  OrderFilters,
  OrderStats,
} from '../../src/types/order';
import type { DataScopeDomain } from '../../src/types/role';
import type { Customer } from '../../src/types/customer';
import type { Commission } from '../../src/types/commission';
import {
  buildDataVisibilityScopeForUser,
  type DataVisibilityScope,
} from '../../src/shared/utils/dataVisibility';
import { mapPrismaRole, mapPrismaUser } from '../db/prismaMappers';
import { jsonText, queryBusinessRecordPage, visibleJsonCondition } from './businessRecordPageService';
import { compactOrderApplicationListItem, compactOrderListItem } from '../../src/shared/utils/listPayload';
import { deriveOrderListSettlementProgress } from '../../src/shared/utils/orderSettlementProgress';
import { hasPermission, PERMISSION_KEYS } from '../../src/shared/utils/permissions';

type OrderQueryPrisma = Pick<PrismaClient, 'businessRecord' | 'user' | 'role' | 'department' | '$queryRaw'>;

type BusinessRecordRow = {
  data: unknown;
};

function cleanText(value: unknown): string {
  return String(value || '').trim();
}

function lowerText(value: unknown): string {
  return cleanText(value).toLocaleLowerCase();
}

function toPositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
}

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
  return Number.isFinite(parsed) ? parsed : 0;
}

function orderSortValue(order: Order, sortBy?: OrderFilters['sortBy'], direction: 'asc' | 'desc' = 'desc'): number | null {
  if (sortBy === 'paymentDate') {
    const timestamps = (order.payments || [])
      .filter((payment) => payment && Number.isFinite(Number(payment.amount)) && Number(payment.amount) > 0)
      .map((payment) => timestamp(payment?.paidAt))
      .filter((value) => value > 0);
    if (!timestamps.length) return null;
    return direction === 'asc' ? Math.min(...timestamps) : Math.max(...timestamps);
  }
  if (sortBy === 'actualAmount') {
    const amount = Number(order.actualAmount ?? order.amount);
    return Number.isFinite(amount) ? amount : null;
  }
  return timestamp(order.createdAt);
}

function compareOrders(left: Order, right: Order, filters: OrderFilters): number {
  const direction = filters.sortDirection === 'asc' ? 1 : -1;
  const leftValue = orderSortValue(left, filters.sortBy, filters.sortDirection);
  const rightValue = orderSortValue(right, filters.sortBy, filters.sortDirection);
  if (leftValue === null || rightValue === null) {
    if (leftValue === null && rightValue !== null) return 1;
    if (rightValue === null && leftValue !== null) return -1;
  }
  return direction * (Number(leftValue || 0) - Number(rightValue || 0))
    || timestamp(right.createdAt) - timestamp(left.createdAt)
    || right.id.localeCompare(left.id);
}

function applicationSortTimestamp(
  application: OrderApplication,
  sortBy?: OrderApplicationFilters['sortBy'],
): number {
  if (sortBy === 'paymentDate') {
    return timestamp(application.orderData?.payments?.[0]?.paidAt || application.createdAt);
  }
  return timestamp(application.createdAt);
}

function inDateRange(value: unknown, startDate?: string, endDate?: string): boolean {
  const time = timestamp(value);
  if (startDate && time < timestamp(dateBoundary(startDate, false))) return false;
  if (endDate && time > timestamp(dateBoundary(endDate, true))) return false;
  return true;
}

function dateBoundary(value: string, endOfDay: boolean): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Date(`${value}${endOfDay ? 'T23:59:59.999' : 'T00:00:00.000'}+08:00`).toISOString();
}

function orderIsVisible(order: Order, scope: DataVisibilityScope): boolean {
  if (scope.unrestricted) return true;
  const salesId = cleanText(order.salesId);
  if (salesId) return scope.visibleUserIds.includes(salesId);
  const ownerName = cleanText(order.salesName || order.owner);
  return Boolean(ownerName && scope.visibleUserNames.includes(ownerName));
}

function applicationIsVisible(application: OrderApplication, scope: DataVisibilityScope): boolean {
  if (scope.unrestricted) return true;
  const applicantId = cleanText(application.applicantId);
  if (applicantId) return scope.visibleUserIds.includes(applicantId);
  const applicantName = cleanText(application.applicantName);
  return Boolean(applicantName && scope.visibleUserNames.includes(applicantName));
}

function enrichOrderCreator(order: Order, applications: Map<string, OrderApplication>): Order {
  if (order.createdByName || !order.sourceApplicationId) return order;
  const application = applications.get(order.sourceApplicationId);
  if (!application?.applicantName) return order;
  return {
    ...order,
    createdById: application.applicantId,
    createdByName: application.applicantName,
  };
}

async function enrichLegacyOrderLeadSource(
  prisma: OrderQueryPrisma,
  order: Order,
): Promise<Order> {
  if (cleanText(order.sourceName) || !cleanText(order.customerId)) return order;
  const customerRow = await prisma.businessRecord.findUnique({
    where: { domain_recordId: { domain: STORAGE_KEYS.CUSTOMERS, recordId: order.customerId } },
  });
  const customer = customerRow ? parseRecord<Customer>(customerRow.data) : null;
  if (!customer || customer.deletedAt) return order;
  const orderLeadSource = cleanText(order.leadSource);
  const customerLeadSource = cleanText(customer.leadSource);
  if (orderLeadSource && customerLeadSource && orderLeadSource !== customerLeadSource) return order;
  return {
    ...order,
    leadSource: orderLeadSource || customerLeadSource || undefined,
    sourceName: cleanText(customer.sourceName) || undefined,
  };
}

async function enrichApplicationSourceOrderState(
  prisma: OrderQueryPrisma,
  applications: OrderApplication[],
): Promise<OrderApplication[]> {
  const sourceOrderIds = Array.from(new Set(applications
    .map((application) => cleanText(application.orderId))
    .filter(Boolean)));
  if (!sourceOrderIds.length) return applications;
  const rows = await prisma.businessRecord.findMany({
    where: {
      domain: STORAGE_KEYS.ORDERS,
      recordId: { in: sourceOrderIds },
    },
  });
  const sourceOrders = new Map((rows as Array<BusinessRecordRow & { recordId?: string }>)
    .map((row) => [cleanText(row.recordId), parseRecord<Order>(row.data)] as const)
    .filter((entry): entry is readonly [string, Order] => Boolean(entry[0] && entry[1])));
  return applications.map((application) => {
    const sourceOrderId = cleanText(application.orderId);
    if (!sourceOrderId) return application;
    const sourceOrder = sourceOrders.get(sourceOrderId);
    const sourceOrderDeleted = !sourceOrder || Boolean(sourceOrder.deletedAt);
    return {
      ...application,
      sourceOrderDeleted,
      sourceOrderDeletedAt: sourceOrder?.deletedAt,
    };
  });
}

async function loadScope(
  prisma: OrderQueryPrisma,
  actor: AuthenticatedUser,
  domain: DataScopeDomain,
): Promise<DataVisibilityScope> {
  const [users, roles, departments] = await Promise.all([
    prisma.user.findMany(),
    prisma.role.findMany({ where: { isActive: true } }),
    prisma.department.findMany(),
  ]);
  return buildDataVisibilityScopeForUser(
    actor,
    users.map(mapPrismaUser),
    roles.map(mapPrismaRole),
    departments as any,
    domain,
  );
}

function paginate<T>(items: T[], pageValue?: number, pageSizeValue?: number): PaginatedResponse<T> {
  const page = toPositiveInt(pageValue, 1);
  const pageSize = Math.min(toPositiveInt(pageSizeValue, DEFAULT_PAGE_SIZE), 100);
  const total = items.length;
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}

function matchesOrder(order: Order, filters: OrderFilters): boolean {
  const search = lowerText(filters.search);
  if (search && ![
    order.id,
    order.orderNo,
    order.customerName,
    order.productName,
    order.thirdPartyOrderNo,
    order.payments?.[0]?.paymentOrderNo,
    order.salesName,
    order.owner,
  ].some((value) => lowerText(value).includes(search))) return false;
  if (filters.customerId && order.customerId !== filters.customerId) return false;
  if (filters.productLevel && order.productLevel !== filters.productLevel) return false;
  if (filters.status && order.status !== filters.status) return false;
  if (filters.refundStatus && order.refundStatus !== filters.refundStatus) return false;
  if (filters.settlementStatus && order.settlementStatus !== filters.settlementStatus) return false;
  if (filters.owner && order.owner !== filters.owner && order.salesName !== filters.owner) return false;
  if (filters.orderType && order.orderType !== filters.orderType) return false;
  if (filters.paymentMethod && order.paymentMethod !== filters.paymentMethod) return false;
  const paymentMatches = !filters.paymentStartDate && !filters.paymentEndDate
    ? true
    : (order.payments || []).some((payment) => (
      payment
      && Number.isFinite(Number(payment.amount))
      && Number(payment.amount) > 0
      && inDateRange(payment.paidAt, filters.paymentStartDate, filters.paymentEndDate)
    ));
  return inDateRange(order.createdAt, filters.startDate, filters.endDate) && paymentMatches;
}

function matchesApplication(application: OrderApplication, filters: OrderApplicationFilters): boolean {
  const search = lowerText(filters.search);
  if (search && ![
    application.id,
    application.applicationNo,
    application.applicantName,
    application.orderData?.customerName,
    application.orderNo,
  ].some((value) => lowerText(value).includes(search))) return false;
  if (filters.statuses?.length && !filters.statuses.includes(application.status)) return false;
  if (!filters.statuses?.length && filters.status && application.status !== filters.status) return false;
  if (filters.applicantName && application.applicantName !== filters.applicantName) return false;
  if (filters.reviewerName && application.reviewerName !== filters.reviewerName) return false;
  if (filters.owner
    && application.orderData?.owner !== filters.owner
    && application.orderData?.salesName !== filters.owner) return false;
  if (filters.importBatchId && application.importBatchId !== filters.importBatchId) return false;
  if (!inDateRange(application.submittedAt || application.createdAt, filters.startDate, filters.endDate)) return false;
  return inDateRange(
    application.orderData?.payments?.[0]?.paidAt || application.createdAt,
    filters.paymentStartDate,
    filters.paymentEndDate,
  );
}

function exactJson(alias: string, path: string, value?: string): Prisma.Sql[] {
  return value ? [Prisma.sql`${jsonText(alias, path)} = ${value}`] : [];
}

async function queryOrderPage(
  prisma: OrderQueryPrisma,
  filters: OrderFilters,
  scope: DataVisibilityScope,
) {
  const page = toPositiveInt(filters.page, 1);
  const pageSize = Math.min(toPositiveInt(filters.pageSize, DEFAULT_PAGE_SIZE), 100);
  const conditions: Prisma.Sql[] = [
    Prisma.sql`br.domain = ${STORAGE_KEYS.ORDERS}`,
    Prisma.sql`JSON_EXTRACT(br.data, '$.deletedAt') IS NULL`,
    ...exactJson('br', '$.customerId', filters.customerId),
    ...exactJson('br', '$.productLevel', filters.productLevel),
    ...exactJson('br', '$.orderType', filters.orderType),
    ...exactJson('br', '$.paymentMethod', filters.paymentMethod),
  ];
  if (filters.status) conditions.push(Prisma.sql`br.status = ${filters.status}`);
  if (filters.owner) conditions.push(Prisma.sql`(br.owner = ${filters.owner} OR ${jsonText('br', '$.salesName')} = ${filters.owner})`);
  if (filters.startDate) conditions.push(Prisma.sql`${jsonText('br', '$.createdAt')} >= ${dateBoundary(filters.startDate, false)}`);
  if (filters.endDate) conditions.push(Prisma.sql`${jsonText('br', '$.createdAt')} <= ${dateBoundary(filters.endDate, true)}`);
  if (filters.paymentStartDate || filters.paymentEndDate) {
    const paymentConditions: Prisma.Sql[] = [];
    if (filters.paymentStartDate) paymentConditions.push(Prisma.sql`stored_payment.paidAt >= ${dateBoundary(filters.paymentStartDate, false)}`);
    if (filters.paymentEndDate) paymentConditions.push(Prisma.sql`stored_payment.paidAt <= ${dateBoundary(filters.paymentEndDate, true)}`);
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM JSON_TABLE(
        COALESCE(JSON_EXTRACT(br.data, '$.payments'), JSON_ARRAY()),
        '$[*]' COLUMNS (paidAt VARCHAR(64) PATH '$.paidAt', amount DECIMAL(18,2) PATH '$.amount' NULL ON ERROR)
      ) AS stored_payment
      WHERE stored_payment.amount > 0 AND ${Prisma.join(paymentConditions, ' AND ')}
    )`);
  }
  if (!scope.unrestricted) {
    const salesId = jsonText('br', '$.salesId');
    const ownerName = Prisma.sql`COALESCE(NULLIF(${jsonText('br', '$.salesName')}, ''), ${jsonText('br', '$.owner')})`;
    const idMatch = scope.visibleUserIds.length ? Prisma.sql`${salesId} IN (${Prisma.join(scope.visibleUserIds)})` : Prisma.sql`FALSE`;
    const nameMatch = scope.visibleUserNames.length ? Prisma.sql`${ownerName} IN (${Prisma.join(scope.visibleUserNames)})` : Prisma.sql`FALSE`;
    conditions.push(Prisma.sql`(${idMatch} OR (COALESCE(${salesId}, '') = '' AND ${nameMatch}))`);
  }
  const search = lowerText(filters.search);
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(Prisma.sql`(LOWER(br.recordId) LIKE ${pattern} OR LOWER(COALESCE(br.title, '')) LIKE ${pattern} OR LOWER(COALESCE(br.owner, '')) LIKE ${pattern} OR LOWER(${jsonText('br', '$.orderNo')}) LIKE ${pattern} OR LOWER(${jsonText('br', '$.customerName')}) LIKE ${pattern} OR LOWER(${jsonText('br', '$.productName')}) LIKE ${pattern} OR LOWER(${jsonText('br', '$.thirdPartyOrderNo')}) LIKE ${pattern} OR LOWER(${jsonText('br', '$.payments[0].paymentOrderNo')}) LIKE ${pattern})`);
  }
  return queryBusinessRecordPage<Order>(prisma, {
    from: 'business_records br', selectId: 'br.id', selectData: 'br.data', conditions,
    orderBy: filters.sortBy === 'paymentDate'
      ? `COALESCE(JSON_UNQUOTE(JSON_EXTRACT(br.data, '$.payments[0].paidAt')), JSON_UNQUOTE(JSON_EXTRACT(br.data, '$.createdAt')), br.createdAt) ${filters.sortDirection === 'asc' ? 'ASC' : 'DESC'}, br.id ASC`
      : `COALESCE(JSON_UNQUOTE(JSON_EXTRACT(br.data, '$.createdAt')), br.createdAt) ${filters.sortDirection === 'asc' ? 'ASC' : 'DESC'}, br.id ASC`,
    page, pageSize,
  });
}

async function queryApplicationPage(
  prisma: OrderQueryPrisma,
  filters: OrderApplicationFilters,
  scope: DataVisibilityScope,
) {
  const page = toPositiveInt(filters.page, 1);
  const pageSize = Math.min(toPositiveInt(filters.pageSize, DEFAULT_PAGE_SIZE), 100);
  const conditions: Prisma.Sql[] = [
    Prisma.sql`br.domain = ${STORAGE_KEYS.ORDER_APPLICATIONS}`,
    Prisma.sql`JSON_EXTRACT(br.data, '$.reviewCleanedAt') IS NULL`,
  ];
  if (filters.statuses?.length) conditions.push(Prisma.sql`br.status IN (${Prisma.join(filters.statuses)})`);
  else if (filters.status) conditions.push(Prisma.sql`br.status = ${filters.status}`);
  conditions.push(...exactJson('br', '$.applicantName', filters.applicantName));
  conditions.push(...exactJson('br', '$.reviewerName', filters.reviewerName));
  if (filters.owner) {
    conditions.push(Prisma.sql`(${jsonText('br', '$.orderData.owner')} = ${filters.owner} OR ${jsonText('br', '$.orderData.salesName')} = ${filters.owner})`);
  }
  conditions.push(...exactJson('br', '$.importBatchId', filters.importBatchId));
  if (filters.startDate) conditions.push(Prisma.sql`COALESCE(${jsonText('br', '$.submittedAt')}, ${jsonText('br', '$.createdAt')}) >= ${filters.startDate}`);
  if (filters.endDate) conditions.push(Prisma.sql`COALESCE(${jsonText('br', '$.submittedAt')}, ${jsonText('br', '$.createdAt')}) <= ${/^\d{4}-\d{2}-\d{2}$/.test(filters.endDate) ? `${filters.endDate}T23:59:59.999Z` : filters.endDate}`);
  const paymentDate = Prisma.sql`COALESCE(${jsonText('br', '$.orderData.payments[0].paidAt')}, ${jsonText('br', '$.createdAt')}, br.createdAt)`;
  if (filters.paymentStartDate) conditions.push(Prisma.sql`${paymentDate} >= ${filters.paymentStartDate}`);
  if (filters.paymentEndDate) conditions.push(Prisma.sql`${paymentDate} <= ${/^\d{4}-\d{2}-\d{2}$/.test(filters.paymentEndDate) ? `${filters.paymentEndDate}T23:59:59.999Z` : filters.paymentEndDate}`);
  if (!scope.unrestricted) conditions.push(visibleJsonCondition(
    'br', ['$.applicantId'], ['$.applicantName'], scope.visibleUserIds, scope.visibleUserNames,
  ));
  const search = lowerText(filters.search);
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(Prisma.sql`(LOWER(br.recordId) LIKE ${pattern} OR LOWER(COALESCE(br.title, '')) LIKE ${pattern} OR LOWER(${jsonText('br', '$.applicationNo')}) LIKE ${pattern} OR LOWER(${jsonText('br', '$.applicantName')}) LIKE ${pattern} OR LOWER(${jsonText('br', '$.orderNo')}) LIKE ${pattern} OR LOWER(${jsonText('br', '$.orderData.customerName')}) LIKE ${pattern})`);
  }
  return queryBusinessRecordPage<OrderApplication>(prisma, {
    from: 'business_records br', selectId: 'br.id', selectData: 'br.data', conditions,
    orderBy: filters.sortBy === 'paymentDate'
      ? `COALESCE(JSON_UNQUOTE(JSON_EXTRACT(br.data, '$.orderData.payments[0].paidAt')), JSON_UNQUOTE(JSON_EXTRACT(br.data, '$.createdAt')), br.createdAt) ${filters.sortDirection === 'asc' ? 'ASC' : 'DESC'}, br.id ASC`
      : `COALESCE(JSON_UNQUOTE(JSON_EXTRACT(br.data, '$.createdAt')), br.createdAt) ${filters.sortDirection === 'asc' ? 'ASC' : 'DESC'}, br.id ASC`,
    page, pageSize,
  });
}

export interface OrderQueryServiceOptions {
  now?: () => Date;
}

export function createOrderQueryService(
  prisma: OrderQueryPrisma,
  options: OrderQueryServiceOptions = {},
) {
  return {
    async listOrders(filters: OrderFilters = {}, actor: AuthenticatedUser) {
      const [scope, rows, commissionRows] = await Promise.all([
        loadScope(prisma, actor, 'orders'),
        prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.ORDERS } }),
        prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.COMMISSIONS } }),
      ]);
      const commissionsByOrder = new Map<string, Commission[]>();
      (commissionRows as BusinessRecordRow[])
        .map((row) => parseRecord<Commission>(row.data))
        .filter((commission): commission is Commission => Boolean(
          commission
          && commission.sourceBusinessType !== 'after_sales_recovery'
          && commission.sourceBusinessType !== 'refund_recovery'
          && !commission.sourceRecoveryOrderId,
        ))
        .forEach((commission) => commissionsByOrder.set(
          commission.orderId,
          [...(commissionsByOrder.get(commission.orderId) || []), commission],
        ));
      const items = (rows as BusinessRecordRow[])
        .map((row) => parseRecord<Order>(row.data))
        .filter((order): order is Order => Boolean(order && !order.deletedAt))
        .map((order) => ({
          ...order,
          settlementStatus: deriveOrderListSettlementProgress(commissionsByOrder.get(order.id) || []),
        }))
        .filter((order) => orderIsVisible(order, scope) && matchesOrder(order, filters))
        .sort((left, right) => compareOrders(left, right, filters));
      const result = paginate(items, filters.page, filters.pageSize);
      const sourceApplicationIds = result.items
        .filter((order) => !order.createdByName && order.sourceApplicationId)
        .map((order) => order.sourceApplicationId!);
      const applicationRows = sourceApplicationIds.length
        ? await prisma.businessRecord.findMany({
          where: { domain: STORAGE_KEYS.ORDER_APPLICATIONS, recordId: { in: sourceApplicationIds } },
        })
        : [];
      const applications = new Map((applicationRows as BusinessRecordRow[])
        .map((row) => parseRecord<OrderApplication>(row.data))
        .filter((application): application is OrderApplication => Boolean(application))
        .map((application) => [application.id, application]));
      return success({
        ...result,
        items: result.items.map((order) => compactOrderListItem(enrichOrderCreator(order, applications))),
      });
    },

    async getOrder(orderId: string, actor: AuthenticatedUser) {
      const id = cleanText(orderId);
      if (!id) return failure<Order>('订单ID不能为空', 400);
      const [row, scope, commissionRows] = await Promise.all([
        prisma.businessRecord.findUnique({
          where: { domain_recordId: { domain: STORAGE_KEYS.ORDERS, recordId: id } },
        }),
        loadScope(prisma, actor, 'orders'),
        prisma.businessRecord.findMany({
          where: { domain: STORAGE_KEYS.COMMISSIONS, orderId: id },
        }),
      ]);
      if (!row) return failure<Order>('订单不存在', 404);
      let order = parseRecord<Order>(row.data);
      if (!order) return failure<Order>('订单数据损坏，请先修复数据', 409);
      if (order.deletedAt) return failure<Order>('订单不存在', 404);
      if (!orderIsVisible(order, scope)) return failure<Order>('无权查看该订单', 403);
      const canViewHistory = hasPermission(actor, PERMISSION_KEYS.ORDER_HISTORY);
      let sourceApplication: OrderApplication | null = null;
      if (order.sourceApplicationId && (!order.createdByName || canViewHistory)) {
        const applicationRow = await prisma.businessRecord.findUnique({
          where: { domain_recordId: { domain: STORAGE_KEYS.ORDER_APPLICATIONS, recordId: order.sourceApplicationId } },
        });
        sourceApplication = applicationRow ? parseRecord<OrderApplication>(applicationRow.data) : null;
        if (sourceApplication && !order.createdByName) {
          order = enrichOrderCreator(order, new Map([[sourceApplication.id, sourceApplication]]));
        }
      }
      order = await enrichLegacyOrderLeadSource(prisma, order);
      const commissions = (commissionRows as BusinessRecordRow[])
        .map((commissionRow) => parseRecord<Commission>(commissionRow.data))
        .filter((commission): commission is Commission => Boolean(
          commission
          && commission.orderId === id
          && commission.sourceBusinessType !== 'after_sales_recovery'
          && commission.sourceBusinessType !== 'refund_recovery'
          && !commission.sourceRecoveryOrderId,
        ));
      order = {
        ...order,
        settlementStatus: deriveOrderListSettlementProgress(commissions),
        changeHistory: canViewHistory ? order.changeHistory || [] : undefined,
        reviewLogs: canViewHistory ? sourceApplication?.reviewLogs || [] : undefined,
      };
      return success(order);
    },

    async listApplications(filters: OrderApplicationFilters = {}, actor: AuthenticatedUser) {
      const scope = await loadScope(prisma, actor, 'orderApplications');
      if (scope.unrestricted && typeof prisma.$queryRaw === 'function') {
        const result = await queryApplicationPage(prisma, filters, scope);
        const enrichedItems = await enrichApplicationSourceOrderState(prisma, result.items);
        const page = toPositiveInt(filters.page, 1);
        const pageSize = Math.min(toPositiveInt(filters.pageSize, DEFAULT_PAGE_SIZE), 100);
        return success({
          items: enrichedItems.map(compactOrderApplicationListItem),
          pagination: { page, pageSize, total: result.total, totalPages: Math.ceil(result.total / pageSize) },
        });
      }
      const rows = await prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.ORDER_APPLICATIONS } });
      const items = (rows as BusinessRecordRow[])
        .map((row) => parseRecord<OrderApplication>(row.data))
        .filter((application): application is OrderApplication => Boolean(application))
        .filter((application) => !application.reviewCleanedAt)
        .filter((application) => applicationIsVisible(application, scope) && matchesApplication(application, filters))
        .sort((left, right) => {
          const direction = filters.sortDirection === 'asc' ? 1 : -1;
          return direction * (
            applicationSortTimestamp(left, filters.sortBy)
            - applicationSortTimestamp(right, filters.sortBy)
          ) || left.id.localeCompare(right.id);
        });
      const result = paginate(items, filters.page, filters.pageSize);
      const enrichedItems = await enrichApplicationSourceOrderState(prisma, result.items);
      return success({ ...result, items: enrichedItems.map(compactOrderApplicationListItem) });
    },

    async listOwnerCandidates(actor: AuthenticatedUser) {
      const [userRows, roleRows, departments] = await Promise.all([
        prisma.user.findMany({ where: { isActive: true, employmentStatus: 'active' }, orderBy: { createdAt: 'asc' } }),
        prisma.role.findMany({ where: { isActive: true } }),
        prisma.department.findMany(),
      ]);
      const users = userRows.map(mapPrismaUser);
      const scope = buildDataVisibilityScopeForUser(
        actor,
        users,
        roleRows.map(mapPrismaRole),
        departments as any,
        'orders',
      );
      return success(scope.unrestricted
        ? users
        : users.filter((user) => scope.visibleUserIds.includes(user.id) || scope.visibleUserNames.includes(user.name)));
    },

    async listApplicationOwnerCandidates(actor: AuthenticatedUser) {
      const [userRows, roleRows, departments] = await Promise.all([
        prisma.user.findMany({ where: { isActive: true, employmentStatus: 'active' }, orderBy: { createdAt: 'asc' } }),
        prisma.role.findMany({ where: { isActive: true } }),
        prisma.department.findMany(),
      ]);
      const users = userRows.map(mapPrismaUser);
      const scope = buildDataVisibilityScopeForUser(
        actor,
        users,
        roleRows.map(mapPrismaRole),
        departments as any,
        'orderApplications',
      );
      return success(scope.unrestricted
        ? users
        : users.filter((user) => scope.visibleUserIds.includes(user.id) || scope.visibleUserNames.includes(user.name)));
    },

    async getOrderStats(actor: AuthenticatedUser) {
      const [rows, scope] = await Promise.all([
        prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.ORDERS } }),
        loadScope(prisma, actor, 'orders'),
      ]);
      const orders = (rows as BusinessRecordRow[])
        .map((row) => parseRecord<Order>(row.data))
        .filter((order): order is Order => Boolean(order && !order.deletedAt))
        .filter((order) => orderIsVisible(order, scope));
      const current = options.now?.() || new Date();
      const todayStart = new Date(
        current.getFullYear(),
        current.getMonth(),
        current.getDate(),
      ).getTime();
      const monthStart = new Date(current.getFullYear(), current.getMonth(), 1).getTime();
      const todayOrders = orders.filter((order) => timestamp(order.createdAt) >= todayStart);
      const monthOrders = orders.filter((order) => timestamp(order.createdAt) >= monthStart);
      const refundedOrders = orders.filter((order) => (
        order.status === '已退款' || order.refundStatus === '退款已完成'
      ));
      const upgradeOrders = orders.filter((order) => (
        order.orderType === '升级' || order.orderType === '代理升单'
      ));
      // 订单统计必须与列表、详情统一采用实际成交金额；标准价仅作为旧数据兜底。
      const amount = (order: Order) => Number(order.actualAmount ?? order.amount) || 0;
      const refundAmount = (order: Order) => Number(order.refundAmount ?? order.actualAmount ?? order.amount) || 0;
      return success<OrderStats>({
        todayAmount: todayOrders.reduce((sum, order) => sum + amount(order), 0),
        todayCount: todayOrders.length,
        monthAmount: monthOrders.reduce((sum, order) => sum + amount(order), 0),
        monthCount: monthOrders.length,
        refundCount: refundedOrders.length,
        refundAmount: refundedOrders.reduce((sum, order) => sum + refundAmount(order), 0),
        upgradeCount: upgradeOrders.length,
        upgradeAmount: upgradeOrders.reduce((sum, order) => sum + amount(order), 0),
      });
    },

    async getApplication(applicationId: string, actor: AuthenticatedUser) {
      const id = cleanText(applicationId);
      if (!id) return failure<OrderApplication>('订单申请ID不能为空', 400);
      const [row, scope] = await Promise.all([
        prisma.businessRecord.findUnique({
          where: { domain_recordId: { domain: STORAGE_KEYS.ORDER_APPLICATIONS, recordId: id } },
        }),
        loadScope(prisma, actor, 'orderApplications'),
      ]);
      if (!row) return failure<OrderApplication>('订单申请不存在', 404);
      const application = parseRecord<OrderApplication>(row.data);
      if (!application) return failure<OrderApplication>('订单申请数据损坏，请先修复数据', 409);
      if (application.reviewCleanedAt) return failure<OrderApplication>('订单申请不存在', 404);
      if (!applicationIsVisible(application, scope)) return failure<OrderApplication>('无权查看该订单申请', 403);
      const [enrichedApplication] = await enrichApplicationSourceOrderState(prisma, [application]);
      const orderData = await enrichLegacyOrderLeadSource(prisma, enrichedApplication.orderData as Order);
      return success({ ...enrichedApplication, orderData: orderData as OrderApplication['orderData'] });
    },
  };
}
