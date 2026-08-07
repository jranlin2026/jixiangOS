import assert from 'node:assert/strict';
import { createNotificationBootstrapService } from './notificationBootstrapService';

const published: any[] = [];
const scheduledTodos: any[] = [];
const assignedLeads: any[] = [];
const prisma = {
  customerTodo: { findMany: async () => [{ id: 'todo-1', customerId: 'customer-1', customerName: '客户甲', title: '回访', assigneeId: 'user-1', dueAt: new Date('2026-08-07T02:00:00Z'), updatedAt: new Date('2026-08-07T00:00:00Z') }] },
  leadRecord: { findMany: async () => [{ data: { id: 'lead-1', name: '线索甲', assignedToId: 'user-1', assignedAt: '2026-08-07T00:00:00Z', followUpRecords: [] } }] },
  user: { findUnique: async ({ where }: any) => where.id === 'user-1' ? { id: 'user-1', name: '销售甲', isActive: true, employmentStatus: 'active', departmentId: null } : null },
  department: { findUnique: async () => null },
  notification: { findFirst: async () => null, findUnique: async () => null },
  reminderSchedule: { findFirst: async () => null },
  $transaction: async (operation: any) => operation(prisma),
};
const service = createNotificationBootstrapService(
  prisma as any,
  {
    scheduleTodo: async (_client: any, input: any) => { scheduledTodos.push(input); },
    assignLead: async (_client: any, input: any) => { assignedLeads.push(input); },
    bootstrapTodo: async (_client: any, input: any) => { scheduledTodos.push(input); },
    bootstrapLead: async (_client: any, input: any) => { assignedLeads.push(input); },
    bootstrapOverdueTodo: async (_client: any, input: any) => { published.push({ eventType: 'TODO_OVERDUE', ...input }); },
    bootstrapOverdueLead: async (_client: any, input: any) => { published.push({ eventType: 'LEAD_FIRST_FOLLOW_UP_DUE', ...input }); },
  } as any,
);

const result = await service.run();
assert.deepEqual(result, { todos: 1, leads: 1 });
assert.equal(published.length, 0);
assert.equal(scheduledTodos.length, 1);
assert.equal(assignedLeads.length, 1);

console.log('notification bootstrap service tests passed');
