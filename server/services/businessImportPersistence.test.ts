import assert from 'node:assert/strict';
import type { BusinessImportJobLease } from './businessImportExecution';
import { createBusinessImportReadRepository, createPrismaBusinessImportJobStore } from './businessImportPersistence';

const clone = <T>(value: T): T => structuredClone(value);
const originalRowsBlob = Array.from({ length: 5_000 }, (_, index) => ({ rowNumber: index + 2, status: 'ready', normalized: {} }));
const job: any = {
  id: 'job-stale', batchId: 'batch-stale', importType: 'orders', status: 'running', actorId: 'u1', actorName: '导入员',
  rows: originalRowsBlob, totalCount: 5_000, successCount: 0, failedCount: 0,
  leaseOwner: 'dead-worker', leaseEpoch: 1, leaseExpiresAt: new Date('2026-07-20T00:00:00Z'),
  startedAt: new Date('2026-07-19T23:59:00Z'), createdAt: new Date('2026-07-19T23:59:00Z'),
};
const items: any[] = originalRowsBlob.map((payload, index) => ({
  id: `item-${index + 2}`, jobId: job.id, rowNumber: index + 2,
  status: index === 0 ? 'running' : 'queued', payload, reservedNumber: index === 0 ? 'tp-2' : null,
  recordId: null, errorMessage: null,
}));
items[0].payload.customerId = 'internal-customer-id';
const reservations = new Map([['tp-2', { jobId: job.id, rowNumber: 2, normalizedNumber: 'tp-2' }]]);
let batchStatus = 'queued';
let jobRowsWrites = 0;
let itemQueries = 0;
let itemReadTake: number | undefined;
let businessRecordExists = false;
let jobReadArgs: any;
let batchReadArgs: any;
const apply = (target: any, data: any) => Object.entries(data).forEach(([key, value]: any) => {
  if (key === 'rows') jobRowsWrites += 1;
  target[key] = value?.increment !== undefined ? Number(target[key] || 0) + value.increment : clone(value);
});
const db: any = {
  $transaction: async (operation: any) => operation(db),
  $queryRaw: async (query: any, ...tagValues: any[]) => {
    const sql = (query.strings || query).join('');
    if (sql.includes('ORDER BY createdAt')) {
      assert.doesNotMatch(sql, /SELECT\s+\*/i, 'claim must not fetch the 5000-row JSON blob');
      return clone(job.status === 'queued' || (job.status === 'running' && job.leaseExpiresAt < new Date('2026-07-20T00:00:02Z')) ? [job] : []);
    }
    assert.doesNotMatch(sql, /SELECT\s+\*/i, 'per-row lease fencing must not fetch the 5000-row JSON blob');
    const [id, owner, epoch] = tagValues.length ? tagValues : (query.values || []);
    return id === job.id && owner === job.leaseOwner && Number(epoch) === job.leaseEpoch && job.status === 'running' ? [clone(job)] : [];
  },
  businessImportJob: {
    updateMany: async ({ where, data }: any) => {
      if (where.id !== job.id || (where.leaseOwner !== undefined && where.leaseOwner !== job.leaseOwner)
        || (where.leaseEpoch !== undefined && where.leaseEpoch !== job.leaseEpoch) || (where.status && where.status !== job.status)) return { count: 0 };
      apply(job, data); return { count: 1 };
    },
    findUnique: async (args: any) => { jobReadArgs = args; return clone(job); },
    update: async ({ data }: any) => { apply(job, data); return clone(job); },
  },
  businessImportJobItem: {
    updateMany: async ({ where, data }: any) => {
      itemQueries += 1;
      const matches = items.filter((item) => (!where.id || item.id === where.id) && (!where.jobId || item.jobId === where.jobId)
        && (where.rowNumber === undefined || item.rowNumber === where.rowNumber) && (!where.status || item.status === where.status));
      matches.forEach((item) => apply(item, data)); return { count: matches.length };
    },
    findFirst: async ({ where }: any) => { itemQueries += 1; return clone(items.find((item) => item.jobId === where.jobId && item.status === where.status) || null); },
    findUnique: async ({ where }: any) => { itemQueries += 1; const key = where.jobId_rowNumber; return clone(items.find((item) => item.jobId === key.jobId && item.rowNumber === key.rowNumber) || null); },
    groupBy: async ({ where }: any) => {
      itemQueries += 1;
      return [...new Set(items.filter((item) => item.jobId === where.jobId).map((item) => item.status))]
        .map((status) => ({ status, _count: { _all: items.filter((item) => item.jobId === where.jobId && item.status === status).length } }));
    },
    findMany: async ({ where, take }: any) => {
      itemReadTake = take;
      const matched = items.filter((item) => item.jobId === where.jobId && (!where.status || item.status === where.status));
      return clone(take === undefined ? matched : matched.slice(0, take));
    },
  },
  businessImportNumberReservation: {
    deleteMany: async ({ where }: any) => {
      const existing = reservations.get(where.normalizedNumber);
      if (!existing || existing.jobId !== where.jobId || existing.rowNumber !== where.rowNumber) return { count: 0 };
      reservations.delete(where.normalizedNumber); return { count: 1 };
    },
  },
  businessRecord: { findFirst: async () => businessRecordExists ? { id: 'created-business-record' } : null },
  businessImportBatch: {
    update: async ({ data }: any) => { batchStatus = data.status; },
    findUnique: async (args: any) => { batchReadArgs = args; return { id: 'batch-stale', importType: 'orders', status: job.status, actorId: 'u1', sourceFileName: 'large.xlsx', totalCount: 5_000, readyCount: 5_000, warningCount: 0, blockedCount: 0, createdAt: new Date(), jobs: [clone(job)] }; },
  },
};

