import assert from 'node:assert/strict';
import type { EmployeeTask } from '../../../src/types/enterpriseBrain';
import { createMemoryWorkbenchRepository } from './workbenchRepository';
import { createPrismaWorkbenchRepository } from './prismaWorkbenchRepository';
import type { DesiredEmployeeTask, ReconcileResult, WorkbenchSourceAdapter } from './sourceAdapter';
import { createTaskSyncService } from './taskSyncService';

const desiredTask = (overrides: Partial<DesiredEmployeeTask> = {}): DesiredEmployeeTask => ({
  sourceKey: 'customer_todo:todo-1',
  taskType: 'FOLLOW_UP',
  priority: 'HIGH',
  businessModule: 'CRM',
  title: '回访重点客户',
  employeeId: 'employee-1',
  employeeNameSnapshot: '员工甲',
  workDate: '2026-08-21',
  sourceVersion: 'v1',
  ...overrides,
});

const employeeOwnedTask = (): EmployeeTask => ({
  id: 'task-existing',
  sourceKey: 'customer_todo:todo-1',
  taskType: 'ACTION' as const,
  priority: 'NORMAL' as const,
  businessModule: 'CRM',
  sourceRoute: '/old-route',
  sourceLabel: '旧来源',
  employeeId: 'employee-old',
  employeeName: '老负责人',
  departmentIdSnapshot: 'dept-old',
  departmentNameSnapshot: '旧部门',
  positionIdSnapshot: 'position-old',
  positionNameSnapshot: '旧岗位',
  workDate: '2026-08-20',
  title: '旧标题',
  description: '旧描述',
  targetValue: 10,
  actualValue: 8,
  unit: '次',
  evidenceRequired: true,
  status: 'CONFIRMED' as const,
  result: '员工已提交结果',
  dueAt: '2026-08-20T10:00:00.000Z',
  returnedReason: null,
  startedAt: '2026-08-20T01:00:00.000Z',
  completedAt: '2026-08-20T02:00:00.000Z',
  confirmedAt: '2026-08-20T03:00:00.000Z',
  confirmedById: 'manager-1',
  confirmedByName: '主管甲',
  qualityScore: 95,
  qualityComment: '合格',
  sourceVersion: 'v1',
  collaboratorIds: ['employee-old-helper'],
  estimatedMinutes: 30,
  evidence: [{ id: 'evidence-1', type: 'TEXT', referenceId: null, content: '可验证结果' }],
});

const reconcileResult = (overrides: Partial<ReconcileResult> = {}): ReconcileResult => ({
  scanned: 0,
  created: 0,
  updated: 0,
  canceled: 0,
  unchanged: 0,
  failed: 0,
  errors: [],
  ...overrides,
});

function createConcurrentPrismaHarness() {
  const rows = new Map<string, any>();
  const activities: any[] = [];
  let failNextActivity = false;
  let transactionTail: Promise<void> = Promise.resolve();

  const employeeTask = {
    async findUnique({ where }: any) {
      if (where.sourceKey) {
        const row = rows.get(where.sourceKey);
        return row ? { ...structuredClone(row), evidence: [] } : null;
      }
      const row = [...rows.values()].find((item) => item.id === where.id);
      return row ? { ...structuredClone(row), evidence: [] } : null;
    },
    async upsert({ where, create, update }: any) {
      const existing = rows.get(where.sourceKey);
      if (existing) Object.assign(existing, update);
      else rows.set(where.sourceKey, { ...structuredClone(create), evidence: [] });
      return { ...structuredClone(rows.get(where.sourceKey)), evidence: [] };
    },
    async updateMany({ where, data }: any) {
      const row = where.sourceKey
        ? rows.get(where.sourceKey)
        : [...rows.values()].find((item) => item.id === where.id);
      if (!row) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    },
  };
  const taskActivity = {
    async create({ data }: any) {
      if (failNextActivity) {
        failNextActivity = false;
        throw new Error('活动写入失败');
      }
      const row = { ...structuredClone(data), createdAt: data.createdAt || new Date() };
      activities.push(row);
      return row;
    },
  };
  const prisma = {
    employeeTask,
    taskActivity, taskEvidence: {}, user: {}, role: {}, department: {}, leadRecord: {}, businessRecord: {},
    async $transaction(work: (transaction: any) => Promise<unknown>) {
      const previous = transactionTail;
      let releaseTransaction!: () => void;
      transactionTail = new Promise<void>((resolve) => { releaseTransaction = resolve; });
      await previous;
      const rowSnapshot = structuredClone([...rows.entries()]);
      const activitySnapshot = structuredClone(activities);
      try {
        return await work(prisma);
      } catch (error) {
        rows.clear();
        rowSnapshot.forEach(([key, value]) => rows.set(key, value));
        activities.splice(0, activities.length, ...activitySnapshot);
        throw error;
      } finally {
        releaseTransaction();
      }
    },
  };
  return { prisma, rows, activities, failActivity: () => { failNextActivity = true; } };
}

