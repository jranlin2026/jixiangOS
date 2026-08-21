import type { AuthenticatedUser } from '../../../src/types/auth';
import type { EmployeeTask } from '../../../src/types/enterpriseBrain';
import { createMemoryWorkbenchRepository, type WorkbenchRepository } from '../workbench/workbenchRepository';

export type TaskTemplateRecord = {
  id: string;
  positionId: string;
  standardVersionId: string | null;
  name: string;
  description: string | null;
  targetValue: number | null;
  unit: string | null;
  scheduleType: string;
  weekdays: number[];
  dueTime: string | null;
  evidenceRequired: boolean;
  isActive: boolean;
  effectiveAt: Date | null;
  expiresAt: Date | null;
};

export type EmployeeDirectoryRecord = Pick<AuthenticatedUser, 'id' | 'name' | 'departmentId' | 'positionId' | 'positionName' | 'isActive'> & {
  employmentStatus?: string;
  departmentName?: string;
};
export type TaskPositionRecord = { id: string; departmentId: string | null; isActive: boolean };

export type EmployeeTaskRecord = {
  id: string;
  templateId: string | null;
  sourceKey?: string | null;
  taskType?: EmployeeTask['taskType'];
  priority?: EmployeeTask['priority'];
  businessModule?: string;
  sourceRoute?: string | null;
  sourceLabel?: string | null;
  employeeId: string;
  employeeName: string;
  departmentIdSnapshot: string | null;
  departmentNameSnapshot: string | null;
  positionIdSnapshot: string | null;
  positionNameSnapshot: string | null;
  standardVersionIdSnapshot: string | null;
  workDate: string;
  title: string;
  description: string | null;
  targetValue: number | null;
  actualValue: number | null;
  unit: string | null;
  evidenceRequired: boolean;
  status: EmployeeTask['status'];
  result: string | null;
  dueAt: string | null;
  returnedReason: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  sourceItemId?: string | null;
  sourceVersion?: string | null;
  evidence: Array<{ id: string; type: string; referenceId: string | null; content: string | null }>;
};

export type GeneratedTaskInput = Omit<EmployeeTaskRecord, 'id' | 'actualValue' | 'status' | 'result' | 'returnedReason' | 'evidence'>;

export const MAX_GENERATED_TASK_CANDIDATES = 5_000;

export type GeneratedTaskWriteOptions = {
  signal?: AbortSignal;
  lease?: { leaseKey: string; ownerToken: string; leaseEpoch: number };
};

export type DailyReviewRecord = {
  id: string;
  employeeId: string;
  employeeName: string;
  departmentIdSnapshot: string | null;
  positionIdSnapshot: string | null;
  workDate: string;
  completedSummary: string;
  problems: string;
  successCases: string;
  failureCases: string;
  customerNeeds: string;
  suggestions: string;
  aiSummary: string | null;
  submittedAt: string;
};

