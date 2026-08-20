import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../../src/types/auth';
import type { EmployeeTask, TaskActivity } from '../../../src/types/enterpriseBrain';
import type { Customer } from '../../../src/types/customer';
import type { Lead } from '../../../src/types/lead';
import type { Order } from '../../../src/types/order';
import type { Delivery } from '../../../src/types/delivery';
import type { RecoveryOrder } from '../../../src/types/recoveryOrder';
import type { DataScopeDomain } from '../../../src/types/role';
import { STORAGE_KEYS } from '../../../src/shared/utils/constants';
import {
  buildDataVisibilityScopeForUser,
  canViewCustomer,
  canViewLead,
  canViewOrder,
  type DataVisibilityScope,
} from '../../../src/shared/utils/dataVisibility';
import { hasPermission, PERMISSION_KEYS } from '../../../src/shared/utils/permissions';
import { mapPrismaRole, mapPrismaUser } from '../../db/prismaMappers';
import { BUSINESS_ATTACHMENT_DOMAIN, type BusinessAttachmentRecord } from '../businessAttachmentService';
import type {
  EvidenceReferencesAuthorizationInput,
  TaskActivityInput,
  WorkbenchRepository,
  WorkbenchTaskUpdate,
  WorkbenchTransactionRepository,
} from './workbenchRepository';

type Client = {
  $transaction<T>(callback: (tx: any) => Promise<T>, options?: { isolationLevel: 'Serializable' }): Promise<T>;
  $queryRawUnsafe?<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  employeeTask: any;
  taskActivity: any;
  taskEvidence: any;
  user: any;
  role: any;
  department: any;
  leadRecord: any;
  businessRecord: any;
};

const iso = (value: unknown): string | null => value ? new Date(value as string).toISOString() : null;
const dateText = (value: unknown): string => new Date(value as string).toISOString().slice(0, 10);
const number = (value: unknown): number | null => value === null || value === undefined ? null : Number(value);

const ACADEMY_TASK_ATTACHMENT_DOMAIN = 'academy_task_attachments';

function object<T extends object>(value: unknown): T | null {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as T : null;
  } catch {
    return null;
  }
}

function createScopeResolver(client: Client, actor: AuthenticatedUser) {
  let directory: Promise<{ users: any[]; roles: any[]; departments: any[] }> | undefined;
  const scopes = new Map<DataScopeDomain, Promise<DataVisibilityScope>>();
  return (domain: DataScopeDomain): Promise<DataVisibilityScope> => {
    const existing = scopes.get(domain);
    if (existing) return existing;
    directory ||= Promise.all([
      client.user.findMany(),
      client.role.findMany({ where: { isActive: true } }),
      client.department.findMany(),
    ]).then(([users, roles, departments]) => ({ users, roles, departments }));
    const scope = directory.then(({ users, roles, departments }) => buildDataVisibilityScopeForUser(
      actor, users.map(mapPrismaUser), roles.map(mapPrismaRole), departments as any, domain,
    ));
    scopes.set(domain, scope);
    return scope;
  };
}

function visibleRelation(
  scope: DataVisibilityScope,
  relations: Array<[string | undefined, string | undefined]>,
): boolean {
  if (scope.unrestricted) return true;
  return relations.some(([id, name]) => (
    id ? scope.visibleUserIds.includes(id) : Boolean(name && scope.visibleUserNames.includes(name))
  ));
}

function attachmentMatches(
  value: unknown,
  attachment: BusinessAttachmentRecord,
): boolean {
  return Array.isArray(value) && value.some((candidate) => {
    const record = object<{ id?: unknown; category?: unknown }>(candidate);
    return record?.id === attachment.id && record.category === attachment.category;
  });
}

