import type { PrismaClient } from '@prisma/client';
import type { AuthenticatedUser } from '../../src/types/auth';
import { failure, success } from '../api/response';

type NotificationPrisma = Pick<PrismaClient, 'notification' | 'reminderSchedule'>;
type InboxOptions = { now?: () => Date };

export type NotificationListStatus = 'all' | 'unread' | 'pending' | 'resolved';
export type NotificationListQuery = {
  page?: number;
  pageSize?: number;
  status?: NotificationListStatus;
  eventType?: string;
  severity?: string;
};

function mapNotification(row: any) {
  return {
    id: row.id,
    eventType: row.eventType,
    businessType: row.businessType,
    businessId: row.businessId,
    title: row.title,
    content: row.content || undefined,
    severity: row.severity,
    actionUrl: row.actionUrl,
    requiresAck: Boolean(row.requiresAck),
    readAt: row.readAt?.toISOString(),
    ackAt: row.ackAt?.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString(),
    resolvedReason: row.resolvedReason || undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function pageNumber(value: unknown, fallback: number, max: number) {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

export function createNotificationInboxService(prisma: NotificationPrisma, options: InboxOptions = {}) {
  const now = () => options.now?.() || new Date();

  return {
    async list(user: AuthenticatedUser, query: NotificationListQuery = {}) {
      const page = pageNumber(query.page, 1, Number.MAX_SAFE_INTEGER);
      const pageSize = pageNumber(query.pageSize, 10, 100);
      const status = query.status || 'all';
      const where: any = {
        recipientId: user.id,
        ...(status === 'unread' ? { readAt: null, resolvedAt: null } : {}),
        ...(status === 'pending' ? { resolvedAt: null } : {}),
        ...(status === 'resolved' ? { resolvedAt: { not: null } } : {}),
        ...(query.eventType ? { eventType: String(query.eventType) } : {}),
        ...(query.severity ? { severity: String(query.severity) } : {}),
      };
      const [items, total] = await Promise.all([
        prisma.notification.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.notification.count({ where }),
      ]);
      return success({
        items: items.map(mapNotification),
        pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      });
    },

    async unreadCount(user: AuthenticatedUser) {
      const count = await prisma.notification.count({
        where: { recipientId: user.id, readAt: null, resolvedAt: null },
      });
      return success({ count });
    },

    async markRead(notificationId: string, user: AuthenticatedUser) {
      const row = await prisma.notification.findFirst({ where: { id: notificationId, recipientId: user.id } });
      if (!row) return failure('消息不存在', 404);
      if (row.readAt) return success(mapNotification(row));
      const updated = await prisma.notification.update({ where: { id: row.id }, data: { readAt: now() } });
      return success(mapNotification(updated));
    },

    async markAllRead(user: AuthenticatedUser) {
      const result = await prisma.notification.updateMany({
        where: { recipientId: user.id, readAt: null },
        data: { readAt: now() },
      });
      return success({ count: result.count });
    },

    async acknowledge(notificationId: string, user: AuthenticatedUser) {
      const row = await prisma.notification.findFirst({ where: { id: notificationId, recipientId: user.id } });
      if (!row) return failure('消息不存在', 404);
      if (row.resolvedAt) return failure('该事项已经处理或失效', 409);
      if (!row.requiresAck) return failure('该消息无需确认', 409);
      if (row.ackAt) return success(mapNotification(row));
      const at = now();
      const leadAcknowledgement = row.eventType === 'LEAD_ASSIGNED' || row.eventType === 'LEAD_ACK_REMINDER';
      if (leadAcknowledgement) {
        await prisma.reminderSchedule.updateMany({
          where: {
            businessType: 'lead_ack',
            businessId: row.businessId,
            status: { in: ['PENDING', 'PROCESSING'] },
          },
          data: { status: 'CANCELED', canceledAt: at, cancelReason: '销售已确认接收线索' },
        });
      }
      const updated = await prisma.notification.update({
        where: { id: row.id },
        data: {
          ackAt: at,
          readAt: row.readAt || at,
          ...(row.businessType === 'lead_ack' ? { resolvedAt: at, resolvedReason: '销售已确认接收线索' } : {}),
        },
      });
      if (leadAcknowledgement) {
        await prisma.notification.updateMany({
          where: {
            businessId: row.businessId,
            recipientId: user.id,
            eventType: { in: ['LEAD_ASSIGNED', 'LEAD_ACK_REMINDER'] },
            resolvedAt: null,
          },
          data: { ackAt: at, readAt: at },
        });
        await prisma.notification.updateMany({
          where: { businessType: 'lead_ack', businessId: row.businessId, resolvedAt: null },
          data: { resolvedAt: at, resolvedReason: '销售已确认接收线索' },
        });
      }
      return success(mapNotification(updated));
    },
  };
}
