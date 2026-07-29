import { randomUUID } from 'node:crypto';
import { failure, success } from '../api/response';
import { isPositionApplicableToDepartment } from '../../src/shared/utils/positionApplicability';

export type PositionMappingMatchStatus = 'UNIQUE_MATCH' | 'MULTIPLE_MATCHES' | 'DEPARTMENT_CONFLICT' | 'NO_MATCH';

type PreviewUser = {
  id: string;
  name: string;
  departmentId?: string | null;
  positionId?: string | null;
  positionName?: string | null;
  roleId?: string | null;
  role?: string | null;
  employmentStatus?: string | null;
};

type PreviewPosition = {
  id: string;
  name: string;
  departmentId?: string | null;
  departmentScope?: string | null;
  isActive: boolean;
};

type PreviewDepartment = { id: string; name: string; parentId?: string | null };
type PreviewRole = { id: string; name: string };

type ReconciliationBaselineEmployee = {
  employeeId: string;
  employmentStatus: string;
  departmentId?: string | null;
  roleId?: string | null;
  roleName?: string | null;
  rolePositionSuspected: boolean;
};

type ReconciliationBaseline = {
  capturedAt: string;
  employees: ReconciliationBaselineEmployee[];
};

export type PositionGovernanceReadinessStatus =
  | 'BOUND_VALID'
  | 'INVALID_BINDING'
  | PositionMappingMatchStatus;

export type PositionGovernanceReadinessItem = {
  employeeId: string;
  employeeName: string;
  departmentId?: string;
  departmentName?: string;
  employmentStatus: string;
  roleId?: string;
  roleName: string;
  originalPositionName: string;
  boundPositionId?: string;
  boundPositionName?: string;
  suggestedPositionId?: string;
  candidatePositionIds: string[];
  status: PositionGovernanceReadinessStatus;
  warnings: Array<'ROLE_POSITION_SUSPECTED'>;
  reason: string;
};

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

