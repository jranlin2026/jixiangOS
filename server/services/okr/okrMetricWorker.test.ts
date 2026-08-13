import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createOkrMetricWorker } from './okrMetricWorker';

function memoryPrisma() {
  const bindings: any[] = [
    { id: 'binding-a', keyResultId: 'kr-a', nextRefreshAt: new Date('2026-08-13T01:00:00Z'), leaseOwner: null, leaseEpoch: 0, leaseExpiresAt: null, active: true },
    { id: 'binding-b', keyResultId: 'kr-b', nextRefreshAt: new Date('2026-08-13T01:00:00Z'), leaseOwner: null, leaseEpoch: 0, leaseExpiresAt: null, active: true },
  ];
  const match = (row: any, where: any): boolean => Object.entries(where || {}).every(([key, value]: any) => {
    if (key === 'OR') return value.some((part: any) => match(row, part));
    if (key === 'keyResult') return row.active === true;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if ('lte' in value) return row[key] !== null && row[key] <= value.lte;
    }
    if (value === null) return row[key] == null;
    return row[key] === value;
  });
  const model = {
    findFirst: async ({ where }: any) => bindings.find((row) => match(row, where)) || null,
    updateMany: async ({ where, data }: any) => {
      const rows = bindings.filter((row) => match(row, where));
      for (const row of rows) {
        for (const [key, value] of Object.entries(data)) row[key] = (value as any)?.increment === undefined ? value : row[key] + (value as any).increment;
      }
      return { count: rows.length };
    },
  };
  const prisma: any = { okrMetricBinding: model };
  prisma.$transaction = async (work: any) => work(prisma);
  return { prisma, bindings };
}

test('two workers use a database lease so each due binding is refreshed once', async () => {
  const { prisma, bindings } = memoryPrisma();
  const calls: string[] = [];
  const now = () => new Date('2026-08-13T02:00:00Z');
  const service: any = { refreshSystem: async (id: string) => { calls.push(id); return { code: 0 }; } };
  const first = createOkrMetricWorker({ prisma, service, workerId: 'worker-a', now, batchSize: 2 });
  const second = createOkrMetricWorker({ prisma, service, workerId: 'worker-b', now, batchSize: 2 });

  await Promise.all([first.runOnce(), second.runOnce()]);

  assert.deepEqual(calls.sort(), ['kr-a', 'kr-b']);
});

test('worker isolates a blocked binding and continues its claimed batch', async () => {
  const { prisma } = memoryPrisma();
  const calls: string[] = [];
  const worker = createOkrMetricWorker({
    prisma, workerId: 'worker-a', now: () => new Date('2026-08-13T02:00:00Z'), batchSize: 2,
    service: { refreshSystem: async (id: string) => { calls.push(id); return { code: id === 'kr-a' ? 409 : 0 } as any; } },
  });
  assert.deepEqual(await worker.runOnce(), { scanned: 2, succeeded: 1, blocked: 1 });
  assert.deepEqual(calls, ['kr-a', 'kr-b']);
});

test('stop has a bounded wait even when a provider does not return', async () => {
  const { prisma } = memoryPrisma();
  const never = new Promise(() => undefined);
  const worker = createOkrMetricWorker({
    prisma, workerId: 'worker-a', now: () => new Date('2026-08-13T02:00:00Z'), stopTimeoutMs: 10,
    service: { refreshSystem: async () => never as any },
  });
  worker.start();
  const startedAt = Date.now();
  await worker.stop();
  assert.ok(Date.now() - startedAt < 500, 'shutdown must not wait forever for an external metric provider');
});

test('server starts and gracefully stops the OKR metric worker', async () => {
  const source = await readFile(new URL('../../index.ts', import.meta.url), 'utf8');
  assert.match(source, /createOkrMetricWorker\(\{[\s\S]*?service:\s*okrMetricService/);
  assert.match(source, /okrMetricWorker\.start\(\)/);
  assert.match(source, /await okrMetricWorker\.stop\(\)/);
});
