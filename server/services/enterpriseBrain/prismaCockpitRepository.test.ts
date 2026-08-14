import assert from 'node:assert/strict';
import test from 'node:test';
import { STORAGE_KEYS } from '../../../src/shared/utils/constants';
import { createPrismaEnterpriseCockpitRepository } from './prismaCockpitRepository';

function createPrisma(overrides: Record<string, any> = {}) {
  return {
    department: { findMany: async () => [] },
    user: { findMany: async () => [{ id: 'sales-1', name: '销售甲', departmentId: 'sales' }] },
    positionStandard: { findMany: async () => [] },
    employeeTask: { findMany: async () => [] },
    dailyReview: { findMany: async () => [] },
    leadRecord: { findMany: async () => [] },
    businessRecord: { findMany: async () => [] },
    ...overrides,
  } as any;
}

test('enterprise cockpit recognizes stored business domains as orders', async () => {
  const repository = createPrismaEnterpriseCockpitRepository(createPrisma({
    businessRecord: {
      findMany: async () => [{
        domain: STORAGE_KEYS.ORDERS,
        owner: '',
        amount: 899,
        eventAt: new Date('2026-08-14T02:00:00.000Z'),
        status: '已确认',
        data: { salesId: 'sales-1' },
      }],
    },
  }));

  const result = await repository.listBusiness(['sales-1'], '2026-08-14', '2026-08-14');

  assert.equal(result.length, 1);
  assert.equal(result[0].domain, 'orders');
  assert.equal(result[0].amount, 899);
});

test('enterprise cockpit treats selected dates as complete Shanghai calendar days', async () => {
  const captured: Array<Record<string, any>> = [];
  const repository = createPrismaEnterpriseCockpitRepository(createPrisma({
    businessRecord: { findMany: async (query: any) => { captured.push(query); return []; } },
    leadRecord: { findMany: async (query: any) => { captured.push(query); return []; } },
  }));

  await repository.listBusiness(['sales-1'], '2026-08-14', '2026-08-14');

  for (const query of captured) {
    const range = query.where.eventAt || query.where.createdAt;
    assert.equal(range.gte.toISOString(), '2026-08-13T16:00:00.000Z');
    assert.equal(range.lte.toISOString(), '2026-08-14T15:59:59.999Z');
  }
});

test('enterprise cockpit attributes canonical leads by assigned user id', async () => {
  const repository = createPrismaEnterpriseCockpitRepository(createPrisma({
    leadRecord: {
      findMany: async () => [{
        id: 'lead-1', owner: '', assignedTo: '', createdAt: new Date('2026-08-14T02:00:00.000Z'),
        data: { assignedToId: 'sales-1' },
      }],
    },
  }));

  const result = await repository.listBusiness(['sales-1'], '2026-08-14', '2026-08-14');
  assert.equal(result.filter((item) => item.domain === 'leads').length, 1);
});

test('organization summary uses active OKRs and current delivery workload', async () => {
  const repository = createPrismaEnterpriseCockpitRepository(createPrisma({
    objective: {
      findMany: async () => [
        { cycleId: 'cycle-month', progress: 80, health: 'ON_TRACK', _count: { keyResults: 2 } },
        { cycleId: 'cycle-quarter', progress: 40, health: 'AT_RISK', _count: { keyResults: 0 } },
      ],
    },
    businessRecord: {
      findMany: async () => [
        { data: { ownerId: 'sales-1', status: '交付中' } },
        { data: { ownerId: 'sales-1', status: '阻塞' } },
        { data: { ownerId: 'sales-1', status: '已完成' } },
        { data: { salesOwnerId: 'sales-1', status: '超期' } },
      ],
    },
  }));

  assert.deepEqual(await repository.listOkrSummary(['sales-1']), {
    activeCycleCount: 2, objectiveCount: 2, riskObjectiveCount: 1, objectivesWithoutKeyResults: 1, averageProgress: 60,
  });
  assert.deepEqual(await repository.listDeliverySummary(['sales-1']), {
    activeCount: 3, overdueCount: 1, blockedCount: 1, completedCount: 1,
  });
});
