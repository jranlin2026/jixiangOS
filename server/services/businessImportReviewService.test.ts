import assert from 'node:assert/strict';
import { createBusinessImportReviewService } from './businessImportReviewService';

const actor = { id: 'reviewer-1', name: '审核员' } as any;
const calls: string[] = [];
const service = createBusinessImportReviewService({
  selectImportedRecords: async (request) => request.importBatchId === 'batch-1'
    ? [{ id: 'oa-1', module: 'orders' }, { id: 'oa-hidden', module: 'orders' }, { id: 'oa-2', module: 'orders' }]
    : (request.ids || []).map((id) => ({ id, module: request.module })),
  orderApplications: {
    approve: async (id) => {
      calls.push(`approve:${id}`);
      if (id === 'oa-throws') throw new Error('SELECT token FROM auth_sessions\nsecret stack');
      return id === 'oa-hidden' ? { code: 403, message: '无权操作该订单申请' } : { code: 0, data: { id } };
    },
    returnApplication: async (id) => ({ code: 0, data: { id } }),
    reject: async (id) => ({ code: 0, data: { id } }),
  },
  recoveryOrders: {
    approve: async (id) => ({ code: 0, data: { id } }),
    returnForChanges: async (id) => ({ code: 0, data: { id } }),
    reject: async (id) => ({ code: 0, data: { id } }),
  },
});

const mixed = await service.review({ module: 'orders', action: 'approve', importBatchId: 'batch-1' }, actor);
assert.equal(mixed.totalCount, 3);
assert.equal(mixed.successCount, 2);
assert.equal(mixed.failedCount, 1);
assert.equal(mixed.results.find((item) => item.id === 'oa-hidden')?.code, 403, 'record command rechecks permission and data scope');
assert.deepEqual(calls, ['approve:oa-1', 'approve:oa-hidden', 'approve:oa-2'], 'row failure is isolated');

const retry = await service.review({ module: 'orders', action: 'approve', ids: ['oa-hidden'] }, actor);
assert.equal(retry.failedCount, 1, 'failed records remain selectable for retry');
await assert.rejects(
  service.review({ module: 'orders', action: 'return', ids: ['oa-1'], reason: '' }, actor),
  /reason/i,
);

const thrown = await service.review({ module: 'orders', action: 'approve', ids: ['oa-throws', 'oa-2'] }, actor);
assert.equal(thrown.successCount, 1, 'an exception does not stop later records');
assert.equal(thrown.failedCount, 1);
assert.equal(thrown.results[0].code, 500);
assert.equal(thrown.results[0].message, '审核操作未完成，请重试');
assert.doesNotMatch(thrown.results[0].message, /SELECT|token|secret|stack/i);

console.log('business import batch review: ok');
