import type { EmployeeTask, TaskActivity } from '../../../src/types/enterpriseBrain';
import type { AuthenticatedUser } from '../../../src/types/auth';
import type { WorkbenchTaskListItem } from '../../../src/types/workbench';
import { compareWorkbenchTasks } from '../../../src/domain/workbench/taskPriority';

export type WorkbenchQueryScope =
  | { kind: 'mine'; actorId: string }
  | { kind: 'departments'; departmentIds: string[] }
  | { kind: 'company' };

export type WorkbenchTaskQuery = {
  scope: WorkbenchQueryScope;
  dateFrom?: Date;
  dateToExclusive?: Date;
  status?: EmployeeTask['status'];
  businessModule?: string;
  priority?: NonNullable<EmployeeTask['priority']>;
  employeeId?: string;
  departmentIds?: string[];
  overdue?: boolean;
  confirmation?: boolean;
  now: Date;
};

export type WorkbenchTaskPageQuery = WorkbenchTaskQuery & { page: number; pageSize: number };

export type WorkbenchTaskMetrics = {
  total: number;
  statusCounts: Record<EmployeeTask['status'], number>;
  overdue: number;
  dueToday: number;
  collaboration: number;
  estimatedMinutes: number;
  estimatedMinutesTaskCount: number;
  onTime: number;
  onTimeDenominator: number;
  overdueDenominator: number;
  historicalReturnEventCount: number;
  returnedTaskCount: number;
  blocked: number;
  firstActionMinutesTotal: number;
  firstActionDenominator: number;
  confirmationMinutesTotal: number;
  confirmationDurationDenominator: number;
};

export type WorkbenchEmployee = {
  id: string;
  name: string;
  departmentId?: string;
  departmentName?: string;
  positionId?: string;
  positionName?: string;
  isActive: boolean;
  employmentStatus?: string;
};

export type WorkbenchEvidenceInput = {
  type: string;
  referenceId?: string;
  content?: string;
};

export type WorkbenchTaskUpdate = Partial<Pick<EmployeeTask,
  | 'status' | 'employeeId' | 'employeeName' | 'departmentIdSnapshot'
  | 'positionIdSnapshot' | 'positionNameSnapshot' | 'actualValue' | 'result'
  | 'returnedReason' | 'startedAt' | 'completedAt' | 'confirmedAt'
  | 'confirmedById' | 'confirmedByName' | 'canceledAt' | 'canceledById'
  | 'canceledReason' | 'qualityScore' | 'qualityComment' | 'remindedAt'
>> & {
  departmentNameSnapshot?: string | null;
  evidence?: WorkbenchEvidenceInput[];
  evidenceActorId?: string;
};

export type TaskActivityInput = Omit<TaskActivity, 'id' | 'createdAt'> & { createdAt?: Date };

export type EvidenceReferencesAuthorizationInput = {
  task: EmployeeTask;
  evidence: WorkbenchEvidenceInput[];
  actor: AuthenticatedUser;
};

export interface WorkbenchTransactionRepository {
  findTaskForUpdate(taskId: string): Promise<EmployeeTask | null>;
  updateTask(taskId: string, update: WorkbenchTaskUpdate): Promise<EmployeeTask | null>;
  appendActivity(activity: TaskActivityInput): Promise<TaskActivity>;
  findEmployee(employeeId: string): Promise<WorkbenchEmployee | null>;
  listDepartmentTree(rootId: string): Promise<string[]>;
  authorizeEvidenceReferences(input: EvidenceReferencesAuthorizationInput): Promise<boolean>;
}

export interface WorkbenchRepository extends WorkbenchTransactionRepository {
  transaction<T>(work: (repository: WorkbenchTransactionRepository) => Promise<T>): Promise<T>;
  listWorkbenchTasks(query: WorkbenchTaskPageQuery): Promise<{ items: WorkbenchTaskListItem[]; total: number }>;
  summarizeWorkbenchTasks(query: WorkbenchTaskQuery): Promise<WorkbenchTaskMetrics>;
}

type MemoryWorkbenchInput = {
  tasks?: EmployeeTask[];
  activities?: TaskActivity[];
  employees?: WorkbenchEmployee[];
  departments?: Array<{ id: string; parentId: string | null; isActive?: boolean }>;
  authorizeEvidenceReferences?: (input: EvidenceReferencesAuthorizationInput) => Promise<boolean>;
};

