import { createHash } from 'node:crypto';
import type { EmployeeTask, TaskActivity } from '../../../src/types/enterpriseBrain';
import { isSuperAdminUser } from '../../../src/shared/utils/permissions';
import type { WorkbenchNotificationEvent } from './workbenchCommandService';
import type { ReminderScanCursor } from './workbenchScheduler';

export type WorkbenchNotificationRecipient = Readonly<{ id: string; name: string }>;

type WorkbenchWorkflow = {
  workbenchRule?(client: unknown): Promise<{
    enabled: boolean;
    channels: Array<'FEISHU'>;
    config: { dueSoonMinutes: number; schedulerFailureThreshold: number };
  }>;
  publishWorkbench(client: unknown, input: {
    eventType: string;
    businessId: string;
    recipientId: string;
    recipientName: string;
    title: string;
    content: string;
    severity: 'S0' | 'S1' | 'S2' | 'S3';
    actionUrl: string;
    dedupeKey: string;
    metadata?: unknown;
  }): Promise<{ accepted: boolean; created: boolean }>;
};

type Dependencies = {
  prisma: any;
  workflow: WorkbenchWorkflow;
};

type ReminderScanInput = {
  now: Date;
  signal: AbortSignal;
  cursor?: ReminderScanCursor | null;
  checkpoint?: (cursor: ReminderScanCursor | null) => Promise<void>;
};
type SchedulerFailureInput = {
  jobType: 'DAILY_GENERATION' | 'RECONCILIATION' | 'REMINDER_SCAN';
  runId: string;
  at: Date;
};
type ReminderScanResult = {
  scanned: number;
  notified: number;
  skipped: number;
  failed: number;
  errors: Array<{ code: 'REMINDER_PUBLISH_FAILED' | 'LIFECYCLE_PUBLISH_FAILED' }>;
};

const ACTIVE_REMINDER_STATUSES = ['PENDING', 'IN_PROGRESS', 'RETURNED'] as const;
const DEFAULT_RULE = { enabled: true, config: { dueSoonMinutes: 60, schedulerFailureThreshold: 3 } };
const ACTIVITY_PAGE_SIZE = 500;
const SCHEDULED_REMINDER_PAGE_SIZE = 500;

function taskRoute(taskId: string): string {
  return `/tasks?taskId=${encodeURIComponent(taskId)}`;
}

function transitionDedupeKey(activity: TaskActivity, recipientId: string): string {
  const recipientKey = createHash('sha256').update(recipientId).digest('hex').slice(0, 16);
  return `workbench:${activity.taskId}:${activity.id}:${recipientKey}`;
}

function businessDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('INVALID_SHANGHAI_BUSINESS_DATE');
  return value;
}

export function shanghaiNotificationDate(value: Date): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(value);
}

function shanghaiDayStart(value: Date): Date {
  return new Date(`${shanghaiNotificationDate(value)}T00:00:00.000+08:00`);
}

function activeReminderTask(task: any): boolean {
  return ACTIVE_REMINDER_STATUSES.includes(task?.status)
    && Boolean(task?.dueAt)
    && Number.isFinite(new Date(task.dueAt).getTime());
}

function activeRecipient(row: any): WorkbenchNotificationRecipient | null {
  return row?.isActive && String(row.employmentStatus || 'active') === 'active'
    ? { id: String(row.id), name: String(row.name) }
    : null;
}

function validReminderCursor(value: unknown): value is ReminderScanCursor {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const cursor = value as Record<string, unknown>;
  if (Object.keys(cursor).some((key) => key !== 'dueAt' && key !== 'id')) return false;
  return typeof cursor.dueAt === 'string'
    && cursor.dueAt.length <= 40
    && Number.isFinite(new Date(cursor.dueAt).getTime())
    && typeof cursor.id === 'string'
    && cursor.id.length > 0
    && cursor.id.length <= 64
    && !/[\u0000-\u001f\u007f]/.test(cursor.id);
}

