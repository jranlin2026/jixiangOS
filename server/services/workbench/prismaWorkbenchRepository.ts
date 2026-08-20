import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../../src/types/auth';
import type { EmployeeTask, TaskActivity } from '../../../src/types/enterpriseBrain';
import type { WorkbenchTaskListItem } from '../../../src/types/workbench';
import type { Customer } from '../../../src/types/customer';
import type { Lead } from '../../../src/types/lead';
import type { Order } from '../../../src/types/order';
import type { Delivery } from '../../../src/types/delivery';
import type { RecoveryOrder } from '../../../src/types/recoveryOrder';
import type { DataScopeDomain } from '../../../src/types/role';
import { transitionTaskStatus } from '../../../src/domain/workbench/taskLifecycle';
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
  WorkbenchTaskMetrics,
  WorkbenchTaskPageQuery,
  WorkbenchTaskQuery,
  WorkbenchTaskUpdate,
  WorkbenchTransactionRepository,
} from './workbenchRepository';
import { changedSourceOwnedFields } from './workbenchRepository';
import type { DesiredEmployeeTask } from './sourceAdapter';
import { TaskSyncInvariantError } from './sourceAdapter';

type Client = {
  $transaction<T>(callback: (tx: any) => Promise<T>, options?: { isolationLevel: 'Serializable' | 'RepeatableRead' }): Promise<T>;
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
    departmentNameSnapshot: row.departmentNameSnapshot || null,
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

function desiredSourceOwnedData(desired: DesiredEmployeeTask) {
  return {
    title: desired.title,
    description: desired.description ?? null,
    employeeId: desired.employeeId,
    employeeName: desired.employeeNameSnapshot,
    departmentIdSnapshot: desired.departmentId ?? null,
    departmentNameSnapshot: desired.departmentNameSnapshot ?? null,
    workDate: new Date(`${desired.workDate}T00:00:00.000Z`),
    dueAt: desired.dueAt ? new Date(desired.dueAt) : null,
    priority: desired.priority,
    sourceRoute: desired.sourceRoute ?? null,
    sourceLabel: desired.sourceLabel ?? null,
    collaboratorIds: desired.collaboratorIds === undefined || desired.collaboratorIds === null
      ? Prisma.JsonNull
      : [...desired.collaboratorIds],
    estimatedMinutes: desired.estimatedMinutes ?? null,
    sourceVersion: desired.sourceVersion ?? null,
  };
}

function desiredCreateData(desired: DesiredEmployeeTask, id = `workbench-task-${randomUUID()}`) {
  return {
    id,
    sourceKey: desired.sourceKey,
    taskType: desired.taskType,
    businessModule: desired.businessModule,
    ...desiredSourceOwnedData(desired),
    positionIdSnapshot: null,
    positionNameSnapshot: null,
    targetValue: null,
    actualValue: null,
    unit: null,
    evidenceRequired: false,
    status: 'PENDING',
    result: null,
    returnedReason: null,
  };
}

function isRetryablePrismaWriteError(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && (error.code === 'P2002' || error.code === 'P2034'),
  );
}

async function findTaskBySourceKey(client: Client, sourceKey: string): Promise<EmployeeTask | null> {
  const row = await client.employeeTask.findUnique({
    where: { sourceKey },
    include: { evidence: { orderBy: { createdAt: 'asc' } } },
  });
  return row ? mapTask(row) : null;
}

function assertDesiredIdentity(existing: EmployeeTask, desired: DesiredEmployeeTask): void {
  if (existing.sourceKey !== desired.sourceKey) {
    throw new TaskSyncInvariantError('sourceKey 与已有任务身份不一致');
  }
  if (existing.businessModule !== desired.businessModule) {
    throw new TaskSyncInvariantError('businessModule 与已有任务身份不一致');
  }
  if (existing.taskType !== desired.taskType) {
    throw new TaskSyncInvariantError('taskType 与已有任务身份不一致');
  }
}

class DesiredSyncRetryError extends Error {}

