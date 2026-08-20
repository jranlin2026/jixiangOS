import assert from 'node:assert/strict';
import { createNotificationPublisher } from './notificationService';

const at = new Date('2026-08-08T02:00:00.000Z');
const notifications: any[] = [];
const deliveries: any[] = [];
const schedules: any[] = [];
const activities: any[] = [];

const uniqueError = () => Object.assign(new Error('unique constraint'), { code: 'P2002' });

const tx = {
  notificationActivityProjection: {
    create: async ({ data }: any) => {
      if (activities.some((item) => item.activityKey === data.activityKey)) throw uniqueError();
      const row = { ...data, createdAt: at, updatedAt: at };
      activities.push(row);
      return row;
    },
    findUnique: async ({ where }: any) => activities.find((item) => item.activityKey === where.activityKey) || null,
    updateMany: async ({ where, data }: any) => {
      const row = activities.find((item) => item.activityKey === where.activityKey);
      if (!row || (where.currentNotificationId && row.currentNotificationId !== where.currentNotificationId)) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    },
  },
  notification: {
    create: async ({ data }: any) => {
      if (notifications.some((item) => item.dedupeKey === data.dedupeKey)) throw uniqueError();
      const row = { ...data, readAt: null, ackAt: null, resolvedAt: null, createdAt: at, updatedAt: at };
      notifications.push(row);
      return row;
    },
    findUnique: async ({ where }: any) => notifications.find((item) => item.dedupeKey === where.dedupeKey) || null,
    findMany: async ({ where }: any) => notifications.filter((item) => (
      (!where.businessId || item.businessId === where.businessId)
      && (!where.recipientId || item.recipientId === where.recipientId)
      && (!where.eventType?.in || where.eventType.in.includes(item.eventType))
      && (where.resolvedAt !== null || item.resolvedAt === null)
    )),
    updateMany: async ({ where, data }: any) => {
      let count = 0;
      notifications.forEach((item) => {
        if (where.id && item.id !== where.id) return;
        if (where.businessType && item.businessType !== where.businessType) return;
        if (where.businessId && item.businessId !== where.businessId) return;
        if (where.recipientId && item.recipientId !== where.recipientId) return;
        if (where.eventType?.in && !where.eventType.in.includes(item.eventType)) return;
        if (where.dedupeKey?.not && item.dedupeKey === where.dedupeKey.not) return;
        if (where.resolvedAt === null && item.resolvedAt !== null) return;
        Object.assign(item, data);
        count += 1;
      });
      return { count };
    },
  },
  notificationDelivery: {
    create: async ({ data }: any) => {
      if (deliveries.some((item) => item.notificationId === data.notificationId && item.channel === data.channel)) throw uniqueError();
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

{
  const state: { notifications: any[]; projections: any[]; deliveries: any[] } = {
    notifications: [], projections: [], deliveries: [],
  };
  let failDelivery = true;
  const root: any = {
    async $transaction(work: (client: any) => Promise<unknown>) {
      const staged = structuredClone(state);
      const client: any = {
        notification: {
          create: async ({ data }: any) => {
            if (staged.notifications.some((item) => item.dedupeKey === data.dedupeKey)) throw uniqueError();
            const row = { ...data, resolvedAt: null, createdAt: at };
            staged.notifications.push(row);
            return row;
          },
          findUnique: async ({ where }: any) => staged.notifications.find((item) => item.dedupeKey === where.dedupeKey) || null,
          findMany: async () => staged.notifications.filter((item) => !item.resolvedAt),
          updateMany: async () => ({ count: 0 }),
        },
        notificationActivityProjection: {
          findUnique: async ({ where }: any) => staged.projections.find((item) => item.activityKey === where.activityKey) || null,
          create: async ({ data }: any) => { staged.projections.push(data); return data; },
          updateMany: async () => ({ count: 0 }),
        },
        notificationDelivery: {
          create: async ({ data }: any) => {
            if (failDelivery) throw new Error('delivery write failed');
            if (staged.deliveries.some((item) => item.notificationId === data.notificationId && item.channel === data.channel)) throw uniqueError();
            staged.deliveries.push(data);
            return data;
          },
        },
      };
      const result = await work(client);
      Object.assign(state, staged);
      return result;
    },
  };
  const atomicPublisher = createNotificationPublisher({ now: () => at, createId: (prefix) => `${prefix}-atomic` });
  await assert.rejects(() => atomicPublisher.publish(root, assigned), /delivery write failed/);
  assert.deepEqual(state, { notifications: [], projections: [], deliveries: [] },
    'notification, projection and deliveries must roll back together');

  failDelivery = false;
  (state.notifications as any[]).push({ ...assigned, id: 'legacy-partial', resolvedAt: null, createdAt: at });
  const repaired = await atomicPublisher.publish(root, assigned);
  assert.equal(repaired.created, false);
  assert.equal(state.projections.length, 1, 'dedupe retry repairs a missing projection');
  assert.equal(state.deliveries.length, 1, 'dedupe retry repairs a missing delivery');
}

const first = await publisher.publish(tx as any, assigned);
const duplicate = await publisher.publish(tx as any, assigned);

assert.equal(first.created, true);
assert.equal(duplicate.created, false);
assert.equal(notifications.length, 1, '重复业务事件只能产生一条通知');
assert.equal(deliveries.length, 1, '重复业务事件不能重复创建飞书投递');
assert.equal(notifications[0].requiresAck, true);

await publisher.publish(tx as any, {
  ...assigned,
  eventType: 'LEAD_ACK_REMINDER',
  businessType: 'lead_ack',
  title: '新线索待处理',
  content: '客户A尚未确认且无跟进记录，请尽快处理。',
  dedupeKey: 'lead.ack-reminder:lead-1:sales-1:2026-08-08T02:00:00.000Z',
  channels: [],
  metadata: { activityVersion: '2026-08-08T02:00:00.000Z' },
});

assert.equal(notifications.length, 2);
assert.equal(notifications[0].resolvedReason, '已更新为最新业务提醒');
assert.equal(notifications[0].readAt?.toISOString(), at.toISOString(), '被新阶段替代的旧提醒不再占用未读角标');
assert.equal(notifications.filter((item) => !item.resolvedAt).length, 1, '同一条线索只能保留一个当前待处理提醒');
assert.equal(notifications[1].title, '新线索待处理');

await publisher.publish(tx as any, {
  ...assigned,
  eventType: 'LEAD_FIRST_FOLLOW_UP_DUE',
  businessType: 'lead_follow_up',
  title: '新线索待处理',
  dedupeKey: 'lead.first-follow-up:lead-2:sales-1:2026-08-08T02:00:00.000Z:reminder',
  businessId: 'lead-2',
  channels: [],
  metadata: { activityVersion: '2026-08-08T02:00:00.000Z' },
});
await publisher.publish(tx as any, {
  ...assigned,
  eventType: 'LEAD_ACK_REMINDER',
  businessType: 'lead_ack',
  title: '新线索待处理',
  dedupeKey: 'lead.ack-reminder:lead-2:sales-1:2026-08-08T02:00:00.000Z',
  businessId: 'lead-2',
  channels: [],
  metadata: { activityVersion: '2026-08-08T02:00:00.000Z' },
});
const leadTwo = notifications.filter((item) => item.businessId === 'lead-2');
assert.equal(leadTwo.filter((item) => !item.resolvedAt).length, 1);
assert.equal(leadTwo.find((item) => !item.resolvedAt)?.eventType, 'LEAD_FIRST_FOLLOW_UP_DUE', '乱序到达的低阶段不能覆盖首次跟进超时提醒');

notifications.push({
  id: 'legacy-high-stage', eventType: 'TODO_OVERDUE', businessType: 'customer_todo', businessId: 'todo-legacy',
  recipientId: 'sales-1', recipientName: '销售甲', title: '客户待办已经逾期', content: null, severity: 'S1',
  actionUrl: '/customers?customerId=customer-1', requiresAck: false,
  dedupeKey: 'todo.overdue:todo-legacy:sales-1:2026-08-08T02:00:00.000Z', metadata: null,
  readAt: null, ackAt: null, resolvedAt: null, createdAt: at, updatedAt: at,
});
await publisher.publish(tx as any, {
  eventType: 'TODO_DUE', businessType: 'customer_todo', businessId: 'todo-legacy',
  recipientId: 'sales-1', recipientName: '销售甲', title: '客户待办已经到期', severity: 'S1',
  actionUrl: '/customers?customerId=customer-1',
  dedupeKey: 'todo.due:todo-legacy:sales-1:2026-08-08T02:00:00.000Z', channels: [],
});
const legacyTodo = notifications.filter((item) => item.businessId === 'todo-legacy');
assert.equal(legacyTodo.find((item) => !item.resolvedAt)?.eventType, 'TODO_OVERDUE', '空投影升级时也必须保留历史最高业务阶段');

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

assert.deepEqual(resolved, { notifications: 0, schedules: 1 });
assert.equal(notifications[0].resolvedAt?.toISOString(), at.toISOString());
assert.equal(schedules[0].status, 'CANCELED');

await publisher.publish(tx as any, {
  eventType: 'WORKBENCH_TASK_CONFIRMED', businessType: 'employee_task', businessId: 'workbench-task-1',
  recipientId: 'sales-1', recipientName: '销售甲', title: '任务已确认', severity: 'S2',
  actionUrl: '/tasks?taskId=workbench-task-1', requiresAck: false,
  dedupeKey: 'workbench:workbench-task-1:activity-new:sales-1', channels: [],
  metadata: { activityVersion: '2026-08-08T04:00:00.000Z' },
});
await publisher.publish(tx as any, {
  eventType: 'WORKBENCH_TASK_RETURNED', businessType: 'employee_task', businessId: 'workbench-task-1',
  recipientId: 'sales-1', recipientName: '销售甲', title: '任务已退回', severity: 'S1',
  actionUrl: '/tasks?taskId=workbench-task-1', requiresAck: false,
  dedupeKey: 'workbench:workbench-task-1:activity-old:sales-1', channels: [],
  metadata: { activityVersion: '2026-08-08T03:00:00.000Z' },
});
const workbenchNotifications = notifications.filter((item) => item.businessId === 'workbench-task-1');
assert.equal(workbenchNotifications.filter((item) => !item.resolvedAt).length, 1);
assert.equal(workbenchNotifications.find((item) => !item.resolvedAt)?.eventType, 'WORKBENCH_TASK_CONFIRMED',
  '延迟补发的旧活动不得覆盖较新的任务状态');

const publishWorkbenchActivity = (businessId: string, eventType: string, recipientId: string, activityId: string, sequenceValue: string) => (
  publisher.publish(tx as any, {
    eventType, businessType: 'employee_task', businessId,
    recipientId, recipientName: recipientId, title: eventType, severity: 'S1',
    actionUrl: `/tasks?taskId=${businessId}`, dedupeKey: `workbench:${businessId}:${activityId}:${recipientId}`,
    channels: [], metadata: {
      activityId, activitySequence: sequenceValue, activityVersion: '2026-08-08T05:00:00.000Z',
    },
  })
);

await publishWorkbenchActivity('cross-confirm', 'WORKBENCH_TASK_COMPLETED', 'manager-1', 'complete-1', '101');
await publishWorkbenchActivity('cross-confirm', 'WORKBENCH_TASK_CONFIRMED', 'employee-1', 'confirm-1', '102');
assert.deepEqual(notifications.filter((item) => item.businessId === 'cross-confirm' && !item.resolvedAt)
  .map((item) => item.eventType), ['WORKBENCH_TASK_CONFIRMED'],
  'confirmation resolves the prior manager-audience completion notification');

await publishWorkbenchActivity('cross-return', 'WORKBENCH_TASK_COMPLETED', 'manager-1', 'complete-2', '201');
await publishWorkbenchActivity('cross-return', 'WORKBENCH_TASK_RETURNED', 'employee-1', 'return-2', '202');
assert.deepEqual(notifications.filter((item) => item.businessId === 'cross-return' && !item.resolvedAt)
  .map((item) => item.eventType), ['WORKBENCH_TASK_RETURNED'],
  'return resolves the prior manager-audience completion notification');

await publishWorkbenchActivity('cross-assignment', 'WORKBENCH_TASK_REASSIGNED', 'employee-old', 'assign-3', '301');
await publishWorkbenchActivity('cross-assignment', 'WORKBENCH_TASK_REASSIGNED', 'employee-new', 'assign-3', '301');
await publishWorkbenchActivity('cross-assignment', 'WORKBENCH_TASK_COMPLETED', 'manager-1', 'complete-3', '302');
assert.deepEqual(notifications.filter((item) => item.businessId === 'cross-assignment' && !item.resolvedAt)
  .map((item) => item.recipientId), ['manager-1'],
  'a later activity resolves all assignment audiences while preserving the same-activity recipient batch');

await publishWorkbenchActivity('same-time-reopen', 'WORKBENCH_TASK_CANCELED', 'employee-1', 'cancel-4', '401');
await publishWorkbenchActivity('same-time-reopen', 'WORKBENCH_TASK_CREATED', 'employee-1', 'reopen-4', '402');
assert.equal(notifications.find((item) => item.businessId === 'same-time-reopen' && !item.resolvedAt)?.eventType,
  'WORKBENCH_TASK_CREATED', 'monotonic sequence orders same-millisecond reopen after cancellation');

await publishWorkbenchActivity('same-time-complete', 'WORKBENCH_TASK_RETURNED', 'employee-1', 'return-5', '501');
await publishWorkbenchActivity('same-time-complete', 'WORKBENCH_TASK_COMPLETED', 'manager-1', 'complete-5', '502');
assert.equal(notifications.find((item) => item.businessId === 'same-time-complete' && !item.resolvedAt)?.eventType,
  'WORKBENCH_TASK_COMPLETED', 'monotonic sequence orders same-millisecond completion after return');

console.log('notification service tests passed');
