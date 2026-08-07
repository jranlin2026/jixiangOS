import { randomUUID } from 'node:crypto';

export type NotificationSeverity = 'S0' | 'S1' | 'S2' | 'S3';
export type NotificationChannel = 'FEISHU';

export type NotificationEventInput = {
  eventType: string;
  businessType: string;
  businessId: string;
  recipientId: string;
  recipientName: string;
  title: string;
  content?: string;
  severity: NotificationSeverity;
  actionUrl: string;
  requiresAck?: boolean;
  dedupeKey: string;
  channels?: readonly NotificationChannel[];
  metadata?: unknown;
};

export type ScheduledNotificationInput = NotificationEventInput & {
  scheduledAt: Date;
  escalationLevel?: number;
};

type NotificationClient = {
  notification: {
    create(args: { data: Record<string, unknown> }): Promise<any>;
    findUnique(args: { where: { dedupeKey: string } }): Promise<any>;
    updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
  };
  notificationDelivery: {
    create(args: { data: Record<string, unknown> }): Promise<any>;
  };
  reminderSchedule: {
    create(args: { data: Record<string, unknown> }): Promise<any>;
    findUnique(args: { where: { dedupeKey: string } }): Promise<any>;
    updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
  };
};

type PublisherOptions = {
  now?: () => Date;
  createId?: (prefix: string) => string;
};

function uniqueConflict(error: unknown): boolean {
  return String((error as { code?: unknown } | null)?.code || '') === 'P2002';
}

function required(value: string, field: string): string {
  const normalized = String(value || '').trim();
  if (!normalized) throw new Error(`NOTIFICATION_${field.toUpperCase()}_REQUIRED`);
  return normalized;
}

function json(value: unknown): unknown {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

export function createNotificationPublisher(options: PublisherOptions = {}) {
  const now = () => options.now?.() || new Date();
  const createId = (prefix: string) => options.createId?.(prefix) || `${prefix}-${randomUUID()}`;

  const normalized = (input: NotificationEventInput) => ({
    eventType: required(input.eventType, 'event_type'),
    businessType: required(input.businessType, 'business_type'),
    businessId: required(input.businessId, 'business_id'),
    recipientId: required(input.recipientId, 'recipient_id'),
    recipientName: required(input.recipientName, 'recipient_name'),
    title: required(input.title, 'title'),
    content: String(input.content || '').trim() || null,
    severity: input.severity,
    actionUrl: required(input.actionUrl, 'action_url'),
    requiresAck: Boolean(input.requiresAck),
    dedupeKey: required(input.dedupeKey, 'dedupe_key'),
    metadata: json(input.metadata),
  });

  return {
    async publish(client: NotificationClient, input: NotificationEventInput) {
      const data = normalized(input);
      let notification: any;
      let created = false;
      try {
        notification = await client.notification.create({
          data: { id: createId('notification'), ...data },
        });
        created = true;
      } catch (error) {
        if (!uniqueConflict(error)) throw error;
        notification = await client.notification.findUnique({ where: { dedupeKey: data.dedupeKey } });
        if (!notification) throw error;
      }

      if (created) {
        const channels = [...new Set(input.channels || [])];
        for (const channel of channels) {
          await client.notificationDelivery.create({
            data: {
              id: createId('delivery'),
              notificationId: notification.id,
              channel,
              status: 'PENDING',
              attemptCount: 0,
              nextAttemptAt: now(),
            },
          });
        }
      }
      return { created, notification };
    },

    async schedule(client: NotificationClient, input: ScheduledNotificationInput) {
      const data = normalized(input);
      let schedule: any;
      let created = false;
      try {
        schedule = await client.reminderSchedule.create({
          data: {
            id: createId('reminder'),
            ...data,
            channels: json(input.channels || []),
            scheduledAt: input.scheduledAt,
            escalationLevel: Math.max(0, Math.trunc(input.escalationLevel || 0)),
            status: 'PENDING',
          },
        });
        created = true;
      } catch (error) {
        if (!uniqueConflict(error)) throw error;
        schedule = await client.reminderSchedule.findUnique({ where: { dedupeKey: data.dedupeKey } });
        if (!schedule) throw error;
      }
      return { created, schedule };
    },

    async resolveBusiness(client: NotificationClient, input: {
      businessType: string;
      businessId: string;
      recipientId?: string;
      reason: string;
    }) {
      const at = now();
      const where = {
        businessType: required(input.businessType, 'business_type'),
        businessId: required(input.businessId, 'business_id'),
        ...(input.recipientId ? { recipientId: input.recipientId } : {}),
      };
      // Cancel first. The worker locks this schedule row before publishing, so
      // either cancellation wins, or the worker commits first and the next
      // update resolves the freshly-created notification.
      const schedules = await client.reminderSchedule.updateMany({
        where: { ...where, status: { in: ['PENDING', 'PROCESSING'] } },
        data: { status: 'CANCELED', canceledAt: at, cancelReason: String(input.reason || '').trim() || '业务状态已变化' },
      });
      const notifications = await client.notification.updateMany({
        where: { ...where, resolvedAt: null },
        data: { resolvedAt: at, resolvedReason: String(input.reason || '').trim() || '业务状态已变化' },
      });
      return { notifications: notifications.count, schedules: schedules.count };
    },
  };
}

export type NotificationPublisher = ReturnType<typeof createNotificationPublisher>;
