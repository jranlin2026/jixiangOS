import assert from 'node:assert/strict';
import type { EmployeeTask } from '../../types/enterpriseBrain';
import { summarizeWorkbenchTasks } from './workbenchTasks';

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
  pending: 2,
  returned: 1,
  awaitingConfirmation: 1,
  confirmed: 1,
  overdue: 1,
});

console.log('workbench task summary tests passed');
