import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { createBusinessImportService, BusinessImportError } from './businessImportService';
import { consumePrecheckAndCreateJob } from './businessImportAdapter';

if (!process.env.DATABASE_URL) {
  console.log('business import reservation integration skipped: DATABASE_URL is not set');
} else {
  const prisma = new PrismaClient();
  const runId = randomUUID();
  const actorId = `business-import-it-${runId}`;
  const batchIds: string[] = [];
  const actor = {
    id: actorId, name: '导入并发测试员', account: `import-${runId}`, email: `import-${runId}@example.test`, phone: '',
    role: 'integration_test', isActive: true,
    permissions: [{ module: '售后服务/售后挽回订单列表/导入售后挽回订单', actions: ['read', 'write'] }],
  } as any;
  const row = {
    rowNumber: 2, customerName: '未匹配客户', customerPhone: '13900000009', customerWechat: '', originalProduct: '',
    sourcePlatform: '', sourceShop: '', paymentChannel: '', originalAmount: '', paymentOrderNo: '', paymentAt: '',
    recoveryAmount: '1', recoveryAt: '2026-07-24', recoveryUserName: actor.name, assistUserName: '', creatorName: '',
    thirdPartyOrderNo: `REC-CONCURRENT-${runId}`, remark: '',
  };

  try {
    await prisma.user.create({ data: { id: actorId, name: actor.name, account: actor.account, email: actor.email, phone: '', role: actor.role, isActive: true } });
    const service = createBusinessImportService({
      secret: 'business-import-live-reservation-signing-secret',
      loadDirectory: async () => ({
        products: [], orderTypes: [], paymentChannels: [], users: [{ id: actorId, name: actor.name }],
        recoveryPlatforms: [], recoveryShops: [], customerMatchesByContact: new Map(),
        existingOrderNumbers: new Set(), existingRecoveryOrderNumbers: new Set(),
      }),
      persistPrecheck: async (record) => {
        const batchId = `business-import-it-batch-${randomUUID()}`;
        batchIds.push(batchId);
        await prisma.businessImportBatch.create({ data: {
          id: batchId, importType: record.type, status: 'prechecked', actorId: record.actorId, actorName: actor.name,
          tokenHash: record.tokenHash, rowsHash: record.rowsHash,
          rows: record.rows as any, totalCount: record.totalCount,
          readyCount: record.rows.filter((item) => item.status !== 'blocked').length,
          warningCount: record.rows.filter((item) => item.status === 'warning').length,
          blockedCount: record.rows.filter((item) => item.status === 'blocked').length,
          expiresAt: new Date(record.expiresAt),
        } });
      },
      consumePrecheckAndCreateJob: (input) => consumePrecheckAndCreateJob(prisma, input),
    });

    const [firstPrecheck, secondPrecheck] = await Promise.all([
      service.precheck({ type: 'recovery_orders', rows: [row] }, actor),
      service.precheck({ type: 'recovery_orders', rows: [row] }, actor),
    ]);
    const [first, second] = await Promise.allSettled([
      service.confirm({ type: 'recovery_orders', rows: [row], confirmationToken: firstPrecheck.confirmationToken, fileName: 'first.xlsx' }, actor),
      service.confirm({ type: 'recovery_orders', rows: [row], confirmationToken: secondPrecheck.confirmationToken, fileName: 'second.xlsx' }, actor),
    ]);
    const outcomes = [first, second];
    assert.equal(outcomes.filter((result) => result.status === 'fulfilled').length, 1);
    const rejected = outcomes.find((result) => result.status === 'rejected');
    assert.ok(rejected?.status === 'rejected' && rejected.reason instanceof BusinessImportError && rejected.reason.status === 409,
      'the actual MySQL unique reservation index must reject the competing confirmation with 409');
    const jobs = await prisma.businessImportJob.findMany({ where: { batchId: { in: batchIds } } });
    assert.equal(jobs.length, 1);
    const reservations = await prisma.businessImportNumberReservation.findMany({ where: { batchId: { in: batchIds } } });
    assert.equal(reservations.length, 1);
    assert.equal(reservations[0]?.jobId, jobs[0]?.id, 'the reservation remains associated with the queued job for Task 2');
  } finally {
    if (batchIds.length) {
      await prisma.businessImportNumberReservation.deleteMany({ where: { batchId: { in: batchIds } } });
      await prisma.businessImportJob.deleteMany({ where: { batchId: { in: batchIds } } });
      await prisma.businessImportBatch.deleteMany({ where: { id: { in: batchIds } } });
    }
    await prisma.user.deleteMany({ where: { id: actorId } });
    await prisma.$disconnect();
  }
  console.log('business import reservation integration: ok');
}
