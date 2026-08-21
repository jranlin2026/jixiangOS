import assert from 'node:assert/strict';
import {
  TaskLifecycleDomainError,
  transitionTaskStatus,
  type EmployeeTaskStatus,
  type TaskLifecycleAction,
} from './taskLifecycle';

const actions: TaskLifecycleAction[] = ['START', 'COMPLETE', 'CANCEL', 'CONFIRM', 'RETURN'];
const nonTerminalStatuses: EmployeeTaskStatus[] = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'RETURNED'];
const terminalStatuses: EmployeeTaskStatus[] = ['CONFIRMED', 'CANCELED'];

const validTransitions: Array<readonly [EmployeeTaskStatus, TaskLifecycleAction, EmployeeTaskStatus]> = [
  ['PENDING', 'START', 'IN_PROGRESS'],
  ['PENDING', 'COMPLETE', 'COMPLETED'],
  ['PENDING', 'CANCEL', 'CANCELED'],
  ['IN_PROGRESS', 'COMPLETE', 'COMPLETED'],
  ['IN_PROGRESS', 'CANCEL', 'CANCELED'],
  ['COMPLETED', 'CONFIRM', 'CONFIRMED'],
  ['COMPLETED', 'RETURN', 'RETURNED'],
  ['RETURNED', 'START', 'IN_PROGRESS'],
  ['RETURNED', 'COMPLETE', 'COMPLETED'],
  ['RETURNED', 'CANCEL', 'CANCELED'],
];

for (const [current, action, expected] of validTransitions) {
  assert.equal(transitionTaskStatus(current, action), expected, `${current} ${action} transitions to ${expected}`);
}

const validTransitionKeys = new Set(validTransitions.map(([status, action]) => `${status}:${action}`));
for (const current of nonTerminalStatuses) {
  for (const action of actions) {
    if (validTransitionKeys.has(`${current}:${action}`)) continue;
    assert.throws(
      () => transitionTaskStatus(current, action),
      (error: unknown) => error instanceof TaskLifecycleDomainError && /无效操作/.test(error.message),
      `${current} ${action} is not a declared transition`,
    );
  }
}

for (const current of terminalStatuses) {
  for (const action of actions) {
    assert.throws(
      () => transitionTaskStatus(current, action),
      (error: unknown) => error instanceof TaskLifecycleDomainError && /终态/.test(error.message),
      `${current} ${action} remains blocked by the terminal-state guard`,
    );
  }
}

console.log('task lifecycle tests passed');
