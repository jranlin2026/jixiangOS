import type { PrismaClient } from '@prisma/client';
import { failure, success } from '../api/response';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { buildDataVisibilityScopeForUser, type DataVisibilityScope } from '../../src/shared/utils/dataVisibility';
import { mapPrismaRole, mapPrismaUser } from '../db/prismaMappers';
import type { AuthenticatedUser } from '../../src/types/auth';
import type {
  Delivery,
  DeliveryCreatableOrderSummary,
  DeliveryFilters,
  DeliveryListResponse,
  DeliveryOverallStatus,
  DeliveryStats,
} from '../../src/types/delivery';
import type { Order } from '../../src/types/order';
import type { Product } from '../../src/types/product';

type DeliveryQueryPrisma = Pick<PrismaClient, 'businessRecord' | 'user' | 'role' | 'department'>;
type Row = { data: unknown };

const STATUS_OPTIONS: DeliveryOverallStatus[] = ['全部', '待开始', '交付中', '超期', '阻塞', '待验收', '已完成'];

function parse<T extends object>(value: unknown): T | null {
  try {
    const result = typeof value === 'string' ? JSON.parse(value) : value;
    return result && typeof result === 'object' && !Array.isArray(result) ? result as T : null;
  } catch {
    return null;
  }
}

function timestamp(value: unknown): number {
  const result = new Date(String(value || '')).getTime();
  return Number.isFinite(result) ? result : 0;
}

function relationVisible(order: Order | undefined, delivery: Delivery | undefined, scope: DataVisibilityScope): boolean {
  if (scope.unrestricted) return true;
  const relation = (id: string | undefined, names: Array<string | undefined>) => id
    ? scope.visibleUserIds.includes(id)
    : names.some((name) => Boolean(name && scope.visibleUserNames.includes(name)));
  return relation(order?.salesId, [order?.salesName, order?.owner])
    || relation(order?.successId, [order?.successName])
    || relation(order?.serviceId, [order?.serviceName])
    || relation(delivery?.ownerId, [delivery?.owner])
    || relation(delivery?.salesOwnerId, [delivery?.salesOwner]);
}

async function loadScope(prisma: DeliveryQueryPrisma, actor: AuthenticatedUser): Promise<DataVisibilityScope> {
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
    'deliveries',
  );
}

function inDateRange(value: string | undefined, start?: string, end?: string): boolean {
  if (!start && !end) return true;
  const valueTime = timestamp(value);
  if (!valueTime) return false;
  if (start && valueTime < timestamp(start)) return false;
  if (end) {
    const endDate = new Date(end);
    if (/^\d{4}-\d{2}-\d{2}$/.test(end)) endDate.setHours(23, 59, 59, 999);
    if (valueTime > endDate.getTime()) return false;
  }
  return true;
}

function matches(delivery: Delivery, filters: DeliveryFilters): boolean {
  if (filters.productType && delivery.productType !== filters.productType) return false;
  if (filters.stage && delivery.currentStage !== filters.stage) return false;
  if (filters.owner && delivery.owner !== filters.owner) return false;
  if (filters.ownerId && delivery.ownerId !== filters.ownerId) return false;
  if (filters.salesOwner && delivery.salesOwner !== filters.salesOwner) return false;
  if (filters.priority && delivery.priority !== filters.priority) return false;
  if (filters.status && filters.status !== '全部' && delivery.status !== filters.status) return false;
  if (!inDateRange(delivery.paymentDate, filters.paymentStart, filters.paymentEnd)) return false;
  if (!inDateRange(delivery.plannedCompletedAt, filters.plannedStart, filters.plannedEnd)) return false;
  const search = String(filters.search || '').trim().toLocaleLowerCase();
  return !search || [delivery.orderNo, delivery.customerName, delivery.productName, delivery.owner, delivery.salesOwner]
    .some((value) => String(value || '').toLocaleLowerCase().includes(search));
}

function buildStats(deliveries: Delivery[]): DeliveryStats {
  const statusCounts = Object.fromEntries(STATUS_OPTIONS.map((status) => [status, 0])) as DeliveryStats['statusCounts'];
  statusCounts['全部'] = deliveries.length;
  const stages = new Map<string, number>();
  const owners = new Map<string, DeliveryStats['ownerWorkload'][number]>();
  deliveries.forEach((delivery) => {
    if (delivery.status) statusCounts[delivery.status] += 1;
    stages.set(delivery.currentStage, (stages.get(delivery.currentStage) || 0) + 1);
    const key = delivery.ownerId || delivery.owner || '待分配';
    const owner = owners.get(key) || { owner: delivery.owner || '待分配', ownerId: delivery.ownerId, total: 0, overdue: 0, blocked: 0, completed: 0 };
    owner.total += 1;
    if (delivery.status === '超期') owner.overdue += 1;
    if (delivery.status === '阻塞') owner.blocked += 1;
    if (delivery.status === '已完成') owner.completed += 1;
    owners.set(key, owner);
  });
  return {
    total: deliveries.length,
    statusCounts,
    stageCounts: Array.from(stages, ([stage, count]) => ({ stage, count })),
    ownerWorkload: Array.from(owners.values()),
    overdueCount: deliveries.filter((delivery) => delivery.status === '超期').length,
  };
}

