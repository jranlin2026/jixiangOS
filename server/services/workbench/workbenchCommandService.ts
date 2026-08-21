import type { AuthenticatedUser } from '../../../src/types/auth';
import type { CustomerInterventionOutcome, EmployeeTask, TaskActivity } from '../../../src/types/enterpriseBrain';
import { transitionTaskStatus, TaskLifecycleDomainError } from '../../../src/domain/workbench/taskLifecycle';
import { hasPermission, isSuperAdmin, PERMISSION_KEYS } from '../../../src/shared/utils/permissions';
import { failure as apiFailure, success, type ApiResponse } from '../../api/response';
import type { WorkbenchEvidenceInput, WorkbenchRepository } from './workbenchRepository';

export type CompleteTaskInput = {
  result: string;
  actualValue?: number | null;
  evidence?: WorkbenchEvidenceInput[];
  comment?: string;
  customerOutcome?: CustomerInterventionOutcome;
};

export type ConfirmTaskInput = {
  qualityScore?: number | null;
  comment?: string;
};

const EVIDENCE_TYPES = new Set([
  'TEXT', 'URL', 'PUBLISH_URL', 'SCREENSHOT_URL', 'ATTACHMENT', 'BUSINESS_RECORD',
]);
const URL_EVIDENCE_TYPES = new Set(['URL', 'PUBLISH_URL', 'SCREENSHOT_URL']);
const REFERENCE_EVIDENCE_TYPES = new Set(['ATTACHMENT', 'BUSINESS_RECORD']);
const MAX_EVIDENCE_ITEMS = 20;
const CUSTOMER_OUTCOME_EVIDENCE_TYPE = 'CUSTOMER_OUTCOME';
const CUSTOMER_OPPORTUNITY_STAGES = new Set([
  'not_set', 'needs_discovery', 'solution_demo', 'proposal', 'objection', 'payment_pending', 'won', 'lost',
]);

type Dependencies = {
  repository: WorkbenchRepository;
  now?: () => Date;
  notify?: (event: WorkbenchNotificationEvent) => Promise<unknown> | unknown;
};

const failure = (message: string, code: number): ApiResponse<EmployeeTask> => (
  apiFailure<EmployeeTask>(message, code) as ApiResponse<EmployeeTask>
);

export type WorkbenchNotificationEvent = {
  action: 'START' | 'COMPLETE' | 'CONFIRM' | 'RETURN' | 'REASSIGN' | 'REMIND' | 'CANCEL' | 'REOPEN';
  task: EmployeeTask;
  actor: AuthenticatedUser;
  recipientIds: string[];
  activity: TaskActivity;
};

