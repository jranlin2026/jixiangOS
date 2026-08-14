import { failure, success } from '../../api/response';
import type { AuthenticatedUser } from '../../../src/types/auth';
import { hasPermission, isSuperAdmin, PERMISSION_KEYS } from '../../../src/shared/utils/permissions';
import type { EnterpriseCockpitRepository } from './cockpitRepository';

type Dependencies = { repository: EnterpriseCockpitRepository; now?: () => Date; rolloutPositionIds?: string[]; rolloutLabel?: string };

const date = (value: unknown): string | null => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : null;
const rate = (value: number, total: number) => total > 0 ? Math.round((value / total) * 1000) / 10 : 0;

function workingDays(from: string, to: string): number {
  let count = 0;
  const current = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (current <= end) {
    if (![0, 6].includes(current.getUTCDay())) count += 1;
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return Math.max(1, count);
}

export function createEnterpriseCockpitService(deps: Dependencies) {
  const clock = deps.now || (() => new Date());
  return {
    async getCockpit(raw: any, actor: AuthenticatedUser) {
      if (!hasPermission(actor, PERMISSION_KEYS.BRAIN_DASHBOARD)) return failure<never>('无权查看企业AI大脑驾驶舱', 403);
      const dateFrom = date(raw?.dateFrom);
      const dateTo = date(raw?.dateTo);
      if (!dateFrom || !dateTo || dateFrom > dateTo) return failure<never>('日期范围不正确', 400);
      const departmentIds = isSuperAdmin(actor)
        ? undefined
        : actor.departmentId ? await deps.repository.listDepartmentTree(actor.departmentId) : [];
      if (departmentIds && !departmentIds.length) return failure<never>('当前账号未绑定可管理部门', 409);
      const employees = await deps.repository.listEmployees(departmentIds, deps.rolloutPositionIds);
      const employeeIds = employees.map((item) => item.id);
      const positionIds = Array.from(new Set(employees.flatMap((item) => item.positionId ? [item.positionId] : [])));
      const [standardPositionIds, tasks, reviews, business, okr, delivery] = await Promise.all([
        deps.repository.listCurrentStandardPositionIds(positionIds),
        deps.repository.listTasks(employeeIds, dateFrom, dateTo),
        deps.repository.listReviews(employeeIds, dateFrom, dateTo),
        deps.repository.listBusiness(employeeIds, dateFrom, dateTo),
        deps.repository.listOkrSummary(employeeIds),
        deps.repository.listDeliverySummary(employeeIds),
      ]);
      const coveredEmployees = employees.filter((item) => item.positionId && standardPositionIds.includes(item.positionId)).length;
      const completedTasks = tasks.filter((item) => ['COMPLETED', 'CONFIRMED'].includes(item.status)).length;
      const overdueCount = tasks.filter((item) => ['PENDING', 'RETURNED'].includes(item.status) && item.dueAt && new Date(item.dueAt) < clock()).length;
      const reviewExpected = employees.length * workingDays(dateFrom, dateTo);
      const orders = business.filter((item) => item.domain === 'orders' && !item.isRefund);
      const execution = {
        standardCoverageRate: rate(coveredEmployees, employees.length),
        taskCompletionRate: rate(completedTasks, tasks.length),
        overdueCount,
        reviewRate: rate(reviews.length, reviewExpected),
        taskCount: tasks.length,
        completedTaskCount: completedTasks,
        reviewCount: reviews.length,
      };
      const insights: string[] = [];
      if (execution.standardCoverageRate < 100) insights.push(`仍有 ${employees.length - coveredEmployees} 名员工没有当前生效岗位标准。`);
      if (overdueCount > 0) insights.push(`当前范围有 ${overdueCount} 项任务逾期，需要负责人下钻处理。`);
      if (execution.reviewRate < 80) insights.push(`复盘提交率为 ${execution.reviewRate}%，建议先核对未提交人员和工作日口径。`);
      if (!insights.length) insights.push('当前标准覆盖、任务执行和复盘提交没有发现明显缺口。');
      return success({
        range: { dateFrom, dateTo },
        scope: { departmentIds: departmentIds || ['*'], employeeCount: employees.length, rolloutLabel: deps.rolloutLabel || '当前授权范围' },
        execution,
        business: {
          leadCount: business.filter((item) => item.domain === 'leads').length,
          orderCount: orders.length,
          orderAmount: orders.reduce((sum, item) => sum + item.amount, 0),
          upgradeCount: orders.filter((item) => item.isUpgrade).length,
          refundCount: business.filter((item) => item.isRefund || item.domain === 'refunds').length,
        },
        organization: { okr, delivery },
        insights,
        generatedAt: clock().toISOString(),
      });
    },
  };
}

export type EnterpriseCockpitService = ReturnType<typeof createEnterpriseCockpitService>;
