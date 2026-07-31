import assert from 'node:assert/strict';
import { createEnterpriseCockpitService } from './cockpitService';
import { createMemoryEnterpriseCockpitRepository } from './cockpitRepository';
import type { AuthenticatedUser } from '../../../src/types/auth';
import { PERMISSION_KEYS } from '../../../src/shared/utils/permissions';

const manager: AuthenticatedUser = {
  id: 'manager', name: '销售经理', account: 'manager', email: '', phone: '', role: '销售经理',
  departmentId: 'dept-sales', isActive: true,
  permissions: [{ module: PERMISSION_KEYS.BRAIN_DASHBOARD, actions: ['read'] }],
};
const repository = createMemoryEnterpriseCockpitRepository({
  departments: [{ id: 'dept-sales', parentId: null }, { id: 'dept-sales-one', parentId: 'dept-sales' }, { id: 'dept-market', parentId: null }],
  employees: [
    { id: 'sales-1', departmentId: 'dept-sales-one', positionId: 'pos-sales', isActive: true },
    { id: 'sales-2', departmentId: 'dept-sales-one', positionId: 'pos-sales', isActive: true },
    { id: 'market-1', departmentId: 'dept-market', positionId: 'pos-market', isActive: true },
  ],
  currentStandardPositionIds: ['pos-sales'],
  tasks: [
    { employeeId: 'sales-1', departmentId: 'dept-sales-one', workDate: '2026-07-29', status: 'CONFIRMED', dueAt: null },
    { employeeId: 'sales-2', departmentId: 'dept-sales-one', workDate: '2026-07-29', status: 'PENDING', dueAt: '2026-07-29T08:00:00.000Z' },
    { employeeId: 'market-1', departmentId: 'dept-market', workDate: '2026-07-29', status: 'CONFIRMED', dueAt: null },
  ],
  reviews: [{ employeeId: 'sales-1', departmentId: 'dept-sales-one', workDate: '2026-07-29' }],
  business: [{ domain: 'orders', ownerId: 'sales-1', departmentId: 'dept-sales-one', eventDate: '2026-07-29', amount: 899 }],
});
const service = createEnterpriseCockpitService({ repository, now: () => new Date('2026-07-29T10:00:00.000Z') });

const result = await service.getCockpit({ dateFrom: '2026-07-29', dateTo: '2026-07-29' }, manager);
assert.equal(result.code, 0);
assert.equal(result.data?.scope.employeeCount, 2, '部门负责人只能汇总本部门及下级部门');
assert.equal(result.data?.execution.standardCoverageRate, 100);
assert.equal(result.data?.execution.taskCompletionRate, 50);
assert.equal(result.data?.execution.overdueCount, 1);
assert.equal(result.data?.execution.reviewRate, 50);
assert.equal(result.data?.business.orderCount, 1);
assert.equal(result.data?.business.orderAmount, 899);

const admin: AuthenticatedUser = {
  ...manager, id: 'admin', name: '管理员', account: 'admin', role: '超级管理员', departmentId: 'dept-general',
  permissions: [{ module: '全部', actions: ['read', 'write', 'delete', 'admin'] }],
};
const rolloutService = createEnterpriseCockpitService({ repository, rolloutPositionIds: ['pos-sales'], rolloutLabel: '销售体系试运行范围' });
const rollout = await rolloutService.getCockpit({ dateFrom: '2026-07-29', dateTo: '2026-07-29' }, admin);
assert.equal(rollout.data?.scope.employeeCount, 2, '超级管理员首期看板也只能汇总明确的销售试运行岗位');
assert.equal(rollout.data?.scope.rolloutLabel, '销售体系试运行范围');

console.log('enterprise cockpit scope and reconciliation tests passed');