export function createWorkbenchNotificationService(deps: Dependencies) {
  const effectiveRule = () => deps.workflow.workbenchRule
    ? deps.workflow.workbenchRule(deps.prisma)
    : Promise.resolve({ ...DEFAULT_RULE, channels: [] as [] });

  const markActivity = async (
    activityId: string,
    state: 'PUBLISHED' | 'SKIPPED',
    reason?: string,
    client: any = deps.prisma,
  ) => {
    if (!client.taskActivity?.updateMany) return { count: 0 };
    return client.taskActivity.updateMany({
      where: { id: activityId, notificationState: 'PENDING' },
      data: {
        notificationState: state,
        notificationPublishedAt: state === 'PUBLISHED' ? new Date() : null,
        notificationSkipReason: state === 'SKIPPED' ? reason || 'NO_NOTIFICATION_REQUIRED' : null,
      },
    });
  };

  const publishTransition = (
    client: unknown,
    eventType: string,
    title: string,
    task: EmployeeTask,
    activity: TaskActivity,
    recipient: WorkbenchNotificationRecipient,
    severity: 'S1' | 'S2' = 'S2',
  ) => deps.workflow.publishWorkbench(client, {
    eventType,
    businessId: task.id,
    recipientId: recipient.id,
    recipientName: recipient.name,
    title,
    content: '请进入我的工作台查看任务摘要并处理。',
    severity,
    actionUrl: taskRoute(task.id),
    dedupeKey: transitionDedupeKey(activity, recipient.id),
    metadata: {
      activityId: activity.id,
      activitySequence: activity.sequence || '0',
      activityVersion: activity.createdAt,
    },
  });

  const publishDueSoon = (
    client: unknown,
    task: EmployeeTask,
    employee: WorkbenchNotificationRecipient,
    shanghaiDate: string,
  ) => {
    const date = businessDate(shanghaiDate);
    return deps.workflow.publishWorkbench(client, {
      eventType: 'WORKBENCH_TASK_DUE_SOON', businessId: task.id,
      recipientId: employee.id, recipientName: employee.name,
      title: '任务即将到期', content: '请进入我的工作台查看任务摘要并及时处理。',
      severity: 'S1', actionUrl: taskRoute(task.id),
      dedupeKey: `workbench:due-soon:${task.id}:${date}:${employee.id}`,
      metadata: { businessDate: date },
    });
  };

  const publishManualReminder = (
    client: unknown,
    task: EmployeeTask,
    activity: TaskActivity,
    employee: WorkbenchNotificationRecipient,
  ) => deps.workflow.publishWorkbench(client, {
    eventType: 'WORKBENCH_TASK_DUE_SOON', businessId: task.id,
    recipientId: employee.id, recipientName: employee.name,
    title: '任务催办提醒', content: '请进入我的工作台查看任务摘要并及时处理。',
    severity: 'S1', actionUrl: taskRoute(task.id),
    dedupeKey: transitionDedupeKey(activity, employee.id),
    metadata: {
      activityId: activity.id,
      activitySequence: activity.sequence || '0',
      activityVersion: activity.createdAt,
    },
  });

  const publishOverdue = async (
    client: unknown,
    task: EmployeeTask,
    employee: WorkbenchNotificationRecipient,
    manager: WorkbenchNotificationRecipient | null,
    shanghaiDate: string,
  ) => {
    const date = businessDate(shanghaiDate);
    const results = [await deps.workflow.publishWorkbench(client, {
      eventType: 'WORKBENCH_TASK_OVERDUE', businessId: task.id,
      recipientId: employee.id, recipientName: employee.name,
      title: '任务已逾期', content: '请进入我的工作台查看任务摘要并尽快处理。',
      severity: 'S1', actionUrl: taskRoute(task.id),
      dedupeKey: `workbench:overdue:${task.id}:${date}:${employee.id}`,
      metadata: { businessDate: date },
    })];
    if (manager && manager.id !== employee.id) {
      results.push(await deps.workflow.publishWorkbench(client, {
        eventType: 'WORKBENCH_MANAGER_OVERDUE', businessId: manager.id,
        recipientId: manager.id, recipientName: manager.name,
        title: '团队有逾期任务待处理',
        content: '请进入团队工作台查看授权范围内的逾期摘要。',
        severity: 'S1', actionUrl: '/tasks?overdue=true',
        dedupeKey: `workbench:overdue-manager:${manager.id}:${date}`,
        metadata: { businessDate: date },
      }));
    }
    return results;
  };

  const recipientFor = async (client: any, userId: string): Promise<WorkbenchNotificationRecipient | null> => {
    const row = await client.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, isActive: true, employmentStatus: true },
    });
    return activeRecipient(row);
  };

  const lockedNotificationRecipients = async (
    tx: any,
    task: any,
    explicitUserIds: string[],
    includeCurrentManager: boolean,
  ): Promise<{
    recipients: Map<string, WorkbenchNotificationRecipient>;
    manager: WorkbenchNotificationRecipient | null;
  }> => {
    let managerId: string | null = null;
    if (task.departmentIdSnapshot) {
      if (tx.$queryRawUnsafe) {
        await tx.$queryRawUnsafe(
          'SELECT `id` FROM `departments` WHERE `id` = ? FOR UPDATE', String(task.departmentIdSnapshot),
        );
      }
      if (includeCurrentManager) {
        const department = await tx.department.findUnique({
          where: { id: String(task.departmentIdSnapshot) },
          select: { id: true, managerId: true, isActive: true },
        });
        if (department?.isActive && department.managerId) managerId = String(department.managerId);
      }
    }
    const userIds = [...new Set([...explicitUserIds, managerId]
      .filter((id): id is string => Boolean(id)))].sort();
    if (tx.$queryRawUnsafe) {
      for (const userId of userIds) {
        await tx.$queryRawUnsafe('SELECT `id` FROM `users` WHERE `id` = ? FOR UPDATE', userId);
      }
    }
    const recipients = new Map<string, WorkbenchNotificationRecipient>();
    for (const userId of userIds) {
      const recipient = await recipientFor(tx, userId);
      if (recipient) recipients.set(userId, recipient);
    }
    return { recipients, manager: managerId ? recipients.get(managerId) || null : null };
  };

  const publishLifecycleActivity = async (
    tx: any,
    task: EmployeeTask,
    activity: TaskActivity,
  ): Promise<{
    state: 'PUBLISHED' | 'SKIPPED' | 'PENDING';
    reason?: string;
    publications: Array<{ accepted: boolean; created: boolean }>;
  }> => {
    if (activity.action === 'START') return { state: 'SKIPPED', reason: 'NO_NOTIFICATION_REQUIRED', publications: [] };
    if (activity.action === 'COMPLETE') {
      const { manager } = await lockedNotificationRecipients(tx, task, [], true);
      if (!manager) return { state: 'SKIPPED', reason: 'RECIPIENT_UNAVAILABLE', publications: [] };
      const publications = [await publishTransition(
        tx, 'WORKBENCH_TASK_COMPLETED', '成员任务待确认', task, activity, manager, 'S1',
      )];
      return {
        state: publications.every((item) => item.accepted) ? 'PUBLISHED' : 'PENDING', publications,
      };
    }
    const metadata = activity.metadata && typeof activity.metadata === 'object'
      ? activity.metadata as Record<string, unknown>
      : {};
    const reassignment = activity.action === 'REASSIGN'
      || (activity.action === 'SOURCE_SYNC'
        && Array.isArray(metadata.changedFields)
        && metadata.changedFields.includes('employeeId'));
    if (reassignment) {
      const ids = [...new Set([
        metadata.previousEmployeeId, metadata.employeeId, task.employeeId,
      ].map(String).filter((id) => id && id !== 'undefined'))].sort();
      const { recipients } = await lockedNotificationRecipients(tx, task, ids, false);
      const active = ids.flatMap((id) => recipients.get(id) || []);
      if (!active.length) return { state: 'SKIPPED', reason: 'RECIPIENT_UNAVAILABLE', publications: [] };
      const publications = await Promise.all(active.map((recipient: WorkbenchNotificationRecipient) => publishTransition(
        tx, 'WORKBENCH_TASK_REASSIGNED', '任务负责人已变更', task, activity, recipient, 'S1',
      )));
      return {
        state: publications.every((item) => item.accepted) ? 'PUBLISHED' : 'PENDING', publications,
      };
    }
    const { recipients } = await lockedNotificationRecipients(tx, task, [task.employeeId], false);
    const employee = recipients.get(task.employeeId) || null;
    if (!employee) return { state: 'SKIPPED', reason: 'RECIPIENT_UNAVAILABLE', publications: [] };
    let publications: Array<{ accepted: boolean; created: boolean }> = [];
    if (activity.action === 'CREATE') publications = [await publishTransition(
      tx, 'WORKBENCH_TASK_CREATED', '你收到一项工作台任务', task, activity, employee,
    )];
    if (activity.action === 'RETURN') publications = [await publishTransition(
      tx, 'WORKBENCH_TASK_RETURNED', '任务已被退回', task, activity, employee, 'S1',
    )];
    if (activity.action === 'CONFIRM') publications = [await publishTransition(
      tx, 'WORKBENCH_TASK_CONFIRMED', '任务已确认', task, activity, employee,
    )];
    if (activity.action === 'CANCEL') publications = [await publishTransition(
      tx, 'WORKBENCH_TASK_CANCELED', '任务已取消', task, activity, employee, 'S1',
    )];
    if (activity.action === 'REOPEN') publications = [await publishTransition(
      tx, 'WORKBENCH_TASK_CREATED', '任务已重开', task, activity, employee,
    )];
    if (!publications.length) return { state: 'SKIPPED', reason: 'NO_NOTIFICATION_REQUIRED', publications };
    return {
      state: publications.every((item) => item.accepted) ? 'PUBLISHED' : 'PENDING', publications,
    };
  };

  const processManualReminder = async (event: WorkbenchNotificationEvent) => {
    const metadata = event.activity.metadata && typeof event.activity.metadata === 'object'
      ? event.activity.metadata as Record<string, unknown>
      : {};
    const expected = {
      employeeId: String(metadata.expectedEmployeeId || ''),
      departmentIdSnapshot: metadata.expectedDepartmentIdSnapshot == null
        ? null : String(metadata.expectedDepartmentIdSnapshot),
      dueAt: metadata.expectedDueAt == null ? null : String(metadata.expectedDueAt),
      workDate: String(metadata.expectedWorkDate || ''),
      sourceVersion: metadata.expectedSourceVersion == null ? null : String(metadata.expectedSourceVersion),
    };
    const markerAt = new Date(event.activity.createdAt);
    if (!expected.employeeId || !expected.workDate || !Number.isFinite(markerAt.getTime())) {
      return deps.prisma.$transaction(async (tx: any) => {
        await markActivity(event.activity.id, 'SKIPPED', 'REMINDER_IDENTITY_INVALID', tx);
        return { state: 'SKIPPED' as const, reason: 'REMINDER_IDENTITY_INVALID', publications: [] };
      });
    }
    return deps.prisma.$transaction(async (tx: any) => {
      if (tx.$queryRawUnsafe) {
        await tx.$queryRawUnsafe('SELECT `id` FROM `task_activities` WHERE `id` = ? FOR UPDATE', event.activity.id);
        await tx.$queryRawUnsafe('SELECT `id` FROM `employee_tasks` WHERE `id` = ? FOR UPDATE', event.task.id);
      }
      const outbox = tx.taskActivity?.findUnique
        ? await tx.taskActivity.findUnique({ where: { id: event.activity.id } })
        : { notificationState: 'PENDING' };
      if (!outbox || outbox.notificationState !== 'PENDING') {
        return { state: outbox?.notificationState === 'SKIPPED' ? 'SKIPPED' as const : 'PUBLISHED' as const, publications: [] };
      }
      const current = await tx.employeeTask.findUnique({ where: { id: event.task.id } });
      const sameInstant = (left: unknown, right: unknown) => {
        if (!left && !right) return true;
        return new Date(left as any).getTime() === new Date(right as any).getTime();
      };
      const identityMatches = current
        && ACTIVE_REMINDER_STATUSES.includes(current.status)
        && String(current.employeeId) === expected.employeeId
        && String(current.departmentIdSnapshot || '') === String(expected.departmentIdSnapshot || '')
        && sameInstant(current.dueAt, expected.dueAt)
        && sameInstant(current.workDate, expected.workDate)
        && String(current.sourceVersion || '') === String(expected.sourceVersion || '');
      if (!identityMatches) {
        await markActivity(event.activity.id, 'SKIPPED', 'REMINDER_IDENTITY_CHANGED', tx);
        return { state: 'SKIPPED' as const, reason: 'REMINDER_IDENTITY_CHANGED', publications: [] };
      }
      const { recipients } = await lockedNotificationRecipients(tx, current, [expected.employeeId], false);
      const employee = recipients.get(expected.employeeId) || null;
      if (!employee) {
        await markActivity(event.activity.id, 'SKIPPED', 'RECIPIENT_UNAVAILABLE', tx);
        return { state: 'SKIPPED' as const, reason: 'RECIPIENT_UNAVAILABLE', publications: [] };
      }
      const publication = await publishManualReminder(tx, current as EmployeeTask, event.activity, employee);
      if (!publication.accepted) throw new Error('WORKBENCH_NOTIFICATION_DEFERRED');
      const updated = await tx.employeeTask.updateMany({
        where: {
          id: current.id,
          employeeId: expected.employeeId,
          departmentIdSnapshot: expected.departmentIdSnapshot,
          dueAt: expected.dueAt ? new Date(expected.dueAt) : null,
          workDate: new Date(expected.workDate),
          sourceVersion: expected.sourceVersion,
          status: { in: [...ACTIVE_REMINDER_STATUSES] },
        },
        data: { remindedAt: markerAt },
      });
      if (updated.count !== 1) throw new Error('REMINDER_IDENTITY_CHANGED_AFTER_PUBLISH');
      const marked = await markActivity(event.activity.id, 'PUBLISHED', undefined, tx);
      if (marked.count !== 1) throw new Error('REMINDER_ACTIVITY_STATE_CHANGED');
      return {
        state: 'PUBLISHED' as const,
        publications: [publication],
        task: { ...event.task, remindedAt: markerAt.toISOString() },
      };
    });
  };

  const processLifecycleOutbox = async (activityId: string) => deps.prisma.$transaction(async (tx: any) => {
    if (tx.$queryRawUnsafe) {
      await tx.$queryRawUnsafe('SELECT `id` FROM `task_activities` WHERE `id` = ? FOR UPDATE', activityId);
    }
    const outbox = await tx.taskActivity.findUnique({ where: { id: activityId } });
    if (!outbox || outbox.notificationState !== 'PENDING') {
      return {
        state: outbox?.notificationState === 'SKIPPED' ? 'SKIPPED' as const : 'PUBLISHED' as const,
        publications: [] as Array<{ accepted: boolean; created: boolean }>,
      };
    }
    if (tx.$queryRawUnsafe) {
      await tx.$queryRawUnsafe('SELECT `id` FROM `employee_tasks` WHERE `id` = ? FOR UPDATE', String(outbox.taskId));
    }
    const current = await tx.employeeTask.findUnique({ where: { id: String(outbox.taskId) } });
    if (!current) {
      const marked = await markActivity(activityId, 'SKIPPED', 'TASK_UNAVAILABLE', tx);
      if (marked.count !== 1) throw new Error('LIFECYCLE_ACTIVITY_STATE_CHANGED');
      return {
        state: 'SKIPPED' as const, reason: 'TASK_UNAVAILABLE',
        publications: [] as Array<{ accepted: boolean; created: boolean }>,
      };
    }
    const durableActivity: TaskActivity = {
      id: String(outbox.id), sequence: String(outbox.sequence || '0'), taskId: String(outbox.taskId),
      action: String(outbox.action), actorId: outbox.actorId ? String(outbox.actorId) : null,
      actorName: outbox.actorName ? String(outbox.actorName) : null,
      fromStatus: outbox.fromStatus ? String(outbox.fromStatus) : null,
      toStatus: outbox.toStatus ? String(outbox.toStatus) : null,
      comment: outbox.comment ? String(outbox.comment) : null,
      metadata: outbox.metadata ?? null, createdAt: new Date(outbox.createdAt).toISOString(),
    };
    const outcome = await publishLifecycleActivity(tx, current as EmployeeTask, durableActivity);
    if (outcome.state === 'PENDING') throw new Error('WORKBENCH_NOTIFICATION_DEFERRED');
    const marked = await markActivity(activityId, outcome.state, outcome.reason, tx);
    if (marked.count !== 1) throw new Error('LIFECYCLE_ACTIVITY_STATE_CHANGED');
    return outcome;
  });

  const handleCommandEvent = async (event: WorkbenchNotificationEvent) => {
    if (event.action === 'REMIND') return processManualReminder(event);
    const outcome = await processLifecycleOutbox(event.activity.id);
    return outcome.publications;
  };

  const drainLifecycleOutbox = async (result: ReminderScanResult, signal: AbortSignal) => {
    if (!deps.prisma.taskActivity?.findMany || !deps.prisma.taskActivity?.updateMany) return;
    let afterSequence = 0n;
    while (true) {
      if (signal.aborted) throw signal.reason;
      const activities = await deps.prisma.taskActivity.findMany({
        where: {
          notificationState: 'PENDING',
          ...(afterSequence > 0n ? { sequence: { gt: afterSequence } } : {}),
        },
        include: { task: true },
        orderBy: [{ sequence: 'asc' }],
        take: ACTIVITY_PAGE_SIZE,
      });
      if (!activities.length) break;
      result.scanned += activities.length;
      for (const row of activities) {
        if (signal.aborted) throw signal.reason;
        const rowSequence = BigInt(String(row.sequence || '0'));
        if (rowSequence > afterSequence) afterSequence = rowSequence;
        try {
          let outcome: {
            state: 'PUBLISHED' | 'SKIPPED' | 'PENDING'; reason?: string;
            publications: Array<{ accepted: boolean; created: boolean }>;
          };
          if (row.action === 'REMIND' && row.task) {
            const replayActivity: TaskActivity = {
              id: String(row.id), sequence: String(row.sequence), taskId: String(row.taskId),
              action: String(row.action), actorId: row.actorId ? String(row.actorId) : null,
              actorName: row.actorName ? String(row.actorName) : null,
              fromStatus: row.fromStatus ? String(row.fromStatus) : null,
              toStatus: row.toStatus ? String(row.toStatus) : null,
              comment: row.comment ? String(row.comment) : null, metadata: row.metadata ?? null,
              createdAt: new Date(row.createdAt).toISOString(),
            };
            outcome = await processManualReminder({
              action: 'REMIND', task: row.task as EmployeeTask, activity: replayActivity,
              actor: {} as WorkbenchNotificationEvent['actor'],
              recipientIds: [String(row.task.employeeId)],
            });
          } else {
            outcome = await processLifecycleOutbox(String(row.id));
          }
          if (outcome.state === 'SKIPPED') {
            result.skipped += 1;
          } else {
            const created = outcome.publications.filter((publication) => publication.created).length;
            result.notified += created;
            if (!created) result.skipped += 1;
          }
        } catch (error) {
          if (signal.aborted) throw signal.reason;
          result.failed += 1;
          if (result.errors.length < 100) result.errors.push({ code: 'LIFECYCLE_PUBLISH_FAILED' });
        }
      }
      if (activities.length < ACTIVITY_PAGE_SIZE) break;
    }
  };

  return {
    taskCreated(task: EmployeeTask, activity: TaskActivity, employee: WorkbenchNotificationRecipient) {
      return publishTransition(deps.prisma, 'WORKBENCH_TASK_CREATED', '你收到一项工作台任务', task, activity, employee);
    },
    async taskReassigned(
      task: EmployeeTask,
      activity: TaskActivity,
      previousEmployee: WorkbenchNotificationRecipient,
      employee: WorkbenchNotificationRecipient,
    ) {
      const recipients = previousEmployee.id === employee.id ? [employee] : [previousEmployee, employee];
      return Promise.all(recipients.map((recipient) => publishTransition(
        deps.prisma, 'WORKBENCH_TASK_REASSIGNED', '任务负责人已变更', task, activity, recipient, 'S1',
      )));
    },
    taskCompleted(task: EmployeeTask, activity: TaskActivity, manager: WorkbenchNotificationRecipient) {
      return publishTransition(deps.prisma, 'WORKBENCH_TASK_COMPLETED', '成员任务待确认', task, activity, manager, 'S1');
    },
    taskReturned(task: EmployeeTask, activity: TaskActivity, employee: WorkbenchNotificationRecipient) {
      return publishTransition(deps.prisma, 'WORKBENCH_TASK_RETURNED', '任务已被退回', task, activity, employee, 'S1');
    },
    taskConfirmed(task: EmployeeTask, activity: TaskActivity, employee: WorkbenchNotificationRecipient) {
      return publishTransition(deps.prisma, 'WORKBENCH_TASK_CONFIRMED', '任务已确认', task, activity, employee);
    },
    taskCanceled(task: EmployeeTask, activity: TaskActivity, employee: WorkbenchNotificationRecipient) {
      return publishTransition(deps.prisma, 'WORKBENCH_TASK_CANCELED', '任务已取消', task, activity, employee, 'S1');
    },
    taskDueSoon(task: EmployeeTask, employee: WorkbenchNotificationRecipient, shanghaiDate: string) {
      return publishDueSoon(deps.prisma, task, employee, shanghaiDate);
    },
    async taskOverdue(
      task: EmployeeTask,
      employee: WorkbenchNotificationRecipient,
      manager: WorkbenchNotificationRecipient | null,
      shanghaiDate: string,
    ) {
      return publishOverdue(deps.prisma, task, employee, manager, shanghaiDate);
    },
    async schedulerFailed(input: SchedulerFailureInput) {
      const rule = await effectiveRule();
      if (!rule.enabled) return [];
      const recent = await deps.prisma.workbenchSchedulerRun.findMany({
        where: { jobType: input.jobType, status: { not: 'RUNNING' } },
        orderBy: [{ leaseEpoch: 'desc' }, { id: 'desc' }],
        take: rule.config.schedulerFailureThreshold,
      });
      if (recent.length < rule.config.schedulerFailureThreshold
        || !recent.some((run: any) => run.id === input.runId)
        || recent.some((run: any) => run.status !== 'FAILED')) return [];
      const [roles, users] = await Promise.all([
        deps.prisma.role.findMany({ where: { isActive: true } }),
        deps.prisma.user.findMany({ where: { isActive: true, employmentStatus: 'active' } }),
      ]);
      const administrators = users.filter((user: any) => isSuperAdminUser(user, roles));
      const currentRun = recent.find((run: any) => run.id === input.runId);
      const date = shanghaiNotificationDate(currentRun?.finishedAt ? new Date(currentRun.finishedAt) : input.at);
      return Promise.all(administrators.map((administrator: any) => deps.workflow.publishWorkbench(deps.prisma, {
        eventType: 'WORKBENCH_SCHEDULER_FAILED', businessId: input.jobType,
        recipientId: String(administrator.id), recipientName: String(administrator.name),
        title: '工作台自动任务连续失败',
        content: '工作台自动任务已连续失败，请进入消息与提醒检查运行状态。',
        severity: 'S0', actionUrl: '/settings?group=notifications',
        dedupeKey: `workbench:scheduler-failed:${input.jobType}:${date}:${administrator.id}`,
        metadata: { businessDate: date, jobType: input.jobType },
      })));
    },
    async scanReminders(input: ReminderScanInput): Promise<ReminderScanResult> {
      const { now, signal } = input;
      if (signal.aborted) throw signal.reason;
      const rule = await effectiveRule();
      if (!rule.enabled) return { scanned: 0, notified: 0, skipped: 0, failed: 0, errors: [] };
      const date = shanghaiNotificationDate(now);
      const dayStart = shanghaiDayStart(now);
      const dueSoonAt = new Date(now.getTime() + rule.config.dueSoonMinutes * 60_000);
      const result: ReminderScanResult = {
        scanned: 0, notified: 0, skipped: 0, failed: 0, errors: [],
      };
      await drainLifecycleOutbox(result, signal);
      if (input.cursor != null && !validReminderCursor(input.cursor)) {
        throw new Error('INVALID_REMINDER_SCAN_CURSOR');
      }
      let afterDueAt: Date | null = input.cursor ? new Date(input.cursor.dueAt) : null;
      let afterId = input.cursor?.id || '';
      const checkpoint = input.checkpoint || (async () => undefined);
      while (true) {
        if (signal.aborted) throw signal.reason;
        const candidates: any[] = await deps.prisma.employeeTask.findMany({
          where: {
            status: { in: [...ACTIVE_REMINDER_STATUSES] }, dueAt: { not: null },
            AND: [
              { OR: [
                { dueAt: { gt: now, lte: dueSoonAt }, remindedAt: null },
                { dueAt: { lte: now }, OR: [{ lastOverdueNotifiedAt: null }, { lastOverdueNotifiedAt: { lt: dayStart } }] },
              ] },
              ...(afterDueAt ? [{ OR: [
                { dueAt: { gt: afterDueAt } },
                { dueAt: afterDueAt, id: { gt: afterId } },
              ] }] : []),
            ],
          },
          orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
          take: SCHEDULED_REMINDER_PAGE_SIZE,
        });
        if (!candidates.length) {
          await checkpoint(null);
          break;
        }
        result.scanned += candidates.length;
        for (const candidate of candidates) {
          if (signal.aborted) throw signal.reason;
          try {
            const marked = await deps.prisma.$transaction(async (tx: any) => {
              if (signal.aborted) throw signal.reason;
              if (tx.$queryRawUnsafe) {
                await tx.$queryRawUnsafe('SELECT `id` FROM `employee_tasks` WHERE `id` = ? FOR UPDATE', candidate.id);
              }
              const current = await tx.employeeTask.findUnique({ where: { id: candidate.id } });
              if (!activeReminderTask(current)) return false;
              const sameInstant = (left: unknown, right: unknown) => {
                if (!left && !right) return true;
                return new Date(left as any).getTime() === new Date(right as any).getTime();
              };
              if (String(current.employeeId) !== String(candidate.employeeId)
                || String(current.departmentIdSnapshot || '') !== String(candidate.departmentIdSnapshot || '')
                || !sameInstant(current.dueAt, candidate.dueAt)
                || !sameInstant(current.workDate, candidate.workDate)
                || String(current.sourceVersion || '') !== String(candidate.sourceVersion || '')) return false;
              const dueAt = new Date(current.dueAt);
              const lockedRecipients = await lockedNotificationRecipients(
                tx, current, [String(current.employeeId)], dueAt <= now,
              );
              const employee = lockedRecipients.recipients.get(String(current.employeeId)) || null;
              if (!employee) return false;
              if (dueAt <= now) {
                if (current.lastOverdueNotifiedAt && new Date(current.lastOverdueNotifiedAt) >= dayStart) return false;
                const publications = await publishOverdue(
                  tx, current as EmployeeTask, employee, lockedRecipients.manager, date,
                );
                if (publications.some((publication) => !publication.accepted)) return false;
                const updated = await tx.employeeTask.updateMany({
                  where: {
                    id: current.id, employeeId: candidate.employeeId,
                    departmentIdSnapshot: candidate.departmentIdSnapshot ?? null,
                    workDate: candidate.workDate, sourceVersion: candidate.sourceVersion ?? null,
                    status: { in: [...ACTIVE_REMINDER_STATUSES] }, dueAt: candidate.dueAt,
                    OR: [{ lastOverdueNotifiedAt: null }, { lastOverdueNotifiedAt: { lt: dayStart } }],
                  },
                  data: { lastOverdueNotifiedAt: now },
                });
                return updated.count === 1;
              }
              if (dueAt > dueSoonAt || current.remindedAt) return false;
              const publication = await publishDueSoon(tx, current as EmployeeTask, employee, date);
              if (!publication.accepted) return false;
              const updated = await tx.employeeTask.updateMany({
                where: {
                  id: current.id, employeeId: candidate.employeeId,
                  departmentIdSnapshot: candidate.departmentIdSnapshot ?? null,
                  workDate: candidate.workDate, sourceVersion: candidate.sourceVersion ?? null,
                  status: { in: [...ACTIVE_REMINDER_STATUSES] },
                  dueAt: candidate.dueAt, remindedAt: null,
                },
                data: { remindedAt: now },
              });
              return updated.count === 1;
            });
            if (marked) result.notified += 1;
            else result.skipped += 1;
          } catch (error) {
            if (signal.aborted) throw signal.reason;
            result.failed += 1;
            if (result.errors.length < 100) result.errors.push({ code: 'REMINDER_PUBLISH_FAILED' });
          }
        }
        const last: any = candidates[candidates.length - 1];
        if (!last?.dueAt) throw new Error('REMINDER_CURSOR_DUE_AT_MISSING');
        afterDueAt = new Date(last.dueAt);
        if (!Number.isFinite(afterDueAt.getTime())) throw new Error('REMINDER_CURSOR_DUE_AT_INVALID');
        afterId = String(last.id);
        if (candidates.length < SCHEDULED_REMINDER_PAGE_SIZE) {
          await checkpoint(null);
          if (signal.aborted) throw signal.reason;
          break;
        }
        await checkpoint({ dueAt: afterDueAt.toISOString(), id: afterId });
        if (signal.aborted) throw signal.reason;
      }
      return result;
    },
    handleCommandEvent,
  };
}

export type WorkbenchNotificationService = ReturnType<typeof createWorkbenchNotificationService>;
