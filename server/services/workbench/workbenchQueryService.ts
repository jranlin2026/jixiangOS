import type { AuthenticatedUser } from '../../../src/types/auth';
import type { EmployeeTask } from '../../../src/types/enterpriseBrain';
import type {
  Paginated,
  WorkbenchCockpit,
  WorkbenchCockpitFilters,
  WorkbenchMetricDefinitions,
  WorkbenchCockpitMetricKey,
  WorkbenchSummary,
  WorkbenchSummaryMetricKey,
  WorkbenchSummaryFilters,
  WorkbenchTaskFilters,
  WorkbenchTaskListItem,
} from '../../../src/types/workbench';
import {
  WORKBENCH_DEFAULT_PAGE,
  WORKBENCH_DEFAULT_PAGE_SIZE,
  WORKBENCH_MAX_PAGE,
  WORKBENCH_MAX_PAGE_SIZE,
} from '../../../src/types/workbench';
import { hasPermission, isSuperAdmin, PERMISSION_KEYS } from '../../../src/shared/utils/permissions';
import { failure as apiFailure, success, type ApiResponse } from '../../api/response';
import type {
  WorkbenchQueryScope,
  WorkbenchRepository,
  WorkbenchTaskMetrics,
  WorkbenchTaskQuery,
} from './workbenchRepository';

const STATUSES = new Set<EmployeeTask['status']>([
  'PENDING', 'IN_PROGRESS', 'COMPLETED', 'CONFIRMED', 'RETURNED', 'CANCELED',
]);
const PRIORITIES = new Set<NonNullable<EmployeeTask['priority']>>(['LOW', 'NORMAL', 'HIGH', 'URGENT']);
const SHANGHAI_OFFSET_MILLISECONDS = 8 * 60 * 60 * 1000;

const SUMMARY_DEFINITIONS = {
  total: { label: '任务总数', definition: '当前可见范围和筛选条件下的全部任务。', unit: 'count', numerator: 'matchingTasks', denominator: null },
  pending: { label: '待处理', definition: '当前状态为 PENDING 的任务数。', unit: 'count', numerator: 'status=PENDING', denominator: null },
  inProgress: { label: '处理中', definition: '当前状态为 IN_PROGRESS 的任务数。', unit: 'count', numerator: 'status=IN_PROGRESS', denominator: null },
  awaitingConfirmation: { label: '待确认', definition: '当前状态为 COMPLETED 的任务数。', unit: 'count', numerator: 'status=COMPLETED', denominator: null },
  confirmed: { label: '已确认', definition: '当前状态为 CONFIRMED 的任务数。', unit: 'count', numerator: 'status=CONFIRMED', denominator: null },
  returned: { label: '当前被退回', definition: '当前状态为 RETURNED 的任务数。', unit: 'count', numerator: 'status=RETURNED', denominator: null },
  canceled: { label: '已取消', definition: '当前状态为 CANCELED 的任务数。', unit: 'count', numerator: 'status=CANCELED', denominator: null },
  overdue: { label: '已逾期', definition: '活跃状态且 dueAt 早于请求时钟的任务数。', unit: 'count', numerator: 'activeAndDueBeforeNow', denominator: null },
  dueToday: { label: '今日到期', definition: '活跃状态且 dueAt 落在当前上海业务日的任务数。', unit: 'count', numerator: 'activeAndDueInShanghaiDay', denominator: null },
  collaboration: { label: '协作任务', definition: '本人摘要计他人负责且本人在协作人中的任务；团队摘要计含任意协作人的任务。', unit: 'count', numerator: 'collaborativeTasks', denominator: null },
  estimatedMinutes: { label: '预计工作量', definition: '已配置 estimatedMinutes 的任务分钟数总和。', unit: 'minutes', numerator: 'sumEstimatedMinutes', denominator: 'estimatedMinutesTaskCount' },
  estimatedMinutesTaskCount: { label: '已配置工作量任务数', definition: 'estimatedMinutes 非空的任务数。', unit: 'count', numerator: 'tasksWithEstimatedMinutes', denominator: null },
} satisfies WorkbenchMetricDefinitions<WorkbenchSummaryMetricKey>;

