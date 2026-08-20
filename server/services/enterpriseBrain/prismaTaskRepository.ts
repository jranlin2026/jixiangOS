import { randomUUID } from 'node:crypto';
import type {
  DailyReviewRecord,
  EmployeeTaskRecord,
  EnterpriseTaskRepository,
  GeneratedTaskInput,
  TaskTemplateRecord,
} from './taskRepository';

type Client = {
  $transaction<T>(callback: (tx: any) => Promise<T>, options?: { isolationLevel: 'Serializable' }): Promise<T>;
  taskTemplate: any;
  position: any;
  employeeTask: any;
  taskEvidence: any;
  dailyReview: any;
  user: any;
  department: any;
};

const dateText = (value: unknown): string => new Date(value as string).toISOString().slice(0, 10);
const iso = (value: unknown): string | null => value ? new Date(value as string).toISOString() : null;
const number = (value: unknown): number | null => value === null || value === undefined ? null : Number(value);

function mapTemplate(row: any): TaskTemplateRecord {
  return {
    id: row.id, positionId: row.positionId, standardVersionId: row.standardVersionId || null,
    name: row.name, description: row.description || null, targetValue: number(row.targetValue), unit: row.unit || null,
    scheduleType: row.scheduleType, weekdays: Array.isArray(row.weekdays) ? row.weekdays.map(Number) : [],
    dueTime: row.dueTime || null, evidenceRequired: Boolean(row.evidenceRequired), isActive: Boolean(row.isActive),
    effectiveAt: row.effectiveAt ? new Date(row.effectiveAt) : null, expiresAt: row.expiresAt ? new Date(row.expiresAt) : null,
  };
}

function mapTask(row: any): EmployeeTaskRecord {
  return {
    id: row.id, templateId: row.templateId || null, employeeId: row.employeeId, employeeName: row.employeeName,
    departmentIdSnapshot: row.departmentIdSnapshot || null, departmentNameSnapshot: row.departmentNameSnapshot || null,
    positionIdSnapshot: row.positionIdSnapshot || null, positionNameSnapshot: row.positionNameSnapshot || null,
    standardVersionIdSnapshot: row.standardVersionIdSnapshot || null, workDate: dateText(row.workDate),
    title: row.title, description: row.description || null, targetValue: number(row.targetValue), actualValue: number(row.actualValue),
    unit: row.unit || null, evidenceRequired: Boolean(row.evidenceRequired), status: row.status, result: row.result || null,
    dueAt: iso(row.dueAt), returnedReason: row.returnedReason || null,
    sourceType: row.sourceType || null, sourceId: row.sourceId || null, sourceItemId: row.sourceItemId || null,
    evidence: (row.evidence || []).map((item: any) => ({ id: item.id, type: item.type, referenceId: item.referenceId || null, content: item.content || null })),
  };
}

function mapReview(row: any): DailyReviewRecord {
  return {
    id: row.id, employeeId: row.employeeId, employeeName: row.employeeName,
    departmentIdSnapshot: row.departmentIdSnapshot || null, positionIdSnapshot: row.positionIdSnapshot || null,
    workDate: dateText(row.workDate), completedSummary: row.completedSummary, problems: row.problems,
    successCases: row.successCases, failureCases: row.failureCases, customerNeeds: row.customerNeeds,
    suggestions: row.suggestions, aiSummary: row.aiSummary || null, submittedAt: new Date(row.submittedAt).toISOString(),
  };
}

function generatedData(row: GeneratedTaskInput) {
  return {
    id: `task-${randomUUID()}`, templateId: row.templateId, employeeId: row.employeeId, employeeName: row.employeeName,
    departmentIdSnapshot: row.departmentIdSnapshot, departmentNameSnapshot: row.departmentNameSnapshot,
    positionIdSnapshot: row.positionIdSnapshot, positionNameSnapshot: row.positionNameSnapshot,
    standardVersionIdSnapshot: row.standardVersionIdSnapshot, workDate: new Date(`${row.workDate}T00:00:00Z`),
    title: row.title, description: row.description, targetValue: row.targetValue, unit: row.unit,
    evidenceRequired: row.evidenceRequired, dueAt: row.dueAt ? new Date(row.dueAt) : null,
    sourceType: row.sourceType, sourceId: row.sourceId, sourceItemId: row.sourceItemId,
  };
}

