import type { AuthenticatedUser } from '../../../src/types/auth';

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
  status: string;
  result: string | null;
  dueAt: string | null;
  returnedReason: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  sourceItemId?: string | null;
  evidence: Array<{ id: string; type: string; referenceId: string | null; content: string | null }>;
};

export type GeneratedTaskInput = Omit<EmployeeTaskRecord, 'id' | 'actualValue' | 'status' | 'result' | 'returnedReason' | 'evidence'>;

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

export interface EnterpriseTaskRepository {
  listTemplates(positionId?: string): Promise<TaskTemplateRecord[]>;
  saveTemplate(input: TaskTemplateRecord & { actorId: string; actorName: string }): Promise<TaskTemplateRecord>;
  findPosition(id: string): Promise<TaskPositionRecord | null>;
  listActiveTemplates(date: Date): Promise<TaskTemplateRecord[]>;
  listActiveEmployees(positionIds: string[], departmentIds?: string[]): Promise<EmployeeDirectoryRecord[]>;
  createGeneratedTasks(inputs: GeneratedTaskInput[]): Promise<number>;
  listTasks(filter: { employeeId?: string; departmentIds?: string[]; date?: string; status?: string; page: number; pageSize: number }): Promise<{ items: EmployeeTaskRecord[]; total: number }>;
  listDepartmentTree(rootId: string): Promise<string[]>;
  findEmployee(id: string): Promise<EmployeeDirectoryRecord | null>;
  findTask(id: string): Promise<EmployeeTaskRecord | null>;
  completeTaskAtomic(input: { taskId: string; employeeId: string; actualValue: number | null; result: string; evidence: Array<{ type: string; referenceId?: string; content?: string }>; now: Date }): Promise<EmployeeTaskRecord | null>;
  confirmTaskAtomic(input: { taskId: string; actorId: string; actorName: string; action: 'CONFIRM' | 'RETURN'; reason?: string; now: Date }): Promise<EmployeeTaskRecord | null>;
  createOneOffTask(input: GeneratedTaskInput & { assignedById: string; assignedByName: string }): Promise<EmployeeTaskRecord>;
  upsertDailyReview(input: Omit<DailyReviewRecord, 'id' | 'submittedAt'>): Promise<DailyReviewRecord>;
  listDailyReviews(filter: { employeeId?: string; departmentIds?: string[]; date?: string; page: number; pageSize: number }): Promise<{ items: DailyReviewRecord[]; total: number }>;
}

type MemoryInput = {
  departments?: Array<{ id: string; parentId: string | null; name: string }>;
  employees?: EmployeeDirectoryRecord[];
  positions?: TaskPositionRecord[];
  templates?: TaskTemplateRecord[];
};

export function createMemoryEnterpriseTaskRepository(input: MemoryInput = {}): EnterpriseTaskRepository {
  const departments = input.departments || [];
  const employees = new Map((input.employees || []).map((item) => [item.id, item]));
  const positions = new Map((input.positions || []).map((item) => [item.id, item]));
  const templates = input.templates || [];
  const tasks: EmployeeTaskRecord[] = [];
  const reviews: DailyReviewRecord[] = [];
  let sequence = 0;

  const taskPage = (filter: { employeeId?: string; departmentIds?: string[]; date?: string; status?: string; page: number; pageSize: number }) => {
    const rows = tasks.filter((task) => (
      (!filter.employeeId || task.employeeId === filter.employeeId)
      && (!filter.departmentIds || filter.departmentIds.includes(task.departmentIdSnapshot || ''))
      && (!filter.date || task.workDate === filter.date)
      && (!filter.status || task.status === filter.status)
    ));
    return { items: rows.slice((filter.page - 1) * filter.pageSize, filter.page * filter.pageSize), total: rows.length };
  };

  return {
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
    async createGeneratedTasks(rows) {
      let created = 0;
      for (const row of rows) {
        if (tasks.some((item) => item.templateId === row.templateId && item.employeeId === row.employeeId && item.workDate === row.workDate)) continue;
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
