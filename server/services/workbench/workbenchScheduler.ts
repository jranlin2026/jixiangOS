import { randomUUID } from 'node:crypto';
import type {
  ReconcileContext,
  ReconcileError,
  ReconcileResult,
  WorkbenchBusinessModule,
} from './sourceAdapter';

export type SchedulerJobType = 'DAILY_GENERATION' | 'RECONCILIATION' | 'REMINDER_SCAN';
export type SchedulerRunStatus = 'RUNNING' | 'SUCCEEDED' | 'PARTIAL' | 'FAILED' | 'ABANDONED';
export type SchedulerCursorState = Partial<Record<WorkbenchBusinessModule, string>>;

export type SchedulerLease = {
  leaseKey: string;
  ownerToken: string | null;
  leaseEpoch: number;
  expiresAt: Date;
};

export type SchedulerLeaseGuard = Pick<SchedulerLease, 'leaseKey' | 'ownerToken' | 'leaseEpoch'> & {
  ownerToken: string;
};

export type SchedulerRunRecord = {
  id: string;
  leaseKey: string;
  ownerToken: string;
  leaseEpoch: number;
  jobType: SchedulerJobType;
  businessDate: string | null;
  status: SchedulerRunStatus;
  startedAt: Date;
  finishedAt: Date | null;
  successCount: number;
  skippedCount: number;
  failedCount: number;
  failureSummary: SchedulerFailureSummary[];
  cursors: SchedulerCursorState | null;
};

export type SchedulerFailureSummary = {
  code: 'JOB_FAILED' | 'ADAPTER_FAILED' | 'REMINDER_FAILED' | 'LEASE_EXPIRED';
  module?: WorkbenchBusinessModule;
};

export type SchedulerRunCompletion = {
  runId: string;
  ownerToken: string;
  leaseEpoch: number;
  status: Exclude<SchedulerRunStatus, 'RUNNING' | 'ABANDONED'>;
  finishedAt: Date;
  successCount: number;
  skippedCount: number;
  failedCount: number;
  failureSummary: SchedulerFailureSummary[];
  cursors: SchedulerCursorState | null;
};

export type WorkbenchSchedulerStore = {
  acquireLease(input: {
    leaseKey: string;
    ownerToken: string;
    leaseMs: number;
  }): Promise<SchedulerLease | null>;
  renewLease(input: SchedulerLease & { leaseMs: number }): Promise<SchedulerLease | null>;
  validateLease(input: SchedulerLeaseGuard): Promise<SchedulerLease | null>;
  beginRun(input: {
    id: string;
    leaseKey: string;
    ownerToken: string;
    leaseEpoch: number;
    jobType: SchedulerJobType;
    businessDate: string | null;
    startedAt: Date;
  }): Promise<SchedulerRunRecord | null>;
  finishRun(input: SchedulerRunCompletion): Promise<boolean>;
  releaseLease(input: SchedulerLease): Promise<boolean>;
  loadLatestCursors(leaseKey: string, jobType: SchedulerJobType): Promise<SchedulerCursorState | undefined>;
};

export type SchedulerRunResult = {
  status: 'SUCCEEDED' | 'PARTIAL' | 'FAILED' | 'SKIPPED';
  runId: string | null;
  succeeded: number;
  skipped: number;
  failed: number;
  reason?: 'LOCAL_RUN_ACTIVE' | 'LEASE_HELD' | 'LEASE_LOST' | 'SCHEDULER_STOPPED' | 'JOB_DISABLED' | 'INVALID_DATE' | 'STORE_FAILED' | 'JOB_FAILED';
  cursors?: SchedulerCursorState;
};

type DailyGenerationResult = {
  candidateCount: number;
  createdCount: number;
  skippedCount: number;
};

type ReminderScanResult = {
  scanned: number;
  notified: number;
  skipped: number;
  failed: number;
  errors?: Array<{ code?: string }>;
};

type TimerHandle = { unref?: () => void };

type TimerApi = {
  setTimeout(callback: () => void, ms: number): TimerHandle;
  clearTimeout(timer: TimerHandle): void;
  setInterval(callback: () => void, ms: number): TimerHandle;
  clearInterval(timer: TimerHandle): void;
};

type WorkbenchSchedulerOptions = {
  store: WorkbenchSchedulerStore;
  generateDailyTasks(input: { date: string; signal: AbortSignal; lease: SchedulerLeaseGuard }): Promise<DailyGenerationResult>;
  reconcile?(input: ReconcileContext): Promise<ReconcileResult>;
  scanReminders?(input: { now: Date; signal: AbortSignal }): Promise<ReminderScanResult>;
  workerId?: string;
  now?: () => Date;
  timers?: TimerApi;
  leaseMs?: number;
  renewalIntervalMs?: number;
  maxLeaseDurationMs?: number;
  stopTimeoutMs?: number;
  onError?: (error: unknown) => void;
};

