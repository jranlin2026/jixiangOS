import { Prisma, type PrismaClient } from '@prisma/client';
import { lockServerCustomerDirectory } from './customerBatchService';
import type {
  CustomerBatchExecutionContext,
  CustomerBatchJobExecutionItem,
  CustomerBatchJobExecutionRecord,
  CustomerBatchJobHandlerRegistry,
  CustomerBatchLeaseContext,
  ProcessBatchJobInput,
  ProcessBatchItemInput,
  ProcessBatchItemResult,
} from './customerBatchJobHandler';

export type ClaimedCustomerBatchJob = CustomerBatchJobExecutionRecord & {
  status: string;
  workerId: string;
  leaseEpoch: number;
  leaseDurationMs?: number;
};

export type CustomerBatchWorkerStore<Tx = unknown> = {
  claim(input: { workerId: string; jobId?: string; now: Date; leaseMs: number }): Promise<ClaimedCustomerBatchJob | null>;
  heartbeat(lease: ClaimedCustomerBatchJob, leaseMs: number, now: Date): Promise<boolean>;
  state(lease: ClaimedCustomerBatchJob, tx?: Tx): Promise<{ status: string } | null>;
  processNextItem(
    lease: ClaimedCustomerBatchJob,
    processItem: (input: ProcessBatchItemInput) => Promise<ProcessBatchItemResult>,
  ): Promise<
    | { kind: 'processed'; itemId: string }
    | { kind: 'retryable_failure'; itemId: string; error: unknown }
    | { kind: 'empty' }
    | { kind: 'cancel_requested' }
    | { kind: 'lease_lost' }
  >;
  recordRetryableFailure(lease: ClaimedCustomerBatchJob, itemId: string, maxAttempts: number, error: unknown): Promise<boolean>;
  settleCancelled(lease: ClaimedCustomerBatchJob): Promise<boolean>;
  finalize(lease: ClaimedCustomerBatchJob): Promise<boolean>;
  processAggregate?(
    lease: ClaimedCustomerBatchJob,
    process: (input: ProcessBatchJobInput) => Promise<unknown>,
  ): Promise<'processed' | 'cancel_requested' | 'lease_lost'>;
};

const LEASE_STATUSES = ['running', 'cancel_requested'] as const;
const CUSTOMER_IMPORT_WORKER_BATCH_SIZE = 20;
const CUSTOMER_BATCH_TRANSACTION_TIMEOUT_MS = 30_000;

