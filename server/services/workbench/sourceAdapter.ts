import type { EmployeeTask } from '../../../src/types/enterpriseBrain';

export class TaskSyncInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaskSyncInvariantError';
  }
}

export type WorkbenchBusinessModule =
  | 'GENERAL'
  | 'CRM'
  | 'ORDER'
  | 'DELIVERY'
  | 'AFTER_SALES'
  | 'FINANCE'
  | 'MARKETING'
  | 'ACADEMY'
  | 'OKR';

export type DesiredEmployeeTask = {
  sourceKey: string;
  taskType: NonNullable<EmployeeTask['taskType']>;
  priority: NonNullable<EmployeeTask['priority']>;
  businessModule: WorkbenchBusinessModule;
  title: string;
  employeeId: string;
  employeeNameSnapshot: string;
  workDate: string;
  sourceVersion?: string | null;
  description?: string | null;
  departmentId?: string | null;
  departmentNameSnapshot?: string | null;
  dueAt?: string | null;
  sourceRoute?: string | null;
  sourceLabel?: string | null;
  collaboratorIds?: string[] | null;
  estimatedMinutes?: number | null;
};

export type ReconcileContext = Readonly<{
  now: Date;
  sourceKeys?: string[];
  cursor?: string;
  cursors?: Partial<Record<WorkbenchBusinessModule, string>>;
  limit?: number;
  signal?: AbortSignal;
}>;

export type ReconcileError = {
  module: WorkbenchBusinessModule;
  sourceKey?: string;
  message: string;
};

export type ReconcileResult = {
  scanned: number;
  created: number;
  updated: number;
  canceled: number;
  unchanged: number;
  failed: number;
  errors: ReconcileError[];
  nextCursors?: Partial<Record<WorkbenchBusinessModule, string>>;
};

export type TaskTransitionEvent = {
  taskId: string;
  sourceKey: string;
  businessModule: WorkbenchBusinessModule;
  action: string;
  fromStatus: EmployeeTask['status'];
  toStatus: EmployeeTask['status'];
  actorId: string;
  occurredAt: Date;
};

export type WorkbenchSourceAdapter = {
  module: WorkbenchBusinessModule;
  reconcile(input: ReconcileContext): Promise<ReconcileResult>;
  resolveTask(sourceKey: string): Promise<DesiredEmployeeTask | null>;
  onTaskTransition?(event: TaskTransitionEvent): Promise<void>;
};
