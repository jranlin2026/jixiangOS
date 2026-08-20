import type { PrismaClient } from '@prisma/client';
import type { Lead } from '../../src/types/lead';
import { leadAssignmentNotificationKey, type NotificationWorkflow } from './notificationWorkflow';

type BootstrapPrisma = Pick<PrismaClient, '$transaction' | 'customerTodo' | 'leadRecord' | 'user' | 'department' | 'notificationRule' | 'notification' | 'notificationDelivery' | 'reminderSchedule'>;

function parseLead(value: unknown): Lead | null {
  try { return (typeof value === 'string' ? JSON.parse(value) : value) as Lead; } catch { return null; }
}

export function createNotificationBootstrapService(
  prisma: BootstrapPrisma,
  workflow: NotificationWorkflow,
) {
  const bootstrapAt = new Date();
  const recipient = async (userId?: string | null) => {
    if (!userId) return { assignee: null, manager: null };
    const assignee = await prisma.user.findUnique({ where: { id: userId } });
    if (!assignee || !assignee.isActive || (assignee.employmentStatus || 'active') !== 'active') return { assignee: null, manager: null };
    const department = assignee.departmentId ? await prisma.department.findUnique({ where: { id: assignee.departmentId } }) : null;
    const manager = department?.managerId ? await prisma.user.findUnique({ where: { id: department.managerId } }) : null;
    return {
      assignee: { id: assignee.id, name: assignee.name },
      manager: manager && manager.isActive && (manager.employmentStatus || 'active') === 'active'
        ? { id: manager.id, name: manager.name } : null,
    };
  };

  return {
    async run() {
      let todos = 0;
      let leads = 0;
      const openTodos = await prisma.customerTodo.findMany({ where: { status: 'PENDING' } });
      for (const todo of openTodos) {
        const recipients = await recipient(todo.assigneeId);
        if (!recipients.assignee) continue;
        await prisma.$transaction(async (tx) => {
          await workflow.bootstrapTodo(tx as any, {
            todoId: todo.id, customerId: todo.customerId, customerName: todo.customerName,
            title: todo.title, dueAt: todo.dueAt, versionAt: todo.updatedAt, bootstrapAt,
            assignee: recipients.assignee!, manager: recipients.manager,
          });
        });
        todos += 1;
      }

      const leadRows = await prisma.leadRecord.findMany({ select: { data: true } });
      for (const row of leadRows) {
        const lead = parseLead(row.data);
        if (!lead || lead.deletedAt || lead.customerId || !lead.assignedToId || !lead.assignedAt || (lead.followUpRecords || []).length) continue;
        const recipients = await recipient(lead.assignedToId);
        if (!recipients.assignee) continue;
        const assignedAt = new Date(lead.assignedAt);
        if (Number.isNaN(assignedAt.getTime())) continue;
        const assignmentNotification = await prisma.notification.findUnique({
          where: { dedupeKey: leadAssignmentNotificationKey(lead.id, recipients.assignee.id, assignedAt) },
        }) || await prisma.notification.findUnique({
          where: { dedupeKey: `lead.assigned:${lead.id}:${recipients.assignee.id}:${assignedAt.toISOString()}` },
        });
        await prisma.$transaction(async (tx) => {
          await workflow.bootstrapLead(tx as any, {
            leadId: lead.id, leadName: lead.name, assignedAt,
            bootstrapAt, acknowledged: Boolean(assignmentNotification?.ackAt),
            assignee: recipients.assignee!, manager: recipients.manager,
          });
        });
        leads += 1;
      }
      return { todos, leads };
    },
  };
}