function recordContainsAttachment(row: any, attachment: BusinessAttachmentRecord): boolean {
  if (row.domain === STORAGE_KEYS.ORDERS) {
    const record = object<Order>(row.data);
    if (!record) return false;
    if (attachment.category === 'order-deal-evidence') {
      return attachmentMatches(record.dealEvidenceAttachments, attachment);
    }
    return attachment.category === 'order-payment-proof'
      && Array.isArray(record.payments)
      && record.payments.some((payment) => attachmentMatches(payment.attachments, attachment));
  }
  if (row.domain === STORAGE_KEYS.RECOVERY_ORDERS) {
    const record = object<RecoveryOrder>(row.data);
    return Boolean(record && [
      record.recoveryAttachments, record.paymentAttachments, record.chatAttachments,
    ].some((items) => attachmentMatches(items, attachment)));
  }
  if (row.domain === STORAGE_KEYS.DELIVERIES) {
    const record = object<Delivery>(row.data);
    if (!record || attachment.category !== 'delivery-task-file') return false;
    return (Array.isArray(record.tasks) && record.tasks.some((task) => attachmentMatches(task.attachments, attachment)))
      || (Array.isArray(record.materialItems) && record.materialItems.some((item) => attachmentMatches(item.attachments, attachment)));
  }
  return false;
}

async function authorizeBusinessRecordRow(
  row: any,
  actor: AuthenticatedUser,
  scopeFor: (domain: DataScopeDomain) => Promise<DataVisibilityScope>,
): Promise<boolean> {
  if (row.domain === STORAGE_KEYS.CUSTOMERS) {
    if (!hasPermission(actor, PERMISSION_KEYS.CUSTOMER_LIST, 'read')) return false;
    const record = object<Customer>(row.data);
    if (!record || row.deletedAt || record.deletedAt || row.mergedIntoId || record.mergedIntoId) return false;
    return canViewCustomer(record, await scopeFor('customers'));
  }
  if (row.domain === STORAGE_KEYS.LEADS) {
    if (!hasPermission(actor, PERMISSION_KEYS.LEADS_LIST, 'read')) return false;
    const record = object<Lead>(row.data);
    if (!record || row.deletedAt || row.isDeleted || record.deletedAt) return false;
    return canViewLead(record, await scopeFor('leads'));
  }
  if (row.domain === STORAGE_KEYS.ORDERS) {
    if (![PERMISSION_KEYS.ORDER_MANAGE, PERMISSION_KEYS.ORDER_REVIEW_LIST]
      .some((permission) => hasPermission(actor, permission, 'read'))) return false;
    const record = object<Order>(row.data);
    return Boolean(record && !record.deletedAt && canViewOrder(record, await scopeFor('orders')));
  }
  if (row.domain === STORAGE_KEYS.DELIVERIES) {
    if (!hasPermission(actor, PERMISSION_KEYS.DELIVERY_CENTER, 'read')) return false;
    const record = object<Delivery>(row.data);
    if (!record) return false;
    const scope = await scopeFor('deliveries');
    return visibleRelation(scope, [
      [record.ownerId, record.owner], [record.salesOwnerId, record.salesOwner],
    ]);
  }
  if (row.domain === STORAGE_KEYS.RECOVERY_ORDERS) {
    if (![PERMISSION_KEYS.AFTER_SALES_RECOVERY, PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW_LIST]
      .some((permission) => hasPermission(actor, permission, 'read'))) return false;
    const record = object<RecoveryOrder>(row.data);
    if (!record || record.deletedAt) return false;
    const scope = await scopeFor('recoveryOrders');
    return visibleRelation(scope, [
      [record.createdBy, record.createdByName],
      [record.recoveryUserId, record.recoveryUserName],
      [record.assistUserId, record.assistUserName],
    ]);
  }
  return false;
}

function attachmentDomain(attachment: BusinessAttachmentRecord): string | null {
  if (attachment.category === 'order-payment-proof' || attachment.category === 'order-deal-evidence') return STORAGE_KEYS.ORDERS;
  if (attachment.category === 'recovery-payment-proof' || attachment.category === 'recovery-chat-evidence') return STORAGE_KEYS.RECOVERY_ORDERS;
  if (attachment.category === 'delivery-task-file') return STORAGE_KEYS.DELIVERIES;
  return null;
}

function candidateRecordId(domain: string, value: unknown): string | null {
  let candidate = String(value || '').trim();
  if (!candidate) return null;
  if (candidate.startsWith(`${domain}:`)) candidate = candidate.slice(domain.length + 1);
  if (!candidate || candidate.length > 80 || candidate.includes(':')) return null;
  return candidate;
}

