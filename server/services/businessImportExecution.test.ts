import assert from 'node:assert/strict';
import type { BusinessImportJobExecution, BusinessImportJobRow } from '../../src/types/businessImport';
import {
  createBusinessImportRowExecutor,
  createBusinessImportWorker,
  type BusinessImportJobStore,
} from './businessImportExecution';

const actor = { id: 'importer-1', name: '导入人' };
const users = [actor, { id: 'sales-1', name: '销售甲' }, { id: 'creator-1', name: '目标创建人' }];
const baseJob: BusinessImportJobExecution = {
  id: 'job-1', batchId: 'batch-1', type: 'orders', status: 'running', actorId: actor.id,
  actorName: actor.name, totalCount: 1, successCount: 0, failedCount: 0,
  leaseOwner: 'worker-1', leaseEpoch: 1,
};

const orderRow: BusinessImportJobRow = {
  rowNumber: 2, status: 'ready', reason: '可导入', customerId: 'customer-1', executionStatus: 'queued',
  normalized: {
    rowNumber: 2, customerName: '客户甲', customerPhone: '13800000000', customerWechat: '',
    productName: '课程A', orderType: '新单', paymentChannel: '企业微信转账', paymentAmount: 100,
    paidAt: '2026-07-20T00:00:00.000Z', paymentOrderNo: 'PAY-1', salesUserName: '销售甲',
    creatorName: '目标创建人', notes: '', thirdPartyOrderNo: 'TP-1', remark: '',
  },
};

{
  const calls: any[] = [];
  const executor = createBusinessImportRowExecutor({
    loadContext: async () => ({
      actor, users, products: [{ id: 'product-1', name: '课程A', level: '标准' }],
      orderTypes: [{ id: 'type-1', name: '新单' }], paymentChannels: ['企业微信转账'],
      customerMatches: [{ id: 'customer-1', name: '客户甲' }], recoveryPlatforms: [], recoveryShops: [],
    }),
    submitImportedOrderApplication: async (input) => { calls.push(input); return { id: 'oa-imported' }; },
    createImportedRecoveryOrder: async () => { throw new Error('wrong module'); },
  });
  const result = await executor.execute(baseJob, orderRow);
  assert.deepEqual(result, { recordId: 'oa-imported' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].applicant.id, actor.id, 'actual importer remains workflow applicant');
  assert.equal(calls[0].metadata.targetCreatorId, 'creator-1');
  assert.equal(calls[0].orderData.payments.length, 1, 'imports create exactly one payment');
  assert.equal('createFormalOrder' in calls[0], false, 'execution cannot request formal/downstream records');
}

{
  const recoveries: any[] = [];
  const executor = createBusinessImportRowExecutor({
    loadContext: async (_job, row) => ({
      actor, users, products: [], orderTypes: [], paymentChannels: ['对公银行转账'],
      customerMatches: row.rowNumber === 3 ? [{ id: 'customer-existing', name: '存量客户' }] : [],
      recoveryPlatforms: [{ id: 'platform-1', name: '抖音' }], recoveryShops: [{ id: 'shop-1', platformId: 'platform-1', name: '旗舰店' }],
    }),
    submitImportedOrderApplication: async () => { throw new Error('wrong module'); },
    createImportedRecoveryOrder: async (input) => { recoveries.push(input); return { id: `recovery-${input.row.rowNumber}` }; },
  });
  const recoveryRow = (rowNumber: number): BusinessImportJobRow => ({
    rowNumber, status: rowNumber === 2 ? 'warning' : 'ready', reason: '', executionStatus: 'queued',
    normalized: {
      rowNumber, customerName: '存量客户', customerPhone: '13900000000', customerWechat: '',
      originalProduct: '老课程', sourcePlatform: '抖音', sourceShop: '旗舰店', paymentChannel: '对公银行转账',
      originalAmount: 899, recoveryAmount: 299, recoveryAt: '2026-07-20T00:00:00.000Z',
      recoveryUserName: '销售甲', creatorName: '', thirdPartyOrderNo: `RCV-${rowNumber}`, remark: '',
    },
  });
  await executor.execute({ ...baseJob, type: 'recovery_orders' }, recoveryRow(2));
  await executor.execute({ ...baseJob, type: 'recovery_orders' }, recoveryRow(3));
  assert.equal(recoveries[0].customer.matchStatus, '售后临时客户');
  assert.equal(recoveries[0].customer.id, '');
  assert.equal(recoveries[1].customer.matchStatus, '已绑定客户');
  assert.equal(recoveries[1].customer.id, 'customer-existing');
  assert.equal(recoveries[0].metadata.targetCreatorId, actor.id, 'blank creator defaults to importer');
}

{
  let executions = 0;
  const rows: BusinessImportJobRow[] = [{ ...orderRow }];
  let status = 'queued';
  let leaseEpoch = 0;
  let leaseOwner: string | null = null;
  let leaseExpiresAt: Date | null = null;
  const store: BusinessImportJobStore = {
    claim: async ({ workerId, now, leaseMs }) => {
      if (status !== 'queued' && !(status === 'running' && leaseExpiresAt && leaseExpiresAt <= now)) return null;
      status = 'running'; leaseOwner = workerId; leaseEpoch += 1; leaseExpiresAt = new Date(now.getTime() + leaseMs);
      return { ...baseJob, status: 'running', leaseOwner, leaseEpoch };
    },
    nextRow: async (lease) => lease.leaseEpoch === leaseEpoch && rows[0]?.executionStatus === 'queued' ? rows[0] : null,
    markSucceeded: async (lease, rowNumber, recordId) => {
      if (lease.leaseEpoch !== leaseEpoch) return false;
      Object.assign(rows.find((row) => row.rowNumber === rowNumber)!, { executionStatus: 'succeeded', recordId }); return true;
    },
    markFailed: async () => true,
    finalize: async (lease) => { if (lease.leaseEpoch !== leaseEpoch) return false; status = 'succeeded'; return true; },
  };
  const workerA = createBusinessImportWorker({ store, executor: { execute: async () => { executions += 1; return { recordId: 'oa-once' }; } }, workerId: 'dead', now: () => new Date('2026-07-20T00:00:00Z'), leaseMs: 1000 });
  const stale = await workerA.claimJob();
  assert.ok(stale);
  leaseExpiresAt = new Date('2026-07-20T00:00:01Z');
  const workerB = createBusinessImportWorker({ store, executor: { execute: async () => { executions += 1; return { recordId: 'oa-once' }; } }, workerId: 'restart', now: () => new Date('2026-07-20T00:00:02Z'), leaseMs: 1000 });
  assert.equal(await workerB.runOnce(), 1, 'restart claims a stale running job');
  assert.equal(executions, 1);
  assert.equal(await workerA.processJob(stale!), false, 'stale lease cannot replay the row');
  assert.equal(executions, 1, 'successful rows are idempotently skipped');
}

console.log('business import execution: ok');
