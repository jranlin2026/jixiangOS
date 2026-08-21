import { failure, success } from '../../api/response';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../../../src/types/auth';
import { hasPermission, isSuperAdmin, PERMISSION_KEYS } from '../../../src/shared/utils/permissions';
import {
  MAX_GENERATED_TASK_CANDIDATES,
  type EnterpriseTaskRepository,
  type GeneratedTaskInput,
  type GeneratedTaskWriteOptions,
} from './taskRepository';
import { createWorkbenchCommandService, type WorkbenchCommandService } from '../workbench/workbenchCommandService';

type Dependencies = {
  repository: EnterpriseTaskRepository;
  now?: () => Date;
  commandService?: WorkbenchCommandService;
  summarizeReview?: (input: {
    employeeName: string;
    workDate: string;
    completedSummary: string;
    problems: string;
    successCases: string;
    failureCases: string;
    customerNeeds: string;
    suggestions: string;
  }) => Promise<string>;
};

function validDate(value: unknown): string | null {
  const date = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(new Date(`${date}T00:00:00Z`).getTime()) ? date : null;
}

function pageInput(raw: any) {
  return { page: Math.max(1, Number(raw?.page) || 1), pageSize: Math.min(100, Math.max(1, Number(raw?.pageSize) || 20)) };
}

function dateAt(date: string, time = '00:00'): Date {
  return new Date(`${date}T${/^\d{2}:\d{2}$/.test(time) ? time : '00:00'}:00+08:00`);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error('OPERATION_ABORTED');
}

const validTime = (value: unknown): string | null => {
  const time = String(value || '');
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  return time;
};