export function createDeliveryQueryService(prisma: DeliveryQueryPrisma) {
  async function visibleDeliveries(filters: DeliveryFilters, actor: AuthenticatedUser) {
    const [deliveryRows, orderRows, scope] = await Promise.all([
      prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.DELIVERIES } }),
      prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.ORDERS } }),
      loadScope(prisma, actor),
    ]);
    const orders = new Map((orderRows as Row[])
      .map((row) => parse<Order>(row.data))
      .filter((order): order is Order => Boolean(order))
      .map((order) => [order.id, order]));
    return (deliveryRows as Row[])
      .map((row) => parse<Delivery>(row.data))
      .filter((delivery): delivery is Delivery => Boolean(delivery))
      .filter((delivery) => relationVisible(orders.get(delivery.orderId), delivery, scope) && matches(delivery, filters))
      .sort((left, right) => timestamp(right.updatedAt) - timestamp(left.updatedAt));
  }

  return {
    async list(filters: DeliveryFilters = {}, actor: AuthenticatedUser) {
      const deliveries = await visibleDeliveries(filters, actor);
      const page = Math.max(1, Number(filters.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize) || 10));
      const data: DeliveryListResponse = {
        items: deliveries.slice((page - 1) * pageSize, page * pageSize),
        total: deliveries.length,
        page,
        pageSize,
      };
      return success(data);
    },

    async get(deliveryId: string, actor: AuthenticatedUser) {
      const id = String(deliveryId || '').trim();
      if (!id) return failure<Delivery>('交付单ID不能为空', 400);
      const row = await prisma.businessRecord.findUnique({
        where: { domain_recordId: { domain: STORAGE_KEYS.DELIVERIES, recordId: id } },
      });
      if (!row) return failure<Delivery>('交付单不存在', 404);
      const delivery = parse<Delivery>(row.data);
      if (!delivery) return failure<Delivery>('交付单数据损坏，请先修复数据', 409);
      const [orderRow, scope] = await Promise.all([
        prisma.businessRecord.findUnique({
          where: { domain_recordId: { domain: STORAGE_KEYS.ORDERS, recordId: delivery.orderId } },
        }),
        loadScope(prisma, actor),
      ]);
      const order = orderRow ? parse<Order>(orderRow.data) || undefined : undefined;
      if (!relationVisible(order, delivery, scope)) return failure<Delivery>('无权查看该交付单', 403);
      return success(delivery);
    },

    async stats(filters: DeliveryFilters = {}, actor: AuthenticatedUser) {
      return success(buildStats(await visibleDeliveries({ ...filters, status: '全部', page: undefined, pageSize: undefined }, actor)));
    },

    async listCreatableOrders(search: string, actor: AuthenticatedUser) {
      const [orderRows, deliveryRows, productRows, scope] = await Promise.all([
        prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.ORDERS } }),
        prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.DELIVERIES } }),
        prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.PRODUCTS } }),
        loadScope(prisma, actor),
      ]);
      const deliveryOrderIds = new Set((deliveryRows as Row[])
        .map((row) => parse<Delivery>(row.data)?.orderId)
        .filter(Boolean));
      const products = new Map((productRows as Row[])
        .map((row) => parse<Product>(row.data))
        .filter((product): product is Product => Boolean(product && product.isActive !== false))
        .map((product) => [product.id, product]));
      const keyword = String(search || '').trim().toLocaleLowerCase();
      const items = (orderRows as Row[])
        .map((row) => parse<Order>(row.data))
        .filter((order): order is Order => Boolean(order && !order.deletedAt && order.status === '已确认'))
        .filter((order) => !deliveryOrderIds.has(order.id) && relationVisible(order, undefined, scope))
        .filter((order) => Boolean(order.productId && products.has(order.productId)))
        .filter((order) => !keyword || [order.orderNo, order.customerName, order.productName, order.productLevel, order.salesName, order.owner]
          .some((value) => String(value || '').toLocaleLowerCase().includes(keyword)))
        .sort((left, right) => timestamp(right.createdAt) - timestamp(left.createdAt))
        .slice(0, 80)
        .map<DeliveryCreatableOrderSummary>((order) => {
          const product = products.get(order.productId!)!;
          return {
            orderId: order.id,
            orderNo: order.orderNo,
            customerId: order.customerId,
            customerName: order.customerName,
            productName: order.productName,
            productType: order.productLevel,
            orderAmount: order.actualAmount ?? order.amount,
            paymentDate: order.payments?.[0]?.paidAt || order.createdAt,
            orderType: order.orderType || order.dealScene,
            salesOwner: order.salesName || order.owner,
          };
        });
      return success(items);
    },
  };
}
