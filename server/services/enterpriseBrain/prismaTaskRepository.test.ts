import assert from 'node:assert/strict';
import test from 'node:test';
import { createPrismaEnterpriseTaskRepository } from './prismaTaskRepository';
import type { GeneratedTaskInput } from './taskRepository';

function generated(index: number): GeneratedTaskInput {
  return {
    templateId: 'template-1', employeeId: `employee-${index}`, employeeName: `员工${index}`,
    departmentIdSnapshot: null, departmentNameSnapshot: null, positionIdSnapshot: null,
    positionNameSnapshot: null, standardVersionIdSnapshot: null, workDate: '2026-08-20',
    title: '日任务', description: null, targetValue: null, unit: null, evidenceRequired: false,
    dueAt: null,
  };
}

function transactionalPrisma(input: {
  failAt?: number;
  counts?: number[];
  afterMutation?: () => void;
  simulatedBatchDurationMs?: number;
} = {}) {
  const committed: any[] = [];
  const committedActivities: any[] = [];
  const calls: string[] = [];
  let transactionCount = 0;
  let mutationCount = 0;
  let transactionOptions: any;
  let leaseExtensionMs: number | undefined;
  let committedLeaseExtensionMs: number | undefined;
  let simulatedElapsedMs = 0;
  const mutate = async (data: any[], target: any[]) => {
    mutationCount += 1;
    calls.push(`tasks:${mutationCount}`);
    simulatedElapsedMs += input.simulatedBatchDurationMs || 0;
    if (mutationCount === input.failAt) throw new Error('SIMULATED_CHUNK_FAILURE');
    target.push(...data);
    input.afterMutation?.();
    return { count: input.counts?.[mutationCount - 1] ?? data.length };
  };
  const prisma: any = {
    async $queryRawUnsafe(sql: string) {
      calls.push(`lease:${sql}`);
      return [{ leaseKey: 'workbench:scheduler' }];
    },
    employeeTask: {
      async createMany({ data }: any) { return mutate(data, committed); },
    },
    async $transaction(work: any, options?: any) {
      transactionCount += 1;
      transactionOptions = options;
      const staged: any[] = [];
      const stagedActivities: any[] = [];
      let stagedLeaseExtensionMs: number | undefined;
      const tx = {
        async $queryRawUnsafe(sql: string) {
          calls.push(`lease:${sql}`);
          return [{ leaseKey: 'workbench:scheduler' }];
        },
        async $executeRawUnsafe(sql: string, ...values: any[]) {
          calls.push(`extend:${sql}`);
          leaseExtensionMs = Number(values[0]) / 1_000;
          stagedLeaseExtensionMs = leaseExtensionMs;
          return 1;
        },
        employeeTask: {
          async createMany({ data }: any) { return mutate(data, staged); },
          async findMany({ where }: any) {
            return staged.filter((row) => where.id.in.includes(row.id)).map((row) => ({ id: row.id }));
          },
        },
        taskActivity: {
          async createMany({ data }: any) { stagedActivities.push(...data); return { count: data.length }; },
        },
      };
      const result = await work(tx);
      if (simulatedElapsedMs > (options?.timeout || 5_000)) throw new Error('SIMULATED_PRISMA_TRANSACTION_TIMEOUT');
      committed.push(...staged);
      committedActivities.push(...stagedActivities);
      committedLeaseExtensionMs = stagedLeaseExtensionMs;
      return result;
    },
  };
  return {
    prisma,
    committed,
    committedActivities,
    calls,
    get transactionCount() { return transactionCount; },
    get transactionOptions() { return transactionOptions; },
    get leaseExtensionMs() { return leaseExtensionMs; },
    get committedLeaseExtensionMs() { return committedLeaseExtensionMs; },
    get simulatedElapsedMs() { return simulatedElapsedMs; },
  };
}

