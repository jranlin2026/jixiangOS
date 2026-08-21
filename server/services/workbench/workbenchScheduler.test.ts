import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { Prisma } from '@prisma/client';
import { createTaskSyncService } from './taskSyncService';
import type { ReconcileResult, WorkbenchSourceAdapter } from './sourceAdapter';
import {
  createWorkbenchScheduler,
  shanghaiBusinessDate,
  millisecondsUntilNextShanghaiMidnight,
  type SchedulerLease,
  type SchedulerRunCompletion,
  type SchedulerRunRecord,
  type WorkbenchSchedulerStore,
} from './workbenchScheduler';
import { createPrismaSchedulerStore } from './prismaSchedulerStore';
import { createWorkbenchNotificationService } from './workbenchNotificationService';

function emptyReconcile(overrides: Partial<ReconcileResult> = {}): ReconcileResult {
  return {
    scanned: 0,
    created: 0,
    updated: 0,
    canceled: 0,
    unchanged: 0,
    failed: 0,
    errors: [],
    ...overrides,
  };
}

function memoryStore(): WorkbenchSchedulerStore & { runs: SchedulerRunRecord[]; lease: SchedulerLease | null } {
  const runs: SchedulerRunRecord[] = [];
  let lease: SchedulerLease | null = null;
  const databaseNow = () => new Date('2026-08-20T01:00:00.000Z');
  const store: WorkbenchSchedulerStore & { runs: SchedulerRunRecord[]; lease: SchedulerLease | null } = {
    runs,
    get lease() { return lease; },
    set lease(value) { lease = value; },
    async acquireLease(input) {
      const current = databaseNow();
      if (lease && lease.expiresAt > current) return null;
      lease = {
        leaseKey: input.leaseKey,
        ownerToken: input.ownerToken,
        leaseEpoch: (lease?.leaseEpoch || 0) + 1,
        expiresAt: new Date(current.getTime() + input.leaseMs),
      };
      return { ...lease };
    },
    async renewLease(input) {
      if (!lease
        || lease.leaseKey !== input.leaseKey
        || lease.ownerToken !== input.ownerToken
        || lease.leaseEpoch !== input.leaseEpoch
        || lease.expiresAt <= databaseNow()) return null;
      lease.expiresAt = new Date(databaseNow().getTime() + input.leaseMs);
      return { ...lease };
    },
    async validateLease(input) {
      if (!lease
        || lease.leaseKey !== input.leaseKey
        || lease.ownerToken !== input.ownerToken
        || lease.leaseEpoch !== input.leaseEpoch
        || lease.expiresAt <= databaseNow()) return null;
      return { ...lease };
    },
    async beginRun(input) {
      if (!lease
        || lease.ownerToken !== input.ownerToken
        || lease.leaseEpoch !== input.leaseEpoch
        || lease.expiresAt <= databaseNow()) return null;
      runs.filter((run) => run.status === 'RUNNING' && run.leaseEpoch < input.leaseEpoch)
        .forEach((run) => Object.assign(run, {
          status: 'ABANDONED', finishedAt: input.startedAt,
          failureSummary: [{ code: 'LEASE_EXPIRED' }],
        }));
      const run: SchedulerRunRecord = {
        ...input,
        status: 'RUNNING',
        finishedAt: null,
        successCount: 0,
        skippedCount: 0,
        failedCount: 0,
        failureSummary: [],
        cursors: input.cursors ? structuredClone(input.cursors) : null,
      };
      runs.push(run);
      return { ...run };
    },
    async finishRun(input: SchedulerRunCompletion) {
      const run = runs.find((item) => item.id === input.runId);
      if (!run || run.status !== 'RUNNING' || !lease
        || lease.ownerToken !== input.ownerToken
        || lease.leaseEpoch !== input.leaseEpoch
        || lease.expiresAt <= databaseNow()) return false;
      const { cursorUpdate, ...completion } = input;
      Object.assign(run, completion, { status: input.status });
      if (cursorUpdate.mode === 'SET') run.cursors = structuredClone(cursorUpdate.cursors);
      if (cursorUpdate.mode === 'CLEAR') run.cursors = null;
      return true;
    },
    async checkpointRun(input) {
      const run = runs.find((item) => item.id === input.runId);
      if (!run || run.status !== 'RUNNING' || !lease
        || lease.ownerToken !== input.ownerToken
        || lease.leaseEpoch !== input.leaseEpoch
        || lease.expiresAt <= databaseNow()) return false;
      run.cursors = input.cursors ? structuredClone(input.cursors) : null;
      return true;
    },
    async releaseLease(input) {
      if (!lease
        || lease.ownerToken !== input.ownerToken
        || lease.leaseEpoch !== input.leaseEpoch) return false;
      lease = { ...lease, ownerToken: null, expiresAt: databaseNow() };
      return true;
    },
    async loadLatestCursors(leaseKey, jobType) {
      const latest = [...runs].reverse().find((run) => (
        run.leaseKey === leaseKey
        &&
        run.jobType === jobType
        && (jobType === 'REMINDER_SCAN'
          ? ['RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'ABANDONED'].includes(run.status)
          : ['SUCCEEDED', 'PARTIAL'].includes(run.status))
      ));
      return latest?.cursors ? { ...latest.cursors } : undefined;
    },
  };
  return store;
}

function schedulerWith(store: WorkbenchSchedulerStore, overrides: Record<string, unknown> = {}) {
  return createWorkbenchScheduler({
    store,
    workerId: 'worker-a',
    now: () => new Date('2026-08-20T01:00:00.000Z'),
    generateDailyTasks: async () => ({ candidateCount: 0, createdCount: 0, skippedCount: 0 }),
    reconcile: async () => emptyReconcile(),
    scanReminders: async () => ({ scanned: 0, notified: 0, skipped: 0, failed: 0 }),
    ...overrides,
  });
}

test('two scheduler workers cannot overlap through the shared lease', async () => {
  const store = memoryStore();
  let releaseFirst!: () => void;
  const firstBlocked = new Promise<void>((resolve) => { releaseFirst = resolve; });
  let calls = 0;
  const first = schedulerWith(store, {
    workerId: 'worker-a',
    generateDailyTasks: async () => { calls += 1; await firstBlocked; return { candidateCount: 1, createdCount: 1, skippedCount: 0 }; },
  });
  const second = schedulerWith(store, {
    workerId: 'worker-b',
    generateDailyTasks: async () => { calls += 1; return { candidateCount: 1, createdCount: 1, skippedCount: 0 }; },
  });

  const firstRun = first.runDailyGeneration('2026-08-20');
  await new Promise((resolve) => setImmediate(resolve));
  const secondResult = await second.runDailyGeneration('2026-08-20');
  releaseFirst();
  const firstResult = await firstRun;

  assert.equal(calls, 1);
  assert.equal(firstResult.status, 'SUCCEEDED');
  assert.equal(secondResult.status, 'SKIPPED');
  assert.equal(secondResult.reason, 'LEASE_HELD');
});

test('one worker does not overlap different scheduler jobs locally', async () => {
  const store = memoryStore();
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const scheduler = schedulerWith(store, {
    generateDailyTasks: async () => { await blocked; return { candidateCount: 1, createdCount: 1, skippedCount: 0 }; },
  });
  const daily = scheduler.runDailyGeneration('2026-08-20');
  await new Promise((resolve) => setImmediate(resolve));
  const reconciliation = await scheduler.runReconciliation();
  release();
  await daily;
  assert.equal(reconciliation.status, 'SKIPPED');
  assert.equal(reconciliation.reason, 'LOCAL_RUN_ACTIVE');
});

test('failed runs notify only after durable finalization and notification failure does not recurse', async () => {
  const store = memoryStore();
  let callbackCount = 0;
  let errorCount = 0;
  const scheduler = schedulerWith(store, {
    scanReminders: async () => { throw new Error('reminder scan failed'); },
    onRunFailed: async ({ runId }: { runId: string }) => {
      callbackCount += 1;
      assert.equal(store.runs.find((run) => run.id === runId)?.status, 'FAILED');
      throw new Error('notification infrastructure failed');
    },
    onError: () => { errorCount += 1; },
  });

  const result = await scheduler.runReminderScan();

  assert.equal(result.status, 'FAILED');
  assert.equal(callbackCount, 1);
  assert.equal(errorCount, 2, '作业失败和通知失败各上报一次，不得递归发通知');
});

test('startup compensation runs once and repeated generation reports database duplicates as skipped', async () => {
  const store = memoryStore();
  const createdKeys = new Set<string>();
  const generatedDates: string[] = [];
  const scheduler = schedulerWith(store, {
    now: () => new Date('2026-08-20T18:30:00.000Z'),
    generateDailyTasks: async ({ date }: { date: string }) => {
      generatedDates.push(date);
      const key = `template:t-1:user-1:${date}`;
      const createdCount = createdKeys.has(key) ? 0 : 1;
      createdKeys.add(key);
      return { candidateCount: 1, createdCount, skippedCount: 1 - createdCount };
    },
  });

  scheduler.start();
  scheduler.start();
  await new Promise((resolve) => setImmediate(resolve));
  const repeated = await scheduler.runDailyGeneration('2026-08-21');
  await scheduler.stop();

  assert.deepEqual(generatedDates, ['2026-08-21', '2026-08-21']);
  assert.deepEqual(createdKeys, new Set(['template:t-1:user-1:2026-08-21']));
  assert.equal(repeated.succeeded, 0);
  assert.equal(repeated.skipped, 1);
});

test('startup compensation retries soon when another process temporarily owns the lease', async () => {
  type FakeTimer = { ms: number; callback: () => void; cleared: boolean; unref(): void };
  const timers: FakeTimer[] = [];
  const make = (callback: () => void, ms: number) => {
    const timer: FakeTimer = { ms, callback, cleared: false, unref() {} };
    timers.push(timer);
    return timer;
  };
  const store = memoryStore();
  store.lease = {
    leaseKey: 'workbench:scheduler', ownerToken: 'other-worker', leaseEpoch: 7,
    expiresAt: new Date('2026-08-20T01:10:00.000Z'),
  };
  const scheduler = schedulerWith(store, {
    timers: {
      setTimeout: make,
      clearTimeout: (timer: FakeTimer) => { timer.cleared = true; },
      setInterval: make,
      clearInterval: (timer: FakeTimer) => { timer.cleared = true; },
    },
  });

  scheduler.start();
  await new Promise((resolve) => setImmediate(resolve));

  assert.ok(
    timers.some((timer) => !timer.cleared && timer.ms === 60_000),
    'a busy database lease must retry today instead of deferring compensation until tomorrow',
  );
  await scheduler.stop();
});

test('reconciliation isolates an adapter failure and durably continues each module cursor', async () => {
  const store = memoryStore();
  const taskSync = createTaskSyncService({ repository: {} as any });
  const observed: Record<string, Array<string | undefined>> = { CRM: [], FINANCE: [] };
  let crmRound = 0;
  const adapters: WorkbenchSourceAdapter[] = [
    {
      module: 'CRM',
      async reconcile(context) {
        observed.CRM.push(context.cursor);
        crmRound += 1;
        if (crmRound === 2) throw new Error('mysql://root:secret@internal/crm');
        return emptyReconcile({ created: 1, nextCursors: { CRM: 'crm-page-2' } });
      },
      async resolveTask() { return null; },
    },
    {
      module: 'FINANCE',
      async reconcile(context) {
        observed.FINANCE.push(context.cursor);
        return emptyReconcile({ updated: 1, nextCursors: { FINANCE: context.cursor ? 'finance-page-3' : 'finance-page-2' } });
      },
      async resolveTask() { return null; },
    },
  ];
  const create = (workerId: string) => schedulerWith(store, {
    workerId,
    reconcile: (context: any) => taskSync.reconcileAdapters(adapters, context),
  });

  assert.equal((await create('worker-a').runReconciliation()).status, 'SUCCEEDED');
  const second = await create('worker-b').runReconciliation();

  assert.equal(second.status, 'PARTIAL');
  assert.equal(second.succeeded, 1);
  assert.equal(second.failed, 1);
  assert.deepEqual(observed, {
    CRM: [undefined, 'crm-page-2'],
    FINANCE: [undefined, 'finance-page-2'],
  });
  const latestRun = store.runs[store.runs.length - 1];
  assert.deepEqual(latestRun?.cursors, {
    CRM: 'crm-page-2',
    FINANCE: 'finance-page-3',
  }, 'failed modules retain their last durable cursor while successful modules advance');
  assert.equal(JSON.stringify(latestRun?.failureSummary).includes('secret'), false);
});

test('reconciliation clears an exhausted module cursor before the next scheduler run', async () => {
  const store = memoryStore();
  const observed: Array<string | undefined> = [];
  let round = 0;
  const create = (workerId: string) => schedulerWith(store, {
    workerId,
    reconcile: async ({ cursors }: any) => {
      observed.push(cursors?.CRM);
      round += 1;
      return emptyReconcile({
        updated: 1,
        ...(round === 1 ? { nextCursors: { CRM: 'crm-page-2' } } : {}),
      });
    },
  });

  assert.equal((await create('worker-cursor-1').runReconciliation()).status, 'SUCCEEDED');
  assert.equal((await create('worker-cursor-2').runReconciliation()).status, 'SUCCEEDED');
  assert.equal((await create('worker-cursor-3').runReconciliation()).status, 'SUCCEEDED');

  assert.deepEqual(observed, [undefined, 'crm-page-2', undefined]);
  assert.deepEqual(store.runs.map((run) => run.cursors), [
    { CRM: 'crm-page-2' },
    null,
    null,
  ]);
});

test('a failed reconciliation module preserves its prior cursor instead of accepting a next cursor', async () => {
  const store = memoryStore();
  let round = 0;
  const scheduler = schedulerWith(store, {
    reconcile: async () => {
      round += 1;
      return round === 1
        ? emptyReconcile({ updated: 1, nextCursors: { CRM: 'crm-page-2' } })
        : emptyReconcile({
          failed: 1,
          errors: [{ module: 'CRM', message: 'adapter failed after emitting an unsafe cursor' }],
          nextCursors: { CRM: 'crm-page-3' },
        });
    },
  });

  assert.equal((await scheduler.runReconciliation()).status, 'SUCCEEDED');
  assert.equal((await scheduler.runReconciliation()).status, 'FAILED');
  assert.deepEqual(store.runs[1]?.cursors, { CRM: 'crm-page-2' });
});

test('invalid reconciliation cursors fail their modules and retain the prior durable cursor', async () => {
  const store = memoryStore();
  const scheduler = schedulerWith(store, {
    reconcile: async ({ cursors }: any) => emptyReconcile({
      updated: 2,
      nextCursors: cursors
        ? { CRM: 'x'.repeat(501), FINANCE: 'finance\u0000cursor' }
        : { CRM: 'crm-safe', FINANCE: 'finance-safe' },
    }),
  });

  assert.equal((await scheduler.runReconciliation()).status, 'SUCCEEDED');
  const invalid = await scheduler.runReconciliation();

  assert.equal(invalid.status, 'PARTIAL');
  assert.equal(invalid.failed, 2);
  assert.deepEqual(store.runs[store.runs.length - 1]?.cursors, { CRM: 'crm-safe', FINANCE: 'finance-safe' });
  assert.deepEqual(store.runs[store.runs.length - 1]?.failureSummary, [
    { code: 'ADAPTER_FAILED', module: 'CRM' },
    { code: 'ADAPTER_FAILED', module: 'FINANCE' },
  ]);
});

test('reconciliation failure summaries are safe, deduplicated per module, and bounded', async () => {
  const store = memoryStore();
  const repeated = Array.from({ length: 1_000 }, () => ({
    module: 'CRM' as const,
    code: 'SECRET',
    message: 'mysql://root:secret@internal/crm',
  }));
  const scheduler = schedulerWith(store, {
    reconcile: async () => emptyReconcile({ failed: repeated.length, errors: repeated }),
  });

  await scheduler.runReconciliation();

  assert.deepEqual(store.runs[0]?.failureSummary, [{ code: 'ADAPTER_FAILED', module: 'CRM' }]);
  assert.ok(JSON.stringify(store.runs[0]?.failureSummary).length < 256);
});

test('reconciliation stops scanning errors after every bounded summary bucket is filled', async () => {
  const store = memoryStore();
  const modules = ['GENERAL', 'CRM', 'ORDER', 'DELIVERY', 'AFTER_SALES', 'FINANCE', 'MARKETING', 'ACADEMY', 'OKR'];
  const errors: any[] = [
    ...modules.map((module) => ({ module, code: 'FAILED', message: 'safe' })),
    { module: 'UNKNOWN_MODULE', code: 'FAILED', message: 'safe' },
  ];
  errors.push(Object.defineProperty({ code: 'TAIL', message: 'must not be read' }, 'module', {
    get() { throw new Error('UNBOUNDED_ERROR_SCAN'); },
  }));
  const scheduler = schedulerWith(store, {
    reconcile: async () => emptyReconcile({ failed: 10, errors }),
  });

  await scheduler.runReconciliation();

  assert.equal(store.runs[0]?.failureSummary.length, 10);
  assert.ok(store.runs[0]?.failureSummary.every((summary) => summary.code === 'ADAPTER_FAILED'));
});

test('durable run counters are capped to the MySQL INTEGER range', async () => {
  const store = memoryStore();
  const scheduler = schedulerWith(store, {
    reconcile: async () => emptyReconcile({
      created: Number.MAX_SAFE_INTEGER,
      updated: Number.MAX_SAFE_INTEGER,
      canceled: Number.MAX_SAFE_INTEGER,
      unchanged: Number.MAX_SAFE_INTEGER,
      failed: Number.MAX_SAFE_INTEGER,
    }),
  });

  await scheduler.runReconciliation();
  const run = store.runs[0];
  assert.ok(run);
  for (const count of [run.successCount, run.skippedCount, run.failedCount]) {
    assert.ok(count <= 2_147_483_647, 'Prisma Int columns must never receive an out-of-range count');
  }
});

test('Shanghai date and next-midnight delay stay correct at the UTC day boundary', () => {
  assert.equal(shanghaiBusinessDate(new Date('2026-08-20T15:59:30.000Z')), '2026-08-20');
  assert.equal(millisecondsUntilNextShanghaiMidnight(new Date('2026-08-20T15:59:30.000Z')), 30_000);
  assert.equal(shanghaiBusinessDate(new Date('2026-08-20T16:00:00.000Z')), '2026-08-21');
  assert.equal(millisecondsUntilNextShanghaiMidnight(new Date('2026-08-20T16:00:00.000Z')), 24 * 60 * 60 * 1_000);
});

test('start schedules unref timers and stop clears every schedule without waiting forever', async () => {
  type FakeTimer = { kind: 'timeout' | 'interval'; ms: number; cleared: boolean; unrefCalls: number; unref(): void };
  const timers: FakeTimer[] = [];
  const make = (kind: FakeTimer['kind'], ms: number) => {
    const timer: FakeTimer = { kind, ms, cleared: false, unrefCalls: 0, unref() { this.unrefCalls += 1; } };
    timers.push(timer);
    return timer;
  };
  const scheduler = schedulerWith(memoryStore(), {
    now: () => new Date('2026-08-20T15:59:30.000Z'),
    timers: {
      setTimeout: (_callback: () => void, ms: number) => make('timeout', ms),
      clearTimeout: (timer: FakeTimer) => { timer.cleared = true; },
      setInterval: (_callback: () => void, ms: number) => make('interval', ms),
      clearInterval: (timer: FakeTimer) => { timer.cleared = true; },
    },
  });

  scheduler.start();
  await new Promise((resolve) => setImmediate(resolve));
  await scheduler.stop();

  const scheduled = [30_000, 5 * 60_000, 15 * 60_000].map((ms) => {
    const timer = timers.find((candidate) => candidate.ms === ms);
    assert.ok(timer, `expected a ${ms}ms schedule`);
    return timer;
  });
  assert.ok(scheduled.every((timer) => timer.unrefCalls === 1));
  assert.ok(scheduled.every((timer) => timer.cleared));
});

test('disabled jobs create neither schedules nor false-green run history', async () => {
  type FakeTimer = { kind: 'timeout' | 'interval'; ms: number; unref(): void };
  const timers: FakeTimer[] = [];
  const make = (kind: FakeTimer['kind']) => (_callback: () => void, ms: number): FakeTimer => {
    const timer = { kind, ms, unref() {} };
    timers.push(timer);
    return timer;
  };
  const store = memoryStore();
  const scheduler = createWorkbenchScheduler({
    store,
    now: () => new Date('2026-08-20T01:00:00.000Z'),
    generateDailyTasks: async () => ({ candidateCount: 0, createdCount: 0, skippedCount: 0 }),
    timers: {
      setTimeout: make('timeout'),
      clearTimeout: () => undefined,
      setInterval: make('interval'),
      clearInterval: () => undefined,
    },
  });

  assert.deepEqual(await scheduler.runReconciliation(), {
    status: 'SKIPPED', runId: null, succeeded: 0, skipped: 1, failed: 0, reason: 'JOB_DISABLED',
  });
  assert.deepEqual(await scheduler.runReminderScan(), {
    status: 'SKIPPED', runId: null, succeeded: 0, skipped: 1, failed: 0, reason: 'JOB_DISABLED',
  });
  assert.equal(store.runs.length, 0);
  scheduler.start();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(timers.some((timer) => timer.kind === 'interval' && (timer.ms === 5 * 60_000 || timer.ms === 15 * 60_000)), false);
  await scheduler.stop();
});

test('stop immediately clears lease-renewal timers even when the active job ignores abort', async () => {
  type FakeTimer = { cleared: boolean; unref(): void };
  const timers: FakeTimer[] = [];
  const make = () => {
    const timer: FakeTimer = { cleared: false, unref() {} };
    timers.push(timer);
    return timer;
  };
  const never = new Promise<never>(() => undefined);
  const scheduler = schedulerWith(memoryStore(), {
    stopTimeoutMs: 10,
    generateDailyTasks: async () => never,
    timers: {
      setTimeout: () => make(),
      clearTimeout: (timer: FakeTimer) => { timer.cleared = true; },
      setInterval: () => make(),
      clearInterval: (timer: FakeTimer) => { timer.cleared = true; },
    },
  });

  const originalSetTimeout = globalThis.setTimeout;
  let shutdownWaitTimer: ReturnType<typeof setTimeout> | undefined;
  globalThis.setTimeout = ((callback: (...args: any[]) => void, ms?: number, ...args: any[]) => {
    const timer = originalSetTimeout(callback, ms, ...args);
    if (ms === 10) shutdownWaitTimer = timer;
    return timer;
  }) as typeof setTimeout;
  let startedAt = 0;
  try {
    scheduler.start();
    await new Promise((resolve) => setImmediate(resolve));
    startedAt = Date.now();
    await scheduler.stop();
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }

  assert.ok(Date.now() - startedAt < 500, 'shutdown wait must stay bounded');
  assert.ok(timers.length >= 5, 'schedules plus active lease timers must be installed');
  assert.ok(timers.every((timer) => timer.cleared), 'shutdown must stop lease renewal even if work hangs');
  assert.equal(shutdownWaitTimer?.hasRef(), false, 'shutdown fallback timer must not keep Node alive');
});

test('a renewal error during fenced generation is revalidated after the transaction boundary', async () => {
  type FakeTimer = { kind: 'timeout' | 'interval'; callback: () => void; cleared: boolean; unref(): void };
  const timers: FakeTimer[] = [];
  const make = (kind: FakeTimer['kind']) => (callback: () => void) => {
    const timer: FakeTimer = { kind, callback, cleared: false, unref() {} };
    timers.push(timer);
    return timer;
  };
  const store = memoryStore();
  let validations = 0;
  store.renewLease = async () => { throw new Error('TRANSIENT_LOCK_WAIT'); };
  (store as any).validateLease = async () => { validations += 1; return store.lease ? { ...store.lease } : null; };
  let releaseWork!: () => void;
  const workBoundary = new Promise<void>((resolve) => { releaseWork = resolve; });
  let signalAtBoundary = true;
  const scheduler = schedulerWith(store, {
    leaseMs: 1_000,
    renewalIntervalMs: 250,
    generateDailyTasks: async ({ signal }: { signal: AbortSignal }) => {
      await workBoundary;
      signalAtBoundary = signal.aborted;
      return { candidateCount: 1, createdCount: 1, skippedCount: 0 };
    },
    timers: {
      setTimeout: make('timeout'),
      clearTimeout: (timer: FakeTimer) => { timer.cleared = true; },
      setInterval: make('interval'),
      clearInterval: (timer: FakeTimer) => { timer.cleared = true; },
    },
  });

  const running = scheduler.runDailyGeneration('2026-08-20');
  await new Promise((resolve) => setImmediate(resolve));
  timers.find((timer) => timer.kind === 'interval' && !timer.cleared)?.callback();
  await new Promise((resolve) => setImmediate(resolve));
  releaseWork();
  const result = await running;

  assert.equal(signalAtBoundary, false, 'an unconfirmed lock wait must not abort fenced work');
  assert.equal(validations, 1);
  assert.equal(result.status, 'SUCCEEDED');
});

test('reconciliation aborts before a later mutation when renewal and DB-time validation both throw', async () => {
  type FakeTimer = { kind: 'timeout' | 'interval'; callback: () => void; cleared: boolean; unref(): void };
  const timers: FakeTimer[] = [];
  const make = (kind: FakeTimer['kind']) => (callback: () => void) => {
    const timer: FakeTimer = { kind, callback, cleared: false, unref() {} };
    timers.push(timer);
    return timer;
  };
  const store = memoryStore();
  let validations = 0;
  store.renewLease = async () => { throw new Error('RENEWAL_UNAVAILABLE'); };
  store.validateLease = async () => {
    validations += 1;
    throw new Error('VALIDATION_UNAVAILABLE');
  };
  let releaseMutationBoundary!: () => void;
  const mutationBoundary = new Promise<void>((resolve) => { releaseMutationBoundary = resolve; });
  let mutations = 0;
  let observedSignal: AbortSignal | undefined;
  const scheduler = schedulerWith(store, {
    leaseMs: 1_000,
    renewalIntervalMs: 250,
    reconcile: async ({ signal }: { signal: AbortSignal }) => {
      observedSignal = signal;
      await mutationBoundary;
      if (signal.aborted) throw signal.reason;
      mutations += 1;
      return emptyReconcile({ scanned: 1, created: 1 });
    },
    timers: {
      setTimeout: make('timeout'),
      clearTimeout: (timer: FakeTimer) => { timer.cleared = true; },
      setInterval: make('interval'),
      clearInterval: (timer: FakeTimer) => { timer.cleared = true; },
    },
  });

  const running = scheduler.runReconciliation();
  await new Promise((resolve) => setImmediate(resolve));
  timers.find((timer) => timer.kind === 'interval' && !timer.cleared)?.callback();
  await new Promise((resolve) => setImmediate(resolve));
  releaseMutationBoundary();
  const result = await running;

  assert.equal(validations, 1);
  assert.equal(observedSignal?.aborted, true);
  assert.equal(mutations, 0, 'an uncertain non-generation lease must stop later task mutations');
  assert.equal(result.status, 'FAILED');
});

test('reminder scan aborts before a later send when renewal and DB-time validation both throw', async () => {
  type FakeTimer = { kind: 'timeout' | 'interval'; callback: () => void; cleared: boolean; unref(): void };
  const timers: FakeTimer[] = [];
  const make = (kind: FakeTimer['kind']) => (callback: () => void) => {
    const timer: FakeTimer = { kind, callback, cleared: false, unref() {} };
    timers.push(timer);
    return timer;
  };
  const store = memoryStore();
  let validations = 0;
  store.renewLease = async () => { throw new Error('RENEWAL_UNAVAILABLE'); };
  store.validateLease = async () => {
    validations += 1;
    throw new Error('VALIDATION_UNAVAILABLE');
  };
  let releaseSendBoundary!: () => void;
  const sendBoundary = new Promise<void>((resolve) => { releaseSendBoundary = resolve; });
  let sends = 0;
  let observedSignal: AbortSignal | undefined;
  const scheduler = schedulerWith(store, {
    leaseMs: 1_000,
    renewalIntervalMs: 250,
    scanReminders: async ({ signal }: { signal: AbortSignal }) => {
      observedSignal = signal;
      await sendBoundary;
      if (signal.aborted) throw signal.reason;
      sends += 1;
      return { scanned: 1, notified: 1, skipped: 0, failed: 0 };
    },
    timers: {
      setTimeout: make('timeout'),
      clearTimeout: (timer: FakeTimer) => { timer.cleared = true; },
      setInterval: make('interval'),
      clearInterval: (timer: FakeTimer) => { timer.cleared = true; },
    },
  });

  const running = scheduler.runReminderScan();
  await new Promise((resolve) => setImmediate(resolve));
  timers.find((timer) => timer.kind === 'interval' && !timer.cleared)?.callback();
  await new Promise((resolve) => setImmediate(resolve));
  releaseSendBoundary();
  const result = await running;

  assert.equal(validations, 1);
  assert.equal(observedSignal?.aborted, true);
  assert.equal(sends, 0, 'an uncertain non-generation lease must stop later notification sends');
  assert.equal(result.status, 'FAILED');
});

test('a hard-aborted reminder run resumes after 1000 unprocessable rows and reaches the valid task', async () => {
  type FakeTimer = { kind: 'timeout' | 'interval'; callback: () => void; cleared: boolean; unref(): void };
  const timers: FakeTimer[] = [];
  const make = (kind: FakeTimer['kind']) => (callback: () => void) => {
    const timer: FakeTimer = { kind, callback, cleared: false, unref() {} };
    timers.push(timer);
    return timer;
  };
  const dueAt = '2026-08-21T01:00:00.000Z';
  const rows = Array.from({ length: 1_002 }, (_, index) => ({
    id: `scheduler-resume-${String(index + 1).padStart(4, '0')}`,
    employeeId: index === 1_001 ? 'employee-valid' : `inactive-${index + 1}`,
    employeeName: `employee-${index + 1}`,
    departmentIdSnapshot: 'dept-sales', departmentNameSnapshot: '销售部',
    workDate: '2026-08-21', dueAt, sourceVersion: 'v1', status: 'PENDING',
    remindedAt: null, lastOverdueNotifiedAt: null,
  }));
  let firstRun = true;
  let recipientReads = 0;
  const secondRunTaskReads: string[] = [];
  const prisma: any = {
    employeeTask: {
      findMany: async ({ where, take }: any) => {
        const cursorClause = (where.AND || []).flatMap((clause: any) => clause.OR || [])
          .find((clause: any) => clause.id?.gt);
        const afterId = cursorClause?.id?.gt || '';
        return rows.filter((row) => row.id > afterId && row.remindedAt == null).slice(0, take);
      },
      findUnique: async ({ where }: any) => {
        if (!firstRun) secondRunTaskReads.push(where.id);
        return rows.find((row) => row.id === where.id) || null;
      },
      updateMany: async ({ where, data }: any) => {
        const row = rows.find((item) => item.id === where.id);
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
    user: { findUnique: async ({ where }: any) => {
      recipientReads += 1;
      if (firstRun && recipientReads === 1_000) {
        timers.find((timer) => timer.kind === 'timeout' && !timer.cleared)?.callback();
      }
      const active = where.id === 'employee-valid';
      return { id: where.id, name: where.id, isActive: active, employmentStatus: active ? 'active' : 'left' };
    } },
    $queryRawUnsafe: async () => [],
  };
  prisma.$transaction = async (work: (tx: any) => Promise<unknown>) => work(prisma);
  const notificationService = createWorkbenchNotificationService({
    prisma,
    workflow: { publishWorkbench: async () => ({ accepted: true, created: true }) },
  });
  const store = memoryStore();
  const create = (workerId: string) => schedulerWith(store, {
    workerId,
    now: () => new Date('2026-08-21T00:30:00.000Z'),
    scanReminders: (input: any) => notificationService.scanReminders(input),
    timers: {
      setTimeout: make('timeout'),
      clearTimeout: (timer: FakeTimer) => { timer.cleared = true; },
      setInterval: make('interval'),
      clearInterval: (timer: FakeTimer) => { timer.cleared = true; },
    },
  });

  const aborted = await create('worker-aborted').runReminderScan();
  assert.equal(aborted.status, 'FAILED');
  assert.deepEqual(store.runs[0]?.cursors, {
    REMINDER_SCAN: { dueAt, id: 'scheduler-resume-1000' },
  });

  firstRun = false;
  const resumed = await create('worker-resumed').runReminderScan();

  assert.equal(resumed.status, 'SUCCEEDED');
  assert.equal(resumed.succeeded, 1);
  assert.deepEqual(secondRunTaskReads, ['scheduler-resume-1001', 'scheduler-resume-1002']);
  assert.equal(store.runs[1]?.cursors, null, 'the successful end-of-scan checkpoint must wrap');

  secondRunTaskReads.length = 0;
  const wrapped = await create('worker-wrapped').runReminderScan();
  assert.equal(wrapped.status, 'SUCCEEDED');
  assert.equal(secondRunTaskReads[0], 'scheduler-resume-0001', 'the run after wrap must restart at the first page');
});

test('a genuinely lost owner is rejected by DB-time validation before run finalization', async () => {
  type FakeTimer = { kind: 'timeout' | 'interval'; callback: () => void; cleared: boolean; unref(): void };
  const timers: FakeTimer[] = [];
  const make = (kind: FakeTimer['kind']) => (callback: () => void) => {
    const timer: FakeTimer = { kind, callback, cleared: false, unref() {} };
    timers.push(timer);
    return timer;
  };
  const store = memoryStore();
  let validations = 0;
  store.renewLease = async () => {
    store.lease = {
      leaseKey: 'workbench:scheduler', ownerToken: 'replacement', leaseEpoch: 2,
      expiresAt: new Date('2026-08-20T02:00:00.000Z'),
    };
    return null;
  };
  (store as any).validateLease = async () => { validations += 1; return null; };
  let releaseWork!: () => void;
  const workBoundary = new Promise<void>((resolve) => { releaseWork = resolve; });
  const scheduler = schedulerWith(store, {
    leaseMs: 1_000,
    renewalIntervalMs: 250,
    generateDailyTasks: async () => {
      await workBoundary;
      return { candidateCount: 1, createdCount: 1, skippedCount: 0 };
    },
    timers: {
      setTimeout: make('timeout'),
      clearTimeout: (timer: FakeTimer) => { timer.cleared = true; },
      setInterval: make('interval'),
      clearInterval: (timer: FakeTimer) => { timer.cleared = true; },
    },
  });

  const running = scheduler.runDailyGeneration('2026-08-20');
  await new Promise((resolve) => setImmediate(resolve));
  timers.find((timer) => timer.kind === 'interval' && !timer.cleared)?.callback();
  await new Promise((resolve) => setImmediate(resolve));
  releaseWork();
  const result = await running;

  assert.equal(validations, 1);
  assert.equal(result.status, 'SKIPPED');
  assert.equal(result.reason, 'LEASE_LOST');
});

test('Prisma store uses lease epoch fencing so an expired owner cannot renew or finalize a newer run', async () => {
  const leases = new Map<string, any>();
  const runs = new Map<string, any>();
  let databaseNow = new Date(0);
  const matches = (row: any, where: any): boolean => Object.entries(where || {}).every(([key, value]: any) => {
    if (key === 'OR') return value.some((part: any) => matches(row, part));
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if ('lte' in value) return row[key] <= value.lte;
      if ('lt' in value) return row[key] < value.lt;
      if ('gt' in value) return row[key] > value.gt;
      if ('in' in value) return value.in.includes(row[key]);
      if ('increment' in value) return true;
    }
    return row[key] === value;
  });
  const leaseModel = {
    createMany: async ({ data }: any) => {
      if (leases.has(data.leaseKey)) return { count: 0 };
      leases.set(data.leaseKey, { ...data });
      return { count: 1 };
    },
    updateMany: async ({ where, data }: any) => {
      const selected = [...leases.values()].filter((row) => matches(row, where));
      selected.forEach((row) => Object.entries(data).forEach(([key, value]: any) => {
        row[key] = value?.increment === undefined ? value : row[key] + value.increment;
      }));
      return { count: selected.length };
    },
    findFirst: async ({ where }: any) => [...leases.values()].find((row) => matches(row, where)) || null,
  };
  const runModel = {
    create: async ({ data }: any) => { runs.set(data.id, { ...data }); return { ...data }; },
    updateMany: async ({ where, data }: any) => {
      const selected = [...runs.values()].filter((row) => matches(row, where));
      selected.forEach((row) => Object.assign(row, data));
      return { count: selected.length };
    },
    findFirst: async ({ where, orderBy }: any) => {
      const selected = [...runs.values()].filter((row) => matches(row, where));
      if (orderBy) selected.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
      return selected[0] || null;
    },
  };
  const prisma: any = { workbenchSchedulerLease: leaseModel, workbenchSchedulerRun: runModel };
  prisma.$transaction = async (work: any) => work(prisma);
  prisma.$executeRawUnsafe = async (sql: string, ...values: any[]) => {
    if (sql.startsWith('INSERT IGNORE')) {
      if (!leases.has(values[0])) leases.set(values[0], { leaseKey: values[0], leaseEpoch: 0, ownerToken: null, expiresAt: databaseNow });
      return 1;
    }
    const lease = leases.get(sql.includes('`leaseKey` = ? AND `ownerToken`') ? values[1] : values[2]);
    if (!lease) return 0;
    if (sql.includes('`leaseEpoch` = `leaseEpoch` + 1')) {
      if (lease.expiresAt > databaseNow) return 0;
      Object.assign(lease, { ownerToken: values[0], leaseEpoch: lease.leaseEpoch + 1, expiresAt: new Date(databaseNow.getTime() + values[1] / 1_000) });
      return 1;
    }
    if (sql.includes('SET `expiresAt` = DATE_ADD')) {
      if (lease.ownerToken !== values[2] || lease.leaseEpoch !== values[3] || lease.expiresAt <= databaseNow) return 0;
      lease.expiresAt = new Date(databaseNow.getTime() + values[0] / 1_000);
      return 1;
    }
    if (lease.ownerToken !== values[1] || lease.leaseEpoch !== values[2] || lease.expiresAt <= databaseNow) return 0;
    lease.ownerToken = null;
    lease.expiresAt = databaseNow;
    return 1;
  };
  prisma.$queryRawUnsafe = async (sql: string, leaseKey: string, ownerToken: string, leaseEpoch?: number) => {
    const lease = leases.get(leaseKey);
    if (!lease || lease.ownerToken !== ownerToken || (leaseEpoch !== undefined && lease.leaseEpoch !== leaseEpoch)) return [];
    if (sql.includes('`expiresAt` > CURRENT_TIMESTAMP(3)') && lease.expiresAt <= databaseNow) return [];
    return [{ ...lease, databaseNow }];
  };
  const store = createPrismaSchedulerStore(prisma);
  const leaseA = await store.acquireLease({ leaseKey: 'workbench', ownerToken: 'owner-a', leaseMs: 1_000 });
  assert.ok(leaseA);
  const runA = await store.beginRun({
    id: 'run-a', leaseKey: 'workbench', ownerToken: 'owner-a', leaseEpoch: leaseA.leaseEpoch,
    jobType: 'RECONCILIATION', businessDate: null, startedAt: new Date(0),
  });
  assert.ok(runA);
  databaseNow = new Date(2_000);
  const leaseB = await store.acquireLease({ leaseKey: 'workbench', ownerToken: 'owner-b', leaseMs: 1_000 });
  assert.ok(leaseB);
  assert.equal(leaseB.leaseEpoch, leaseA.leaseEpoch + 1);
  await store.beginRun({
    id: 'run-b', leaseKey: 'workbench', ownerToken: 'owner-b', leaseEpoch: leaseB.leaseEpoch,
    jobType: 'RECONCILIATION', businessDate: null, startedAt: new Date(2_000),
  });

  databaseNow = new Date(2_100);
  assert.equal(await store.renewLease({ ...leaseA, leaseMs: 1_000 }), null);
  assert.equal(await store.finishRun({
    runId: runA.id, ownerToken: 'owner-a', leaseEpoch: leaseA.leaseEpoch,
    status: 'SUCCEEDED', finishedAt: new Date(2_100), successCount: 1, skippedCount: 0,
    failedCount: 0, failureSummary: [], cursorUpdate: { mode: 'SET', cursors: { CRM: 'stale' } },
  }), false);
  assert.equal(await store.checkpointRun({
    runId: runA.id, ownerToken: 'owner-a', leaseEpoch: leaseA.leaseEpoch,
    cursors: { REMINDER_SCAN: { dueAt: '2026-08-21T01:00:00.000Z', id: 'stale-task' } },
  }), false, 'a stale owner must not checkpoint reminder progress into an abandoned run');
  assert.equal(runs.get('run-a').cursors, undefined);
  assert.equal(runs.get('run-a').status, 'ABANDONED');
  assert.equal(runs.get('run-b').status, 'RUNNING');
});

test('an owner that loses its lease before beginRun cannot start stale business work', async () => {
  const leases = new Map<string, any>();
  const runs = new Map<string, any>();
  let databaseNow = new Date(0);
  const matches = (row: any, where: any): boolean => Object.entries(where || {}).every(([key, value]: any) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if ('lte' in value) return row[key] <= value.lte;
      if ('lt' in value) return row[key] < value.lt;
      if ('gt' in value) return row[key] > value.gt;
    }
    return row[key] === value;
  });
  const leaseModel = {
    createMany: async ({ data }: any) => {
      if (leases.has(data.leaseKey)) return { count: 0 };
      leases.set(data.leaseKey, { ...data });
      return { count: 1 };
    },
    updateMany: async ({ where, data }: any) => {
      const selected = [...leases.values()].filter((row) => matches(row, where));
      selected.forEach((row) => Object.entries(data).forEach(([key, value]: any) => {
        row[key] = value?.increment === undefined ? value : row[key] + value.increment;
      }));
      return { count: selected.length };
    },
    findFirst: async ({ where }: any) => [...leases.values()].find((row) => matches(row, where)) || null,
  };
  const runModel = {
    create: async ({ data }: any) => { runs.set(data.id, { ...data }); return { ...data }; },
    updateMany: async () => ({ count: 0 }),
    findFirst: async () => null,
  };
  const prisma: any = { workbenchSchedulerLease: leaseModel, workbenchSchedulerRun: runModel };
  prisma.$transaction = async (work: any) => work(prisma);
  prisma.$executeRawUnsafe = async (sql: string, ...values: any[]) => {
    if (sql.startsWith('INSERT IGNORE')) {
      if (!leases.has(values[0])) leases.set(values[0], { leaseKey: values[0], leaseEpoch: 0, ownerToken: null, expiresAt: databaseNow });
      return 1;
    }
    const lease = leases.get(values[2]);
    if (!lease || lease.expiresAt > databaseNow) return 0;
    Object.assign(lease, { ownerToken: values[0], leaseEpoch: lease.leaseEpoch + 1, expiresAt: new Date(databaseNow.getTime() + values[1] / 1_000) });
    return 1;
  };
  prisma.$queryRawUnsafe = async (sql: string, leaseKey: string, ownerToken: string, leaseEpoch?: number) => {
    const lease = leases.get(leaseKey);
    if (!lease || lease.ownerToken !== ownerToken || (leaseEpoch !== undefined && lease.leaseEpoch !== leaseEpoch)) return [];
    if (sql.includes('`expiresAt` > CURRENT_TIMESTAMP(3)') && lease.expiresAt <= databaseNow) return [];
    return [{ ...lease, databaseNow }];
  };
  const store = createPrismaSchedulerStore(prisma);
  const stale = await store.acquireLease({ leaseKey: 'workbench', ownerToken: 'owner-a', leaseMs: 1_000 });
  assert.ok(stale);
  databaseNow = new Date(2_000);
  const current = await store.acquireLease({ leaseKey: 'workbench', ownerToken: 'owner-b', leaseMs: 1_000 });
  assert.ok(current);

  const staleRun = await store.beginRun({
    id: 'run-stale', leaseKey: 'workbench', ownerToken: 'owner-a', leaseEpoch: stale.leaseEpoch,
    jobType: 'DAILY_GENERATION', businessDate: '2026-08-20', startedAt: new Date(2_100),
  });

  assert.equal(staleRun, null);
  assert.equal(runs.size, 0, 'a fenced owner must not reach business work or create a RUNNING record');
});

