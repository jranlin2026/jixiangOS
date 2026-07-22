import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createCustomerBatchWorker,
  createPrismaCustomerBatchWorkerStore,
  classifyCustomerBatchItemFailure,
  type ClaimedCustomerBatchJob,
  type CustomerBatchWorkerStore,
} from './customerBatchWorker';
import { CustomerBatchJobHandlerRegistry, type CustomerBatchJobHandler } from './customerBatchJobHandler';

type FakeItem = {
  id: string;
  targetKey: string;
  status: 'queued' | 'succeeded' | 'failed' | 'cancelled';
  attemptCount: number;
  retryable: boolean;
};

assert.deepEqual(
  classifyCustomerBatchItemFailure(Object.assign(new Error('deadlock'), { code: 'P2034' })),
  { code: 'TRANSIENT_DATABASE_ERROR', message: '数据库暂时繁忙，请稍后重试', retryable: true },
);
assert.equal(classifyCustomerBatchItemFailure(Object.assign(new Error('changed'), { code: 'CUSTOMER_WRITE_CONFLICT' })).retryable, false);
assert.equal(classifyCustomerBatchItemFailure(new Error('无权管理该客户')).code, 'CUSTOMER_PERMISSION_REVOKED');
assert.equal(classifyCustomerBatchItemFailure(new Error('客户当前状态不允许')).code, 'CUSTOMER_STATE_CONFLICT');

function fakeStoreFixture(start = new Date('2026-07-18T08:00:00.000Z')) {
  let now = new Date(start);
  const job: any = {
    id: 'job-1', actorId: 'u-1', actorName: '员工甲', handlerKey: 'customer_mutation', operation: 'transfer',
    input: { targetOwnerId: 'u-2' }, reason: '团队调整', status: 'queued', leaseOwner: null, leaseEpoch: 0,
    leaseExpiresAt: null, cancelRequestedAt: null, totalCount: 3, successCount: 0, failedCount: 0,
    skippedCount: 0, cancelledCount: 0,
  };
  const items: FakeItem[] = ['c-1', 'c-2', 'c-3'].map((id, index) => ({
    id: `item-${index + 1}`, targetKey: `customer:${id}`, status: 'queued', attemptCount: 0, retryable: false,
  }));

  const validLease = (lease: ClaimedCustomerBatchJob) => (
    job.leaseOwner === lease.workerId && job.leaseEpoch === lease.leaseEpoch
  );
  const counts = () => ({
    successCount: items.filter((item) => item.status === 'succeeded').length,
    failedCount: items.filter((item) => item.status === 'failed').length,
    skippedCount: 0,
    cancelledCount: items.filter((item) => item.status === 'cancelled').length,
  });

  const store: CustomerBatchWorkerStore<any> = {
    claim: async ({ workerId, jobId, leaseMs }) => {
      if (jobId && jobId !== job.id) return null;
      const expired = job.leaseExpiresAt && new Date(job.leaseExpiresAt).getTime() < now.getTime();
      if (!(job.status === 'queued' || ((job.status === 'running' || job.status === 'cancel_requested') && expired))) return null;
      job.leaseOwner = workerId;
      job.leaseEpoch += 1;
      job.leaseExpiresAt = new Date(now.getTime() + leaseMs);
      if (job.status === 'queued') job.status = 'running';
      return { ...job, workerId, leaseEpoch: job.leaseEpoch };
    },
    heartbeat: async (lease, leaseMs) => {
      if (!validLease(lease)) return false;
      job.leaseExpiresAt = new Date(now.getTime() + leaseMs);
      return true;
    },
    state: async (lease) => validLease(lease) ? { status: job.status } : null,
    processNextItem: async (lease, processItem) => {
      if (!validLease(lease)) return { kind: 'lease_lost' };
      if (job.status === 'cancel_requested') return { kind: 'cancel_requested' };
      if (job.status !== 'running') return { kind: 'lease_lost' };
      const item = items.find((candidate) => candidate.status === 'queued');
      if (!item) return { kind: 'empty' };
      item.attemptCount += 1;
      try {
        await processItem({
          tx: {}, job, item: { ...item, jobId: job.id, idempotencyKey: `${job.id}:${item.targetKey}`, expectedUpdatedAt: now },
          executionContext: { access: { actorId: job.actorId } as any, actor: { id: job.actorId, name: job.actorName }, roles: [] },
        });
        item.status = 'succeeded';
      } catch (error) {
        const code = (error as any)?.code;
        if (code === 'P2034') return { kind: 'retryable_failure', itemId: item.id, error };
        item.status = 'failed';
      }
      Object.assign(job, counts());
      return { kind: 'processed', itemId: item.id };
    },
    recordRetryableFailure: async (lease, itemId, maxAttempts) => {
      if (!validLease(lease)) return false;
      const item = items.find((candidate) => candidate.id === itemId)!;
      item.retryable = true;
      if (item.attemptCount >= maxAttempts) item.status = 'failed';
      Object.assign(job, counts());
      return true;
    },
    settleCancelled: async (lease) => {
      if (!validLease(lease) || job.status !== 'cancel_requested') return false;
      items.filter((item) => item.status === 'queued').forEach((item) => { item.status = 'cancelled'; });
      Object.assign(job, counts(), { status: 'cancelled' });
      return true;
    },
    finalize: async (lease) => {
      if (!validLease(lease) || job.status !== 'running') return false;
      Object.assign(job, counts());
      job.status = job.failedCount === 0 ? 'succeeded' : job.successCount > 0 ? 'partial_failed' : 'failed';
      return true;
    },
  };
  return {
    store, job, items,
    now: () => new Date(now),
    advance(ms: number) { now = new Date(now.getTime() + ms); },
    requestCancel() { if (job.status === 'running') job.status = 'cancel_requested'; },
  };
}