async function synchronizeDesiredOnce(client: Client, desired: DesiredEmployeeTask): Promise<EmployeeTask> {
  const createId = `workbench-task-${randomUUID()}`;
  const row = await client.employeeTask.upsert({
    where: { sourceKey: desired.sourceKey },
    create: desiredCreateData(desired, createId),
    update: {},
    include: { evidence: { orderBy: { createdAt: 'asc' } } },
  });
  const task = mapTask(row);
  if (row.id === createId) {
    await client.taskActivity.create({
      data: {
        id: `task-activity-${randomUUID()}`, taskId: task.id, action: 'CREATE', actorId: null,
        actorName: null, fromStatus: null, toStatus: 'PENDING', comment: null,
        metadata: { source: 'RECONCILIATION', sourceKey: desired.sourceKey, businessModule: desired.businessModule },
      },
    });
    return task;
  }
  assertDesiredIdentity(task, desired);
  const changedFields = changedSourceOwnedFields(task, desired);
  if (!changedFields.length) return task;
  const reminderIdentityChanged = changedFields.some((field) => [
    'employeeId', 'departmentId', 'departmentNameSnapshot', 'dueAt', 'workDate',
  ].includes(field));
  const changed = await client.employeeTask.updateMany({
    where: { id: task.id, sourceKey: desired.sourceKey },
    data: {
      ...desiredSourceOwnedData(desired),
      ...(reminderIdentityChanged ? { remindedAt: null, lastOverdueNotifiedAt: null } : {}),
    },
  });
  if (changed.count !== 1) throw new DesiredSyncRetryError('source task changed during synchronization');
  await client.taskActivity.create({
    data: {
      id: `task-activity-${randomUUID()}`, taskId: task.id, action: 'SOURCE_SYNC', actorId: null,
      actorName: null, fromStatus: task.status, toStatus: task.status, comment: null,
      metadata: {
        source: 'RECONCILIATION', changedFields,
        ...(changedFields.includes('employeeId') ? {
          previousEmployeeId: task.employeeId,
          previousEmployeeName: task.employeeName,
          employeeId: desired.employeeId,
          employeeName: desired.employeeNameSnapshot,
        } : {}),
      },
    },
  });
  const updated = await findTaskBySourceKey(client, desired.sourceKey);
  if (!updated) throw new DesiredSyncRetryError('source task disappeared during synchronization');
  return updated;
}

async function upsertDesiredTask(client: Client, desired: DesiredEmployeeTask): Promise<EmployeeTask> {
  const maxAttempts = 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await client.$transaction(
        (transaction) => synchronizeDesiredOnce(transaction, desired),
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      if (!isRetryablePrismaWriteError(error) && !(error instanceof DesiredSyncRetryError)) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

function mapActivity(row: any): TaskActivity {
  return {
    id: row.id, sequence: String(row.sequence ?? 0), taskId: row.taskId, action: row.action, actorId: row.actorId || null,
    actorName: row.actorName || null, fromStatus: row.fromStatus || null, toStatus: row.toStatus || null,
    comment: row.comment || null, metadata: row.metadata ?? null, createdAt: new Date(row.createdAt).toISOString(),
  };
}

const ACTIVE_OVERDUE_STATUSES = ['PENDING', 'IN_PROGRESS', 'RETURNED'] as const;

function shanghaiDayWindow(now: Date): { startAt: Date; endAtExclusive: Date } {
  const shifted = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const startAt = new Date(Date.UTC(
    shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), -8,
  ));
  return { startAt, endAtExclusive: new Date(startAt.getTime() + 24 * 60 * 60 * 1000) };
}

function sqlPlaceholders(values: readonly unknown[]): string {
  return values.map(() => '?').join(', ');
}

function taskWhereSql(query: WorkbenchTaskQuery): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (query.scope.kind === 'mine') {
    clauses.push('(t.`employeeId` = ? OR JSON_CONTAINS(COALESCE(t.`collaboratorIds`, JSON_ARRAY()), JSON_QUOTE(?)))');
    params.push(query.scope.actorId, query.scope.actorId);
  } else if (query.scope.kind === 'departments') {
    if (!query.scope.departmentIds.length) clauses.push('1 = 0');
    else {
      clauses.push(`t.\`departmentIdSnapshot\` IN (${sqlPlaceholders(query.scope.departmentIds)})`);
      params.push(...query.scope.departmentIds);
    }
  }
  if (query.dateFrom) {
    clauses.push('t.`workDate` >= ?');
    params.push(query.dateFrom);
  }
  if (query.dateToExclusive) {
    clauses.push('t.`workDate` < ?');
    params.push(query.dateToExclusive);
  }
  if (query.status) {
    clauses.push('t.`status` = ?');
    params.push(query.status);
  }
  if (query.businessModule) {
    clauses.push('t.`businessModule` = ?');
    params.push(query.businessModule);
  }
  if (query.priority) {
    clauses.push('t.`priority` = ?');
    params.push(query.priority);
  }
  if (query.employeeId) {
    clauses.push('t.`employeeId` = ?');
    params.push(query.employeeId);
  }
  if (query.departmentIds) {
    if (!query.departmentIds.length) clauses.push('1 = 0');
    else {
      clauses.push(`t.\`departmentIdSnapshot\` IN (${sqlPlaceholders(query.departmentIds)})`);
      params.push(...query.departmentIds);
    }
  }
  if (query.overdue !== undefined) {
    const predicate = `t.\`status\` IN (${sqlPlaceholders(ACTIVE_OVERDUE_STATUSES)}) AND t.\`dueAt\` IS NOT NULL AND t.\`dueAt\` < ?`;
    clauses.push(query.overdue ? `(${predicate})` : `NOT (${predicate})`);
    params.push(...ACTIVE_OVERDUE_STATUSES, query.now);
  }
  if (query.confirmation !== undefined) {
    clauses.push(query.confirmation ? 't.`status` = ?' : 't.`status` <> ?');
    params.push('COMPLETED');
  }
  return { sql: clauses.length ? clauses.join(' AND ') : '1 = 1', params };
}

