import assert from 'node:assert/strict';
import { createEnterpriseTaskService } from './taskService';
import { createMemoryEnterpriseTaskRepository } from './taskRepository';
import type { AuthenticatedUser } from '../../../src/types/auth';
import { PERMISSION_KEYS } from '../../../src/shared/utils/permissions';

const employee: AuthenticatedUser = {
  id: 'sales-1', name: '销售甲', account: 'sales-1', email: '', phone: '', role: '销售顾问',
  positionId: 'pos-sales-consultant', departmentId: 'dept-sales-one', isActive: true,
  permissions: [
    { module: PERMISSION_KEYS.TASK_SELF, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.REVIEW_SELF, actions: ['read', 'write'] },
  ],
};
const otherEmployee: AuthenticatedUser = { ...employee, id: 'sales-2', name: '销售乙', account: 'sales-2' };
const outOfScopeEmployee: AuthenticatedUser = { ...employee, id: 'sales-other', name: '外部销售', account: 'sales-other', departmentId: 'dept-market' };
const manager: AuthenticatedUser = {
  ...employee, id: 'manager-1', name: '销售经理', account: 'manager-1', role: '销售经理', departmentId: 'dept-sales', positionId: 'pos-sales-manager',
  permissions: [
    { module: PERMISSION_KEYS.TASK_SELF, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.TASK_TEAM, actions: ['read'] },
    { module: PERMISSION_KEYS.TASK_ASSIGN, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.TASK_CONFIRM, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.REVIEW_TEAM, actions: ['read'] },
  ],
};

const repository = createMemoryEnterpriseTaskRepository({
  departments: [
    { id: 'dept-sales', parentId: null, name: '销售部' },
    { id: 'dept-sales-one', parentId: 'dept-sales', name: '销售一部' },
    { id: 'dept-market', parentId: null, name: '市场部' },
  ],
  employees: [employee, otherEmployee, outOfScopeEmployee, manager],
  positions: [{ id: 'pos-sales-consultant', departmentId: 'dept-sales', isActive: true }],
  templates: [{
    id: 'template-follow-up', positionId: 'pos-sales-consultant', standardVersionId: 'standard-v1',
    name: '客户跟进', description: '完成当日有效客户跟进', targetValue: 10, unit: '人',
    scheduleType: 'DAILY', weekdays: [1, 2, 3, 4, 5], dueTime: '18:00', evidenceRequired: true,
    isActive: true, effectiveAt: null, expiresAt: null,
  }],
});
const service = createEnterpriseTaskService({
  repository,
  now: () => new Date('2026-07-29T09:00:00+08:00'),
  summarizeReview: async (input) => `新增经验：${input.completedSummary}；SOP建议：负责人验证后再更新。`,
});

const forbidden = await service.generateDailyTasks('2026-07-29', employee);
assert.equal(forbidden.code, 403, '普通员工不得生成全员任务');

const first = await service.generateDailyTasks('2026-07-29', manager);
const second = await service.generateDailyTasks('2026-07-29', manager);
assert.equal(first.code, 0);
assert.equal(first.data?.createdCount, 2);
assert.equal(second.data?.createdCount, 0, '重复生成不得创建重复任务');
assert.equal(first.data?.candidateCount, 2, '负责人生成任务不得波及授权部门树之外的同岗位员工');

const mine = await service.listMyTasks({ date: '2026-07-29' }, employee);
assert.equal(mine.code, 0);
assert.equal(mine.data?.items.length, 1);
assert.equal(mine.data?.items[0]?.employeeId, employee.id);

const team = await service.listTeamTasks({ date: '2026-07-29' }, manager);
assert.equal(team.code, 0);
assert.equal(team.data?.items.length, 2, '负责人可读取本部门及下级部门任务');

const invalidTime = await service.saveTemplate({ positionId: 'pos-sales-consultant', name: '非法时间模板', weekdays: [1], dueTime: '99:99' }, manager);
assert.equal(invalidTime.code, 400, '模板截止时间必须是合法24小时制时间');
const childManager = { ...manager, id: 'manager-child', departmentId: 'dept-sales-one' };
const crossDepartmentTemplate = await service.saveTemplate({ positionId: 'pos-sales-consultant', name: '越权模板', weekdays: [1] }, childManager);
assert.equal(crossDepartmentTemplate.code, 403, '下级部门负责人不得覆盖上级部门归属的共享岗位模板');

const review = await service.submitReview({ workDate: '2026-07-29', completedSummary: '完成客户回访' }, employee);
assert.equal(review.code, 0);
assert.match(review.data?.aiSummary || '', /负责人验证后再更新/, '复盘应生成建议但不得直接修改岗位标准');

console.log('enterprise task generation tests passed');