export type WorkbenchScheduler = {
  start(): void;
  stop(): Promise<void>;
  runDailyGeneration(date: string): Promise<SchedulerRunResult>;
  runReconciliation(): Promise<SchedulerRunResult>;
  runReminderScan(): Promise<SchedulerRunResult>;
};

type JobOutcome = {
  status: 'SUCCEEDED' | 'PARTIAL' | 'FAILED';
  successCount: number;
  skippedCount: number;
  failedCount: number;
  failureSummary: SchedulerFailureSummary[];
  cursors: SchedulerCursorState | null;
};

const LEASE_KEY = 'workbench:scheduler';
const DAILY_RETRY_MS = 60_000;
const RECONCILIATION_INTERVAL_MS = 5 * 60_000;
const REMINDER_INTERVAL_MS = 15 * 60_000;
const SHANGHAI_UTC_OFFSET_MS = 8 * 60 * 60_000;
const MAX_PERSISTED_COUNT = 2_147_483_647;
const MODULES = new Set<WorkbenchBusinessModule>([
  'GENERAL', 'CRM', 'ORDER', 'DELIVERY', 'AFTER_SALES', 'FINANCE', 'MARKETING', 'ACADEMY', 'OKR',
]);

const defaultTimers: TimerApi = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
  setInterval: (callback, ms) => setInterval(callback, ms),
  clearInterval: (timer) => clearInterval(timer as ReturnType<typeof setInterval>),
};

function finiteCount(value: unknown): number {
  const count = Number(value);
  if (!Number.isFinite(count) || count <= 0) return 0;
  return Math.min(Math.trunc(count), MAX_PERSISTED_COUNT);
}

function sumCounts(...values: unknown[]): number {
  return Math.min(values.reduce<number>((total, value) => total + finiteCount(value), 0), MAX_PERSISTED_COUNT);
}

function dateParts(value: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value);
  return { year: part('year'), month: part('month'), day: part('day') };
}

export function shanghaiBusinessDate(value: Date): string {
  const { year, month, day } = dateParts(value);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function millisecondsUntilNextShanghaiMidnight(value: Date): number {
  const { year, month, day } = dateParts(value);
  const nextMidnight = Date.UTC(year, month - 1, day + 1) - SHANGHAI_UTC_OFFSET_MS;
  return Math.max(1, nextMidnight - value.getTime());
}

function validBusinessDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function skipped(reason: NonNullable<SchedulerRunResult['reason']>): SchedulerRunResult {
  return { status: 'SKIPPED', runId: null, succeeded: 0, skipped: 1, failed: 0, reason };
}

function failed(reason: NonNullable<SchedulerRunResult['reason']>, runId: string | null = null): SchedulerRunResult {
  return { status: 'FAILED', runId, succeeded: 0, skipped: 0, failed: 1, reason };
}

function safeModule(error: ReconcileError): WorkbenchBusinessModule | undefined {
  return MODULES.has(error.module) ? error.module : undefined;
}

function adapterFailures(
  errors: ReconcileError[],
  invalidModules: WorkbenchBusinessModule[] = [],
): SchedulerFailureSummary[] {
  const summaries: SchedulerFailureSummary[] = [];
  const seen = new Set<string>();
  for (const error of errors) {
    if (summaries.length >= MODULES.size + 1) break;
    const module = safeModule(error);
    const key = module || 'UNKNOWN';
    if (seen.has(key)) continue;
    seen.add(key);
    summaries.push({ code: 'ADAPTER_FAILED', ...(module ? { module } : {}) });
  }
  for (const module of invalidModules) {
    if (summaries.length >= MODULES.size + 1) break;
    if (seen.has(module)) continue;
    seen.add(module);
    summaries.push({ code: 'ADAPTER_FAILED', module });
  }
  return summaries;
}

function validCursor(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 500
    && !/[\u0000-\u001f\u007f]/.test(value);
}

export function normalizeSchedulerCursors(value: unknown): SchedulerCursorState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const cursors: SchedulerCursorState = {};
  for (const [rawModule, cursor] of Object.entries(value as Record<string, unknown>)) {
    const module = rawModule as WorkbenchBusinessModule;
    if (MODULES.has(module) && validCursor(cursor)) cursors[module] = cursor;
  }
  return cursors;
}