async function listWorkbenchTasks(
  client: Client,
  query: WorkbenchTaskPageQuery,
): Promise<{ items: WorkbenchTaskListItem[]; total: number }> {
  if (!client.$queryRawUnsafe) throw new Error('Prisma client does not support database-backed workbench queries');
  const where = taskWhereSql(query);
  const countRows = await client.$queryRawUnsafe<Array<{ total: unknown }>>(
    `SELECT COUNT(*) AS \`total\` FROM \`employee_tasks\` t WHERE ${where.sql}`,
    ...where.params,
  );
  const total = Number(countRows[0]?.total || 0);
  const { startAt, endAtExclusive } = shanghaiDayWindow(query.now);
  const offset = (query.page - 1) * query.pageSize;
  const idRows = await client.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT t.\`id\`
       FROM \`employee_tasks\` t
      WHERE ${where.sql}
      ORDER BY CASE
        WHEN t.\`status\` = 'RETURNED' THEN 0
        WHEN t.\`status\` IN ('PENDING', 'IN_PROGRESS', 'RETURNED') AND t.\`dueAt\` IS NOT NULL AND t.\`dueAt\` < ? THEN 1
        WHEN t.\`priority\` = 'URGENT' THEN 2
        WHEN t.\`status\` IN ('PENDING', 'IN_PROGRESS', 'RETURNED') AND t.\`dueAt\` >= ? AND t.\`dueAt\` < ? THEN 3
        WHEN t.\`priority\` = 'HIGH' THEN 4
        ELSE 5
      END ASC,
      CASE WHEN t.\`dueAt\` IS NULL THEN 1 ELSE 0 END ASC,
      t.\`dueAt\` ASC, t.\`createdAt\` ASC, t.\`id\` ASC
      LIMIT ? OFFSET ?`,
    ...where.params, query.now, startAt, endAtExclusive, query.pageSize, offset,
  );
  const ids = idRows.map((row) => row.id);
  if (!ids.length) return { items: [], total };
  const rows = await client.employeeTask.findMany({ where: { id: { in: ids } } });
  const rowById = new Map(rows.map((row: any) => [row.id, row]));
  return {
    items: ids.flatMap((id) => {
      const row = rowById.get(id);
      if (!row) return [];
      const { evidence: _evidence, activities: _activities, ...item } = mapTask({ ...row, evidence: [] });
      return [item as WorkbenchTaskListItem];
    }),
    total,
  };
}

const metricNumber = (row: Record<string, unknown>, key: string): number => Number(row[key] || 0);