const COCKPIT_DEFINITIONS = {
  created: { label: '期间任务数', definition: 'workDate 落在指定上海业务日窗口的任务数。', unit: 'count', numerator: 'matchingTasks', denominator: null },
  confirmed: { label: '已确认', definition: '当前状态为 CONFIRMED 的任务数。', unit: 'count', numerator: 'status=CONFIRMED', denominator: null },
  awaitingConfirmation: { label: '待确认', definition: '当前状态为 COMPLETED 的任务数。', unit: 'count', numerator: 'status=COMPLETED', denominator: null },
  canceled: { label: '已取消', definition: '当前状态为 CANCELED 的任务数。', unit: 'count', numerator: 'status=CANCELED', denominator: null },
  completionDenominator: { label: '完成率分母', definition: '期间任务数减去已取消任务数。', unit: 'count', numerator: 'created-canceled', denominator: null },
  canceledDenominator: { label: '取消任务分母贡献', definition: '取消任务对完成率分母的贡献固定为 0。', unit: 'count', numerator: 'constantZero', denominator: null },
  completionRate: { label: '最终完成率', definition: '已确认任务数除以完成率分母。', unit: 'percent', numerator: 'confirmed', denominator: 'completionDenominator' },
  onTime: { label: '按时提交任务数', definition: '已确认且首次 COMPLETE 不晚于 dueAt 的任务数。', unit: 'count', numerator: 'confirmedFirstCompleteOnTime', denominator: null },
  onTimeDenominator: { label: '按时率分母', definition: '同时具有 dueAt 和首次 COMPLETE 时间的已确认任务数。', unit: 'count', numerator: 'confirmedWithDueAndFirstComplete', denominator: null },
  onTimeRate: { label: '按时完成率', definition: '按时提交任务数除以按时率分母。', unit: 'percent', numerator: 'onTime', denominator: 'onTimeDenominator' },
  overdue: { label: '当前逾期', definition: '活跃状态且 dueAt 早于请求时钟的任务数。', unit: 'count', numerator: 'activeAndDueBeforeNow', denominator: null },
  overdueDenominator: { label: '逾期率分母', definition: '非取消且 dueAt 非空的任务数。', unit: 'count', numerator: 'nonCanceledWithDueAt', denominator: null },
  overdueRate: { label: '逾期率', definition: '当前逾期任务数除以逾期率分母。', unit: 'percent', numerator: 'overdue', denominator: 'overdueDenominator' },
  returned: { label: '当前被退回', definition: '当前状态为 RETURNED 的任务数。', unit: 'count', numerator: 'status=RETURNED', denominator: null },
  historicalReturnEventCount: { label: '历史退回事件数', definition: '所有匹配任务的 RETURN 活动总数，包含后来取消的任务。', unit: 'count', numerator: 'allReturnActivities', denominator: null },
  returnedTaskCount: { label: '历史被退回任务数', definition: '非取消且至少存在一次 RETURN 活动的任务数。', unit: 'count', numerator: 'nonCanceledTasksWithReturn', denominator: null },
  returnDenominator: { label: '退回率分母', definition: '与退回率分子同一人口的非取消任务数。', unit: 'count', numerator: 'nonCanceledTasks', denominator: null },
  returnRate: { label: '退回任务率', definition: '历史被退回任务数除以退回率分母。', unit: 'percent', numerator: 'returnedTaskCount', denominator: 'returnDenominator' },
  blocked: { label: '当前阻塞', definition: '当前 RETURNED，或 PENDING/IN_PROGRESS 且已逾期的任务数。', unit: 'count', numerator: 'returnedOrOverdueActive', denominator: null },
  averageFirstActionMinutes: { label: '平均首次处理时长', definition: '首次处理总分钟除以首次处理分母。', unit: 'minutes', numerator: 'firstActionMinutesTotal', denominator: 'firstActionDenominator' },
  firstActionDenominator: { label: '首次处理时长分母', definition: '存在首次 START 活动或可用 startedAt 回退值的任务数。', unit: 'count', numerator: 'tasksWithFirstAction', denominator: null },
  averageConfirmationMinutes: { label: '平均确认时长', definition: '确认时长总分钟除以确认时长分母。', unit: 'minutes', numerator: 'confirmationMinutesTotal', denominator: 'confirmationDurationDenominator' },
  confirmationDurationDenominator: { label: '确认时长分母', definition: '同时存在首次 COMPLETE/confirmed 相关时间且先后顺序有效的任务数。', unit: 'count', numerator: 'tasksWithValidCompleteAndConfirm', denominator: null },
} satisfies WorkbenchMetricDefinitions<WorkbenchCockpitMetricKey>;

