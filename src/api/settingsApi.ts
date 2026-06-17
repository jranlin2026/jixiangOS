import type { User, UserRole, ProductConfig, ChannelConfig, OrderTypeConfig, LifecycleStatusConfig } from '../types/settings';
import type { ApiResponse, PaginatedResponse } from './types';
import { createErrorResponse, createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { STORAGE_KEYS, DEFAULT_PAGE_SIZE, COMMISSION_RATES, DEFAULT_ORDER_TYPE_CONFIGS, DEFAULT_LIFECYCLE_STATUS_CONFIGS } from '../shared/utils/constants';
import { initializeMockData } from './mock';
import { v4 as uuidv4 } from 'uuid';
import type { Order } from '../types/order';
import type { CommissionRule } from '../types/commission';

function ensureInit(): void {
  initializeMockData();
}

function ensureOrderTypeConfigs(): OrderTypeConfig[] {
  const existing = getStorageData<OrderTypeConfig[]>(STORAGE_KEYS.ORDER_TYPE_CONFIGS);
  let configs: OrderTypeConfig[] = existing?.length ? existing : DEFAULT_ORDER_TYPE_CONFIGS;
  let changed = !existing?.length;
  const now = new Date().toISOString();
  const usedNames = new Set<string>();

  (getStorageData<Order[]>(STORAGE_KEYS.ORDERS) || []).forEach((order) => {
    if (order.orderType) usedNames.add(order.orderType);
  });
  (getStorageData<CommissionRule[]>(STORAGE_KEYS.COMMISSION_RULES) || []).forEach((rule) => {
    if (rule.orderType) usedNames.add(rule.orderType);
  });

  usedNames.forEach((name) => {
    if (configs.some((config) => config.name === name)) return;
    configs = [
      ...configs,
      {
        id: `otc-${uuidv4().slice(0, 8)}`,
        name,
        description: '',
        isActive: true,
        sortOrder: configs.length + 1,
        createdAt: now,
        updatedAt: now,
      },
    ];
    changed = true;
  });

  const sorted = [...configs].sort((a, b) => a.sortOrder - b.sortOrder);
  if (changed) setStorageData(STORAGE_KEYS.ORDER_TYPE_CONFIGS, sorted);
  return sorted;
}

function ensureLifecycleStatusConfigs(): LifecycleStatusConfig[] {
  const existing = getStorageData<LifecycleStatusConfig[]>(STORAGE_KEYS.LIFECYCLE_STATUS_CONFIGS);
  const configs = existing?.length ? existing : DEFAULT_LIFECYCLE_STATUS_CONFIGS;
  const sorted = [...configs].sort((a, b) => a.sortOrder - b.sortOrder);
  if (!existing?.length) setStorageData(STORAGE_KEYS.LIFECYCLE_STATUS_CONFIGS, sorted);
  return sorted;
}

function replaceOrderTypeReferences(oldName: string, newName: string): void {
  const now = new Date().toISOString();
  const orders = getStorageData<Order[]>(STORAGE_KEYS.ORDERS) || [];
  setStorageData(STORAGE_KEYS.ORDERS, orders.map((order) => (
    order.orderType === oldName
      ? { ...order, orderType: newName, dealScene: order.dealScene === oldName ? newName as any : order.dealScene, updatedAt: now }
      : order
  )));

  const rules = getStorageData<CommissionRule[]>(STORAGE_KEYS.COMMISSION_RULES) || [];
  setStorageData(STORAGE_KEYS.COMMISSION_RULES, rules.map((rule) => (
    rule.orderType === oldName
      ? { ...rule, orderType: newName, scene: rule.scene === oldName ? newName as any : rule.scene }
      : rule
  )));
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

// ---- 订单类型配置 ----

async function fetchOrderTypeConfigs(): Promise<ApiResponse<OrderTypeConfig[]>> {
  ensureInit();
  await delay(120);
  return createSuccessResponse(ensureOrderTypeConfigs());
}

async function createOrderTypeConfig(
  data: Omit<OrderTypeConfig, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<ApiResponse<OrderTypeConfig | null>> {
  ensureInit();
  await delay(150);
  const configs = ensureOrderTypeConfigs();
  const name = data.name.trim();
  if (!name) return createErrorResponse('订单类型名称不能为空');
  if (configs.some((config) => config.name === name)) return createErrorResponse('订单类型已存在');
  const now = new Date().toISOString();
  const config: OrderTypeConfig = {
    ...data,
    name,
    id: `otc-${uuidv4().slice(0, 8)}`,
    createdAt: now,
    updatedAt: now,
  };
  setStorageData(STORAGE_KEYS.ORDER_TYPE_CONFIGS, [...configs, config].sort((a, b) => a.sortOrder - b.sortOrder));
  return createSuccessResponse(config);
}

async function updateOrderTypeConfig(
  id: string,
  data: Partial<Omit<OrderTypeConfig, 'id' | 'createdAt' | 'updatedAt'>>,
): Promise<ApiResponse<OrderTypeConfig | null>> {
  ensureInit();
  await delay(150);
  const configs = ensureOrderTypeConfigs();
  const idx = configs.findIndex((config) => config.id === id);
  if (idx === -1) return createSuccessResponse(null);
  const oldName = configs[idx].name;
  const nextName = typeof data.name === 'string' ? data.name.trim() : oldName;
  if (!nextName) return createErrorResponse('订单类型名称不能为空');
  if (configs.some((config) => config.id !== id && config.name === nextName)) {
    return createErrorResponse('订单类型已存在');
  }
  const updated: OrderTypeConfig = {
    ...configs[idx],
    ...data,
    name: nextName,
    sortOrder: Number(data.sortOrder ?? configs[idx].sortOrder),
    updatedAt: new Date().toISOString(),
  };
  const next = [...configs];
  next[idx] = updated;
  setStorageData(STORAGE_KEYS.ORDER_TYPE_CONFIGS, next.sort((a, b) => a.sortOrder - b.sortOrder));
  if (oldName !== nextName) replaceOrderTypeReferences(oldName, nextName);
  return createSuccessResponse(updated);
}

async function deleteOrderTypeConfig(id: string): Promise<ApiResponse<boolean>> {
  ensureInit();
  await delay(150);
  const configs = ensureOrderTypeConfigs();
  const target = configs.find((config) => config.id === id);
  if (!target) return createSuccessResponse(false);
  const orders = getStorageData<Order[]>(STORAGE_KEYS.ORDERS) || [];
  const rules = getStorageData<CommissionRule[]>(STORAGE_KEYS.COMMISSION_RULES) || [];
  if (orders.some((order) => order.orderType === target.name) || rules.some((rule) => rule.orderType === target.name)) {
    return createErrorResponse('已有订单或提成规则使用该订单类型，不能删除');
  }
  setStorageData(STORAGE_KEYS.ORDER_TYPE_CONFIGS, configs.filter((config) => config.id !== id));
  return createSuccessResponse(true);
}

// ---- 生命周期状态配置 ----

async function fetchLifecycleStatusConfigs(): Promise<ApiResponse<LifecycleStatusConfig[]>> {
  ensureInit();
  await delay(120);
  return createSuccessResponse(ensureLifecycleStatusConfigs());
}

async function createLifecycleStatusConfig(
  data: Omit<LifecycleStatusConfig, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<ApiResponse<LifecycleStatusConfig | null>> {
  ensureInit();
  await delay(150);
  const configs = ensureLifecycleStatusConfigs();
  const name = data.name.trim();
  if (!name) return createErrorResponse('生命周期状态名称不能为空');
  if (configs.some((config) => config.name === name)) return createErrorResponse('生命周期状态已存在');
  const now = new Date().toISOString();
  const config: LifecycleStatusConfig = {
    ...data,
    name,
    id: `lsc-${uuidv4().slice(0, 8)}`,
    createdAt: now,
    updatedAt: now,
  };
  setStorageData(STORAGE_KEYS.LIFECYCLE_STATUS_CONFIGS, [...configs, config].sort((a, b) => a.sortOrder - b.sortOrder));
  return createSuccessResponse(config);
}

async function updateLifecycleStatusConfig(
  id: string,
  data: Partial<Omit<LifecycleStatusConfig, 'id' | 'createdAt' | 'updatedAt'>>,
): Promise<ApiResponse<LifecycleStatusConfig | null>> {
  ensureInit();
  await delay(150);
  const configs = ensureLifecycleStatusConfigs();
  const idx = configs.findIndex((config) => config.id === id);
  if (idx === -1) return createSuccessResponse(null);
  const nextName = typeof data.name === 'string' ? data.name.trim() : configs[idx].name;
  if (!nextName) return createErrorResponse('生命周期状态名称不能为空');
  if (configs.some((config) => config.id !== id && config.name === nextName)) return createErrorResponse('生命周期状态已存在');
  const next = [...configs];
  next[idx] = {
    ...configs[idx],
    ...data,
    name: nextName,
    sortOrder: Number(data.sortOrder ?? configs[idx].sortOrder),
    color: data.color || configs[idx].color,
    updatedAt: new Date().toISOString(),
  };
  setStorageData(STORAGE_KEYS.LIFECYCLE_STATUS_CONFIGS, next.sort((a, b) => a.sortOrder - b.sortOrder));
  return createSuccessResponse(next[idx]);
}

async function deleteLifecycleStatusConfig(id: string): Promise<ApiResponse<boolean>> {
  ensureInit();
  await delay(150);
  const configs = ensureLifecycleStatusConfigs();
  const target = configs.find((config) => config.id === id);
  if (!target) return createSuccessResponse(false);
  if (target.isSystem) return createErrorResponse('系统内置状态不能删除，可以停用或改名');
  setStorageData(STORAGE_KEYS.LIFECYCLE_STATUS_CONFIGS, configs.filter((config) => config.id !== id));
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
  fetchOrderTypeConfigs,
  createOrderTypeConfig,
  updateOrderTypeConfig,
  deleteOrderTypeConfig,
  fetchLifecycleStatusConfigs,
  createLifecycleStatusConfig,
  updateLifecycleStatusConfig,
  deleteLifecycleStatusConfig,
};
