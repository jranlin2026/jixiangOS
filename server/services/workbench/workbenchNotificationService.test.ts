import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import type { EmployeeTask, TaskActivity } from '../../../src/types/enterpriseBrain';
import { createWorkbenchNotificationService } from './workbenchNotificationService';

const task = (overrides: Partial<EmployeeTask> = {}): EmployeeTask => ({
  id: 'task-1', sourceKey: 'finance:secret-source', taskType: 'ACTION', priority: 'NORMAL',
  businessModule: 'FINANCE', sourceRoute: '/finance?amount=999999', sourceLabel: '财务机密',
  employeeId: 'employee-1', employeeName: '员工甲', departmentIdSnapshot: 'dept-sales',
  departmentNameSnapshot: '销售部', positionIdSnapshot: null, positionNameSnapshot: null,
  workDate: '2026-08-21', title: '客户甲回款 999999 元', description: '银行账号 secret',
  targetValue: null, actualValue: null, unit: null, evidenceRequired: false,
  status: 'RETURNED', result: '敏感结果', dueAt: '2026-08-21T02:00:00.000Z',
  returnedReason: '敏感退回原因', evidence: [{ id: 'e-1', type: 'TEXT', referenceId: null, content: '敏感证据' }],
  ...overrides,
});

const activity = (overrides: Partial<TaskActivity> = {}): TaskActivity => ({
  id: 'activity-return-1', sequence: '100', taskId: 'task-1', action: 'RETURN', actorId: 'manager-1',
  actorName: '销售经理', fromStatus: 'COMPLETED', toStatus: 'RETURNED',
  comment: '敏感退回原因', metadata: null, createdAt: '2026-08-21T01:00:00.000Z',
  ...overrides,
});

