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
    { id: 'dept-sales-one', parentId: 'dept-sales', name: '销售一部', managerId: manager.id },
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
  customers: [{ id: 'customer-1', name: '客户甲', ownerId: employee.id }],
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

const completed = await service.completeTask(mine.data!.items[0]!.id, {
  result: '已完成客户跟进',
  actualValue: 10,
  evidence: [{ type: 'URL', content: 'https://example.com/follow-up' }],
}, employee);
assert.equal(completed.code, 0, '旧完成任务API应继续可用');
assert.equal(completed.data?.status, 'COMPLETED');
const confirmed = await service.confirmTask(mine.data!.items[0]!.id, { action: 'CONFIRM' }, manager);
assert.equal(confirmed.code, 0, '旧确认任务API应继续可用');
assert.equal(confirmed.data?.status, 'CONFIRMED');

const returnedTask = await service.assignOneOff({
  employeeId: employee.id,
  workDate: '2026-07-29',
  title: '需要修订的任务',
  taskType: 'FOLLOW_UP', priority: 'HIGH', businessModule: 'CUSTOMER_MANAGEMENT',
  sourceRoute: '/customers?customerId=customer-1', sourceLabel: '提醒销售·客户甲',
  sourceType: 'COCKPIT_INTERVENTION', sourceId: 'customer-1', sourceItemId: 'REMIND_SALES', sourceVersion: 'todo-risk-1',
}, manager);
assert.equal(returnedTask.code, 0);
assert.equal(returnedTask.data?.sourceType, 'COCKPIT_INTERVENTION');
assert.equal(returnedTask.data?.sourceVersion, 'todo-risk-1');
assert.equal(returnedTask.data?.sourceId, 'customer-1');
assert.equal(returnedTask.data?.taskType, 'FOLLOW_UP');
assert.equal(returnedTask.data?.priority, 'HIGH');
assert.equal(returnedTask.data?.businessModule, 'CUSTOMER_MANAGEMENT');
assert.equal(returnedTask.data?.sourceRoute, '/customers?customerId=customer-1');
const linkedForManager = await service.listLinkedTasks({ sourceType: 'COCKPIT_INTERVENTION', sourceId: 'customer-1' }, manager);
const linkedForEmployee = await service.listLinkedTasks({ sourceType: 'COCKPIT_INTERVENTION', sourceId: 'customer-1' }, employee);
assert.equal(linkedForManager.data?.items[0]?.id, returnedTask.data?.id, '管理者应能按客户直接读取介入任务');
assert.equal(linkedForEmployee.data?.items[0]?.id, returnedTask.data?.id, '执行员工应能按客户读取本人介入任务');
const configuredSupervisors = await service.listInterventionSupervisors({ customerId: 'customer-1' }, manager);
assert.deepEqual(configuredSupervisors.data?.map((item) => item.id), [manager.id], '协同主管必须来自组织架构中配置的部门负责人');
const supervisorTask = await service.assignOneOff({
  employeeId: manager.id,
  workDate: '2026-07-29',
  title: '主管协同推进客户',
  sourceType: 'COCKPIT_INTERVENTION', sourceId: 'customer-1', sourceItemId: 'SUPERVISOR_ASSIST',
}, manager);
assert.equal(supervisorTask.code, 0, '已配置的部门负责人可承接主管协同任务');
assert.equal((await service.completeTask(returnedTask.data!.id, {
  result: '已提交', evidence: [],
  customerOutcome: {
    followUpSummary: '已与客户确认需求', nextActionTitle: '发送报价单',
    nextActionDueAt: '2030-08-22T08:00:00.000Z', opportunityStageCode: 'proposal', opportunityAmount: 68000,
  },
}, employee)).code, 0);
assert.equal((await service.confirmTask(returnedTask.data!.id, { action: 'RETURN', reason: '请补充说明' }, manager)).code, 0);
const pendingTask = await service.assignOneOff({
  employeeId: employee.id,
  workDate: '2026-07-29',
  title: '尚待处理的任务',
}, manager);
assert.equal(pendingTask.code, 0);
const pendingOrReturned = await service.listMyTasks({ date: '2026-07-29', status: 'PENDING,RETURNED' }, employee);
assert.equal(pendingOrReturned.code, 0);
assert.deepEqual(
  pendingOrReturned.data?.items.map((item) => item.status).sort(),
  ['PENDING', 'RETURNED'],
  '工作台的待处理筛选必须由 API 同时返回待处理和已退回任务',
);