test('Prisma store uses DB-time SQL and locks the fenced lease before run mutations', async () => {
  const calls: string[] = [];
  const lease = {
    leaseKey: 'workbench', ownerToken: 'owner-a', leaseEpoch: 1,
    expiresAt: new Date('2099-01-01T00:00:00.000Z'), databaseNow: new Date('2026-08-20T01:00:00.000Z'),
  };
  const run = {
    id: 'run-a', ...lease, jobType: 'RECONCILIATION', businessDate: null, status: 'RUNNING',
    startedAt: lease.databaseNow, finishedAt: null, successCount: 0, skippedCount: 0,
    failedCount: 0, failureSummary: [], cursors: null,
  };
  const prisma: any = {
    async $executeRawUnsafe(sql: string) { calls.push(`execute:${sql}`); return 1; },
    async $queryRawUnsafe(sql: string) { calls.push(`query:${sql}`); return [{ ...lease }]; },
    workbenchSchedulerRun: {
      async findFirst() { calls.push('run:find'); return run; },
      async updateMany() { calls.push('run:update'); return { count: 1 }; },
      async create({ data }: any) { calls.push('run:create'); return { ...run, ...data }; },
    },
  };
  prisma.$transaction = async (work: any) => work(prisma);
  const store = createPrismaSchedulerStore(prisma);

  await store.acquireLease({ leaseKey: 'workbench', ownerToken: 'owner-a', leaseMs: 5_000 });
  await store.renewLease({ ...lease, leaseMs: 5_000 });
  calls.length = 0;
  const validated = await store.validateLease({
    leaseKey: 'workbench', ownerToken: 'owner-a', leaseEpoch: 1,
  });
  assert.equal(validated?.leaseEpoch, 1);
  assert.deepEqual(calls.map((item) => item.split(':')[0]), ['query']);
  assert.match(calls[0]!, /`ownerToken` = \?.*`leaseEpoch` = \?.*`expiresAt` > CURRENT_TIMESTAMP\(3\)/);
  assert.doesNotMatch(calls[0]!, /FOR UPDATE/);
  calls.length = 0;
  await store.beginRun({
    id: 'run-a', leaseKey: 'workbench', ownerToken: 'owner-a', leaseEpoch: 1,
    jobType: 'RECONCILIATION', businessDate: null, startedAt: new Date('1900-01-01T00:00:00.000Z'),
  });
  assert.deepEqual(calls.map((item) => item.split(':')[0]), ['query', 'run', 'run']);
  assert.match(calls[0]!, /CURRENT_TIMESTAMP\(3\).*FOR UPDATE/);
  calls.length = 0;
  await store.finishRun({
    runId: 'run-a', ownerToken: 'owner-a', leaseEpoch: 1, status: 'SUCCEEDED',
    finishedAt: new Date('2200-01-01T00:00:00.000Z'), successCount: 1, skippedCount: 0,
    failedCount: 0, failureSummary: [], cursorUpdate: { mode: 'SET', cursors: { CRM: 'safe' } },
  });
  assert.deepEqual(calls.map((item) => item.split(':')[0]), ['run', 'query', 'run']);
  assert.match(calls[1]!, /`ownerToken` = \?.*`leaseEpoch` = \?.*CURRENT_TIMESTAMP\(3\).*FOR UPDATE/);
  calls.length = 0;
  await store.checkpointRun({
    runId: 'run-a', ownerToken: 'owner-a', leaseEpoch: 1,
    cursors: { REMINDER_SCAN: { dueAt: '2026-08-21T01:00:00.000Z', id: 'task-0500' } },
  });
  assert.deepEqual(calls.map((item) => item.split(':')[0]), ['run', 'query', 'run']);
  assert.match(calls[1]!, /`ownerToken` = \?.*`leaseEpoch` = \?.*CURRENT_TIMESTAMP\(3\).*FOR UPDATE/);
  calls.length = 0;
  await store.releaseLease(lease);

  const source = await readFile(new URL('./prismaSchedulerStore.ts', import.meta.url), 'utf8');
  assert.match(source, /DATE_ADD\(CURRENT_TIMESTAMP\(3\), INTERVAL \? MICROSECOND\)/);
  assert.match(source, /`expiresAt` <= CURRENT_TIMESTAMP\(3\)/);
  assert.match(source, /`expiresAt` > CURRENT_TIMESTAMP\(3\)/);
  assert.doesNotMatch(source, /input\.now/);
  assert.match(calls[0]!, /SET `ownerToken` = NULL, `expiresAt` = CURRENT_TIMESTAMP\(3\)/);
});