function backingCandidateIds(
  attachment: BusinessAttachmentRecord,
  task: EmployeeTask,
  domain: string,
): string[] {
  const ids = new Set<string>();
  [task.sourceId, task.sourceItemId].forEach((value) => {
    const id = candidateRecordId(domain, value);
    if (id) ids.add(id);
  });
  const draftKey = typeof attachment.draftKey === 'string' ? attachment.draftKey.trim() : '';
  if (draftKey && !draftKey.startsWith('business-import:') && !draftKey.startsWith('recovery-new-') && !draftKey.startsWith('recovery-correction-')) {
    const value = attachment.category === 'delivery-task-file' ? draftKey.split(':')[0] : draftKey;
    const id = candidateRecordId(domain, value);
    if (id) ids.add(id);
  }
  return [...ids].slice(0, 3);
}

async function authorizeEvidenceReferenceBatch(
  client: Client,
  input: EvidenceReferencesAuthorizationInput,
): Promise<boolean> {
  const references = [...new Map(input.evidence.map((item) => [
    `${item.type}:${String(item.referenceId || '').trim()}`,
    { ...item, referenceId: String(item.referenceId || '').trim() },
  ])).values()];
  if (!references.length || references.some((item) => !item.referenceId)) return false;
  const scopeFor = createScopeResolver(client, input.actor);
  const attachmentReferences = references.filter((item) => item.type === 'ATTACHMENT');
  const businessReferences = references.filter((item) => item.type === 'BUSINESS_RECORD');
  if (attachmentReferences.length + businessReferences.length !== references.length) return false;

  const attachmentIds = attachmentReferences.map((item) => item.referenceId!);
  const attachmentRows = attachmentIds.length
    ? await client.businessRecord.findMany({
      where: { domain: BUSINESS_ATTACHMENT_DOMAIN, recordId: { in: attachmentIds } },
    })
    : [];
  const attachments = new Map<string, BusinessAttachmentRecord>();
  attachmentRows.forEach((row: any) => {
    const attachment = object<BusinessAttachmentRecord>(row.data);
    if (attachment && attachment.id === row.recordId) attachments.set(row.recordId, attachment);
  });
  if (attachments.size !== attachmentIds.length) return false;

  const directLeadIds: string[] = [];
  const directBusinessIds: string[] = [];
  const leadPrefix = `${STORAGE_KEYS.LEADS}:`;
  businessReferences.forEach((item) => {
    if (item.referenceId!.startsWith(leadPrefix)) directLeadIds.push(item.referenceId!.slice(leadPrefix.length));
    else directBusinessIds.push(item.referenceId!);
  });
  if (directLeadIds.some((id) => !id)) return false;
  const [directBusinessRows, directLeadRows] = await Promise.all([
    directBusinessIds.length
      ? client.businessRecord.findMany({ where: { id: { in: directBusinessIds } } })
      : Promise.resolve([]),
    directLeadIds.length
      ? client.leadRecord.findMany({ where: { id: { in: directLeadIds } } })
      : Promise.resolve([]),
  ]);
  const directRows = new Map<string, any>(directBusinessRows.map((row: any) => [row.id, row]));
  directLeadRows.forEach((row: any) => directRows.set(`${leadPrefix}${row.id}`, {
    id: `${leadPrefix}${row.id}`, domain: STORAGE_KEYS.LEADS, recordId: row.id, data: row.data,
  }));
  if (directRows.size !== businessReferences.length) return false;

  const allowedTaskIds = new Set([
    input.task.id, input.task.sourceId || '', input.task.sourceItemId || '',
  ].filter(Boolean));
  const academyTaskIds = new Set<string>();
  const candidateIdsByDomain = new Map<string, Set<string>>();
  const attachmentCandidates = new Map<string, { domain: string; ids: string[] }>();
  for (const attachment of attachments.values()) {
    if (attachment.category === 'academy-task-evidence') {
      const taskId = typeof attachment.draftKey === 'string' && attachment.draftKey.startsWith('academy-task:')
        ? attachment.draftKey.slice('academy-task:'.length)
        : '';
      if (!taskId || !allowedTaskIds.has(taskId)) return false;
      academyTaskIds.add(taskId);
      continue;
    }
    if (attachment.category === 'academy-course-asset') return false;
    const domain = attachmentDomain(attachment);
    if (!domain) return false;
    const ids = backingCandidateIds(attachment, input.task, domain);
    if (!ids.length) return false;
    attachmentCandidates.set(attachment.id, { domain, ids });
    const domainIds = candidateIdsByDomain.get(domain) || new Set<string>();
    ids.forEach((id) => domainIds.add(id));
    candidateIdsByDomain.set(domain, domainIds);
  }

  const backingRows = new Map<string, any>();
  await Promise.all([...candidateIdsByDomain.entries()].map(async ([domain, ids]) => {
    const rows = await client.businessRecord.findMany({ where: { domain, recordId: { in: [...ids] } } });
    rows.forEach((row: any) => backingRows.set(`${domain}:${row.recordId}`, row));
  }));
  const academyLinks = academyTaskIds.size
    ? await client.businessRecord.findMany({
      where: { domain: ACADEMY_TASK_ATTACHMENT_DOMAIN, recordId: { in: [...academyTaskIds] } },
    })
    : [];
  const linksByTask = new Map<string, any>(academyLinks.map((row: any) => [row.recordId, row]));

  for (const attachment of attachments.values()) {
    if (attachment.category === 'academy-task-evidence') {
      const taskId = attachment.draftKey.slice('academy-task:'.length);
      const linkData = object<{ attachmentIds?: unknown }>(linksByTask.get(taskId)?.data);
      if (!Array.isArray(linkData?.attachmentIds) || !linkData.attachmentIds.map(String).includes(attachment.id)) return false;
      continue;
    }
    const candidates = attachmentCandidates.get(attachment.id)!;
    const matchedRows = candidates.ids
      .map((id) => backingRows.get(`${candidates.domain}:${id}`))
      .filter((row) => row && recordContainsAttachment(row, attachment));
    if (matchedRows.length !== 1) return false;
    if (!await authorizeBusinessRecordRow(matchedRows[0], input.actor, scopeFor)) return false;
  }
  for (const item of businessReferences) {
    if (!await authorizeBusinessRecordRow(directRows.get(item.referenceId!), input.actor, scopeFor)) return false;
  }
  return true;
}