test('generation rejects more than 5000 candidates before opening a transaction', async () => {
  const database = transactionalPrisma();
  const repository = createPrismaEnterpriseTaskRepository(database.prisma);

  await assert.rejects(
    () => repository.createGeneratedTasks(Array.from({ length: 5_001 }, (_, index) => generated(index))),
    /GENERATED_TASK_CANDIDATE_LIMIT_EXCEEDED/,
  );

  assert.equal(database.transactionCount, 0);
  assert.equal(database.committed.length, 0);
});

test('delayed multi-chunk generation exceeds Prisma default 5s but commits within its explicit deadline', async () => {
  const database = transactionalPrisma({ simulatedBatchDurationMs: 3_100 });
  const repository = createPrismaEnterpriseTaskRepository(database.prisma);

  const created = await repository.createGeneratedTasks(
    Array.from({ length: 251 }, (_, index) => generated(index)),
  );

  assert.equal(created, 251);
  assert.ok(database.transactionOptions.maxWait > 0);
  assert.ok(database.simulatedElapsedMs > 5_000);
  assert.ok(database.transactionOptions.timeout > database.simulatedElapsedMs);
  assert.equal(database.calls.some((call) => call.startsWith('extend:')), false, 'manual generation must not mutate the scheduler lease');
  assert.equal(database.committed.length, 251);
  assert.equal(database.committedActivities.length, 251);
  assert.ok(database.committedActivities.every((item) => item.action === 'CREATE'));
});

test('leased generation extends DB-time expiry beyond the transaction timeout before task mutation', async () => {
  const database = transactionalPrisma();
  const repository = createPrismaEnterpriseTaskRepository(database.prisma);

  await repository.createGeneratedTasks([generated(1)], {
    lease: { leaseKey: 'workbench:scheduler', ownerToken: 'owner', leaseEpoch: 7 },
  });

  assert.match(database.calls[0]!, /lease:.*CURRENT_TIMESTAMP\(3\).*FOR UPDATE/);
  assert.match(database.calls[1]!, /extend:.*SET `expiresAt` = DATE_ADD\(CURRENT_TIMESTAMP\(3\), INTERVAL \? MICROSECOND\)/);
  assert.equal(database.calls[2], 'tasks:1');
  assert.ok(database.leaseExtensionMs! >= database.transactionOptions.timeout + 10_000);
});

test('leased generated-task chunks roll back together when a later chunk fails', async () => {
  const database = transactionalPrisma({ failAt: 2 });
  const repository = createPrismaEnterpriseTaskRepository(database.prisma);

  await assert.rejects(
    () => repository.createGeneratedTasks(Array.from({ length: 251 }, (_, index) => generated(index)), {
      lease: { leaseKey: 'workbench:scheduler', ownerToken: 'owner', leaseEpoch: 7 },
    }),
    /SIMULATED_CHUNK_FAILURE/,
  );

  assert.equal(database.transactionCount, 1);
  assert.equal(database.committed.length, 0, 'a failed later chunk must roll back the earlier chunk');
  assert.equal(database.committedLeaseExtensionMs, undefined, 'the generation lease extension must roll back with task writes');
  assert.match(database.calls[0]!, /lease:.*`ownerToken` = \?.*`leaseEpoch` = \?.*CURRENT_TIMESTAMP\(3\).*FOR UPDATE/);
});

test('manual generated-task chunks are also all-or-nothing', async () => {
  const database = transactionalPrisma({ failAt: 2 });
  const repository = createPrismaEnterpriseTaskRepository(database.prisma);

  await assert.rejects(
    () => repository.createGeneratedTasks(Array.from({ length: 251 }, (_, index) => generated(index))),
    /SIMULATED_CHUNK_FAILURE/,
  );

  assert.equal(database.transactionCount, 1);
  assert.equal(database.committed.length, 0, 'manual generation must not expose a partially generated day');
});