export function createPrismaEnterpriseTaskRepository(prisma: Client): EnterpriseTaskRepository {
  return {
    async listTemplates(positionId) {
      const rows = await prisma.taskTemplate.findMany({ where: positionId ? { positionId } : {}, orderBy: [{ positionId: 'asc' }, { createdAt: 'asc' }] });
      return rows.map(mapTemplate);
    },
    async saveTemplate(input) {
      const data = {
        positionId: input.positionId, standardVersionId: input.standardVersionId, name: input.name,
        description: input.description, targetValue: input.targetValue, unit: input.unit,
        scheduleType: input.scheduleType, weekdays: input.weekdays, dueTime: input.dueTime,
        evidenceRequired: input.evidenceRequired, isActive: input.isActive,
        effectiveAt: input.effectiveAt, expiresAt: input.expiresAt,
        createdById: input.actorId, createdByName: input.actorName,
      };
      const row = await prisma.taskTemplate.upsert({ where: { id: input.id }, create: { id: input.id, ...data }, update: data });
      return mapTemplate(row);
    },
    async findPosition(id) {
      const row = await prisma.position.findUnique({ where: { id }, select: { id: true, departmentId: true, isActive: true } });
      return row || null;
    },
    async listActiveTemplates(date) {
      const rows = await prisma.taskTemplate.findMany({
        where: { isActive: true, AND: [{ OR: [{ effectiveAt: null }, { effectiveAt: { lte: date } }] }, { OR: [{ expiresAt: null }, { expiresAt: { gt: date } }] }] },
        orderBy: [{ positionId: 'asc' }, { createdAt: 'asc' }],
      });
      return rows.map(mapTemplate);
    },
    async listActiveEmployees(positionIds, departmentIds) {
      if (!positionIds.length) return [];
      const [users, departments] = await Promise.all([
        prisma.user.findMany({ where: { positionId: { in: positionIds }, isActive: true, employmentStatus: 'active', ...(departmentIds ? { departmentId: { in: departmentIds } } : {}) } }),
        prisma.department.findMany({ select: { id: true, name: true } }),
      ]);
      const departmentNames = new Map(departments.map((item: any) => [item.id, item.name]));
      return users.map((user: any) => ({
        id: user.id, name: user.name, departmentId: user.departmentId || undefined, positionId: user.positionId || undefined,
        positionName: user.positionName || undefined, isActive: user.isActive, employmentStatus: user.employmentStatus,
        departmentName: departmentNames.get(user.departmentId) || undefined,
      }));
    },
    async createGeneratedTasks(inputs) {
      if (!inputs.length) return 0;
      const result = await prisma.employeeTask.createMany({ data: inputs.map(generatedData), skipDuplicates: true });
      return result.count;
    },
    async listTasks(filter) {
      const where: any = {};
      if (filter.employeeId) where.employeeId = filter.employeeId;
      if (filter.departmentIds) where.departmentIdSnapshot = { in: filter.departmentIds };
      if (filter.date) where.workDate = new Date(`${filter.date}T00:00:00Z`);
      if (filter.status) where.status = filter.status;
      const [rows, total] = await Promise.all([
        prisma.employeeTask.findMany({ where, include: { evidence: { orderBy: { createdAt: 'asc' } } }, orderBy: [{ workDate: 'desc' }, { dueAt: 'asc' }, { createdAt: 'asc' }], skip: (filter.page - 1) * filter.pageSize, take: filter.pageSize }),
        prisma.employeeTask.count({ where }),
      ]);
      return { items: rows.map(mapTask), total };
    },
    async listDepartmentTree(rootId) {
      const rows = await prisma.department.findMany({ where: { isActive: true }, select: { id: true, parentId: true } });
      const ids = new Set([rootId]);
      let changed = true;
      while (changed) {
        changed = false;
        rows.forEach((item: any) => { if (item.parentId && ids.has(item.parentId) && !ids.has(item.id)) { ids.add(item.id); changed = true; } });
      }
      return [...ids];
    },
    async findEmployee(id) {
      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) return null;
      const department = user.departmentId ? await prisma.department.findUnique({ where: { id: user.departmentId }, select: { name: true } }) : null;
      return { id: user.id, name: user.name, departmentId: user.departmentId || undefined, departmentName: department?.name || undefined, positionId: user.positionId || undefined, positionName: user.positionName || undefined, isActive: user.isActive, employmentStatus: user.employmentStatus };
    },
    async findTask(id) {
      const row = await prisma.employeeTask.findUnique({ where: { id }, include: { evidence: { orderBy: { createdAt: 'asc' } } } });
      return row ? mapTask(row) : null;
    },
    async completeTaskAtomic(input) {
      return prisma.$transaction(async (tx) => {
        const updated = await tx.employeeTask.updateMany({
          where: { id: input.taskId, employeeId: input.employeeId, status: { in: ['PENDING', 'RETURNED'] } },
          data: { status: 'COMPLETED', actualValue: input.actualValue, result: input.result, completedAt: input.now, returnedReason: null },
        });
        if (updated.count !== 1) return null;
        await tx.taskEvidence.deleteMany({ where: { taskId: input.taskId } });
        if (input.evidence.length) {
          await tx.taskEvidence.createMany({ data: input.evidence.map((item) => ({ id: `task-evidence-${randomUUID()}`, taskId: input.taskId, type: item.type, referenceId: item.referenceId || null, content: item.content || null, createdById: input.employeeId })) });
        }
        const row = await tx.employeeTask.findUnique({ where: { id: input.taskId }, include: { evidence: { orderBy: { createdAt: 'asc' } } } });
        return row ? mapTask(row) : null;
      }, { isolationLevel: 'Serializable' });
    },
    async confirmTaskAtomic(input) {
      const data = input.action === 'CONFIRM'
        ? { status: 'CONFIRMED', confirmedAt: input.now, confirmedById: input.actorId, confirmedByName: input.actorName, returnedReason: null }
        : { status: 'RETURNED', confirmedAt: null, confirmedById: null, confirmedByName: null, returnedReason: input.reason || null };
      const updated = await prisma.employeeTask.updateMany({ where: { id: input.taskId, status: 'COMPLETED' }, data });
      if (updated.count !== 1) return null;
      const row = await prisma.employeeTask.findUnique({ where: { id: input.taskId }, include: { evidence: { orderBy: { createdAt: 'asc' } } } });
      return row ? mapTask(row) : null;
    },
    async createOneOffTask(input) {
      const row = await prisma.employeeTask.create({ data: { ...generatedData(input), templateId: null, assignedById: input.assignedById, assignedByName: input.assignedByName }, include: { evidence: true } });
      return mapTask(row);
    },
    async upsertDailyReview(input) {
      const data = {
        employeeName: input.employeeName, departmentIdSnapshot: input.departmentIdSnapshot, positionIdSnapshot: input.positionIdSnapshot,
        completedSummary: input.completedSummary, problems: input.problems, successCases: input.successCases,
        failureCases: input.failureCases, customerNeeds: input.customerNeeds, suggestions: input.suggestions, aiSummary: input.aiSummary,
      };
      const row = await prisma.dailyReview.upsert({
        where: { employeeId_workDate: { employeeId: input.employeeId, workDate: new Date(`${input.workDate}T00:00:00Z`) } },
        create: { id: `daily-review-${randomUUID()}`, employeeId: input.employeeId, workDate: new Date(`${input.workDate}T00:00:00Z`), ...data },
        update: data,
      });
      return mapReview(row);
    },
    async listDailyReviews(filter) {
      const where: any = {};
      if (filter.employeeId) where.employeeId = filter.employeeId;
      if (filter.departmentIds) where.departmentIdSnapshot = { in: filter.departmentIds };
      if (filter.date) where.workDate = new Date(`${filter.date}T00:00:00Z`);
      const [rows, total] = await Promise.all([
        prisma.dailyReview.findMany({ where, orderBy: [{ workDate: 'desc' }, { submittedAt: 'desc' }], skip: (filter.page - 1) * filter.pageSize, take: filter.pageSize }),
        prisma.dailyReview.count({ where }),
      ]);
      return { items: rows.map(mapReview), total };
    },
  };
}