{
  const fake = fakeStoreFixture();
  const calls: string[] = [];
  const handler: CustomerBatchJobHandler = {
    handlerKey: 'customer_mutation', executionKind: 'itemized',
    processItem: async (input) => {
      calls.push(input.item.targetKey);
      if (input.item.targetKey === 'customer:c-2') throw Object.assign(new Error('客户状态不允许'), { code: 'CUSTOMER_STATE_CONFLICT' });
      return {};
    },
  };
  const worker = createCustomerBatchWorker({
    store: fake.store, handlers: new CustomerBatchJobHandlerRegistry([handler]), workerId: 'worker-a', now: fake.now,
  });
  assert.equal(await worker.runOnce(), 1);
  assert.equal(fake.job.status, 'partial_failed');
  assert.deepEqual(calls, ['customer:c-1', 'customer:c-2', 'customer:c-3']);
  assert.equal(await worker.runOnce(), 0);
  assert.equal(calls.length, 3, 'terminal items must never execute twice');
}

{
  const fake = fakeStoreFixture();
  const calls: string[] = [];
  const handler: CustomerBatchJobHandler = {
    handlerKey: 'customer_mutation', executionKind: 'itemized',
    processItem: async (input) => { calls.push(input.item.targetKey); return {}; },
  };
  const registry = new CustomerBatchJobHandlerRegistry([handler]);
  const workerA = createCustomerBatchWorker({ store: fake.store, handlers: registry, workerId: 'worker-a', now: fake.now });
  const workerB = createCustomerBatchWorker({ store: fake.store, handlers: registry, workerId: 'worker-b', now: fake.now });
  const claimA = await workerA.claimBatchJob('job-1');
  assert.equal(claimA?.leaseEpoch, 1);
  fake.advance(61_000);
  const claimB = await workerB.claimBatchJob('job-1');
  assert.equal(claimB?.leaseEpoch, 2);
  assert.equal(await workerA.processBatchJob(claimA!), false);
  assert.deepEqual(calls, [], 'stale epoch must not dispatch a handler');
  assert.equal(await workerB.processBatchJob(claimB!), true);
  assert.equal(fake.job.status, 'succeeded');
}

{
  const fake = fakeStoreFixture();
  let calls = 0;
  const handler: CustomerBatchJobHandler = {
    handlerKey: 'customer_mutation', executionKind: 'itemized',
    processItem: async () => {
      calls += 1;
      if (calls === 1) fake.requestCancel();
      return {};
    },
  };
  const worker = createCustomerBatchWorker({ store: fake.store, handlers: new CustomerBatchJobHandlerRegistry([handler]), workerId: 'worker-a', now: fake.now });
  assert.equal(await worker.runOnce(), 1);
  assert.equal(calls, 1, 'live lease owner must not dispatch another item after cancellation');
  assert.equal(fake.job.status, 'cancelled');
  assert.equal(fake.items.filter((item) => item.status === 'cancelled').length, 2);
}

