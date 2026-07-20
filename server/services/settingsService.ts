import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { failure, success } from '../api/response';
import {
  mapPrismaDepartment,
  mapPrismaPosition,
  mapPrismaRole,
  mapPrismaUser,
} from '../db/prismaMappers';
import {
  createPasswordSalt,
  getDefaultUserPassword,
  hashPassword,
  normalizeAccount,
} from '../../src/shared/utils/auth';
import { LIFECYCLE_STATUS_CODES, STORAGE_KEYS } from '../../src/shared/utils/constants';
import { mergeRoleWithDefaultAccess, normalizeRoleDataScopes } from '../../src/shared/utils/organizationConfig';
import { normalizeRoleNameForComparison } from '../../src/shared/utils/roles';

type SettingsPrisma = Pick<PrismaClient, 'user' | 'role' | 'department' | 'position' | 'authSession' | 'businessRecord' | 'leadRecord'>;

type LeaveUserCustomerHandoff = {
  customerAction?: 'transfer' | 'public_pool';
  targetUserId?: string;
  reason?: string;
};

function isAdminAccount(account: string | null | undefined): boolean {
  return normalizeAccount(account || undefined) === 'admin';
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function compactId(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

function nullableText(value: unknown): string | null {
  const text = String(value || '').trim();
  return text || null;
}

function isNormalizedRoleNameConflict(error: unknown): boolean {
  const record = asRecord(error);
  if (record.code !== 'P2002') return false;
  const target = JSON.stringify(asRecord(record.meta).target || '');
  return target.includes('normalizedName') || target.includes('roles_normalized_name_key');
}

export function createSettingsService(prisma: SettingsPrisma) {
  const customerOwners = (row: { owner?: string | null; data: unknown }): string[] => {
    const owners = [
      nullableText(row.owner),
      nullableText(asRecord(row.data).owner),
    ].filter((owner): owner is string => Boolean(owner));
    return [...new Set(owners)];
  };

  const leadOwners = (row: { owner?: string | null; assignedTo?: string | null; data: unknown }): string[] => {
    const lead = asRecord(row.data);
    const owners = [
      nullableText(row.owner),
      nullableText(row.assignedTo),
      nullableText(lead.owner),
      nullableText(lead.assignedTo),
    ].filter((owner): owner is string => Boolean(owner));
    return [...new Set(owners)];
  };

  const leadBelongsToLeavingUser = (
    row: { owner?: string | null; assignedTo?: string | null; data: unknown },
    leavingUserName: string,
    ownedCustomerIds = new Set<string>(),
  ): boolean => (
    leadOwners(row).includes(leavingUserName)
    || Boolean(asRecord(row.data).customerId && ownedCustomerIds.has(String(asRecord(row.data).customerId)))
  );

  const findOwnedCustomerRows = async (
    owners: Array<{ id: string; name: string }>,
  ) => {
    const ownerIds = new Set(owners.map((owner) => owner.id).filter(Boolean));
    const legacyOwnerNames = new Set(owners.map((owner) => owner.name.trim()).filter(Boolean));
    if (!ownerIds.size) return [];
    const customerRows = await prisma.businessRecord.findMany({
      where: { domain: STORAGE_KEYS.CUSTOMERS },
    });
    return customerRows.filter((row) => {
      const customer = asRecord(row.data);
      const ownerId = nullableText(customer.ownerId);
      if (ownerId) return ownerIds.has(ownerId);
      // Legacy unresolved rows have no stable owner ID. Conservatively block a
      // possible match by name, but never use that name to perform a write.
      return customerOwners(row).some((owner) => legacyOwnerNames.has(owner));
    });
  };

  const applyCustomerHandoff = async (
    leavingUser: Awaited<ReturnType<typeof prisma.user.findUnique>>,
    handoff: LeaveUserCustomerHandoff = {},
  ) => {
    if (!leavingUser) return success(null);

    const ownedCustomerRows = await findOwnedCustomerRows([leavingUser]);
    const ownedCustomerIds = new Set<string>(
      ownedCustomerRows.map((row) => String(asRecord(row.data).id || row.recordId)),
    );
    const allLeadRows = await prisma.leadRecord.findMany();
    const leadRows = allLeadRows.filter((row) => leadBelongsToLeavingUser(row, leavingUser.name, ownedCustomerIds));
    if (!ownedCustomerRows.length && !leadRows.length) return success(null);

    if (ownedCustomerRows.length) {
      return failure(
        `该员工名下还有 ${ownedCustomerRows.length} 个客户，请先在客户列表完成转移或释放，再办理离职`,
      );
    }

    if (!handoff.customerAction) {
      return failure(`该员工名下还有 ${leadRows.length} 条线索，请先选择业务交接方式`);
    }

    let nextOwner = '公海';
    if (handoff.customerAction === 'transfer') {
      const targetUser = await prisma.user.findUnique({ where: { id: handoff.targetUserId || '' } });
      if (!targetUser || targetUser.id === leavingUser.id || !targetUser.isActive || (targetUser.employmentStatus || 'active') === 'left') {
        return failure('请选择一个在职员工作为客户接收人');
      }
      nextOwner = targetUser.name;
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const reason = handoff.reason?.trim()
      || (handoff.customerAction === 'public_pool'
        ? `${leavingUser.name}离职，客户释放到公海`
        : `${leavingUser.name}离职，客户交接给${nextOwner}`);

    for (const row of leadRows) {
      const lead = asRecord(row.data);
      const log = {
        id: `hist-${randomUUID().slice(0, 8)}`,
        action: 'update',
        operator: '系统',
        changedAt: nowIso,
        summary: reason,
        changes: [
          { field: 'owner', label: '负责人', oldValue: leavingUser.name, newValue: nextOwner },
          { field: 'assignedTo', label: '分配销售', oldValue: leavingUser.name, newValue: nextOwner },
        ],
      };
      const nextLead = handoff.customerAction === 'public_pool'
        ? {
          ...lead,
          owner: '公海',
          assignedTo: undefined,
          lifecycleStatusCode: LIFECYCLE_STATUS_CODES.PUBLIC_POOL,
          lifecycleStatusUpdatedAt: nowIso,
          changeHistory: [log, ...(Array.isArray(lead.changeHistory) ? lead.changeHistory : [])],
          updatedAt: nowIso,
        }
        : {
          ...lead,
          owner: nextOwner,
          assignedTo: nextOwner,
          assignedAt: nowIso,
          changeHistory: [log, ...(Array.isArray(lead.changeHistory) ? lead.changeHistory : [])],
          updatedAt: nowIso,
        };

      await prisma.leadRecord.update({
        where: { id: row.id },
        data: {
          owner: nextLead.owner || null,
          assignedTo: nextLead.assignedTo || null,
          lifecycleStatusCode: (nextLead as any).lifecycleStatusCode || null,
          data: nextLead as any,
          updatedAt: now,
        },
      });
    }

    return success(null);
  };

  return {
    async listUsers() {
      const rows = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
      return success(rows.map(mapPrismaUser));
    },

    async listAssignableUsers() {
      const rows = await prisma.user.findMany({
        where: {
          isActive: true,
          employmentStatus: 'active',
        },
        orderBy: { createdAt: 'asc' },
      });
      return success(rows.map(mapPrismaUser));
    },

    async listAssignableDirectory() {
      const [users, departments, positions] = await Promise.all([
        prisma.user.findMany({
          where: { isActive: true, employmentStatus: 'active' },
          orderBy: { createdAt: 'asc' },
        }),
        prisma.department.findMany({ where: { isActive: true }, orderBy: { createdAt: 'asc' } }),
        prisma.position.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
      ]);
      return success({
        users: users.map(mapPrismaUser),
        departments: departments.map(mapPrismaDepartment),
        positions: positions.map(mapPrismaPosition),
      });
    },

    async listRoles() {
      const rows = await prisma.role.findMany({ orderBy: { createdAt: 'asc' } });
      return success(rows.map(mapPrismaRole).map(mergeRoleWithDefaultAccess));
    },

    async listDepartments() {
      const rows = await prisma.department.findMany({ orderBy: { createdAt: 'asc' } });
      return success(rows.map(mapPrismaDepartment));
    },

    async listPositions() {
      const rows = await prisma.position.findMany({ orderBy: { sortOrder: 'asc' } });
      return success(rows.map(mapPrismaPosition));
    },

    async countLeaveOwnedCustomers(userIds: string[]) {
      const targetIds = new Set((Array.isArray(userIds) ? userIds : []).map((id) => String(id || '').trim()).filter(Boolean));
      if (!targetIds.size) return success(0);
      const users = await prisma.user.findMany();
      const targetUsers = users.filter((user) => targetIds.has(user.id));
      const targetNames = targetUsers.map((user) => user.name);
      const rows = await findOwnedCustomerRows(targetUsers);
      const ownedCustomerIds = new Set(rows.map((row) => String(asRecord(row.data).id || row.recordId)));
      const ownerNames = new Set(targetNames.map((name) => name.trim()).filter(Boolean));
      const leadRows = await prisma.leadRecord.findMany();
      const ownedLeadRows = leadRows.filter((row) => (
        leadOwners(row).some((owner) => ownerNames.has(owner))
        || Boolean(asRecord(row.data).customerId && ownedCustomerIds.has(String(asRecord(row.data).customerId)))
      ));
      return success(rows.length + ownedLeadRows.length);
    },

    async createUser(data: Record<string, any>) {
      const account = normalizeAccount(data.account || data.email || data.phone);
      if (!account) return failure('账号不能为空');
      const existing = await prisma.user.findMany();
      if (existing.some((user) => normalizeAccount(user.account || undefined) === account)) return failure('账号已存在');
      const now = new Date();
      const id = compactId('user');
      const password = String(data.password || getDefaultUserPassword());
      const passwordSalt = createPasswordSalt(`${id}-${account}`);
      const row = await prisma.user.create({
        data: {
          id,
          name: String(data.name || '').trim(),
          account,
          email: String(data.email || `${account}@company.com`).trim(),
          phone: String(data.phone || '').trim(),
          role: String(data.role || ''),
          avatar: data.avatar || null,
          departmentId: data.departmentId || null,
          positionId: data.positionId || null,
          positionName: data.positionName || null,
          roleId: data.roleId || null,
          passwordHash: hashPassword(password, passwordSalt),
          passwordSalt,
          passwordUpdatedAt: now,
          mustChangePassword: true,
          isActive: data.isActive ?? true,
          employmentStatus: data.employmentStatus || 'active',
          leftAt: data.employmentStatus === 'left' ? now : null,
          leftBy: data.employmentStatus === 'left' ? '系统' : null,
          createdAt: now,
          updatedAt: now,
        },
      });
      return success(mapPrismaUser(row));
    },

    async updateUser(id: string, data: Record<string, any>) {
      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) return success(null);
      const nextAccount = data.account !== undefined ? normalizeAccount(data.account) : user.account;
      if (!nextAccount) return failure('账号不能为空');
      const existing = await prisma.user.findMany();
      if (existing.some((item) => item.id !== id && normalizeAccount(item.account || undefined) === nextAccount)) return failure('账号已存在');
      const row = await prisma.user.update({
        where: { id },
        data: {
          name: data.name !== undefined ? String(data.name).trim() : undefined,
          account: nextAccount,
          email: data.email !== undefined ? String(data.email).trim() : undefined,
          phone: data.phone !== undefined ? String(data.phone).trim() : undefined,
          role: data.role !== undefined ? String(data.role) : undefined,
          avatar: data.avatar !== undefined ? data.avatar || null : undefined,
          departmentId: data.departmentId !== undefined ? data.departmentId || null : undefined,
          positionId: data.positionId !== undefined ? data.positionId || null : undefined,
          positionName: data.positionName !== undefined ? data.positionName || null : undefined,
          roleId: data.roleId !== undefined ? data.roleId || null : undefined,
          isActive: data.isActive,
          employmentStatus: data.employmentStatus,
          leftAt: data.leftAt ? new Date(data.leftAt) : undefined,
          leftBy: data.leftBy,
          updatedAt: new Date(),
        },
      });
      return success(mapPrismaUser(row));
    },

    async resetUserPassword(id: string, password: string) {
      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) return success(null);
      if (!password || password.length < 6) return failure('密码至少 6 位');
      const account = normalizeAccount(user.account || user.email || user.phone);
      const passwordSalt = createPasswordSalt(`${id}-${account}`);
      const row = await prisma.user.update({
        where: { id },
        data: {
          passwordHash: hashPassword(password, passwordSalt),
          passwordSalt,
          passwordUpdatedAt: new Date(),
          mustChangePassword: true,
          updatedAt: new Date(),
        },
      });
      await prisma.authSession.deleteMany({ where: { userId: id } });
      return success(mapPrismaUser(row));
    },

    async restoreUser(id: string) {
      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) return success(null);
      const row = await prisma.user.update({
        where: { id },
        data: {
          isActive: true,
          employmentStatus: 'active',
          leftAt: null,
          leftBy: null,
          updatedAt: new Date(),
        },
      });
      return success(mapPrismaUser(row));
    },

    async deleteUser(id: string) {
      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) return success(false);
      if (isAdminAccount(user.account)) return failure('内置管理员账号不能删除');
      if ((user.employmentStatus || 'active') !== 'left') return failure('请先办理离职，再到账号回收站永久删除');
      await prisma.authSession.deleteMany({ where: { userId: id } });
      await prisma.user.deleteMany({ where: { id } });
      return success(true);
    },

    async createDepartment(data: Record<string, any>) {
      const name = String(data.name || '').trim();
      const code = String(data.code || name || compactId('department')).trim();
      if (!name) return failure('部门名称不能为空');
      const row = await prisma.department.create({
        data: {
          id: compactId('dept'),
          name,
          code,
          description: data.description || null,
          parentId: data.parentId || null,
          managerId: data.managerId || null,
          memberCount: Number(data.memberCount || 0),
          sortOrder: Number(data.sortOrder || 0),
          isActive: data.isActive ?? true,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any,
      });
      return success(mapPrismaDepartment(row as any));
    },

    async updateDepartment(id: string, data: Record<string, any>) {
      const row = await prisma.department.update({
        where: { id },
        data: {
          name: data.name !== undefined ? String(data.name).trim() : undefined,
          code: data.code !== undefined ? String(data.code).trim() : undefined,
          description: data.description !== undefined ? data.description || null : undefined,
          parentId: data.parentId !== undefined ? data.parentId || null : undefined,
          managerId: data.managerId !== undefined ? data.managerId || null : undefined,
          memberCount: data.memberCount !== undefined ? Number(data.memberCount) : undefined,
          sortOrder: data.sortOrder !== undefined ? Number(data.sortOrder) : undefined,
          isActive: data.isActive,
          updatedAt: new Date(),
        } as any,
      });
      return success(mapPrismaDepartment(row as any));
    },

    async deleteDepartment(id: string) {
      const departments = await prisma.department.findMany();
      const users = await prisma.user.findMany();
      const roles = await prisma.role.findMany();
      const hasChildren = departments.some((department: any) => department.parentId === id);
      const hasUsers = users.some((user) => user.departmentId === id && (user.employmentStatus || 'active') !== 'left');
      if (hasChildren || hasUsers) return failure('该部门已有员工或子部门引用，不能删除，请改为停用');
      await Promise.all(roles.filter((role) => role.departmentId === id).map((role) => (
        prisma.role.update({ where: { id: role.id }, data: { departmentId: null, updatedAt: new Date() } })
      )));
      await prisma.department.deleteMany({ where: { id } });
      return success(true);
    },

    async createRole(data: Record<string, any>) {
      const name = String(data.name || '').trim();
      const code = String(data.code || name || compactId('role')).trim();
      if (!name) return failure('角色名称不能为空');
      const roles = await prisma.role.findMany();
      if (roles.some((role) => normalizeRoleNameForComparison(role.name) === normalizeRoleNameForComparison(name))) {
        return failure('角色名称已存在');
      }
      try {
        const row = await prisma.role.create({
          data: {
            id: compactId('role'),
            name,
            normalizedName: normalizeRoleNameForComparison(name),
            code,
            description: data.description || null,
            departmentId: data.departmentId || null,
            permissions: (Array.isArray(data.permissions) ? data.permissions : []) as any,
            dataScopes: normalizeRoleDataScopes({ code, dataScopes: data.dataScopes }) as any,
            memberCount: Number(data.memberCount || 0),
            isActive: data.isActive ?? true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
        return success(mapPrismaRole(row));
      } catch (error) {
        if (isNormalizedRoleNameConflict(error)) return failure('角色名称已存在');
        throw error;
      }
    },

    async updateRole(id: string, data: Record<string, any>) {
      const role = await prisma.role.findUnique({ where: { id } });
      if (!role) return success(null);
      if (role.code === 'super_admin' && data.isActive === false) return failure('超级管理员角色不能停用');
      const nextName = data.name !== undefined ? String(data.name).trim() : role.name;
      if (!nextName) return failure('角色名称不能为空');
      if (data.name !== undefined) {
        const roles = await prisma.role.findMany();
        if (roles.some((item) => item.id !== id && normalizeRoleNameForComparison(item.name) === normalizeRoleNameForComparison(nextName))) {
          return failure('角色名称已存在');
        }
      }
      const nextCode = data.code !== undefined ? String(data.code).trim() : role.code;
      const nextRole = {
        code: nextCode,
        dataScopes: data.dataScopes !== undefined ? data.dataScopes : asRecord(role.dataScopes),
      };
      try {
        const row = await prisma.role.update({
          where: { id },
          data: {
            name: data.name !== undefined ? nextName : undefined,
            normalizedName: data.name !== undefined ? normalizeRoleNameForComparison(nextName) : undefined,
            code: nextCode,
            description: data.description !== undefined ? data.description || null : undefined,
            departmentId: data.departmentId !== undefined ? data.departmentId || null : undefined,
            permissions: data.permissions !== undefined ? (Array.isArray(data.permissions) ? data.permissions : []) as any : undefined,
            dataScopes: data.dataScopes !== undefined || data.code !== undefined ? normalizeRoleDataScopes(nextRole) as any : undefined,
            memberCount: data.memberCount !== undefined ? Number(data.memberCount) : undefined,
            isActive: data.isActive,
            updatedAt: new Date(),
          },
        });
        return success(mapPrismaRole(row));
      } catch (error) {
        if (isNormalizedRoleNameConflict(error)) return failure('角色名称已存在');
        throw error;
      }
    },

    async deleteRole(id: string) {
      const role = await prisma.role.findUnique({ where: { id } });
      if (!role) return success(false);
      if (role.code === 'super_admin') return failure('超级管理员角色不能删除');
      const users = await prisma.user.findMany();
      if (users.some((user) => user.roleId === id || user.role === role.name)) return failure('已有员工使用该角色，不能删除，请改为停用');
      await prisma.role.deleteMany({ where: { id } });
      return success(true);
    },

    async leaveUser(id: string, handoff?: LeaveUserCustomerHandoff) {
      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) return success(null);
      if (isAdminAccount(user.account)) return failure('内置管理员账号不能办理离职');

      const handoffResult = await applyCustomerHandoff(user, handoff);
      if (handoffResult.code !== 0) return failure(handoffResult.message || '请先完成客户交接');

      const now = new Date();
      const updated = await prisma.user.update({
        where: { id },
        data: {
          isActive: false,
          employmentStatus: 'left',
          leftAt: now,
          leftBy: '系统',
          updatedAt: now,
        },
      });

      return success(mapPrismaUser(updated));
    },
  };
}