function mapTask(row: any): EmployeeTask {
  return {
    id: row.id, sourceKey: row.sourceKey || null, taskType: row.taskType, priority: row.priority,
    businessModule: row.businessModule, sourceRoute: row.sourceRoute || null, sourceLabel: row.sourceLabel || null,
    employeeId: row.employeeId, employeeName: row.employeeName,
    departmentIdSnapshot: row.departmentIdSnapshot || null,
    positionIdSnapshot: row.positionIdSnapshot || null, positionNameSnapshot: row.positionNameSnapshot || null,
    workDate: dateText(row.workDate), title: row.title, description: row.description || null,
    targetValue: number(row.targetValue), actualValue: number(row.actualValue), unit: row.unit || null,
    evidenceRequired: Boolean(row.evidenceRequired), status: row.status, result: row.result || null,
    dueAt: iso(row.dueAt), returnedReason: row.returnedReason || null,
    startedAt: iso(row.startedAt), completedAt: iso(row.completedAt), confirmedAt: iso(row.confirmedAt),
    confirmedById: row.confirmedById || null, confirmedByName: row.confirmedByName || null,
    canceledAt: iso(row.canceledAt), canceledById: row.canceledById || null, canceledReason: row.canceledReason || null,
    collaboratorIds: Array.isArray(row.collaboratorIds) ? row.collaboratorIds.map(String) : null,
    estimatedMinutes: number(row.estimatedMinutes), qualityScore: number(row.qualityScore),
    qualityComment: row.qualityComment || null, remindedAt: iso(row.remindedAt),
    lastOverdueNotifiedAt: iso(row.lastOverdueNotifiedAt), sourceType: row.sourceType || null,
    sourceId: row.sourceId || null, sourceItemId: row.sourceItemId || null, sourceVersion: row.sourceVersion || null,
    evidence: (row.evidence || []).map((item: any) => ({
      id: item.id, type: item.type, referenceId: item.referenceId || null, content: item.content || null,
    })),
  };
}