function reconciledCursors(
  previous: SchedulerCursorState | undefined,
  result: ReconcileResult,
): { cursors: SchedulerCursorState | null; invalidModules: WorkbenchBusinessModule[] } {
  const prior = normalizeSchedulerCursors(previous);
  const cursors = normalizeSchedulerCursors(result.nextCursors);
  const invalidModules = Object.entries(result.nextCursors || {}).flatMap(([rawModule, cursor]) => {
    const module = rawModule as WorkbenchBusinessModule;
    return MODULES.has(module) && !validCursor(cursor) ? [module] : [];
  });
  for (const module of invalidModules) {
    if (prior[module]) cursors[module] = prior[module];
  }
  const failedModules = new Set<WorkbenchBusinessModule>();
  for (const error of result.errors) {
    if (failedModules.size >= MODULES.size) break;
    const module = safeModule(error);
    if (!module || failedModules.has(module)) continue;
    failedModules.add(module);
    if (cursors[module] === undefined && prior[module]) cursors[module] = prior[module];
  }
  return { cursors: Object.keys(cursors).length ? cursors : null, invalidModules: [...new Set(invalidModules)] };
}

function outcomeStatus(successCount: number, skippedCount: number, failedCount: number): JobOutcome['status'] {
  if (!failedCount) return 'SUCCEEDED';
  return successCount || skippedCount ? 'PARTIAL' : 'FAILED';
}