type Dependencies = { repository: WorkbenchRepository; now?: () => Date };

type NormalizedFilters = {
  page: number;
  pageSize: number;
  dateFrom?: string;
  dateTo?: string;
  startAt?: Date;
  endAtExclusive?: Date;
  status?: EmployeeTask['status'];
  businessModule?: string;
  priority?: NonNullable<EmployeeTask['priority']>;
  employeeId?: string;
  departmentId?: string;
  overdue?: boolean;
  confirmation?: boolean;
};

type NormalizationResult = { value: NormalizedFilters } | { error: string };

const failure = <T>(message: string, code: number): ApiResponse<T> => (
  apiFailure<T>(message, code) as ApiResponse<T>
);

const cleanId = (value: unknown): string | undefined => {
  const normalized = String(value || '').trim();
  return normalized || undefined;
};

function validDate(value: unknown): string | null {
  const text = String(value || '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? text
    : null;
}

function shanghaiDateAtStart(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day) - SHANGHAI_OFFSET_MILLISECONDS);
}

function shanghaiDateAfter(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1) - SHANGHAI_OFFSET_MILLISECONDS);
}

function shanghaiDateKey(value: Date): string {
  const shifted = new Date(value.getTime() + SHANGHAI_OFFSET_MILLISECONDS);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function booleanFilter(value: unknown): boolean | undefined | null {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true) return true;
  if (value === false) return false;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  return null;
}

function positiveSafeInteger(value: unknown, fallback: number, maximum: number): number | null {
  if (value === undefined || value === null || value === '') return fallback;
  let parsed: number;
  if (typeof value === 'number') parsed = value;
  else {
    const normalized = String(value).trim();
    if (!/^[1-9]\d*$/.test(normalized)) return null;
    parsed = Number(normalized);
  }
  if (!Number.isSafeInteger(parsed) || parsed < 1) return null;
  return Math.min(parsed, maximum);
}