{
  const fake = fakeStoreFixture();
  fake.job.status = 'cancel_requested';
  fake.job.leaseOwner = 'dead-worker';
  fake.job.leaseEpoch = 1;
  fake.job.leaseExpiresAt = new Date(fake.now().getTime() - 1);
  let calls = 0;
  const handler: CustomerBatchJobHandler = {
    handlerKey: 'customer_mutation', executionKind: 'itemized',
    processItem: async () => { calls += 1; return {}; },
  };
  const worker = createCustomerBatchWorker({ store: fake.store, handlers: new CustomerBatchJobHandlerRegistry([handler]), workerId: 'worker-b', now: fake.now });
  assert.equal(await worker.runOnce(), 1);
  assert.equal(calls, 0, 'expired cancel_requested recovery must settle only');
  assert.equal(fake.job.status, 'cancelled');
  assert.equal(fake.items.every((item) => item.status === 'cancelled'), true);
}

{
  const fake = fakeStoreFixture();
  let calls = 0;
  const handler: CustomerBatchJobHandler = {
    handlerKey: 'customer_mutation', executionKind: 'itemized',
    processItem: async () => {
      calls += 1;
      if (calls === 1) throw Object.assign(new Error('deadlock'), { code: 'P2034' });
      return {};
    },
  };
  const worker = createCustomerBatchWorker({ store: fake.store, handlers: new CustomerBatchJobHandlerRegistry([handler]), workerId: 'worker-a', now: fake.now, maxItemAttempts: 3 });
  assert.equal(await worker.runOnce(), 1);
  assert.equal(calls, 4, 'one transient retry plus the remaining two items must run');
  assert.equal(fake.job.status, 'succeeded');
  assert.equal(fake.items[0].retryable, true, 'transient history remains visible even after recovery');
}

// RED: cancellation that wins immediately after a rolled-back transient item
// attempt is settled by the still-live owner without waiting for lease expiry.
{
  const fake = fakeStoreFixture();
  fake.store.recordRetryableFailure = async () => {
    fake.requestCancel();
    return false;
  };
  const handler: CustomerBatchJobHandler = {
    handlerKey: 'customer_mutation', executionKind: 'itemized',
    processItem: async () => { throw Object.assign(new Error('deadlock'), { code: 'P2034' }); },
  };
  const worker = createCustomerBatchWorker({ store: fake.store, handlers: new CustomerBatchJobHandlerRegistry([handler]), workerId: 'worker-a' });
  assert.equal(await worker.runOnce(), 1);
  assert.equal(fake.job.status, 'cancelled');
  assert.equal(fake.items.every((item) => item.status === 'cancelled'), true);
}