export function createWorkbenchScheduler(options: WorkbenchSchedulerOptions): WorkbenchScheduler {
  const workerId = String(options.workerId || `workbench-${process.pid}`).slice(0, 80);
  const now = () => options.now?.() || new Date();
  const timers = options.timers || defaultTimers;
  const leaseMs = Math.max(1_000, finiteCount(options.leaseMs) || 60_000);
  const renewalIntervalMs = Math.max(250, Math.min(
    finiteCount(options.renewalIntervalMs) || Math.floor(leaseMs / 3),
    Math.max(250, leaseMs - 250),
  ));
  const maxLeaseDurationMs = Math.max(leaseMs, finiteCount(options.maxLeaseDurationMs) || 15 * 60_000);
  const stopTimeoutMs = Math.max(10, finiteCount(options.stopTimeoutMs) || 30_000);
  let started = false;
  let stopped = false;
  let dailyTimer: TimerHandle | null = null;
  let reconciliationTimer: TimerHandle | null = null;
  let reminderTimer: TimerHandle | null = null;
  let activeRun: Promise<SchedulerRunResult> | null = null;
  let activeAbort: AbortController | null = null;
  let activeLeaseCleanup: (() => void) | null = null;

  const reportError = (error: unknown) => options.onError?.(error);
  const unref = (timer: TimerHandle) => { timer.unref?.(); return timer; };

  const execute = (
    jobType: SchedulerJobType,
    businessDate: string | null,
    work: (context: { now: Date; signal: AbortSignal; lease: SchedulerLeaseGuard; cursors?: SchedulerCursorState }) => Promise<JobOutcome>,
  ): Promise<SchedulerRunResult> => {
    if (activeRun) return Promise.resolve(skipped('LOCAL_RUN_ACTIVE'));
    if (stopped) return Promise.resolve(skipped('SCHEDULER_STOPPED'));
    const operation = (async (): Promise<SchedulerRunResult> => {
      const startedAt = now();
      const ownerToken = `${workerId}:${randomUUID()}`;
      let lease: SchedulerLease | null = null;
      let run: SchedulerRunRecord | null = null;
      try {
        lease = await options.store.acquireLease({ leaseKey: LEASE_KEY, ownerToken, leaseMs });
        if (!lease) return skipped('LEASE_HELD');
        const runStartedAt = now();
        run = await options.store.beginRun({
          id: `workbench-run-${randomUUID()}`,
          leaseKey: lease.leaseKey,
          ownerToken,
          leaseEpoch: lease.leaseEpoch,
          jobType,
          businessDate,
          startedAt: runStartedAt,
        });
        if (!run) {
          await options.store.releaseLease(lease).catch(reportError);
          return skipped('LEASE_LOST');
        }
      } catch (error) {
        reportError(error);
        if (lease) await options.store.releaseLease(lease).catch(reportError);
        return failed('STORE_FAILED');
      }

      const controller = new AbortController();
      activeAbort = controller;
      let currentLease = lease;
      let renewalInFlight = false;
      let renewalStopped = false;
      let renewalNeedsBoundaryValidation = false;
      const confirmLeaseWithDatabaseTime = async (): Promise<'VALID' | 'LOST' | 'UNKNOWN'> => {
        try {
          const validated = await options.store.validateLease({
            leaseKey: currentLease.leaseKey,
            ownerToken,
            leaseEpoch: currentLease.leaseEpoch,
          });
          if (!validated) return 'LOST';
          currentLease = validated;
          return 'VALID';
        } catch (error) {
          reportError(error);
          return 'UNKNOWN';
        }
      };
      const abortForLeaseLoss = () => {
        renewalStopped = true;
        controller.abort(new Error('SCHEDULER_LEASE_LOST'));
      };
      const handleUncertainRenewal = async () => {
        if (jobType === 'DAILY_GENERATION') {
          // Generation owns the lease row inside its atomic transaction. A renewal can
          // therefore time out on that lock; validate only after the transaction boundary.
          renewalNeedsBoundaryValidation = true;
          return;
        }
        if (await confirmLeaseWithDatabaseTime() !== 'VALID') abortForLeaseLoss();
      };
      const deadline = startedAt.getTime() + maxLeaseDurationMs;
      const maximumTimer = unref(timers.setTimeout(() => {
        renewalStopped = true;
        controller.abort(new Error('SCHEDULER_MAX_LEASE_DURATION'));
      }, maxLeaseDurationMs));
      const renewalTimer = unref(timers.setInterval(() => {
        if (renewalInFlight || renewalStopped || controller.signal.aborted) return;
        const renewedAt = now();
        const remainingMs = deadline - renewedAt.getTime();
        if (remainingMs <= 0) {
          renewalStopped = true;
          controller.abort(new Error('SCHEDULER_MAX_LEASE_DURATION'));
          return;
        }
        renewalInFlight = true;
        void (async () => {
          try {
            const renewed = await options.store.renewLease({
              ...currentLease,
              leaseMs: Math.min(leaseMs, remainingMs),
            });
            if (!renewed) {
              await handleUncertainRenewal();
              return;
            }
            currentLease = renewed;
          } catch (error) {
            reportError(error);
            await handleUncertainRenewal();
          } finally {
            renewalInFlight = false;
          }
        })();
      }, renewalIntervalMs));
      const clearLeaseTimers = () => {
        renewalStopped = true;
        timers.clearInterval(renewalTimer);
        timers.clearTimeout(maximumTimer);
        if (activeLeaseCleanup === clearLeaseTimers) activeLeaseCleanup = null;
      };
      activeLeaseCleanup = clearLeaseTimers;

      let outcome: JobOutcome;
      try {
        const cursors = jobType === 'RECONCILIATION'
          ? await options.store.loadLatestCursors(LEASE_KEY, jobType)
          : undefined;
        const leaseGuard: SchedulerLeaseGuard = {
          leaseKey: currentLease.leaseKey,
          ownerToken,
          leaseEpoch: currentLease.leaseEpoch,
        };
        outcome = await work({ now: startedAt, signal: controller.signal, lease: leaseGuard, cursors });
        if (jobType === 'DAILY_GENERATION' || renewalNeedsBoundaryValidation) {
          const validation = await confirmLeaseWithDatabaseTime();
          if (validation === 'LOST') abortForLeaseLoss();
        }
        if (controller.signal.aborted) throw controller.signal.reason;
      } catch (error) {
        reportError(error);
        outcome = {
          status: 'FAILED', successCount: 0, skippedCount: 0, failedCount: 1,
          failureSummary: [{ code: 'JOB_FAILED' }], cursors: null,
        };
      } finally {
        clearLeaseTimers();
        if (activeAbort === controller) activeAbort = null;
      }

      const finishedAt = now();
      let finalized = false;
      try {
        finalized = await options.store.finishRun({
          runId: run.id,
          ownerToken,
          leaseEpoch: currentLease.leaseEpoch,
          status: outcome.status,
          finishedAt,
          successCount: outcome.successCount,
          skippedCount: outcome.skippedCount,
          failedCount: outcome.failedCount,
          failureSummary: outcome.failureSummary,
          cursors: outcome.cursors,
        });
      } catch (error) {
        reportError(error);
      }
      await options.store.releaseLease(currentLease).catch(reportError);
      if (!finalized) return skipped('LEASE_LOST');
      return {
        status: outcome.status,
        runId: run.id,
        succeeded: outcome.successCount,
        skipped: outcome.skippedCount,
        failed: outcome.failedCount,
        ...(outcome.cursors ? { cursors: outcome.cursors } : {}),
        ...(outcome.status === 'FAILED' ? { reason: 'JOB_FAILED' as const } : {}),
      };
    })();
    activeRun = operation;
    void operation.finally(() => { if (activeRun === operation) activeRun = null; });
    return operation;
  };

  const runDailyGeneration = (date: string): Promise<SchedulerRunResult> => {
    if (!validBusinessDate(date)) return Promise.resolve(failed('INVALID_DATE'));
    return execute('DAILY_GENERATION', date, async ({ signal, lease }) => {
      const result = await options.generateDailyTasks({ date, signal, lease });
      const successCount = finiteCount(result.createdCount);
      const candidateCount = finiteCount(result.candidateCount);
      const skippedCount = Math.max(finiteCount(result.skippedCount), candidateCount - successCount);
      return {
        status: 'SUCCEEDED', successCount, skippedCount, failedCount: 0,
        failureSummary: [], cursors: null,
      };
    });
  };

  const runReconciliation = (): Promise<SchedulerRunResult> => options.reconcile ? execute(
    'RECONCILIATION',
    null,
    async ({ now: runAt, signal, cursors }) => {
      const result = await options.reconcile!({ now: runAt, signal, ...(cursors ? { cursors } : {}) });
      const successCount = sumCounts(result.created, result.updated, result.canceled);
      const skippedCount = finiteCount(result.unchanged);
      const cursorResult = reconciledCursors(cursors, result);
      const failedCount = sumCounts(result.failed, cursorResult.invalidModules.length);
      return {
        status: outcomeStatus(successCount, skippedCount, failedCount),
        successCount,
        skippedCount,
        failedCount,
        failureSummary: adapterFailures(result.errors, cursorResult.invalidModules),
        cursors: cursorResult.cursors,
      };
    },
  ) : Promise.resolve(skipped('JOB_DISABLED'));

  const runReminderScan = (): Promise<SchedulerRunResult> => options.scanReminders ? execute(
    'REMINDER_SCAN',
    null,
    async ({ now: runAt, signal }) => {
      const result = await options.scanReminders!({ now: runAt, signal });
      const successCount = finiteCount(result.notified);
      const skippedCount = finiteCount(result.skipped);
      const failedCount = finiteCount(result.failed);
      return {
        status: outcomeStatus(successCount, skippedCount, failedCount),
        successCount,
        skippedCount,
        failedCount,
        failureSummary: Array.from({ length: Math.min(failedCount, 100) }, () => ({ code: 'REMINDER_FAILED' as const })),
        cursors: null,
      };
    },
  ) : Promise.resolve(skipped('JOB_DISABLED'));

  const tick = (run: () => Promise<SchedulerRunResult>) => {
    void run().catch(reportError);
  };

  const scheduleDaily = (delayMs: number) => {
    if (!started) return;
    if (dailyTimer) timers.clearTimeout(dailyTimer);
    dailyTimer = unref(timers.setTimeout(() => {
      dailyTimer = null;
      scheduleNextDaily();
      void runDailyGeneration(shanghaiBusinessDate(now())).then((result) => {
        if (started && result.status !== 'SUCCEEDED') scheduleDaily(DAILY_RETRY_MS);
      }).catch((error) => {
        reportError(error);
        if (started) scheduleDaily(DAILY_RETRY_MS);
      });
    }, delayMs));
  };
  const scheduleNextDaily = () => scheduleDaily(millisecondsUntilNextShanghaiMidnight(now()));

  return {
    start() {
      if (started) return;
      started = true;
      stopped = false;
      scheduleNextDaily();
      void runDailyGeneration(shanghaiBusinessDate(now())).then((result) => {
        if (started && result.status !== 'SUCCEEDED') scheduleDaily(DAILY_RETRY_MS);
      }).catch((error) => {
        reportError(error);
        if (started) scheduleDaily(DAILY_RETRY_MS);
      });
      if (options.reconcile) reconciliationTimer = unref(timers.setInterval(() => tick(runReconciliation), RECONCILIATION_INTERVAL_MS));
      if (options.scanReminders) reminderTimer = unref(timers.setInterval(() => tick(runReminderScan), REMINDER_INTERVAL_MS));
    },
    async stop() {
      if (dailyTimer) timers.clearTimeout(dailyTimer);
      if (reconciliationTimer) timers.clearInterval(reconciliationTimer);
      if (reminderTimer) timers.clearInterval(reminderTimer);
      dailyTimer = null;
      reconciliationTimer = null;
      reminderTimer = null;
      started = false;
      stopped = true;
      activeAbort?.abort(new Error('SCHEDULER_SHUTDOWN'));
      activeLeaseCleanup?.();
      const running = activeRun;
      if (!running) return;
      await new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve();
        };
        const timeout = setTimeout(finish, stopTimeoutMs);
        timeout.unref?.();
        void running.catch(reportError).finally(finish);
      });
    },
    runDailyGeneration,
    runReconciliation,
    runReminderScan,
  };
}
