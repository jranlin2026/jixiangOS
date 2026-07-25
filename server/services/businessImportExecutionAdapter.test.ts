import assert from 'node:assert/strict';
import type { BusinessImportJobExecution, BusinessImportJobRow } from '../../src/types/businessImport';
import { createPrismaBusinessImportRowExecutor } from './businessImportExecutionAdapter';

const actor: any = { id: 'importer-5000', name: '导入员', isActive: true, permissions: [{ module: '订单/订单列表/导入订单', actions: ['read', 'write'] }] };
const job: BusinessImportJobExecution = {
  id: 'job-5000', batchId: 'batch-5000', type: 'orders', status: 'running', actorId: actor.id, actorName: actor.name,
  totalCount: 5_000, successCount: 0, failedCount: 0, leaseOwner: 'worker', leaseEpoch: 1,
};
let snapshotLoads = 0;
let actorLoads = 0;
let revisionLoads = 0;
let submissions = 0;
let simulatedNow = 0;
const executor = createPrismaBusinessImportRowExecutor({
  prisma: {} as any,
  loadExecutionActor: async () => { actorLoads += 1; simulatedNow += 501; return actor; },
  loadExecutionRevision: async () => { revisionLoads += 1; return 1; },
  now: () => simulatedNow,
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

let importerEnabled = true;
let revocationSubmissions = 0;
const revocationExecutor = createPrismaBusinessImportRowExecutor({
  prisma: {} as any,
  loadExecutionActor: async () => ({
    ...actor,
    isActive: importerEnabled,
    permissions: importerEnabled ? [{ module: '订单/订单列表/导入订单', actions: ['read', 'write'] }] : [],
  }),
  loadExecutionRevision: async () => 1,
  loadExecutionSnapshot: async () => ({ actor, directory: {
    products: [{ id: 'p1', name: '训练营', level: '899' }], orderTypes: [{ id: 'ot1', name: '新购' }],
    paymentChannels: ['企业微信转账'], users: [{ id: actor.id, name: actor.name }, { id: 'sales-1', name: '销售甲' }],
    recoveryPlatforms: [], recoveryShops: [], existingOrderNumbers: new Set(), existingRecoveryOrderNumbers: new Set(),
    customerMatchesByContact: new Map([['phone:+8613800000000', [{ id: 'customer-1', name: '客户甲', inScope: true }]]]),
  } }),
  orderApplications: { submitImported: async () => { revocationSubmissions += 1; return { code: 0, data: { id: `revocation-${revocationSubmissions}` } }; } },
  recoveryOrders: { createImported: async () => { throw new Error('wrong module'); } },
} as any);
await revocationExecutor.execute(job, makeRow(0));
importerEnabled = false;
await assert.rejects(
  () => revocationExecutor.execute(job, makeRow(1)),
  /导入人不存在或已停用|权限已变化/,
  '长任务的每一行执行前必须重新确认导入人仍在职且有权限',
);
assert.equal(revocationSubmissions, 1, '撤权后的后续行不得提交');

let directoryRevision = 1;
let salesEnabled = true;
let invalidationSnapshotLoads = 0;
let invalidationSubmissions = 0;
const invalidationExecutor = createPrismaBusinessImportRowExecutor({
  prisma: {} as any,
  loadExecutionActor: async () => actor,
  loadExecutionRevision: async () => directoryRevision,
  loadExecutionSnapshot: async () => {
    invalidationSnapshotLoads += 1;
    return { actor, directory: {
      products: [{ id: 'p1', name: '训练营', level: '899' }], orderTypes: [{ id: 'ot1', name: '新购' }],
      paymentChannels: ['企业微信转账'], users: [{ id: actor.id, name: actor.name }, ...(salesEnabled ? [{ id: 'sales-1', name: '销售甲' }] : [])],
      recoveryPlatforms: [], recoveryShops: [], existingOrderNumbers: new Set(), existingRecoveryOrderNumbers: new Set(),
      customerMatchesByContact: new Map([['phone:+8613800000000', [{ id: 'customer-1', name: '客户甲', inScope: true }]]]),
    } };
  },
  orderApplications: { submitImported: async () => { invalidationSubmissions += 1; return { code: 0, data: { id: `invalidation-${invalidationSubmissions}` } }; } },
  recoveryOrders: { createImported: async () => { throw new Error('wrong module'); } },
} as any);
await invalidationExecutor.execute(job, makeRow(0));
salesEnabled = false;
directoryRevision += 1;
for (let index = 1; index < 25; index += 1) await invalidationExecutor.execute(job, makeRow(index));
await assert.rejects(
  () => invalidationExecutor.execute(job, makeRow(25)),
  /销售人员不存在、已停用或姓名不唯一/,
  '员工停用等关键事实版本变化后，下一行必须重载目录',
);
assert.equal(invalidationSnapshotLoads, 2);
assert.equal(invalidationSubmissions, 25);

for (let index = 0; index < 5_000; index += 1) await executor.execute(job, makeRow(index));
assert.equal(submissions, 5_000);
assert.equal(snapshotLoads, 1, 'a 5000-row job preloads actor/directory/customer maps once rather than once per row');
assert.equal(actorLoads, 5_000, '每行都执行一次轻量权威的导入人状态与权限校验');
assert.equal(revisionLoads, 200, '即使每行超过 500ms，目录 revision 仍固定每 25 行检查一次');
executor.releaseJob(job);
await executor.execute(job, makeRow(0));
assert.equal(snapshotLoads, 2, 'job cache is explicitly released after finalize/stop');

console.log('business import execution adapter performance: ok');