function createManualReminderHarness() {
  const current: any = {
    ...task({ status: 'PENDING', sourceVersion: 'v1' }), remindedAt: null, lastOverdueNotifiedAt: null,
  };
  const row: any = {
    ...activity({
      id: 'manual-remind-replay', sequence: '200', action: 'REMIND',
      fromStatus: 'PENDING', toStatus: 'PENDING',
      metadata: {
        expectedEmployeeId: current.employeeId,
        expectedDepartmentIdSnapshot: current.departmentIdSnapshot,
        expectedDueAt: current.dueAt,
        expectedWorkDate: current.workDate,
        expectedSourceVersion: current.sourceVersion,
      },
    }),
    sequence: 200n, notificationState: 'PENDING', notificationPublishedAt: null,
    notificationSkipReason: null, createdAt: new Date('2026-08-21T01:00:00.000Z'), task: current,
  };
  const notifications: any[] = [];
  const locks: string[] = [];
  const control = { failPublish: false, failMarker: false, failActivityMark: false };
  const same = (left: unknown, right: unknown) => {
    if (!left && !right) return true;
    return new Date(left as any).getTime() === new Date(right as any).getTime();
  };
  const tx: any = {
    employeeTask: {
      findUnique: async () => current,
      updateMany: async ({ where, data }: any) => {
        if (control.failMarker) {
          control.failMarker = false;
          throw new Error('marker write failed');
        }
        const matches = String(where.employeeId) === String(current.employeeId)
          && String(where.departmentIdSnapshot || '') === String(current.departmentIdSnapshot || '')
          && String(where.sourceVersion || '') === String(current.sourceVersion || '')
          && same(where.dueAt, current.dueAt) && same(where.workDate, current.workDate);
        if (!matches) return { count: 0 };
        Object.assign(current, data);
        return { count: 1 };
      },
    },
    taskActivity: {
      findUnique: async () => row,
      updateMany: async ({ where, data }: any) => {
        if (control.failActivityMark) {
          control.failActivityMark = false;
          throw new Error('activity mark crashed');
        }
        if (where.id !== row.id || where.notificationState !== row.notificationState) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
    user: { findUnique: async () => ({
      id: current.employeeId, name: current.employeeName, isActive: true, employmentStatus: 'active',
    }) },
    $queryRawUnsafe: async (sql: string, id: string) => {
      if (sql.includes('FOR UPDATE')) {
        const table = sql.match(/FROM `([^`]+)`/)?.[1];
        locks.push(`${table}:${id}`);
      }
      return [];
    },
  };
  const prisma: any = {
    employeeTask: { findMany: async () => [] },
    department: { findMany: async () => [] },
    taskActivity: {
      findMany: async ({ where }: any) => row.notificationState === 'PENDING'
        && (!where.sequence?.gt || row.sequence > where.sequence.gt) ? [row] : [],
      updateMany: tx.taskActivity.updateMany,
    },
    $transaction: async (work: (client: any) => Promise<unknown>) => {
      const taskSnapshot = structuredClone(current);
      const activitySnapshot = structuredClone({ ...row, task: undefined });
      const notificationLength = notifications.length;
      try {
        return await work(tx);
      } catch (error) {
        for (const key of Object.keys(current)) delete current[key];
        Object.assign(current, taskSnapshot);
        for (const key of Object.keys(row)) if (key !== 'task') delete row[key];
        Object.assign(row, activitySnapshot, { task: current });
        notifications.splice(notificationLength);
        throw error;
      }
    },
  };
  const workflow = {
    async publishWorkbench(_client: unknown, input: any) {
      if (control.failPublish) throw new Error('notification unavailable');
      if (!notifications.some((item) => item.dedupeKey === input.dedupeKey)) notifications.push(input);
      return { accepted: true, created: true };
    },
  };
  return { current, row, notifications, locks, control, prisma, workflow };
}

test('task activities persist monotonic notification outbox state in an additive migration', () => {
  const schema = readFileSync('prisma/schema.prisma', 'utf8');
  const migration = readFileSync(
    'prisma/migrations/20260821120000_workbench_notification_outbox/migration.sql',
    'utf8',
  );
  assert.match(schema, /sequence\s+BigInt\s+@unique\s+@default\(autoincrement\(\)\)/);
  assert.match(schema, /notificationState\s+String\s+@default\("PENDING"\)/);
  assert.match(schema, /notificationPublishedAt\s+DateTime\?/);
  assert.match(schema, /notificationSkipReason\s+String\?/);
  assert.match(migration, /ALTER TABLE `task_activities`/);
  assert.match(migration, /AUTO_INCREMENT/);
  const nullableState = migration.indexOf('ADD COLUMN `notificationState` VARCHAR(24) NULL');
  const legacySkip = migration.indexOf("SET `notificationState` = 'SKIPPED'");
  const futureDefault = migration.indexOf("MODIFY COLUMN `notificationState` VARCHAR(24) NOT NULL DEFAULT 'PENDING'");
  assert.ok(nullableState >= 0, 'legacy rows must start without the future PENDING default');
  assert.ok(legacySkip > nullableState, 'legacy rows must be terminally skipped after the column is added');
  assert.ok(futureDefault > legacySkip, 'PENDING may become the insert default only after legacy rows are skipped');
  assert.match(migration, /`notificationPublishedAt` = CURRENT_TIMESTAMP\(3\)/);
  assert.match(migration, /`notificationSkipReason` = 'LEGACY_HISTORY_UNORDERED'/);
});

test('returned lifecycle activity uses one immutable dedupe key and a safe task route', async () => {
  const notifications: any[] = [];
  const keys = new Set<string>();
  const workflow = {
    async publishWorkbench(_client: unknown, input: any) {
      const created = !keys.has(input.dedupeKey);
      keys.add(input.dedupeKey);
      if (created) notifications.push(input);
      return { accepted: true, created };
    },
  };
  const service = createWorkbenchNotificationService({ prisma: {}, workflow: workflow as any });

  await service.taskReturned(task(), activity(), { id: 'employee-1', name: '员工甲' });
  await service.taskReturned(task(), activity(), { id: 'employee-1', name: '员工甲' });

  assert.equal(notifications.length, 1);
  assert.match(notifications[0].dedupeKey, /activity-return-1/);
  assert.equal(notifications[0].actionUrl, '/tasks?taskId=task-1');
  const serialized = JSON.stringify(notifications[0]);
  for (const secret of ['999999', 'secret', '财务机密', '敏感退回原因', '敏感证据']) {
    assert.equal(serialized.includes(secret), false, `notification leaked ${secret}`);
  }
});

test('maximum-length transition identities fit the durable notification key column', async () => {
  let published: any;
  const service = createWorkbenchNotificationService({
    prisma: {},
    workflow: {
      async publishWorkbench(_client: unknown, input: any) {
        published = input;
        return { accepted: true, created: true };
      },
    } as any,
  });
  await service.taskReturned(
    task({ id: 't'.repeat(64), employeeId: 'e'.repeat(64) }),
    activity({ id: 'a'.repeat(64), taskId: 't'.repeat(64) }),
    { id: 'e'.repeat(64), name: '员工甲' },
  );
  assert.ok(published.dedupeKey.includes('a'.repeat(64)));
  assert.ok(published.dedupeKey.length <= 191);
});

test('lifecycle methods map each committed activity to the intended safe recipient', async () => {
  const notifications: any[] = [];
  const workflow = {
    async publishWorkbench(_client: unknown, input: any) {
      notifications.push(input);
      return { accepted: true, created: true };
    },
  };
  const service = createWorkbenchNotificationService({ prisma: {}, workflow: workflow as any });
  const employee = { id: 'employee-1', name: '员工甲' };
  const manager = { id: 'manager-1', name: '销售经理' };
  const previous = { id: 'employee-old', name: '原负责人' };
  const currentTask = task();

  await service.taskCreated(currentTask, activity({ id: 'activity-create', action: 'CREATE' }), employee);
  await service.taskReassigned(currentTask, activity({ id: 'activity-reassign', action: 'REASSIGN' }), previous, employee);
  await service.taskCompleted(currentTask, activity({ id: 'activity-complete', action: 'COMPLETE' }), manager);
  await service.taskReturned(currentTask, activity(), employee);
  await service.taskConfirmed(currentTask, activity({ id: 'activity-confirm', action: 'CONFIRM' }), employee);
  await service.taskCanceled(currentTask, activity({ id: 'activity-cancel', action: 'CANCEL' }), employee);

  assert.deepEqual(notifications.map((item) => [item.eventType, item.recipientId]), [
    ['WORKBENCH_TASK_CREATED', 'employee-1'],
    ['WORKBENCH_TASK_REASSIGNED', 'employee-old'],
    ['WORKBENCH_TASK_REASSIGNED', 'employee-1'],
    ['WORKBENCH_TASK_COMPLETED', 'manager-1'],
    ['WORKBENCH_TASK_RETURNED', 'employee-1'],
    ['WORKBENCH_TASK_CONFIRMED', 'employee-1'],
    ['WORKBENCH_TASK_CANCELED', 'employee-1'],
  ]);
  assert.equal(new Set(notifications.map((item) => item.dedupeKey)).size, notifications.length);
});

test('daily overdue reminders notify each employee once and aggregate one manager notification', async () => {
  const notifications: any[] = [];
  const keys = new Set<string>();
  const workflow = {
    async publishWorkbench(_client: unknown, input: any) {
      const created = !keys.has(input.dedupeKey);
      keys.add(input.dedupeKey);
      if (created) notifications.push(input);
      return { accepted: true, created };
    },
  };
  const service = createWorkbenchNotificationService({ prisma: {}, workflow: workflow as any });
  const manager = { id: 'manager-1', name: '销售经理' };

  await service.taskOverdue(task(), { id: 'employee-1', name: '员工甲' }, manager, '2026-08-21');
  await service.taskOverdue(task(), { id: 'employee-1', name: '员工甲' }, manager, '2026-08-21');
  await service.taskOverdue(
    task({ id: 'task-2', employeeId: 'employee-2', employeeName: '员工乙' }),
    { id: 'employee-2', name: '员工乙' }, manager, '2026-08-21',
  );

  assert.equal(notifications.filter((item) => item.eventType === 'WORKBENCH_TASK_OVERDUE').length, 2);
  assert.equal(notifications.filter((item) => item.eventType === 'WORKBENCH_MANAGER_OVERDUE').length, 1);
  assert.ok(notifications.every((item) => item.dedupeKey.includes('2026-08-21')));
  assert.ok(notifications.every((item) => !JSON.stringify(item).includes('客户甲')));
});

test('reminder scan uses Shanghai dates, exact department managers, and post-publish markers', async () => {
  const rows: any[] = [
    { ...task({ id: 'due-soon', dueAt: '2026-08-21T01:00:00.000Z' }), remindedAt: null, lastOverdueNotifiedAt: null },
    { ...task({ id: 'overdue-1', dueAt: '2026-08-20T23:00:00.000Z' }), remindedAt: null, lastOverdueNotifiedAt: null },
    { ...task({ id: 'overdue-2', employeeId: 'employee-2', employeeName: '员工乙', dueAt: '2026-08-20T22:00:00.000Z' }), remindedAt: null, lastOverdueNotifiedAt: null },
  ];
  const notifications: any[] = [];
  const keys = new Set<string>();
  const workflow = {
    async publishWorkbench(_client: unknown, input: any) {
      const created = !keys.has(input.dedupeKey);
      keys.add(input.dedupeKey);
      if (created) notifications.push(input);
      return { accepted: true, created };
    },
  };
  const prisma: any = {
    employeeTask: {
      findMany: async () => rows,
      findUnique: async ({ where }: any) => rows.find((row) => row.id === where.id) || null,
      updateMany: async ({ where, data }: any) => {
        const row = rows.find((candidate) => candidate.id === where.id);
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
    department: {
      findMany: async () => [{ id: 'dept-sales', managerId: 'manager-exact', isActive: true }],
      findUnique: async () => ({ id: 'dept-sales', managerId: 'manager-exact', isActive: true }),
    },
    user: {
      findMany: async () => [
        { id: 'employee-1', name: '员工甲', isActive: true, employmentStatus: 'active' },
        { id: 'employee-2', name: '员工乙', isActive: true, employmentStatus: 'active' },
        { id: 'manager-exact', name: '直属部门主管', isActive: true, employmentStatus: 'active' },
        { id: 'manager-parent', name: '上级部门主管', isActive: true, employmentStatus: 'active' },
      ],
      findUnique: async ({ where }: any) => ({
        id: where.id,
        name: where.id === 'manager-exact' ? '直属部门主管' : where.id === 'employee-2' ? '员工乙' : '员工甲',
        isActive: true, employmentStatus: 'active',
      }),
    },
    $transaction: async (work: (tx: any) => Promise<unknown>) => work(prisma),
  };
  const service = createWorkbenchNotificationService({ prisma, workflow: workflow as any });
  const input = { now: new Date('2026-08-21T00:30:00.000Z'), signal: new AbortController().signal };

  const first = await service.scanReminders(input);
  const second = await service.scanReminders(input);

  assert.deepEqual(first, { scanned: 3, notified: 3, skipped: 0, failed: 0, errors: [] });
  assert.deepEqual(second, { scanned: 3, notified: 0, skipped: 3, failed: 0, errors: [] });
  assert.equal(rows[0].remindedAt.toISOString(), input.now.toISOString());
  assert.equal(rows[1].lastOverdueNotifiedAt.toISOString(), input.now.toISOString());
  assert.equal(rows[2].lastOverdueNotifiedAt.toISOString(), input.now.toISOString());
  const managers = notifications.filter((item) => item.eventType === 'WORKBENCH_MANAGER_OVERDUE');
  assert.deepEqual(managers.map((item) => item.recipientId), ['manager-exact']);
  assert.ok(notifications.every((item) => item.dedupeKey.includes('2026-08-21')));
});

test('manager replacement before the reminder transaction uses the current locked manager', async () => {
  const row: any = {
    ...task({ id: 'manager-swap', dueAt: '2026-08-20T23:00:00.000Z' }),
    remindedAt: null, lastOverdueNotifiedAt: null,
  };
  let managerId = 'manager-old';
  let candidateReads = 0;
  const notifications: any[] = [];
  const prisma: any = {
    employeeTask: {
      findMany: async () => {
        candidateReads += 1;
        if (candidateReads === 1) managerId = 'manager-new';
        return [row];
      },
      findUnique: async () => row,
      updateMany: async ({ data }: any) => { Object.assign(row, data); return { count: 1 }; },
    },
    department: {
      findMany: async () => [{ id: 'dept-sales', managerId, isActive: true }],
      findUnique: async () => ({ id: 'dept-sales', managerId, isActive: true }),
    },
    user: {
      findMany: async ({ where }: any) => (where.id.in as string[]).map((id) => ({
        id, name: id, isActive: true, employmentStatus: 'active',
      })),
      findUnique: async ({ where }: any) => ({
        id: where.id, name: where.id, isActive: true, employmentStatus: 'active',
      }),
    },
    $queryRawUnsafe: async () => [],
    $transaction: async (work: (tx: any) => Promise<unknown>) => work(prisma),
  };
  const service = createWorkbenchNotificationService({
    prisma,
    workflow: { publishWorkbench: async (_client, input) => {
      notifications.push(input);
      return { accepted: true, created: true };
    } },
  });
  const input = { now: new Date('2026-08-21T00:30:00.000Z'), signal: new AbortController().signal };

  const current = await service.scanReminders(input);
  assert.equal(current.notified, 1);
  assert.deepEqual(notifications.map((item) => item.recipientId), ['employee-1', 'manager-new']);
  assert.ok(row.lastOverdueNotifiedAt);
});

test('scheduled overdue locks task then department then each sorted unique recipient', async () => {
  const row: any = {
    ...task({
      id: 'manager-is-employee', employeeId: 'same-user', employeeName: '员工兼主管',
      dueAt: '2026-08-20T23:00:00.000Z',
    }),
    remindedAt: null, lastOverdueNotifiedAt: null,
  };
  const locks: string[] = [];
  const prisma: any = {
    employeeTask: {
      findMany: async () => [row], findUnique: async () => row,
      updateMany: async ({ data }: any) => { Object.assign(row, data); return { count: 1 }; },
    },
    department: { findUnique: async () => ({
      id: row.departmentIdSnapshot, managerId: row.employeeId, isActive: true,
    }) },
    user: { findUnique: async () => ({
      id: row.employeeId, name: row.employeeName, isActive: true, employmentStatus: 'active',
    }) },
    $queryRawUnsafe: async (sql: string, id: string) => {
      if (sql.includes('FOR UPDATE')) {
        const table = sql.match(/FROM `([^`]+)`/)?.[1];
        locks.push(`${table}:${id}`);
      }
      return [];
    },
  };
  prisma.$transaction = async (work: (tx: any) => Promise<unknown>) => work(prisma);
  const service = createWorkbenchNotificationService({
    prisma,
    workflow: { publishWorkbench: async () => ({ accepted: true, created: true }) },
  });

  const result = await service.scanReminders({
    now: new Date('2026-08-21T00:30:00.000Z'), signal: new AbortController().signal,
  });

  assert.equal(result.notified, 1);
  assert.deepEqual(locks, [
    'employee_tasks:manager-is-employee',
    'departments:dept-sales',
    'users:same-user',
  ]);
});

test('employee offboarding before the reminder transaction sends nothing and leaves the marker retryable', async () => {
  const row: any = {
    ...task({ id: 'employee-offboard', dueAt: '2026-08-21T01:00:00.000Z' }),
    remindedAt: null, lastOverdueNotifiedAt: null,
  };
  let employeeActive = true;
  let candidateReads = 0;
  const notifications: any[] = [];
  const prisma: any = {
    employeeTask: {
      findMany: async () => {
        candidateReads += 1;
        if (candidateReads === 1) employeeActive = false;
        return [row];
      },
      findUnique: async () => row,
      updateMany: async ({ data }: any) => { Object.assign(row, data); return { count: 1 }; },
    },
    department: {
      findMany: async () => [],
      findUnique: async () => null,
    },
    user: {
      findMany: async () => [{
        id: row.employeeId, name: row.employeeName, isActive: true, employmentStatus: 'active',
      }],
      findUnique: async () => ({
        id: row.employeeId, name: row.employeeName,
        isActive: employeeActive, employmentStatus: employeeActive ? 'active' : 'left',
      }),
    },
    $queryRawUnsafe: async () => [],
    $transaction: async (work: (tx: any) => Promise<unknown>) => work(prisma),
  };
  const service = createWorkbenchNotificationService({
    prisma,
    workflow: { publishWorkbench: async (_client, input) => {
      notifications.push(input);
      return { accepted: true, created: true };
    } },
  });

  const result = await service.scanReminders({
    now: new Date('2026-08-21T00:30:00.000Z'), signal: new AbortController().signal,
  });

  assert.equal(result.notified, 0);
  assert.equal(notifications.length, 0);
  assert.equal(row.remindedAt, null);
});

test('overdue employee notification and marker do not depend on an active department manager', async () => {
  const row: any = {
    ...task({ id: 'inactive-manager-overdue', dueAt: '2026-08-20T23:00:00.000Z' }),
    remindedAt: null, lastOverdueNotifiedAt: null,
  };
  const notifications: any[] = [];
  let managerId: string | null = 'manager-inactive';
  const prisma: any = {
    employeeTask: {
      findMany: async () => [row], findUnique: async () => row,
      updateMany: async ({ data }: any) => { Object.assign(row, data); return { count: 1 }; },
    },
    department: {
      findMany: async () => [{ id: 'dept-sales', managerId, isActive: true }],
      findUnique: async () => ({ id: 'dept-sales', managerId, isActive: true }),
    },
    user: {
      findMany: async () => [{
        id: row.employeeId, name: row.employeeName, isActive: true, employmentStatus: 'active',
      }],
      findUnique: async ({ where }: any) => where.id === row.employeeId
        ? { id: row.employeeId, name: row.employeeName, isActive: true, employmentStatus: 'active' }
        : { id: where.id, name: '停用主管', isActive: false, employmentStatus: 'left' },
    },
    $queryRawUnsafe: async () => [],
    $transaction: async (work: (tx: any) => Promise<unknown>) => work(prisma),
  };
  const service = createWorkbenchNotificationService({
    prisma,
    workflow: { publishWorkbench: async (_client, input) => {
      notifications.push(input);
      return { accepted: true, created: true };
    } },
  });

  const result = await service.scanReminders({
    now: new Date('2026-08-21T00:30:00.000Z'), signal: new AbortController().signal,
  });

  assert.equal(result.notified, 1);
  assert.deepEqual(notifications.map((item) => item.recipientId), [row.employeeId]);
  assert.equal(row.lastOverdueNotifiedAt.toISOString(), '2026-08-21T00:30:00.000Z');

  managerId = null;
  row.lastOverdueNotifiedAt = null;
  notifications.length = 0;
  const missing = await service.scanReminders({
    now: new Date('2026-08-22T00:30:00.000Z'), signal: new AbortController().signal,
  });
  assert.equal(missing.notified, 1);
  assert.deepEqual(notifications.map((item) => item.recipientId), [row.employeeId]);
});

test('due-soon reminders are employee-only and do not resolve a department manager', async () => {
  const row: any = {
    ...task({ id: 'employee-only-due-soon', dueAt: '2026-08-21T01:00:00.000Z' }),
    remindedAt: null, lastOverdueNotifiedAt: null,
  };
  const notifications: any[] = [];
  const prisma: any = {
    employeeTask: {
      findMany: async () => [row], findUnique: async () => row,
      updateMany: async ({ data }: any) => { Object.assign(row, data); return { count: 1 }; },
    },
    department: { findUnique: async () => { throw new Error('due-soon must not read manager'); } },
    user: { findUnique: async () => ({
      id: row.employeeId, name: row.employeeName, isActive: true, employmentStatus: 'active',
    }) },
    $queryRawUnsafe: async () => [],
    $transaction: async (work: (tx: any) => Promise<unknown>) => work(prisma),
  };
  const service = createWorkbenchNotificationService({
    prisma,
    workflow: { publishWorkbench: async (_client, input) => {
      notifications.push(input);
      return { accepted: true, created: true };
    } },
  });

  const result = await service.scanReminders({
    now: new Date('2026-08-21T00:30:00.000Z'), signal: new AbortController().signal,
  });

  assert.equal(result.notified, 1);
  assert.deepEqual(notifications.map((item) => item.recipientId), [row.employeeId]);
  assert.ok(row.remindedAt);
});

test('publish or marker failure leaves reminders retryable without duplicate notifications', async () => {
  const row: any = { ...task({ id: 'retry-task', dueAt: '2026-08-21T01:00:00.000Z' }), remindedAt: null };
  const notifications: any[] = [];
  const keys = new Set<string>();
  let failMarker = true;
  const workflow = {
    async publishWorkbench(_client: unknown, input: any) {
      const created = !keys.has(input.dedupeKey);
      keys.add(input.dedupeKey);
      if (created) notifications.push(input);
      return { accepted: true, created };
    },
  };
  const prisma: any = {
    employeeTask: {
      findMany: async () => [row],
      findUnique: async () => row,
      updateMany: async ({ data }: any) => {
        if (failMarker) {
          failMarker = false;
          throw new Error('database marker unavailable');
        }
        Object.assign(row, data);
        return { count: 1 };
      },
    },
    department: {
      findMany: async () => [],
      findUnique: async () => ({ id: 'dept-sales', managerId: null, isActive: true }),
    },
    user: {
      findMany: async () => [{ id: 'employee-1', name: '员工甲', isActive: true, employmentStatus: 'active' }],
      findUnique: async () => ({ id: 'employee-1', name: '员工甲', isActive: true, employmentStatus: 'active' }),
    },
    $transaction: async (work: (tx: any) => Promise<unknown>) => work(prisma),
  };
  const service = createWorkbenchNotificationService({ prisma, workflow: workflow as any });
  const input = { now: new Date('2026-08-21T00:30:00.000Z'), signal: new AbortController().signal };

  const failed = await service.scanReminders(input);
  assert.equal(failed.failed, 1);
  assert.equal(row.remindedAt, null);
  const retried = await service.scanReminders(input);
  assert.equal(retried.notified, 1);
  assert.equal(notifications.length, 1);
  assert.equal(row.remindedAt.toISOString(), input.now.toISOString());
});

test('a reassignment race after publish cannot mark the new reminder identity as notified', async () => {
  const current: any = {
    ...task({ id: 'raced-task', dueAt: '2026-08-21T01:00:00.000Z' }),
    remindedAt: null, lastOverdueNotifiedAt: null, sourceVersion: 'v1',
  };
  const candidate = structuredClone(current);
  let publishes = 0;
  const prisma: any = {
    employeeTask: {
      findMany: async () => [candidate],
      findUnique: async () => current,
      updateMany: async ({ where, data }: any) => {
        if (where.employeeId !== current.employeeId
          || String(where.sourceVersion || '') !== String(current.sourceVersion || '')) return { count: 0 };
        Object.assign(current, data);
        return { count: 1 };
      },
    },
    department: {
      findMany: async () => [],
      findUnique: async () => ({ id: 'dept-sales', managerId: null, isActive: true }),
    },
    user: {
      findMany: async () => [{
        id: 'employee-1', name: '员工甲', isActive: true, employmentStatus: 'active',
      }],
      findUnique: async () => ({
        id: 'employee-1', name: '员工甲', isActive: true, employmentStatus: 'active',
      }),
    },
    $transaction: async (work: (tx: any) => Promise<unknown>) => work(prisma),
  };
  const service = createWorkbenchNotificationService({
    prisma,
    workflow: {
      publishWorkbench: async () => {
        publishes += 1;
        current.employeeId = 'employee-2';
        current.sourceVersion = 'v2';
        return { accepted: true, created: true };
      },
    },
  });

  const result = await service.scanReminders({
    now: new Date('2026-08-21T00:30:00.000Z'), signal: new AbortController().signal,
  });

  assert.equal(publishes, 1);
  assert.equal(result.notified, 0);
  assert.equal(result.skipped, 1);
  assert.equal(current.remindedAt, null, '新负责人/新来源版本必须保持可重试');
});

test('committed command events resolve only active exact-scope recipients', async () => {
  const notifications: any[] = [];
  const current = task({ status: 'COMPLETED' });
  const outboxes: any[] = [
    { ...activity({ id: 'complete-activity', action: 'COMPLETE', toStatus: 'COMPLETED' }), notificationState: 'PENDING' },
    { ...activity({
      id: 'reassign-activity', action: 'REASSIGN',
      metadata: { previousEmployeeId: 'inactive-user', employeeId: 'employee-1' },
    }), notificationState: 'PENDING' },
  ];
  const workflow = {
    async publishWorkbench(_client: unknown, input: any) {
      notifications.push(input);
      return { accepted: true, created: true };
    },
  };
  const prisma: any = {
    taskActivity: {
      findUnique: async ({ where }: any) => outboxes.find((row) => row.id === where.id) || null,
      updateMany: async ({ where, data }: any) => {
        const row = outboxes.find((item) => item.id === where.id && item.notificationState === where.notificationState);
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
    employeeTask: { findUnique: async () => current },
    department: {
      findUnique: async ({ where }: any) => where.id === 'dept-sales'
        ? { id: 'dept-sales', managerId: 'manager-exact', isActive: true }
        : null,
    },
    user: {
      findUnique: async ({ where }: any) => ({
        id: where.id,
        name: where.id === 'manager-exact' ? '直属部门主管' : '员工',
        isActive: where.id !== 'inactive-user',
        employmentStatus: where.id === 'inactive-user' ? 'left' : 'active',
      }),
      findMany: async ({ where }: any) => (where.id.in as string[]).map((id) => ({
        id, name: id, isActive: id !== 'inactive-user', employmentStatus: id === 'inactive-user' ? 'left' : 'active',
      })),
    },
    $queryRawUnsafe: async () => [],
    $transaction: async (work: (tx: any) => Promise<unknown>) => work(prisma),
  };
  const service = createWorkbenchNotificationService({ prisma, workflow: workflow as any });

  await service.handleCommandEvent({
    action: 'COMPLETE', task: current, actor: {} as any,
    activity: outboxes[0],
    recipientIds: ['employee-1'],
  });
  await service.handleCommandEvent({
    action: 'REASSIGN', task: current, actor: {} as any,
    activity: outboxes[1],
    recipientIds: ['inactive-user', 'employee-1'],
  });

  assert.deepEqual(notifications.map((item) => [item.eventType, item.recipientId]), [
    ['WORKBENCH_TASK_COMPLETED', 'manager-exact'],
    ['WORKBENCH_TASK_REASSIGNED', 'employee-1'],
  ]);
});

test('lifecycle outbox locks activity and task then department then sorted unique recipients', async () => {
  const current: any = task({ employeeId: 'user-b', employeeName: '当前负责人' });
  const outbox: any = {
    ...activity({
      id: 'ordered-reassign', action: 'REASSIGN',
      metadata: { previousEmployeeId: 'user-z', employeeId: 'user-a' },
    }),
    notificationState: 'PENDING',
  };
  const locks: string[] = [];
  const tx: any = {
    taskActivity: {
      findUnique: async () => outbox,
      updateMany: async ({ data }: any) => { Object.assign(outbox, data); return { count: 1 }; },
    },
    employeeTask: { findUnique: async () => current },
    user: { findUnique: async ({ where }: any) => ({
      id: where.id, name: where.id, isActive: true, employmentStatus: 'active',
    }) },
    $queryRawUnsafe: async (sql: string, id: string) => {
      if (sql.includes('FOR UPDATE')) {
        const table = sql.match(/FROM `([^`]+)`/)?.[1];
        locks.push(`${table}:${id}`);
      }
      return [];
    },
  };
  const service = createWorkbenchNotificationService({
    prisma: { $transaction: async (work: (client: any) => Promise<unknown>) => work(tx) },
    workflow: { publishWorkbench: async () => ({ accepted: true, created: true }) },
  });

  await service.handleCommandEvent({
    action: 'REASSIGN', task: current, activity: outbox, actor: {} as any,
    recipientIds: ['user-z', 'user-a', 'user-b'],
  });

  assert.deepEqual(locks, [
    'task_activities:ordered-reassign',
    'employee_tasks:task-1',
    'departments:dept-sales',
    'users:user-a',
    'users:user-b',
    'users:user-z',
  ]);
});

test('manager-as-employee lifecycle and scheduled transactions complete concurrently without lock inversion', async () => {
  const lifecycleTask: any = task({
    id: 'lifecycle-task', employeeId: 'lifecycle-owner', status: 'COMPLETED',
  });
  const scheduledTask: any = {
    ...task({
      id: 'scheduled-task', employeeId: 'shared-manager-employee', employeeName: '员工兼主管',
      status: 'PENDING', dueAt: '2026-08-20T23:00:00.000Z',
    }),
    remindedAt: null, lastOverdueNotifiedAt: null,
  };
  const outbox: any = {
    ...activity({
      id: 'concurrent-complete', taskId: lifecycleTask.id,
      action: 'COMPLETE', toStatus: 'COMPLETED',
    }),
    notificationState: 'PENDING',
  };
  const holder = new Map<string, number>();
  const waiters = new Map<string, Array<() => void>>();
  const owned = new Map<number, Set<string>>();
  const acquire = async (owner: number, key: string): Promise<void> => {
    while (holder.has(key) && holder.get(key) !== owner) {
      await new Promise<void>((resolve) => {
        const queue = waiters.get(key) || [];
        queue.push(resolve);
        waiters.set(key, queue);
      });
    }
    holder.set(key, owner);
    const keys = owned.get(owner) || new Set<string>();
    keys.add(key);
    owned.set(owner, keys);
    await new Promise((resolve) => setImmediate(resolve));
  };
  const release = (owner: number) => {
    for (const key of owned.get(owner) || []) {
      if (holder.get(key) === owner) holder.delete(key);
      const next = waiters.get(key)?.shift();
      if (next) next();
    }
    owned.delete(owner);
  };
  const employeeTasks = [lifecycleTask, scheduledTask];
  let transactionId = 0;
  const models: any = {
    employeeTask: {
      findMany: async () => [scheduledTask],
      findUnique: async ({ where }: any) => employeeTasks.find((row) => row.id === where.id) || null,
      updateMany: async ({ where, data }: any) => {
        const row = employeeTasks.find((item) => item.id === where.id);
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
    taskActivity: {
      findUnique: async () => outbox,
      updateMany: async ({ data }: any) => { Object.assign(outbox, data); return { count: 1 }; },
    },
    department: { findUnique: async () => ({
      id: 'dept-sales', managerId: 'shared-manager-employee', isActive: true,
    }) },
    user: { findUnique: async ({ where }: any) => ({
      id: where.id, name: where.id, isActive: true, employmentStatus: 'active',
    }) },
  };
  const prisma: any = {
    ...models,
    $transaction: async (work: (tx: any) => Promise<unknown>) => {
      const owner = ++transactionId;
      const tx = {
        ...models,
        $queryRawUnsafe: async (sql: string, id: string) => {
          const table = sql.match(/FROM `([^`]+)`/)?.[1];
          if (table && sql.includes('FOR UPDATE')) await acquire(owner, `${table}:${id}`);
          return [];
        },
      };
      try {
        return await work(tx);
      } finally {
        release(owner);
      }
    },
  };
  const service = createWorkbenchNotificationService({
    prisma,
    workflow: { publishWorkbench: async () => ({ accepted: true, created: true }) },
  });
  const operations = Promise.all([
    service.handleCommandEvent({
      action: 'COMPLETE', task: lifecycleTask, activity: outbox,
      actor: {} as any, recipientIds: ['shared-manager-employee'],
    }),
    service.scanReminders({
      now: new Date('2026-08-21T00:30:00.000Z'), signal: new AbortController().signal,
    }),
  ]);
  const timeout = new Promise<never>((_resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('notification lock-order deadlock')), 500);
    timer.unref?.();
  });

  await Promise.race([operations, timeout]);

  assert.equal(outbox.notificationState, 'PUBLISHED');
  assert.ok(scheduledTask.lastOverdueNotifiedAt);
});

