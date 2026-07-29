import { randomUUID } from 'node:crypto';
import { failure, success } from '../api/response';

export type PositionMappingMatchStatus = 'UNIQUE_MATCH' | 'MULTIPLE_MATCHES' | 'DEPARTMENT_CONFLICT' | 'NO_MATCH';

type PreviewUser = {
  id: string;
  name: string;
  departmentId?: string | null;
  positionId?: string | null;
  positionName?: string | null;
};

type PreviewPosition = {
  id: string;
  name: string;
  departmentId?: string | null;
  isActive: boolean;
};

type PreviewDepartment = { id: string; name: string };

export type PositionMappingPreviewItem = {
  employeeId: string;
  employeeName: string;
  departmentId?: string;
  departmentName?: string;
  originalPositionName: string;
  matchStatus: PositionMappingMatchStatus;
  suggestedPositionId?: string;
  candidatePositionIds: string[];
};

function normalizeName(value: unknown): string {
  return String(value || '').trim().replace(/\s+/g, '').toLocaleLowerCase('zh-CN');
}

export function buildPositionMappingPreview(input: {
  users: PreviewUser[];
  positions: PreviewPosition[];
  departments: PreviewDepartment[];
}): PositionMappingPreviewItem[] {
  const departmentNames = new Map(input.departments.map((item) => [item.id, item.name]));
  return input.users.filter((user) => !user.positionId).map((user) => {
    const originalPositionName = String(user.positionName || '').trim();
    const nameMatches = originalPositionName
      ? input.positions.filter((position) => position.isActive && normalizeName(position.name) === normalizeName(originalPositionName))
      : [];
    const compatibleMatches = nameMatches.filter((position) => (
      !position.departmentId || position.departmentId === user.departmentId
    ));
    const candidatePositionIds = (compatibleMatches.length ? compatibleMatches : nameMatches).map((position) => position.id);
    let matchStatus: PositionMappingMatchStatus = 'NO_MATCH';
    let suggestedPositionId: string | undefined;
    if (compatibleMatches.length === 1) {
      matchStatus = 'UNIQUE_MATCH';
      suggestedPositionId = compatibleMatches[0].id;
    } else if (compatibleMatches.length > 1) {
      matchStatus = 'MULTIPLE_MATCHES';
    } else if (nameMatches.length > 0) {
      matchStatus = 'DEPARTMENT_CONFLICT';
    }
    return {
      employeeId: user.id,
      employeeName: user.name,
      departmentId: user.departmentId || undefined,
      departmentName: user.departmentId ? departmentNames.get(user.departmentId) : undefined,
      originalPositionName,
      matchStatus,
      suggestedPositionId,
      candidatePositionIds,
    };
  });
}

type GovernanceActor = { id: string; name: string };