// RED: the production adapter must claim and finish one item under the same
// lease epoch, while a stale epoch cannot enter the handler callback.
{
  const job: any = {
    id: 'job-prisma', actorId: 'u-1', actorName: '员工甲', handlerKey: 'customer_mutation', operation: 'transfer',
    input: { targetOwnerId: 'u-2' }, reason: '真实适配器', status: 'queued', leaseOwner: null, leaseEpoch: 0,
    leaseExpiresAt: null, cancelRequestedAt: null, startedAt: null, createdAt: new Date('2026-07-18T08:00:00.000Z'),
  };
  const item: any = {
    id: 'item-prisma', jobId: job.id, targetKey: 'customer:c-1', status: 'queued', attemptCount: 0,
    idempotencyKey: 'job-prisma:customer:c-1', expectedUpdatedAt: new Date('2026-07-18T08:00:00.000Z'),
  };
  const queryText = (query: any) => Array.isArray(query?.strings) ? query.strings.join('?') : String(query || '');
  const tx: any = {
    $queryRaw: async (query: any) => {
      const sql = queryText(query);
      if (sql.includes('FROM customer_batch_jobs') && sql.includes('SKIP LOCKED')) {
        return job.status === 'queued' ? [{ ...job }] : [];
      }
      if (sql.includes('FROM customer_batch_jobs')) return [{ ...job }];
      if (sql.includes('FROM customer_batch_job_items') && sql.includes('targetKey')) {
        return item.status === 'queued' ? [{ ...item }] : [];
      }
      return [];
    },
    customerBatchJob: {
      updateMany: async ({ data }: any) => {
        for (const key of ['leaseEpoch', 'attemptCount', 'successCount', 'failedCount', 'cursor']) {
          if (data[key]?.increment) job[key] = Number(job[key] || 0) + data[key].increment;
        }
        if (data.status) job.status = data.status;
        if (data.leaseOwner !== undefined) job.leaseOwner = data.leaseOwner;
        if (data.leaseExpiresAt !== undefined) job.leaseExpiresAt = data.leaseExpiresAt;
        if (data.heartbeatAt !== undefined) job.heartbeatAt = data.heartbeatAt;
        if (data.startedAt !== undefined) job.startedAt = data.startedAt;
        return { count: 1 };
      },
      findUnique: async () => ({ ...job }),
    },
    customerBatchJobItem: {
      updateMany: async ({ data }: any) => {
        if (data.attemptCount?.increment) item.attemptCount += data.attemptCount.increment;
        Object.entries(data).forEach(([key, value]) => {
          if (key !== 'attemptCount') item[key] = value;
        });
        return { count: 1 };
      },
    },
  };
  const prisma = { $transaction: async (operation: any) => operation(tx) };
  const store = createPrismaCustomerBatchWorkerStore(prisma as any, {
    now: () => new Date('2026-07-18T08:00:00.000Z'),
    loadExecutionContext: async () => ({
      access: { actorId: 'u-1' } as any, actor: { id: 'u-1', name: '员工甲' }, roles: [],
    }),
  });
  const claim = await store.claim({
    workerId: 'worker-prisma', jobId: job.id, now: new Date('2026-07-18T08:00:00.000Z'), leaseMs: 60_000,
  });
  assert.equal(claim?.leaseEpoch, 1);
  assert.equal(job.status, 'running');
  let callbacks = 0;
  const outcome = await store.processNextItem(claim!, async () => {
    callbacks += 1;
    return { beforeHash: 'a'.repeat(64), afterHash: 'b'.repeat(64) };
  });
  assert.equal(outcome.kind, 'processed');
  assert.equal(item.status, 'succeeded');
  assert.equal(job.successCount, 1, 'job progress must move in the same item transaction');
  assert.equal(job.cursor, 1);
  assert.equal(callbacks, 1);

  const stale = { ...claim!, leaseEpoch: 0 };
  tx.$queryRaw = async (query: any) => queryText(query).includes('FROM customer_batch_jobs') ? [] : [{ ...item }];
  const staleOutcome = await store.processNextItem(stale, async () => {
    callbacks += 1;
    return {};
  });
  assert.equal(staleOutcome.kind, 'lease_lost');
  assert.equal(callbacks, 1);
}

// RED: a transient error reported while committing the item transaction must
// retain the selected item id so a fresh transaction can record/retry it.
{
  const job: any = {
    id: 'job-commit-conflict', actorId: 'u-1', actorName: '员工甲', handlerKey: 'customer_mutation',
    operation: 'transfer', input: { targetOwnerId: 'u-2' }, reason: '提交冲突', status: 'running',
    leaseOwner: 'worker-a', leaseEpoch: 1, totalCount: 1,
  };
  const item: any = {
    id: 'item-commit-conflict', jobId: job.id, targetKey: 'customer:c-1', status: 'queued',
    attemptCount: 0, idempotencyKey: 'job-commit-conflict:customer:c-1',
  };
  const queryText = (query: any) => Array.isArray(query?.strings) ? query.strings.join('?') : String(query || '');
  const tx: any = {
    $queryRaw: async (query: any) => queryText(query).includes('customer_batch_job_items') ? [item] : [job],
    customerBatchJob: { updateMany: async () => ({ count: 1 }) },
    customerBatchJobItem: { updateMany: async () => ({ count: 1 }) },
  };
  const store = createPrismaCustomerBatchWorkerStore({
    $transaction: async (operation: any) => {
      await operation(tx);
      throw Object.assign(new Error('serialization failure'), { code: 'P2034' });
    },
  } as any, {
    loadExecutionContext: async () => ({ access: { actorId: 'u-1' } as any, actor: { id: 'u-1', name: '员工甲' }, roles: [] }),
  });
  const outcome = await store.processNextItem({ ...job, workerId: 'worker-a' }, async () => ({}));
  assert.deepEqual(
    { kind: outcome.kind, itemId: 'itemId' in outcome ? outcome.itemId : undefined },
    { kind: 'retryable_failure', itemId: item.id },
  );
}

