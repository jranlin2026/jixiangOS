import assert from 'node:assert/strict';
import {
  clearStorageSyncFailure,
  reportStorageSyncFailure,
  subscribeStorageSyncFailures,
} from './storageSyncStatus';

const events: Array<string | null> = [];
const unsubscribe = subscribeStorageSyncFailures((failure) => events.push(failure?.message || null));
reportStorageSyncFailure({ key: 'aaos_customers', operation: 'save', message: 'Forbidden' });
clearStorageSyncFailure();
unsubscribe();

assert.deepEqual(events, ['Forbidden', null]);
