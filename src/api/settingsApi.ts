import type { User, UserRole, ProductConfig, OrderTypeConfig, LifecycleStatusConfig, LeadSourceConfig, LifecycleStatusCode, CustomerLevelConfig, OrganizationProfile, EmploymentStatus } from '../types/settings';
import type { ApiResponse, PaginatedResponse } from './types';
import { createErrorResponse, createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { STORAGE_KEYS, DEFAULT_PAGE_SIZE, COMMISSION_RATES, DEFAULT_ORDER_TYPE_CONFIGS, DEFAULT_LIFECYCLE_STATUS_CONFIGS, DEFAULT_LEAD_SOURCE_CONFIGS, DEFAULT_CUSTOMER_LEVEL_CONFIGS, normalizeLifecycleStatusCode } from '../shared/utils/constants';
import { initializeMockData } from './mock';
import { v4 as uuidv4 } from 'uuid';
import type { Order } from '../types/order';
import type { CommissionRule } from '../types/commission';
import { authApi } from './authApi';
import { DEFAULT_USER_PASSWORD, ensureAdminUser, ensureUniqueAccount, normalizeAccount } from '../shared/utils/auth';
import { DEFAULT_ORGANIZATION_PROFILE, ensureOrganizationConfigData, getOrganizationProfile, migrateUsersWithOrganization, resolvePositionForUser, resolveRoleForUser } from '../shared/utils/organizationConfig';
import { DEFAULT_USER_ROLE } from '../shared/utils/roles';
import { getCurrentOperatorName } from '../shared/utils/currentOperator';

function ensureInit(): void {
  initializeMockData();
  ensureOrganizationConfigData();
}

function ensureUsersWithAuth(): User[] {
  ensureInit();
  const users = migrateUsersWithOrganization(ensureAdminUser(getStorageData<User[]>(STORAGE_KEYS.USERS) || []));
  setStorageData(STORAGE_KEYS.USERS, users);
  return users;
}

async function fetchOrganizationProfile(): Promise<ApiResponse<OrganizationProfile>> {
  ensureInit();
  await delay(80);
  return createSuccessResponse(getOrganizationProfile());
}

async function updateOrganizationProfile(data: Partial<OrganizationProfile>): Promise<ApiResponse<OrganizationProfile | null>> {
  ensureInit();
  await delay(120);
  const companyName = String(data.companyName || '').trim();
  if (!companyName) return createErrorResponse('公司名称不能为空');
  const profile: OrganizationProfile = {
    ...DEFAULT_ORGANIZATION_PROFILE,
    ...getOrganizationProfile(),
    companyName,
  };
  setStorageData(STORAGE_KEYS.ORGANIZATION_PROFILE, profile);
  return createSuccessResponse(profile);
}

function withResolvedUserOrganization<T extends Partial<User>>(data: T): T {
  const { roles, positions } = ensureOrganizationConfigData();
  const role = resolveRoleForUser({ role: data.role || DEFAULT_USER_ROLE, roleId: data.roleId }, roles);
  const position = resolvePositionForUser({
    role: data.role || role?.name || DEFAULT_USER_ROLE,
    positionId: data.positionId,
    positionName: data.positionName,
  }, positions);
  return {
    ...data,
    role: role?.name || data.role,
    roleId: role?.id || data.roleId,
    positionId: position?.id || data.positionId,
    positionName: position?.name || data.positionName,
    departmentId: data.departmentId || position?.departmentId,
  };
}

function ensureOrderTypeConfigs(): OrderTypeConfig[] {
  const existing = getStorageData<OrderTypeConfig[]>(STORAGE_KEYS.ORDER_TYPE_CONFIGS);
  const configs: OrderTypeConfig[] = existing?.length ? existing : DEFAULT_ORDER_TYPE_CONFIGS;
  const sorted = [...configs].sort((a, b) => a.sortOrder - b.sortOrder);
  if (!existing?.length) setStorageData(STORAGE_KEYS.ORDER_TYPE_CONFIGS, sorted);
  return sorted;
}

function ensureLifecycleStatusConfigs(): LifecycleStatusConfig[] {
  const existing = getStorageData<LifecycleStatusConfig[]>(STORAGE_KEYS.LIFECYCLE_STATUS_CONFIGS);
  const existingByCode = new Map<LifecycleStatusCode, LifecycleStatusConfig>();
  (existing || []).forEach((item) => {
    existingByCode.set(normalizeLifecycleStatusCode(item.code || item.name), item);
  });
  const sorted = DEFAULT_LIFECYCLE_STATUS_CONFIGS.map((defaultConfig) => {
    const existingConfig = existingByCode.get(defaultConfig.code);
    const canKeepExistingName = existingConfig?.code === defaultConfig.code;
    return {
      ...defaultConfig,
      ...(existingConfig || {}),
      id: defaultConfig.id,
      code: defaultConfig.code,
      name: canKeepExistingName ? existingConfig.name : defaultConfig.name,
      sortOrder: canKeepExistingName ? Number(existingConfig.sortOrder) : defaultConfig.sortOrder,
      isSystem: true,
      isActive: true,
    };
  }).sort((a, b) => a.sortOrder - b.sortOrder);
  if (JSON.stringify(existing || []) !== JSON.stringify(sorted)) setStorageData(STORAGE_KEYS.LIFECYCLE_STATUS_CONFIGS, sorted);
  return sorted;
}

function ensureCustomerLevelConfigs(): CustomerLevelConfig[] {
  const existing = getStorageData<CustomerLevelConfig[]>(STORAGE_KEYS.CUSTOMER_LEVEL_CONFIGS);
  const configs = existing?.length ? existing : DEFAULT_CUSTOMER_LEVEL_CONFIGS;
  const sorted = [...configs].sort((a, b) => a.sortOrder - b.sortOrder);
  if (!existing?.length) setStorageData(STORAGE_KEYS.CUSTOMER_LEVEL_CONFIGS, sorted);
  return sorted;
}

function ensureLeadSourceConfigs(): LeadSourceConfig[] {
  const existing = getStorageData<LeadSourceConfig[]>(STORAGE_KEYS.LEAD_SOURCE_CONFIGS);
  const configs = existing?.length ? existing : DEFAULT_LEAD_SOURCE_CONFIGS;
  const sorted = [...configs].sort((a, b) => {
    if ((a.parentId || '') !== (b.parentId || '')) return (a.parentId || '').localeCompare(b.parentId || '');
    return a.sortOrder - b.sortOrder;
  });
  if (!existing?.length) setStorageData(STORAGE_KEYS.LEAD_SOURCE_CONFIGS, sorted);
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

type UserFilters = {
  search?: string;
  role?: UserRole;
  isActive?: boolean;
  employmentStatus?: EmploymentStatus | 'all';
};

function isAdminUser(user: Pick<User, 'account'>): boolean {
  return normalizeAccount(user.account) === 'admin';
}

async function fetchUsers(filters?: UserFilters): Promise<ApiResponse<User[]>> {
  await delay(200);
  let users = ensureUsersWithAuth();
  const employmentStatus = filters?.employmentStatus || 'active';

  if (filters?.search) {
    const q = filters.search.toLowerCase();
    users = users.filter((u) => (
      u.name.toLowerCase().includes(q)
      || u.email.toLowerCase().includes(q)
      || normalizeAccount(u.account).includes(q)
      || normalizeAccount(u.phone).includes(q)
    ));
  }
  if (filters?.role) {
    users = users.filter((u) => u.role === filters.role);
  }
  if (filters?.isActive !== undefined) {
    users = users.filter((u) => u.isActive === filters.isActive);
  }
  if (employmentStatus !== 'all') {
    users = users.filter((u) => (u.employmentStatus || 'active') === employmentStatus);
  }

  return createSuccessResponse(users);
}

async function createUser(data: Omit<User, 'id' | 'createdAt' | 'updatedAt' | 'passwordHash' | 'passwordSalt' | 'passwordUpdatedAt'> & { password?: string }): Promise<ApiResponse<User | null>> {
  await delay(200);
  const users = ensureUsersWithAuth();
  const now = new Date().toISOString();
  const account = normalizeAccount(data.account || data.email || data.phone);
  if (!account) return createErrorResponse('账号不能为空');
  if (!ensureUniqueAccount(users, account)) return createErrorResponse('账号已存在');
  const id = `user-${uuidv4().slice(0, 8)}`;
  const passwordFields = authApi.createUserPasswordFields(id, account, data.password || DEFAULT_USER_PASSWORD);
  const resolvedData = withResolvedUserOrganization(data);
  const newUser: User = {
    ...resolvedData,
    id,
    account,
    employmentStatus: data.employmentStatus || 'active',
    leftAt: data.employmentStatus === 'left' ? data.leftAt || now : undefined,
    leftBy: data.employmentStatus === 'left' ? data.leftBy : undefined,
    ...passwordFields,
    createdAt: now,
    updatedAt: now,
  };
  users.push(newUser);
  setStorageData(STORAGE_KEYS.USERS, users);
  return createSuccessResponse(newUser);
}

async function updateUser(id: string, data: Partial<User>): Promise<ApiResponse<User | null>> {
  await delay(200);
  const users = ensureUsersWithAuth();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) return createSuccessResponse(null);
  const nextAccount = data.account !== undefined ? normalizeAccount(data.account) : users[idx].account;
  if (!nextAccount) return createErrorResponse('账号不能为空');
  if (!ensureUniqueAccount(users, nextAccount, id)) return createErrorResponse('账号已存在');
  const safeData = withResolvedUserOrganization({ ...users[idx], ...data, account: nextAccount });
  delete safeData.passwordHash;
  delete safeData.passwordSalt;
  delete safeData.passwordUpdatedAt;
  users[idx] = { ...users[idx], ...safeData, updatedAt: new Date().toISOString() };
  setStorageData(STORAGE_KEYS.USERS, users);
  return createSuccessResponse(users[idx]);
}

async function leaveUser(id: string): Promise<ApiResponse<User | null>> {
  await delay(150);
  const users = ensureUsersWithAuth();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) return createSuccessResponse(null);
  if (isAdminUser(users[idx])) return createErrorResponse('内置管理员账号不能办理离职');
  const now = new Date().toISOString();
  users[idx] = {
    ...users[idx],
    isActive: false,
    employmentStatus: 'left',
    leftAt: now,
    leftBy: getCurrentOperatorName('系统'),
    updatedAt: now,
  };
  setStorageData(STORAGE_KEYS.USERS, users);
  return createSuccessResponse(users[idx]);
}