test('Prisma store distinguishes cursor preservation, setting, and durable SQL NULL clearing', async () => {
  let updatedData: any;
  const lease = {
    leaseKey: 'workbench', ownerToken: 'owner-a', leaseEpoch: 1,
    expiresAt: new Date('2099-01-01T00:00:00.000Z'), databaseNow: new Date('2026-08-20T01:00:00.000Z'),
  };
  const run = {
    id: 'run-a', ...lease, jobType: 'RECONCILIATION', businessDate: null, status: 'RUNNING',
    startedAt: lease.databaseNow, finishedAt: null, successCount: 0, skippedCount: 0,
    failedCount: 0, failureSummary: [], cursors: { CRM: 'crm-page-2' },
  };
  const prisma: any = {
    async $queryRawUnsafe() { return [{ ...lease }]; },
    workbenchSchedulerRun: {
      async findFirst() { return run; },
      async updateMany({ data }: any) { updatedData = data; return { count: 1 }; },
    },
  };
  prisma.$transaction = async (work: any) => work(prisma);

  const finalized = await createPrismaSchedulerStore(prisma).finishRun({
    runId: run.id, ownerToken: lease.ownerToken, leaseEpoch: lease.leaseEpoch,
    status: 'SUCCEEDED', finishedAt: lease.databaseNow, successCount: 1, skippedCount: 0,
    failedCount: 0, failureSummary: [], cursorUpdate: { mode: 'CLEAR' },
  });

  assert.equal(finalized, true);
  assert.equal(updatedData.cursors, Prisma.DbNull);

  await createPrismaSchedulerStore(prisma).finishRun({
    runId: run.id, ownerToken: lease.ownerToken, leaseEpoch: lease.leaseEpoch,
    status: 'FAILED', finishedAt: lease.databaseNow, successCount: 0, skippedCount: 0,
    failedCount: 1, failureSummary: [{ code: 'JOB_FAILED' }], cursorUpdate: { mode: 'PRESERVE' },
  });
  assert.equal(Object.prototype.hasOwnProperty.call(updatedData, 'cursors'), false);

  await createPrismaSchedulerStore(prisma).finishRun({
    runId: run.id, ownerToken: lease.ownerToken, leaseEpoch: lease.leaseEpoch,
    status: 'SUCCEEDED', finishedAt: lease.databaseNow, successCount: 1, skippedCount: 0,
    failedCount: 0, failureSummary: [], cursorUpdate: { mode: 'SET', cursors: { CRM: 'crm-page-3' } },
  });
  assert.deepEqual(updatedData.cursors, { CRM: 'crm-page-3' });
});