export interface EnterpriseTaskRepository extends WorkbenchRepository {
  listTemplates(positionId?: string): Promise<TaskTemplateRecord[]>;
  saveTemplate(input: TaskTemplateRecord & { actorId: string; actorName: string }): Promise<TaskTemplateRecord>;
  findPosition(id: string): Promise<TaskPositionRecord | null>;
  listActiveTemplates(date: Date): Promise<TaskTemplateRecord[]>;
  listActiveEmployees(positionIds: string[], departmentIds?: string[]): Promise<EmployeeDirectoryRecord[]>;
  createGeneratedTasks(inputs: GeneratedTaskInput[], options?: GeneratedTaskWriteOptions): Promise<number>;
  listTasks(filter: { employeeId?: string; departmentIds?: string[]; date?: string; status?: string; sourceType?: string; sourceId?: string; page: number; pageSize: number }): Promise<{ items: EmployeeTaskRecord[]; total: number }>;
  findCustomerInterventionTarget(customerId: string): Promise<{ id: string; name: string; ownerId: string | null } | null>;
  canActorReadCustomer(customerId: string, actor: AuthenticatedUser): Promise<boolean>;
  listSupervisorsForEmployee(employeeId: string): Promise<EmployeeDirectoryRecord[]>;
  listDepartmentTree(rootId: string): Promise<string[]>;
  findEmployee(id: string): Promise<EmployeeDirectoryRecord | null>;
  findTask(id: string): Promise<EmployeeTaskRecord | null>;
  completeTaskAtomic(input: { taskId: string; employeeId: string; actualValue: number | null; result: string; evidence: Array<{ type: string; referenceId?: string; content?: string }>; now: Date }): Promise<EmployeeTaskRecord | null>;
  confirmTaskAtomic(input: { taskId: string; actorId: string; actorName: string; action: 'CONFIRM' | 'RETURN'; reason?: string; now: Date }): Promise<EmployeeTaskRecord | null>;
  createOneOffTask(input: GeneratedTaskInput & {
    assignedById: string;
    assignedByName: string;
    authorizationActor?: AuthenticatedUser;
    customerOwnerIdSnapshot?: string;
  }): Promise<EmployeeTaskRecord>;
  upsertDailyReview(input: Omit<DailyReviewRecord, 'id' | 'submittedAt'>): Promise<DailyReviewRecord>;
  listDailyReviews(filter: { employeeId?: string; departmentIds?: string[]; date?: string; page: number; pageSize: number }): Promise<{ items: DailyReviewRecord[]; total: number }>;
}

type MemoryInput = {
  departments?: Array<{ id: string; parentId: string | null; name: string; managerId?: string }>;
  employees?: EmployeeDirectoryRecord[];
  positions?: TaskPositionRecord[];
  templates?: TaskTemplateRecord[];
  customers?: Array<{ id: string; name: string; ownerId: string | null }>;
};