test('committed COMPLETE re-resolves the current department manager inside its outbox transaction', async () => {
  const current: any = task({ status: 'COMPLETED' });
  const outbox: any = {
    ...activity({ id: 'complete-manager-replaced', action: 'COMPLETE', toStatus: 'COMPLETED' }),
    notificationState: 'PENDING', task: current,
  };
  let tx: any;
  let published: any;
  const prisma: any = {
    $transaction: async (work: (client: any) => Promise<unknown>) => {
      tx = {
        taskActivity: {
          findUnique: async () => outbox,
          updateMany: async ({ where, data }: any) => {
            if (where.id !== outbox.id || where.notificationState !== outbox.notificationState) return { count: 0 };
            Object.assign(outbox, data);
            return { count: 1 };
          },
        },
        employeeTask: { findUnique: async () => current },
        department: { findUnique: async () => ({
          id: current.departmentIdSnapshot, managerId: 'manager-new', isActive: true,
        }) },
        user: { findUnique: async ({ where }: any) => ({
          id: where.id, name: '新主管', isActive: true, employmentStatus: 'active',
        }) },
        $queryRawUnsafe: async () => [],
      };
      return work(tx);
    },
  };
  const service = createWorkbenchNotificationService({
    prisma,
    workflow: { publishWorkbench: async (client, input) => {
      assert.equal(client, tx);
      assert.equal(outbox.notificationState, 'PENDING');
      published = input;
      return { accepted: true, created: true };
    } },
  });

  await service.handleCommandEvent({
    action: 'COMPLETE', task: { ...current }, activity: { ...outbox },
    actor: {} as any, recipientIds: [current.employeeId],
  });

  assert.equal(published.recipientId, 'manager-new');
  assert.equal(outbox.notificationState, 'PUBLISHED');
});

