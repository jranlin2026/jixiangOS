import assert from 'node:assert/strict';
import { compareGuardSnapshot, isUndoDeadlineOpen } from './customerMergeGuardService';

assert.equal(
  isUndoDeadlineOpen(new Date('2026-07-20T00:00:00.000Z'), new Date('2026-07-17T00:00:00.000Z')),
  true,
);
assert.equal(
  isUndoDeadlineOpen(new Date('2026-07-20T00:00:00.001Z'), new Date('2026-07-17T00:00:00.000Z')),
  false,
);
assert.deepEqual(compareGuardSnapshot(
  { revision: 4, auditWatermark: '20', updatedAt: '2026-07-17T00:00:00.000Z' },
  { revision: 5, auditWatermark: '20', updatedAt: '2026-07-17T00:00:00.000Z' },
), ['ROW_REVISION_CHANGED']);

console.log('customer merge guard: ok');