export function createMemoryEnterpriseTaskRepository(input: MemoryInput = {}): EnterpriseTaskRepository {
  const departments = input.departments || [];
  const employees = new Map((input.employees || []).map((item) => [item.id, item]));
  const positions = new Map((input.positions || []).map((item) => [item.id, item]));
  const templates = input.templates || [];
  const tasks: EmployeeTaskRecord[] = [];
  const reviews: DailyReviewRecord[] = [];
  const customers = new Map((input.customers || []).map((item) => [item.id, item]));
  let sequence = 0;
  const workbench = createMemoryWorkbenchRepository({ tasks, employees: input.employees, departments });

  const taskPage = (filter: { employeeId?: string; departmentIds?: string[]; date?: string; status?: string; sourceType?: string; sourceId?: string; page: number; pageSize: number }) => {
    const statuses = filter.status?.split(',').map((item) => item.trim()).filter(Boolean);
    const rows = tasks.filter((task) => (
      (!filter.employeeId || task.employeeId === filter.employeeId)
      && (!filter.departmentIds || filter.departmentIds.includes(task.departmentIdSnapshot || ''))
      && (!filter.date || task.workDate === filter.date)
      && (!statuses?.length || statuses.includes(task.status))
      && (!filter.sourceType || task.sourceType === filter.sourceType)
      && (!filter.sourceId || task.sourceId === filter.sourceId)
    ));
    return { items: rows.slice((filter.page - 1) * filter.pageSize, filter.page * filter.pageSize), total: rows.length };
  };

  return {
    ...workbench.repository,
    async listTemplates(positionId) { return templates.filter((item) => !positionId || item.positionId === positionId); },
    async saveTemplate(row) {
      const existing = templates.find((item) => item.id === row.id);
      if (existing) return Object.assign(existing, row);
      templates.push(row);
      return row;
    },
    async findPosition(id) { return positions.get(id) || null; },
    async listActiveTemplates(date) {
      return templates.filter((item) => item.isActive && (!item.effectiveAt || item.effectiveAt <= date) && (!item.expiresAt || item.expiresAt > date));
    },
    async listActiveEmployees(positionIds, departmentIds) {
      return [...employees.values()].filter((item) => item.isActive && item.employmentStatus !== 'left' && !!item.positionId && positionIds.includes(item.positionId) && (!departmentIds || departmentIds.includes(item.departmentId || '')));
    },
    async createGeneratedTasks(rows, options) {
      if (rows.length > MAX_GENERATED_TASK_CANDIDATES) throw new Error('GENERATED_TASK_CANDIDATE_LIMIT_EXCEEDED');
      let created = 0;
      for (const row of rows) {
        if (options?.signal?.aborted) throw options.signal.reason;
        if (tasks.some((item) => item.templateId === row.templateId && item.employeeId === row.employeeId && item.workDate === row.workDate)) continue;
        if (options?.signal?.aborted) throw options.signal.reason;
        tasks.push({ ...row, id: `task-${++sequence}`, actualValue: null, status: 'PENDING', result: null, returnedReason: null, evidence: [] });
        created += 1;
      }
      return created;
    },
    async listTasks(filter) { return taskPage(filter); },
    async listDepartmentTree(rootId) {
      const ids = new Set([rootId]);
      let changed = true;
      while (changed) {
        changed = false;
        departments.forEach((item) => { if (item.parentId && ids.has(item.parentId) && !ids.has(item.id)) { ids.add(item.id); changed = true; } });
      }
      return [...ids];
    },
    async findEmployee(id) { return employees.get(id) || null; },
    async findTask(id) { return tasks.find((item) => item.id === id) || null; },
    async findCustomerInterventionTarget(customerId) { return customers.get(customerId) || null; },
    async canActorReadCustomer(customerId) { return customers.has(customerId); },
    async listSupervisorsForEmployee(employeeId) {
      const employee = employees.get(employeeId);
      if (!employee?.departmentId) return [];
      const byId = new Map(departments.map((item) => [item.id, item]));
      const managerIds = new Set<string>();
      let departmentId: string | null = employee.departmentId;
      while (departmentId) {
        const department = byId.get(departmentId);
        if (!department) break;
        if (department.managerId) managerIds.add(department.managerId);
        departmentId = department.parentId;
      }
      return [...managerIds].map((id) => employees.get(id)).filter((item): item is EmployeeDirectoryRecord => Boolean(item?.isActive && item.employmentStatus !== 'left'));
    },
    async completeTaskAtomic(payload) {
      const task = tasks.find((item) => item.id === payload.taskId && item.employeeId === payload.employeeId && ['PENDING', 'RETURNED'].includes(item.status));
      if (!task) return null;
      task.actualValue = payload.actualValue;
      task.result = payload.result;
      task.evidence = payload.evidence.map((item, index) => ({ id: `${task.id}-e-${index}`, type: item.type, referenceId: item.referenceId || null, content: item.content || null }));
      task.status = 'COMPLETED';
      task.returnedReason = null;
      return task;
    },
    async confirmTaskAtomic(payload) {
      const task = tasks.find((item) => item.id === payload.taskId && item.status === 'COMPLETED');
      if (!task) return null;
      task.status = payload.action === 'CONFIRM' ? 'CONFIRMED' : 'RETURNED';
      task.returnedReason = payload.action === 'RETURN' ? payload.reason || null : null;
      return task;
    },
    async createOneOffTask(row) {
      const task: EmployeeTaskRecord = { ...row, id: `task-${++sequence}`, actualValue: null, status: 'PENDING', result: null, returnedReason: null, evidence: [] };
      tasks.push(task);
      return task;
    },
    async upsertDailyReview(row) {
      const existing = reviews.find((item) => item.employeeId === row.employeeId && item.workDate === row.workDate);
      if (existing) return Object.assign(existing, row);
      const created = { ...row, id: `review-${reviews.length + 1}`, submittedAt: new Date().toISOString() };
      reviews.push(created);
      return created;
    },
    async listDailyReviews(filter) {
      const rows = reviews.filter((item) => (
        (!filter.employeeId || item.employeeId === filter.employeeId)
        && (!filter.departmentIds || filter.departmentIds.includes(item.departmentIdSnapshot || ''))
        && (!filter.date || item.workDate === filter.date)
      ));
      return { items: rows.slice((filter.page - 1) * filter.pageSize, filter.page * filter.pageSize), total: rows.length };
    },
  };
}