export function buildPositionGovernanceReadiness(input: {
  users: PreviewUser[];
  positions: PreviewPosition[];
  departments: PreviewDepartment[];
  roles: PreviewRole[];
}): PositionGovernanceReadinessItem[] {
  const positionsById = new Map(input.positions.map((item) => [item.id, item]));
  const departmentsById = new Map(input.departments.map((item) => [item.id, item.name]));
  const rolesById = new Map(input.roles.map((item) => [item.id, item.name]));
  const roleNames = new Set(input.roles.map((item) => normalizeName(item.name)).filter(Boolean));
  const mappingByEmployee = new Map(buildPositionMappingPreview(input).map((item) => [item.employeeId, item]));

  return input.users.map((user) => {
    const roleName = String((user.roleId && rolesById.get(user.roleId)) || user.role || '').trim();
    const originalPositionName = String(user.positionName || '').trim();
    const normalizedPositionName = normalizeName(originalPositionName);
    const warnings: Array<'ROLE_POSITION_SUSPECTED'> = [];
    if (normalizedPositionName && (
      normalizedPositionName === normalizeName(roleName)
      || roleNames.has(normalizedPositionName)
    )) warnings.push('ROLE_POSITION_SUSPECTED');

    const base = {
      employeeId: user.id,
      employeeName: user.name,
      departmentId: user.departmentId || undefined,
      departmentName: user.departmentId ? departmentsById.get(user.departmentId) : undefined,
      employmentStatus: String(user.employmentStatus || 'active'),
      roleId: user.roleId || undefined,
      roleName,
      originalPositionName,
      boundPositionId: user.positionId || undefined,
      warnings,
    };
    if (user.positionId) {
      const position = positionsById.get(user.positionId);
      const bindingValid = Boolean(position?.isActive && isPositionApplicableToDepartment(position, user.departmentId, input.departments));
      return {
        ...base,
        boundPositionName: position?.name,
        candidatePositionIds: [],
        status: bindingValid ? 'BOUND_VALID' as const : 'INVALID_BINDING' as const,
        reason: bindingValid
          ? '已绑定有效正式岗位'
          : !position
            ? '绑定的正式岗位不存在'
            : !position.isActive
              ? '绑定的正式岗位已停用'
              : '绑定岗位与员工所属部门不一致',
      };
    }

    const mapping = mappingByEmployee.get(user.id)!;
    const reasons: Record<PositionMappingMatchStatus, string> = {
      UNIQUE_MATCH: '自由文本岗位可唯一匹配正式岗位',
      MULTIPLE_MATCHES: '同部门存在多个同名正式岗位',
      DEPARTMENT_CONFLICT: '同名正式岗位存在，但与员工所属部门冲突',
      NO_MATCH: originalPositionName ? '未找到可匹配的正式岗位' : '员工没有岗位信息',
    };
    return {
      ...base,
      suggestedPositionId: mapping.suggestedPositionId,
      candidatePositionIds: mapping.candidatePositionIds,
      status: mapping.matchStatus,
      reason: reasons[mapping.matchStatus],
    };
  });
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
      isPositionApplicableToDepartment(position, user.departmentId, input.departments)
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

class GovernanceConflictError extends Error {}

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
    async getReadiness(filters: {
      departmentId?: string;
      search?: string;
      employmentStatus?: string;
      status?: PositionGovernanceReadinessStatus;
      warning?: 'ROLE_POSITION_SUSPECTED';
      page?: number;
      pageSize?: number;
    }) {
      const userWhere = {
        ...((filters.employmentStatus && filters.employmentStatus !== 'all')
          ? { employmentStatus: filters.employmentStatus }
          : filters.employmentStatus === 'all' ? {} : { employmentStatus: 'active' }),
        ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
      };
      const [allUsers, positions, departments, roles] = await Promise.all([
        prisma.user.findMany({
          where: userWhere,
          select: { id: true, name: true, departmentId: true, positionId: true, positionName: true, roleId: true, role: true, employmentStatus: true },
        }),
        prisma.position.findMany({ select: { id: true, name: true, departmentId: true, departmentScope: true, isActive: true } }),
        prisma.department.findMany({ select: { id: true, name: true, parentId: true } }),
        prisma.role.findMany({ select: { id: true, name: true } }),
      ]);
      const keyword = String(filters.search || '').trim().toLowerCase();
      const users = allUsers.filter((user: any) => (
        (filters.employmentStatus === 'all' || (user.employmentStatus || 'active') === (filters.employmentStatus || 'active'))
        && (!filters.departmentId || user.departmentId === filters.departmentId)
        && (!keyword
          || String(user.name || '').toLowerCase().includes(keyword)
          || String(user.positionName || '').toLowerCase().includes(keyword)
          || String(user.role || '').toLowerCase().includes(keyword))
      ));
      const readiness = buildPositionGovernanceReadiness({ users, positions, departments, roles });
      const filtered = readiness.filter((item) => (
        (!filters.status || item.status === filters.status)
        && (!filters.warning || item.warnings.includes(filters.warning))
      ));
      const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize) || 10));
      const page = Math.max(1, Number(filters.page) || 1);
      const summary = {
        total: filtered.length,
        boundValid: filtered.filter((item) => item.status === 'BOUND_VALID').length,
        invalidBinding: filtered.filter((item) => item.status === 'INVALID_BINDING').length,
        uniqueMatch: filtered.filter((item) => item.status === 'UNIQUE_MATCH').length,
        multipleMatches: filtered.filter((item) => item.status === 'MULTIPLE_MATCHES').length,
        departmentConflict: filtered.filter((item) => item.status === 'DEPARTMENT_CONFLICT').length,
        noMatch: filtered.filter((item) => item.status === 'NO_MATCH').length,
        rolePositionSuspected: filtered.filter((item) => item.warnings.includes('ROLE_POSITION_SUSPECTED')).length,
      };
      return success({
        items: filtered.slice((page - 1) * pageSize, page * pageSize),
        total: filtered.length,
        page,
        pageSize,
        summary,
      });
    },

    async createPreview(filters: { departmentId?: string; search?: string; employmentStatus?: string }, actor: GovernanceActor) {
      const [allUsers, positions, departments, roles] = await Promise.all([
        prisma.user.findMany(),
        prisma.position.findMany(),
        prisma.department.findMany(),
        prisma.role.findMany(),
      ]);
      const keyword = String(filters.search || '').trim().toLowerCase();
      const scopedUsers = allUsers.filter((user: any) => (
        (filters.employmentStatus === 'all' || (user.employmentStatus || 'active') === (filters.employmentStatus || 'active'))
        && (!filters.departmentId || user.departmentId === filters.departmentId)
        && (!keyword || user.name.toLowerCase().includes(keyword) || String(user.positionName || '').toLowerCase().includes(keyword))
      ));
      const users = scopedUsers.filter((user: any) => !user.positionId);
      const preview = buildPositionMappingPreview({ users, positions, departments });
      const now = new Date();
      const batchId = compactId('position-map');
      const matchedCount = preview.filter((item) => item.matchStatus === 'UNIQUE_MATCH').length;
      const conflictCount = preview.length - matchedCount;
      const usersById = new Map<string, any>(users.map((user: any) => [user.id, user]));
      const readinessByEmployee = new Map(
        buildPositionGovernanceReadiness({ users: scopedUsers, positions, departments, roles })
          .map((item) => [item.employeeId, item]),
      );
      const reconciliationBaseline: ReconciliationBaseline = {
        capturedAt: now.toISOString(),
        employees: scopedUsers.map((user: any) => ({
          employeeId: user.id,
          employmentStatus: String(user.employmentStatus || 'active'),
          departmentId: user.departmentId || null,
          roleId: user.roleId || null,
          roleName: String(user.role || '').trim() || null,
          rolePositionSuspected: Boolean(readinessByEmployee.get(user.id)?.warnings.includes('ROLE_POSITION_SUSPECTED')),
        })),
      };
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
      const batch = await prisma.$transaction(async (tx: any) => {
        const createdBatch = await tx.positionMappingBatch.create({ data: {
          id: batchId,
          status: 'PREVIEW',
          scope: { ...filters, reconciliationBaseline },
          totalCount: preview.length,
          matchedCount,
          conflictCount,
          appliedCount: 0,
          failedCount: 0,
          createdById: actor.id,
          createdByName: actor.name,
          createdAt: now,
          updatedAt: now,
        } });
        if (itemRows.length) await tx.positionMappingItem.createMany({ data: itemRows });
        return createdBatch;
      });
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
      const departments = await prisma.department.findMany({ select: { id: true, parentId: true } });
      for (const selection of selections) {
        const item: any = itemByEmployee.get(selection.employeeId);
        if (!item) return failure(`员工 ${selection.employeeId} 不属于当前预览批次`);
        if (item.applyStatus === 'APPLIED') continue;
        const [user, position] = await Promise.all([
          prisma.user.findUnique({ where: { id: selection.employeeId } }),
          prisma.position.findUnique({ where: { id: selection.positionId } }),
        ]);
        if (!user || !position || !position.isActive) return failure(`员工 ${item.employeeName} 的目标岗位不可用`);
        if (user.positionId) {
          const currentItem = await prisma.positionMappingItem.findUnique({ where: { id: item.id } });
          if (
            user.positionId === selection.positionId
            && currentItem?.applyStatus === 'APPLIED'
            && currentItem.confirmedPositionId === selection.positionId
          ) continue;
          return failure(`员工 ${item.employeeName} 已绑定岗位，请刷新预览`);
        }
        if (iso(user.updatedAt) !== iso(item.employeeUpdatedAtSnapshot)) return failure(`员工 ${item.employeeName} 的资料已变更，请重新生成预览`);
        if (!isPositionApplicableToDepartment(position, user.departmentId, departments)) return failure(`员工 ${item.employeeName} 的岗位与部门不一致`);
        const oldDepartment = user.departmentId
          ? await prisma.department.findUnique({ where: { id: user.departmentId } })
          : null;
        prepared.push({ item, user, position, oldDepartment });
      }
      if (!prepared.length) return this.getBatch(batchId);
      const now = new Date();
      try {
        await prisma.$transaction(async (tx: any) => {
          let appliedInTransaction = 0;
          for (const entry of prepared) {
            const claim = await tx.positionMappingItem.updateMany({
              where: { id: entry.item.id, applyStatus: 'PENDING' },
              data: { applyStatus: 'APPLYING', updatedAt: now },
            });
            if (claim.count !== 1) continue;
            const employeeUpdate = await tx.user.updateMany({
              where: {
                id: entry.user.id,
                positionId: null,
                updatedAt: entry.user.updatedAt,
              },
              data: {
                positionId: entry.position.id,
                positionName: entry.position.name,
                updatedAt: now,
              },
            });
            if (employeeUpdate.count !== 1) {
              throw new GovernanceConflictError(`员工 ${entry.user.name} 的资料已变更，请重新生成预览`);
            }
            await tx.employeePositionHistory.create({
              data: {
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
              },
            });
            await tx.positionMappingItem.update({
              where: { id: entry.item.id },
              data: {
                confirmedPositionId: entry.position.id,
                applyStatus: 'APPLIED',
                appliedAt: now,
                updatedAt: now,
              },
            });
            appliedInTransaction += 1;
          }
          if (appliedInTransaction > 0) {
            const updatedBatch = await tx.positionMappingBatch.update({ where: { id: batchId }, data: {
              appliedCount: { increment: appliedInTransaction },
              failedCount: 0,
              confirmedById: actor.id,
              confirmedByName: actor.name,
              confirmedAt: now,
              updatedAt: now,
            } });
            const status = updatedBatch.appliedCount >= updatedBatch.totalCount ? 'APPLIED' : 'PARTIAL';
            if (updatedBatch.status !== status) {
              await tx.positionMappingBatch.update({ where: { id: batchId }, data: { status, updatedAt: now } });
            }
          }
        });
      } catch (error) {
        if (error instanceof GovernanceConflictError) return failure(error.message);
        throw error;
      }
      return this.getBatch(batchId);
    },

    async getReconciliation(batchId: string, filters: { page?: number; pageSize?: number } = {}) {
      const batch = await prisma.positionMappingBatch.findUnique({ where: { id: batchId }, include: { items: true } });
      if (!batch) return failure('岗位映射批次不存在');
      const baseline = (batch.scope as any)?.reconciliationBaseline as ReconciliationBaseline | undefined;
      const baselineAvailable = Boolean(baseline && Array.isArray(baseline.employees));
      const baselineEmployees: ReconciliationBaselineEmployee[] = baselineAvailable
        ? baseline!.employees
        : batch.items.map((item: any) => ({
          employeeId: item.employeeId,
          employmentStatus: 'active',
          departmentId: item.originalDepartmentId || null,
          rolePositionSuspected: false,
        }));
      const employeeIds = baselineEmployees.map((item) => item.employeeId);
      const historyKeys = batch.items.map((item: any) => `position-mapping:${batchId}:${item.employeeId}`);
      const [users, positions, departments, roles, histories] = await Promise.all([
        prisma.user.findMany({
          where: { id: { in: employeeIds } },
          select: { id: true, name: true, departmentId: true, employmentStatus: true, positionId: true, positionName: true, roleId: true, role: true },
        }),
        prisma.position.findMany({ select: { id: true, name: true, departmentId: true, departmentScope: true, isActive: true } }),
        prisma.department.findMany({ select: { id: true, parentId: true } }),
        prisma.role.findMany({ select: { id: true, name: true } }),
        prisma.employeePositionHistory.findMany({
          where: { idempotencyKey: { in: historyKeys } },
          select: { employeeId: true, idempotencyKey: true },
        }),
      ]);
      const usersById = new Map<string, any>(users.map((user: any) => [user.id, user]));
      const positionsById = new Map<string, any>(positions.map((position: any) => [position.id, position]));
      const roleNamesById = new Map<string, string>(roles.map((role: any) => [role.id, role.name]));
      const normalizedRoleNames = new Set(roles.map((role: any) => normalizeName(role.name)).filter(Boolean));
      const batchItemsByEmployee = new Map<string, any>(batch.items.map((item: any) => [item.employeeId, item]));
      const historyEmployees = new Set(histories.map((history: any) => history.employeeId));
      const unresolved = baselineEmployees.flatMap((original) => {
        const item: any = batchItemsByEmployee.get(original.employeeId);
        const user: any = usersById.get(original.employeeId);
        const position: any = user?.positionId ? positionsById.get(user.positionId) : undefined;
        const currentEmploymentStatus = String(user?.employmentStatus || 'active');
        const currentRoleId = user?.roleId || null;
        const currentRoleName = String(user?.role || '').trim() || null;
        const roleChanged = Boolean(user && (currentRoleId !== (original.roleId || null) || currentRoleName !== (original.roleName || null)));
        const roleName = String((currentRoleId && roleNamesById.get(currentRoleId)) || currentRoleName || '').trim();
        const normalizedPositionName = normalizeName(position?.name);
        const rolePositionSuspected = Boolean(normalizedPositionName && (
          normalizedPositionName === normalizeName(roleName)
          || normalizedRoleNames.has(normalizedPositionName)
        ));
        const historyMissing = Boolean(item && !historyEmployees.has(original.employeeId));
        const bindingValid = Boolean(
          user
          && currentEmploymentStatus === original.employmentStatus
          && user.departmentId === (original.departmentId || null)
          && !roleChanged
          && !rolePositionSuspected
          && position?.isActive
          && isPositionApplicableToDepartment(position, user.departmentId, departments)
          && (!item || (
            item.applyStatus === 'APPLIED'
            && item.confirmedPositionId === user.positionId
            && !historyMissing
          )),
        );
        if (bindingValid) return [];
        let reason = baselineAvailable ? '映射批次尚未完成回填' : '历史批次缺少回填前基线快照';
        if (!user) reason = '员工记录不存在';
        else if (currentEmploymentStatus !== original.employmentStatus) reason = '员工在职状态与回填前不一致';
        else if (user.departmentId !== (original.departmentId || null)) reason = '员工所属部门与回填前不一致';
        else if (roleChanged) reason = '员工角色与回填前不一致';
        else if (!user.positionId) reason = '员工尚未绑定正式岗位';
        else if (!position || !position.isActive) reason = '员工绑定的正式岗位不可用';
        else if (!isPositionApplicableToDepartment(position, user.departmentId, departments)) reason = '员工岗位与所属部门不一致';
        else if (rolePositionSuspected) reason = '角色与正式岗位疑似混用';
        else if (item && item.confirmedPositionId !== user.positionId) reason = '当前岗位与本批次人工确认结果不一致';
        else if (historyMissing) reason = '岗位回填历史缺失';
        return [{
          employeeId: original.employeeId,
          employeeName: user?.name || item?.employeeName || original.employeeId,
          departmentId: user?.departmentId || item?.originalDepartmentId || undefined,
          originalPositionName: item?.originalPositionName || '',
          currentPositionId: user?.positionId || undefined,
          currentPositionName: position?.name || undefined,
          applyStatus: item?.applyStatus || 'APPLIED',
          reason,
        }];
      });
      const totalCount = baselineEmployees.length;
      const coveredCount = totalCount - unresolved.length;
      const page = Math.max(1, Number(filters.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize) || 10));
      const originalDepartments = new Set(baselineEmployees.map((item) => item.departmentId).filter(Boolean));
      const currentDepartments = new Set(users.map((user: any) => user.departmentId).filter(Boolean));
      const activeEmployeeCountBefore = baselineEmployees.filter((item) => item.employmentStatus === 'active').length;
      const activeEmployeeCount = users.filter((user: any) => (user.employmentStatus || 'active') === 'active').length;
      const employmentStatusChangedCount = baselineEmployees.filter((original) => {
        const user: any = usersById.get(original.employeeId);
        return user && String(user.employmentStatus || 'active') !== original.employmentStatus;
      }).length;
      const departmentChangedCount = baselineEmployees.filter((original) => {
        const user: any = usersById.get(original.employeeId);
        return user && user.departmentId !== (original.departmentId || null);
      }).length;
      const roleChangedCount = baselineEmployees.filter((original) => {
        const user: any = usersById.get(original.employeeId);
        return user && (
          (user.roleId || null) !== (original.roleId || null)
          || (String(user.role || '').trim() || null) !== (original.roleName || null)
        );
      }).length;
      const rolePositionSuspectedCount = users.filter((user: any) => {
        const position = user.positionId ? positionsById.get(user.positionId) : undefined;
        const roleName = String((user.roleId && roleNamesById.get(user.roleId)) || user.role || '').trim();
        const normalizedPositionName = normalizeName(position?.name);
        return normalizedPositionName && (
          normalizedPositionName === normalizeName(roleName)
          || normalizedRoleNames.has(normalizedPositionName)
        );
      }).length;
      const rolePositionSuspectedCountBefore = baselineEmployees.filter((item) => item.rolePositionSuspected).length;
      const historyCount = histories.length;
      const migrationTargetCount = batch.items.length;
      return success({
        batchId,
        batchStatus: batch.status,
        summary: {
          totalCount,
          migrationTargetCount,
          baselineAvailable,
          existingEmployeeCountBefore: totalCount,
          existingEmployeeCount: users.length,
          activeEmployeeCountBefore,
          activeEmployeeCount,
          coveredCount,
          unresolvedCount: unresolved.length,
          historyCount,
          departmentCountBefore: originalDepartments.size,
          departmentCountAfter: currentDepartments.size,
          employmentStatusChangedCount,
          departmentChangedCount,
          roleChangedCount,
          rolePositionSuspectedCountBefore,
          rolePositionSuspectedCount,
          coverageRate: totalCount ? Number(((coveredCount / totalCount) * 100).toFixed(2)) : 0,
          passed: baselineAvailable
            && totalCount > 0
            && coveredCount === totalCount
            && historyCount === migrationTargetCount
            && employmentStatusChangedCount === 0
            && departmentChangedCount === 0
            && roleChangedCount === 0
            && rolePositionSuspectedCount === 0,
        },
        items: unresolved.slice((page - 1) * pageSize, page * pageSize),
        total: unresolved.length,
        page,
        pageSize,
      });
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
        prisma.employeePositionHistory.findMany({
          where,
          orderBy: [{ changedAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
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