test('committed employee lifecycle activity terminally skips after employee offboarding', async () => {
  const current: any = task({ status: 'RETURNED' });
  const outbox: any = {
    ...activity({ id: 'return-after-offboarding', action: 'RETURN', toStatus: 'RETURNED' }),
    notificationState: 'PENDING', task: current,
  };
  let publishes = 0;
  const tx: any = {
    taskActivity: {
      findUnique: async () => outbox,
      updateMany: async ({ where, data }: any) => {
        if (where.id !== outbox.id || where.notificationState !== outbox.notificationState) return { count: 0 };
        Object.assign(outbox, data);
        return { count: 1 };
      },
    },
    employeeTask: { findUnique: async () => current },
    user: { findUnique: async () => ({
      id: current.employeeId, name: current.employeeName, isActive: false, employmentStatus: 'left',
    }) },
    $queryRawUnsafe: async () => [],
  };
  const service = createWorkbenchNotificationService({
    prisma: { $transaction: async (work: (client: any) => Promise<unknown>) => work(tx) },
    workflow: { publishWorkbench: async () => {
      publishes += 1;
      return { accepted: true, created: true };
    } },
  });

  await service.handleCommandEvent({
    action: 'RETURN', task: { ...current }, activity: { ...outbox },
    actor: {} as any, recipientIds: [current.employeeId],
  });

  assert.equal(publishes, 0);
  assert.equal(outbox.notificationState, 'SKIPPED');
  assert.equal(outbox.notificationSkipReason, 'RECIPIENT_UNAVAILABLE');
});

