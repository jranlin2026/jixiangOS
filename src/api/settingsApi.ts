import type { User, UserRole, ProductConfig, ChannelConfig } from '../types/settings';
import type { ApiResponse, PaginatedResponse } from './types';
import { createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { STORAGE_KEYS, DEFAULT_PAGE_SIZE, COMMISSION_RATES } from '../shared/utils/constants';
import { initializeMockData } from './mock';
import { v4 as uuidv4 } from 'uuid';

function ensureInit(): void {
  initializeMockData();
}

// ---- 用户管理 ----

async function fetchUsers(filters?: { search?: string; role?: UserRole; isActive?: boolean }): Promise<ApiResponse<User[]>> {
  ensureInit();
  await delay(200);
  let users = getStorageData<User[]>(STORAGE_KEYS.USERS) || [];

  if (filters?.search) {
    const q = filters.search.toLowerCase();
    users = users.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }
  if (filters?.role) {
    users = users.filter((u) => u.role === filters.role);
  }
  if (filters?.isActive !== undefined) {
    users = users.filter((u) => u.isActive === filters.isActive);
  }

  return createSuccessResponse(users);
}

async function createUser(data: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<ApiResponse<User>> {
  ensureInit();
  await delay(200);
  const users = getStorageData<User[]>(STORAGE_KEYS.USERS) || [];
  const now = new Date().toISOString();
  const newUser: User = { ...data, id: `user-${uuidv4().slice(0, 8)}`, createdAt: now, updatedAt: now };
  users.push(newUser);
  setStorageData(STORAGE_KEYS.USERS, users);
  return createSuccessResponse(newUser);
}

async function updateUser(id: string, data: Partial<User>): Promise<ApiResponse<User | null>> {
  ensureInit();
  await delay(200);
  const users = getStorageData<User[]>(STORAGE_KEYS.USERS) || [];
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) return createSuccessResponse(null);
  users[idx] = { ...users[idx], ...data, updatedAt: new Date().toISOString() };
  setStorageData(STORAGE_KEYS.USERS, users);
  return createSuccessResponse(users[idx]);
}

async function deleteUser(id: string): Promise<ApiResponse<boolean>> {
  ensureInit();
  await delay(150);
  const users = getStorageData<User[]>(STORAGE_KEYS.USERS) || [];
  setStorageData(STORAGE_KEYS.USERS, users.filter((u) => u.id !== id));
  return createSuccessResponse(true);
}

// ---- 产品配置 ----

async function fetchProductConfigs(): Promise<ApiResponse<ProductConfig[]>> {
  ensureInit();
  await delay(150);
  const configs: ProductConfig[] = [
    { id: 'prod-001', name: '899基础版', level: '899', price: 89900, commissionRate: COMMISSION_RATES['899'], description: '基础功能版，适合初创企业', isActive: true },
    { id: 'prod-002', name: '代理版', level: '代理', price: 150000, commissionRate: COMMISSION_RATES['代理'], description: '代理分销版，适合区域代理', isActive: true },
    { id: 'prod-003', name: '贴牌版', level: '贴牌', price: 280000, commissionRate: COMMISSION_RATES['贴牌'], description: '品牌定制版，适合有品牌需求客户', isActive: true },
    { id: 'prod-004', name: '合伙人版', level: '合伙人', price: 450000, commissionRate: COMMISSION_RATES['合伙人'], description: '战略合伙版，深度合作模式', isActive: true },
  ];
  return createSuccessResponse(configs);
}

// ---- 渠道配置 ----

async function fetchChannelConfigs(): Promise<ApiResponse<ChannelConfig[]>> {
  ensureInit();
  await delay(150);
  const channels = getStorageData<ChannelConfig[]>(STORAGE_KEYS.CHANNELS) || [];
  return createSuccessResponse(channels);
}

async function createChannelConfig(data: Omit<ChannelConfig, 'id'>): Promise<ApiResponse<ChannelConfig>> {
  ensureInit();
  await delay(200);
  const channels = getStorageData<ChannelConfig[]>(STORAGE_KEYS.CHANNELS) || [];
  const newChannel: ChannelConfig = { ...data, id: uuidv4() };
  channels.push(newChannel);
  setStorageData(STORAGE_KEYS.CHANNELS, channels);
  return createSuccessResponse(newChannel);
}

async function updateChannelConfig(id: string, data: Partial<ChannelConfig>): Promise<ApiResponse<ChannelConfig | null>> {
  ensureInit();
  await delay(200);
  const channels = getStorageData<ChannelConfig[]>(STORAGE_KEYS.CHANNELS) || [];
  const idx = channels.findIndex((c) => c.id === id);
  if (idx === -1) return createSuccessResponse(null);
  channels[idx] = { ...channels[idx], ...data };
  setStorageData(STORAGE_KEYS.CHANNELS, channels);
  return createSuccessResponse(channels[idx]);
}

async function deleteChannelConfig(id: string): Promise<ApiResponse<boolean>> {
  ensureInit();
  await delay(150);
  const channels = getStorageData<ChannelConfig[]>(STORAGE_KEYS.CHANNELS) || [];
  setStorageData(STORAGE_KEYS.CHANNELS, channels.filter((c) => c.id !== id));
  return createSuccessResponse(true);
}

export const settingsApi = {
  fetchUsers,
  createUser,
  updateUser,
  deleteUser,
  fetchProductConfigs,
  fetchChannelConfigs,
  createChannelConfig,
  updateChannelConfig,
  deleteChannelConfig,
};
