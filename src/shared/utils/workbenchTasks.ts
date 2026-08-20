import type { EmployeeTask } from '../../types/enterpriseBrain';

export type WorkbenchTaskSummary = {
  total: number;
  pending: number;
  returned: number;
  awaitingConfirmation: number;
  confirmed: number;
  overdue: number;
};

export const summarizeWorkbenchTasks = (
  tasks: EmployeeTask[],
  now = new Date(),
): WorkbenchTaskSummary => tasks.reduce<WorkbenchTaskSummary>((summary, task) => {
  summary.total += 1;
  if (task.status === 'PENDING') summary.pending += 1;
  if (task.status === 'RETURNED') summary.returned += 1;
  if (task.status === 'COMPLETED') summary.awaitingConfirmation += 1;
  if (task.status === 'CONFIRMED') summary.confirmed += 1;
  if (
    task.status === 'PENDING'
    && task.dueAt
    && new Date(task.dueAt).getTime() < now.getTime()
  ) summary.overdue += 1;
  return summary;
}, {
  total: 0,
  pending: 0,
  returned: 0,
  awaitingConfirmation: 0,
  confirmed: 0,
  overdue: 0,
});