{
  const memory = createMemoryWorkbenchRepository();
  const service = createTaskSyncService({ repository: memory.repository });

  await assert.rejects(
    () => service.syncDesiredTask(desiredTask({ sourceKey: 'customer_todo:payload' }), 'customer_todo:argument'),
    /sourceKey/,
  );

  assert.equal(memory.tasks.length, 0, '创建身份不匹配时不得写入任务');
  assert.equal(memory.activities.length, 0, '创建身份不匹配时不得写入活动');
}

{
  const original = employeeOwnedTask();
  const memory = createMemoryWorkbenchRepository({ tasks: [original] });
  const service = createTaskSyncService({ repository: memory.repository });

  await assert.rejects(
    () => service.syncDesiredTask(desiredTask({ sourceKey: 'customer_todo:other' }), original.sourceKey!),
    /sourceKey/,
  );
  await assert.rejects(
    () => service.syncDesiredTask(desiredTask({ businessModule: 'ORDER' }), original.sourceKey!),
    /businessModule/,
  );
  await assert.rejects(
    () => service.syncDesiredTask(desiredTask({ taskType: 'APPROVAL' }), original.sourceKey!),
    /taskType/,
  );

  assert.equal(memory.tasks[0]?.title, '旧标题', '身份冲突的载荷不得附着到其他模块任务');
  assert.equal(memory.activities.length, 0);
}

{
  const memory = createMemoryWorkbenchRepository();
  const service = createTaskSyncService({ repository: memory.repository });
  const desired = desiredTask({ collaboratorIds: [] });

  await service.syncDesiredTask(desired, desired.sourceKey);
  await service.syncDesiredTask(desired, desired.sourceKey);
  await Promise.all([
    service.syncDesiredTask(desired, desired.sourceKey),
    service.syncDesiredTask(desired, desired.sourceKey),
  ]);

  assert.equal(memory.tasks.filter((item) => item.sourceKey === desired.sourceKey).length, 1);
  assert.equal(memory.tasks[0]?.sourceVersion, desired.sourceVersion);
  assert.equal(memory.activities.length, 1, '首次创建及重复无变化同步只能留一条创建活动');
  assert.equal(memory.activities[0]?.action, 'CREATE');

  memory.tasks[0]!.remindedAt = '2026-08-21T01:00:00.000Z';
  memory.tasks[0]!.lastOverdueNotifiedAt = '2026-08-21T02:00:00.000Z';

  const changed = desiredTask({
    collaboratorIds: [],
    title: '回访重点客户二次',
    dueAt: '2026-08-22T09:00:00.000Z',
    sourceVersion: 'v2',
  });
  await service.syncDesiredTask(changed, changed.sourceKey);
  await service.syncDesiredTask(changed, changed.sourceKey);

  assert.equal(memory.activities.length, 2, '字段变化只能追加一条来源同步活动');
  assert.equal(memory.activities[1]?.action, 'SOURCE_SYNC');
  assert.deepEqual(memory.activities[1]?.metadata, {
    source: 'RECONCILIATION',
    changedFields: ['title', 'dueAt', 'sourceVersion'],
  });
  assert.equal(JSON.stringify(memory.activities[1]?.metadata).includes('回访重点客户二次'), false);
  assert.equal(memory.tasks[0]?.remindedAt, null, '来源截止时间变化后必须重置临期提醒');
  assert.equal(memory.tasks[0]?.lastOverdueNotifiedAt, null, '来源截止时间变化后必须重置逾期提醒');

  memory.tasks[0]!.remindedAt = '2026-08-22T01:00:00.000Z';
  memory.tasks[0]!.lastOverdueNotifiedAt = '2026-08-22T02:00:00.000Z';
  const movedDepartment = desiredTask({
    collaboratorIds: [], title: changed.title, dueAt: changed.dueAt,
    departmentId: 'dept-support', departmentNameSnapshot: '支持部', sourceVersion: 'v3',
  });
  await service.syncDesiredTask(movedDepartment, movedDepartment.sourceKey);
  assert.equal(memory.tasks[0]?.remindedAt, null, '来源部门变化后必须重置临期提醒');
  assert.equal(memory.tasks[0]?.lastOverdueNotifiedAt, null, '来源部门名称变化后必须重置逾期提醒');
  assert.deepEqual(memory.activities[2]?.metadata, {
    source: 'RECONCILIATION', changedFields: ['departmentId', 'departmentNameSnapshot', 'sourceVersion'],
  });
}

