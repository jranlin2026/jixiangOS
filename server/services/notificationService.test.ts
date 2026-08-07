import assert from 'node:assert/strict';
import { createNotificationPublisher } from './notificationService';

const at = new Date('2026-08-08T02:00:00.000Z');
const notifications: any[] = [];
const deliveries: any[] = [];
const schedules: any[] = [];

const uniqueError = () => Object.assign(new Error('unique constraint'), { code: 'P2002' });

const tx = {
  notification: {
    create: async ({ data }: any) => {
      if (notifications.some((item) => item.dedupeKey === data.dedupeKey)) throw uniqueError();
      const row = { ...data, readAt: null, ackAt: null, resolvedAt: null, createdAt: at, updatedAt: at };
      notifications.push(row);
      return row;
    },
    findUnique: async ({ where }: any) => notifications.find((item) => item.dedupeKey === where.dedupeKey) || null,
    updateMany: async ({ where, data }: any) => {
      let count = 0;
      notifications.forEach((item) => {
        if (item.businessType !== where.businessType || item.businessId !== where.businessId) return;
        if (where.recipientId && item.recipientId !== where.recipientId) return;
        if (where.resolvedAt === null && item.resolvedAt !== null) return;
        Object.assign(item, data);
        count += 1;
      });
      return { count };
    },
  },
  notificationDelivery: {
    create: async ({ data }: any) => {
      deliveries.push({ ...data, createdAt: at, updatedAt: at });
      return deliveries[deliveries.length - 1];
    },
  },
  reminderSchedule: {
    create: async ({ data }: any) => {
      if (schedules.some((item) => item.dedupeKey === data.dedupeKey)) throw uniqueError();
      const row = { ...data, status: 'PENDING', createdAt: at, updatedAt: at };
      schedules.push(row);
      return row;
    },
    findUnique: async ({ where }: any) => schedules.find((item) => item.dedupeKey === where.dedupeKey) || null,
    updateMany: async ({ where, data }: any) => {
      let count = 0;
      schedules.forEach((item) => {
        if (item.businessType !== where.businessType || item.businessId !== where.businessId) return;
        if (where.recipientId && item.recipientId !== where.recipientId) return;
        if (where.status?.in && !where.status.in.includes(item.status)) return;
        Object.assign(item, data);
        count += 1;
      });
      return { count };
    },
  },
};

let sequence = 0;
const publisher = createNotificationPublisher({
  now: () => at,
  createId: (prefix) => `${prefix}-${++sequence}`,
});

const assigned = {
  eventType: 'LEAD_ASSIGNED',
  businessType: 'lead',
  businessId: 'lead-1',
  recipientId: 'sales-1',
  recipientName: '销售甲',
  title: '你收到一条新线索',
  content: '客户A已分配给你，请及时确认并跟进。',
  severity: 'S1' as const,
  actionUrl: '/leads?leadId=lead-1',
  requiresAck: true,
  dedupeKey: 'lead.assigned:lead-1:sales-1:2026-08-08T02:00:00.000Z',
  channels: ['FEISHU'] as const,
};

const first = await publisher.publish(tx as any, assigned);
const duplicate = await publisher.publish(tx as any, assigned);

assert.equal(first.created, true);
assert.equal(duplicate.created, false);
assert.equal(notifications.length, 1, '重复业务事件只能产生一条通知');
assert.equal(deliveries.length, 1, '重复业务事件不能重复创建飞书投递');
assert.equal(notifications[0].requiresAck, true);

const scheduled = await publisher.schedule(tx as any, {
  ...assigned,
  eventType: 'LEAD_FIRST_FOLLOW_UP_DUE',
  title: '线索尚未首次跟进',
  dedupeKey: 'lead.first-follow-up:lead-1:sales-1:30m',
  scheduledAt: new Date('2026-08-08T02:30:00.000Z'),
});
const repeatedSchedule = await publisher.schedule(tx as any, {
  ...assigned,
  eventType: 'LEAD_FIRST_FOLLOW_UP_DUE',
  title: '线索尚未首次跟进',
  dedupeKey: 'lead.first-follow-up:lead-1:sales-1:30m',
  scheduledAt: new Date('2026-08-08T02:30:00.000Z'),
});

assert.equal(scheduled.created, true);
assert.equal(repeatedSchedule.created, false);
assert.equal(schedules.length, 1, '同一提醒阈值只能保留一个计划');

const resolved = await publisher.resolveBusiness(tx as any, {
  businessType: 'lead',
  businessId: 'lead-1',
  recipientId: 'sales-1',
  reason: '线索已完成首次跟进',
});

assert.deepEqual(resolved, { notifications: 1, schedules: 1 });
assert.equal(notifications[0].resolvedAt?.toISOString(), at.toISOString());
assert.equal(schedules[0].status, 'CANCELED');

console.log('notification service tests passed');
