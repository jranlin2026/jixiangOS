import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { prisma } from '../server/db/client';
import { CustomerBatchJobHandlerRegistry } from '../server/services/customerBatchJobHandler';
import { createCustomerBatchWorker, createPrismaCustomerBatchWorkerStore } from '../server/services/customerBatchWorker';

type VerificationSummary = {
  prefix: string;
  schemaReady: boolean;
  idempotencyUnique: boolean;
  leaseRecovery: boolean;
  staleLeaseFenced: boolean;
  cancellation: boolean;
  cleanedUp: boolean;
};

const hash = (character: string) => character.repeat(64);

export async function verifyCustomerBatchFoundation(client: typeof prisma): Promise<VerificationSummary> {
  const prefix = `qa-cbf-${randomUUID().slice(0, 12)}`;
  const createJob = async (suffix: string, itemCount: number, idempotencyKey = `${prefix}-${suffix}`) => {
    const id = `${prefix}-${suffix}`;
    return client.customerBatchJob.create({
      data: {
        id,
        handlerKey: 'qa_noop',
        operation: 'set_progress',
        status: 'queued',
        selectionMode: 'ids',
        selectedCustomerIds: Array.from({ length: itemCount }, (_, index) => `${prefix}-customer-${index + 1}`),
        input: { lifecycleStatusCode: 'qa' },
        inputHash: hash('a'),
        idempotencyFingerprint: hash('b'),
        reason: '客户批量发布门禁自动验证',
        idempotencyKey,
        actorId: `${prefix}-actor`,
        actorName: '发布门禁验证',
        frozenCustomerCount: itemCount,
        totalCount: itemCount,
        items: {
          create: Array.from({ length: itemCount }, (_, index) => ({
            id: `${id}-item-${index + 1}`,
            targetKey: `customer:${prefix}-c-${index + 1}`,
            status: 'queued',
            idempotencyKey: `${id}:customer:${index + 1}`,
          })),
        },
      },
    });
  };

  const summary: VerificationSummary = {
    prefix,
    schemaReady: false,
    idempotencyUnique: false,
    leaseRecovery: false,
    staleLeaseFenced: false,
    cancellation: false,
    cleanedUp: false,
  };

  try {
    await client.$queryRawUnsafe('SELECT 1 FROM customer_batch_jobs LIMIT 1');
    await client.$queryRawUnsafe('SELECT 1 FROM customer_batch_job_items LIMIT 1');
    summary.schemaReady = true;

    const sharedKey = `${prefix}-same-submit`;
    const attempts = await Promise.allSettled([
      createJob('idem-a', 0, sharedKey),
      createJob('idem-b', 0, sharedKey),
    ]);
    summary.idempotencyUnique = attempts.filter((result) => result.status === 'fulfilled').length === 1
      && attempts.filter((result) => result.status === 'rejected').length === 1;

    await createJob('recovery', 2);
    const store = createPrismaCustomerBatchWorkerStore(client, {
      loadExecutionContext: async (_tx, actorId) => ({
        access: { actorId } as never,
        actor: { id: actorId, name: '发布门禁验证' },
        roles: [],
      }),
    });
    const handlers = new CustomerBatchJobHandlerRegistry([{
      handlerKey: 'qa_noop',
      executionKind: 'itemized',
      processItem: async () => ({}),
    }]);
    const workerA = createCustomerBatchWorker({ store, handlers, workerId: `${prefix}-worker-a`, leaseMs: 1_000 });
    const workerB = createCustomerBatchWorker({ store, handlers, workerId: `${prefix}-worker-b`, leaseMs: 1_000 });
    const leaseA = await workerA.claimBatchJob(`${prefix}-recovery`);
    if (!leaseA) throw new Error('发布门禁无法取得首个租约');
    await client.customerBatchJob.update({
      where: { id: `${prefix}-recovery` },
      data: { leaseExpiresAt: new Date(Date.now() - 1_000) },
    });
    const leaseB = await workerB.claimBatchJob(`${prefix}-recovery`);
    if (!leaseB) throw new Error('发布门禁无法恢复过期租约');
    summary.staleLeaseFenced = !(await workerA.heartbeatBatchJob(leaseA));
    summary.leaseRecovery = await workerB.processBatchJob(leaseB);

    await createJob('cancel', 3);
    const cancellationLease = await workerA.claimBatchJob(`${prefix}-cancel`);
    if (!cancellationLease) throw new Error('发布门禁无法取得取消任务租约');
    await client.customerBatchJob.update({
      where: { id: `${prefix}-cancel` },
      data: { status: 'cancel_requested', cancelRequestedAt: new Date() },
    });
    await workerA.processBatchJob(cancellationLease);
    const cancelled = await client.customerBatchJob.findUnique({
      where: { id: `${prefix}-cancel` },
      include: { items: true },
    });
    summary.cancellation = cancelled?.status === 'cancelled'
      && cancelled.items.length === 3
      && cancelled.items.every((item) => item.status === 'cancelled');
  } finally {
    await client.customerBatchJob.deleteMany({ where: { id: { startsWith: prefix } } });
    summary.cleanedUp = await client.customerBatchJob.count({ where: { id: { startsWith: prefix } } }) === 0;
  }

  if (Object.entries(summary).some(([key, value]) => key !== 'prefix' && value !== true)) {
    throw new Error(`客户批量发布门禁失败：${JSON.stringify(summary)}`);
  }
  return summary;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const summary = await verifyCustomerBatchFoundation(prisma);
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}
