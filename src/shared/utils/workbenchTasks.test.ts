import assert from 'node:assert/strict';
import type { EmployeeTask } from '../../types/enterpriseBrain';
import {
  getWorkbenchTaskMeta,
  summarizeWorkbenchTasks,
  workbenchStatusFilterQuery,
} from './workbenchTasks';

const task = (id: string, status: EmployeeTask['status'], dueAt: string | null): EmployeeTask => ({
  id,
  employeeId: 'employee-1',
  employeeName: '销售甲',
  departmentIdSnapshot: 'sales',
  positionIdSnapshot: 'position-1',
  positionNameSnapshot: '销售',
  workDate: '2026-08-20',
  title: id,
  description: null,
  targetValue: null,
  actualValue: null,
  unit: null,
  evidenceRequired: false,
  status,
  result: null,
  dueAt,
  returnedReason: null,
  evidence: [],
});

const summary = summarizeWorkbenchTasks([
  task('overdue', 'PENDING', '2026-08-20T01:00:00.000Z'),
  task('pending', 'PENDING', '2026-08-21T01:00:00.000Z'),
  task('returned', 'RETURNED', null),
  task('submitted', 'COMPLETED', null),
  task('confirmed', 'CONFIRMED', null),
], new Date('2026-08-20T10:00:00.000Z'));

assert.deepEqual(summary, {
  total: 5,
  pending: 3,
  returned: 1,
  inProgress: 0,
  awaitingConfirmation: 1,
  confirmed: 1,
  overdue: 1,
});

assert.deepEqual(
  workbenchStatusFilterQuery('PENDING_OR_RETURNED'),
  'PENDING,RETURNED',
  '待处理必须由 API 同时筛选待处理和已退回，避免仅过滤当前页',
);
assert.equal(workbenchStatusFilterQuery('ALL'), undefined);
assert.equal(workbenchStatusFilterQuery('COMPLETED'), 'COMPLETED');

assert.deepEqual(
  getWorkbenchTaskMeta({
    ...task('safe-meta', 'PENDING', '2026-08-20T01:00:00.000Z'),
    sourceLabel: null,
    businessModule: '',
    priority: undefined,
  }, new Date('2026-08-20T10:00:00.000Z')),
  {
    source: '日常任务',
    module: '通用',
    priority: '普通',
    deadline: '2026/08/20 09:00',
    overdue: true,
  },
  '工作台元信息必须对旧任务提供安全的来源、模块、优先级和截止时间展示',
);

assert.equal(
  getWorkbenchTaskMeta({
    ...task('module-label', 'PENDING', null),
    businessModule: 'FINANCE',
    priority: 'URGENT',
  }).module,
  '财务结算',
  '工作台不得直接暴露业务模块枚举值',
);

console.log('workbench task summary tests passed');