function compactId(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

function mappingItemView(item: any) {
  return {
    id: item.id,
    employeeId: item.employeeId,
    employeeName: item.employeeName,
    departmentId: item.originalDepartmentId || undefined,
    departmentName: item.originalDepartmentName || undefined,
    originalPositionName: item.originalPositionName || '',
    suggestedPositionId: item.suggestedPositionId || undefined,
    candidatePositionIds: Array.isArray(item.candidatePositionIds) ? item.candidatePositionIds : [],
    confirmedPositionId: item.confirmedPositionId || undefined,
    matchStatus: item.matchStatus,
    applyStatus: item.applyStatus,
    failureReason: item.failureReason || undefined,
  };
}

export function createPositionGovernanceService(prisma: any) {
  return {
    async createPreview(filters: { departmentId?: string; search?: string; employmentStatus?: string }, actor: GovernanceActor) {
      const [allUsers, positions, departments] = await Promise.all([
        prisma.user.findMany(),
        prisma.position.findMany(),
        prisma.department.findMany(),
      ]);
      const keyword = String(filters.search || '').trim().toLowerCase();
      const users = allUsers.filter((user: any) => (
        !user.positionId
        && (filters.employmentStatus === 'all' || (user.employmentStatus || 'active') === (filters.employmentStatus || 'active'))
        && (!filters.departmentId || user.departmentId === filters.departmentId)
        && (!keyword || user.name.toLowerCase().includes(keyword) || String(user.positionName || '').toLowerCase().includes(keyword))
      ));
      const preview = buildPositionMappingPreview({ users, positions, departments });
      const now = new Date();
      const batchId = compactId('position-map');
      const matchedCount = preview.filter((item) => item.matchStatus === 'UNIQUE_MATCH').length;
      const conflictCount = preview.length - matchedCount;
      const batch = await prisma.positionMappingBatch.create({
        data: {
          id: batchId,
          status: 'PREVIEW',
          scope: filters,
          totalCount: preview.length,
          matchedCount,
          conflictCount,
          appliedCount: 0,
          failedCount: 0,
          createdById: actor.id,
          createdByName: actor.name,
          createdAt: now,
          updatedAt: now,
        },
      });
      const usersById = new Map<string, any>(users.map((user: any) => [user.id, user]));
      const itemRows = preview.map((item) => ({
        id: compactId('position-map-item'),
        batchId,
        employeeId: item.employeeId,
        employeeName: item.employeeName,
        originalDepartmentId: item.departmentId || null,
        originalDepartmentName: item.departmentName || null,
        originalPositionName: item.originalPositionName || null,
        employeeUpdatedAtSnapshot: usersById.get(item.employeeId).updatedAt,
        suggestedPositionId: item.suggestedPositionId || null,
        candidatePositionIds: item.candidatePositionIds,
        confirmedPositionId: null,
        matchStatus: item.matchStatus,
        applyStatus: 'PENDING',
        failureReason: null,
        createdAt: now,
        updatedAt: now,
      }));
      if (itemRows.length) await prisma.positionMappingItem.createMany({ data: itemRows });
      return success({
        id: batch.id,
        status: batch.status,
        totalCount: preview.length,
        matchedCount,
        conflictCount,
        appliedCount: 0,
        failedCount: 0,
        createdAt: iso(batch.createdAt),
        items: itemRows.map(mappingItemView),
      });
    },

    async getBatch(batchId: string) {
      const batch = await prisma.positionMappingBatch.findUnique({ where: { id: batchId }, include: { items: true } });
      if (!batch) return success(null);
      return success({
        id: batch.id,
        status: batch.status,
        totalCount: batch.totalCount,
        matchedCount: batch.matchedCount,
        conflictCount: batch.conflictCount,
        appliedCount: batch.appliedCount,
        failedCount: batch.failedCount,
        createdAt: iso(batch.createdAt),
        confirmedAt: batch.confirmedAt ? iso(batch.confirmedAt) : undefined,
        items: batch.items.map(mappingItemView),
      });
    },

    async applyBatch(batchId: string, selections: Array<{ employeeId: string; positionId: string }>, actor: GovernanceActor) {
      if (!Array.isArray(selections) || !selections.length) return failure('请至少选择一名员工并确认岗位');
      if (new Set(selections.map((item) => item.employeeId)).size !== selections.length) {
        return failure('同一员工不能重复提交岗位确认');
      }
      const batch = await prisma.positionMappingBatch.findUnique({ where: { id: batchId }, include: { items: true } });
      if (!batch) return failure('岗位映射批次不存在');
      if (batch.status === 'APPLIED') return this.getBatch(batchId);
      if (!['PREVIEW', 'PARTIAL'].includes(batch.status)) return failure('当前批次状态不允许执行');
      const itemByEmployee = new Map(batch.items.map((item: any) => [item.employeeId, item]));
      const prepared: Array<{ item: any; user: any; position: any; oldDepartment: any }> = [];
      for (const selection of selections) {
        const item: any = itemByEmployee.get(selection.employeeId);
        if (!item) return failure(`员工 ${selection.employeeId} 不属于当前预览批次`);
        if (item.applyStatus === 'APPLIED') continue;
        const [user, position] = await Promise.all([
          prisma.user.findUnique({ where: { id: selection.employeeId } }),
          prisma.position.findUnique({ where: { id: selection.positionId } }),
        ]);
        if (!user || !position || !position.isActive) return failure(`员工 ${item.employeeName} 的目标岗位不可用`);
        if (user.positionId) return failure(`员工 ${item.employeeName} 已绑定岗位，请刷新预览`);
        if (iso(user.updatedAt) !== iso(item.employeeUpdatedAtSnapshot)) return failure(`员工 ${item.employeeName} 的资料已变更，请重新生成预览`);
        if (position.departmentId && position.departmentId !== user.departmentId) return failure(`员工 ${item.employeeName} 的岗位与部门不一致`);
        const oldDepartment = user.departmentId
          ? await prisma.department.findUnique({ where: { id: user.departmentId } })
          : null;
        prepared.push({ item, user, position, oldDepartment });
      }
      if (!prepared.length) return this.getBatch(batchId);
      const now = new Date();
      const appliedCount = Number(batch.appliedCount || 0) + prepared.length;
      const status = appliedCount >= batch.totalCount ? 'APPLIED' : 'PARTIAL';
      await prisma.$transaction(async (tx: any) => {
        for (const entry of prepared) {
          await tx.user.update({ where: { id: entry.user.id }, data: {
            positionId: entry.position.id,
            positionName: entry.position.name,
            updatedAt: now,
          } });
          await tx.employeePositionHistory.create({ data: {
            id: compactId('position-history'),
            employeeId: entry.user.id,
            employeeName: entry.user.name,
            changeType: 'MIGRATION_BIND',
            oldDepartmentId: entry.user.departmentId || null,
            oldDepartmentName: entry.oldDepartment?.name || null,
            newDepartmentId: entry.user.departmentId || null,
            newDepartmentName: entry.oldDepartment?.name || null,
            oldPositionId: null,
            oldPositionName: entry.user.positionName || null,
            newPositionId: entry.position.id,
            newPositionName: entry.position.name,
            reason: '历史自由文本岗位人工确认回填',
            source: 'MIGRATION',
            changedById: actor.id,
            changedByName: actor.name,
            changedAt: now,
            idempotencyKey: `position-mapping:${batchId}:${entry.user.id}`,
          } });
          await tx.positionMappingItem.update({ where: { id: entry.item.id }, data: {
            confirmedPositionId: entry.position.id,
            applyStatus: 'APPLIED',
            appliedAt: now,
            updatedAt: now,
          } });
        }
        await tx.positionMappingBatch.update({ where: { id: batchId }, data: {
          status,
          appliedCount,
          failedCount: 0,
          confirmedById: actor.id,
          confirmedByName: actor.name,
          confirmedAt: now,
          updatedAt: now,
        } });
      });
      return this.getBatch(batchId);
    },

    async listHistory(filters: { employeeId?: string; changeType?: string; page?: number; pageSize?: number }) {
      const page = Math.max(Number(filters.page || 1), 1);
      const pageSize = Math.min(Math.max(Number(filters.pageSize || 10), 1), 100);
      const where = {
        employeeId: filters.employeeId || undefined,
        changeType: filters.changeType || undefined,
      };
      const [total, rows] = await Promise.all([
        prisma.employeePositionHistory.count({ where }),
        prisma.employeePositionHistory.findMany({ where, orderBy: { changedAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      ]);
      return success({
        items: rows.map((row: any) => ({ ...row, changedAt: iso(row.changedAt) })),
        total,
        page,
        pageSize,
      });
    },
  };
}