async function summarizeWorkbenchTasks(client: Client, query: WorkbenchTaskQuery): Promise<WorkbenchTaskMetrics> {
  if (!client.$queryRawUnsafe) throw new Error('Prisma client does not support grouped workbench queries');
  const where = taskWhereSql(query);
  const { startAt, endAtExclusive } = shanghaiDayWindow(query.now);
  const collaborationSql = query.scope.kind === 'mine'
    ? 'SUM(t.`employeeId` <> ? AND JSON_CONTAINS(COALESCE(t.`collaboratorIds`, JSON_ARRAY()), JSON_QUOTE(?)))'
    : 'SUM(JSON_LENGTH(COALESCE(t.`collaboratorIds`, JSON_ARRAY())) > 0)';
  const collaborationParams = query.scope.kind === 'mine'
    ? [query.scope.actorId, query.scope.actorId]
    : [];
  const rows = await client.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT
       COUNT(*) AS \`total\`,
       SUM(t.\`status\` = 'PENDING') AS \`pending\`,
       SUM(t.\`status\` = 'IN_PROGRESS') AS \`inProgress\`,
       SUM(t.\`status\` = 'COMPLETED') AS \`completed\`,
       SUM(t.\`status\` = 'CONFIRMED') AS \`confirmed\`,
       SUM(t.\`status\` = 'RETURNED') AS \`returned\`,
       SUM(t.\`status\` = 'CANCELED') AS \`canceled\`,
       SUM(t.\`status\` IN ('PENDING', 'IN_PROGRESS', 'RETURNED') AND t.\`dueAt\` IS NOT NULL AND t.\`dueAt\` < ?) AS \`overdue\`,
       SUM(t.\`status\` IN ('PENDING', 'IN_PROGRESS', 'RETURNED') AND t.\`dueAt\` >= ? AND t.\`dueAt\` < ?) AS \`dueToday\`,
       ${collaborationSql} AS \`collaboration\`,
       COALESCE(SUM(t.\`estimatedMinutes\`), 0) AS \`estimatedMinutes\`,
       SUM(t.\`estimatedMinutes\` IS NOT NULL) AS \`estimatedMinutesTaskCount\`,
       SUM(t.\`status\` = 'CONFIRMED' AND t.\`dueAt\` IS NOT NULL AND COALESCE(a.\`firstCompleteAt\`, t.\`completedAt\`) IS NOT NULL AND COALESCE(a.\`firstCompleteAt\`, t.\`completedAt\`) <= t.\`dueAt\`) AS \`onTime\`,
       SUM(t.\`status\` = 'CONFIRMED' AND t.\`dueAt\` IS NOT NULL AND COALESCE(a.\`firstCompleteAt\`, t.\`completedAt\`) IS NOT NULL) AS \`onTimeDenominator\`,
       SUM(t.\`status\` <> 'CANCELED' AND t.\`dueAt\` IS NOT NULL) AS \`overdueDenominator\`,
       COALESCE(SUM(a.\`returnCount\`), 0) AS \`historicalReturnEventCount\`,
       SUM(t.\`status\` <> 'CANCELED' AND COALESCE(a.\`returnCount\`, 0) > 0) AS \`returnedTaskCount\`,
       SUM(t.\`status\` = 'RETURNED' OR (t.\`status\` IN ('PENDING', 'IN_PROGRESS') AND t.\`dueAt\` IS NOT NULL AND t.\`dueAt\` < ?)) AS \`blocked\`,
       COALESCE(SUM(CASE WHEN COALESCE(a.\`firstStartAt\`, t.\`startedAt\`) IS NOT NULL AND COALESCE(a.\`firstStartAt\`, t.\`startedAt\`) >= t.\`createdAt\` THEN TIMESTAMPDIFF(SECOND, t.\`createdAt\`, COALESCE(a.\`firstStartAt\`, t.\`startedAt\`)) / 60 ELSE 0 END), 0) AS \`firstActionMinutesTotal\`,
       SUM(COALESCE(a.\`firstStartAt\`, t.\`startedAt\`) IS NOT NULL AND COALESCE(a.\`firstStartAt\`, t.\`startedAt\`) >= t.\`createdAt\`) AS \`firstActionDenominator\`,
       COALESCE(SUM(CASE WHEN COALESCE(a.\`firstCompleteAt\`, t.\`completedAt\`) IS NOT NULL AND COALESCE(a.\`firstConfirmAt\`, t.\`confirmedAt\`) IS NOT NULL AND COALESCE(a.\`firstConfirmAt\`, t.\`confirmedAt\`) >= COALESCE(a.\`firstCompleteAt\`, t.\`completedAt\`) THEN TIMESTAMPDIFF(SECOND, COALESCE(a.\`firstCompleteAt\`, t.\`completedAt\`), COALESCE(a.\`firstConfirmAt\`, t.\`confirmedAt\`)) / 60 ELSE 0 END), 0) AS \`confirmationMinutesTotal\`,
       SUM(COALESCE(a.\`firstCompleteAt\`, t.\`completedAt\`) IS NOT NULL AND COALESCE(a.\`firstConfirmAt\`, t.\`confirmedAt\`) IS NOT NULL AND COALESCE(a.\`firstConfirmAt\`, t.\`confirmedAt\`) >= COALESCE(a.\`firstCompleteAt\`, t.\`completedAt\`)) AS \`confirmationDurationDenominator\`
     FROM \`employee_tasks\` t
     LEFT JOIN (
       SELECT \`taskId\`,
         MIN(CASE WHEN \`action\` = 'START' THEN \`createdAt\` END) AS \`firstStartAt\`,
         MIN(CASE WHEN \`action\` = 'COMPLETE' THEN \`createdAt\` END) AS \`firstCompleteAt\`,
         MIN(CASE WHEN \`action\` = 'CONFIRM' THEN \`createdAt\` END) AS \`firstConfirmAt\`,
         SUM(\`action\` = 'RETURN') AS \`returnCount\`
       FROM \`task_activities\`
       GROUP BY \`taskId\`
     ) a ON a.\`taskId\` = t.\`id\`
     WHERE ${where.sql}`,
    query.now, startAt, endAtExclusive, ...collaborationParams, query.now, ...where.params,
  );
  const row = rows[0] || {};
  return {
    total: metricNumber(row, 'total'),
    statusCounts: {
      PENDING: metricNumber(row, 'pending'),
      IN_PROGRESS: metricNumber(row, 'inProgress'),
      COMPLETED: metricNumber(row, 'completed'),
      CONFIRMED: metricNumber(row, 'confirmed'),
      RETURNED: metricNumber(row, 'returned'),
      CANCELED: metricNumber(row, 'canceled'),
    },
    overdue: metricNumber(row, 'overdue'),
    dueToday: metricNumber(row, 'dueToday'),
    collaboration: metricNumber(row, 'collaboration'),
    estimatedMinutes: metricNumber(row, 'estimatedMinutes'),
    estimatedMinutesTaskCount: metricNumber(row, 'estimatedMinutesTaskCount'),
    onTime: metricNumber(row, 'onTime'),
    onTimeDenominator: metricNumber(row, 'onTimeDenominator'),
    overdueDenominator: metricNumber(row, 'overdueDenominator'),
    historicalReturnEventCount: metricNumber(row, 'historicalReturnEventCount'),
    returnedTaskCount: metricNumber(row, 'returnedTaskCount'),
    blocked: metricNumber(row, 'blocked'),
    firstActionMinutesTotal: metricNumber(row, 'firstActionMinutesTotal'),
    firstActionDenominator: metricNumber(row, 'firstActionDenominator'),
    confirmationMinutesTotal: metricNumber(row, 'confirmationMinutesTotal'),
    confirmationDurationDenominator: metricNumber(row, 'confirmationDurationDenominator'),
  };
}