async function restoreUser(id: string): Promise<ApiResponse<User | null>> {
  await delay(150);
  const users = ensureUsersWithAuth();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) return createSuccessResponse(null);
  const now = new Date().toISOString();
  const restored: User = {
    ...users[idx],
    isActive: true,
    employmentStatus: 'active',
    updatedAt: now,
  };
  delete restored.leftAt;
  delete restored.leftBy;
  users[idx] = restored;
  setStorageData(STORAGE_KEYS.USERS, users);
  return createSuccessResponse(users[idx]);
}

async function deleteUser(id: string): Promise<ApiResponse<boolean>> {
  await delay(150);
  const users = ensureUsersWithAuth();
  const target = users.find((u) => u.id === id);
  if (!target) return createSuccessResponse(false);
  if (isAdminUser(target)) return createErrorResponse('内置管理员账号不能删除');
  if ((target.employmentStatus || 'active') !== 'left') {
    return createErrorResponse('请先办理离职，再到账号回收站永久删除');
  }
  setStorageData(STORAGE_KEYS.USERS, users.filter((u) => u.id !== id));
  return createSuccessResponse(true);
}

async function resetUserPassword(id: string, password: string): Promise<ApiResponse<User | null>> {
  await delay(150);
  const users = ensureUsersWithAuth();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) return createSuccessResponse(null);
  if (!password || password.length < 6) return createErrorResponse('密码至少 6 位');
  users[idx] = {
    ...users[idx],
    ...authApi.createUserPasswordFields(id, users[idx].account || users[idx].email, password),
    updatedAt: new Date().toISOString(),
  };
  setStorageData(STORAGE_KEYS.USERS, users);
  return createSuccessResponse(users[idx]);
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