export function createMemoryWorkbenchRepository(input: MemoryWorkbenchInput = {}) {
  const tasks = input.tasks || [];
  const activities = input.activities || [];
  const employees = input.employees || [];
  const departments = input.departments || [];
  let activitySequence = activities.length;

  const makeTransactionRepository = (
    transactionTasks: EmployeeTask[],
    transactionActivities: TaskActivity[],
  ): WorkbenchTransactionRepository => ({
    async findTaskForUpdate(taskId) {
      return transactionTasks.find((item) => item.id === taskId) || null;
    },
    async updateTask(taskId, update) {
      const task = transactionTasks.find((item) => item.id === taskId);
      if (!task) return null;
      const { evidence, evidenceActorId: _evidenceActorId, ...taskUpdate } = update;
      Object.assign(task, taskUpdate);
      if (evidence) {
        task.evidence = evidence.map((item, index) => ({
          id: `${task.id}-evidence-${index + 1}`,
          type: item.type,
          referenceId: item.referenceId || null,
          content: item.content || null,
        }));
      }
      return task;
    },
    async appendActivity(activity) {
      const created: TaskActivity = {
        ...activity,
        id: `task-activity-${++activitySequence}`,
        createdAt: (activity.createdAt || new Date()).toISOString(),
      };
      transactionActivities.push(created);
      return created;
    },
    async findEmployee(employeeId) {
      return employees.find((item) => item.id === employeeId) || null;
    },
    async listDepartmentTree(rootId) {
      const activeDepartments = departments.filter((department) => department.isActive !== false);
      if (!activeDepartments.some((department) => department.id === rootId)) return [];
      const ids = new Set([rootId]);
      let changed = true;
      while (changed) {
        changed = false;
        activeDepartments.forEach((department) => {
          if (department.parentId && ids.has(department.parentId) && !ids.has(department.id)) {
            ids.add(department.id);
            changed = true;
          }
        });
      }
      return [...ids];
    },
    async authorizeEvidenceReferences(authorization) {
      return input.authorizeEvidenceReferences
        ? input.authorizeEvidenceReferences(authorization)
        : false;
    },
  });

  const direct = makeTransactionRepository(tasks, activities);
  const taskTime = (task: EmployeeTask): number => {
    const workDate = String(task.workDate || '');
    const value = /^\d{4}-\d{2}-\d{2}$/.test(workDate)
      ? new Date(`${workDate}T00:00:00.000+08:00`)
      : new Date(workDate);
    return value.getTime();
  };
  const isOverdue = (task: EmployeeTask, now: Date): boolean => (
    ['PENDING', 'IN_PROGRESS', 'RETURNED'].includes(task.status)
    && Boolean(task.dueAt)
    && new Date(task.dueAt!).getTime() < now.getTime()
  );
  const shanghaiDayKey = (value: Date): string => new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(value);
  const matchesQuery = (task: EmployeeTask, query: WorkbenchTaskQuery): boolean => {
    const visible = query.scope.kind === 'company'
      || (query.scope.kind === 'mine'
        ? task.employeeId === query.scope.actorId || Boolean(task.collaboratorIds?.includes(query.scope.actorId))
        : query.scope.departmentIds.includes(task.departmentIdSnapshot || ''));
    if (!visible) return false;
    if (query.dateFrom && taskTime(task) < query.dateFrom.getTime()) return false;
    if (query.dateToExclusive && taskTime(task) >= query.dateToExclusive.getTime()) return false;
    if (query.status && task.status !== query.status) return false;
    if (query.businessModule && task.businessModule !== query.businessModule) return false;
    if (query.priority && task.priority !== query.priority) return false;
    if (query.employeeId && task.employeeId !== query.employeeId) return false;
    if (query.departmentIds && !query.departmentIds.includes(task.departmentIdSnapshot || '')) return false;
    if (query.overdue !== undefined && isOverdue(task, query.now) !== query.overdue) return false;
    if (query.confirmation !== undefined && (task.status === 'COMPLETED') !== query.confirmation) return false;
    return true;
  };
  const matchingTasks = (query: WorkbenchTaskQuery): EmployeeTask[] => tasks.filter((item) => matchesQuery(item, query));
  const listItem = (task: EmployeeTask): WorkbenchTaskListItem => {
    const { evidence: _evidence, activities: _activities, ...item } = task;
    return item;
  };
  const firstActivityAt = (taskId: string, action: string): number | null => {
    const timestamps = activities
      .filter((item) => item.taskId === taskId && item.action === action)
      .map((item) => new Date(item.createdAt).getTime())
      .filter(Number.isFinite);
    return timestamps.length ? Math.min(...timestamps) : null;
  };
  const legacyTimestamp = (value: string | null | undefined): number | null => {
    if (!value) return null;
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  };
  const statusCounts = (): WorkbenchTaskMetrics['statusCounts'] => ({
    PENDING: 0, IN_PROGRESS: 0, COMPLETED: 0, CONFIRMED: 0, RETURNED: 0, CANCELED: 0,
  });
  const repository: WorkbenchRepository = {
    ...direct,
    async transaction(work) {
      const transactionTasks = structuredClone(tasks);
      const transactionActivities = structuredClone(activities);
      const result = await work(makeTransactionRepository(transactionTasks, transactionActivities));
      tasks.splice(0, tasks.length, ...transactionTasks);
      activities.splice(0, activities.length, ...transactionActivities);
      return result;
    },
    async listWorkbenchTasks(query) {
      const filtered = matchingTasks(query)
        .sort((left, right) => compareWorkbenchTasks(left, right, query.now));
      const offset = (query.page - 1) * query.pageSize;
      return { items: filtered.slice(offset, offset + query.pageSize).map(listItem), total: filtered.length };
    },
    async summarizeWorkbenchTasks(query) {
      const filtered = matchingTasks(query);
      const counts = statusCounts();
      filtered.forEach((item) => { counts[item.status] += 1; });
      let onTime = 0;
      let onTimeDenominator = 0;
      let historicalReturnEventCount = 0;
      let returnedTaskCount = 0;
      let firstActionMinutesTotal = 0;
      let firstActionDenominator = 0;
      let confirmationMinutesTotal = 0;
      let confirmationDurationDenominator = 0;
      filtered.forEach((item) => {
        const firstStart = firstActivityAt(item.id, 'START') ?? legacyTimestamp(item.startedAt);
        const firstComplete = firstActivityAt(item.id, 'COMPLETE') ?? legacyTimestamp(item.completedAt);
        const firstConfirm = firstActivityAt(item.id, 'CONFIRM') ?? legacyTimestamp(item.confirmedAt);
        const createdAt = new Date(String((item as EmployeeTask & { createdAt?: string }).createdAt || '')).getTime();
        const returns = activities.filter((activity) => activity.taskId === item.id && activity.action === 'RETURN').length;
        historicalReturnEventCount += returns;
        if (item.status !== 'CANCELED' && returns > 0) returnedTaskCount += 1;
        if (firstStart !== null && Number.isFinite(createdAt) && firstStart >= createdAt) {
          firstActionMinutesTotal += (firstStart - createdAt) / 60_000;
          firstActionDenominator += 1;
        }
        if (item.status === 'CONFIRMED' && item.dueAt && firstComplete !== null) {
          onTimeDenominator += 1;
          if (firstComplete <= new Date(item.dueAt).getTime()) onTime += 1;
        }
        if (firstComplete !== null && firstConfirm !== null && firstConfirm >= firstComplete) {
          confirmationMinutesTotal += (firstConfirm - firstComplete) / 60_000;
          confirmationDurationDenominator += 1;
        }
      });
      const overdue = filtered.filter((item) => isOverdue(item, query.now)).length;
      return {
        total: filtered.length,
        statusCounts: counts,
        overdue,
        dueToday: filtered.filter((item) => (
          ['PENDING', 'IN_PROGRESS', 'RETURNED'].includes(item.status)
          && item.dueAt
          && shanghaiDayKey(new Date(item.dueAt)) === shanghaiDayKey(query.now)
        )).length,
        collaboration: filtered.filter((item) => (
          query.scope.kind === 'mine'
            ? item.employeeId !== query.scope.actorId && Boolean(item.collaboratorIds?.includes(query.scope.actorId))
            : Boolean(item.collaboratorIds?.length)
        )).length,
        estimatedMinutes: filtered.reduce((sum, item) => sum + (item.estimatedMinutes ?? 0), 0),
        estimatedMinutesTaskCount: filtered.filter((item) => item.estimatedMinutes !== null && item.estimatedMinutes !== undefined).length,
        onTime,
        onTimeDenominator,
        overdueDenominator: filtered.filter((item) => item.status !== 'CANCELED' && Boolean(item.dueAt)).length,
        historicalReturnEventCount,
        returnedTaskCount,
        blocked: filtered.filter((item) => item.status === 'RETURNED' || isOverdue(item, query.now)).length,
        firstActionMinutesTotal,
        firstActionDenominator,
        confirmationMinutesTotal,
        confirmationDurationDenominator,
      };
    },
  };

  return { repository, tasks, activities };
}
