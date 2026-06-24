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

function ensureInit(): void {
  initializeMockData();
  ensureOrganizationConfigData();
}

async function getRoles(filters?: RoleFilters): Promise<ApiResponse<Role[]>> {
  if (shouldUseBackendApi()) {
    const response = await backendRequest<Role[]>('/settings/roles');
    if (response.code !== 0) return response;
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
  ensureInit();
  await delay(200);
  const roles: Role[] = [...ensureOrganizationConfigData().roles];
  const now = new Date().toISOString();
  const newRole: Role = {
    ...data,
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
  ensureInit();
  await delay(200);
  const roles = ensureOrganizationConfigData().roles;
  const idx = roles.findIndex((r) => r.id === id);
  if (idx === -1) return createSuccessResponse(null);
  if (roles[idx].code === 'super_admin' && data.isActive === false) {
    return createErrorResponse('超级管理员角色不能停用');
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