{
  const harness = createConcurrentPrismaHarness();
  const service = createTaskSyncService({
    repository: createPrismaWorkbenchRepository(harness.prisma as any),
  });
  const desired = desiredTask({ collaboratorIds: [] });

  await Promise.all([
    service.syncDesiredTask(desired, desired.sourceKey),
    service.syncDesiredTask(desired, desired.sourceKey),
  ]);

  assert.equal(harness.rows.size, 1, '数据库唯一键路径必须在并发同步时仍只保留一条任务');
  assert.deepEqual(harness.rows.get(desired.sourceKey)?.collaboratorIds, [], '明确的空协作人列表不应被改写为 null');
  assert.deepEqual(harness.activities.map((item) => item.action), ['CREATE'], '并发创建必须只审计一次');

  harness.rows.get(desired.sourceKey)!.remindedAt = new Date('2026-08-21T01:00:00.000Z');
  harness.rows.get(desired.sourceKey)!.lastOverdueNotifiedAt = new Date('2026-08-21T02:00:00.000Z');
  const changed = desiredTask({
    collaboratorIds: [], title: '并发后更新', dueAt: '2026-08-22T09:00:00.000Z', sourceVersion: 'v2',
  });
  await Promise.all([
    service.syncDesiredTask(changed, changed.sourceKey),
    service.syncDesiredTask(changed, changed.sourceKey),
  ]);
  assert.deepEqual(harness.activities.map((item) => item.action), ['CREATE', 'SOURCE_SYNC'], '并发相同更新必须只审计一次');
  assert.equal(harness.rows.get(desired.sourceKey)?.title, '并发后更新');
  assert.equal(harness.rows.get(desired.sourceKey)?.sourceVersion, 'v2');
  assert.equal(harness.rows.get(desired.sourceKey)?.remindedAt, null);
  assert.equal(harness.rows.get(desired.sourceKey)?.lastOverdueNotifiedAt, null);
  assert.deepEqual(harness.activities[1]?.metadata, {
    source: 'RECONCILIATION', changedFields: ['title', 'dueAt', 'sourceVersion'],
  });

  harness.rows.get(desired.sourceKey)!.remindedAt = new Date('2026-08-22T01:00:00.000Z');
  harness.rows.get(desired.sourceKey)!.lastOverdueNotifiedAt = new Date('2026-08-22T02:00:00.000Z');
  const movedDepartment = desiredTask({
    collaboratorIds: [], title: changed.title, dueAt: changed.dueAt,
    departmentId: 'dept-support', departmentNameSnapshot: '支持部', sourceVersion: 'v3',
  });
  await service.syncDesiredTask(movedDepartment, movedDepartment.sourceKey);
  assert.equal(harness.rows.get(desired.sourceKey)?.remindedAt, null);
  assert.equal(harness.rows.get(desired.sourceKey)?.lastOverdueNotifiedAt, null);
  assert.deepEqual(harness.activities[2]?.metadata, {
    source: 'RECONCILIATION', changedFields: ['departmentId', 'departmentNameSnapshot', 'sourceVersion'],
  });
}

