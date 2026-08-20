import type { EmployeeTaskStatus } from './taskLifecycle';

export type EmployeeTaskPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export type WorkbenchTaskForPriority = {
  id: string;
  status: EmployeeTaskStatus;
  priority?: EmployeeTaskPriority | null;
  dueAt?: string | Date | null;
  createdAt?: string | Date | null;
};

const noDateSortValue = Number.MAX_SAFE_INTEGER;
const shanghaiOffsetMilliseconds = 8 * 60 * 60 * 1000;
const activeStatuses = new Set<EmployeeTaskStatus>(['PENDING', 'IN_PROGRESS', 'RETURNED']);

const parseDate = (value: string | Date | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  const milliseconds = new Date(value).getTime();
  return Number.isNaN(milliseconds) ? null : milliseconds;
};

const toShanghaiBusinessDateKey = (date: Date): string => {
  const shanghaiDate = new Date(date.getTime() + shanghaiOffsetMilliseconds);
  return `${shanghaiDate.getUTCFullYear()}-${shanghaiDate.getUTCMonth()}-${shanghaiDate.getUTCDate()}`;
};

const isDueToday = (dueAt: number, now: Date): boolean => {
  return toShanghaiBusinessDateKey(new Date(dueAt)) === toShanghaiBusinessDateKey(now);
};

export const rankWorkbenchTask = (task: WorkbenchTaskForPriority, now: Date): number => {
  const dueAt = parseDate(task.dueAt);
  const isActive = activeStatuses.has(task.status);
  if (task.status === 'RETURNED') return 0;
  if (isActive && dueAt !== null && dueAt < now.getTime()) return 1;
  if (task.priority === 'URGENT') return 2;
  if (isActive && dueAt !== null && isDueToday(dueAt, now)) return 3;
  if (task.priority === 'HIGH') return 4;
  return 5;
};

const compareNumbers = (left: number, right: number): number => left - right;

export const compareWorkbenchTasks = (
  left: WorkbenchTaskForPriority,
  right: WorkbenchTaskForPriority,
  now: Date,
): number => {
  const rankDifference = compareNumbers(rankWorkbenchTask(left, now), rankWorkbenchTask(right, now));
  if (rankDifference !== 0) return rankDifference;

  const dueDifference = compareNumbers(parseDate(left.dueAt) ?? noDateSortValue, parseDate(right.dueAt) ?? noDateSortValue);
  if (dueDifference !== 0) return dueDifference;

  const createdDifference = compareNumbers(parseDate(left.createdAt) ?? noDateSortValue, parseDate(right.createdAt) ?? noDateSortValue);
  if (createdDifference !== 0) return createdDifference;

  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
};