test('latest cursor lookup is scoped and ordered by monotonic lease epoch despite clock rollback', async () => {
  let query: any;
  const rows = [
    { leaseKey: 'workbench', jobType: 'RECONCILIATION', status: 'SUCCEEDED', leaseEpoch: 4, startedAt: new Date('2030-01-01'), id: 'z', cursors: { CRM: 'old' } },
    {
      leaseKey: 'workbench', jobType: 'RECONCILIATION', status: 'PARTIAL', leaseEpoch: 5,
      startedAt: new Date('2020-01-01'), id: 'a',
      cursors: { CRM: 'new', FINANCE: 'bad\u0000cursor', ORDER: 'x'.repeat(501) },
    },
  ];
  const prisma: any = { workbenchSchedulerRun: {
    async findFirst(input: any) {
      query = input;
      return [...rows].sort((a, b) => b.leaseEpoch - a.leaseEpoch || b.id.localeCompare(a.id))[0];
    },
  } };
  const cursors = await createPrismaSchedulerStore(prisma).loadLatestCursors('workbench', 'RECONCILIATION');
  assert.deepEqual(cursors, { CRM: 'new' });
  assert.deepEqual(query.where, { leaseKey: 'workbench', jobType: 'RECONCILIATION', status: { in: ['SUCCEEDED', 'PARTIAL'] } });
  assert.deepEqual(query.orderBy, [{ leaseEpoch: 'desc' }, { id: 'desc' }]);
});

