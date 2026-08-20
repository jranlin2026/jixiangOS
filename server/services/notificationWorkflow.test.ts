import assert from 'node:assert/strict';
import { createNotificationWorkflow } from './notificationWorkflow';

const published: any[] = [];
const scheduled: any[] = [];
const resolved: any[] = [];
const publisher = {
  publish: async (_tx: any, input: any) => { published.push(input); return { created: true, notification: input }; },
  schedule: async (_tx: any, input: any) => { scheduled.push(input); return { created: true, schedule: input }; },
  resolveBusiness: async (_tx: any, input: any) => { resolved.push(input); return { notifications: 1, schedules: 1 }; },
};
const tx = { notificationRule: { findUnique: async () => null } };
const workflow = createNotificationWorkflow(publisher as any);
const assignedAt = new Date('2026-08-08T02:00:00.000Z');

await workflow.assignLead(tx as any, {
  leadId: 'lead-1', leadName: '客户A', assignedAt,
  assignee: { id: 'sales-1', name: '销售甲' },
  manager: { id: 'manager-1', name: '销售经理' },
});

assert.equal(published.length, 1);
assert.equal(published[0].eventType, 'LEAD_ASSIGNED');
assert.equal(published[0].title, '新线索待处理');
assert.equal(scheduled.length, 3);
assert.deepEqual(scheduled.map((item) => item.scheduledAt.toISOString()), [
  '2026-08-08T02:20:00.000Z',
  '2026-08-08T03:00:00.000Z',
  '2026-08-08T04:00:00.000Z',
]);
assert.equal(scheduled[0].title, '新线索待处理');
assert.equal(scheduled[1].title, '新线索待处理');
assert.equal(scheduled[2].eventType, 'LEAD_FIRST_FOLLOW_UP_ESCALATION');

published.length = 0;
scheduled.length = 0;
await workflow.scheduleTodo(tx as any, {
  todoId: 'todo-1', customerId: 'customer-1', customerName: '客户B', title: '联系客户',
  dueAt: new Date('2026-08-08T04:00:00.000Z'), createdAt: assignedAt,
  assignee: { id: 'sales-1', name: '销售甲' },
  manager: { id: 'manager-1', name: '销售经理' },
});

assert.equal(published.length, 1);
assert.equal(published[0].eventType, 'TODO_ASSIGNED');
assert.equal(scheduled[0].eventType, 'TODO_DUE_SOON');
assert.equal(scheduled[0].scheduledAt.toISOString(), '2026-08-08T03:30:00.000Z');
assert.equal(scheduled[1].eventType, 'TODO_DUE');
assert.equal(scheduled[2].eventType, 'TODO_OVERDUE');
assert.ok(scheduled.some((item) => item.eventType === 'TODO_MANAGER_ESCALATION'));

published.length = 0;
scheduled.length = 0;
await workflow.bootstrapLead(tx as any, {
  leadId: 'lead-old', leadName: '存量线索', assignedAt,
  bootstrapAt: new Date('2026-08-08T06:00:00.000Z'), acknowledged: false,
  assignee: { id: 'sales-1', name: '销售甲' }, manager: { id: 'manager-1', name: '销售经理' },
});
assert.deepEqual(published.map((item) => item.eventType), ['LEAD_FIRST_FOLLOW_UP_DUE', 'LEAD_FIRST_FOLLOW_UP_ESCALATION']);
assert.equal(scheduled.length, 0, '历史线索不得补发已经过时的确认阶段');

published.length = 0;
scheduled.length = 0;
await workflow.bootstrapLead(tx as any, {
  leadId: 'lead-acked', leadName: '已确认线索', assignedAt,
  bootstrapAt: new Date('2026-08-08T02:10:00.000Z'), acknowledged: true,
  assignee: { id: 'sales-1', name: '销售甲' }, manager: { id: 'manager-1', name: '销售经理' },
});
assert.equal(published.length, 0, '已确认线索不得重新发布确认提醒');
assert.deepEqual(scheduled.map((item) => item.eventType), ['LEAD_FIRST_FOLLOW_UP_DUE', 'LEAD_FIRST_FOLLOW_UP_ESCALATION']);