{
  const harness = createConcurrentPrismaHarness();
  const repository = createPrismaWorkbenchRepository(harness.prisma as any);
  const desired = desiredTask({ sourceVersion: 'conflict-recovered' });
  const atomicUpsert = harness.prisma.employeeTask.upsert;
  let upsertAttempts = 0;
  harness.prisma.employeeTask.upsert = async (args: any) => {
    upsertAttempts += 1;
    if (upsertAttempts === 1) throw { code: 'P2002' };
    return atomicUpsert(args);
  };

  const recovered = await repository.createFromDesired(desired);

  assert.equal(harness.rows.size, 1);
  assert.equal(recovered.sourceKey, desired.sourceKey);
  assert.equal(recovered.sourceVersion, 'conflict-recovered');
  assert.equal(upsertAttempts, 2, '唯一冲突后条目被删除时只进行有界重试');
  assert.deepEqual(harness.activities.map((item) => item.action), ['CREATE']);
}

{
  const harness = createConcurrentPrismaHarness();
  const service = createTaskSyncService({ repository: createPrismaWorkbenchRepository(harness.prisma as any) });
  const desired = desiredTask();
  harness.failActivity();

  await assert.rejects(() => service.syncDesiredTask(desired, desired.sourceKey), /活动写入失败/);
  assert.equal(harness.rows.size, 0, '创建活动失败必须回滚任务');
  assert.equal(harness.activities.length, 0);

  await service.syncDesiredTask(desired, desired.sourceKey);
  assert.equal(harness.rows.size, 1);
  assert.deepEqual(harness.activities.map((item) => item.action), ['CREATE']);

  const changed = desiredTask({ title: '事务内更新', sourceVersion: 'v2' });
  harness.failActivity();
  await assert.rejects(() => service.syncDesiredTask(changed, changed.sourceKey), /活动写入失败/);
  assert.equal(harness.rows.get(desired.sourceKey)?.title, desired.title, '来源活动失败必须回滚字段更新');
  assert.deepEqual(harness.activities.map((item) => item.action), ['CREATE']);

  await service.syncDesiredTask(changed, changed.sourceKey);
  assert.equal(harness.rows.get(desired.sourceKey)?.title, '事务内更新');
  assert.deepEqual(harness.activities.map((item) => item.action), ['CREATE', 'SOURCE_SYNC']);
}

{
  const harness = createConcurrentPrismaHarness();
  const repository = createPrismaWorkbenchRepository(harness.prisma as any);
  let attempts = 0;
  harness.prisma.employeeTask.upsert = async () => {
    attempts += 1;
    throw { code: 'P2002' };
  };

  await assert.rejects(
    () => repository.createFromDesired(desiredTask()),
    (error: any) => error?.code === 'P2002',
  );
  assert.equal(attempts, 3, '唯一冲突重试必须有界');
  assert.equal(harness.rows.size, 0);
  assert.equal(harness.activities.length, 0);
}

{
  const harness = createConcurrentPrismaHarness();
  const repository = createPrismaWorkbenchRepository(harness.prisma as any);
  const atomicUpsert = harness.prisma.employeeTask.upsert;
  let attempts = 0;
  harness.prisma.employeeTask.upsert = async (args: any) => {
    attempts += 1;
    if (attempts === 1) throw { code: 'P2034' };
    return atomicUpsert(args);
  };

  const recovered = await repository.createFromDesired(desiredTask({ sourceVersion: 'write-conflict-recovered' }));

  assert.equal(recovered.sourceVersion, 'write-conflict-recovered');
  assert.equal(attempts, 2, '写冲突后必须通过同一有界策略恢复');
  assert.deepEqual(harness.activities.map((item) => item.action), ['CREATE']);
}

