import type { EmployeeTask } from '../../types/enterpriseBrain';

export type WorkbenchStatusFilter =
  | 'ALL'
  | 'PENDING_OR_RETURNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CONFIRMED'
  | 'RETURNED';

export type WorkbenchTaskSummary = {
  total: number;
  pending: number;
  returned: number;
  inProgress: number;
  awaitingConfirmation: number;
  confirmed: number;
  overdue: number;
};

const overdueStatuses = new Set<EmployeeTask['status']>([
  'PENDING',
  'IN_PROGRESS',
  'RETURNED',
]);

const businessModuleLabels: Record<string, string> = {
  GENERAL: '通用',
  CRM: '客户经营',
  ORDER: '订单管理',
  DELIVERY: '交付管理',
  AFTER_SALES: '售后服务',
  FINANCE: '财务结算',
  MARKETING: '内容营销',
  ACADEMY: '学习成长',
  OKR: '目标管理',
};

const priorityLabels = { LOW: '低', NORMAL: '普通', HIGH: '高', URGENT: '紧急' } as const;

export const workbenchStatusFilterQuery = (
  filter: WorkbenchStatusFilter,
): string | undefined => {
  if (filter === 'ALL') return undefined;
  if (filter === 'PENDING_OR_RETURNED') return 'PENDING,RETURNED';
  return filter;
};

export const isWorkbenchTaskOverdue = (
  task: Pick<EmployeeTask, 'status' | 'dueAt'>,
  now = new Date(),
): boolean => {
  if (!overdueStatuses.has(task.status) || !task.dueAt) return false;
  const dueAt = new Date(task.dueAt).getTime();
  return !Number.isNaN(dueAt) && dueAt < now.getTime();
};

const shanghaiDateTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未设置';
  const values = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date).reduce<Record<string, string>>((parts, part) => {
    if (part.type !== 'literal') parts[part.type] = part.value;
    return parts;
  }, {});
  return `${values.year}/${values.month}/${values.day} ${values.hour}:${values.minute}`;
};

export const getWorkbenchTaskMeta = (
  task: Pick<EmployeeTask, 'sourceLabel' | 'sourceType' | 'businessModule' | 'priority' | 'dueAt' | 'status'>,
  now = new Date(),
) => ({
  source: task.sourceLabel?.trim()
    || (task.sourceType === 'MARKETING_PUBLISH' || task.sourceType === 'ASSET_MATRIX_PUBLISH'
      ? '内容发布计划'
      : '日常任务'),
  module: task.businessModule?.trim()
    ? businessModuleLabels[task.businessModule.trim().toUpperCase()] || '业务协同'
    : task.sourceType ? '业务协同' : '通用',
  priority: priorityLabels[task.priority || 'NORMAL'] || '普通',
  deadline: task.dueAt ? shanghaiDateTime(task.dueAt) : '未设置',
  overdue: isWorkbenchTaskOverdue(task, now),
});

export const summarizeWorkbenchTasks = (
  tasks: EmployeeTask[],
  now = new Date(),
): WorkbenchTaskSummary => tasks.reduce<WorkbenchTaskSummary>((summary, task) => {
  summary.total += 1;
  if (task.status === 'PENDING' || task.status === 'RETURNED') summary.pending += 1;
  if (task.status === 'RETURNED') summary.returned += 1;
  if (task.status === 'IN_PROGRESS') summary.inProgress += 1;
  if (task.status === 'COMPLETED') summary.awaitingConfirmation += 1;
  if (task.status === 'CONFIRMED') summary.confirmed += 1;
  if (isWorkbenchTaskOverdue(task, now)) summary.overdue += 1;
  return summary;
}, {
  total: 0,
  pending: 0,
  returned: 0,
  inProgress: 0,
  awaitingConfirmation: 0,
  confirmed: 0,
  overdue: 0,
});
