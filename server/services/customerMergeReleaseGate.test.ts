import assert from 'node:assert/strict';
import { assertCustomerMergeReleaseReady } from './customerMergeReleaseGate';

assert.doesNotThrow(() => assertCustomerMergeReleaseReady({ schemaReady: true, registryComplete: true, markerConsistency: true, noStableLinksToMergedCustomers: true, keyringReady: true }));
assert.throws(() => assertCustomerMergeReleaseReady({ schemaReady: true, registryComplete: false, markerConsistency: true, noStableLinksToMergedCustomers: true, keyringReady: true }), /registryComplete/);

console.log('customer merge release gate: ok');
