import assert from 'node:assert/strict';
import { buildLegacyRepairPlan } from './legacyBusinessRecordRepair';

const current = [
  { recordId: 'order-1', data: { id: 'order-1', status: 'newer' } },
  { recordId: 'order-2', data: { id: 'order-2', status: 'current-only' } },
];
const legacy = [
  { id: 'order-1', status: 'stale' },
  { orderNo: 'order-3', status: 'legacy-only' },
  { orderNo: 'order-3', status: 'duplicate' },
];

const plan = buildLegacyRepairPlan(current, legacy);
assert.equal(plan.current, 2);
assert.equal(plan.legacy, 3);
assert.equal(plan.missing, 1);
assert.deepEqual(plan.merged, [
  { id: 'order-1', status: 'newer' },
  { id: 'order-2', status: 'current-only' },
  { orderNo: 'order-3', status: 'legacy-only' },
]);

const secondPlan = buildLegacyRepairPlan(
  plan.merged.map((data, index) => ({ recordId: String(data.id || data.orderNo || index), data })),
  legacy,
);
assert.equal(secondPlan.missing, 0, 'the repair must be idempotent');
