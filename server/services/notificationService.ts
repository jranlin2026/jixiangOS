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
  $transaction?<T>(work: (client: NotificationClient) => Promise<T>): Promise<T>;
  notificationActivityProjection: {
    create(args: { data: Record<string, unknown> }): Promise<any>;
    findUnique(args: { where: { activityKey: string } }): Promise<any>;
    updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
  };
  notification: {
    create(args: { data: Record<string, unknown> }): Promise<any>;
    findUnique(args: { where: { dedupeKey: string } }): Promise<any>;
    findMany(args: { where: Record<string, unknown> }): Promise<any[]>;
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

const ACTIVITY_FAMILIES = [
  { name: 'lead-owner', stages: ['LEAD_ASSIGNED', 'LEAD_ACK_REMINDER', 'LEAD_FIRST_FOLLOW_UP_DUE'] },
  { name: 'lead-manager', stages: ['LEAD_ACK_ESCALATION', 'LEAD_FIRST_FOLLOW_UP_ESCALATION'] },
  { name: 'todo-owner', stages: ['TODO_ASSIGNED', 'TODO_DUE_SOON', 'TODO_DUE', 'TODO_OVERDUE'] },
  {
    name: 'workbench-task',
    stages: [
      'WORKBENCH_TASK_CREATED', 'WORKBENCH_TASK_REASSIGNED', 'WORKBENCH_TASK_COMPLETED',
      'WORKBENCH_TASK_RETURNED', 'WORKBENCH_TASK_CONFIRMED', 'WORKBENCH_TASK_CANCELED',
    ],
  },
] as const;

type NormalizedActivityInput = {
  eventType: string;
  businessId: string;
  recipientId: string;
  dedupeKey: string;
  metadata?: unknown;
};

function activityDescriptor(input: NormalizedActivityInput) {
  const family = ACTIVITY_FAMILIES.find((candidate) => candidate.stages.includes(input.eventType as never));
  if (!family) return null;
  const metadata = input.metadata && typeof input.metadata === 'object' ? input.metadata as Record<string, unknown> : {};
  const embeddedVersion = String(metadata.activityVersion || input.dedupeKey).match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z/)?.[0];
  const versionAt = new Date(embeddedVersion || 0);
  const sequenceText = String(metadata.activitySequence || '0');
  const versionSequence = /^\d+$/.test(sequenceText) ? BigInt(sequenceText) : 0n;
  const taskWide = family.name === 'workbench-task';
  return {
    activityKey: taskWide
      ? `${family.name}:${input.businessId}`
      : `${family.name}:${input.businessId}:${input.recipientId}`,
    family: [...family.stages],
    stage: family.stages.indexOf(input.eventType as never) + 1,
    versionAt: Number.isNaN(versionAt.getTime()) ? new Date(0) : versionAt,
    versionSequence,
    activityId: String(metadata.activityId || ''),
    taskWide,
  };
}

