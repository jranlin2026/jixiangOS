import type { PrismaClient } from '@prisma/client';
import { failure, success } from '../api/response';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { buildDataVisibilityScopeForUser } from '../../src/shared/utils/dataVisibility';
import { mapPrismaRole, mapPrismaUser } from '../db/prismaMappers';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { Refund, RefundFilters } from '../../src/types/refund';
import type { Order } from '../../src/types/order';

type Client = Pick<PrismaClient, 'businessRecord' | 'user' | 'role' | 'department'>;

const parse = <T extends object>(value: unknown): T | null => {
  try {
    const result = typeof value === 'string' ? JSON.parse(value) : value;
    return result && typeof result === 'object' && !Array.isArray(result) ? result as T : null;
  } catch { return null; }
};

const boundary = (value: string, end: boolean) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  ? new Date(`${value}${end ? 'T23:59:59.999' : 'T00:00:00.000'}+08:00`).getTime()
  : new Date(value).getTime();

export function createRefundQueryService(prisma: Client) {
  return {
    async list(filters: RefundFilters, actor: AuthenticatedUser) {
      const [users, roles, departments, rows] = await Promise.all([
        prisma.user.findMany(),
        prisma.role.findMany({ where: { isActive: true } }),
        prisma.department.findMany(),
        prisma.businessRecord.findMany({
          where: { domain: { in: [STORAGE_KEYS.ORDERS, STORAGE_KEYS.REFUNDS] } },
          select: { domain: true, recordId: true, data: true },
        }),
      ]);
      const scope = buildDataVisibilityScopeForUser(
        actor, users.map(mapPrismaUser), roles.map(mapPrismaRole), departments as any, 'orders',
      );
      const visibleIds = new Set(scope.visibleUserIds);
      const visibleNames = new Set(scope.visibleUserNames);
      const orders = rows
        .filter((row: any) => row.domain === STORAGE_KEYS.ORDERS)
        .map((row: any) => parse<Order>(row.data))
        .filter((order): order is Order => Boolean(order && !order.deletedAt))
        .filter((order) => scope.unrestricted || (
          order.salesId ? visibleIds.has(order.salesId) : visibleNames.has(order.salesName || order.owner || '')
        ));
      const orderById = new Map(orders.map((order) => [order.id, order]));
      const refunds = rows
        .filter((row: any) => row.domain === STORAGE_KEYS.REFUNDS)
        .map((row: any) => parse<Refund>(row.data))
        .filter((refund): refund is Refund => Boolean(refund && orderById.has(refund.orderId)));
      const explicitOrderIds = new Set(refunds.map((refund) => refund.orderId));
      const legacyRefunds: Refund[] = orders
        .filter((order) => !explicitOrderIds.has(order.id) && (order.status === '已退款' || order.refundStatus === '退款已完成'))
        .map((order) => ({
          id: `legacy-refund-${order.id}`,
          refundNo: `历史退款-${order.orderNo}`,
          orderId: order.id,
          orderNo: order.orderNo,
          customerId: order.customerId,
          customerName: order.customerName,
          productName: order.productName,
          productLevel: order.productLevel,
          orderAmount: Number(order.actualAmount || order.amount || 0),
          refundAmount: Number(order.refundAmount || 0),
          refundReason: '历史订单退款记录',
          refundCategory: '其他',
          status: '退款已完成',
          applicantId: order.salesId || '',
          applicantName: order.salesName || order.owner || '历史记录',
          refundedAt: order.updatedAt,
          completedAt: order.updatedAt,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
        }));
      let items = [...refunds, ...legacyRefunds];
      if (filters.status) items = items.filter((item) => item.status === filters.status);
      if (filters.startDate || filters.endDate) items = items.filter((item) => {
        const time = new Date(item.refundedAt || item.completedAt || item.createdAt).getTime();
        return (!filters.startDate || time >= boundary(filters.startDate, false))
          && (!filters.endDate || time <= boundary(filters.endDate, true));
      });
      if (filters.search) {
        const search = filters.search.trim().toLocaleLowerCase();
        items = items.filter((item) => [item.refundNo, item.orderNo, item.customerName]
          .some((value) => String(value || '').toLocaleLowerCase().includes(search)));
      }
      items.sort((a, b) => new Date(b.refundedAt || b.completedAt || b.createdAt).getTime()
        - new Date(a.refundedAt || a.completedAt || a.createdAt).getTime());
      const page = Math.max(1, Number(filters.page || 1));
      const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize || 20)));
      const total = items.length;
      return success({
        items: items.slice((page - 1) * pageSize, page * pageSize),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      });
    },
  };
}
