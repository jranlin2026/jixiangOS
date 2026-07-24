import assert from 'node:assert/strict';

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
});

const requests: Array<{ url: string; init?: RequestInit }> = [];
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  requests.push({ url: String(input), init });
  return new Response(JSON.stringify({ code: 0, data: { id: 'job-1', batchId: 'batch-1', status: 'queued' }, message: 'ok' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}) as typeof fetch;

const { businessImportApi } = await import('./businessImportApi');
const rows = [{ rowNumber: 2, customerName: '客户甲' }] as any;
await businessImportApi.templateOptions('orders');
await businessImportApi.templateOptions('recovery_orders');
await businessImportApi.precheck('orders', rows);
const confirmed = await businessImportApi.confirm('recovery_orders', rows, 'token', '挽回.xlsx');
assert.equal(confirmed.data.batchId, 'batch-1');
const jobAbort = new AbortController();
await businessImportApi.job('job-1', jobAbort.signal);
await businessImportApi.review({
  module: 'orders',
  action: 'return',
  ids: ['oa-1', 'oa-2'],
  reason: '资料不完整',
});

assert.deepEqual(requests.map((request) => request.url), [
  '/api/business-imports/orders/template-options',
  '/api/business-imports/recovery-orders/template-options',
  '/api/business-imports/orders/precheck',
  '/api/business-imports/recovery-orders/confirm',
  '/api/business-imports/jobs/job-1',
  '/api/business-imports/reviews',
]);
assert.deepEqual(JSON.parse(String(requests[2].init?.body)), { rows });
assert.deepEqual(JSON.parse(String(requests[3].init?.body)), { rows, confirmationToken: 'token', fileName: '挽回.xlsx' });
assert.equal(requests[4].init?.signal, jobAbort.signal);
assert.equal(requests[5].init?.method, 'POST');
assert.deepEqual(JSON.parse(String(requests[5].init?.body)), {
  module: 'orders',
  action: 'return',
  ids: ['oa-1', 'oa-2'],
  reason: '资料不完整',
});
