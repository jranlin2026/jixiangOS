export type CockpitEmployee = { id: string; name?: string; departmentId: string | null; positionId: string | null; isActive: boolean };
export type CockpitTask = { employeeId: string; departmentId: string | null; workDate: string; status: string; dueAt: string | null };
export type CockpitReview = { employeeId: string; departmentId: string | null; workDate: string };
export type CockpitBusinessRecord = { domain: string; ownerId: string | null; departmentId: string | null; eventDate: string; amount: number; isUpgrade?: boolean; isRefund?: boolean };

export interface EnterpriseCockpitRepository {
  listDepartmentTree(rootId: string): Promise<string[]>;
  listEmployees(departmentIds?: string[], positionIds?: string[]): Promise<CockpitEmployee[]>;
  listCurrentStandardPositionIds(positionIds: string[]): Promise<string[]>;
  listTasks(employeeIds: string[], dateFrom: string, dateTo: string): Promise<CockpitTask[]>;
  listReviews(employeeIds: string[], dateFrom: string, dateTo: string): Promise<CockpitReview[]>;
  listBusiness(employeeIds: string[], dateFrom: string, dateTo: string): Promise<CockpitBusinessRecord[]>;
}

type MemoryInput = {
  departments?: Array<{ id: string; parentId: string | null }>;
  employees?: CockpitEmployee[];
  currentStandardPositionIds?: string[];
  tasks?: CockpitTask[];
  reviews?: CockpitReview[];
  business?: CockpitBusinessRecord[];
};

export function createMemoryEnterpriseCockpitRepository(input: MemoryInput = {}): EnterpriseCockpitRepository {
  return {
    async listDepartmentTree(rootId) {
      const ids = new Set([rootId]);
      let changed = true;
      while (changed) {
        changed = false;
        (input.departments || []).forEach((item) => { if (item.parentId && ids.has(item.parentId) && !ids.has(item.id)) { ids.add(item.id); changed = true; } });
      }
      return [...ids];
    },
    async listEmployees(departmentIds, positionIds) { return (input.employees || []).filter((item) => item.isActive && (!departmentIds || departmentIds.includes(item.departmentId || '')) && (!positionIds || positionIds.includes(item.positionId || ''))); },
    async listCurrentStandardPositionIds(positionIds) { return (input.currentStandardPositionIds || []).filter((id) => positionIds.includes(id)); },
    async listTasks(employeeIds, from, to) { return (input.tasks || []).filter((item) => employeeIds.includes(item.employeeId) && item.workDate >= from && item.workDate <= to); },
    async listReviews(employeeIds, from, to) { return (input.reviews || []).filter((item) => employeeIds.includes(item.employeeId) && item.workDate >= from && item.workDate <= to); },
    async listBusiness(employeeIds, from, to) { return (input.business || []).filter((item) => (!item.ownerId || employeeIds.includes(item.ownerId)) && item.eventDate >= from && item.eventDate <= to); },
  };
}
