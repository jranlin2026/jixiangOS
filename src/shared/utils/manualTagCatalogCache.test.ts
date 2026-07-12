import assert from 'node:assert/strict';
import type { CustomerTagCatalog } from '../../types/tag';
import { createManualTagCatalogCache } from './manualTagCatalogCache';

const catalog = (name: string): CustomerTagCatalog => ({
  groups: [{ id: `g-${name}`, name, color: '#1677ff', selectionMode: 'multiple', scope: 'both', isActive: true, sortOrder: 0, createdAt: '2026-07-12', updatedAt: '2026-07-12' }],
  tags: [],
});
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const success = (data: CustomerTagCatalog) => ({ code: 0, data, message: 'success' });

// A mounted subscriber observes invalidation and starts a new generation load.
// The invalidated pending response must never overwrite the fresh result.
const first = deferred<ReturnType<typeof success>>();
const second = deferred<ReturnType<typeof success>>();
let calls = 0;
const cache = createManualTagCatalogCache(() => (++calls === 1 ? first.promise : second.promise));
let mountedReloads = 0;
const unsubscribe = cache.subscribe('lead', () => {
  if (!cache.getState('lead').catalog && !cache.getState('lead').loading) return;
  if (!cache.getState('lead').catalog) {
    mountedReloads += 1;
    void cache.load('lead');
  }
});
const oldLoad = cache.load('lead');
cache.invalidate('lead');
assert.equal(calls, 0, 'fetch starts in a microtask');
await Promise.resolve();
assert.equal(calls, 2, 'mounted subscriber must start a fresh generation request');
second.resolve(success(catalog('fresh')));
await Promise.resolve();
await cache.load('lead');
assert.equal(cache.getState('lead').catalog?.groups[0].name, 'fresh');
first.resolve(success(catalog('stale')));
await oldLoad;
assert.equal(cache.getState('lead').catalog?.groups[0].name, 'fresh', 'old generation must not overwrite fresh cache');
assert.ok(mountedReloads >= 1);
unsubscribe();

// Requests deduplicate per scope while lead/customer remain independent.
let dedupeCalls = 0;
const dedupe = createManualTagCatalogCache(async (scope) => {
  dedupeCalls += 1;
  return success(catalog(scope));
});
await Promise.all([dedupe.load('lead'), dedupe.load('lead'), dedupe.load('customer')]);
assert.equal(dedupeCalls, 2);

let clock = 1_000;
let ttlCalls = 0;
const ttl = createManualTagCatalogCache(async () => {
  ttlCalls += 1;
  return success(catalog(`ttl-${ttlCalls}`));
}, 60_000, () => clock);
await ttl.load('lead');
clock += 59_999;
await ttl.load('lead');
assert.equal(ttlCalls, 1, 'fresh TTL entry must be reused');
clock += 2;
await ttl.load('lead');
assert.equal(ttlCalls, 2, 'expired TTL entry must reload');

// Failed loads leave a retryable state; explicit retry succeeds.
let retryCalls = 0;
const retry = createManualTagCatalogCache(async () => {
  retryCalls += 1;
  if (retryCalls === 1) throw new Error('temporary failure');
  return success(catalog('recovered'));
});
await retry.load('customer');
assert.equal(retry.getState('customer').loading, false);
assert.equal(retry.getState('customer').error, 'temporary failure');
await retry.load('customer', true);
assert.equal(retry.getState('customer').catalog?.groups[0].name, 'recovered');
assert.equal(retry.getState('customer').error, '');

console.log('manualTagCatalogCache.test.ts passed');