test('reminder cursor lookup includes an expired owners still-RUNNING checkpoint before abandonment', async () => {
  let query: any;
  const row = {
    leaseKey: 'workbench', jobType: 'REMINDER_SCAN', status: 'RUNNING', leaseEpoch: 9,
    id: 'expired-owner-run',
    cursors: { REMINDER_SCAN: { dueAt: '2026-08-21T01:00:00.000Z', id: 'task-1000' } },
  };
  const prisma: any = { workbenchSchedulerRun: {
    async findFirst(input: any) { query = input; return row; },
  } };

  const cursors = await createPrismaSchedulerStore(prisma)
    .loadLatestCursors('workbench', 'REMINDER_SCAN');

  assert.deepEqual(cursors, row.cursors);
  assert.ok(query.where.status.in.includes('RUNNING'));
  assert.deepEqual(query.orderBy, [{ leaseEpoch: 'desc' }, { id: 'desc' }]);
});

test('Prisma schema and additive migration persist leases, run history, and per-module cursors', async () => {
  const [schema, migration, oldMigration, plan] = await Promise.all([
    readFile(new URL('../../../prisma/schema.prisma', import.meta.url), 'utf8'),
    readFile(new URL('../../../prisma/migrations/20260820210000_workbench_scheduler/migration.sql', import.meta.url), 'utf8'),
    readFile(new URL('../../../prisma/migrations/20260820133000_unified_employee_workbench_phase3/migration.sql', import.meta.url), 'utf8'),
    readFile(new URL('../../../docs/superpowers/plans/2026-08-20-unified-employee-workbench-phase3.md', import.meta.url), 'utf8'),
  ]);
  assert.match(schema, /model WorkbenchSchedulerLease \{[\s\S]*leaseEpoch\s+Int[\s\S]*ownerToken\s+String\?[\s\S]*expiresAt\s+DateTime/s);
  assert.match(schema, /model WorkbenchSchedulerRun \{[\s\S]*jobType\s+String[\s\S]*status\s+String[\s\S]*cursors\s+Json\?/s);
  assert.match(migration, /CREATE TABLE `workbench_scheduler_leases`/);
  assert.match(migration, /CREATE TABLE `workbench_scheduler_runs`/);
  assert.doesNotMatch(oldMigration, /workbench_scheduler_(?:leases|runs)/, 'Task 1 migration history must stay immutable');
  assert.match(plan, /Create: `prisma\/migrations\/20260820210000_workbench_scheduler\/migration\.sql`/);
  assert.doesNotMatch(plan, /Modify: `prisma\/migrations\/20260820133000_unified_employee_workbench_phase3\/migration\.sql`/);
});

test('server lifecycle starts and gracefully stops the workbench scheduler', async () => {
  const source = await readFile(new URL('../../index.ts', import.meta.url), 'utf8');
  assert.match(source, /createWorkbenchScheduler\(\{/);
  assert.match(source, /workbenchScheduler\.start\(\)/);
  assert.match(source, /await workbenchScheduler\.stop\(\)/);
  const schedulerWiring = source.slice(source.indexOf('const workbenchScheduler = createWorkbenchScheduler({'), source.indexOf('const enterpriseAiService'));
  assert.doesNotMatch(schedulerWiring, /reconcile\s*:/, 'production reconciliation stays disabled until concrete adapters are registered');
  assert.match(schedulerWiring, /scanReminders:\s*\(input\)\s*=>\s*workbenchNotificationService\.scanReminders\(input\)/,
    'production must register the concrete Task 7 reminder scanner');
  assert.match(schedulerWiring, /onRunFailed:\s*\(input\)\s*=>\s*workbenchNotificationService\.schedulerFailed\(input\)/,
    'durably finalized scheduler failures must flow to the throttled notification path');
});
