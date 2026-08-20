import assert from 'node:assert/strict';
import { createNotificationInboxService } from './notificationInboxService';

const rows = [
  {
    id: 'notification-1', recipientId: 'user-1', eventType: 'LEAD_ASSIGNED', businessType: 'lead',
    businessId: 'lead-1', title: '新线索', content: '请及时跟进', severity: 'S1', actionUrl: '/leads?leadId=lead-1',
    requiresAck: true, readAt: null, ackAt: null, resolvedAt: null,
    createdAt: new Date('2026-08-08T02:00:00.000Z'), updatedAt: new Date('2026-08-08T02:00:00.000Z'),
  },
  {
    id: 'notification-2', recipientId: 'user-2', eventType: 'TODO_DUE_SOON', businessType: 'customer_todo',
    businessId: 'todo-2', title: '待办临期', content: null, severity: 'S2', actionUrl: '/customers?customerId=customer-2',
    requiresAck: false, readAt: null, ackAt: null, resolvedAt: null,
    createdAt: new Date('2026-08-08T03:00:00.000Z'), updatedAt: new Date('2026-08-08T03:00:00.000Z'),
  },
];

let lastListWhere: any;
let lastCountWhere: any;
const prisma = {
  notification: {
    findMany: async ({ where, skip, take }: any) => {
      lastListWhere = where;
      return rows.filter((row) => row.recipientId === where.recipientId).slice(skip, skip + take);
    },
    count: async ({ where }: any) => rows.filter((row) => (
      (lastCountWhere = where)
      && row.recipientId === where.recipientId
      && (where.readAt !== null || row.readAt === null)
      && (where.resolvedAt !== null || row.resolvedAt === null)
    )).length,
    findFirst: async ({ where }: any) => rows.find((row) => row.id === where.id && row.recipientId === where.recipientId) || null,
    update: async ({ where, data }: any) => {
      const row = rows.find((item) => item.id === where.id);
      if (!row) throw new Error('missing');
      Object.assign(row, data);
      return row;
    },
    updateMany: async ({ where, data }: any) => {
      let count = 0;
      rows.forEach((row) => {
        if (where.recipientId && row.recipientId !== where.recipientId) return;
        if (where.businessId && row.businessId !== where.businessId) return;
        if (where.businessType && row.businessType !== where.businessType) return;
        if (where.eventType?.in && !where.eventType.in.includes(row.eventType)) return;
        if (where.readAt === null && row.readAt !== null) return;
        if (where.resolvedAt === null && row.resolvedAt !== null) return;
        Object.assign(row, data);
        count += 1;
      });
      return { count };
    },
  },
  reminderSchedule: {
    updateMany: async () => ({ count: 2 }),
  },
};

const now = new Date('2026-08-08T04:00:00.000Z');
const service = createNotificationInboxService(prisma as any, { now: () => now });
const user = { id: 'user-1', name: '销售甲' } as any;

const listed = await service.list(user, { page: 1, pageSize: 10, status: 'all' });
assert.equal(listed.code, 0);
assert.equal(listed.data?.items.length, 1);
assert.equal(listed.data?.items[0].id, 'notification-1');
assert.equal(lastListWhere.recipientId, 'user-1', '通知列表必须始终限定当前用户');

await service.unreadCount(user);
assert.equal(lastCountWhere.resolvedAt, null, '未读角标只统计仍需处理的当前提醒');

const forbidden = await service.acknowledge('notification-2', user);
assert.equal(forbidden.code, 404, '不得通过猜测ID确认他人的消息');

rows.push(
  { ...rows[0], id: 'notification-3', eventType: 'LEAD_ACK_REMINDER', businessType: 'lead_ack' },
  { ...rows[0], id: 'notification-4', recipientId: 'manager-1', eventType: 'LEAD_ACK_ESCALATION', businessType: 'lead_ack', requiresAck: false },
);

const acknowledged = await service.acknowledge('notification-1', user);
assert.equal(acknowledged.code, 0);
assert.equal((rows[0].ackAt as Date | null)?.toISOString(), now.toISOString());
assert.equal((rows[0].readAt as Date | null)?.toISOString(), now.toISOString());
assert.equal((rows[2].ackAt as Date | null)?.toISOString(), now.toISOString(), '同一分配的确认提醒应同步确认');
assert.equal((rows[2].resolvedAt as Date | null)?.toISOString(), now.toISOString(), '已发布确认提醒应结束');
assert.equal((rows[3].resolvedAt as Date | null)?.toISOString(), now.toISOString(), '主管确认升级提醒应结束');

console.log('notification inbox service tests passed');