// ---- 客户等级配置 ----

async function fetchCustomerLevelConfigs(): Promise<ApiResponse<CustomerLevelConfig[]>> {
  ensureInit();
  await delay(120);
  return createSuccessResponse(ensureCustomerLevelConfigs());
}

async function createCustomerLevelConfig(
  data: Omit<CustomerLevelConfig, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<ApiResponse<CustomerLevelConfig | null>> {
  ensureInit();
  await delay(150);
  const configs = ensureCustomerLevelConfigs();
  const value = data.value.trim();
  const label = data.label.trim();
  if (!value) return createErrorResponse('客户等级编码不能为空');
  if (!label) return createErrorResponse('客户等级名称不能为空');
  if (configs.some((config) => config.value === value)) return createErrorResponse('客户等级编码已存在');
  const now = new Date().toISOString();
  const config: CustomerLevelConfig = {
    ...data,
    value,
    label,
    id: `clc-${uuidv4().slice(0, 8)}`,
    createdAt: now,
    updatedAt: now,
  };
  setStorageData(STORAGE_KEYS.CUSTOMER_LEVEL_CONFIGS, [...configs, config].sort((a, b) => a.sortOrder - b.sortOrder));
  return createSuccessResponse(config);
}

async function updateCustomerLevelConfig(
  id: string,
  data: Partial<Omit<CustomerLevelConfig, 'id' | 'createdAt' | 'updatedAt'>>,
): Promise<ApiResponse<CustomerLevelConfig | null>> {
  ensureInit();
  await delay(150);
  const configs = ensureCustomerLevelConfigs();
  const idx = configs.findIndex((config) => config.id === id);
  if (idx === -1) return createSuccessResponse(null);
  const nextValue = typeof data.value === 'string' ? data.value.trim() : configs[idx].value;
  const nextLabel = typeof data.label === 'string' ? data.label.trim() : configs[idx].label;
  if (!nextValue) return createErrorResponse('客户等级编码不能为空');
  if (!nextLabel) return createErrorResponse('客户等级名称不能为空');
  if (configs.some((config) => config.id !== id && config.value === nextValue)) return createErrorResponse('客户等级编码已存在');
  const next = [...configs];
  next[idx] = {
    ...configs[idx],
    ...data,
    value: nextValue,
    label: nextLabel,
    color: data.color || configs[idx].color,
    sortOrder: Number(data.sortOrder ?? configs[idx].sortOrder),
    updatedAt: new Date().toISOString(),
  };
  setStorageData(STORAGE_KEYS.CUSTOMER_LEVEL_CONFIGS, next.sort((a, b) => a.sortOrder - b.sortOrder));
  return createSuccessResponse(next[idx]);
}

async function deleteCustomerLevelConfig(id: string): Promise<ApiResponse<boolean>> {
  ensureInit();
  await delay(150);
  const configs = ensureCustomerLevelConfigs();
  const target = configs.find((config) => config.id === id);
  if (!target) return createSuccessResponse(false);
  const customers = getStorageData<Array<{ customerLevel?: string }>>(STORAGE_KEYS.CUSTOMERS) || [];
  if (customers.some((customer) => customer.customerLevel === target.value)) {
    return createErrorResponse('已有客户使用该等级，不能删除');
  }
  setStorageData(STORAGE_KEYS.CUSTOMER_LEVEL_CONFIGS, configs.filter((config) => config.id !== id));
  return createSuccessResponse(true);
}

// ---- 线索来源配置 ----

async function fetchLeadSourceConfigs(): Promise<ApiResponse<LeadSourceConfig[]>> {
  ensureInit();
  await delay(120);
  return createSuccessResponse(ensureLeadSourceConfigs());
}

async function createLeadSourceConfig(
  data: Omit<LeadSourceConfig, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<ApiResponse<LeadSourceConfig | null>> {
  ensureInit();
  await delay(150);
  const configs = ensureLeadSourceConfigs();
  const name = data.name.trim();
  if (!name) return createErrorResponse('线索来源名称不能为空');
  if (configs.some((config) => config.parentId === data.parentId && config.name === name)) {
    return createErrorResponse('同级线索来源已存在');
  }
  const now = new Date().toISOString();
  const config: LeadSourceConfig = {
    ...data,
    name,
    id: `lscfg-${uuidv4().slice(0, 8)}`,
    createdAt: now,
    updatedAt: now,
  };
  setStorageData(STORAGE_KEYS.LEAD_SOURCE_CONFIGS, [...configs, config]);
  return createSuccessResponse(config);
}

async function updateLeadSourceConfig(
  id: string,
  data: Partial<Omit<LeadSourceConfig, 'id' | 'createdAt' | 'updatedAt'>>,
): Promise<ApiResponse<LeadSourceConfig | null>> {
  ensureInit();
  await delay(150);
  const configs = ensureLeadSourceConfigs();
  const idx = configs.findIndex((config) => config.id === id);
  if (idx === -1) return createSuccessResponse(null);
  const nextName = typeof data.name === 'string' ? data.name.trim() : configs[idx].name;
  if (!nextName) return createErrorResponse('线索来源名称不能为空');
  const parentId = data.parentId ?? configs[idx].parentId;
  if (configs.some((config) => config.id !== id && config.parentId === parentId && config.name === nextName)) {
    return createErrorResponse('同级线索来源已存在');
  }
  const next = [...configs];
  next[idx] = {
    ...configs[idx],
    ...data,
    name: nextName,
    sortOrder: Number(data.sortOrder ?? configs[idx].sortOrder),
    updatedAt: new Date().toISOString(),
  };
  setStorageData(STORAGE_KEYS.LEAD_SOURCE_CONFIGS, next);
  return createSuccessResponse(next[idx]);
}

async function deleteLeadSourceConfig(id: string): Promise<ApiResponse<boolean>> {
  ensureInit();
  await delay(150);
  const configs = ensureLeadSourceConfigs();
  const hasChildren = configs.some((config) => config.parentId === id);
  if (hasChildren) return createErrorResponse('请先删除该来源下的二级来源');
  setStorageData(STORAGE_KEYS.LEAD_SOURCE_CONFIGS, configs.filter((config) => config.id !== id));
  return createSuccessResponse(true);
}

export const settingsApi = {
  fetchOrganizationProfile,
  updateOrganizationProfile,
  fetchUsers,
  createUser,
  updateUser,
  leaveUser,
  restoreUser,
  deleteUser,
  resetUserPassword,
  fetchProductConfigs,
  fetchOrderTypeConfigs,
  createOrderTypeConfig,
  updateOrderTypeConfig,
  deleteOrderTypeConfig,
  fetchLifecycleStatusConfigs,
  createLifecycleStatusConfig,
  updateLifecycleStatusConfig,
  deleteLifecycleStatusConfig,
  fetchCustomerLevelConfigs,
  createCustomerLevelConfig,
  updateCustomerLevelConfig,
  deleteCustomerLevelConfig,
  fetchLeadSourceConfigs,
  createLeadSourceConfig,
  updateLeadSourceConfig,
  deleteLeadSourceConfig,
};