export function createWorkbenchCommandService(deps: Dependencies) {
  const clock = deps.now || (() => new Date());

  const notifyAfterCommit = async (
    action: WorkbenchNotificationEvent['action'],
    response: ApiResponse<EmployeeTask>,
    actor: AuthenticatedUser,
    activity: TaskActivity | undefined,
    recipientIds?: string[],
  ): Promise<ApiResponse<EmployeeTask>> => {
    if (response.code === 0 && response.data && activity && deps.notify) {
      try {
        const notificationResult = await deps.notify({
          action, task: response.data, actor,
          recipientIds: recipientIds || [response.data.employeeId],
          activity,
        });
        if (notificationResult && typeof notificationResult === 'object' && 'task' in notificationResult) {
          const updated = (notificationResult as { task?: EmployeeTask | null }).task;
          if (updated) return success(updated);
        }
      } catch {
        // 通知是已提交业务事务之后的尽力操作，失败不得回滚任务。
      }
    }
    return response;
  };

  const comment = (value: unknown): string | null | undefined => {
    const normalized = String(value || '').trim();
    if (normalized.length > 500) return undefined;
    return normalized || null;
  };

  const normalizeEvidence = (value: unknown): WorkbenchEvidenceInput[] | null => {
    if (!Array.isArray(value)) return [];
    if (value.length > MAX_EVIDENCE_ITEMS) return null;
    const evidence: WorkbenchEvidenceInput[] = [];
    const seen = new Set<string>();
    for (const raw of value) {
      const type = String(raw?.type ?? '').trim().toUpperCase();
      const referenceId = String(raw?.referenceId || '').trim();
      const content = String(raw?.content || '').trim();
      if (!EVIDENCE_TYPES.has(type) || referenceId.length > 160 || content.length > 10_000) return null;
      if (!referenceId && !content) continue;
      if (URL_EVIDENCE_TYPES.has(type)) {
        if (!content || referenceId) return null;
        try {
          const url = new URL(content);
          if (!['http:', 'https:'].includes(url.protocol)) return null;
        } catch {
          return null;
        }
      }
      if (type === 'TEXT' && (!content || referenceId)) return null;
      if (REFERENCE_EVIDENCE_TYPES.has(type) && !referenceId) return null;
      const item = { type, ...(referenceId ? { referenceId } : {}), ...(content ? { content } : {}) };
      const key = JSON.stringify([item.type, item.referenceId || '', item.content || '']);
      if (!seen.has(key)) {
        seen.add(key);
        evidence.push(item);
      }
    }
    return evidence;
  };

  const normalizeCustomerOutcome = (value: unknown, requireFutureDueAt = true): CustomerInterventionOutcome | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const raw = value as Record<string, unknown>;
    const followUpSummary = String(raw.followUpSummary || '').trim();
    const nextActionTitle = String(raw.nextActionTitle || '').trim();
    const nextActionDueAt = String(raw.nextActionDueAt || '').trim();
    const dueAt = new Date(nextActionDueAt);
    const opportunityStageCode = String(raw.opportunityStageCode || '').trim();
    const rawAmount = raw.opportunityAmount;
    const opportunityAmount = rawAmount === undefined || rawAmount === null || rawAmount === '' ? null : Number(rawAmount);
    if (!followUpSummary || followUpSummary.length > 2_000 || !nextActionTitle || nextActionTitle.length > 120) return null;
    if (!nextActionDueAt || !Number.isFinite(dueAt.getTime()) || (requireFutureDueAt && dueAt.getTime() <= clock().getTime())) return null;
    if (opportunityStageCode && !CUSTOMER_OPPORTUNITY_STAGES.has(opportunityStageCode)) return null;
    if (opportunityAmount !== null && (!Number.isFinite(opportunityAmount) || opportunityAmount < 0)) return null;
    return {
      followUpSummary,
      nextActionTitle,
      nextActionDueAt: dueAt.toISOString(),
      ...(opportunityStageCode ? { opportunityStageCode: opportunityStageCode as CustomerInterventionOutcome['opportunityStageCode'] } : {}),
      opportunityAmount,
    };
  };
  const parseCustomerOutcome = (value: string | null | undefined): unknown => {
    try { return value ? JSON.parse(value) : null; } catch { return null; }
  };

  return {
    async startTask(taskId: string, actor: AuthenticatedUser): Promise<ApiResponse<EmployeeTask>> {
      if (!hasPermission(actor, PERMISSION_KEYS.TASK_SELF, 'write')) {
        return failure('无权开始本人任务', 403);
      }

      let notificationActivity: TaskActivity | undefined;
      const response = await deps.repository.transaction(async (repository) => {
        const task = await repository.findTaskForUpdate(taskId);
        if (!task || task.employeeId !== actor.id) {
          return failure('任务不存在或不属于当前员工', 404);
        }

        let status: EmployeeTask['status'];
        try {
          status = transitionTaskStatus(task.status, 'START');
        } catch (error) {
          if (error instanceof TaskLifecycleDomainError) return failure(error.message, 409);
          throw error;
        }

        const now = clock();
        const fromStatus = task.status;
        const updated = await repository.updateTask(task.id, { status, startedAt: now.toISOString() });
        if (!updated) return failure('任务状态已变化，请刷新后重试', 409);
        notificationActivity = await repository.appendActivity({
          taskId: task.id, action: 'START', actorId: actor.id, actorName: actor.name,
          fromStatus, toStatus: status, comment: null, metadata: null, createdAt: now,
        });
        return success(updated);
      });
      return notifyAfterCommit('START', response, actor, notificationActivity);
    },

    async completeTask(taskId: string, input: CompleteTaskInput, actor: AuthenticatedUser): Promise<ApiResponse<EmployeeTask>> {
      if (!hasPermission(actor, PERMISSION_KEYS.TASK_SELF, 'write')) {
        return failure('无权完成本人任务', 403);
      }
      const result = String(input?.result || '').trim();
      const rawActualValue = (input as { actualValue?: unknown })?.actualValue;
      const actualValue = rawActualValue === undefined || rawActualValue === null || rawActualValue === ''
        ? null
        : Number(rawActualValue);
      const evidence = normalizeEvidence(input?.evidence);
      const activityComment = comment(input?.comment);
      if (!result || result.length > 20_000 || (actualValue !== null && !Number.isFinite(actualValue))) {
        return failure('请填写格式正确的完成结果和实际值', 400);
      }
      if (!evidence) return failure('任务证据格式不正确，链接只允许 http 或 https', 400);
      if (activityComment === undefined) return failure('评论不能超过500个字符', 400);

      let notificationActivity: TaskActivity | undefined;
      const response = await deps.repository.transaction(async (repository) => {
        const task = await repository.findTaskForUpdate(taskId);
        if (!task || task.employeeId !== actor.id) {
          return failure('任务不存在或不属于当前员工', 404);
        }
        const customerOutcome = task.sourceType === 'COCKPIT_INTERVENTION'
          ? normalizeCustomerOutcome(input?.customerOutcome)
          : null;
        if (task.sourceType === 'COCKPIT_INTERVENTION' && !customerOutcome) {
          return failure('请填写本次跟进结果、下一步动作和有效截止时间', 400);
        }
        const persistedEvidence = customerOutcome
          ? [...evidence, { type: CUSTOMER_OUTCOME_EVIDENCE_TYPE, content: JSON.stringify(customerOutcome) }]
          : evidence;
        const references = [...new Map(evidence
          .filter((candidate) => REFERENCE_EVIDENCE_TYPES.has(candidate.type))
          .map((candidate) => [`${candidate.type}:${candidate.referenceId}`, candidate])).values()];
        if (references.length && !await repository.authorizeEvidenceReferences({ task, evidence: references, actor })) {
          return failure('无权引用该附件或业务记录', 403);
        }
        if (task.targetValue !== null && actualValue === null) return failure('请填写实际值', 400);
        if (task.evidenceRequired && persistedEvidence.length === 0) return failure('该任务必须提交证据', 400);
        if (
          ['MARKETING_PUBLISH', 'ASSET_MATRIX_PUBLISH'].includes(task.sourceType || '')
          && !evidence.some((item) => ['PUBLISH_URL', 'SCREENSHOT_URL'].includes(item.type))
        ) {
          return failure('发布任务必须提交有效的发布链接或截图链接', 400);
        }

        let status: EmployeeTask['status'];
        try {
          status = transitionTaskStatus(task.status, 'COMPLETE');
        } catch (error) {
          if (error instanceof TaskLifecycleDomainError) return failure(error.message, 409);
          throw error;
        }

        const now = clock();
        const fromStatus = task.status;
        const updated = await repository.updateTask(task.id, {
          status, actualValue, result, evidence: persistedEvidence, evidenceActorId: actor.id,
          completedAt: now.toISOString(), returnedReason: null,
        });
        if (!updated) return failure('任务状态已变化，请刷新后重试', 409);
        notificationActivity = await repository.appendActivity({
          taskId: task.id, action: 'COMPLETE', actorId: actor.id, actorName: actor.name,
          fromStatus, toStatus: status, comment: activityComment, metadata: null, createdAt: now,
        });
        return success(updated);
      });
      return notifyAfterCommit('COMPLETE', response, actor, notificationActivity);
    },

    async confirmTask(taskId: string, input: ConfirmTaskInput, actor: AuthenticatedUser): Promise<ApiResponse<EmployeeTask>> {
      if (!hasPermission(actor, PERMISSION_KEYS.TASK_CONFIRM, 'write')) {
        return failure('无权确认团队任务', 403);
      }
      const qualityScore = input?.qualityScore === undefined || input.qualityScore === null
        ? null
        : Number(input.qualityScore);
      const activityComment = comment(input?.comment);
      if (qualityScore !== null && (!Number.isInteger(qualityScore) || qualityScore < 0 || qualityScore > 100)) {
        return failure('质量评分必须是0到100之间的整数', 400);
      }
      if (activityComment === undefined) return failure('评论不能超过500个字符', 400);
      if (!isSuperAdmin(actor) && !actor.departmentId) return failure('当前账号未绑定部门', 409);

      let notificationActivity: TaskActivity | undefined;
      const response = await deps.repository.transaction(async (repository) => {
        const task = await repository.findTaskForUpdate(taskId);
        if (!task) return failure('任务不存在', 404);
        if (!isSuperAdmin(actor)) {
          const departments = await repository.listDepartmentTree(actor.departmentId!);
          if (!departments.includes(task.departmentIdSnapshot || '')) {
            return failure('任务不在授权团队范围内', 403);
          }
        }

        let status: EmployeeTask['status'];
        try {
          status = transitionTaskStatus(task.status, 'CONFIRM');
        } catch (error) {
          if (error instanceof TaskLifecycleDomainError) return failure(error.message, 409);
          throw error;
        }

        const now = clock();
        const fromStatus = task.status;
        const updated = await repository.updateTask(task.id, {
          status, confirmedAt: now.toISOString(), confirmedById: actor.id, confirmedByName: actor.name,
          returnedReason: null, qualityScore, qualityComment: activityComment,
        });
        if (!updated) return failure('任务状态已变化，请刷新后重试', 409);
        if (task.sourceType === 'COCKPIT_INTERVENTION') {
          const encoded = task.evidence.find((item) => item.type === CUSTOMER_OUTCOME_EVIDENCE_TYPE)?.content;
          const outcome = normalizeCustomerOutcome(parseCustomerOutcome(encoded), false);
          if (!outcome) return failure('客户处理结果缺失或已失效，请退回员工重新提交', 409);
          await repository.applyCustomerInterventionOutcome({ task: updated, outcome, actor, now });
        }
        notificationActivity = await repository.appendActivity({
          taskId: task.id, action: 'CONFIRM', actorId: actor.id, actorName: actor.name,
          fromStatus, toStatus: status, comment: activityComment,
          metadata: qualityScore === null ? null : { qualityScore }, createdAt: now,
        });
        return success(updated);
      });
      return notifyAfterCommit('CONFIRM', response, actor, notificationActivity);
    },

    async returnTask(taskId: string, input: { reason: string }, actor: AuthenticatedUser): Promise<ApiResponse<EmployeeTask>> {
      if (!hasPermission(actor, PERMISSION_KEYS.TASK_CONFIRM, 'write')) {
        return failure('无权退回团队任务', 403);
      }
      const reason = comment(input?.reason);
      if (reason === undefined) return failure('退回原因不能超过500个字符', 400);
      if (!reason) return failure('退回任务必须填写原因', 400);
      if (!isSuperAdmin(actor) && !actor.departmentId) return failure('当前账号未绑定部门', 409);

      let notificationActivity: TaskActivity | undefined;
      const response = await deps.repository.transaction(async (repository) => {
        const task = await repository.findTaskForUpdate(taskId);
        if (!task) return failure('任务不存在', 404);
        if (!isSuperAdmin(actor)) {
          const departments = await repository.listDepartmentTree(actor.departmentId!);
          if (!departments.includes(task.departmentIdSnapshot || '')) {
            return failure('任务不在授权团队范围内', 403);
          }
        }

        let status: EmployeeTask['status'];
        try {
          status = transitionTaskStatus(task.status, 'RETURN');
        } catch (error) {
          if (error instanceof TaskLifecycleDomainError) return failure(error.message, 409);
          throw error;
        }

        const now = clock();
        const fromStatus = task.status;
        const updated = await repository.updateTask(task.id, {
          status, returnedReason: reason, confirmedAt: null, confirmedById: null,
          confirmedByName: null, qualityScore: null, qualityComment: null,
        });
        if (!updated) return failure('任务状态已变化，请刷新后重试', 409);
        notificationActivity = await repository.appendActivity({
          taskId: task.id, action: 'RETURN', actorId: actor.id, actorName: actor.name,
          fromStatus, toStatus: status, comment: reason, metadata: null, createdAt: now,
        });
        return success(updated);
      });
      return notifyAfterCommit('RETURN', response, actor, notificationActivity);
    },

    async reassignTask(taskId: string, input: { employeeId: string; reason: string }, actor: AuthenticatedUser): Promise<ApiResponse<EmployeeTask>> {
      if (!hasPermission(actor, PERMISSION_KEYS.TASK_ASSIGN, 'write')) {
        return failure('无权转派团队任务', 403);
      }
      const employeeId = String(input?.employeeId || '').trim();
      const reason = comment(input?.reason);
      if (reason === undefined) return failure('转派原因不能超过500个字符', 400);
      if (!employeeId || !reason) return failure('新负责人和转派原因不能为空', 400);
      if (!actor.departmentId) return failure('当前账号未绑定部门', 409);

      let previousEmployeeId: string | undefined;
      let notificationActivity: TaskActivity | undefined;
      const response = await deps.repository.transaction(async (repository) => {
        const task = await repository.findTaskForUpdate(taskId);
        if (!task) return failure('任务不存在', 404);
        const departments = await repository.listDepartmentTree(actor.departmentId!);
        if (!departments.includes(task.departmentIdSnapshot || '')) {
          return failure('任务不在授权团队范围内', 403);
        }
        if (['CONFIRMED', 'CANCELED'].includes(task.status)) {
          return failure(`任务状态 ${task.status} 为终态，不能转派`, 409);
        }
        const employee = await repository.findEmployee(employeeId);
        if (!employee?.isActive || employee.employmentStatus === 'left') {
          return failure('员工不存在或已离职', 404);
        }
        if (!departments.includes(employee.departmentId || '')) {
          return failure('新负责人不在授权团队范围内', 403);
        }

        const now = clock();
        const previousEmployee = { id: task.employeeId, name: task.employeeName };
        previousEmployeeId = previousEmployee.id;
        const updated = await repository.updateTask(task.id, {
          employeeId: employee.id, employeeName: employee.name,
          departmentIdSnapshot: employee.departmentId || null,
          departmentNameSnapshot: employee.departmentName || null,
          positionIdSnapshot: employee.positionId || null,
          positionNameSnapshot: employee.positionName || null,
          remindedAt: null,
          lastOverdueNotifiedAt: null,
        });
        if (!updated) return failure('任务状态已变化，请刷新后重试', 409);
        notificationActivity = await repository.appendActivity({
          taskId: task.id, action: 'REASSIGN', actorId: actor.id, actorName: actor.name,
          fromStatus: task.status, toStatus: task.status, comment: reason,
          metadata: {
            previousEmployeeId: previousEmployee.id, previousEmployeeName: previousEmployee.name,
            employeeId: employee.id, employeeName: employee.name,
          },
          createdAt: now,
        });
        return success(updated);
      });
      return notifyAfterCommit(
        'REASSIGN', response, actor, notificationActivity,
        previousEmployeeId && response.data
          ? Array.from(new Set([previousEmployeeId, response.data.employeeId]))
          : undefined,
      );
    },

    async remindTask(taskId: string, actor: AuthenticatedUser): Promise<ApiResponse<EmployeeTask>> {
      if (!hasPermission(actor, PERMISSION_KEYS.TASK_ASSIGN, 'write')) {
        return failure('无权催办团队任务', 403);
      }
      if (!actor.departmentId) return failure('当前账号未绑定部门', 409);

      let notificationActivity: TaskActivity | undefined;
      const response = await deps.repository.transaction(async (repository) => {
        const task = await repository.findTaskForUpdate(taskId);
        if (!task) return failure('任务不存在', 404);
        const departments = await repository.listDepartmentTree(actor.departmentId!);
        if (!departments.includes(task.departmentIdSnapshot || '')) {
          return failure('任务不在授权团队范围内', 403);
        }
        if (['CONFIRMED', 'CANCELED'].includes(task.status)) {
          return failure(`任务状态 ${task.status} 为终态，不能催办`, 409);
        }

        const now = clock();
        notificationActivity = await repository.appendActivity({
          taskId: task.id, action: 'REMIND', actorId: actor.id, actorName: actor.name,
          fromStatus: task.status, toStatus: task.status, comment: null,
          metadata: {
            expectedEmployeeId: task.employeeId,
            expectedDepartmentIdSnapshot: task.departmentIdSnapshot ?? null,
            expectedDueAt: task.dueAt ?? null,
            expectedWorkDate: task.workDate,
            expectedSourceVersion: task.sourceVersion ?? null,
          },
          createdAt: now,
        });
        return success(task);
      });
      return notifyAfterCommit('REMIND', response, actor, notificationActivity);
    },

    async cancelTask(taskId: string, input: { reason: string }, actor: AuthenticatedUser): Promise<ApiResponse<EmployeeTask>> {
      if (!hasPermission(actor, PERMISSION_KEYS.TASK_ASSIGN, 'write')) {
        return failure('无权取消团队任务', 403);
      }
      const reason = comment(input?.reason);
      if (reason === undefined) return failure('取消原因不能超过500个字符', 400);
      if (!reason) return failure('取消任务必须填写原因', 400);
      if (!actor.departmentId) return failure('当前账号未绑定部门', 409);

      let notificationActivity: TaskActivity | undefined;
      const response = await deps.repository.transaction(async (repository) => {
        const task = await repository.findTaskForUpdate(taskId);
        if (!task) return failure('任务不存在', 404);
        const departments = await repository.listDepartmentTree(actor.departmentId!);
        if (!departments.includes(task.departmentIdSnapshot || '')) {
          return failure('任务不在授权团队范围内', 403);
        }

        let status: EmployeeTask['status'];
        try {
          status = transitionTaskStatus(task.status, 'CANCEL');
        } catch (error) {
          if (error instanceof TaskLifecycleDomainError) return failure(error.message, 409);
          throw error;
        }

        const now = clock();
        const fromStatus = task.status;
        const updated = await repository.updateTask(task.id, {
          status, canceledAt: now.toISOString(), canceledById: actor.id, canceledReason: reason,
        });
        if (!updated) return failure('任务状态已变化，请刷新后重试', 409);
        notificationActivity = await repository.appendActivity({
          taskId: task.id, action: 'CANCEL', actorId: actor.id, actorName: actor.name,
          fromStatus, toStatus: status, comment: reason, metadata: null, createdAt: now,
        });
        return success(updated);
      });
      return notifyAfterCommit('CANCEL', response, actor, notificationActivity);
    },

    async reopenTask(taskId: string, input: { reason: string }, actor: AuthenticatedUser): Promise<ApiResponse<EmployeeTask>> {
      if (!isSuperAdmin(actor)) return failure('只有任务治理管理员可以重开终态任务', 403);
      const reason = comment(input?.reason);
      if (reason === undefined) return failure('重开原因不能超过500个字符', 400);
      if (!reason) return failure('重开任务必须填写原因', 400);

      let notificationActivity: TaskActivity | undefined;
      const response = await deps.repository.transaction(async (repository) => {
        const task = await repository.findTaskForUpdate(taskId);
        if (!task) return failure('任务不存在', 404);
        if (!['CONFIRMED', 'CANCELED'].includes(task.status)) {
          return failure(`任务状态 ${task.status} 不是可治理重开的终态`, 409);
        }

        const now = clock();
        const fromStatus = task.status;
        const updated = await repository.updateTask(task.id, {
          status: 'PENDING', startedAt: null, completedAt: null,
          confirmedAt: null, confirmedById: null, confirmedByName: null,
          returnedReason: null, canceledAt: null, canceledById: null, canceledReason: null,
          qualityScore: null, qualityComment: null,
        });
        if (!updated) return failure('任务状态已变化，请刷新后重试', 409);
        notificationActivity = await repository.appendActivity({
          taskId: task.id, action: 'REOPEN', actorId: actor.id, actorName: actor.name,
          fromStatus, toStatus: 'PENDING', comment: reason, metadata: null, createdAt: now,
        });
        return success(updated);
      });
      return notifyAfterCommit('REOPEN', response, actor, notificationActivity);
    },
  };
}

export type WorkbenchCommandService = ReturnType<typeof createWorkbenchCommandService>;