// RED: finalization fails closed when persisted terminal counts do not match
// the frozen job total, including impossible over-count corruption.
{
  const job: any = {
    id: 'job-bad-counts', actorId: 'u-1', actorName: '员工甲', handlerKey: 'customer_mutation', operation: 'transfer',
    input: {}, reason: '计数校验', status: 'running', leaseOwner: 'worker-a', leaseEpoch: 1, totalCount: 3,
  };
  let query = 0;
  let updates = 0;
  const tx: any = {
    $queryRaw: async () => (++query === 1 ? [job] : [{ status: 'succeeded', count: 4 }]),
    customerBatchJob: { updateMany: async () => { updates += 1; return { count: 1 }; } },
  };
  const store = createPrismaCustomerBatchWorkerStore({ $transaction: async (operation: any) => operation(tx) } as any);
  assert.equal(await store.finalize({ ...job, workerId: 'worker-a' }), false);
  assert.equal(updates, 0);
}

// RED: aggregate handlers receive the store-owned transaction/context; the
// worker remains handler-agnostic for later export jobs.
{
  const job: any = {
    id: 'job-aggregate', actorId: 'u-1', actorName: '员工甲', handlerKey: 'customer_export', operation: 'export',
    input: {}, reason: '导出', status: 'queued', leaseOwner: null, leaseEpoch: 0,
  };
  let handledTx: any;
  const store: CustomerBatchWorkerStore<any> = {
    claim: async ({ workerId }) => {
      if (job.status !== 'queued') return null;
      Object.assign(job, { status: 'running', leaseOwner: workerId, leaseEpoch: 1 });
      return { ...job, workerId, leaseEpoch: 1 };
    },
    heartbeat: async () => true,
    state: async () => ({ status: job.status }),
    processNextItem: async () => ({ kind: 'empty' }),
    recordRetryableFailure: async () => false,
    settleCancelled: async () => false,
    finalize: async () => { job.status = 'succeeded'; return true; },
    processAggregate: async (_lease, process) => {
      await process({
        tx: { marker: 'aggregate-tx' },
        job,
        executionContext: { access: { actorId: 'u-1' } as any, actor: { id: 'u-1', name: '员工甲' }, roles: [] },
      });
      return 'processed';
    },
  };
  const handler: CustomerBatchJobHandler = {
    handlerKey: 'customer_export', executionKind: 'aggregate',
    processAggregate: async (input) => { handledTx = input.tx; return {}; },
  };
  const worker = createCustomerBatchWorker({ store, handlers: new CustomerBatchJobHandlerRegistry([handler]), workerId: 'worker-export' });
  assert.equal(await worker.runOnce(), 1);
  assert.equal(handledTx.marker, 'aggregate-tx');
  assert.equal(job.status, 'succeeded');
}

// RED: production startup owns one worker and drains it on both shutdown signals.
{
  const indexSource = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');
  assert.match(indexSource, /createPrismaCustomerBatchWorkerStore\(prisma/);
  assert.match(indexSource, /createCustomerMutationBatchJobHandler/);
  assert.match(indexSource, /createCustomerImportBatchJobHandler\(customerListService\)/);
  assert.match(indexSource, /customerBatchWorker\.start\(\)/);
  assert.match(indexSource, /const shutdown[\s\S]*customerBatchWorker\.stop\(\)/);
  assert.match(indexSource, /SIGTERM[\s\S]*shutdown\(\)/);
  assert.match(indexSource, /SIGINT[\s\S]*shutdown\(\)/);
}

console.log('customer batch worker tests passed');