published.length = 0;
scheduled.length = 0;
await workflow.bootstrapTodo(tx as any, {
  todoId: 'todo-old', customerId: 'customer-1', customerName: '客户B', title: '历史待办',
  dueAt: new Date('2026-08-06T04:00:00.000Z'), versionAt: assignedAt,
  bootstrapAt: new Date('2026-08-10T06:00:00.000Z'),
  assignee: { id: 'sales-1', name: '销售甲' }, manager: { id: 'manager-1', name: '销售经理' },
});
assert.deepEqual(published.map((item) => item.eventType), ['TODO_OVERDUE', 'TODO_MANAGER_ESCALATION']);
assert.equal(scheduled.length, 0, '历史待办只发当前有效阶段');

await workflow.resolveTodo(tx as any, 'todo-1', '待办已完成');
assert.equal(resolved[resolved.length - 1].businessType, 'customer_todo');

published.length = 0;
scheduled.length = 0;
const okrPublishedAt = new Date('2026-08-11T01:00:00.000Z');
const okrCheckInAt = new Date('2026-08-15T01:00:00.000Z');
await workflow.assignOkr(tx as any, {
  cycleId: 'cycle-2026-q3', objectiveId: 'objective-1', title: '完成季度增长目标',
  assignee: { id: 'sales-1', name: '销售甲' },
  manager: { id: 'manager-1', name: '销售经理' },
  publishedAt: okrPublishedAt,
  checkInAt: okrCheckInAt,
});
assert.equal(published.length, 1);
assert.equal(published[0].eventType, 'OKR_ASSIGNED');
assert.equal(published[0].businessType, 'okr_objective');
assert.equal(published[0].actionUrl, '/okr');
assert.equal(published[0].dedupeKey, 'okr.assigned:cycle-2026-q3:objective-1:sales-1:2026-08-11T01:00:00.000Z');
assert.equal(scheduled[0].eventType, 'OKR_CHECK_IN_DUE_SOON');
assert.equal(scheduled[0].scheduledAt.toISOString(), '2026-08-14T01:00:00.000Z');

scheduled.length = 0;
await workflow.scheduleOkrCheckIn(tx as any, {
  cycleId: 'cycle-2026-q3', objectiveId: 'objective-1', title: '完成季度增长目标',
  assignee: { id: 'sales-1', name: '销售甲' },
  scheduledFrom: new Date('2026-08-15T02:00:00.000Z'),
  checkInAt: new Date('2026-08-22T01:00:00.000Z'),
});
assert.equal(scheduled[0].eventType, 'OKR_CHECK_IN_DUE_SOON');
assert.equal(scheduled[0].scheduledAt.toISOString(), '2026-08-21T01:00:00.000Z');

published.length = 0;
scheduled.length = 0;
await workflow.riskOkr(tx as any, {
  cycleId: 'cycle-2026-q3', objectiveId: 'objective-1', title: '完成季度增长目标',
  assignee: { id: 'sales-1', name: '销售甲' },
  manager: { id: 'manager-1', name: '销售经理' },
  riskAt: new Date('2026-08-12T01:00:00.000Z'),
});
assert.equal(published[0].eventType, 'OKR_AT_RISK');
assert.equal(published[0].actionUrl, '/okr');
assert.equal(scheduled[0].eventType, 'OKR_RISK_ESCALATION');
assert.equal(scheduled[0].scheduledAt.toISOString(), '2026-08-13T01:00:00.000Z');

await workflow.resolveOkr(tx as any, 'objective-1', '目标风险已解除');
assert.deepEqual(resolved[resolved.length - 1], {
  businessType: 'okr_objective',
  businessId: 'objective-1',
  reason: '目标风险已解除',
});

published.length = 0;
scheduled.length = 0;
const disabledWorkflow = createNotificationWorkflow(publisher as any);
await disabledWorkflow.assignOkr({ notificationRule: { findUnique: async () => ({ enabled: false }) } } as any, {
  cycleId: 'cycle-disabled', objectiveId: 'objective-disabled', title: '停用规则目标',
  assignee: { id: 'sales-1', name: '销售甲' }, publishedAt: okrPublishedAt,
});
await disabledWorkflow.riskOkr({ notificationRule: { findUnique: async () => ({ enabled: false }) } } as any, {
  cycleId: 'cycle-disabled', objectiveId: 'objective-disabled', title: '停用规则目标',
  assignee: { id: 'sales-1', name: '销售甲' }, riskAt: okrPublishedAt,
});
assert.equal(published.length, 0, '目标提醒规则停用后不得发布通知');
assert.equal(scheduled.length, 0, '目标提醒规则停用后不得建立定时提醒');

console.log('notification workflow tests passed');