test('manual REMIND publishes, fences its marker, and completes its outbox activity atomically', async () => {
  const current: any = {
    ...task({ status: 'PENDING', sourceVersion: 'v1', dueAt: null }), remindedAt: null,
  };
  const reminderActivity: any = {
    ...activity({
      id: 'manual-remind-1', action: 'REMIND', fromStatus: 'PENDING', toStatus: 'PENDING',
      metadata: {
        expectedEmployeeId: current.employeeId,
        expectedDepartmentIdSnapshot: current.departmentIdSnapshot,
        expectedDueAt: current.dueAt,
        expectedWorkDate: current.workDate,
        expectedSourceVersion: current.sourceVersion,
      },
    }),
    notificationState: 'PENDING',
  };
  let transactionClient: any;
  let published: any;
  const prisma: any = {
    $transaction: async (work: (tx: any) => Promise<unknown>) => {
      transactionClient = {
        employeeTask: {
          findUnique: async () => current,
          updateMany: async ({ data }: any) => { Object.assign(current, data); return { count: 1 }; },
        },
        taskActivity: {
          findUnique: async () => reminderActivity,
          updateMany: async ({ data }: any) => { Object.assign(reminderActivity, data); return { count: 1 }; },
        },
        user: { findUnique: async () => ({
          id: current.employeeId, name: current.employeeName, isActive: true, employmentStatus: 'active',
        }) },
        $queryRawUnsafe: async () => [],
      };
      return work(transactionClient);
    },
  };
  const service = createWorkbenchNotificationService({
    prisma,
    workflow: {
      publishWorkbench: async (client, input) => {
        assert.equal(client, transactionClient);
        assert.equal(current.remindedAt, null);
        assert.equal(reminderActivity.notificationState, 'PENDING');
        published = input;
        return { accepted: true, created: true };
      },
    },
  });

  const outcome = await service.handleCommandEvent({
    action: 'REMIND', task: current, activity: reminderActivity, actor: {} as any,
    recipientIds: [current.employeeId],
  });

  assert.equal(current.remindedAt.toISOString(), reminderActivity.createdAt);
  assert.equal(reminderActivity.notificationState, 'PUBLISHED');
  assert.equal(outcome.task?.remindedAt, reminderActivity.createdAt);
  assert.match(published.dedupeKey, /manual-remind-1/);
});

test('manual REMIND follows activity task department user lock order', async () => {
  const harness = createManualReminderHarness();
  const service = createWorkbenchNotificationService({ prisma: harness.prisma, workflow: harness.workflow });

  await service.handleCommandEvent({
    action: 'REMIND', task: harness.current, activity: harness.row,
    actor: {} as any, recipientIds: [harness.current.employeeId],
  });

  assert.deepEqual(harness.locks, [
    'task_activities:manual-remind-replay',
    'employee_tasks:task-1',
    'departments:dept-sales',
    'users:employee-1',
  ]);
});