function normalizeFilters(raw: WorkbenchTaskFilters = {}, defaultDate?: string): NormalizationResult {
  const rawDateFrom = raw.dateFrom === undefined && defaultDate ? defaultDate : raw.dateFrom;
  const rawDateTo = raw.dateTo === undefined && defaultDate ? defaultDate : raw.dateTo;
  const dateFrom = rawDateFrom === undefined || rawDateFrom === '' ? undefined : validDate(rawDateFrom);
  const dateTo = rawDateTo === undefined || rawDateTo === '' ? undefined : validDate(rawDateTo);
  if ((rawDateFrom !== undefined && rawDateFrom !== '' && !dateFrom) || (rawDateTo !== undefined && rawDateTo !== '' && !dateTo)) {
    return { error: '日期格式不正确' };
  }
  if (dateFrom && dateTo && dateFrom > dateTo) return { error: '日期范围不正确' };

  const rawStatus = cleanId(raw.status)?.toUpperCase();
  const rawPriority = cleanId(raw.priority)?.toUpperCase();
  if (rawStatus && !STATUSES.has(rawStatus as EmployeeTask['status'])) return { error: '任务状态不正确' };
  if (rawPriority && !PRIORITIES.has(rawPriority as NonNullable<EmployeeTask['priority']>)) return { error: '任务优先级不正确' };

  const overdue = booleanFilter(raw.overdue);
  const confirmation = booleanFilter(raw.confirmation);
  if (overdue === null || confirmation === null) return { error: '布尔筛选条件不正确' };

  const businessModule = cleanId(raw.module)?.toUpperCase();
  const employeeId = cleanId(raw.employeeId);
  const departmentId = cleanId(raw.departmentId);
  if ((businessModule?.length || 0) > 40 || (employeeId?.length || 0) > 64 || (departmentId?.length || 0) > 64) {
    return { error: '筛选条件过长' };
  }

  const page = positiveSafeInteger(raw.page, WORKBENCH_DEFAULT_PAGE, WORKBENCH_MAX_PAGE);
  const pageSize = positiveSafeInteger(raw.pageSize, WORKBENCH_DEFAULT_PAGE_SIZE, WORKBENCH_MAX_PAGE_SIZE);
  if (page === null || pageSize === null) return { error: '分页参数必须是有限的正安全整数' };
  return {
    value: {
      page, pageSize,
      ...(dateFrom ? { dateFrom, startAt: shanghaiDateAtStart(dateFrom) } : {}),
      ...(dateTo ? { dateTo, endAtExclusive: shanghaiDateAfter(dateTo) } : {}),
      ...(rawStatus ? { status: rawStatus as EmployeeTask['status'] } : {}),
      ...(businessModule ? { businessModule } : {}),
      ...(rawPriority ? { priority: rawPriority as NonNullable<EmployeeTask['priority']> } : {}),
      ...(employeeId ? { employeeId } : {}),
      ...(departmentId ? { departmentId } : {}),
      ...(overdue !== undefined ? { overdue } : {}),
      ...(confirmation !== undefined ? { confirmation } : {}),
    },
  };
}