{
  const harness = createConcurrentPrismaHarness();
  const repository = createPrismaWorkbenchRepository(harness.prisma as any);
  let attempts = 0;
  harness.prisma.employeeTask.upsert = async () => {
    attempts += 1;
    throw { code: 'P2034' };
  };

  await assert.rejects(
    () => repository.createFromDesired(desiredTask()),
    (error: any) => error?.code === 'P2034',
  );
  assert.equal(attempts, 3, '持续写冲突最多尝试三次');
  assert.equal(harness.rows.size, 0);
  assert.equal(harness.activities.length, 0);
}

{
  const harness = createConcurrentPrismaHarness();
  const repository = createPrismaWorkbenchRepository(harness.prisma as any);
  const initial = desiredTask({ sourceVersion: 'before-delete' });
  await repository.createFromDesired(initial);
  const atomicUpdateMany = harness.prisma.employeeTask.updateMany;
  const atomicTransaction = harness.prisma.$transaction;
  let updateAttempts = 0;
  harness.prisma.employeeTask.updateMany = async (args: any) => {
    updateAttempts += 1;
    if (updateAttempts === 1) {
      harness.rows.clear();
      return { count: 0 };
    }
    return atomicUpdateMany(args);
  };
  harness.prisma.$transaction = async (work: (transaction: any) => Promise<unknown>) => {
    try {
      return await atomicTransaction(work);
    } catch (error) {
      if (updateAttempts === 1) {
        harness.rows.clear();
        harness.activities.splice(0);
      }
      throw error;
    }
  };
  const desired = desiredTask({ title: '删除后重建', sourceVersion: 'recreated-after-delete' });

  const recovered = await repository.createFromDesired(desired);

  assert.equal(recovered.sourceKey, desired.sourceKey);
  assert.equal(recovered.sourceVersion, 'recreated-after-delete');
  assert.equal(harness.rows.size, 1);
  assert.equal(updateAttempts, 1, '更新期间消失后必须通过下一次原子 upsert 重建');
  assert.deepEqual(harness.activities.map((item) => item.action), ['CREATE']);
}

{
  const harness = createConcurrentPrismaHarness();
  const repository = createPrismaWorkbenchRepository(harness.prisma as any);
  const initial = desiredTask({ sourceVersion: 'persistent-conflict-v1' });
  await repository.createFromDesired(initial);
  harness.activities.splice(0);
  let updateAttempts = 0;
  harness.prisma.employeeTask.updateMany = async () => {
    updateAttempts += 1;
    return { count: 0 };
  };

  await assert.rejects(
    () => repository.createFromDesired(desiredTask({ title: '无法提交的更新', sourceVersion: 'persistent-conflict-v2' })),
    /source task changed during synchronization/,
  );

  assert.equal(updateAttempts, 3, '持续消失行冲突最多尝试三次');
  assert.equal(harness.rows.get(initial.sourceKey)?.sourceVersion, 'persistent-conflict-v1');
  assert.equal(harness.activities.length, 0);
}