test('manual REMIND publication failure rolls back and is replayed from the durable activity', async () => {
  const harness = createManualReminderHarness();
  harness.control.failPublish = true;
  const service = createWorkbenchNotificationService({ prisma: harness.prisma, workflow: harness.workflow });
  const event = {
    action: 'REMIND' as const, task: harness.current, activity: harness.row,
    actor: {} as any, recipientIds: [harness.current.employeeId],
  };

  await assert.rejects(() => service.handleCommandEvent(event), /notification unavailable/);
  assert.equal(harness.row.notificationState, 'PENDING');
  assert.equal(harness.current.remindedAt, null);
  harness.control.failPublish = false;

  const replayed = await service.scanReminders({
    now: new Date('2026-08-21T02:00:00.000Z'), signal: new AbortController().signal,
  });

  assert.equal(replayed.notified, 1);
  assert.equal(harness.notifications.length, 1);
  assert.equal(harness.row.notificationState, 'PUBLISHED');
  assert.equal(harness.current.remindedAt.toISOString(), '2026-08-21T01:00:00.000Z');
});

test('manual REMIND marker failure rolls back the notification and remains replayable', async () => {
  const harness = createManualReminderHarness();
  harness.control.failMarker = true;
  const service = createWorkbenchNotificationService({ prisma: harness.prisma, workflow: harness.workflow });

  const first = await service.scanReminders({
    now: new Date('2026-08-21T02:00:00.000Z'), signal: new AbortController().signal,
  });
  assert.equal(first.failed, 1);
  assert.equal(harness.notifications.length, 0, 'notification must roll back with the failed marker');
  assert.equal(harness.current.remindedAt, null);
  assert.equal(harness.row.notificationState, 'PENDING');

  const retried = await service.scanReminders({
    now: new Date('2026-08-21T02:15:00.000Z'), signal: new AbortController().signal,
  });
  assert.equal(retried.notified, 1);
  assert.equal(harness.notifications.length, 1);
  assert.equal(harness.row.notificationState, 'PUBLISHED');
});

test('manual REMIND crash before outbox completion leaves no partial notification or marker', async () => {
  const harness = createManualReminderHarness();
  harness.control.failActivityMark = true;
  const service = createWorkbenchNotificationService({ prisma: harness.prisma, workflow: harness.workflow });

  const failed = await service.scanReminders({
    now: new Date('2026-08-21T02:00:00.000Z'), signal: new AbortController().signal,
  });

  assert.equal(failed.failed, 1);
  assert.equal(harness.notifications.length, 0);
  assert.equal(harness.current.remindedAt, null);
  assert.equal(harness.row.notificationState, 'PENDING');
});

test('stale manual REMIND activities terminally skip after reassignment or deadline changes', async () => {
  for (const mutate of [
    (current: any) => { current.employeeId = 'employee-2'; },
    (current: any) => { current.dueAt = '2026-08-22T02:00:00.000Z'; },
  ]) {
    const harness = createManualReminderHarness();
    mutate(harness.current);
    const service = createWorkbenchNotificationService({ prisma: harness.prisma, workflow: harness.workflow });

    const replayed = await service.scanReminders({
      now: new Date('2026-08-21T02:00:00.000Z'), signal: new AbortController().signal,
    });

    assert.equal(replayed.failed, 0);
    assert.equal(harness.notifications.length, 0);
    assert.equal(harness.current.remindedAt, null);
    assert.equal(harness.row.notificationState, 'SKIPPED');
    assert.equal(harness.row.notificationSkipReason, 'REMINDER_IDENTITY_CHANGED');
  }
});

test('a failed post-commit lifecycle publish is retried from durable task activity', async () => {
  const currentTask = task({ status: 'RETURNED' });
  const committedActivity = activity();
  const outboxRow: any = {
    ...committedActivity, sequence: BigInt(committedActivity.sequence || '100'),
    createdAt: new Date(committedActivity.createdAt), notificationState: 'PENDING', task: currentTask,
  };
  const notifications: any[] = [];
  const keys = new Set<string>();
  let unavailable = true;
  const workflow = {
    async publishWorkbench(_client: unknown, input: any) {
      if (unavailable) throw new Error('notification database unavailable');
      const created = !keys.has(input.dedupeKey);
      keys.add(input.dedupeKey);
      if (created) notifications.push(input);
      return { accepted: true, created };
    },
  };
  const prisma: any = {
    employeeTask: { findMany: async () => [], findUnique: async () => currentTask },
    taskActivity: {
      findMany: async ({ where }: any) => outboxRow.notificationState === 'PENDING'
        && (!where.sequence?.gt || outboxRow.sequence > where.sequence.gt) ? [outboxRow] : [],
      updateMany: async ({ where, data }: any) => {
        if (outboxRow.id !== where.id || outboxRow.notificationState !== where.notificationState) return { count: 0 };
        Object.assign(outboxRow, data);
        return { count: 1 };
      },
      findUnique: async () => outboxRow,
    },
    department: { findMany: async () => [], findUnique: async () => null },
    user: {
      findMany: async () => [],
      findUnique: async () => ({ id: 'employee-1', name: '员工甲', isActive: true, employmentStatus: 'active' }),
    },
    $transaction: async (work: (tx: any) => Promise<unknown>) => work(prisma),
  };
  const service = createWorkbenchNotificationService({ prisma, workflow: workflow as any });
  const event = {
    action: 'RETURN' as const, task: currentTask, activity: committedActivity,
    actor: {} as any, recipientIds: ['employee-1'],
  };

  await assert.rejects(() => service.handleCommandEvent(event), /unavailable/);
  unavailable = false;
  const retried = await service.scanReminders({
    now: new Date('2026-08-21T02:00:00.000Z'), signal: new AbortController().signal,
  });
  const repeated = await service.scanReminders({
    now: new Date('2026-08-21T02:15:00.000Z'), signal: new AbortController().signal,
  });

  assert.equal(retried.notified, 1);
  assert.equal(repeated.notified, 0);
  assert.equal(notifications.length, 1);
  assert.match(notifications[0].dedupeKey, /activity-return-1/);
});

test('scheduler failure notification requires three consecutive failures and is daily deduped', async () => {
  const runs: any[] = [
    { id: 'run-3', jobType: 'REMINDER_SCAN', status: 'FAILED', leaseEpoch: 3 },
    { id: 'run-2', jobType: 'REMINDER_SCAN', status: 'FAILED', leaseEpoch: 2 },
  ];
  const notifications: any[] = [];
  const keys = new Set<string>();
  const workflow = {
    async publishWorkbench(_client: unknown, input: any) {
      const created = !keys.has(input.dedupeKey);
      keys.add(input.dedupeKey);
      if (created) notifications.push(input);
      return { accepted: true, created };
    },
  };
  const prisma: any = {
    workbenchSchedulerRun: { findMany: async () => runs.slice(0, 3) },
    role: { findMany: async () => [{ id: 'role-admin', name: '超级管理员', code: 'super_admin', permissions: [], isActive: true }] },
    user: { findMany: async () => [{ id: 'admin-1', name: '系统管理员', role: '超级管理员', roleId: 'role-admin', isActive: true, employmentStatus: 'active' }] },
  };
  const service = createWorkbenchNotificationService({ prisma, workflow: workflow as any });
  const input = { jobType: 'REMINDER_SCAN' as const, runId: 'run-3', at: new Date('2026-08-21T02:00:00.000Z') };

  await service.schedulerFailed(input);
  assert.equal(notifications.length, 0);
  runs.push({ id: 'run-1', jobType: 'REMINDER_SCAN', status: 'FAILED', leaseEpoch: 1 });
  await service.schedulerFailed(input);
  await service.schedulerFailed(input);

  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].recipientId, 'admin-1');
  assert.equal(notifications[0].eventType, 'WORKBENCH_SCHEDULER_FAILED');
  assert.match(notifications[0].dedupeKey, /REMINDER_SCAN:2026-08-21:admin-1/);
  assert.equal(JSON.stringify(notifications[0]).includes('run-3'), false, '调度通知不得暴露运行明细');
});

