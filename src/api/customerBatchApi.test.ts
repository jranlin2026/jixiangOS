import assert from 'node:assert/strict';

const requests: Array<{ path: string; init: RequestInit }> = [];
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
});
Object.assign(globalThis, {
  fetch: async (input: string | URL | Request, init: RequestInit = {}) => {
    requests.push({ path: String(input), init });
    return new Response(JSON.stringify({ code: 0, data: {}, message: 'success' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  },
});

const { customerBatchApi } = await import('./customerBatchApi');

assert.equal(typeof customerBatchApi.precheck, 'function', '客户端必须提供批量预检请求');
await customerBatchApi.precheck({
  operation: 'transfer',
  selection: { mode: 'ids', customerIds: ['customer-1'] },
  input: { targetOwnerId: 'u-2' },
  reason: '团队调整',
  // Browser callers cannot forge server-owned handler/count/hash/version data.
  handlerKey: 'forged-handler',
  totalCount: 99,
  selectionHash: 'forged-hash',
} as any);
await customerBatchApi.createJob({ precheckToken: 'opaque-token', idempotencyKey: 'click-1' });
await customerBatchApi.list();
await customerBatchApi.get('job / 1');
await customerBatchApi.listItems('job / 1');
await customerBatchApi.cancel('job / 1');

assert.equal(requests[0]?.path, '/api/customer-batch-jobs/precheck');
assert.equal(requests[0]?.init.method, 'POST');
assert.deepEqual(JSON.parse(String(requests[0]?.init.body)), {
  operation: 'transfer',
  selection: { mode: 'ids', customerIds: ['customer-1'] },
  input: { targetOwnerId: 'u-2' },
  reason: '团队调整',
});
assert.deepEqual(JSON.parse(String(requests[1]?.init.body)), {
  precheckToken: 'opaque-token', idempotencyKey: 'click-1',
});
assert.deepEqual(requests.slice(2).map((request) => [request.path, request.init.method]), [
  ['/api/customer-batch-jobs', undefined],
  ['/api/customer-batch-jobs/job%20%2F%201', undefined],
  ['/api/customer-batch-jobs/job%20%2F%201/items', undefined],
  ['/api/customer-batch-jobs/job%20%2F%201/cancel', 'POST'],
]);

console.log('customer batch api tests passed');
