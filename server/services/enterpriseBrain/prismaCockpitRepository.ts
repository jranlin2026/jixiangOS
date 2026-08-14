import type { CockpitBusinessRecord, EnterpriseCockpitRepository } from './cockpitRepository';
import { STORAGE_KEYS } from '../../../src/shared/utils/constants';

type Client = {
  department: any;
  user: any;
  positionStandard: any;
  employeeTask: any;
  dailyReview: any;
  businessRecord: any;
  leadRecord: any;
  objective: any;
};

const day = (value: unknown): string => new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(value as string));
const dataObject = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
const shanghaiDayRange = (dateFrom: string, dateTo: string) => ({
  gte: new Date(`${dateFrom}T00:00:00.000+08:00`),
  lte: new Date(`${dateTo}T23:59:59.999+08:00`),
});
const normalizedDomain = (domain: string): string => {
  if (domain === STORAGE_KEYS.ORDERS) return 'orders';
  if (domain === STORAGE_KEYS.REFUNDS) return 'refunds';
  if (domain === STORAGE_KEYS.RECOVERY_ORDERS) return 'recoveryOrders';
  return domain;
};

export function createPrismaEnterpriseCockpitRepository(prisma: Client): EnterpriseCockpitRepository {
  return {
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
    async listEmployees(departmentIds, positionIds) {
      const rows = await prisma.user.findMany({
        where: { isActive: true, employmentStatus: 'active', ...(departmentIds ? { departmentId: { in: departmentIds } } : {}), ...(positionIds?.length ? { positionId: { in: positionIds } } : {}) },
        select: { id: true, name: true, departmentId: true, positionId: true, isActive: true },
      });
      return rows;
    },
    async listCurrentStandardPositionIds(positionIds) {
      if (!positionIds.length) return [];
      const now = new Date();
      const rows = await prisma.positionStandard.findMany({
        where: { positionId: { in: positionIds }, currentVersionId: { not: null } },
        include: { versions: { where: { status: 'CURRENT', OR: [{ effectiveAt: null }, { effectiveAt: { lte: now } }] }, select: { id: true } } },
      });
      return rows.filter((row: any) => row.versions.some((version: any) => version.id === row.currentVersionId)).map((row: any) => row.positionId);
    },
    async listTasks(employeeIds, dateFrom, dateTo) {
      if (!employeeIds.length) return [];
      const rows = await prisma.employeeTask.findMany({
        where: { employeeId: { in: employeeIds }, workDate: shanghaiDayRange(dateFrom, dateTo) },
        select: { employeeId: true, departmentIdSnapshot: true, workDate: true, status: true, dueAt: true },
      });
      return rows.map((row: any) => ({ employeeId: row.employeeId, departmentId: row.departmentIdSnapshot || null, workDate: day(row.workDate), status: row.status, dueAt: row.dueAt ? new Date(row.dueAt).toISOString() : null }));
    },
    async listReviews(employeeIds, dateFrom, dateTo) {
      if (!employeeIds.length) return [];
      const rows = await prisma.dailyReview.findMany({
        where: { employeeId: { in: employeeIds }, workDate: shanghaiDayRange(dateFrom, dateTo) },
        select: { employeeId: true, departmentIdSnapshot: true, workDate: true },
      });
      return rows.map((row: any) => ({ employeeId: row.employeeId, departmentId: row.departmentIdSnapshot || null, workDate: day(row.workDate) }));
    },
    async listBusiness(employeeIds, dateFrom, dateTo) {
      if (!employeeIds.length) return [];
      const users = await prisma.user.findMany({ where: { id: { in: employeeIds } }, select: { id: true, name: true, departmentId: true } });
      const idByName = new Map<string, any>(users.map((user: any) => [user.name, user]));
      const ids = new Set(employeeIds);
      const { gte: from, lte: to } = shanghaiDayRange(dateFrom, dateTo);
      const [records, leads] = await Promise.all([
        prisma.businessRecord.findMany({ where: { eventAt: { gte: from, lte: to } }, select: { domain: true, owner: true, amount: true, eventAt: true, status: true, data: true } }),
        prisma.leadRecord.findMany({ where: { createdAt: { gte: from, lte: to } }, select: { id: true, owner: true, assignedTo: true, createdAt: true, data: true } }),
      ]);
      const result: CockpitBusinessRecord[] = [];
      for (const row of records) {
        const data = dataObject(row.data);
        const ownerId = String(data.ownerId || data.salesId || data.salesUserId || data.applicantId || idByName.get(row.owner || '')?.id || '');
        if (!ids.has(ownerId)) continue;
        const owner = users.find((item: any) => item.id === ownerId);
        const storedDomain = String(row.domain || '');
        if (storedDomain === STORAGE_KEYS.LEADS) continue;
        const domain = normalizedDomain(storedDomain);
        result.push({
          domain,
          ownerId,
          departmentId: owner?.departmentId || null,
          eventDate: day(row.eventAt),
          amount: Number(row.amount || data.actualAmount || data.amount || 0),
          isUpgrade: Boolean(data.isUpgrade || data.upgradeFromOrderId || data.orderType === '升级'),
          isRefund: domain === 'refunds' || /退款/.test(String(row.status || '')),
        });
      }
      for (const row of leads) {
        const data = dataObject(row.data);
        const ownerId = String(data.assignedToId || data.assignedToUserId || data.ownerId || idByName.get(row.assignedTo || row.owner || '')?.id || '');
        if (!ids.has(ownerId)) continue;
        const owner = users.find((item: any) => item.id === ownerId);
        result.push({ domain: 'leads', ownerId, departmentId: owner?.departmentId || null, eventDate: day(row.createdAt), amount: 0 });
      }
      return result;
    },
    async listOkrSummary(employeeIds) {
      if (!employeeIds.length) return { objectiveCount: 0, riskObjectiveCount: 0, objectivesWithoutKeyResults: 0, averageProgress: 0 };
      const rows = await prisma.objective.findMany({
        where: { ownerId: { in: employeeIds }, cycle: { status: 'ACTIVE' }, status: { in: ['PUBLISHED', 'COMPLETED'] } },
        select: { progress: true, health: true, _count: { select: { keyResults: true } } },
      });
      return {
        objectiveCount: rows.length,
        riskObjectiveCount: rows.filter((row: any) => row.health !== 'ON_TRACK').length,
        objectivesWithoutKeyResults: rows.filter((row: any) => Number(row._count?.keyResults || 0) === 0).length,
        averageProgress: rows.length ? Math.round(rows.reduce((sum: number, row: any) => sum + Number(row.progress || 0), 0) / rows.length * 10) / 10 : 0,
      };
    },
    async listDeliverySummary(employeeIds) {
      if (!employeeIds.length) return { activeCount: 0, overdueCount: 0, blockedCount: 0, completedCount: 0 };
      const rows = await prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.DELIVERIES }, select: { data: true } });
      const deliveries = rows.map((row: any) => dataObject(row.data)).filter((delivery: any) => employeeIds.includes(String(delivery.ownerId || '')));
      return {
        activeCount: deliveries.filter((delivery: any) => delivery.status !== '已完成').length,
        overdueCount: deliveries.filter((delivery: any) => delivery.status === '超期').length,
        blockedCount: deliveries.filter((delivery: any) => delivery.status === '阻塞').length,
        completedCount: deliveries.filter((delivery: any) => delivery.status === '已完成').length,
      };
    },
  };
}
