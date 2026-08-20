export type EmployeeTaskStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CONFIRMED'
  | 'RETURNED'
  | 'CANCELED';

export type TaskLifecycleAction = 'START' | 'COMPLETE' | 'CANCEL' | 'CONFIRM' | 'RETURN';

export class TaskLifecycleDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaskLifecycleDomainError';
  }
}

const transitions = {
  PENDING: { START: 'IN_PROGRESS', COMPLETE: 'COMPLETED', CANCEL: 'CANCELED' },
  IN_PROGRESS: { COMPLETE: 'COMPLETED', CANCEL: 'CANCELED' },
  COMPLETED: { CONFIRM: 'CONFIRMED', RETURN: 'RETURNED' },
  RETURNED: { START: 'IN_PROGRESS', COMPLETE: 'COMPLETED', CANCEL: 'CANCELED' },
} as const;

const terminalStatuses = new Set<EmployeeTaskStatus>(['CONFIRMED', 'CANCELED']);

export const transitionTaskStatus = (
  current: EmployeeTaskStatus,
  action: TaskLifecycleAction,
): EmployeeTaskStatus => {
  if (terminalStatuses.has(current)) {
    throw new TaskLifecycleDomainError(`任务状态 ${current} 为终态，不能执行操作 ${action}`);
  }

  const nextStatus = transitions[current as keyof typeof transitions][action as never];
  if (!nextStatus) {
    throw new TaskLifecycleDomainError(`任务状态 ${current} 不支持操作 ${action}（无效操作）`);
  }

  return nextStatus;
};