function compareActivity(left: any, right: any) {
  const leftDescriptor = activityDescriptor(left);
  const rightDescriptor = activityDescriptor(right);
  if (!leftDescriptor) return -1;
  if (!rightDescriptor) return 1;
  if (leftDescriptor.versionSequence !== rightDescriptor.versionSequence) {
    return leftDescriptor.versionSequence < rightDescriptor.versionSequence ? -1 : 1;
  }
  if (leftDescriptor.taskWide && leftDescriptor.activityId
    && leftDescriptor.activityId === rightDescriptor.activityId) return 0;
  const version = leftDescriptor.versionAt.getTime() - rightDescriptor.versionAt.getTime();
  if (version) return version;
  const stage = leftDescriptor.stage - rightDescriptor.stage;
  if (stage) return stage;
  return new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime();
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

  const resolveNotification = (client: NotificationClient, id: string, reason: string) => client.notification.updateMany({
    where: { id, resolvedAt: null },
    data: { resolvedAt: now(), resolvedReason: reason, readAt: now() },
  });

  const projectActivity = async (client: NotificationClient, data: ReturnType<typeof normalized>, notification: any) => {
    const descriptor = activityDescriptor(data);
    if (!descriptor) return true;
    const activeWhere = {
      businessId: data.businessId,
      ...(!descriptor.taskWide ? { recipientId: data.recipientId } : {}),
      eventType: { in: descriptor.family },
      resolvedAt: null,
    };
    const resolveOlder = async (currentNotification: any) => {
      const active = await client.notification.findMany({ where: activeWhere });
      for (const candidate of active) {
        if (candidate.id !== currentNotification.id && compareActivity(candidate, currentNotification) < 0) {
          await resolveNotification(client, candidate.id, '已更新为最新业务提醒');
        }
      }
    };
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const current = await client.notificationActivityProjection.findUnique({ where: { activityKey: descriptor.activityKey } });
      if (!current) {
        try {
          const activeFamily = await client.notification.findMany({
            where: activeWhere,
          });
          const sortedFamily = activeFamily.sort(compareActivity);
          const projected = sortedFamily[sortedFamily.length - 1] || notification;
          const projectedDescriptor = activityDescriptor(projected) || descriptor;
          await client.notificationActivityProjection.create({
            data: {
              activityKey: descriptor.activityKey,
              currentNotificationId: projected.id,
              versionAt: projectedDescriptor.versionAt,
              versionSequence: projectedDescriptor.versionSequence,
              stage: projectedDescriptor.stage,
            },
          });
          await resolveOlder(projected);
          return compareActivity(notification, projected) === 0;
        } catch (error) {
          if (!uniqueConflict(error)) throw error;
          continue;
        }
      }
      const currentVersion = new Date(current.versionAt).getTime();
      const nextVersion = descriptor.versionAt.getTime();
      const currentSequence = BigInt(String(current.versionSequence || '0'));
      if (descriptor.taskWide && descriptor.versionSequence > 0n
        && descriptor.versionSequence === currentSequence) {
        await resolveOlder(notification);
        return true;
      }
      const canReplace = descriptor.versionSequence > currentSequence
        || (descriptor.versionSequence === currentSequence && (nextVersion > currentVersion
          || (nextVersion === currentVersion && descriptor.stage >= Number(current.stage))));
      if (!canReplace) {
        await resolveNotification(client, notification.id, '已有更新阶段的业务提醒');
        return false;
      }
      const claimed = await client.notificationActivityProjection.updateMany({
        where: { activityKey: descriptor.activityKey, currentNotificationId: current.currentNotificationId },
        data: {
          currentNotificationId: notification.id, versionAt: descriptor.versionAt,
          versionSequence: descriptor.versionSequence, stage: descriptor.stage,
        },
      });
      if (claimed.count !== 1) continue;
      await resolveOlder(notification);
      return true;
    }
    throw new Error('NOTIFICATION_ACTIVITY_PROJECTION_CONFLICT');
  };

  const publishAtomically = async (client: NotificationClient, input: NotificationEventInput) => {
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

    // A retry can encounter a notification left by an older non-atomic writer.
    // Projection and deliveries are therefore repaired idempotently even when
    // the notification itself already exists.
    const current = await projectActivity(client, data, notification);
    if (current) {
      const channels = [...new Set(input.channels || [])];
      for (const channel of channels) {
        try {
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
        } catch (error) {
          if (!uniqueConflict(error)) throw error;
        }
      }
    }
    return { created, notification };
  };

  return {
    async publish(client: NotificationClient, input: NotificationEventInput) {
      if (client.$transaction) {
        return client.$transaction((transaction) => publishAtomically(transaction, input));
      }
      // Prisma transaction clients intentionally do not expose $transaction;
      // callers already inside a transaction remain part of that transaction.
      return publishAtomically(client, input);
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