{
  const original = employeeOwnedTask();
  const memory = createMemoryWorkbenchRepository({ tasks: [original] });
  const service = createTaskSyncService({ repository: memory.repository });
  const desired = desiredTask({
    taskType: 'ACTION',
    businessModule: 'CRM',
    priority: 'URGENT',
    title: '新标题',
    description: '新描述',
    employeeId: 'employee-new',
    employeeNameSnapshot: '新负责人',
    departmentId: 'dept-new',
    departmentNameSnapshot: '新部门',
    workDate: '2026-08-22',
    dueAt: '2026-08-22T09:00:00.000Z',
    sourceRoute: '/new-route',
    sourceLabel: '新来源',
    collaboratorIds: ['employee-helper'],
    estimatedMinutes: 45,
    sourceVersion: 'v2',
  });

  const synced = await service.syncDesiredTask(desired, desired.sourceKey);

  assert.equal(synced?.title, '新标题');
  assert.equal(synced?.description, '新描述');
  assert.equal(synced?.employeeId, 'employee-new');
  assert.equal(synced?.employeeName, '新负责人');
  assert.equal(synced?.departmentIdSnapshot, 'dept-new');
  assert.equal(synced?.departmentNameSnapshot, '新部门');
  assert.equal(synced?.workDate, '2026-08-22');
  assert.equal(synced?.dueAt, '2026-08-22T09:00:00.000Z');
  assert.equal(synced?.priority, 'URGENT');
  assert.equal(synced?.sourceRoute, '/new-route');
  assert.equal(synced?.sourceLabel, '新来源');
  assert.deepEqual(synced?.collaboratorIds, ['employee-helper']);
  assert.equal(synced?.estimatedMinutes, 45);
  assert.equal(synced?.sourceVersion, 'v2');
  assert.equal(synced?.taskType, 'ACTION', '任务类型是创建时身份字段');
  assert.equal(synced?.businessModule, 'CRM', '业务模块是创建时身份字段');
  assert.equal(synced?.status, 'CONFIRMED');
  assert.equal(synced?.result, '员工已提交结果');
  assert.equal(synced?.actualValue, 8);
  assert.equal(synced?.startedAt, '2026-08-20T01:00:00.000Z');
  assert.equal(synced?.completedAt, '2026-08-20T02:00:00.000Z');
  assert.equal(synced?.confirmedAt, '2026-08-20T03:00:00.000Z');
  assert.equal(synced?.confirmedById, 'manager-1');
  assert.equal(synced?.qualityScore, 95);
  assert.equal(synced?.qualityComment, '合格');
  assert.deepEqual(synced?.evidence, original.evidence);
}

{
  const completed = employeeOwnedTask();
  completed.status = 'COMPLETED';
  const pending = employeeOwnedTask();
  pending.id = 'task-pending';
  pending.sourceKey = 'customer_todo:pending';
  pending.status = 'PENDING';
  const inProgress = employeeOwnedTask();
  inProgress.id = 'task-in-progress';
  inProgress.sourceKey = 'customer_todo:in-progress';
  inProgress.status = 'IN_PROGRESS';
  const returned = employeeOwnedTask();
  returned.id = 'task-returned';
  returned.sourceKey = 'customer_todo:returned';
  returned.status = 'RETURNED';
  const confirmed = employeeOwnedTask();
  confirmed.id = 'task-confirmed';
  confirmed.sourceKey = 'customer_todo:confirmed';
  const canceled = employeeOwnedTask();
  canceled.id = 'task-canceled';
  canceled.sourceKey = 'customer_todo:canceled';
  canceled.status = 'CANCELED';
  canceled.canceledAt = '2026-08-20T04:00:00.000Z';
  canceled.canceledReason = '已取消';
  const memory = createMemoryWorkbenchRepository({
    tasks: [completed, pending, inProgress, returned, confirmed, canceled],
  });
  const service = createTaskSyncService({ repository: memory.repository });

  const preservedCompleted = await service.syncDesiredTask(null, completed.sourceKey!);
  const canceledPending = await service.syncDesiredTask(null, pending.sourceKey!);
  const canceledInProgress = await service.syncDesiredTask(null, inProgress.sourceKey!);
  const canceledReturned = await service.syncDesiredTask(null, returned.sourceKey!);
  const preservedConfirmed = await service.syncDesiredTask(null, confirmed.sourceKey!);
  const preservedCanceled = await service.syncDesiredTask(null, canceled.sourceKey!);
  const missing = await service.syncDesiredTask(null, 'customer_todo:missing');

  assert.equal(preservedCompleted?.status, 'COMPLETED');
  assert.equal(preservedCompleted?.canceledAt, undefined);
  assert.equal(preservedCompleted?.result, '员工已提交结果');
  assert.deepEqual(preservedCompleted?.evidence, completed.evidence);
  assert.equal(preservedCompleted?.completedAt, '2026-08-20T02:00:00.000Z');
  assert.equal(preservedCompleted?.qualityScore, 95);
  assert.equal(canceledPending?.status, 'CANCELED');
  assert.equal(canceledInProgress?.status, 'CANCELED');
  assert.equal(canceledReturned?.status, 'CANCELED');
  assert.equal(memory.activities.length, 3);
  assert.equal(memory.activities[0]?.action, 'CANCEL');
  assert.equal(memory.activities[0]?.fromStatus, 'PENDING');
  assert.equal(memory.activities[0]?.toStatus, 'CANCELED');
  assert.deepEqual(memory.activities[0]?.metadata, { sourceKey: pending.sourceKey, source: 'RECONCILIATION' });
  assert.equal(preservedConfirmed?.status, 'CONFIRMED');
  assert.equal(preservedConfirmed?.canceledAt, undefined);
  assert.equal(preservedCanceled?.status, 'CANCELED');
  assert.equal(preservedCanceled?.canceledAt, '2026-08-20T04:00:00.000Z');
  assert.equal(preservedCanceled?.canceledReason, '已取消');
  assert.equal(missing, null);
}

