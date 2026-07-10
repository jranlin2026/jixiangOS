import assert from 'node:assert/strict';
import { enablementApi } from './enablementApi';

const calls: Array<{ url: string; method: string; body?: string }> = [];
Object.defineProperty(globalThis, 'localStorage', {
  value: { getItem: () => 'token', removeItem() {} },
  configurable: true,
});
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  calls.push({ url: String(url), method: init?.method || 'GET', body: String(init?.body || '') });
  return new Response(JSON.stringify({ code: 0, data: [], message: 'success' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}) as typeof fetch;

await enablementApi.searchKnowledge('公司 制度');
await enablementApi.submitForReview('version-1');
await enablementApi.reviewVersion('version/2', { decision: 'REJECT', comment: '请补充责任部门' });
await enablementApi.getKnowledge('document/3');
await enablementApi.createVersion('document-4', { sourceFileName: 'v2.md', sourceReference: 'WPS知识库/销售手册', markdown: '# v2' });

assert.match(calls[0].url, /\/api\/enablement\/knowledge\/search\?query=%E5%85%AC%E5%8F%B8%20%E5%88%B6%E5%BA%A6$/);
assert.deepEqual(calls.map((call) => call.method), ['GET', 'POST', 'POST', 'GET', 'POST']);
assert.match(calls[2].url, /\/versions\/version%2F2\/review$/);
assert.match(calls[2].body || '', /请补充责任部门/);
assert.match(calls[3].url, /\/knowledge\/document%2F3$/);
assert.match(calls[4].body || '', /WPS知识库\/销售手册/);
