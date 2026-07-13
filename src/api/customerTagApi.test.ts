import assert from 'node:assert/strict';
import {
  applyCustomerTagMigration, createCustomerTag, createCustomerTagGroup, fetchCustomerTagCatalog, reorderCustomerTags,
  mergeCustomerTag, previewCustomerTagMigration, updateCustomerTag, updateCustomerTagGroup,
  deleteCustomerTag, deleteCustomerTagGroup, mergeCustomerTagGroup,
} from './customerTagApi';

const calls: Array<{ url: string; init: RequestInit }> = [];
(globalThis as any).localStorage = { getItem: () => null, removeItem: () => undefined };
globalThis.fetch = (async (url: any, init: RequestInit = {}) => {
  calls.push({ url: String(url), init });
  const code = String(url).includes('/migration/apply') ? 409 : String(url).includes('/groups/forbidden') ? 403 : 0;
  return new Response(JSON.stringify({ code, data: null, message: code ? 'denied' : 'ok' }), { status: code || 200, headers: { 'content-type': 'application/json' } });
}) as any;

await fetchCustomerTagCatalog('lead', true);
await fetchCustomerTagCatalog('all', true);
await previewCustomerTagMigration();
assert.equal((await applyCustomerTagMigration('abc')).code, 409);
await createCustomerTagGroup({ name: '分组' });
assert.equal((await updateCustomerTagGroup('forbidden', { name: '新分组' })).code, 403);
await createCustomerTag({ groupId: 'g', name: '标签' });
await updateCustomerTag('t/1', { name: '新标签' });
await deleteCustomerTag('t/1');
await deleteCustomerTagGroup('g/1');
await mergeCustomerTag('source', 'target');
await mergeCustomerTagGroup('source-group', 'target-group');
await reorderCustomerTags('group', ['first', 'second']);

assert.deepEqual(calls.map(({ url, init }) => [url, init.method || 'GET', init.body || null]), [
  ['/api/customer-tags/catalog?scope=lead&includeInactive=true', 'GET', null],
  ['/api/customer-tags/catalog?scope=all&includeInactive=true', 'GET', null],
  ['/api/customer-tags/migration/preview', 'GET', null],
  ['/api/customer-tags/migration/apply', 'POST', JSON.stringify({ checksum: 'abc' })],
  ['/api/customer-tags/groups', 'POST', JSON.stringify({ name: '分组' })],
  ['/api/customer-tags/groups/forbidden', 'PUT', JSON.stringify({ name: '新分组' })],
  ['/api/customer-tags', 'POST', JSON.stringify({ groupId: 'g', name: '标签' })],
  ['/api/customer-tags/t%2F1', 'PUT', JSON.stringify({ name: '新标签' })],
  ['/api/customer-tags/t%2F1', 'DELETE', null],
  ['/api/customer-tags/groups/g%2F1', 'DELETE', null],
  ['/api/customer-tags/source/merge', 'POST', JSON.stringify({ targetId: 'target' })],
  ['/api/customer-tags/groups/source-group/merge', 'POST', JSON.stringify({ targetId: 'target-group' })],
  ['/api/customer-tags/groups/group/reorder', 'POST', JSON.stringify({ tagIds: ['first', 'second'] })],
]);