test('effective workbench rule disables scans and configures due-soon and scheduler thresholds', async () => {
  let taskReads = 0;
  const disabled = createWorkbenchNotificationService({
    prisma: { employeeTask: { findMany: async () => { taskReads += 1; return []; } } },
    workflow: {
      workbenchRule: async () => ({
        enabled: false, channels: [], config: { dueSoonMinutes: 15, schedulerFailureThreshold: 2 },
      }),
      publishWorkbench: async () => ({ accepted: true, created: true }),
    },
  });
  assert.deepEqual(await disabled.scanReminders({ now: new Date(), signal: new AbortController().signal }), {
    scanned: 0, notified: 0, skipped: 0, failed: 0, errors: [],
  });
  assert.equal(taskReads, 0);

  const sent: any[] = [];
  const configured = createWorkbenchNotificationService({
    prisma: {
      workbenchSchedulerRun: { findMany: async ({ take }: any) => {
        assert.equal(take, 2);
        return [
          { id: 'configured-run', status: 'FAILED', leaseEpoch: 2 },
          { id: 'prior-run', status: 'FAILED', leaseEpoch: 1 },
        ];
      } },
      role: { findMany: async () => [{ id: 'admin-role', code: 'super_admin', isActive: true }] },
      user: { findMany: async () => [{
        id: 'admin-1', name: '管理员', role: '超级管理员', roleId: 'admin-role',
        isActive: true, employmentStatus: 'active',
      }] },
    },
    workflow: {
      workbenchRule: async () => ({
        enabled: true, channels: [], config: { dueSoonMinutes: 15, schedulerFailureThreshold: 2 },
      }),
      publishWorkbench: async (_client, input) => { sent.push(input); return { accepted: true, created: true }; },
    },
  });
  await configured.schedulerFailed({
    jobType: 'REMINDER_SCAN', runId: 'configured-run', at: new Date('2026-08-21T02:00:00.000Z'),
  });
  assert.equal(sent.length, 1);
});

