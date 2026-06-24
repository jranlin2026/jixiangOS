import type { Department, DepartmentFilters } from '../types/department';
import type { ApiResponse } from './types';
import { createErrorResponse, createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { STORAGE_KEYS } from '../shared/utils/constants';
import { initializeMockData } from './mock';
import { v4 as uuidv4 } from 'uuid';
import { ensureOrganizationConfigData, getDepartmentDescendantIds, isDepartmentDescendantOf, sortDepartments } from '../shared/utils/organizationConfig';
import type { User } from '../types/settings';
import type { Role } from '../types/role';
import { backendRequest, shouldUseBackendApi } from './backendClient';

function ensureInit(): void {
  initializeMockData();
  ensureOrganizationConfigData();
}

async function getDepartments(filters?: DepartmentFilters): Promise<ApiResponse<Department[]>> {
  if (shouldUseBackendApi()) {
    const response = await backendRequest<Department[]>('/settings/departments');
    if (response.code !== 0) return response;
    let departments = response.data;

    if (filters?.search) {
      const q = filters.search.toLowerCase();
      departments = departments.filter((d) => d.name.toLowerCase().includes(q) || d.code.toLowerCase().includes(q) || d.description?.toLowerCase().includes(q));
    }
    if (filters?.isActive !== undefined) departments = departments.filter((d) => d.isActive === filters.isActive);

    return createSuccessResponse(sortDepartments(departments));
  }

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

  return createSuccessResponse(sortDepartments(departments));
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
  if (data.parentId && !departments.some((department) => department.id === data.parentId)) {
    return createErrorResponse('上级部门不存在');
  }
  const now = new Date().toISOString();
  const siblingCount = departments.filter((department) => (department.parentId || '') === (data.parentId || '')).length;
  const newDept: Department = {
    ...data,
    id: `dept-${uuidv4().slice(0, 8)}`,
    sortOrder: Number(data.sortOrder || siblingCount + 1),
    createdAt: now,
    updatedAt: now,
  };
  setStorageData(STORAGE_KEYS.DEPARTMENTS, sortDepartments([...departments, newDept]));
  return createSuccessResponse(newDept);
}

async function updateDepartment(id: string, data: Partial<Department>): Promise<ApiResponse<Department | null>> {
  ensureInit();
  await delay(200);
  const departments = ensureOrganizationConfigData().departments;
  const idx = departments.findIndex((d) => d.id === id);
  if (idx === -1) return createSuccessResponse(null);
  if (data.parentId) {
    if (data.parentId === id) return createErrorResponse('上级部门不能选择自己');
    if (isDepartmentDescendantOf(departments, data.parentId, id)) return createErrorResponse('上级部门不能选择当前部门的下级部门');
    if (!departments.some((department) => department.id === data.parentId)) return createErrorResponse('上级部门不存在');
  }
  departments[idx] = { ...departments[idx], ...data, updatedAt: new Date().toISOString() };
  setStorageData(STORAGE_KEYS.DEPARTMENTS, sortDepartments(departments));
  return createSuccessResponse(departments[idx]);
}

async function deleteDepartment(id: string): Promise<ApiResponse<boolean>> {
  ensureInit();
  await delay(150);
  const { departments, roles } = ensureOrganizationConfigData();
  const users = getStorageData<User[]>(STORAGE_KEYS.USERS) || [];
  const scopedDepartmentIds = [id, ...getDepartmentDescendantIds(departments, id)];
  const hasUsers = users.some((user) => (
    (user.employmentStatus || 'active') !== 'left'
    && user.departmentId
    && scopedDepartmentIds.includes(user.departmentId)
  ));
  const hasChildren = departments.some((department) => department.parentId === id);
  if (hasUsers || hasChildren) {
    return createErrorResponse('该部门已有员工或子部门引用，不能删除，请改为停用');
  }
  const nextRoles = roles.map((role: Role) => (
    role.departmentId === id ? { ...role, departmentId: undefined, updatedAt: new Date().toISOString() } : role
  ));
  setStorageData(STORAGE_KEYS.ROLES, nextRoles);
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