function mapActivity(row: any): TaskActivity {
  return {
    id: row.id, taskId: row.taskId, action: row.action, actorId: row.actorId || null,
    actorName: row.actorName || null, fromStatus: row.fromStatus || null, toStatus: row.toStatus || null,
    comment: row.comment || null, metadata: row.metadata ?? null, createdAt: new Date(row.createdAt).toISOString(),
  };
}

function taskUpdateData(update: WorkbenchTaskUpdate) {
  const { evidence: _evidence, evidenceActorId: _evidenceActorId, ...raw } = update;
  const data: Record<string, unknown> = { ...raw };
  for (const field of ['startedAt', 'completedAt', 'confirmedAt', 'canceledAt', 'remindedAt'] as const) {
    if (raw[field] !== undefined) data[field] = raw[field] === null ? null : new Date(raw[field]!);
  }
  return data;
}

function createTransactionRepository(client: Client): WorkbenchTransactionRepository {
  return {
    async findTaskForUpdate(taskId) {
      if (client.$queryRawUnsafe) {
        await client.$queryRawUnsafe('SELECT `id` FROM `employee_tasks` WHERE `id` = ? FOR UPDATE', taskId);
      }
      const row = await client.employeeTask.findUnique({
        where: { id: taskId },
        include: { evidence: { orderBy: { createdAt: 'asc' } } },
      });
      return row ? mapTask(row) : null;
    },

    async updateTask(taskId, update) {
      const changed = await client.employeeTask.updateMany({ where: { id: taskId }, data: taskUpdateData(update) });
      if (changed.count !== 1) return null;
      if (update.evidence) {
        await client.taskEvidence.deleteMany({ where: { taskId } });
        if (update.evidence.length) {
          await client.taskEvidence.createMany({
            data: update.evidence.map((item) => ({
              id: `task-evidence-${randomUUID()}`, taskId, type: item.type,
              referenceId: item.referenceId || null, content: item.content || null,
              createdById: update.evidenceActorId || '',
            })),
          });
        }
      }
      const row = await client.employeeTask.findUnique({
        where: { id: taskId },
        include: { evidence: { orderBy: { createdAt: 'asc' } } },
      });
      return row ? mapTask(row) : null;
    },

    async appendActivity(activity: TaskActivityInput) {
      const row = await client.taskActivity.create({
        data: {
          id: `task-activity-${randomUUID()}`, taskId: activity.taskId, action: activity.action,
          actorId: activity.actorId, actorName: activity.actorName, fromStatus: activity.fromStatus,
          toStatus: activity.toStatus, comment: activity.comment,
          metadata: activity.metadata === null ? Prisma.DbNull : activity.metadata,
          ...(activity.createdAt ? { createdAt: activity.createdAt } : {}),
        },
      });
      return mapActivity(row);
    },

    async findEmployee(employeeId) {
      const user = await client.user.findUnique({ where: { id: employeeId } });
      if (!user) return null;
      const department = user.departmentId
        ? await client.department.findUnique({ where: { id: user.departmentId }, select: { name: true } })
        : null;
      return {
        id: user.id, name: user.name, departmentId: user.departmentId || undefined,
        departmentName: department?.name || undefined, positionId: user.positionId || undefined,
        positionName: user.positionName || undefined, isActive: Boolean(user.isActive),
        employmentStatus: user.employmentStatus,
      };
    },

    async listDepartmentTree(rootId) {
      const rows = await client.department.findMany({ where: { isActive: true }, select: { id: true, parentId: true } });
      const ids = new Set([rootId]);
      let changed = true;
      while (changed) {
        changed = false;
        rows.forEach((department: any) => {
          if (department.parentId && ids.has(department.parentId) && !ids.has(department.id)) {
            ids.add(department.id);
            changed = true;
          }
        });
      }
      return [...ids];
    },

    async authorizeEvidenceReferences(input) {
      return authorizeEvidenceReferenceBatch(client, input);
    },
  };
}

export function createPrismaWorkbenchRepository(prisma: Client): WorkbenchRepository {
  const direct = createTransactionRepository(prisma);
  return {
    ...direct,
    transaction(work) {
      return prisma.$transaction(
        (transaction) => work(createTransactionRepository(transaction)),
        { isolationLevel: 'Serializable' },
      );
    },
  };
}