function taskUpdateData(update: WorkbenchTaskUpdate) {
  const { evidence: _evidence, evidenceActorId: _evidenceActorId, ...raw } = update;
  const data: Record<string, unknown> = { ...raw };
  for (const field of ['startedAt', 'completedAt', 'confirmedAt', 'canceledAt', 'remindedAt', 'lastOverdueNotifiedAt'] as const) {
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
      if (!rows.some((department: any) => department.id === rootId)) return [];
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
    findBySourceKey(sourceKey) {
      return findTaskBySourceKey(prisma, sourceKey);
    },
    createFromDesired(desired) {
      return upsertDesiredTask(prisma, desired);
    },
    async updateSourceOwnedFields(taskId, desired) {
      const row = await prisma.employeeTask.findUnique({
        where: { id: taskId },
        include: { evidence: { orderBy: { createdAt: 'asc' } } },
      });
      if (!row) return null;
      const existing = mapTask(row);
      assertDesiredIdentity(existing, desired);
      return upsertDesiredTask(prisma, desired);
    },
    cancelFromSource(taskId) {
      return prisma.$transaction(async (transaction) => {
        const repository = createTransactionRepository(transaction);
        const existing = await repository.findTaskForUpdate(taskId);
        if (!existing) return null;
        try {
          transitionTaskStatus(existing.status, 'CANCEL');
        } catch {
          return existing;
        }
        const canceledAt = new Date();
        const canceledReason = '来源业务不再需要此任务';
        const updated = await repository.updateTask(taskId, {
          status: 'CANCELED', canceledAt: canceledAt.toISOString(), canceledById: null, canceledReason,
        });
        if (!updated) return null;
        await repository.appendActivity({
          taskId,
          action: 'CANCEL',
          actorId: null,
          actorName: null,
          fromStatus: existing.status,
          toStatus: 'CANCELED',
          comment: canceledReason,
          metadata: { sourceKey: existing.sourceKey, source: 'RECONCILIATION' },
          createdAt: canceledAt,
        });
        return updated;
      }, { isolationLevel: 'Serializable' });
    },
    listWorkbenchTasks(query) {
      return prisma.$transaction(
        (transaction) => listWorkbenchTasks(transaction, query),
        { isolationLevel: 'RepeatableRead' },
      );
    },
    summarizeWorkbenchTasks(query) {
      return summarizeWorkbenchTasks(prisma, query);
    },
  };
}
