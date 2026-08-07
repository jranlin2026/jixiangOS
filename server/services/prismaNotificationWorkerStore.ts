import type { PrismaClient } from '@prisma/client';
import type { NotificationDeliveryResult, NotificationWorkerStore } from './notificationWorker';
import type { NotificationPublisher } from './notificationService';

const MAX_ATTEMPTS = 5;

function retryAt(now: Date, attemptCount: number) {
  const seconds = Math.min(300, 5 * (2 ** Math.max(0, attemptCount - 1)));
  return new Date(now.getTime() + seconds * 1000);
}

function errorMessage(error: unknown) {
  return String((error as Error)?.message || error || '通知任务失败').slice(0, 500);
}

function channels(value: unknown): Array<'FEISHU'> {
  const items = Array.isArray(value) ? value : [];
  return items.filter((item): item is 'FEISHU' => item === 'FEISHU');
}

export function createPrismaNotificationWorkerStore(
  prisma: PrismaClient,
  publisher: NotificationPublisher,
): NotificationWorkerStore {
  return {
    async claimSchedule({ workerId, now, leaseMs }) {
      const candidate = await prisma.reminderSchedule.findFirst({
        where: {
          scheduledAt: { lte: now },
          OR: [
            { status: 'PENDING' },
            { status: 'PROCESSING', leaseExpiresAt: { lt: now } },
          ],
        },
        orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
      });
      if (!candidate) return null;
      const claimed = await prisma.reminderSchedule.updateMany({
        where: {
          id: candidate.id,
          OR: [
            { status: 'PENDING' },
            { status: 'PROCESSING', leaseExpiresAt: { lt: now } },
          ],
        },
        data: {
          status: 'PROCESSING',
          leaseOwner: workerId,
          leaseExpiresAt: new Date(now.getTime() + leaseMs),
          attemptCount: { increment: 1 },
          lastError: null,
        },
      });
      if (claimed.count !== 1) return null;
      return prisma.reminderSchedule.findUnique({ where: { id: candidate.id } });
    },

    async publishSchedule(schedule, { workerId, now }) {
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM reminder_schedules WHERE id = ${schedule.id} FOR UPDATE`;
        const locked = await tx.reminderSchedule.findFirst({
          where: { id: schedule.id, status: 'PROCESSING', leaseOwner: workerId },
        });
        if (!locked) return;
        await publisher.publish(tx as any, {
          eventType: locked.eventType,
          businessType: locked.businessType,
          businessId: locked.businessId,
          recipientId: locked.recipientId,
          recipientName: locked.recipientName,
          title: locked.title,
          content: locked.content || undefined,
          severity: locked.severity,
          actionUrl: locked.actionUrl,
          requiresAck: locked.requiresAck,
          dedupeKey: locked.dedupeKey,
          channels: channels(locked.channels),
          metadata: locked.metadata,
        });
        await tx.reminderSchedule.updateMany({
          where: { id: locked.id, status: 'PROCESSING', leaseOwner: workerId },
          data: {
            status: 'COMPLETED', completedAt: now, leaseOwner: null, leaseExpiresAt: null, lastError: null,
          },
        });
      });
    },

    async retrySchedule(schedule, { workerId, now, error }) {
      const attemptCount = Number(schedule.attemptCount || 1);
      await prisma.reminderSchedule.updateMany({
        where: { id: schedule.id, status: 'PROCESSING', leaseOwner: workerId },
        data: attemptCount >= MAX_ATTEMPTS ? {
          status: 'FAILED', lastError: errorMessage(error), leaseOwner: null, leaseExpiresAt: null,
        } : {
          status: 'PENDING', scheduledAt: retryAt(now, attemptCount), lastError: errorMessage(error),
          leaseOwner: null, leaseExpiresAt: null,
        },
      });
    },

    async claimDelivery({ workerId, now, leaseMs }) {
      const candidate = await prisma.notificationDelivery.findFirst({
        where: {
          OR: [
            { status: 'PENDING', nextAttemptAt: { lte: now } },
            { status: 'PROCESSING', leaseExpiresAt: { lt: now } },
          ],
        },
        orderBy: [{ nextAttemptAt: 'asc' }, { id: 'asc' }],
      });
      if (!candidate) return null;
      const claimed = await prisma.notificationDelivery.updateMany({
        where: {
          id: candidate.id,
          OR: [
            { status: 'PENDING' },
            { status: 'PROCESSING', leaseExpiresAt: { lt: now } },
          ],
        },
        data: {
          status: 'PROCESSING', leaseOwner: workerId,
          leaseExpiresAt: new Date(now.getTime() + leaseMs), attemptCount: { increment: 1 }, lastError: null,
        },
      });
      if (claimed.count !== 1) return null;
      return prisma.notificationDelivery.findUnique({ where: { id: candidate.id } });
    },

    async loadDeliveryContext(delivery) {
      const current = await prisma.notificationDelivery.findUnique({
        where: { id: delivery.id },
        include: { notification: true },
      });
      if (!current?.notification || current.notification.resolvedAt) return null;
      const [recipient, binding] = await Promise.all([
        prisma.user.findUnique({ where: { id: current.notification.recipientId } }),
        prisma.userChannelBinding.findUnique({
          where: { userId_channel: { userId: current.notification.recipientId, channel: current.channel } },
        }),
      ]);
      if (!recipient || !recipient.isActive || recipient.employmentStatus !== 'active') return null;
      return { delivery: current, notification: current.notification, recipient, binding };
    },

    async settleDelivery(delivery, result: NotificationDeliveryResult, { workerId, now }) {
      const attemptCount = Number(delivery.attemptCount || 1);
      const retry = result.status === 'FAILED' && result.retryable && attemptCount < MAX_ATTEMPTS;
      await prisma.notificationDelivery.updateMany({
        where: { id: delivery.id, status: 'PROCESSING', leaseOwner: workerId },
        data: retry ? {
          status: 'PENDING', nextAttemptAt: retryAt(now, attemptCount), lastError: result.error || '投递失败',
          leaseOwner: null, leaseExpiresAt: null,
        } : {
          status: result.status, sentAt: result.status === 'SENT' ? now : null,
          lastError: result.error || null, leaseOwner: null, leaseExpiresAt: null,
        },
      });
    },
  };
}
