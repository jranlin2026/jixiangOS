import type { Position, PositionFilters } from '../types/position';
import type { User } from '../types/settings';
import type { ApiResponse } from './types';
import { createErrorResponse, createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { STORAGE_KEYS } from '../shared/utils/constants';
import { initializeMockData } from './mock';
import { ensureOrganizationConfigData, getDepartmentAncestorIds, migrateUsersWithOrganization } from '../shared/utils/organizationConfig';
import { ensureAdminUser } from '../shared/utils/auth';
import { v4 as uuidv4 } from 'uuid';

function ensureInit(): Position[] {
  initializeMockData();
  return ensureOrganizationConfigData().positions;
}

function readPositions(): Position[] {
  return ensureOrganizationConfigData().positions;
}

async function getPositions(filters?: PositionFilters): Promise<ApiResponse<Position[]>> {
  await delay(150);
  let positions = ensureInit();

  if (filters?.search) {
    const q = filters.search.toLowerCase();
    positions = positions.filter((position) => (
      position.name.toLowerCase().includes(q)
      || position.code.toLowerCase().includes(q)
      || position.description?.toLowerCase().includes(q)
    ));
  }
  if (filters?.departmentId) {
    positions = positions.filter((position) => position.departmentId === filters.departmentId);
  }
  if (filters?.isActive !== undefined) {
    positions = positions.filter((position) => position.isActive === filters.isActive);
  }

  return createSuccessResponse(positions);
}

async function getPositionById(id: string): Promise<ApiResponse<Position | null>> {
  await delay(120);
  const positions = ensureInit();
  return createSuccessResponse(positions.find((position) => position.id === id) || null);
}

async function getPositionsForDepartment(departmentId?: string): Promise<ApiResponse<Position[]>> {
  await delay(120);
  const { departments, positions } = ensureOrganizationConfigData();
  const allowedDepartmentIds = new Set(getDepartmentAncestorIds(departments, departmentId));
  const matched = positions
    .filter((position) => position.isActive)
    .filter((position) => !position.departmentId || allowedDepartmentIds.has(position.departmentId))
    .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder) || a.name.localeCompare(b.name));
  return createSuccessResponse(matched);
}

async function createPosition(data: Omit<Position, 'id' | 'createdAt' | 'updatedAt'>): Promise<ApiResponse<Position | null>> {
  await delay(150);
  const positions = ensureInit();
  const name = data.name.trim();
  const code = data.code.trim();
  if (!name) return createErrorResponse('职位名称不能为空');
  if (!code) return createErrorResponse('职位编码不能为空');
  if (positions.some((position) => position.name === name)) return createErrorResponse('职位名称已存在');
  if (positions.some((position) => position.code === code)) return createErrorResponse('职位编码已存在');
  const now = new Date().toISOString();
  const position: Position = {
    ...data,
    name,
    code,
    id: `pos-${uuidv4().slice(0, 8)}`,
    sortOrder: Number(data.sortOrder || positions.length + 1),
    createdAt: now,
    updatedAt: now,
  };
  setStorageData(STORAGE_KEYS.POSITIONS, [...positions, position].sort((a, b) => a.sortOrder - b.sortOrder));
  return createSuccessResponse(position);
}

async function updatePosition(id: string, data: Partial<Position>): Promise<ApiResponse<Position | null>> {
  await delay(150);
  const positions = ensureInit();
  const index = positions.findIndex((position) => position.id === id);
  if (index === -1) return createSuccessResponse(null);
  const name = typeof data.name === 'string' ? data.name.trim() : positions[index].name;
  const code = typeof data.code === 'string' ? data.code.trim() : positions[index].code;
  if (!name) return createErrorResponse('职位名称不能为空');
  if (!code) return createErrorResponse('职位编码不能为空');
  if (positions.some((position) => position.id !== id && position.name === name)) return createErrorResponse('职位名称已存在');
  if (positions.some((position) => position.id !== id && position.code === code)) return createErrorResponse('职位编码已存在');
  const next = [...positions];
  next[index] = {
    ...positions[index],
    ...data,
    name,
    code,
    sortOrder: Number(data.sortOrder ?? positions[index].sortOrder),
    updatedAt: new Date().toISOString(),
  };
  setStorageData(STORAGE_KEYS.POSITIONS, next.sort((a, b) => a.sortOrder - b.sortOrder));
  return createSuccessResponse(next[index]);
}

async function deletePosition(id: string): Promise<ApiResponse<boolean>> {
  await delay(120);
  const positions = ensureInit();
  const users = migrateUsersWithOrganization(ensureAdminUser(getStorageData<User[]>(STORAGE_KEYS.USERS) || []));
  setStorageData(STORAGE_KEYS.USERS, users);
  const activeUsers = users.filter((user) => (user.employmentStatus || 'active') !== 'left' && user.positionId === id);
  if (activeUsers.length > 0) {
    const names = activeUsers.map((user) => user.name).filter(Boolean).join('、');
    return createErrorResponse(`已有启用员工正在使用该职位：${names || `${activeUsers.length}人`}，请先调整员工职位或停用员工`);
  }
  setStorageData(STORAGE_KEYS.POSITIONS, positions.filter((position) => position.id !== id));
  return createSuccessResponse(true);
}

export const positionApi = {
  getPositions,
  getPositionById,
  getPositionsForDepartment,
  createPosition,
  updatePosition,
  deletePosition,
  readPositions,
};
