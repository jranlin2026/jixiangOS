import assert from 'node:assert/strict';
import type { BusinessImportJobLease } from './businessImportExecution';
import { createPrismaBusinessImportJobStore } from './businessImportPersistence';

const clone = <T>(value: T): T => structuredClone(value);
const row: any = {
  id: 'job-stale', batchId: 'batch-stale', importType: 'orders', status: 'running', actorId: 'u1', actorName: '导入员',
  rows: [{ rowNumber: 2, status: 'ready', reason: '', normalized: {}, executionStatus: 'running' }],
  totalCount: 1, successCount: 0, failedCount: 0, leaseOwner: 'dead-worker', leaseEpoch: 1,
  leaseExpiresAt: new Date('2026-07-20T00:00:00Z'), startedAt: new Date('2026-07-19T23:59:00Z'), createdAt: new Date('2026-07-19T23:59:00Z'),
};
let batchStatus = 'queued';
const db: any = {
  $transaction: async (operation: any) => operation(db),
  $queryRaw: async (query: any, ...tagValues: any[]) => {
    const sql = (query.strings || query).join('');
    if (sql.includes('ORDER BY createdAt')) return clone(row.status === 'queued' || (row.status === 'running' && row.leaseExpiresAt < new Date('2026-07-20T00:00:02Z')) ? [row] : []);
    const [id, owner, epoch] = tagValues.length ? tagValues : (query.values || []);
    return id === row.id && owner === row.leaseOwner && Number(epoch) === row.leaseEpoch && row.status === 'running' ? [clone(row)] : [];
  },
  businessImportJob: {
    updateMany: async ({ where, data }: any) => {
      if (where.id !== row.id || (where.leaseEpoch !== undefined && where.leaseEpoch !== row.leaseEpoch) || (where.status && where.status !== row.status)) return { count: 0 };
      Object.entries(data).forEach(([key, value]: any) => { row[key] = value?.increment !== undefined ? Number(row[key] || 0) + value.increment : clone(value); });
      return { count: 1 };
    },
    findUnique: async () => clone(row),
    update: async ({ data }: any) => {
      Object.entries(data).forEach(([key, value]: any) => { row[key] = value?.increment !== undefined ? Number(row[key] || 0) + value.increment : clone(value); });
      return clone(row);
    },
  },
  businessImportBatch: { update: async ({ data }: any) => { batchStatus = data.status; } },
};

const store = createPrismaBusinessImportJobStore(db);
const lease = await store.claim({ workerId: 'restart-worker', now: new Date('2026-07-20T00:00:02Z'), leaseMs: 60_000 });
assert.ok(lease, '过期 running 任务必须可被新 worker 接管');
assert.equal(lease?.leaseEpoch, 2);
assert.equal(row.rows[0].executionStatus, 'queued', '重启接管必须恢复未落盘完成的 running 行');
const staleLease = { ...lease, leaseOwner: 'dead-worker', leaseEpoch: 1 } as BusinessImportJobLease;
assert.equal(await store.nextRow(staleLease), null, '旧租约不能继续写入');
const next = await store.nextRow(lease!);
assert.equal(next?.rowNumber, 2);
assert.equal(await store.markSucceeded(lease!, 2, 'oa-imported'), true);
assert.equal(await store.finalize(lease!), true);
assert.equal(row.status, 'succeeded');
assert.equal(batchStatus, 'succeeded');

console.log('business import persistence: ok');