const store = createPrismaBusinessImportJobStore(db);
const lease = await store.claim({ workerId: 'restart-worker', now: new Date('2026-07-20T00:00:02Z'), leaseMs: 60_000 });
assert.ok(lease, '过期 running 任务必须可被新 worker 接管');
assert.equal(items[0].status, 'queued', '重启只恢复独立 item，不重写 5000 行 JSON');
assert.equal(jobRowsWrites, 0);
const staleLease = { ...lease, leaseOwner: 'dead-worker', leaseEpoch: 1 } as BusinessImportJobLease;
assert.equal(await store.heartbeat(staleLease, 60_000, new Date('2026-07-20T00:00:03Z')), false);
assert.equal(await store.heartbeat(lease!, 60_000, new Date('2026-07-20T00:00:03Z')), true);
assert.equal(await store.nextRow(staleLease), null, '旧租约不能继续写入');
const next = await store.nextRow(lease!);
assert.equal(next?.rowNumber, 2);
assert.equal(next?.customerId, 'internal-customer-id', '后台执行读取必须保留预检锁定的客户 ID');
assert.equal(await store.markSucceeded(lease!, 2, 'oa-imported'), true);
assert.equal(items[0].recordId, 'oa-imported');
assert.equal(reservations.has('tp-2'), true, '成功行保留号码保护');
assert.equal(jobRowsWrites, 0, 'next/mark never rewrite the 5000-row job blob');
assert.ok(itemQueries <= 4, 'one row uses bounded indexed item queries independent of 5000-row batch size');
items.slice(1).forEach((item) => { item.status = 'succeeded'; });
assert.equal(await store.finalize(lease!), true);
assert.equal(job.status, 'succeeded');
assert.equal(batchStatus, 'succeeded');

job.status = 'running'; job.leaseOwner = 'restart-worker'; job.leaseEpoch = 2;
items[0] = { ...items[0], status: 'running', recordId: null, reservedNumber: 'tp-2' };
reservations.set('tp-2', { jobId: job.id, rowNumber: 2, normalizedNumber: 'tp-2' });
assert.equal(await store.markFailed(staleLease, 2, '旧租约'), false);
assert.equal(reservations.has('tp-2'), true, '旧租约不能释放号码');
assert.equal(await store.markFailed(lease!, 2, '客户匹配结果已变化，订单导入已停止'), true);
assert.equal(reservations.has('tp-2'), false, '未创建业务记录的失败行精确释放号码，便于修正后重导');
reservations.set('tp-2', { jobId: 'corrected-job', rowNumber: 2, normalizedNumber: 'tp-2' });
assert.equal(reservations.get('tp-2')?.jobId, 'corrected-job', '释放后修正批次可重新占用该号码');
reservations.delete('tp-2');
items[0] = { ...items[0], status: 'running', reservedNumber: 'tp-2' };
reservations.set('tp-2', { jobId: job.id, rowNumber: 2, normalizedNumber: 'tp-2' });
businessRecordExists = true;
assert.equal(await store.markFailed(lease!, 2, '响应丢失'), true);
assert.equal(reservations.has('tp-2'), true, '已创建业务记录的行必须保留号码保护');

job.status = 'running';
items.slice(0, 100).forEach((item) => { item.status = 'failed'; item.errorMessage = '执行失败'; });
const runningJob = await createBusinessImportReadRepository(db).getJob(job.id, { id: 'u1' } as any);
assert.ok(jobReadArgs?.select, 'running getJob 必须使用 select 排除 jobs.rows');
assert.equal(jobReadArgs.select.rows, undefined, 'running getJob 不得读取 5000 行 JSON');
assert.equal(runningJob?.rows, undefined, '轮询中不得返回 5000 行完整 payload');
assert.ok((((runningJob as any)?.failedRowSample as any[] | undefined)?.length || 0) <= 20, '运行中失败摘要有固定上限');
assert.equal(itemReadTake, 20, '运行中查询必须在数据库层限制行数');
assert.ok(Buffer.byteLength(JSON.stringify(runningJob), 'utf8') < 50_000, '5000 行运行中轮询响应必须保持有界');
await createBusinessImportReadRepository(db).getBatch('batch-stale', { id: 'u1' } as any);
assert.ok(batchReadArgs?.select?.jobs?.select, 'getBatch 的 jobs 必须使用 select');
assert.equal(batchReadArgs.select.jobs.select.rows, undefined, 'getBatch 不得读取任务的大 JSON');

items[0].errorMessage = 'INSERT INTO business_records password=secret\nError at /private/server.ts:99';
job.status = 'failed';
const publicJob = await createBusinessImportReadRepository(db).getJob(job.id, { id: 'u1' } as any);
assert.equal(publicJob?.rows?.[0].errorMessage, '导入执行失败，请重试或联系管理员');
assert.doesNotMatch(JSON.stringify(publicJob), /INSERT|password|secret|private\/server/i);
assert.doesNotMatch(JSON.stringify(publicJob), /internal-customer-id/, '导入任务查询不得向售后返回内部 CRM 客户 ID');

console.log('business import persistence: ok');
