import assert from 'node:assert/strict';
import { resolveCanonicalCustomer } from './customerCanonicalService';

assert.deepEqual(await resolveCanonicalCustomer({ businessRecord: { findUnique: async () => ({ mergedIntoId: 'main', mergeLedgerId: 'ledger' }) } } as any, 'secondary'), {
  merged: true, canonicalCustomerId: 'main', mergeLedgerId: 'ledger',
});
assert.equal(await resolveCanonicalCustomer({ businessRecord: { findUnique: async () => ({ mergedIntoId: null, mergeLedgerId: null }) } } as any, 'main'), null);

console.log('customer canonical redirect: ok');