export function createEnterpriseTaskService(deps: Dependencies) {
  const clock = deps.now || (() => new Date());
  const commandService = deps.commandService || createWorkbenchCommandService({ repository: deps.repository, now: clock });
  return {
    async listTemplates(raw: any, actor: AuthenticatedUser) {
      if (!hasPermission(actor, PERMISSION_KEYS.STANDARD_MAINTAIN) && !hasPermission(actor, PERMISSION_KEYS.TASK_ASSIGN)) {
        return failure<never>('无权查看任务模板', 403);
      }
      return success(await deps.repository.listTemplates(raw?.positionId ? String(raw.positionId) : undefined));
    },

    async saveTemplate(raw: any, actor: AuthenticatedUser) {
      if (!hasPermission(actor, PERMISSION_KEYS.STANDARD_MAINTAIN, 'write') && !hasPermission(actor, PERMISSION_KEYS.TASK_ASSIGN, 'write')) {
        return failure<never>('无权维护任务模板', 403);
      }
      const positionId = String(raw?.positionId || '').trim();
      const name = String(raw?.name || '').trim().slice(0, 200);
      const weekdays: number[] = Array.isArray(raw?.weekdays) ? Array.from(new Set<number>(raw.weekdays.map(Number).filter((item: number) => Number.isInteger(item) && item >= 0 && item <= 6))) : [];
      const targetValue = raw?.targetValue === '' || raw?.targetValue === null || raw?.targetValue === undefined ? null : Number(raw.targetValue);
      if (!positionId || !name || !weekdays.length || (targetValue !== null && !Number.isFinite(targetValue))) return failure<never>('岗位、任务名称、执行星期和目标值格式必须正确', 400);
      const position = await deps.repository.findPosition(positionId);
      if (!position?.isActive) return failure<never>('岗位不存在或已停用', 404);
      if (!isSuperAdmin(actor) && (!actor.departmentId || position.departmentId !== actor.departmentId)) return failure<never>('只能维护本部门归属岗位的任务模板', 403);
      const dueTime = raw?.dueTime ? validTime(raw.dueTime) : null;
      const effectiveAt = raw?.effectiveAt ? new Date(raw.effectiveAt) : null;
      const expiresAt = raw?.expiresAt ? new Date(raw.expiresAt) : null;
      if ((raw?.dueTime && !dueTime) || (effectiveAt && Number.isNaN(effectiveAt.getTime())) || (expiresAt && Number.isNaN(expiresAt.getTime())) || (effectiveAt && expiresAt && effectiveAt >= expiresAt)) return failure<never>('截止时间或生效区间格式不正确', 400);
      const template = await deps.repository.saveTemplate({
        id: String(raw?.id || `task-template-${randomUUID()}`),
        positionId,
        standardVersionId: String(raw?.standardVersionId || '').trim() || null,
        name,
        description: String(raw?.description || '').trim().slice(0, 10000) || null,
        targetValue,
        unit: String(raw?.unit || '').trim().slice(0, 40) || null,
        scheduleType: 'DAILY',
        weekdays,
        dueTime,
        evidenceRequired: Boolean(raw?.evidenceRequired),
        isActive: raw?.isActive !== false,
        effectiveAt,
        expiresAt,
        actorId: actor.id,
        actorName: actor.name,
      });
      return success(template);
    },

    async assignOneOff(raw: any, actor: AuthenticatedUser) {
      if (!hasPermission(actor, PERMISSION_KEYS.TASK_ASSIGN, 'write')) return failure<never>('无权指派任务', 403);
      const employee = await deps.repository.findEmployee(String(raw?.employeeId || ''));
      if (!employee?.isActive || employee.employmentStatus === 'left') return failure<never>('员工不存在或已离职', 404);
      const sourceType = String(raw?.sourceType || '').trim().slice(0, 100) || null;
      const sourceId = String(raw?.sourceId || '').trim().slice(0, 100) || null;
      const sourceItemId = String(raw?.sourceItemId || '').trim().slice(0, 100) || null;
      if (!isSuperAdmin(actor)) {
        if (!actor.departmentId) return failure<never>('当前账号未绑定部门', 409);
        const allowed = await deps.repository.listDepartmentTree(actor.departmentId);
        if (!allowed.includes(employee.departmentId || '')) return failure<never>('员工不在授权团队范围内', 403);
      }
      if (sourceType === 'COCKPIT_INTERVENTION') {
        if (!sourceId || !['REMIND_SALES', 'SUPERVISOR_ASSIST', 'BOSS_FOLLOW_UP'].includes(sourceItemId || '')) {
          return failure<never>('管理介入缺少客户或介入方式', 400);
        }
        const customer = await deps.repository.findCustomerInterventionTarget(sourceId);
        if (!customer?.ownerId) return failure<never>('客户不存在或未绑定负责人', 404);
        const owner = await deps.repository.findEmployee(customer.ownerId);
        if (!owner?.isActive || owner.employmentStatus === 'left') return failure<never>('客户负责人不存在或已离职', 409);
        if (sourceItemId === 'REMIND_SALES' && employee.id !== customer.ownerId) {
          return failure<never>('提醒销售必须指派给客户负责人', 400);
        }
        if (sourceItemId === 'BOSS_FOLLOW_UP' && employee.id !== actor.id) {
          return failure<never>('老板亲跟必须由当前管理者本人执行', 400);
        }
        if (!isSuperAdmin(actor)) {
          const allowed = await deps.repository.listDepartmentTree(actor.departmentId!);
          if (!allowed.includes(owner.departmentId || '')) return failure<never>('客户不在授权团队范围内', 403);
        }
      }
      const workDate = validDate(raw?.workDate);
      const title = String(raw?.title || '').trim().slice(0, 200);
      if (!workDate || !title) return failure<never>('工作日期和任务名称不能为空', 400);
      const targetValue = raw?.targetValue === '' || raw?.targetValue === null || raw?.targetValue === undefined ? null : Number(raw.targetValue);
      const dueAtDate = raw?.dueAt ? new Date(raw.dueAt) : null;
      if ((targetValue !== null && !Number.isFinite(targetValue)) || (dueAtDate && Number.isNaN(dueAtDate.getTime()))) return failure<never>('目标值或截止时间格式不正确', 400);
      const task = await deps.repository.createOneOffTask({
        templateId: null, employeeId: employee.id, employeeName: employee.name,
        departmentIdSnapshot: employee.departmentId || null, departmentNameSnapshot: employee.departmentName || null,
        positionIdSnapshot: employee.positionId || null, positionNameSnapshot: employee.positionName || null,
        standardVersionIdSnapshot: null, workDate, title,
        description: String(raw?.description || '').trim().slice(0, 10000) || null,
        targetValue, unit: String(raw?.unit || '').trim().slice(0, 40) || null,
        evidenceRequired: Boolean(raw?.evidenceRequired),
        dueAt: dueAtDate ? dueAtDate.toISOString() : null,
        taskType: raw?.taskType === 'FOLLOW_UP' ? 'FOLLOW_UP' : 'ACTION',
        priority: ['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(String(raw?.priority)) ? raw.priority : 'NORMAL',
        businessModule: String(raw?.businessModule || 'GENERAL').trim().slice(0, 100),
        sourceRoute: String(raw?.sourceRoute || '').trim().slice(0, 500) || null,
        sourceLabel: String(raw?.sourceLabel || '').trim().slice(0, 200) || null,
        sourceType, sourceId, sourceItemId,
        assignedById: actor.id, assignedByName: actor.name,
      });
      return success(task);
    },
    async generateDailyTasks(rawDate: string, actor: AuthenticatedUser, options: GeneratedTaskWriteOptions = {}) {
      throwIfAborted(options.signal);
      if (!hasPermission(actor, PERMISSION_KEYS.TASK_ASSIGN, 'write')) return failure<never>('无权生成员工任务', 403);
      const date = validDate(rawDate);
      if (!date) return failure<never>('工作日期格式不正确', 400);
      const instant = dateAt(date);
      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
      throwIfAborted(options.signal);
      const templates = (await deps.repository.listActiveTemplates(instant)).filter((item) => (
        item.scheduleType === 'DAILY' && item.weekdays.includes(weekday)
      ));
      throwIfAborted(options.signal);
      const departmentIds = isSuperAdmin(actor) ? undefined : actor.departmentId ? await deps.repository.listDepartmentTree(actor.departmentId) : [];
      throwIfAborted(options.signal);
      if (departmentIds && !departmentIds.length) return failure<never>('当前账号未绑定可管理部门', 409);
      const employees = await deps.repository.listActiveEmployees(Array.from(new Set(templates.map((item) => item.positionId))), departmentIds);
      throwIfAborted(options.signal);
      const rows: GeneratedTaskInput[] = [];
      for (const template of templates) {
        for (const employee of employees) {
          if (employee.positionId !== template.positionId) continue;
          if (rows.length >= MAX_GENERATED_TASK_CANDIDATES) throw new Error('GENERATED_TASK_CANDIDATE_LIMIT_EXCEEDED');
          if (rows.length % 250 === 0) throwIfAborted(options.signal);
          rows.push({
            templateId: template.id,
            employeeId: employee.id,
            employeeName: employee.name,
            departmentIdSnapshot: employee.departmentId || null,
            departmentNameSnapshot: employee.departmentName || null,
            positionIdSnapshot: employee.positionId || null,
            positionNameSnapshot: employee.positionName || null,
            standardVersionIdSnapshot: template.standardVersionId,
            workDate: date,
            title: template.name,
            description: template.description,
            targetValue: template.targetValue,
            unit: template.unit,
            evidenceRequired: template.evidenceRequired,
            dueAt: template.dueTime ? dateAt(date, template.dueTime).toISOString() : null,
          });
        }
      }
      throwIfAborted(options.signal);
      const createdCount = await deps.repository.createGeneratedTasks(rows, options);
      return success({ date, candidateCount: rows.length, createdCount, skippedCount: rows.length - createdCount });
    },

    async listMyTasks(raw: any, actor: AuthenticatedUser) {
      if (!hasPermission(actor, PERMISSION_KEYS.TASK_SELF)) return failure<never>('无权读取本人任务', 403);
      const date = raw?.date ? validDate(raw.date) : null;
      if (raw?.date && !date) return failure<never>('日期格式不正确', 400);
      const pagination = pageInput(raw);
      const data = await deps.repository.listTasks({ employeeId: actor.id, ...(date ? { date } : {}), status: raw?.status, ...pagination });
      return success({ ...data, ...pagination });
    },

    async listTeamTasks(raw: any, actor: AuthenticatedUser) {
      if (!hasPermission(actor, PERMISSION_KEYS.TASK_TEAM)) return failure<never>('无权读取团队任务', 403);
      const date = raw?.date ? validDate(raw.date) : null;
      if (raw?.date && !date) return failure<never>('日期格式不正确', 400);
      const pagination = pageInput(raw);
      if (!isSuperAdmin(actor) && !actor.departmentId) return failure<never>('当前账号未绑定部门', 409);
      const departmentIds = isSuperAdmin(actor) ? undefined : await deps.repository.listDepartmentTree(actor.departmentId!);
      const data = await deps.repository.listTasks({ ...(departmentIds ? { departmentIds } : {}), ...(date ? { date } : {}), status: raw?.status, ...pagination });
      return success({ ...data, ...pagination });
    },

    async listLinkedTasks(raw: any, actor: AuthenticatedUser) {
      const sourceType = String(raw?.sourceType || '').trim();
      const sourceId = String(raw?.sourceId || '').trim();
      if (sourceType !== 'COCKPIT_INTERVENTION' || !sourceId) return failure<never>('介入任务来源参数不正确', 400);
      const pagination = pageInput(raw);
      if (hasPermission(actor, PERMISSION_KEYS.TASK_TEAM)) {
        if (!isSuperAdmin(actor) && !actor.departmentId) return failure<never>('当前账号未绑定部门', 409);
        const departmentIds = isSuperAdmin(actor) ? undefined : await deps.repository.listDepartmentTree(actor.departmentId!);
        const data = await deps.repository.listTasks({ ...(departmentIds ? { departmentIds } : {}), sourceType, sourceId, ...pagination });
        return success({ ...data, ...pagination });
      }
      if (!hasPermission(actor, PERMISSION_KEYS.TASK_SELF)) return failure<never>('无权读取介入任务', 403);
      const data = await deps.repository.listTasks({ employeeId: actor.id, sourceType, sourceId, ...pagination });
      return success({ ...data, ...pagination });
    },

    async completeTask(taskId: string, raw: any, actor: AuthenticatedUser) {
      return commandService.completeTask(taskId, raw || {}, actor);
    },

    async confirmTask(taskId: string, raw: any, actor: AuthenticatedUser) {
      if (raw?.action === 'RETURN') {
        return commandService.returnTask(taskId, { reason: String(raw?.reason || '') }, actor);
      }
      return commandService.confirmTask(taskId, {
        qualityScore: raw?.qualityScore,
        comment: raw?.comment,
      }, actor);
    },

    async submitReview(raw: any, actor: AuthenticatedUser) {
      if (!hasPermission(actor, PERMISSION_KEYS.REVIEW_SELF, 'write')) return failure<never>('无权提交本人复盘', 403);
      const date = validDate(raw?.workDate);
      const fields = ['completedSummary', 'problems', 'successCases', 'failureCases', 'customerNeeds', 'suggestions'] as const;
      const values = Object.fromEntries(fields.map((field) => [field, String(raw?.[field] || '').trim().slice(0, 20000)])) as Record<typeof fields[number], string>;
      if (!date || !values.completedSummary) return failure<never>('工作日期和今日完成不能为空', 400);
      let aiSummary: string | null = null;
      if (deps.summarizeReview) {
        try {
          aiSummary = String(await deps.summarizeReview({ employeeName: actor.name, workDate: date, ...values })).trim().slice(0, 20000) || null;
        } catch {
          // AI配置不可用时仍允许员工保存原始复盘，后续可重新分析。
        }
      }
      const review = await deps.repository.upsertDailyReview({
        employeeId: actor.id, employeeName: actor.name, departmentIdSnapshot: actor.departmentId || null,
        positionIdSnapshot: actor.positionId || null, workDate: date, ...values, aiSummary,
      });
      return success(review);
    },

    async listTeamReviews(raw: any, actor: AuthenticatedUser) {
      if (!hasPermission(actor, PERMISSION_KEYS.REVIEW_TEAM)) return failure<never>('无权读取团队复盘', 403);
      if (!actor.departmentId) return failure<never>('当前账号未绑定部门', 409);
      const reviewDate = raw?.date ? validDate(raw.date) : null;
      if (raw?.date && !reviewDate) return failure<never>('日期格式不正确', 400);
      const pagination = pageInput(raw);
      const departmentIds = await deps.repository.listDepartmentTree(actor.departmentId);
      const data = await deps.repository.listDailyReviews({ departmentIds, ...(reviewDate ? { date: reviewDate } : {}), ...pagination });
      return success({ ...data, ...pagination });
    },
  };
}

export type EnterpriseTaskService = ReturnType<typeof createEnterpriseTaskService>;