function retryableDatabaseError(error: unknown): boolean {
  const code = String((error as { code?: unknown } | null)?.code || '');
  if (['P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'P2034'].includes(code)) return true;
  return /deadlock|serialization failure|write conflict|connection reset|connection closed|timed?\s*out|1213|40001/i
    .test(String((error as Error)?.message || ''));
}

export function classifyCustomerBatchItemFailure(error: unknown): { code: string; message: string; retryable: boolean } {
  if (retryableDatabaseError(error)) {
    return { code: 'TRANSIENT_DATABASE_ERROR', message: '数据库暂时繁忙，请稍后重试', retryable: true };
  }
  const code = String((error as { code?: unknown } | null)?.code || '');
  const message = String((error as Error)?.message || '');
  if (code === 'CUSTOMER_WRITE_CONFLICT' || /客户记录已更新|版本/.test(message)) {
    return { code: 'CUSTOMER_VERSION_CONFLICT', message: '客户资料已发生变化，请重新操作', retryable: false };
  }
  if (/无权|权限|当前用户不存在或已离职/.test(message)) {
    return { code: 'CUSTOMER_PERMISSION_REVOKED', message: '当前权限或客户范围已变化', retryable: false };
  }
  if (/客户不存在/.test(message)) {
    return { code: 'CUSTOMER_NOT_FOUND', message: '客户不存在或已删除', retryable: false };
  }
  if (/相同联系方式|手机号或微信在系统中已存在客户/.test(message)) {
    return { code: 'CUSTOMER_CONTACT_DUPLICATE', message: message || '手机号或微信在系统中已存在客户', retryable: false };
  }
  if (/存在关联/.test(message)) {
    return { code: 'CUSTOMER_ASSOCIATION_CONFLICT', message: '客户仍存在业务关联，无法执行', retryable: false };
  }
  if (/状态|进展|标签|目标销售|目标员工|公海|待办|参数|不允许/.test(message)) {
    return { code: 'CUSTOMER_STATE_CONFLICT', message: '客户当前状态不允许执行此操作', retryable: false };
  }
  return { code: 'CUSTOMER_BATCH_ITEM_FAILED', message: '客户操作未完成', retryable: false };
}

class RetryableBatchItemTransactionError extends Error {
  constructor(readonly itemId: string, readonly failure: ReturnType<typeof classifyCustomerBatchItemFailure>, readonly cause: unknown) {
    super(failure.message);
    this.name = 'RetryableBatchItemTransactionError';
  }
}

class NonRetryableBatchItemTransactionError extends Error {
  constructor(readonly itemId: string, readonly failure: ReturnType<typeof classifyCustomerBatchItemFailure>) {
    super(failure.message);
    this.name = 'NonRetryableBatchItemTransactionError';
  }
}

function rawRows<T = any>(client: { $queryRaw(query: Prisma.Sql): Promise<unknown> }, query: Prisma.Sql): Promise<T[]> {
  return client.$queryRaw(query) as Promise<T[]>;
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function date(value: unknown): Date | null {
  if (!value) return null;
  const result = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(result.getTime()) ? null : result;
}

function claimed(row: any, workerId: string, leaseDurationMs: number): ClaimedCustomerBatchJob {
  return {
    ...row,
    workerId,
    leaseEpoch: Number(row.leaseEpoch || 0),
    leaseDurationMs,
  } as ClaimedCustomerBatchJob;
}

function countsFromRows(rows: Array<{ status: string; count: number | bigint | string }>) {
  const count = (status: string) => Number(rows.find((row) => row.status === status)?.count || 0);
  return {
    successCount: count('succeeded'),
    failedCount: count('failed'),
    skippedCount: count('skipped'),
    cancelledCount: count('cancelled'),
  };
}

export function createPrismaCustomerBatchWorkerStore(
  prisma: Pick<PrismaClient, '$transaction'> & any,
  options: {
    now?: () => Date;
    loadExecutionContext?: (tx: any, actorId: string) => Promise<CustomerBatchExecutionContext>;
  } = {},
): CustomerBatchWorkerStore<any> {
  const currentTime = () => options.now?.() || new Date();
  const transaction = <T>(operation: (tx: any) => Promise<T>) => prisma.$transaction(
    operation,
    { isolationLevel: 'ReadCommitted', timeout: CUSTOMER_BATCH_TRANSACTION_TIMEOUT_MS },
  );
  const loadExecutionContext = options.loadExecutionContext || (async (tx: any, actorId: string) => {
    const directory = await lockServerCustomerDirectory(tx, actorId);
    return { access: directory.access, actor: directory.actor, user: directory.user, roles: directory.roles };
  });

  const lockedLeaseJob = async (tx: any, lease: ClaimedCustomerBatchJob) => {
    const rows = await rawRows<any>(tx, Prisma.sql`
      SELECT *
      FROM customer_batch_jobs
      WHERE id = ${lease.id}
        AND leaseOwner = ${lease.workerId}
        AND leaseEpoch = ${lease.leaseEpoch}
        AND status IN ('running', 'cancel_requested')
      LIMIT 1
      FOR UPDATE
    `);
    return rows[0] || null;
  };

  const state = async (lease: ClaimedCustomerBatchJob, client: any = prisma) => {
    if (client?.$queryRaw) {
      const rows = await rawRows<any>(client, Prisma.sql`
        SELECT status
        FROM customer_batch_jobs
        WHERE id = ${lease.id}
          AND leaseOwner = ${lease.workerId}
          AND leaseEpoch = ${lease.leaseEpoch}
          AND status IN ('running', 'cancel_requested')
        LIMIT 1
      `);
      return rows[0] ? { status: String(rows[0].status) } : null;
    }
    const row = await client.customerBatchJob.findFirst({
      where: {
        id: lease.id,
        leaseOwner: lease.workerId,
        leaseEpoch: lease.leaseEpoch,
        status: { in: [...LEASE_STATUSES] },
      },
      select: { status: true },
    });
    return row ? { status: row.status } : null;
  };

  return {
    claim: async ({ workerId, jobId, now, leaseMs }) => transaction(async (tx) => {
      const jobConstraint = jobId ? Prisma.sql`AND id = ${jobId}` : Prisma.empty;
      const rows = await rawRows<any>(tx, Prisma.sql`
        SELECT *
        FROM customer_batch_jobs
        WHERE (
          status = 'queued'
          OR (status IN ('running', 'cancel_requested') AND leaseExpiresAt < ${now})
        )
        ${jobConstraint}
        ORDER BY createdAt ASC, id ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `);
      const candidate = rows[0];
      if (!candidate) return null;
      const nextStatus = candidate.status === 'queued' ? 'running' : candidate.status;
      const updated = await tx.customerBatchJob.updateMany({
        where: { id: candidate.id, leaseEpoch: Number(candidate.leaseEpoch || 0), status: candidate.status },
        data: {
          status: nextStatus,
          leaseOwner: workerId,
          leaseEpoch: { increment: 1 },
          leaseExpiresAt: new Date(now.getTime() + leaseMs),
          heartbeatAt: now,
          startedAt: date(candidate.startedAt) || now,
          attemptCount: { increment: 1 },
        },
      });
      if (updated.count !== 1) return null;
      const row = await tx.customerBatchJob.findUnique({ where: { id: candidate.id } });
      return row ? claimed(row, workerId, leaseMs) : null;
    }),

    heartbeat: async (lease, leaseMs, now) => {
      const updated = await prisma.customerBatchJob.updateMany({
        where: {
          id: lease.id,
          leaseOwner: lease.workerId,
          leaseEpoch: lease.leaseEpoch,
          status: { in: [...LEASE_STATUSES] },
        },
        data: { heartbeatAt: now, leaseExpiresAt: new Date(now.getTime() + leaseMs) },
      });
      return updated.count === 1;
    },

    state,

    processNextItem: async (lease, processItem) => {
      let attemptedItemId: string | undefined;
      try {
        return await transaction(async (tx) => {
          const job = await lockedLeaseJob(tx, lease);
          if (!job) return { kind: 'lease_lost' as const };
          if (job.status === 'cancel_requested') return { kind: 'cancel_requested' as const };
          const at = currentTime();
          const leaseUpdate = await tx.customerBatchJob.updateMany({
            where: { id: job.id, leaseOwner: lease.workerId, leaseEpoch: lease.leaseEpoch, status: 'running' },
            data: { heartbeatAt: at, leaseExpiresAt: new Date(at.getTime() + (lease.leaseDurationMs || 60_000)) },
          });
          if (leaseUpdate.count !== 1) return { kind: 'lease_lost' as const };
          const itemLimit = lease.handlerKey === 'customer_import' ? CUSTOMER_IMPORT_WORKER_BATCH_SIZE : 1;
          const items = await rawRows<any>(tx, Prisma.sql`
            SELECT *
            FROM customer_batch_job_items
            WHERE jobId = ${job.id}
              AND status = 'queued'
            ORDER BY targetKey ASC
            LIMIT ${itemLimit}
            FOR UPDATE
          `);
          if (!items.length) return { kind: 'empty' as const };
          const executionContext = await loadExecutionContext(tx, job.actorId);
          let processedCount = 0;
          for (const item of items) {
            attemptedItemId = String(item.id);
            const claimedItem = await tx.customerBatchJobItem.updateMany({
              where: { id: item.id, jobId: job.id, status: 'queued' },
              data: {
                status: 'running',
                attemptCount: { increment: 1 },
                retryable: false,
                errorCode: null,
                errorMessage: null,
                startedAt: at,
                finishedAt: null,
              },
            });
            if (claimedItem.count !== 1) throw new Error('批量任务明细状态已变化');
            try {
              const result = await processItem({ tx, job, item, executionContext });
              const finishedAt = currentTime();
              const saved = await tx.customerBatchJobItem.updateMany({
                where: { id: item.id, jobId: job.id, status: 'running' },
                data: {
                  status: 'succeeded',
                  retryable: false,
                  beforeHash: result.beforeHash || null,
                  afterHash: result.afterHash || null,
                  beforeSnapshot: result.beforeSnapshot ? json(result.beforeSnapshot) : Prisma.JsonNull,
                  afterSnapshot: result.afterSnapshot ? json(result.afterSnapshot) : Prisma.JsonNull,
                  finishedAt,
                },
              });
              if (saved.count !== 1) throw new Error('批量任务明细状态已变化');
              processedCount += 1;
            } catch (error) {
              const failure = classifyCustomerBatchItemFailure(error);
              if (failure.retryable) throw new RetryableBatchItemTransactionError(item.id, failure, error);
              // Escape the business transaction first. This guarantees a failed
              // handler cannot commit a partially written customer alongside a
              // failed item marker.
              throw new NonRetryableBatchItemTransactionError(item.id, failure);
            }
          }
          const progressed = await tx.customerBatchJob.updateMany({
            where: { id: job.id, leaseOwner: lease.workerId, leaseEpoch: lease.leaseEpoch, status: 'running' },
            data: { successCount: { increment: processedCount }, cursor: { increment: processedCount } },
          });
          if (progressed.count !== 1) throw new Error('批量任务租约已失效');
          return { kind: 'processed' as const, itemId: String(items[items.length - 1].id) };
        });
      } catch (error) {
        if (error instanceof NonRetryableBatchItemTransactionError) {
          return transaction(async (tx) => {
            const job = await lockedLeaseJob(tx, lease);
            if (!job || job.status !== 'running') return { kind: 'lease_lost' as const };
            const at = currentTime();
            const saved = await tx.customerBatchJobItem.updateMany({
              where: { id: error.itemId, jobId: job.id, status: 'queued' },
              data: {
                status: 'failed', retryable: false,
                errorCode: error.failure.code, errorMessage: error.failure.message,
                attemptCount: { increment: 1 }, startedAt: at, finishedAt: at,
              },
            });
            if (saved.count !== 1) return { kind: 'lease_lost' as const };
            const progressed = await tx.customerBatchJob.updateMany({
              where: { id: job.id, leaseOwner: lease.workerId, leaseEpoch: lease.leaseEpoch, status: 'running' },
              data: {
                failedCount: { increment: 1 }, cursor: { increment: 1 }, heartbeatAt: at,
                leaseExpiresAt: new Date(at.getTime() + (lease.leaseDurationMs || 60_000)),
              },
            });
            return progressed.count === 1
              ? { kind: 'processed' as const, itemId: error.itemId }
              : { kind: 'lease_lost' as const };
          });
        }
        if (error instanceof RetryableBatchItemTransactionError) {
          return { kind: 'retryable_failure' as const, itemId: error.itemId, error: error.cause };
        }
        if (attemptedItemId && retryableDatabaseError(error)) {
          return { kind: 'retryable_failure' as const, itemId: attemptedItemId, error };
        }
        throw error;
      }
    },

    recordRetryableFailure: async (lease, itemId, maxAttempts, error) => transaction(async (tx) => {
      const job = await lockedLeaseJob(tx, lease);
      if (!job || job.status !== 'running') return false;
      const items = await rawRows<any>(tx, Prisma.sql`
        SELECT *
        FROM customer_batch_job_items
        WHERE id = ${itemId} AND jobId = ${job.id}
        LIMIT 1
        FOR UPDATE
      `);
      const item = items[0];
      if (!item) return false;
      if (['succeeded', 'failed', 'cancelled'].includes(String(item.status))) return true;
      const attempts = Number(item.attemptCount || 0) + 1;
      const failure = classifyCustomerBatchItemFailure(error);
      const at = currentTime();
      await tx.customerBatchJobItem.updateMany({
        where: { id: item.id, jobId: job.id, status: { in: ['queued', 'running'] } },
        data: {
          status: attempts >= maxAttempts ? 'failed' : 'queued',
          attemptCount: attempts,
          retryable: true,
          errorCode: failure.code,
          errorMessage: failure.message,
          finishedAt: attempts >= maxAttempts ? at : null,
        },
      });
      const progressed = await tx.customerBatchJob.updateMany({
        where: { id: job.id, leaseOwner: lease.workerId, leaseEpoch: lease.leaseEpoch, status: 'running' },
        data: {
          ...(attempts >= maxAttempts
            ? { failedCount: { increment: 1 }, cursor: { increment: 1 } }
            : {}),
          heartbeatAt: at,
          leaseExpiresAt: new Date(at.getTime() + (lease.leaseDurationMs || 60_000)),
        },
      });
      return progressed.count === 1;
    }),

    settleCancelled: async (lease) => transaction(async (tx) => {
      const job = await lockedLeaseJob(tx, lease);
      if (!job || job.status !== 'cancel_requested') return false;
      const at = currentTime();
      await tx.customerBatchJobItem.updateMany({
        where: { jobId: job.id, status: { in: ['queued', 'running'] } },
        data: { status: 'cancelled', retryable: false, finishedAt: at },
      });
      const countRows = await rawRows<any>(tx, Prisma.sql`
        SELECT status, COUNT(*) AS count
        FROM customer_batch_job_items
        WHERE jobId = ${job.id}
        GROUP BY status
      `);
      const counts = countsFromRows(countRows);
      const updated = await tx.customerBatchJob.updateMany({
        where: { id: job.id, leaseOwner: lease.workerId, leaseEpoch: lease.leaseEpoch, status: 'cancel_requested' },
        data: {
          status: 'cancelled',
          ...counts,
          cancelledAt: at,
          finishedAt: at,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      });
      return updated.count === 1;
    }),

    finalize: async (lease) => transaction(async (tx) => {
      const job = await lockedLeaseJob(tx, lease);
      if (!job || job.status !== 'running') return false;
      const countRows = await rawRows<any>(tx, Prisma.sql`
        SELECT status, COUNT(*) AS count
        FROM customer_batch_job_items
        WHERE jobId = ${job.id}
        GROUP BY status
      `);
      const counts = countsFromRows(countRows);
      const total = counts.successCount + counts.failedCount + counts.skippedCount + counts.cancelledCount;
      if (total !== Number(job.totalCount || 0)) return false;
      const status = counts.failedCount === 0
        ? 'succeeded'
        : counts.successCount > 0 || counts.skippedCount > 0
          ? 'partial_failed'
          : 'failed';
      const updated = await tx.customerBatchJob.updateMany({
        where: { id: job.id, leaseOwner: lease.workerId, leaseEpoch: lease.leaseEpoch, status: 'running' },
        data: {
          status,
          ...counts,
          finishedAt: currentTime(),
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      });
      return updated.count === 1;
    }),

    processAggregate: async (lease, process) => transaction(async (tx) => {
      const job = await lockedLeaseJob(tx, lease);
      if (!job) return 'lease_lost' as const;
      if (job.status === 'cancel_requested') return 'cancel_requested' as const;
      const at = currentTime();
      const extended = await tx.customerBatchJob.updateMany({
        where: { id: job.id, leaseOwner: lease.workerId, leaseEpoch: lease.leaseEpoch, status: 'running' },
        data: { heartbeatAt: at, leaseExpiresAt: new Date(at.getTime() + (lease.leaseDurationMs || 60_000)) },
      });
      if (extended.count !== 1) return 'lease_lost' as const;
      const executionContext = await loadExecutionContext(tx, job.actorId);
      await process({ tx, job, executionContext });
      return 'processed' as const;
    }),
  };
}

export type CustomerBatchWorker = {
  start(): void;
  stop(): Promise<void>;
  runOnce(): Promise<number>;
  claimBatchJob(jobId?: string): Promise<ClaimedCustomerBatchJob | null>;
  heartbeatBatchJob(lease: ClaimedCustomerBatchJob): Promise<boolean>;
  processBatchJob(lease: ClaimedCustomerBatchJob): Promise<boolean>;
  finalizeBatchJob(lease: ClaimedCustomerBatchJob): Promise<boolean>;
};

export function createCustomerBatchWorker<Tx = unknown>(options: {
  store: CustomerBatchWorkerStore<Tx>;
  handlers: CustomerBatchJobHandlerRegistry;
  workerId: string;
  now?: () => Date;
  leaseMs?: number;
  pollIntervalMs?: number;
  maxItemAttempts?: number;
  maxJobsPerRun?: number;
  onError?: (error: unknown) => void;
}): CustomerBatchWorker {
  const now = () => options.now?.() || new Date();
  const leaseMs = options.leaseMs ?? 60_000;
  const pollIntervalMs = options.pollIntervalMs ?? 2_000;
  const maxItemAttempts = options.maxItemAttempts ?? 3;
  const maxJobsPerRun = options.maxJobsPerRun ?? 10;
  let timer: ReturnType<typeof setInterval> | null = null;
  let activeRun: Promise<number> | null = null;
  let stopping = false;

  const claimBatchJob = (jobId?: string) => options.store.claim({
    workerId: options.workerId,
    ...(jobId ? { jobId } : {}),
    now: now(),
    leaseMs,
  });

  const heartbeatBatchJob = (lease: ClaimedCustomerBatchJob) => (
    options.store.heartbeat(lease, leaseMs, now())
  );

  const leaseContext = (lease: ClaimedCustomerBatchJob): CustomerBatchLeaseContext => ({
    jobId: lease.id,
    workerId: lease.workerId,
    leaseEpoch: lease.leaseEpoch,
    async assertActive(tx) {
      const state = await options.store.state(lease, tx as Tx | undefined);
      if (!state || state.status !== 'running') throw new Error('批量任务租约已失效');
    },
    async heartbeat() {
      if (!await heartbeatBatchJob(lease)) throw new Error('批量任务租约已失效');
    },
    async cancellationRequested() {
      return (await options.store.state(lease))?.status === 'cancel_requested';
    },
  });

  const finalizeBatchJob = (lease: ClaimedCustomerBatchJob) => options.store.finalize(lease);

  const processBatchJob = async (lease: ClaimedCustomerBatchJob): Promise<boolean> => {
    const initial = await options.store.state(lease);
    if (!initial) return false;
    if (initial.status === 'cancel_requested') return options.store.settleCancelled(lease);
    if (initial.status !== 'running') return false;
    const handler = options.handlers.get(lease.handlerKey);
    const context = leaseContext(lease);

    if (handler.executionKind === 'aggregate') {
      if (!options.store.processAggregate) throw new Error('批量任务存储未实现 aggregate 执行');
      const outcome = await options.store.processAggregate(lease, (input) => handler.processAggregate!(input, context));
      if (outcome === 'cancel_requested') return options.store.settleCancelled(lease);
      if (outcome === 'lease_lost') return false;
      const beforeFinalize = await options.store.state(lease);
      if (beforeFinalize?.status === 'cancel_requested') return options.store.settleCancelled(lease);
      if (beforeFinalize?.status !== 'running') return false;
      if (handler.finalize) await handler.finalize({ job: lease }, context);
      return finalizeBatchJob(lease);
    }

    while (!stopping) {
      const outcome = await options.store.processNextItem(
        lease,
        (input) => handler.processItem!(input, context),
      );
      if (outcome.kind === 'lease_lost') return false;
      if (outcome.kind === 'cancel_requested') return options.store.settleCancelled(lease);
      if (outcome.kind === 'empty') {
        const beforeFinalize = await options.store.state(lease);
        if (beforeFinalize?.status === 'cancel_requested') return options.store.settleCancelled(lease);
        if (beforeFinalize?.status !== 'running') return false;
        if (handler.finalize) await handler.finalize({ job: lease }, context);
        return finalizeBatchJob(lease);
      }
      if (outcome.kind === 'retryable_failure') {
        if (!await options.store.recordRetryableFailure(lease, outcome.itemId, maxItemAttempts, outcome.error)) {
          const afterFailure = await options.store.state(lease);
          if (afterFailure?.status === 'cancel_requested') return options.store.settleCancelled(lease);
          return false;
        }
      }
    }
    return false;
  };

  const performRun = async (): Promise<number> => {
    let processed = 0;
    while (!stopping && processed < maxJobsPerRun) {
      const claim = await claimBatchJob();
      if (!claim) break;
      await processBatchJob(claim);
      processed += 1;
    }
    return processed;
  };

  const runOnce = (): Promise<number> => {
    if (activeRun) return activeRun;
    activeRun = performRun().finally(() => { activeRun = null; });
    return activeRun;
  };

  const runSafely = () => {
    void runOnce().catch((error) => options.onError?.(error));
  };

  return {
    start() {
      if (timer) return;
      stopping = false;
      runSafely();
      timer = setInterval(runSafely, pollIntervalMs);
    },
    async stop() {
      stopping = true;
      if (timer) clearInterval(timer);
      timer = null;
      if (activeRun) {
        try {
          await activeRun;
        } catch (error) {
          options.onError?.(error);
        }
      }
    },
    runOnce,
    claimBatchJob,
    heartbeatBatchJob,
    processBatchJob,
    finalizeBatchJob,
  };
}

export type {
  CustomerBatchExecutionContext,
  CustomerBatchJobExecutionItem,
};