function rate(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

function average(total: number, denominator: number): number {
  return denominator > 0 ? Math.round((total / denominator) * 10) / 10 : 0;
}

function summary(metrics: WorkbenchTaskMetrics): WorkbenchSummary {
  return {
    total: metrics.total,
    pending: metrics.statusCounts.PENDING,
    inProgress: metrics.statusCounts.IN_PROGRESS,
    awaitingConfirmation: metrics.statusCounts.COMPLETED,
    confirmed: metrics.statusCounts.CONFIRMED,
    returned: metrics.statusCounts.RETURNED,
    canceled: metrics.statusCounts.CANCELED,
    overdue: metrics.overdue,
    dueToday: metrics.dueToday,
    collaboration: metrics.collaboration,
    estimatedMinutes: metrics.estimatedMinutes,
    estimatedMinutesTaskCount: metrics.estimatedMinutesTaskCount,
    metricDefinitions: SUMMARY_DEFINITIONS,
  };
}

export interface WorkbenchQueryService {
  listMine(filters: WorkbenchTaskFilters, actor: AuthenticatedUser): Promise<ApiResponse<Paginated<WorkbenchTaskListItem>>>;
  listTeam(filters: WorkbenchTaskFilters, actor: AuthenticatedUser): Promise<ApiResponse<Paginated<WorkbenchTaskListItem>>>;
  summaryMine(filters: WorkbenchSummaryFilters, actor: AuthenticatedUser): Promise<ApiResponse<WorkbenchSummary>>;
  summaryTeam(filters: WorkbenchSummaryFilters, actor: AuthenticatedUser): Promise<ApiResponse<WorkbenchSummary>>;
  cockpit(filters: WorkbenchCockpitFilters, actor: AuthenticatedUser): Promise<ApiResponse<WorkbenchCockpit>>;
}

export function createWorkbenchQueryService(deps: Dependencies): WorkbenchQueryService {
  const clock = deps.now || (() => new Date());

  const queryFor = async (
    filters: NormalizedFilters,
    scope: WorkbenchQueryScope,
    authorizedDepartmentIds?: string[],
    now = clock(),
  ): Promise<WorkbenchTaskQuery | { error: string; code: number }> => {
    let departmentIds: string[] | undefined;
    if (filters.departmentId) {
      const selectedTree = await deps.repository.listDepartmentTree(filters.departmentId);
      if (!selectedTree.length) return { error: '部门不存在或已停用', code: 404 };
      if (authorizedDepartmentIds && selectedTree.some((id) => !authorizedDepartmentIds.includes(id))) {
        return { error: '部门不在授权范围内', code: 403 };
      }
      departmentIds = selectedTree;
    }
    return {
      scope,
      ...(filters.startAt ? { dateFrom: filters.startAt } : {}),
      ...(filters.endAtExclusive ? { dateToExclusive: filters.endAtExclusive } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.businessModule ? { businessModule: filters.businessModule } : {}),
      ...(filters.priority ? { priority: filters.priority } : {}),
      ...(filters.employeeId ? { employeeId: filters.employeeId } : {}),
      ...(departmentIds ? { departmentIds } : {}),
      ...(filters.overdue !== undefined ? { overdue: filters.overdue } : {}),
      ...(filters.confirmation !== undefined ? { confirmation: filters.confirmation } : {}),
      now,
    };
  };

  const teamScope = async (actor: AuthenticatedUser): Promise<{
    scope: WorkbenchQueryScope;
    departmentIds: string[];
  } | { error: string; code: number }> => {
    if (!actor.departmentId) return { error: '当前账号未绑定部门', code: 409 };
    const departmentIds = await deps.repository.listDepartmentTree(actor.departmentId);
    if (!departmentIds.length) return { error: '当前账号未绑定可管理部门', code: 409 };
    return { scope: { kind: 'departments', departmentIds }, departmentIds };
  };

  const list = async (
    raw: WorkbenchTaskFilters,
    scope: WorkbenchQueryScope,
    authorizedDepartmentIds?: string[],
  ): Promise<ApiResponse<Paginated<WorkbenchTaskListItem>>> => {
    const normalized = normalizeFilters(raw);
    if ('error' in normalized) return failure(normalized.error, 400);
    const query = await queryFor(normalized.value, scope, authorizedDepartmentIds, clock());
    if ('error' in query) return failure(query.error, query.code);
    const { page, pageSize } = normalized.value;
    const result = await deps.repository.listWorkbenchTasks({ ...query, page, pageSize });
    if (!Number.isSafeInteger(result.total) || result.total < 0) {
      return failure('分页总数不正确', 500);
    }
    return success({
      items: result.items,
      pagination: { page, pageSize, total: result.total, totalPages: Math.ceil(result.total / pageSize) },
    });
  };

  const summarize = async (
    raw: WorkbenchSummaryFilters,
    scope: WorkbenchQueryScope,
    authorizedDepartmentIds?: string[],
  ): Promise<ApiResponse<WorkbenchSummary>> => {
    const normalized = normalizeFilters(raw);
    if ('error' in normalized) return failure(normalized.error, 400);
    const query = await queryFor(normalized.value, scope, authorizedDepartmentIds, clock());
    if ('error' in query) return failure(query.error, query.code);
    return success(summary(await deps.repository.summarizeWorkbenchTasks(query)));
  };

  return {
    async listMine(filters, actor) {
      if (!hasPermission(actor, PERMISSION_KEYS.TASK_SELF, 'read')) return failure('无权读取本人任务', 403);
      return list(filters, { kind: 'mine', actorId: actor.id });
    },

    async listTeam(filters, actor) {
      if (!hasPermission(actor, PERMISSION_KEYS.TASK_TEAM, 'read')) return failure('无权读取团队任务', 403);
      const team = await teamScope(actor);
      if ('error' in team) return failure(team.error, team.code);
      return list(filters, team.scope, team.departmentIds);
    },

    async summaryMine(filters, actor) {
      if (!hasPermission(actor, PERMISSION_KEYS.TASK_SELF, 'read')) return failure('无权读取本人任务摘要', 403);
      return summarize(filters, { kind: 'mine', actorId: actor.id });
    },

    async summaryTeam(filters, actor) {
      if (!hasPermission(actor, PERMISSION_KEYS.TASK_TEAM, 'read')) return failure('无权读取团队任务摘要', 403);
      const team = await teamScope(actor);
      if ('error' in team) return failure(team.error, team.code);
      return summarize(filters, team.scope, team.departmentIds);
    },

    async cockpit(filters, actor) {
      if (!hasPermission(actor, PERMISSION_KEYS.BRAIN_DASHBOARD, 'read')) return failure('无权查看经营驾驶舱', 403);
      const now = clock();
      const normalized = normalizeFilters(filters, shanghaiDateKey(now));
      if ('error' in normalized) return failure(normalized.error, 400);

      let scope: WorkbenchQueryScope = { kind: 'company' };
      let authorizedDepartmentIds: string[] | undefined;
      if (!isSuperAdmin(actor)) {
        const team = await teamScope(actor);
        if ('error' in team) return failure(team.error, team.code);
        scope = team.scope;
        authorizedDepartmentIds = team.departmentIds;
      }
      const query = await queryFor(normalized.value, scope, authorizedDepartmentIds, now);
      if ('error' in query) return failure(query.error, query.code);
      const metrics = await deps.repository.summarizeWorkbenchTasks(query);
      const completionDenominator = metrics.total - metrics.statusCounts.CANCELED;
      const returnDenominator = completionDenominator;
      const dateFrom = normalized.value.dateFrom!;
      const dateTo = normalized.value.dateTo!;
      return success({
        range: {
          dateFrom, dateTo, timeZone: 'Asia/Shanghai',
          startAt: normalized.value.startAt!.toISOString(),
          endAtExclusive: normalized.value.endAtExclusive!.toISOString(),
        },
        created: metrics.total,
        confirmed: metrics.statusCounts.CONFIRMED,
        awaitingConfirmation: metrics.statusCounts.COMPLETED,
        canceled: metrics.statusCounts.CANCELED,
        completionDenominator,
        canceledDenominator: 0,
        completionRate: rate(metrics.statusCounts.CONFIRMED, completionDenominator),
        onTime: metrics.onTime,
        onTimeDenominator: metrics.onTimeDenominator,
        onTimeRate: rate(metrics.onTime, metrics.onTimeDenominator),
        overdue: metrics.overdue,
        overdueDenominator: metrics.overdueDenominator,
        overdueRate: rate(metrics.overdue, metrics.overdueDenominator),
        returned: metrics.statusCounts.RETURNED,
        historicalReturnEventCount: metrics.historicalReturnEventCount,
        returnedTaskCount: metrics.returnedTaskCount,
        returnDenominator,
        returnRate: rate(metrics.returnedTaskCount, returnDenominator),
        blocked: metrics.blocked,
        averageFirstActionMinutes: average(metrics.firstActionMinutesTotal, metrics.firstActionDenominator),
        firstActionDenominator: metrics.firstActionDenominator,
        averageConfirmationMinutes: average(metrics.confirmationMinutesTotal, metrics.confirmationDurationDenominator),
        confirmationDurationDenominator: metrics.confirmationDurationDenominator,
        metricDefinitions: COCKPIT_DEFINITIONS,
      });
    },
  };
}
