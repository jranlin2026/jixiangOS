import type { Role, RoleFilters } from '../types/role';
import type { ApiResponse } from './types';
import { createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { STORAGE_KEYS } from '../shared/utils/constants';
import { initializeMockData } from './mock';
import { v4 as uuidv4 } from 'uuid';

function ensureInit(): void {
  initializeMockData();
}

async function getRoles(filters?: RoleFilters): Promise<ApiResponse<Role[]>> {
  ensureInit();
  await delay(200);
  let roles = getStorageData<Role[]>(STORAGE_KEYS.ROLES) || [];

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
  const roles = getStorageData<Role[]>(STORAGE_KEYS.ROLES) || [];
  return createSuccessResponse(roles.find((r) => r.id === id) || null);
}

async function createRole(data: Omit<Role, 'id' | 'createdAt' | 'updatedAt'>): Promise<ApiResponse<Role>> {
  ensureInit();
  await delay(200);
  const roles = getStorageData<Role[]>(STORAGE_KEYS.ROLES) || [];
  const now = new Date().toISOString();
  const newRole: Role = {
    ...data,
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
  const roles = getStorageData<Role[]>(STORAGE_KEYS.ROLES) || [];
  const idx = roles.findIndex((r) => r.id === id);
  if (idx === -1) return createSuccessResponse(null);
  roles[idx] = { ...roles[idx], ...data, updatedAt: new Date().toISOString() };
  setStorageData(STORAGE_KEYS.ROLES, roles);
  return createSuccessResponse(roles[idx]);
}

async function deleteRole(id: string): Promise<ApiResponse<boolean>> {
  ensureInit();
  await delay(150);
  const roles = getStorageData<Role[]>(STORAGE_KEYS.ROLES) || [];
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
