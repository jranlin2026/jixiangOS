import assert from 'node:assert/strict';
import type { BusinessImportJobExecution, BusinessImportJobRow } from '../../src/types/businessImport';
import { createPrismaBusinessImportRowExecutor } from './businessImportExecutionAdapter';

const actor: any = { id: 'importer-5000', name: '导入员', isActive: true, permissions: [] };
const job: BusinessImportJobExecution = {
  id: 'job-5000', batchId: 'batch-5000', type: 'orders', status: 'running', actorId: actor.id, actorName: actor.name,
  totalCount: 5_000, successCount: 0, failedCount: 0, leaseOwner: 'worker', leaseEpoch: 1,
};
let snapshotLoads = 0;
let submissions = 0;
const executor = createPrismaBusinessImportRowExecutor({
  prisma: {} as any,
  loadExecutionSnapshot: async () => {
    snapshotLoads += 1;
    return { actor, directory: {
      products: [{ id: 'p1', name: '训练营', level: '899' }], orderTypes: [{ id: 'ot1', name: '新购' }],
      paymentChannels: ['企业微信转账'], users: [{ id: actor.id, name: actor.name }, { id: 'sales-1', name: '销售甲' }],
      recoveryPlatforms: [], recoveryShops: [], existingOrderNumbers: new Set(), existingRecoveryOrderNumbers: new Set(),
      customerMatchesByContact: new Map([['phone:+8613800000000', [{ id: 'customer-1', name: '客户甲', inScope: true }]]]),
    } };
  },
  orderApplications: { submitImported: async (_data, _actor, _metadata, idempotencyKey) => { submissions += 1; return { code: 0, data: { id: `oa-${idempotencyKey}` } }; } },
  recoveryOrders: { createImported: async () => { throw new Error('wrong module'); } },
});
const makeRow = (index: number): BusinessImportJobRow => ({
  rowNumber: index + 2, status: 'ready', reason: '可导入', customerId: 'customer-1', executionStatus: 'queued',
  normalized: {
    rowNumber: index + 2, customerName: '客户甲', customerPhone: '13800000000', customerWechat: '', productName: '训练营',
    orderType: '新购', paymentChannel: '企业微信转账', paymentAmount: 100, paidAt: '2026-07-25',
    salesUserName: '销售甲', creatorName: '', thirdPartyOrderNo: `TP-${index}`, remark: '',
  },
});

for (let index = 0; index < 5_000; index += 1) await executor.execute(job, makeRow(index));
assert.equal(submissions, 5_000);
assert.equal(snapshotLoads, 1, 'a 5000-row job preloads actor/directory/customer maps once rather than once per row');
executor.releaseJob(job);
await executor.execute(job, makeRow(0));
assert.equal(snapshotLoads, 2, 'job cache is explicitly released after finalize/stop');

console.log('business import execution adapter performance: ok');