const superAdmin: AuthenticatedUser = {
  ...manager,
  id: 'super-admin',
  account: 'super-admin',
  name: '超级管理员',
  role: '超级管理员',
  departmentId: undefined,
  permissions: [{ module: '全部', actions: ['admin'] }],
};
const crossDepartmentTask = await service.assignOneOff({
  employeeId: outOfScopeEmployee.id,
  workDate: '2026-07-29',
  title: '跨部门管理介入',
}, superAdmin);
assert.equal(crossDepartmentTask.code, 0, '超级管理员不应因未绑定部门无法下达任务');
assert.equal((await service.listTeamTasks({ date: '2026-07-29' }, superAdmin)).code, 0);

const invalidTime = await service.saveTemplate({ positionId: 'pos-sales-consultant', name: '非法时间模板', weekdays: [1], dueTime: '99:99' }, manager);
assert.equal(invalidTime.code, 400, '模板截止时间必须是合法24小时制时间');
const childManager = { ...manager, id: 'manager-child', departmentId: 'dept-sales-one' };
const crossDepartmentTemplate = await service.saveTemplate({ positionId: 'pos-sales-consultant', name: '越权模板', weekdays: [1] }, childManager);
assert.equal(crossDepartmentTemplate.code, 403, '下级部门负责人不得覆盖上级部门归属的共享岗位模板');

const review = await service.submitReview({ workDate: '2026-07-29', completedSummary: '完成客户回访' }, employee);
assert.equal(review.code, 0);
assert.match(review.data?.aiSummary || '', /负责人验证后再更新/, '复盘应生成建议但不得直接修改岗位标准');

const abortController = new AbortController();
let abortedMutationCalls = 0;
const abortRepository = {
  ...createMemoryEnterpriseTaskRepository({
    departments: [{ id: 'dept-sales', parentId: null, name: '销售部' }],
    employees: [employee],
    positions: [{ id: 'pos-sales-consultant', departmentId: 'dept-sales', isActive: true }],
    templates: [{
      id: 'template-abort', positionId: 'pos-sales-consultant', standardVersionId: null,
      name: '终止测试', description: null, targetValue: null, unit: null,
      scheduleType: 'DAILY', weekdays: [2], dueTime: null, evidenceRequired: false,
      isActive: true, effectiveAt: null, expiresAt: null,
    }],
  }),
};
const originalListActiveTemplates = abortRepository.listActiveTemplates.bind(abortRepository);
abortRepository.listActiveTemplates = async (date) => {
  const rows = await originalListActiveTemplates(date);
  abortController.abort(new Error('SCHEDULER_LEASE_LOST'));
  return rows;
};
abortRepository.createGeneratedTasks = async () => { abortedMutationCalls += 1; return 1; };
const abortService = createEnterpriseTaskService({ repository: abortRepository });
await assert.rejects(
  () => abortService.generateDailyTasks('2026-07-28', manager, {
    signal: abortController.signal,
    lease: { leaseKey: 'workbench:scheduler', ownerToken: 'worker', leaseEpoch: 1 },
  }),
  /SCHEDULER_LEASE_LOST/,
);
assert.equal(abortedMutationCalls, 0, 'abort must be checked before the next generation mutation');

let overLimitMutationCalls = 0;
const overLimitRepository = {
  ...createMemoryEnterpriseTaskRepository(),
  async listActiveTemplates() {
    return [{
      id: 'template-limit', positionId: 'pos-sales-consultant', standardVersionId: null,
      name: '容量上限', description: null, targetValue: null, unit: null,
      scheduleType: 'DAILY', weekdays: [2], dueTime: null, evidenceRequired: false,
      isActive: true, effectiveAt: null, expiresAt: null,
    }];
  },
  async listDepartmentTree() { return ['dept-sales']; },
  async listActiveEmployees() {
    return Array.from({ length: 5_001 }, (_, index) => ({
      id: `limit-${index}`, name: `员工${index}`, departmentId: 'dept-sales',
      positionId: 'pos-sales-consultant', isActive: true, employmentStatus: 'active',
    }));
  },
  async createGeneratedTasks() { overLimitMutationCalls += 1; return 5_001; },
};
const overLimitService = createEnterpriseTaskService({ repository: overLimitRepository });
await assert.rejects(
  () => overLimitService.generateDailyTasks('2026-07-28', manager),
  /GENERATED_TASK_CANDIDATE_LIMIT_EXCEEDED/,
);
assert.equal(overLimitMutationCalls, 0, 'candidate overflow must fail before repository mutation');

console.log('enterprise task generation tests passed');
