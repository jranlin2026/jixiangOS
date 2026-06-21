import type { Department, DepartmentFilters } from '../types/department';
import type { ApiResponse } from './types';
import { createErrorResponse, createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { STORAGE_KEYS } from '../shared/utils/constants';
import { initializeMockData } from './mock';
import { v4 as uuidv4 } from 'uuid';
import { ensureOrganizationConfigData } from '../shared/utils/organizationConfig';
import type { User } from '../types/settings';
import type { Position } from '../types/position';
import type { Role } from '../types/role';

function ensureInit(): void {
  initializeMockData();
  ensureOrganizationConfigData();
}

async function getDepartments(filters?: DepartmentFilters): Promise<ApiResponse<Department[]>> {
  ensureInit();
  await delay(200);
  let departments = ensureOrganizationConfigData().departments;

  if (filters?.search) {
    const q = filters.search.toLowerCase();
    departments = departments.filter((d) => d.name.toLowerCase().includes(q) || d.code.toLowerCase().includes(q) || d.description?.toLowerCase().includes(q));
  }
  if (filters?.isActive !== undefined) {
    departments = departments.filter((d) => d.isActive === filters.isActive);
  }

  return createSuccessResponse(departments);
}

async function getDepartmentById(id: string): Promise<ApiResponse<Department | null>> {
  ensureInit();
  await delay(150);
  const departments = ensureOrganizationConfigData().departments;
  return createSuccessResponse(departments.find((d) => d.id === id) || null);
}

async function createDepartment(data: Omit<Department, 'id' | 'createdAt' | 'updatedAt'>): Promise<ApiResponse<Department>> {
  ensureInit();
  await delay(200);
  const departments = ensureOrganizationConfigData().departments;
  const now = new Date().toISOString();
  const newDept: Department = {
    ...data,
    id: `dept-${uuidv4().slice(0, 8)}`,
    createdAt: now,
    updatedAt: now,
  };
  departments.push(newDept);
  setStorageData(STORAGE_KEYS.DEPARTMENTS, departments);
  return createSuccessResponse(newDept);
}

async function updateDepartment(id: string, data: Partial<Department>): Promise<ApiResponse<Department | null>> {
  ensureInit();
  await delay(200);
  const departments = ensureOrganizationConfigData().departments;
  const idx = departments.findIndex((d) => d.id === id);
  if (idx === -1) return createSuccessResponse(null);
  departments[idx] = { ...departments[idx], ...data, updatedAt: new Date().toISOString() };
  setStorageData(STORAGE_KEYS.DEPARTMENTS, departments);
  return createSuccessResponse(departments[idx]);
}

async function deleteDepartment(id: string): Promise<ApiResponse<boolean>> {
  ensureInit();
  await delay(150);
  const { departments, positions, roles } = ensureOrganizationConfigData();
  const users = getStorageData<User[]>(STORAGE_KEYS.USERS) || [];
  const hasUsers = users.some((user) => user.departmentId === id);
  const hasPositions = positions.some((position: Position) => position.departmentId === id);
  const hasRoles = roles.some((role: Role) => role.departmentId === id);
  const hasChildren = departments.some((department) => department.parentId === id);
  if (hasUsers || hasPositions || hasRoles || hasChildren) {
    return createErrorResponse('该部门已有员工、职位、角色或子部门引用，不能删除，请改为停用');
  }
  setStorageData(STORAGE_KEYS.DEPARTMENTS, departments.filter((d) => d.id !== id));
  return createSuccessResponse(true);
}

export const departmentApi = {
  getDepartments,
  getDepartmentById,
  createDepartment,
  updateDepartment,
  deleteDepartment,
};
