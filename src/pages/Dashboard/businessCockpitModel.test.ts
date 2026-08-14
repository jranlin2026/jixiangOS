import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveDashboardDateRange } from './businessCockpitModel';

const now = new Date('2026-08-14T04:00:00.000Z');

test('preset date ranges resolve to Shanghai calendar boundaries for every dashboard panel', () => {
  assert.deepEqual(resolveDashboardDateRange('today', now), {
    preset: 'today', startDate: '2026-08-14', endDate: '2026-08-14',
  });
  assert.deepEqual(resolveDashboardDateRange('week', now), {
    preset: 'week', startDate: '2026-08-10', endDate: '2026-08-14',
  });
  assert.deepEqual(resolveDashboardDateRange('month', now), {
    preset: 'month', startDate: '2026-08-01', endDate: '2026-08-14',
  });
});