{
  const memory = createMemoryWorkbenchRepository();
  const service = createTaskSyncService({ repository: memory.repository });
  const calls: string[] = [];
  const observedLimits: number[] = [];
  const observedTimes: number[] = [];
  const adapters: WorkbenchSourceAdapter[] = [
    {
      module: 'CRM',
      async reconcile(context) {
        calls.push('CRM');
        observedLimits.push(context.limit || 0);
        observedTimes.push(context.now.getTime());
        context.now.setUTCFullYear(2000);
        (context as { limit?: number }).limit = 1;
        return reconcileResult({
          scanned: 3, created: 1, updated: 1, unchanged: 1, failed: 1,
          errors: [{
            module: 'CRM',
            sourceKey: 'customer_todo:bad',
            message: 'password=pw token=tok secret=sec Authorization=Bearer Cookie=sid mysql://user:pw@db/internal',
          }],
        });
      },
      async resolveTask() { return null; },
    },
    {
      module: 'ORDER',
      async reconcile() {
        calls.push('ORDER');
        throw new Error('database password=do-not-leak\n    at secret-stack');
      },
      async resolveTask() { return null; },
    },
    {
      module: 'FINANCE',
      async reconcile(context) {
        calls.push('FINANCE');
        observedLimits.push(context.limit || 0);
        observedTimes.push(context.now.getTime());
        return reconcileResult({ scanned: 2, canceled: 1, unchanged: 1 });
      },
      async resolveTask() { return null; },
    },
  ];

  const result = await service.reconcileAdapters(adapters, {
    now: new Date('2026-08-21T01:00:00.000Z'),
    limit: Number.MAX_SAFE_INTEGER,
  });

  assert.deepEqual(calls, ['CRM', 'ORDER', 'FINANCE']);
  assert.deepEqual(observedLimits, [1_000, 1_000]);
  assert.deepEqual(observedTimes, [
    new Date('2026-08-21T01:00:00.000Z').getTime(),
    new Date('2026-08-21T01:00:00.000Z').getTime(),
  ]);
  assert.deepEqual(result, {
    scanned: 5,
    created: 1,
    updated: 1,
    canceled: 1,
    unchanged: 2,
    failed: 2,
    errors: [
      { module: 'CRM', sourceKey: 'customer_todo:bad', message: 'CRM 来源对账失败' },
      { module: 'ORDER', message: 'ORDER 来源对账失败' },
    ],
  });
  const serializedErrors = JSON.stringify(result.errors).toLowerCase();
  ['password', 'token', 'secret', 'authorization', 'cookie', 'mysql://', 'do-not-leak', 'secret-stack']
    .forEach((secret) => assert.equal(serializedErrors.includes(secret), false, `对账错误不得泄露 ${secret}`));
}

