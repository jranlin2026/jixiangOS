import type { Department, DepartmentFilters } from '../types/department';
import type { ApiResponse } from './types';
import { createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { STORAGE_KEYS } from '../shared/utils/constants';
import { initializeMockData } from './mock';
import { v4 as uuidv4 } from 'uuid';

function ensureInit(): void {
  initializeMockData();
}

async function getDepartments(filters?: DepartmentFilters): Promise<ApiResponse<Department[]>> {
  ensureInit();
  await delay(200);
  let departments = getStorageData<Department[]>(STORAGE_KEYS.DEPARTMENTS) || [];

  if (filters?.search) {
    const q = filters.search.toLowerCase();
    departments = departments.filter((d) => d.name.toLowerCase().includes(q) || d.code.toLowerCase().includes(q));
  }
  if (filters?.isActive !== undefined) {
    departments = departments.filter((d) => d.isActive === filters.isActive);
  }

  return createSuccessResponse(departments);
}

async function getDepartmentById(id: string): Promise<ApiResponse<Department | null>> {
  ensureInit();
  await delay(150);
  const departments = getStorageData<Department[]>(STORAGE_KEYS.DEPARTMENTS) || [];
  return createSuccessResponse(departments.find((d) => d.id === id) || null);
}

async function createDepartment(data: Omit<Department, 'id' | 'createdAt' | 'updatedAt'>): Promise<ApiResponse<Department>> {
  ensureInit();
  await delay(200);
  const departments = getStorageData<Department[]>(STORAGE_KEYS.DEPARTMENTS) || [];
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
  const departments = getStorageData<Department[]>(STORAGE_KEYS.DEPARTMENTS) || [];
  const idx = departments.findIndex((d) => d.id === id);
  if (idx === -1) return createSuccessResponse(null);
  departments[idx] = { ...departments[idx], ...data, updatedAt: new Date().toISOString() };
  setStorageData(STORAGE_KEYS.DEPARTMENTS, departments);
  return createSuccessResponse(departments[idx]);
}

async function deleteDepartment(id: string): Promise<ApiResponse<boolean>> {
  ensureInit();
  await delay(150);
  const departments = getStorageData<Department[]>(STORAGE_KEYS.DEPARTMENTS) || [];
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
