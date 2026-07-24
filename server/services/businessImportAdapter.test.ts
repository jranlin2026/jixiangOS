import assert from 'node:assert/strict';
import { consumePrecheckAndCreateJob } from './businessImportAdapter';
import { BusinessImportError } from './businessImportService';

const input = {
  tokenHash: 'a'.repeat(64), actorId: 'u-importer', type: 'orders' as const, rowsHash: 'b'.repeat(64),
  expiresAt: '2026-07-24T01:00:00.000Z', fileName: 'orders.xlsx',
  rows: [{ rowNumber: 2, status: 'ready' as const, reason: '可导入', normalized: {
    rowNumber: 2, customerName: '客户甲', customerPhone: '+8613800000000', customerWechat: '', productName: '训练营', orderType: '新购', paymentChannel: '企业微信转账', paymentAmount: '1', paidAt: '2026-07-23', salesUserName: '销售甲', thirdPartyOrderNo: '', remark: '',
  }, customerId: 'customer-1' }],
};

function createLockedPrisma(overrides: Partial<{ expiresAt: Date; actorId: string }> = {}) {
  const batch: any = { id: 'batch-1', actorId: overrides.actorId ?? 'u-importer', importType: 'orders', rowsHash: input.rowsHash, expiresAt: overrides.expiresAt ?? new Date('2099-01-01T00:00:00.000Z'), consumedAt: null };
  const jobs: any[] = [];
  let tail = Promise.resolve();
  const tx: any = {
    $queryRaw: async (strings: TemplateStringsArray) => {
      assert.match(strings.join(''), /FOR UPDATE/, 'token lookup must acquire a database row lock before creating a job');
      return [batch];
    },
    user: { findUnique: async () => ({ name: '导入员' }) },
    businessImportJob: { create: async ({ data }: any) => { jobs.push(data); return data; } },
    businessImportBatch: { update: async ({ data }: any) => { Object.assign(batch, data); return batch; } },
  };
  const prisma: any = {
    $transaction: async (operation: any) => {
      const previous = tail;
      let release!: () => void;
      tail = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      try { return await operation(tx); } finally { release(); }
    },
  };
  return { prisma, batch, jobs };
}

const locked = createLockedPrisma();
const [first, second] = await Promise.allSettled([
  consumePrecheckAndCreateJob(locked.prisma, input),
  consumePrecheckAndCreateJob(locked.prisma, input),
]);
assert.equal(first.status, 'fulfilled');
assert.equal(second.status, 'rejected');
assert.ok(second.status === 'rejected' && second.reason instanceof BusinessImportError && second.reason.status === 409,
  'the locked batch permits only one job to consume a signed token');
assert.equal(locked.jobs.length, 1);

const expired = createLockedPrisma({ expiresAt: new Date('2000-01-01T00:00:00.000Z') });
await assert.rejects(() => consumePrecheckAndCreateJob(expired.prisma, input), (error: unknown) => error instanceof BusinessImportError && error.status === 409);
const wrongActor = createLockedPrisma({ actorId: 'other-user' });
await assert.rejects(() => consumePrecheckAndCreateJob(wrongActor.prisma, input), (error: unknown) => error instanceof BusinessImportError && error.status === 409);

console.log('business import adapter: ok');
