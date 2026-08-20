import type { EmployeeTask, TaskActivity } from '../../../src/types/enterpriseBrain';
import type { AuthenticatedUser } from '../../../src/types/auth';

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
}

type MemoryWorkbenchInput = {
  tasks?: EmployeeTask[];
  activities?: TaskActivity[];
  employees?: WorkbenchEmployee[];
  departments?: Array<{ id: string; parentId: string | null }>;
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
      const ids = new Set([rootId]);
      let changed = true;
      while (changed) {
        changed = false;
        departments.forEach((department) => {
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
  };

  return { repository, tasks, activities };
}