test('atomic generated-task chunks return the exact aggregate created count', async () => {
  const database = transactionalPrisma({ counts: [240, 1] });
  const repository = createPrismaEnterpriseTaskRepository(database.prisma);

  const created = await repository.createGeneratedTasks(
    Array.from({ length: 251 }, (_, index) => generated(index)),
  );

  assert.equal(created, 241);
  assert.equal(database.transactionCount, 1);
  assert.equal(database.committed.length, 251);
});

test('an abort observed inside generation rolls back the whole transaction', async () => {
  const controller = new AbortController();
  const database = transactionalPrisma({
    afterMutation: () => controller.abort(new Error('SCHEDULER_SHUTDOWN')),
  });
  const repository = createPrismaEnterpriseTaskRepository(database.prisma);

  await assert.rejects(
    () => repository.createGeneratedTasks([generated(1)], { signal: controller.signal }),
    /SCHEDULER_SHUTDOWN/,
  );

  assert.equal(database.transactionCount, 1);
  assert.equal(database.committed.length, 0);
});

test('manual one-off creation commits exactly one CREATE activity with the task', async () => {
  const committed = { tasks: [] as any[], activities: [] as any[] };
  const prisma: any = {
    async $transaction(work: (tx: any) => Promise<any>) {
      const staged = structuredClone(committed);
      const tx = {
        employeeTask: {
          async create({ data }: any) {
            const row = { ...data, status: 'PENDING', actualValue: null, result: null, returnedReason: null, evidence: [] };
            staged.tasks.push(row);
            return row;
          },
        },
        taskActivity: { async create({ data }: any) { staged.activities.push(data); return data; } },
      };
      const result = await work(tx);
      Object.assign(committed, staged);
      return result;
    },
  };
  const repository = createPrismaEnterpriseTaskRepository(prisma);
  const created = await repository.createOneOffTask({
    ...generated(1), templateId: null, assignedById: 'manager-1', assignedByName: '主管',
  });

  assert.equal(committed.tasks.length, 1);
  assert.deepEqual(committed.activities.map((item) => [item.taskId, item.action, item.actorId]), [
    [created.id, 'CREATE', 'manager-1'],
  ]);
});

test('task list returns source, module, priority and multi-status filtering for the employee workbench', async () => {
  const queries: any[] = [];
  const row = {
    id: 'task-workbench-meta', templateId: null, sourceKey: 'crm:lead:1', taskType: 'FOLLOW_UP', priority: 'HIGH',
    businessModule: 'CRM', sourceRoute: '/customers/lead-1', sourceLabel: '客户跟进', employeeId: 'employee-1', employeeName: '员工甲',
    departmentIdSnapshot: 'department-1', departmentNameSnapshot: '销售部', positionIdSnapshot: 'position-1', positionNameSnapshot: '销售',
    standardVersionIdSnapshot: null, workDate: new Date('2026-08-20T00:00:00.000Z'), title: '回访客户', description: null,
    targetValue: null, actualValue: null, unit: null, evidenceRequired: false, status: 'RETURNED', result: null,
    dueAt: new Date('2026-08-20T10:00:00.000Z'), returnedReason: null, sourceType: 'CRM_FOLLOW_UP', sourceId: 'lead-1', sourceItemId: null, evidence: [],
  };
  const prisma: any = {
    employeeTask: {
      async findMany({ where }: any) { queries.push(where); return [row]; },
      async count({ where }: any) { queries.push(where); return 1; },
    },
  };
  const repository = createPrismaEnterpriseTaskRepository(prisma);
  const result = await repository.listTasks({ employeeId: 'employee-1', status: 'PENDING,RETURNED', page: 1, pageSize: 10 });

  assert.deepEqual(queries[0].status, { in: ['PENDING', 'RETURNED'] });
  assert.deepEqual(
    result.items.map((item) => ({ sourceLabel: item.sourceLabel, businessModule: item.businessModule, priority: item.priority })),
    [{ sourceLabel: '客户跟进', businessModule: 'CRM', priority: 'HIGH' }],
  );
});
