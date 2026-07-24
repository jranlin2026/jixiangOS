import assert from 'node:assert/strict';
import { businessImportScopeDomain, consumePrecheckAndCreateJob } from './businessImportAdapter';
import { BusinessImportError } from './businessImportService';

const input = {
  tokenHash: 'a'.repeat(64), actorId: 'u-importer', type: 'orders' as const, rowsHash: 'b'.repeat(64),
  expiresAt: '2026-07-24T01:00:00.000Z', fileName: 'orders.xlsx',
  rows: [{ rowNumber: 2, status: 'ready' as const, reason: '可导入', normalized: {
    rowNumber: 2, customerName: '客户甲', customerPhone: '+8613800000000', customerWechat: '', productName: '训练营', orderType: '新购', paymentChannel: '企业微信转账', paymentAmount: '1', paidAt: '2026-07-23', salesUserName: '销售甲', thirdPartyOrderNo: '', remark: '',
  }, customerId: 'customer-1' }],
};

assert.equal(businessImportScopeDomain('orders'), 'orders');
assert.equal(businessImportScopeDomain('recovery_orders'), 'recoveryOrderApplications', 'recovery template/precheck/execution use the review-application scope');

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
    businessImportJobItem: { createMany: async () => ({ count: input.rows.length }) },
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
assert.ok(first.status === 'fulfilled' && first.value.batchId === 'batch-1', 'adapter confirmation returns its consumed batch id');
assert.equal(second.status, 'rejected');
assert.ok(second.status === 'rejected' && second.reason instanceof BusinessImportError && second.reason.status === 409,
  'the locked batch permits only one job to consume a signed token');
assert.equal(locked.jobs.length, 1);
assert.equal((locked as any).reservations?.size || 0, 0, 'blank ordinary-order numbers do not reserve a business number');

const expired = createLockedPrisma({ expiresAt: new Date('2000-01-01T00:00:00.000Z') });
await assert.rejects(() => consumePrecheckAndCreateJob(expired.prisma, input), (error: unknown) => error instanceof BusinessImportError && error.status === 409);
const wrongActor = createLockedPrisma({ actorId: 'other-user' });
await assert.rejects(() => consumePrecheckAndCreateJob(wrongActor.prisma, input), (error: unknown) => error instanceof BusinessImportError && error.status === 409);

function createReservationPrisma() {
  const batches = new Map([
    ['token-a', { id: 'batch-a', actorId: 'u-importer', importType: 'orders', rowsHash: input.rowsHash, expiresAt: new Date('2099-01-01T00:00:00.000Z'), consumedAt: null }],
    ['token-b', { id: 'batch-b', actorId: 'u-importer', importType: 'orders', rowsHash: input.rowsHash, expiresAt: new Date('2099-01-01T00:00:00.000Z'), consumedAt: null }],
  ]);
  const reservations = new Map<string, any>();
  const jobs: any[] = [];
  let tail = Promise.resolve();
  const tx: any = {
    $queryRaw: async (_strings: TemplateStringsArray, token: string) => [batches.get(token)],
    user: { findUnique: async () => ({ name: '导入员' }) },
    businessImportNumberReservation: {
      createMany: async ({ data }: any) => {
        for (const reservation of data) {
          const key = `${reservation.importType}:${reservation.normalizedNumber}`;
          if (reservations.has(key)) throw Object.assign(new Error('duplicate'), { code: 'P2002' });
          reservations.set(key, reservation);
        }
      },
      updateMany: async ({ where, data }: any) => {
        for (const reservation of reservations.values()) if (reservation.batchId === where.batchId && reservation.jobId === null) Object.assign(reservation, data);
      },
    },
    businessImportJob: { create: async ({ data }: any) => { jobs.push(data); return data; } },
    businessImportJobItem: { createMany: async () => ({ count: input.rows.length }) },
    businessImportBatch: { update: async ({ where, data }: any) => {
      const batch = Array.from(batches.values()).find((candidate) => candidate.id === where.id);
      if (!batch) throw new Error('batch missing');
      Object.assign(batch, data);
    } },
  };
  return {
    prisma: {
      $transaction: async (operation: any) => {
        const previous = tail;
        let release!: () => void;
        tail = new Promise<void>((resolve) => { release = resolve; });
        await previous;
        try { return await operation(tx); } finally { release(); }
      },
    } as any,
    reservations,
    jobs,
  };
}

const reservationPrisma = createReservationPrisma();
const numbered = { ...input, rows: [{ ...input.rows[0], normalized: { ...input.rows[0].normalized, thirdPartyOrderNo: 'TP-CONCURRENT' } }] };
const [numberFirst, numberSecond] = await Promise.allSettled([
  consumePrecheckAndCreateJob(reservationPrisma.prisma, { ...numbered, tokenHash: 'token-a' }),
  consumePrecheckAndCreateJob(reservationPrisma.prisma, { ...numbered, tokenHash: 'token-b' }),
]);
assert.equal(numberFirst.status, 'fulfilled');
assert.ok(numberSecond.status === 'rejected' && numberSecond.reason instanceof BusinessImportError && numberSecond.reason.status === 409,
  'two valid prechecks for the same normalized number produce one queued job and one sanitized conflict');
assert.equal(reservationPrisma.jobs.length, 1);
assert.equal(reservationPrisma.reservations.get('orders:tp-concurrent')?.batchId, 'batch-a');
assert.equal(reservationPrisma.reservations.get('orders:tp-concurrent')?.jobId, reservationPrisma.jobs[0]?.id);
assert.equal(reservationPrisma.reservations.get('orders:tp-concurrent')?.rowNumber, 2);

console.log('business import adapter: ok');