test('scheduled reminder keyset pagination reaches a valid task after more than 1000 unprocessable rows', async () => {
  const dueAt = '2026-08-21T01:00:00.000Z';
  const rows = Array.from({ length: 1_002 }, (_, index) => ({
    ...task({
      id: `scheduled-${String(index + 1).padStart(4, '0')}`,
      employeeId: index === 1_001 ? 'employee-valid' : `employee-inactive-${index + 1}`,
      dueAt,
    }),
    remindedAt: null, lastOverdueNotifiedAt: null,
  }));
  let pageReads = 0;
  const notifications: any[] = [];
  const prisma: any = {
    employeeTask: {
      findMany: async ({ where, take, orderBy }: any) => {
        pageReads += 1;
        assert.deepEqual(orderBy, [{ dueAt: 'asc' }, { id: 'asc' }]);
        const cursorClause = (where.AND || []).flatMap((clause: any) => clause.OR || [])
          .find((clause: any) => clause.id?.gt);
        const afterId = cursorClause?.id?.gt || '';
        return rows.filter((row) => row.id > afterId).slice(0, take);
      },
      findUnique: async ({ where }: any) => rows.find((row) => row.id === where.id) || null,
      updateMany: async ({ where, data }: any) => {
        const row = rows.find((item) => item.id === where.id);
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
    user: { findUnique: async ({ where }: any) => ({
      id: where.id, name: where.id,
      isActive: where.id === 'employee-valid',
      employmentStatus: where.id === 'employee-valid' ? 'active' : 'left',
    }) },
    $queryRawUnsafe: async () => [],
    $transaction: async (work: (tx: any) => Promise<unknown>) => work(prisma),
  };
  const service = createWorkbenchNotificationService({
    prisma,
    workflow: { publishWorkbench: async (_client, input) => {
      notifications.push(input);
      return { accepted: true, created: true };
    } },
  });

  const result = await service.scanReminders({
    now: new Date('2026-08-21T00:30:00.000Z'), signal: new AbortController().signal,
  });

  assert.equal(result.scanned, 1_002);
  assert.equal(result.skipped, 1_001);
  assert.equal(result.notified, 1);
  assert.equal(notifications[0]?.recipientId, 'employee-valid');
  assert.ok(pageReads >= 2);
});

test('scheduled reminder pagination honors abort before crossing the next page boundary', async () => {
  const controller = new AbortController();
  const stop = new Error('stop at reminder page boundary');
  let pageReads = 0;
  let recipientReads = 0;
  let firstPage: any[] = [];
  const prisma: any = {
    employeeTask: {
      findMany: async ({ take }: any) => {
        pageReads += 1;
        if (pageReads > 1) return [];
        firstPage = Array.from({ length: take }, (_, index) => ({
          ...task({
            id: `abort-page-${String(index + 1).padStart(4, '0')}`,
            employeeId: `inactive-${index + 1}`,
            dueAt: '2026-08-21T01:00:00.000Z',
          }),
          remindedAt: null, lastOverdueNotifiedAt: null,
        }));
        return firstPage;
      },
      findUnique: async ({ where }: any) => firstPage.find((row) => row.id === where.id) || null,
    },
    user: { findUnique: async ({ where }: any) => {
      recipientReads += 1;
      if (recipientReads === firstPage.length) controller.abort(stop);
      return { id: where.id, name: where.id, isActive: false, employmentStatus: 'left' };
    } },
    $queryRawUnsafe: async () => [],
    $transaction: async (work: (tx: any) => Promise<unknown>) => work(prisma),
  };
  const service = createWorkbenchNotificationService({
    prisma,
    workflow: { publishWorkbench: async () => ({ accepted: true, created: true }) },
  });

  await assert.rejects(
    () => service.scanReminders({ now: new Date('2026-08-21T00:30:00.000Z'), signal: controller.signal }),
    /stop at reminder page boundary/,
  );
  assert.equal(pageReads, 1, 'abort must be observed before reading the next keyset page');
});

test('aborted reminder scan resumes after its last durable completed page', async () => {
  const dueAt = '2026-08-21T01:00:00.000Z';
  const rows = Array.from({ length: 1_002 }, (_, index) => ({
    ...task({
      id: `resume-${String(index + 1).padStart(4, '0')}`,
      employeeId: index === 1_001 ? 'employee-valid' : `inactive-${index + 1}`,
      dueAt,
    }),
    remindedAt: null, lastOverdueNotifiedAt: null,
  }));
  const controller = new AbortController();
  const stop = new Error('Task 6 hard abort');
  let firstRun = true;
  let recipientReads = 0;
  let durableCursor: { dueAt: string; id: string } | null | undefined;
  const checkpoints: Array<{ dueAt: string; id: string } | null> = [];
  const prisma: any = {
    employeeTask: {
      findMany: async ({ where, take }: any) => {
        const cursorClause = (where.AND || []).flatMap((clause: any) => clause.OR || [])
          .find((clause: any) => clause.id?.gt);
        const afterId = cursorClause?.id?.gt || '';
        return rows.filter((row) => row.id > afterId && row.remindedAt == null).slice(0, take);
      },
      findUnique: async ({ where }: any) => rows.find((row) => row.id === where.id) || null,
      updateMany: async ({ where, data }: any) => {
        const row = rows.find((item) => item.id === where.id);
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
    user: { findUnique: async ({ where }: any) => {
      recipientReads += 1;
      if (firstRun && recipientReads === 1_000) controller.abort(stop);
      const active = where.id === 'employee-valid';
      return { id: where.id, name: where.id, isActive: active, employmentStatus: active ? 'active' : 'left' };
    } },
    $queryRawUnsafe: async () => [],
  };
  prisma.$transaction = async (work: (tx: any) => Promise<unknown>) => work(prisma);
  const service = createWorkbenchNotificationService({
    prisma,
    workflow: { publishWorkbench: async () => ({ accepted: true, created: true }) },
  });
  const checkpoint = async (cursor: { dueAt: string; id: string } | null) => {
    durableCursor = cursor;
    checkpoints.push(cursor);
  };

  await assert.rejects(
    () => service.scanReminders({
      now: new Date('2026-08-21T00:30:00.000Z'), signal: controller.signal,
      cursor: durableCursor, checkpoint,
    } as any),
    /Task 6 hard abort/,
  );
  assert.deepEqual(durableCursor, { dueAt, id: 'resume-1000' });
  assert.deepEqual(checkpoints.map((cursor) => cursor?.id), ['resume-0500', 'resume-1000']);

  firstRun = false;
  const resumed = await service.scanReminders({
    now: new Date('2026-08-21T00:30:00.000Z'), signal: new AbortController().signal,
    cursor: durableCursor, checkpoint,
  } as any);

  assert.equal(resumed.scanned, 2);
  assert.equal(resumed.notified, 1);
  assert.equal(durableCursor, null, 'reaching the end must wrap so an earlier future task can be scanned');
});

test('an exhausted reminder cursor wraps and a later earlier task is scanned', async () => {
  const rows: any[] = [];
  let durableCursor: { dueAt: string; id: string } | null | undefined = {
    dueAt: '2026-08-21T02:00:00.000Z', id: 'last-old-task',
  };
  const notifications: string[] = [];
  const prisma: any = {
    employeeTask: {
      findMany: async ({ where, take }: any) => {
        const cursorPair = (where.AND || []).flatMap((clause: any) => clause.OR || []);
        const afterDueAt = cursorPair.find((clause: any) => clause.dueAt?.gt)?.dueAt?.gt;
        const afterId = cursorPair.find((clause: any) => clause.id?.gt)?.id?.gt || '';
        return rows.filter((row) => !afterDueAt
          || new Date(row.dueAt) > new Date(afterDueAt)
          || (new Date(row.dueAt).getTime() === new Date(afterDueAt).getTime() && row.id > afterId))
          .slice(0, take);
      },
      findUnique: async ({ where }: any) => rows.find((row) => row.id === where.id) || null,
      updateMany: async ({ data }: any) => { Object.assign(rows[0], data); return { count: 1 }; },
    },
    user: { findUnique: async ({ where }: any) => ({
      id: where.id, name: where.id, isActive: true, employmentStatus: 'active',
    }) },
    $queryRawUnsafe: async () => [],
  };
  prisma.$transaction = async (work: (tx: any) => Promise<unknown>) => work(prisma);
  const service = createWorkbenchNotificationService({
    prisma,
    workflow: { publishWorkbench: async (_client, input) => {
      notifications.push(input.businessId);
      return { accepted: true, created: true };
    } },
  });
  const checkpoint = async (cursor: { dueAt: string; id: string } | null) => { durableCursor = cursor; };

  const exhausted = await service.scanReminders({
    now: new Date('2026-08-21T00:30:00.000Z'), signal: new AbortController().signal,
    cursor: durableCursor, checkpoint,
  } as any);
  assert.equal(exhausted.scanned, 0);
  assert.equal(durableCursor, null);

  rows.push({
    ...task({
      id: 'new-earlier-task', employeeId: 'employee-new', dueAt: '2026-08-21T01:00:00.000Z',
      status: 'PENDING',
    }),
    remindedAt: null, lastOverdueNotifiedAt: null,
  });
  const wrapped = await service.scanReminders({
    now: new Date('2026-08-21T00:30:00.000Z'), signal: new AbortController().signal,
    cursor: durableCursor, checkpoint,
  } as any);

  assert.equal(wrapped.notified, 1);
  assert.deepEqual(notifications, ['new-earlier-task']);
});

test('lifecycle outbox drains independently before an aborted reminder page', async () => {
  const controller = new AbortController();
  const stop = new Error('hard reminder abort');
  const lifecycleTask = task({ id: 'lifecycle-first', employeeId: 'lifecycle-user' });
  const scheduledTask: any = {
    ...task({
      id: 'scheduled-after-lifecycle', employeeId: 'scheduled-user',
      dueAt: '2026-08-21T01:00:00.000Z', status: 'PENDING',
    }),
    remindedAt: null, lastOverdueNotifiedAt: null,
  };
  const outbox: any = {
    ...activity({ id: 'lifecycle-first-activity', taskId: lifecycleTask.id, action: 'CREATE' }),
    sequence: 1n, notificationState: 'PENDING', createdAt: new Date('2026-08-21T00:00:00.000Z'),
    task: lifecycleTask,
  };
  const events: string[] = [];
  const prisma: any = {
    employeeTask: {
      findMany: async () => [scheduledTask],
      findUnique: async ({ where }: any) => where.id === lifecycleTask.id ? lifecycleTask : scheduledTask,
      updateMany: async () => ({ count: 1 }),
    },
    taskActivity: {
      findMany: async () => outbox.notificationState === 'PENDING' ? [outbox] : [],
      findUnique: async () => outbox,
      updateMany: async ({ data }: any) => { Object.assign(outbox, data); return { count: 1 }; },
    },
    user: { findUnique: async ({ where }: any) => {
      if (where.id === scheduledTask.employeeId) controller.abort(stop);
      return { id: where.id, name: where.id, isActive: true, employmentStatus: 'active' };
    } },
    $queryRawUnsafe: async () => [],
  };
  prisma.$transaction = async (work: (tx: any) => Promise<unknown>) => work(prisma);
  const service = createWorkbenchNotificationService({
    prisma,
    workflow: { publishWorkbench: async (_client, input) => {
      events.push(input.businessId);
      return { accepted: true, created: true };
    } },
  });

  await assert.rejects(
    () => service.scanReminders({
      now: new Date('2026-08-21T00:30:00.000Z'), signal: controller.signal,
    }),
    /hard reminder abort/,
  );
  assert.equal(outbox.notificationState, 'PUBLISHED');
  assert.equal(events[0], lifecycleTask.id);
});

test('durable lifecycle drain keyset-paginates beyond 1000 activities without starvation', async () => {
  const rows = Array.from({ length: 1_005 }, (_, index) => ({
    ...activity({
      id: `activity-${index + 1}`, sequence: String(index + 1), taskId: `task-${index + 1}`,
      action: 'CREATE', fromStatus: null, toStatus: 'PENDING',
    }),
    sequence: BigInt(index + 1), notificationState: 'PENDING',
    createdAt: new Date('2026-08-21T01:00:00.000Z'),
    task: task({ id: `task-${index + 1}`, employeeId: `employee-${index + 1}` }),
  }));
  let pageReads = 0;
  let published = 0;
  const prisma: any = {
    employeeTask: {
      findMany: async () => [],
      findUnique: async ({ where }: any) => rows.find((row) => row.task.id === where.id)?.task || null,
    },
    department: { findMany: async () => [], findUnique: async () => null },
    user: {
      findMany: async () => [],
      findUnique: async ({ where }: any) => ({
        id: where.id, name: where.id, isActive: true, employmentStatus: 'active',
      }),
    },
    taskActivity: {
      findMany: async ({ where, take }: any) => {
        pageReads += 1;
        const after = BigInt(where.sequence?.gt || 0);
        return rows.filter((row) => row.notificationState === 'PENDING' && row.sequence > after).slice(0, take);
      },
      updateMany: async ({ where, data }: any) => {
        const row = rows.find((item) => item.id === where.id && item.notificationState === where.notificationState);
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
      findUnique: async ({ where }: any) => rows.find((row) => row.id === where.id) || null,
    },
    $queryRawUnsafe: async () => [],
    $transaction: async (work: (tx: any) => Promise<unknown>) => work(prisma),
  };
  const service = createWorkbenchNotificationService({
    prisma,
    workflow: {
      workbenchRule: async () => ({
        enabled: true, channels: [], config: { dueSoonMinutes: 60, schedulerFailureThreshold: 3 },
      }),
      publishWorkbench: async () => { published += 1; return { accepted: true, created: true }; },
    },
  });

  const result = await service.scanReminders({
    now: new Date('2026-08-21T02:00:00.000Z'), signal: new AbortController().signal,
  });

  assert.equal(result.notified, 1_005);
  assert.equal(published, 1_005);
  assert.equal(pageReads, 3);
  assert.ok(rows.every((row) => row.notificationState === 'PUBLISHED'));
});

test('missing or inactive lifecycle recipients are terminally skipped and do not poison later scans', async () => {
  const row: any = {
    ...activity({ id: 'inactive-create', sequence: '1', action: 'CREATE' }),
    sequence: 1n, notificationState: 'PENDING', createdAt: new Date(), task: task(),
  };
  let publishes = 0;
  const prisma: any = {
    employeeTask: { findMany: async () => [], findUnique: async () => row.task },
    department: { findMany: async () => [] },
    user: { findMany: async () => [], findUnique: async () => ({
      id: 'employee-1', name: '离职员工', isActive: false, employmentStatus: 'left',
    }) },
    taskActivity: {
      findMany: async () => row.notificationState === 'PENDING' ? [row] : [],
      findUnique: async () => row,
      updateMany: async ({ where, data }: any) => {
        if (where.id !== row.id || where.notificationState !== row.notificationState) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
    $queryRawUnsafe: async () => [],
    $transaction: async (work: (tx: any) => Promise<unknown>) => work(prisma),
  };
  const service = createWorkbenchNotificationService({
    prisma,
    workflow: { publishWorkbench: async () => { publishes += 1; return { accepted: true, created: true }; } },
  });
  const input = { now: new Date(), signal: new AbortController().signal };

  const first = await service.scanReminders(input);
  const repeated = await service.scanReminders(input);

  assert.equal(first.failed, 0);
  assert.equal(first.skipped, 1);
  assert.equal(repeated.scanned, 0);
  assert.equal(row.notificationState, 'SKIPPED');
  assert.equal(row.notificationSkipReason, 'RECIPIENT_UNAVAILABLE');
  assert.equal(publishes, 0);
});