{
  const memory = createMemoryWorkbenchRepository();
  const service = createTaskSyncService({ repository: memory.repository });
  const observedCursors: Record<string, Array<string | undefined>> = { CRM: [], FINANCE: [] };
  const adapters: WorkbenchSourceAdapter[] = [
    {
      module: 'CRM',
      async reconcile(context) {
        observedCursors.CRM.push(context.cursor);
        return reconcileResult({ nextCursors: { CRM: context.cursor ? 'crm-cursor-3' : 'crm-cursor-2' } });
      },
      async resolveTask() { return null; },
    },
    {
      module: 'FINANCE',
      async reconcile(context) {
        observedCursors.FINANCE.push(context.cursor);
        return reconcileResult({ nextCursors: { FINANCE: context.cursor ? 'finance-cursor-9' : 'finance-cursor-8' } });
      },
      async resolveTask() { return null; },
    },
  ];
  const firstRound = await service.reconcileAdapters(adapters, {
    now: new Date('2026-08-21T01:00:00.000Z'),
  });
  const secondRound = await service.reconcileAdapters(adapters, {
    now: new Date('2026-08-21T01:01:00.000Z'),
    cursor: 'legacy-single-adapter-cursor',
    cursors: firstRound.nextCursors,
  });

  assert.deepEqual(firstRound.nextCursors, { CRM: 'crm-cursor-2', FINANCE: 'finance-cursor-8' });
  assert.deepEqual(observedCursors, {
    CRM: [undefined, 'crm-cursor-2'],
    FINANCE: [undefined, 'finance-cursor-8'],
  });
  assert.deepEqual(secondRound.nextCursors, { CRM: 'crm-cursor-3', FINANCE: 'finance-cursor-9' });

  let duplicateCalls = 0;
  const duplicate: WorkbenchSourceAdapter = {
    module: 'CRM',
    async reconcile() {
      duplicateCalls += 1;
      return reconcileResult();
    },
    async resolveTask() { return null; },
  };
  await assert.rejects(
    () => service.reconcileAdapters([duplicate, duplicate], { now: new Date('2026-08-21T01:00:00.000Z') }),
    /CRM.*重复/,
  );
  assert.equal(duplicateCalls, 0, '重复模块必须在任何适配器执行前拒绝');
}

{
  const memory = createMemoryWorkbenchRepository();
  const service = createTaskSyncService({ repository: memory.repository });
  const controller = new AbortController();
  const calls: string[] = [];
  const localAbort = new Error('适配器本地请求已中止');
  localAbort.name = 'AbortError';
  const result = await service.reconcileAdapters([
    {
      module: 'CRM',
      async reconcile() {
        calls.push('CRM');
        throw localAbort;
      },
      async resolveTask() { return null; },
    },
    {
      module: 'ORDER',
      async reconcile() {
        calls.push('ORDER');
        return reconcileResult({ scanned: 1, unchanged: 1 });
      },
      async resolveTask() { return null; },
    },
  ], { now: new Date('2026-08-21T01:00:00.000Z'), signal: controller.signal });

  assert.deepEqual(calls, ['CRM', 'ORDER']);
  assert.equal(result.failed, 1);
  assert.equal(result.unchanged, 1);
}

{
  const memory = createMemoryWorkbenchRepository();
  const service = createTaskSyncService({ repository: memory.repository });
  const controller = new AbortController();
  const calls: string[] = [];
  const adapters: WorkbenchSourceAdapter[] = [
    {
      module: 'CRM',
      async reconcile() {
        calls.push('CRM');
        controller.abort(new Error('上游要求中止'));
        return reconcileResult({ scanned: 1, created: 1 });
      },
      async resolveTask() { return null; },
    },
    {
      module: 'ORDER',
      async reconcile() {
        calls.push('ORDER');
        return reconcileResult({ scanned: 1 });
      },
      async resolveTask() { return null; },
    },
  ];

  await assert.rejects(
    () => service.reconcileAdapters(adapters, {
      now: new Date('2026-08-21T01:00:00.000Z'), signal: controller.signal,
    }),
    /上游要求中止/,
  );
  assert.deepEqual(calls, ['CRM']);
}

console.log('workbench task sync tests passed');
