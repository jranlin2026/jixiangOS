import type { Position, PositionFilters } from '../types/position';
import type { ApiResponse } from './types';
import { createErrorResponse, createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { STORAGE_KEYS } from '../shared/utils/constants';
import { initializeMockData } from './mock';
import { ensureOrganizationConfigData } from '../shared/utils/organizationConfig';
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
  const position = positions.find((item) => item.id === id);
  const users = getStorageData<Array<{ positionId?: string; positionName?: string }>>(STORAGE_KEYS.USERS) || [];
  if (users.some((user) => user.positionId === id || (position?.name && user.positionName === position.name))) {
    return createErrorResponse('已有员工使用该职位，不能删除，请改为停用');
  }
  setStorageData(STORAGE_KEYS.POSITIONS, positions.filter((position) => position.id !== id));
  return createSuccessResponse(true);
}

export const positionApi = {
  getPositions,
  getPositionById,
  createPosition,
  updatePosition,
  deletePosition,
  readPositions,
};
