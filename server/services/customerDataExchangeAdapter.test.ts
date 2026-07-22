import assert from 'node:assert/strict';
import { createCustomerImportBatchJobHandler, enqueueCustomerImportExecution, loadExistingCustomerImportFacts } from './customerDataExchangeAdapter';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';

let sql = '';
const prisma = {
  $queryRaw: async (query: { strings?: readonly string[] }) => {
    sql = query.strings?.join('?') || '';
    return [{ phone: '0086 138 0000 0000', wechat: ' WX-CUSTOMER ', name: ' 醉一鸣官方号 ' }];
  },
};

const facts = await loadExistingCustomerImportFacts(prisma as any, [{
  rowNumber: 2,
  name: '醉一鸣官方号',
  phone: '+8613800000000',
  wechat: 'wx-customer',
  company: '',
  ownerName: '',
  lifecycleStatus: '',
  customerLevel: '',
  leadSource: '',
  industry: '',
  city: '',
  tagNames: '',
  remark: '',
}]);

assert.deepEqual([...facts.contactKeys].sort(), ['phone:+8613800000000', 'wechat:wx-customer']);
assert.deepEqual([...facts.customerNames], ['醉一鸣官方号']);
assert.match(sql, /REGEXP_REPLACE/);
assert.match(sql, /LOWER\(TRIM/);

const internationalFacts = await loadExistingCustomerImportFacts({
  $queryRaw: async () => [{ phone: '+1 3800000000', wechat: null, name: null }],
} as any, [{
  rowNumber: 2, name: '中国客户', phone: '+8613800000000', wechat: '', company: '', ownerName: '', lifecycleStatus: '',
  customerLevel: '', leadSource: '', industry: '', city: '', tagNames: '', remark: '',
}]);
assert.deepEqual([...internationalFacts.contactKeys], ['phone:+13800000000']);
assert.equal(internationalFacts.contactKeys.has('phone:+8613800000000'), false, '合法国际号码不得折叠成中国大陆号码');

let createCall: any;
const importHandler = createCustomerImportBatchJobHandler({
  create: async (input: any, user: any, execution: any) => {
    createCall = { input, user, execution };
    return { code: 0, message: 'success', data: { id: 'c-imported' } } as any;
  },
} as any);
const handled = await importHandler.processItem!({
  tx: { marker: 'same-transaction' } as any,
  job: { id: 'import-job', actorId: 'u1', actorName: '销售甲', handlerKey: 'customer_import', operation: 'import', input: {}, inputHash: 'hash', reason: '批量导入客户' },
  item: {
    id: 'item-1', jobId: 'import-job', targetKey: 'row:000001', idempotencyKey: 'import-job:row:000001',
    beforeSnapshot: {
      rowNumber: 2, name: '醉一鸣官方号', destination: 'assigned', lastFollowUpRecord: '已确认报价',
      input: { name: '醉一鸣官方号', phone: '+8613800000000', remark: '客户备注' },
    },
  },
  executionContext: {
    access: {} as any, actor: { id: 'u1', name: '销售甲' }, roles: [],
    user: { id: 'u1', name: '销售甲', account: 'sales', role: '销售', isActive: true, permissions: [{ module: PERMISSION_KEYS.CUSTOMER_IMPORT, actions: ['write'] }] } as any,
  },
}, {
  jobId: 'import-job', workerId: 'worker', leaseEpoch: 1,
  assertActive: async () => undefined, heartbeat: async () => undefined, cancellationRequested: async () => false,
});
assert.equal(createCall.input.remark, '客户备注');
assert.equal(createCall.execution.importedLastFollowUpRecord, '已确认报价');
assert.equal(createCall.execution.tx.marker, 'same-transaction');
assert.equal((handled.afterSnapshot as any).customerId, 'c-imported');
await assert.rejects(() => importHandler.processItem!({
  tx: {} as any,
  job: { id: 'import-job-2', actorId: 'u1', actorName: '销售甲', handlerKey: 'customer_import', operation: 'import', input: {}, inputHash: 'hash', reason: '批量导入客户' },
  item: {
    id: 'item-2', jobId: 'import-job-2', targetKey: 'row:000002', idempotencyKey: 'import-job-2:row:000002',
    beforeSnapshot: { rowNumber: 3, name: '历史客户', destination: 'assigned', input: { name: '历史客户', phone: '+8613800000001', previousOwner: '销售乙' } },
  },
  executionContext: {
    access: {} as any, actor: { id: 'u1', name: '销售甲' }, roles: [],
    user: { id: 'u1', name: '销售甲', account: 'sales', role: '销售', isActive: true, permissions: [{ module: PERMISSION_KEYS.CUSTOMER_IMPORT, actions: ['write'] }] } as any,
  },
}, {
  jobId: 'import-job-2', workerId: 'worker', leaseEpoch: 1,
  assertActive: async () => undefined, heartbeat: async () => undefined, cancellationRequested: async () => false,
}), /无权导入历史销售负责人/);

const queuedItems: any[] = [];
let queuedJob: any;
const now = new Date(Date.now() + 60_000);
const enqueuePrisma: any = {
  $transaction: async (operation: any) => operation({
    $queryRaw: async () => [{
      id: 'precheck-1', actorId: 'u1', normalizedRowsHash: 'rows-hash', expiresAt: now,
      consumedAt: null, consumedResultId: null, guardManifest: { totalCount: 2, destination: 'assigned' },
    }],
    customerBatchJob: {
      create: async ({ data }: any) => { queuedJob = { ...data, createdAt: new Date(), successCount: 0, failedCount: 0, skippedCount: 0, cancelledCount: 0 }; },
      update: async ({ data }: any) => { Object.assign(queuedJob, data); },
      findUnique: async () => queuedJob,
    },
    customerBatchJobItem: { createMany: async ({ data }: any) => { queuedItems.push(...data); } },
    customerBatchPrecheck: { update: async () => undefined },
  }),
};
const queued = await enqueueCustomerImportExecution(enqueuePrisma, {
  token: 'token', actorId: 'u1', actorName: '销售甲', rowsHash: 'rows-hash', totalCount: 2, destination: 'assigned',
  rows: [
    { index: 0, row: { rowNumber: 2, name: '客户甲', status: 'ready', reason: '可导入' }, input: { name: '客户甲', phone: '+8613800000000', remark: '备注甲' } as any, lastFollowUpRecord: '跟进甲' },
    { index: 1, row: { rowNumber: 3, name: '客户乙', status: 'failed', reason: '手机号或微信在系统中已存在客户' } },
  ],
});
assert.equal(queued.status, 'queued');
assert.equal(queued.failedCount, 1);
assert.deepEqual(queuedItems.map((item) => item.status), ['queued', 'failed']);
assert.equal(queuedItems[0].beforeSnapshot.input.remark, '备注甲');
assert.equal(queuedItems[0].beforeSnapshot.lastFollowUpRecord, '跟进甲');
assert.equal(queuedItems[1].errorCode, 'CUSTOMER_IMPORT_PRECHECK_BLOCKED');

console.log('customer data exchange adapter: ok');
