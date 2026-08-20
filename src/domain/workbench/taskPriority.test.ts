import assert from 'node:assert/strict';
import {
  compareWorkbenchTasks,
  rankWorkbenchTask,
  type WorkbenchTaskForPriority,
} from './taskPriority';

const now = new Date('2026-08-20T10:00:00.000Z');

const task = ({ id, ...overrides }: Partial<WorkbenchTaskForPriority> & Pick<WorkbenchTaskForPriority, 'id'>): WorkbenchTaskForPriority => ({
  id,
  status: 'PENDING',
  priority: 'NORMAL',
  dueAt: '2026-08-22T10:00:00.000Z',
  createdAt: '2026-08-19T10:00:00.000Z',
  ...overrides,
});

const returned = task({ id: 'returned', status: 'RETURNED' });
const overdue = task({ id: 'overdue', dueAt: '2026-08-19T10:00:00.000Z' });
const normal = task({ id: 'normal' });

assert.deepEqual(
  [normal, overdue, returned].sort((a, b) => compareWorkbenchTasks(a, b, now)).map((item) => item.id),
  ['returned', 'overdue', 'normal'],
);

assert.deepEqual(
  [
    task({ id: 'normal', priority: 'NORMAL' }),
    task({ id: 'high', priority: 'HIGH' }),
    task({ id: 'today', dueAt: '2026-08-20T12:00:00.000Z' }),
    task({ id: 'urgent', priority: 'URGENT' }),
    task({ id: 'overdue', dueAt: '2026-08-19T10:00:00.000Z' }),
    task({ id: 'returned', status: 'RETURNED' }),
  ].sort((a, b) => compareWorkbenchTasks(a, b, now)).map((item) => item.id),
  ['returned', 'overdue', 'urgent', 'today', 'high', 'normal'],
);

assert.equal(rankWorkbenchTask(returned, now), 0);
assert.equal(rankWorkbenchTask(overdue, now), 1);
assert.equal(rankWorkbenchTask(task({ id: 'urgent', priority: 'URGENT' }), now), 2);
assert.equal(rankWorkbenchTask(task({ id: 'today', dueAt: '2026-08-20T12:00:00.000Z' }), now), 3);
assert.equal(rankWorkbenchTask(task({ id: 'high', priority: 'HIGH' }), now), 4);
assert.equal(rankWorkbenchTask(normal, now), 5);

assert.equal(
  rankWorkbenchTask(
    task({ id: 'shanghai-tomorrow', dueAt: '2026-08-20T16:30:00.000Z' }),
    new Date('2026-08-20T15:30:00.000Z'),
  ),
  5,
  'an evening UTC deadline after Shanghai midnight is tomorrow, not due today',
);
assert.equal(
  rankWorkbenchTask(
    task({ id: 'shanghai-today', dueAt: '2026-08-20T00:30:00.000Z' }),
    new Date('2026-08-19T23:30:00.000Z'),
  ),
  3,
  'an early UTC deadline can still be due today in Shanghai',
);

assert.deepEqual(
  [
    task({ id: 'later-created', dueAt: '2026-08-22T10:00:00.000Z', createdAt: '2026-08-19T11:00:00.000Z' }),
    task({ id: 'later-due', dueAt: '2026-08-23T10:00:00.000Z' }),
    task({ id: 'earlier-created', dueAt: '2026-08-22T10:00:00.000Z', createdAt: '2026-08-19T09:00:00.000Z' }),
    task({ id: 'no-deadline', dueAt: null }),
  ].sort((a, b) => compareWorkbenchTasks(a, b, now)).map((item) => item.id),
  ['earlier-created', 'later-created', 'later-due', 'no-deadline'],
);

assert.deepEqual(
  [
    task({ id: 'same-created-b' }),
    task({ id: 'same-created-a' }),
  ].sort((a, b) => compareWorkbenchTasks(a, b, now)).map((item) => item.id),
  ['same-created-a', 'same-created-b'],
  'identical business fields use the immutable id as a deterministic final tie-breaker',
);

console.log('task priority tests passed');
