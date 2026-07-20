import type { Role, RoleFilters } from '../types/role';
import type { ApiResponse } from './types';
import { createErrorResponse, createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { STORAGE_KEYS } from '../shared/utils/constants';
import { initializeMockData } from './mock';
import { v4 as uuidv4 } from 'uuid';
import { ensureOrganizationConfigData, normalizeRoleDataScopes } from '../shared/utils/organizationConfig';
import type { User } from '../types/settings';
import { backendRequest, shouldUseBackendApi } from './backendClient';
import { normalizeRoleNameForComparison } from '../shared/utils/roles';

function ensureInit(): void {
  initializeMockData();
  ensureOrganizationConfigData();
}

function cacheRoles(roles: Role[]): void {
  setStorageData(STORAGE_KEYS.ROLES, roles, { persist: false });
}

function mergeCachedRole(role: Role): void {
  const roles = getStorageData<Role[]>(STORAGE_KEYS.ROLES) || [];
  cacheRoles([role, ...roles.filter((item) => item.id !== role.id)]);
}

async function getRoles(filters?: RoleFilters): Promise<ApiResponse<Role[]>> {
  if (shouldUseBackendApi()) {
    const response = await backendRequest<Role[]>('/settings/roles');
    if (response.code !== 0) return response;
    cacheRoles(response.data);
    let roles = response.data;

    if (filters?.search) {
      const q = filters.search.toLowerCase();
      roles = roles.filter((r) => r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q));
    }
    if (filters?.departmentId) roles = roles.filter((r) => r.departmentId === filters.departmentId);
    if (filters?.isActive !== undefined) roles = roles.filter((r) => r.isActive === filters.isActive);

    return createSuccessResponse(roles);
  }

  ensureInit();
  await delay(200);
  let roles = ensureOrganizationConfigData().roles;

  if (filters?.search) {
    const q = filters.search.toLowerCase();
    roles = roles.filter((r) => r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q));
  }
  if (filters?.departmentId) {
    roles = roles.filter((r) => r.departmentId === filters.departmentId);
  }
  if (filters?.isActive !== undefined) {
    roles = roles.filter((r) => r.isActive === filters.isActive);
  }

  return createSuccessResponse(roles);
}

async function getRoleById(id: string): Promise<ApiResponse<Role | null>> {
  ensureInit();
  await delay(150);
  const roles: Role[] = [...ensureOrganizationConfigData().roles];
  return createSuccessResponse(roles.find((r) => r.id === id) || null);
}

async function createRole(data: Omit<Role, 'id' | 'createdAt' | 'updatedAt'>): Promise<ApiResponse<Role>> {
  if (shouldUseBackendApi()) {
    const response = await backendRequest<Role>('/settings/roles', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (response.code === 0 && response.data) mergeCachedRole(response.data);
    return response;
  }

  ensureInit();
  await delay(200);
  const roles: Role[] = [...ensureOrganizationConfigData().roles];
  const name = data.name.trim();
  if (!name) return createErrorResponse('角色名称不能为空');
  if (roles.some((role) => normalizeRoleNameForComparison(role.name) === normalizeRoleNameForComparison(name))) {
    return createErrorResponse('角色名称已存在');
  }
  const now = new Date().toISOString();
  const newRole: Role = {
    ...data,
    name,
    dataScopes: normalizeRoleDataScopes(data),
    id: `role-${uuidv4().slice(0, 8)}`,
    createdAt: now,
    updatedAt: now,
  };
  roles.push(newRole);
  setStorageData(STORAGE_KEYS.ROLES, roles);
  return createSuccessResponse(newRole);
}

async function updateRole(id: string, data: Partial<Role>): Promise<ApiResponse<Role | null>> {
  if (shouldUseBackendApi()) {
    const response = await backendRequest<Role | null>(`/settings/roles/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    if (response.code === 0 && response.data) mergeCachedRole(response.data);
    return response;
  }

  ensureInit();
  await delay(200);
  const roles = ensureOrganizationConfigData().roles;
  const idx = roles.findIndex((r) => r.id === id);
  if (idx === -1) return createSuccessResponse(null);
  if (roles[idx].code === 'super_admin' && data.isActive === false) {
    return createErrorResponse('超级管理员角色不能停用');
  }
  if (data.name !== undefined) {
    const name = data.name.trim();
    if (!name) return createErrorResponse('角色名称不能为空');
    if (roles.some((role) => role.id !== id && normalizeRoleNameForComparison(role.name) === normalizeRoleNameForComparison(name))) {
      return createErrorResponse('角色名称已存在');
    }
    data = { ...data, name };
  }
  const nextRole = { ...roles[idx], ...data };
  roles[idx] = {
    ...nextRole,
    dataScopes: normalizeRoleDataScopes(nextRole),
    updatedAt: new Date().toISOString(),
  };
  setStorageData(STORAGE_KEYS.ROLES, roles);
  return createSuccessResponse(roles[idx]);
}

async function deleteRole(id: string): Promise<ApiResponse<boolean>> {
  if (shouldUseBackendApi()) {
    return backendRequest<boolean>(`/settings/roles/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  ensureInit();
  await delay(150);
  const roles = ensureOrganizationConfigData().roles;
  const role = roles.find((r) => r.id === id);
  if (role?.code === 'super_admin') return createErrorResponse('超级管理员角色不能删除');
  const users = getStorageData<User[]>(STORAGE_KEYS.USERS) || [];
  if (users.some((user) => user.roleId === id || user.role === role?.name)) {
    return createErrorResponse('已有员工使用该角色，不能删除，请改为停用');
  }
  setStorageData(STORAGE_KEYS.ROLES, roles.filter((r) => r.id !== id));
  return createSuccessResponse(true);
}

export const roleApi = {
  getRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
};
