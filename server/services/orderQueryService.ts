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
import {
  buildDataVisibilityScopeForUser,
  type DataVisibilityScope,
} from '../../src/shared/utils/dataVisibility';
import { mapPrismaRole, mapPrismaUser } from '../db/prismaMappers';
import { jsonText, queryBusinessRecordPage, visibleJsonCondition } from './businessRecordPageService';
import { compactOrderApplicationListItem, compactOrderListItem } from '../../src/shared/utils/listPayload';

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

function inDateRange(value: unknown, startDate?: string, endDate?: string): boolean {
  const time = timestamp(value);
  if (startDate && time < timestamp(startDate)) return false;
  if (endDate) {
    const end = new Date(endDate);
    if (/^\d{4}-\d{2}-\d{2}$/.test(endDate)) end.setHours(23, 59, 59, 999);
    if (time > end.getTime()) return false;
  }
  return true;
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
    order.salesName,
    order.owner,
  ].some((value) => lowerText(value).includes(search))) return false;
  if (filters.customerId && order.customerId !== filters.customerId) return false;
  if (filters.productLevel && order.productLevel !== filters.productLevel) return false;
  if (filters.status && order.status !== filters.status) return false;
  if (filters.owner && order.owner !== filters.owner && order.salesName !== filters.owner) return false;
  if (filters.orderType && order.orderType !== filters.orderType) return false;
  if (filters.paymentMethod && order.paymentMethod !== filters.paymentMethod) return false;
  return inDateRange(order.createdAt, filters.startDate, filters.endDate);
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
  if (filters.status && application.status !== filters.status) return false;
  if (filters.applicantName && application.applicantName !== filters.applicantName) return false;
  if (filters.reviewerName && application.reviewerName !== filters.reviewerName) return false;
  return inDateRange(application.submittedAt || application.createdAt, filters.startDate, filters.endDate);
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
  if (filters.startDate) conditions.push(Prisma.sql`${jsonText('br', '$.createdAt')} >= ${filters.startDate}`);
  if (filters.endDate) conditions.push(Prisma.sql`${jsonText('br', '$.createdAt')} <= ${/^\d{4}-\d{2}-\d{2}$/.test(filters.endDate) ? `${filters.endDate}T23:59:59.999Z` : filters.endDate}`);
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
    conditions.push(Prisma.sql`(LOWER(br.recordId) LIKE ${pattern} OR LOWER(COALESCE(br.title, '')) LIKE ${pattern} OR LOWER(COALESCE(br.owner, '')) LIKE ${pattern} OR LOWER(${jsonText('br', '$.orderNo')}) LIKE ${pattern} OR LOWER(${jsonText('br', '$.customerName')}) LIKE ${pattern} OR LOWER(${jsonText('br', '$.productName')}) LIKE ${pattern})`);
  }
  return queryBusinessRecordPage<Order>(prisma, {
    from: 'business_records br', selectId: 'br.id', selectData: 'br.data', conditions,
    orderBy: `COALESCE(br.eventAt, br.updatedAt, br.createdAt) ${filters.sortDirection === 'asc' ? 'ASC' : 'DESC'}`,
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
  const conditions: Prisma.Sql[] = [Prisma.sql`br.domain = ${STORAGE_KEYS.ORDER_APPLICATIONS}`];
  if (filters.status) conditions.push(Prisma.sql`br.status = ${filters.status}`);
  conditions.push(...exactJson('br', '$.applicantName', filters.applicantName));
  conditions.push(...exactJson('br', '$.reviewerName', filters.reviewerName));
  if (filters.startDate) conditions.push(Prisma.sql`COALESCE(${jsonText('br', '$.submittedAt')}, ${jsonText('br', '$.createdAt')}) >= ${filters.startDate}`);
  if (filters.endDate) conditions.push(Prisma.sql`COALESCE(${jsonText('br', '$.submittedAt')}, ${jsonText('br', '$.createdAt')}) <= ${/^\d{4}-\d{2}-\d{2}$/.test(filters.endDate) ? `${filters.endDate}T23:59:59.999Z` : filters.endDate}`);
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
    orderBy: 'COALESCE(br.eventAt, br.updatedAt, br.createdAt) DESC', page, pageSize,
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
      const scope = await loadScope(prisma, actor, 'orders');
      const rows = await prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.ORDERS } });
      const direction = filters.sortDirection === 'asc' ? 1 : -1;
      const items = (rows as BusinessRecordRow[])
        .map((row) => parseRecord<Order>(row.data))
        .filter((order): order is Order => Boolean(order && !order.deletedAt))
        .filter((order) => orderIsVisible(order, scope) && matchesOrder(order, filters))
        .sort((left, right) => direction * (timestamp(left.updatedAt || left.createdAt) - timestamp(right.updatedAt || right.createdAt)));
      const result = paginate(items, filters.page, filters.pageSize);
      return success({ ...result, items: result.items.map(compactOrderListItem) });
    },

    async getOrder(orderId: string, actor: AuthenticatedUser) {
      const id = cleanText(orderId);
      if (!id) return failure<Order>('订单ID不能为空', 400);
      const [row, scope] = await Promise.all([
        prisma.businessRecord.findUnique({
          where: { domain_recordId: { domain: STORAGE_KEYS.ORDERS, recordId: id } },
        }),
        loadScope(prisma, actor, 'orders'),
      ]);
      if (!row) return failure<Order>('订单不存在', 404);
      const order = parseRecord<Order>(row.data);
      if (!order) return failure<Order>('订单数据损坏，请先修复数据', 409);
      if (order.deletedAt) return failure<Order>('订单不存在', 404);
      if (!orderIsVisible(order, scope)) return failure<Order>('无权查看该订单', 403);
      return success(order);
    },

    async listApplications(filters: OrderApplicationFilters = {}, actor: AuthenticatedUser) {
      const scope = await loadScope(prisma, actor, 'orderApplications');
      if (scope.unrestricted && typeof prisma.$queryRaw === 'function') {
        const result = await queryApplicationPage(prisma, filters, scope);
        const page = toPositiveInt(filters.page, 1);
        const pageSize = Math.min(toPositiveInt(filters.pageSize, DEFAULT_PAGE_SIZE), 100);
        return success({
          items: result.items.map(compactOrderApplicationListItem),
          pagination: { page, pageSize, total: result.total, totalPages: Math.ceil(result.total / pageSize) },
        });
      }
      const rows = await prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.ORDER_APPLICATIONS } });
      const items = (rows as BusinessRecordRow[])
        .map((row) => parseRecord<OrderApplication>(row.data))
        .filter((application): application is OrderApplication => Boolean(application))
        .filter((application) => applicationIsVisible(application, scope) && matchesApplication(application, filters))
        .sort((left, right) => timestamp(right.updatedAt || right.createdAt) - timestamp(left.updatedAt || left.createdAt));
      const result = paginate(items, filters.page, filters.pageSize);
      return success({ ...result, items: result.items.map(compactOrderApplicationListItem) });
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
      const amount = (order: Order) => Number(order.amount) || 0;
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
      if (!applicationIsVisible(application, scope)) return failure<OrderApplication>('无权查看该订单申请', 403);
      return success(application);
    },
  };
}
