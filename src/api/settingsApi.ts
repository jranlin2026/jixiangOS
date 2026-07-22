import type { User, UserRole, ProductConfig, OrderTypeConfig, LifecycleStatusConfig, LeadSourceConfig, LifecycleStatusCode, CustomerLevelConfig, OrganizationProfile, EmploymentStatus, AfterSalesSourceConfig } from '../types/settings';
import type { Customer, CustomerActivityRecord } from '../types/customer';
import type { Lead, LeadChangeLog } from '../types/lead';
import type { Position, PositionFilters } from '../types/position';
import type { Department } from '../types/department';
import type { ApiResponse, PaginatedResponse } from './types';
import { createErrorResponse, createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { STORAGE_KEYS, DEFAULT_PAGE_SIZE, COMMISSION_RATES, DEFAULT_ORDER_TYPE_CONFIGS, DEFAULT_LIFECYCLE_STATUS_CONFIGS, DEFAULT_LEAD_SOURCE_CONFIGS, DEFAULT_CUSTOMER_LEVEL_CONFIGS, LIFECYCLE_STATUS_CODES, normalizeLifecycleStatusCode } from '../shared/utils/constants';
import { initializeMockData } from './mock';
import { v4 as uuidv4 } from 'uuid';
import type { Order } from '../types/order';
import type { CommissionRule } from '../types/commission';
import { authApi } from './authApi';
import { ensureAdminUser, ensureUniqueAccount, getDefaultUserPassword, normalizeAccount } from '../shared/utils/auth';
import { DEFAULT_ORGANIZATION_PROFILE, ensureOrganizationConfigData, getOrganizationProfile, migrateUsersWithOrganization, resolveRoleForUser } from '../shared/utils/organizationConfig';
import { DEFAULT_USER_ROLE } from '../shared/utils/roles';
import { getCurrentOperatorName } from '../shared/utils/currentOperator';
import { backendRequest, shouldUseBackendApi } from './backendClient';
import { assetApi } from './assetApi';

function ensureInit(): void {
  initializeMockData();
  ensureOrganizationConfigData();
}

async function fetchBackendStorageValue<T>(key: string): Promise<T | null> {
  const response = await backendRequest<T | null>(`/storage/${encodeURIComponent(key)}`);
  if (response.code !== 0) return null;
  if (response.data !== null && response.data !== undefined && typeof localStorage !== 'undefined') {
    localStorage.setItem(key, JSON.stringify(response.data));
  }
  return response.data;
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
  const { roles } = ensureOrganizationConfigData();
  const role = resolveRoleForUser({ role: data.role || DEFAULT_USER_ROLE, roleId: data.roleId }, roles);
  const positionName = typeof data.positionName === 'string' ? data.positionName.trim() || undefined : data.positionName;
  return {
    ...data,
    role: role?.name || data.role,
    roleId: role?.id || data.roleId,
    positionId: undefined,
    positionName,
  };
}

function ensureOrderTypeConfigs(): OrderTypeConfig[] {
  const existing = getStorageData<OrderTypeConfig[]>(STORAGE_KEYS.ORDER_TYPE_CONFIGS);
  if (shouldUseBackendApi()) {
    return [...(Array.isArray(existing) ? existing : [])].sort((a, b) => a.sortOrder - b.sortOrder);
  }
  const configs: OrderTypeConfig[] = existing?.length ? existing : DEFAULT_ORDER_TYPE_CONFIGS;
  const sorted = [...configs].sort((a, b) => a.sortOrder - b.sortOrder);
  if (!existing?.length) setStorageData(STORAGE_KEYS.ORDER_TYPE_CONFIGS, sorted, { persist: false });
  return sorted;
}

function ensureLifecycleStatusConfigs(): LifecycleStatusConfig[] {
  const existing = getStorageData<LifecycleStatusConfig[]>(STORAGE_KEYS.LIFECYCLE_STATUS_CONFIGS);
  if (shouldUseBackendApi()) {
    const configs = Array.isArray(existing) && existing.length
      ? existing
      : DEFAULT_LIFECYCLE_STATUS_CONFIGS as unknown as LifecycleStatusConfig[];
    return [...configs].sort((a, b) => a.sortOrder - b.sortOrder);
  }
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
  if (JSON.stringify(existing || []) !== JSON.stringify(sorted)) setStorageData(STORAGE_KEYS.LIFECYCLE_STATUS_CONFIGS, sorted, { persist: false });
  return sorted;
}

function ensureCustomerLevelConfigs(): CustomerLevelConfig[] {
  const existing = getStorageData<CustomerLevelConfig[]>(STORAGE_KEYS.CUSTOMER_LEVEL_CONFIGS);
  if (shouldUseBackendApi()) {
    return [...(Array.isArray(existing) ? existing : [])].sort((a, b) => a.sortOrder - b.sortOrder);
  }
  const configs = existing?.length ? existing : DEFAULT_CUSTOMER_LEVEL_CONFIGS;
  const sorted = [...configs].sort((a, b) => a.sortOrder - b.sortOrder);
  if (!existing?.length) setStorageData(STORAGE_KEYS.CUSTOMER_LEVEL_CONFIGS, sorted, { persist: false });
  return sorted;
}

function ensureLeadSourceConfigs(): LeadSourceConfig[] {
  const existing = getStorageData<LeadSourceConfig[]>(STORAGE_KEYS.LEAD_SOURCE_CONFIGS);
  if (shouldUseBackendApi()) {
    return [...(Array.isArray(existing) ? existing : [])].sort((a, b) => a.sortOrder - b.sortOrder);
  }
  const configs = existing?.length ? existing : DEFAULT_LEAD_SOURCE_CONFIGS;
  const sorted = [...configs].sort((a, b) => {
    if ((a.parentId || '') !== (b.parentId || '')) return (a.parentId || '').localeCompare(b.parentId || '');
    return a.sortOrder - b.sortOrder;
  });
  if (!existing?.length) setStorageData(STORAGE_KEYS.LEAD_SOURCE_CONFIGS, sorted, { persist: false });
  return sorted;
}

function ensureAfterSalesSourceConfigs(): AfterSalesSourceConfig[] {
  return [...(getStorageData<AfterSalesSourceConfig[]>(STORAGE_KEYS.AFTER_SALES_SOURCE_CONFIGS) || [])]
    .sort((a, b) => a.sortOrder - b.sortOrder);
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

export type LeaveUserCustomerHandoff = {
  customerAction?: 'transfer' | 'public_pool';
  targetUserId?: string;
  reason?: string;
};

function isAdminUser(user: Pick<User, 'account'>): boolean {
  return normalizeAccount(user.account) === 'admin';
}

function createHandoffActivity(
  leavingUser: User,
  nextOwner: string,
  reason: string,
  now: string,
): CustomerActivityRecord {
  return {
    id: `act-${uuidv4().slice(0, 8)}`,
    type: 'transfer',
    title: nextOwner === '公海' ? '离职客户释放到公海' : `离职客户交接给${nextOwner}`,
    content: reason || `原负责人${leavingUser.name}办理离职，客户归属已更新`,
    operator: getCurrentOperatorName('系统'),
    createdAt: now,
    changes: [{
      field: 'owner',
      label: '销售负责人',
      oldValue: leavingUser.name,
      newValue: nextOwner,
    }],
  };
}

function createLeadHandoffLog(
  leavingUser: User,
  nextOwner: string,
  reason: string,
  now: string,
): LeadChangeLog {
  return {
    id: `hist-${uuidv4().slice(0, 8)}`,
    action: 'update',
    operator: getCurrentOperatorName('系统'),
    changedAt: now,
    summary: reason || `离职交接：${leavingUser.name} -> ${nextOwner}`,
    changes: [
      { field: 'owner', label: '负责人', oldValue: leavingUser.name, newValue: nextOwner },
      { field: 'assignedTo', label: '分配销售', oldValue: leavingUser.name, newValue: nextOwner },
    ],
  };
}

function leadBelongsToLeavingUser(lead: Lead, leavingUserName: string, ownedCustomerIds = new Set<string>()): boolean {
  return lead.owner === leavingUserName
    || lead.assignedTo === leavingUserName
    || Boolean(lead.customerId && ownedCustomerIds.has(lead.customerId));
}

function applyLeavingUserCustomerHandoff(
  leavingUser: User,
  users: User[],
  handoff: LeaveUserCustomerHandoff = {},
): ApiResponse<null> {
  const customers = getStorageData<Customer[]>(STORAGE_KEYS.CUSTOMERS) || [];
  const ownedCustomers = customers.filter((customer) => customer.owner === leavingUser.name);
  const ownedCustomerIds = new Set(ownedCustomers.map((customer) => customer.id));
  const leads = getStorageData<Lead[]>(STORAGE_KEYS.LEADS) || [];
  const ownedLeads = leads.filter((lead) => leadBelongsToLeavingUser(lead, leavingUser.name, ownedCustomerIds));
  if (!ownedCustomers.length && !ownedLeads.length) return createSuccessResponse(null);

  if (!handoff.customerAction) {
    const parts = [
      ownedCustomers.length ? `${ownedCustomers.length} 个客户` : '',
      ownedLeads.length ? `${ownedLeads.length} 条线索` : '',
    ].filter(Boolean).join('、');
    return createErrorResponse(`该员工名下还有 ${parts}，请先选择业务交接方式`);
  }

  const now = new Date().toISOString();
  let nextOwner = '公海';
  let targetUser: User | undefined;
  if (handoff.customerAction === 'transfer') {
    targetUser = users.find((user) => (
      user.id === handoff.targetUserId
      && user.id !== leavingUser.id
      && user.isActive
      && (user.employmentStatus || 'active') === 'active'
    ));
    if (!targetUser) return createErrorResponse('请选择一个在职员工作为客户接收人');
    nextOwner = targetUser.name;
  }

  const reason = handoff.reason?.trim()
    || (handoff.customerAction === 'public_pool'
      ? `${leavingUser.name}离职，客户释放到公海`
      : `${leavingUser.name}离职，客户交接给${nextOwner}`);

  const nextCustomers = customers.map((customer) => {
    if (customer.owner !== leavingUser.name) return customer;
    const activity = createHandoffActivity(leavingUser, nextOwner, reason, now);
    if (handoff.customerAction === 'public_pool') {
      return {
        ...customer,
        owner: '公海',
        lifecycleStatusCode: LIFECYCLE_STATUS_CODES.PUBLIC_POOL,
        lifecycleStatusUpdatedAt: now,
        publicPoolAt: now,
        releasedBy: leavingUser.name,
        releaseReason: reason,
        previousOwner: leavingUser.name,
        originalSalesTransferBy: customer.originalSalesTransferBy || leavingUser.name,
        activityRecords: [activity, ...(customer.activityRecords || [])],
        updatedAt: now,
      };
    }
    return {
      ...customer,
      owner: nextOwner,
      ownerSince: now,
      previousOwner: leavingUser.name,
      originalSalesTransferBy: customer.originalSalesTransferBy || leavingUser.name,
      activityRecords: [activity, ...(customer.activityRecords || [])],
      updatedAt: now,
    };
  });
  setStorageData(STORAGE_KEYS.CUSTOMERS, nextCustomers);

  const nextLeads = leads.map((lead) => {
    if (!leadBelongsToLeavingUser(lead, leavingUser.name, ownedCustomerIds)) return lead;
    const log = createLeadHandoffLog(leavingUser, nextOwner, reason, now);
    if (handoff.customerAction === 'public_pool') {
      return {
        ...lead,
        owner: '公海',
        assignedTo: undefined,
        lifecycleStatusCode: LIFECYCLE_STATUS_CODES.PUBLIC_POOL,
        lifecycleStatusUpdatedAt: now,
        changeHistory: [log, ...(lead.changeHistory || [])],
        updatedAt: now,
      };
    }
    return {
      ...lead,
      owner: nextOwner,
      assignedTo: nextOwner,
      assignedAt: now,
      changeHistory: [log, ...(lead.changeHistory || [])],
      updatedAt: now,
    };
  });
  setStorageData(STORAGE_KEYS.LEADS, nextLeads);

  return createSuccessResponse(null);
}

async function fetchUsers(filters?: UserFilters): Promise<ApiResponse<User[]>> {
  if (shouldUseBackendApi()) {
    const response = await backendRequest<User[]>('/settings/users');
    if (response.code !== 0) return response;
    let users = response.data;
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
    if (filters?.role) users = users.filter((u) => u.role === filters.role);
    if (filters?.isActive !== undefined) users = users.filter((u) => u.isActive === filters.isActive);
    if (employmentStatus !== 'all') {
      users = users.filter((u) => (u.employmentStatus || 'active') === employmentStatus);
    }
    return createSuccessResponse(users);
  }

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

async function fetchAssignableUsers(filters?: UserFilters): Promise<ApiResponse<User[]>> {
  if (shouldUseBackendApi()) {
    const response = await backendRequest<User[]>('/settings/assignable-users');
    if (response.code !== 0) return response;
    let users = response.data;
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
    if (filters?.role) users = users.filter((u) => u.role === filters.role);
    if (filters?.isActive !== undefined) users = users.filter((u) => u.isActive === filters.isActive);
    if (employmentStatus !== 'all') {
      users = users.filter((u) => (u.employmentStatus || 'active') === employmentStatus);
    }
    return createSuccessResponse(users);
  }

  return fetchUsers({
    ...filters,
    isActive: filters?.isActive ?? true,
    employmentStatus: filters?.employmentStatus || 'active',
  });
}

async function fetchAssignableDirectory(): Promise<ApiResponse<{ users: User[]; departments: Department[]; positions: Position[] }>> {
  if (shouldUseBackendApi()) {
    return backendRequest('/settings/assignable-directory');
  }
  const organization = ensureOrganizationConfigData();
  return createSuccessResponse({
    users: ensureUsersWithAuth().filter((user) => user.isActive && (user.employmentStatus || 'active') === 'active'),
    departments: organization.departments.filter((department) => department.isActive),
    positions: organization.positions.filter((position) => position.isActive),
  });
}

async function fetchPositions(filters?: PositionFilters): Promise<ApiResponse<Position[]>> {
  if (shouldUseBackendApi()) {
    const response = await backendRequest<Position[]>('/settings/positions');
    if (response.code !== 0) return response;
    let positions = response.data;
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      positions = positions.filter((position) => (
        position.name.toLowerCase().includes(q)
        || position.code.toLowerCase().includes(q)
        || position.description?.toLowerCase().includes(q)
      ));
    }
    if (filters?.departmentId) positions = positions.filter((position) => position.departmentId === filters.departmentId);
    if (filters?.isActive !== undefined) positions = positions.filter((position) => position.isActive === filters.isActive);
    return createSuccessResponse(positions);
  }

  ensureInit();
  await delay(120);
  let positions = ensureOrganizationConfigData().positions;
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    positions = positions.filter((position) => (
      position.name.toLowerCase().includes(q)
      || position.code.toLowerCase().includes(q)
      || position.description?.toLowerCase().includes(q)
    ));
  }
  if (filters?.departmentId) positions = positions.filter((position) => position.departmentId === filters.departmentId);
  if (filters?.isActive !== undefined) positions = positions.filter((position) => position.isActive === filters.isActive);
  return createSuccessResponse(positions);
}

async function createUser(data: Omit<User, 'id' | 'createdAt' | 'updatedAt' | 'passwordHash' | 'passwordSalt' | 'passwordUpdatedAt'> & { password?: string }): Promise<ApiResponse<User | null>> {
  if (shouldUseBackendApi()) {
    return backendRequest<User | null>('/settings/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  await delay(200);
  const users = ensureUsersWithAuth();
  const now = new Date().toISOString();
  const account = normalizeAccount(data.account || data.email || data.phone);
  if (!account) return createErrorResponse('账号不能为空');
  if (!ensureUniqueAccount(users, account)) return createErrorResponse('账号已存在');
  const id = `user-${uuidv4().slice(0, 8)}`;
  const passwordFields = authApi.createUserPasswordFields(id, account, data.password || getDefaultUserPassword());
  const resolvedData = withResolvedUserOrganization(data);
  const newUser: User = {
    ...resolvedData,
    id,
    account,
    employmentStatus: data.employmentStatus || 'active',
    leftAt: data.employmentStatus === 'left' ? data.leftAt || now : undefined,
    leftBy: data.employmentStatus === 'left' ? data.leftBy : undefined,
    ...passwordFields,
    mustChangePassword: true,
    createdAt: now,
    updatedAt: now,
  };
  users.push(newUser);
  setStorageData(STORAGE_KEYS.USERS, users);
  return createSuccessResponse(newUser);
}

async function updateUser(id: string, data: Partial<User>): Promise<ApiResponse<User | null>> {
  if (shouldUseBackendApi()) {
    return backendRequest<User | null>(`/settings/users/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

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

async function leaveUser(id: string, handoff?: LeaveUserCustomerHandoff): Promise<ApiResponse<User | null>> {
  if (shouldUseBackendApi()) {
    const result = await backendRequest<User | null>(`/settings/users/${encodeURIComponent(id)}/leave`, {
      method: 'POST',
      body: JSON.stringify(handoff || {}),
    });
    if (result.code === 0 && result.data?.name) {
      await assetApi.createOffboardingTasksForEmployee(result.data.name);
    }
    return result;
  }

  await delay(150);
  const users = ensureUsersWithAuth();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) return createSuccessResponse(null);
  if (isAdminUser(users[idx])) return createErrorResponse('内置管理员账号不能办理离职');
  const handoffResult = applyLeavingUserCustomerHandoff(users[idx], users, handoff);
  if (handoffResult.code !== 0) return createErrorResponse(handoffResult.message || '请先完成客户交接');
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
  await assetApi.createOffboardingTasksForEmployee(users[idx].name);
  return createSuccessResponse(users[idx]);
}

async function countLeaveOwnedCustomers(userIds: string[]): Promise<ApiResponse<number>> {
  if (shouldUseBackendApi()) {
    return backendRequest<number>('/settings/users/leave-customer-count', {
      method: 'POST',
      body: JSON.stringify({ userIds }),
    });
  }

  await delay(80);
  const targetIds = new Set(userIds);
  const targetNames = new Set(ensureUsersWithAuth().filter((user) => targetIds.has(user.id)).map((user) => user.name));
  const customers = getStorageData<Customer[]>(STORAGE_KEYS.CUSTOMERS) || [];
  const ownedCustomers = customers.filter((customer) => targetNames.has(customer.owner));
  const ownedCustomerIds = new Set(ownedCustomers.map((customer) => customer.id));
  const leads = getStorageData<Lead[]>(STORAGE_KEYS.LEADS) || [];
  const ownedLeads = leads.filter((lead) => (
    targetNames.has(lead.owner || '')
    || targetNames.has(lead.assignedTo || '')
    || Boolean(lead.customerId && ownedCustomerIds.has(lead.customerId))
  ));
  return createSuccessResponse(ownedCustomers.length + ownedLeads.length);
}

async function restoreUser(id: string): Promise<ApiResponse<User | null>> {
  if (shouldUseBackendApi()) {
    return backendRequest<User | null>(`/settings/users/${encodeURIComponent(id)}/restore`, {
      method: 'POST',
    });
  }

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
  if (shouldUseBackendApi()) {
    return backendRequest<boolean>(`/settings/users/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

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
  if (shouldUseBackendApi()) {
    return backendRequest<User | null>(`/settings/users/${encodeURIComponent(id)}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
  }

  await delay(150);
  const users = ensureUsersWithAuth();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) return createSuccessResponse(null);
  if (!password || password.length < 6) return createErrorResponse('密码至少 6 位');
  users[idx] = {
    ...users[idx],
    ...authApi.createUserPasswordFields(id, users[idx].account || users[idx].email, password),
    mustChangePassword: true,
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
  if (shouldUseBackendApi()) {
    const stored = await fetchBackendStorageValue<OrderTypeConfig[]>(STORAGE_KEYS.ORDER_TYPE_CONFIGS);
    return createSuccessResponse(Array.isArray(stored) ? stored : []);
  }

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
  if (shouldUseBackendApi()) {
    const stored = await fetchBackendStorageValue<LifecycleStatusConfig[]>(STORAGE_KEYS.LIFECYCLE_STATUS_CONFIGS);
    return createSuccessResponse(
      Array.isArray(stored) && stored.length
        ? stored
        : DEFAULT_LIFECYCLE_STATUS_CONFIGS as unknown as LifecycleStatusConfig[],
    );
  }

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
  if (shouldUseBackendApi()) {
    const stored = await fetchBackendStorageValue<CustomerLevelConfig[]>(STORAGE_KEYS.CUSTOMER_LEVEL_CONFIGS);
    return createSuccessResponse(Array.isArray(stored) ? stored : []);
  }

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
  if (shouldUseBackendApi()) {
    const stored = await fetchBackendStorageValue<LeadSourceConfig[]>(STORAGE_KEYS.LEAD_SOURCE_CONFIGS);
    return createSuccessResponse(Array.isArray(stored) ? stored : []);
  }

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

// ---- 售后来源平台与店铺 ----

async function fetchAfterSalesSourceConfigs(): Promise<ApiResponse<AfterSalesSourceConfig[]>> {
  if (shouldUseBackendApi()) {
    const stored = await fetchBackendStorageValue<AfterSalesSourceConfig[]>(STORAGE_KEYS.AFTER_SALES_SOURCE_CONFIGS);
    return createSuccessResponse(Array.isArray(stored) ? stored : []);
  }
  ensureInit();
  return createSuccessResponse(ensureAfterSalesSourceConfigs());
}

async function createAfterSalesSourceConfig(
  data: Omit<AfterSalesSourceConfig, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<ApiResponse<AfterSalesSourceConfig | null>> {
  const configs = (await fetchAfterSalesSourceConfigs()).data;
  const name = data.name.trim();
  if (!name) return createErrorResponse(data.parentId ? '店铺名称不能为空' : '平台名称不能为空');
  if (data.parentId && !configs.some((item) => item.id === data.parentId && !item.parentId)) {
    return createErrorResponse('所属平台不存在');
  }
  if (configs.some((item) => (item.parentId || '') === (data.parentId || '') && item.name === name)) {
    return createErrorResponse(data.parentId ? '该平台下已存在同名店铺' : '平台已存在');
  }
  const now = new Date().toISOString();
  const item: AfterSalesSourceConfig = {
    ...data, name, id: `assrc-${uuidv4().slice(0, 8)}`, createdAt: now, updatedAt: now,
  };
  await setStorageData(STORAGE_KEYS.AFTER_SALES_SOURCE_CONFIGS, [...configs, item]);
  return createSuccessResponse(item);
}

async function updateAfterSalesSourceConfig(
  id: string,
  data: Partial<Omit<AfterSalesSourceConfig, 'id' | 'createdAt' | 'updatedAt'>>,
): Promise<ApiResponse<AfterSalesSourceConfig | null>> {
  const configs = (await fetchAfterSalesSourceConfigs()).data;
  const index = configs.findIndex((item) => item.id === id);
  if (index < 0) return createSuccessResponse(null);
  const name = typeof data.name === 'string' ? data.name.trim() : configs[index].name;
  if (!name) return createErrorResponse(configs[index].parentId ? '店铺名称不能为空' : '平台名称不能为空');
  const parentId = data.parentId ?? configs[index].parentId;
  if (configs.some((item) => item.id !== id && (item.parentId || '') === (parentId || '') && item.name === name)) {
    return createErrorResponse(parentId ? '该平台下已存在同名店铺' : '平台已存在');
  }
  const next = [...configs];
  next[index] = { ...configs[index], ...data, name, updatedAt: new Date().toISOString() };
  await setStorageData(STORAGE_KEYS.AFTER_SALES_SOURCE_CONFIGS, next);
  return createSuccessResponse(next[index]);
}

async function deleteAfterSalesSourceConfig(id: string): Promise<ApiResponse<boolean>> {
  const configs = (await fetchAfterSalesSourceConfigs()).data;
  if (configs.some((item) => item.parentId === id)) return createErrorResponse('请先删除该平台下的店铺');
  await setStorageData(STORAGE_KEYS.AFTER_SALES_SOURCE_CONFIGS, configs.filter((item) => item.id !== id));
  return createSuccessResponse(true);
}

export const settingsApi = {
  fetchOrganizationProfile,
  updateOrganizationProfile,
  fetchUsers,
  fetchAssignableUsers,
  fetchAssignableDirectory,
  fetchPositions,
  createUser,
  updateUser,
  leaveUser,
  countLeaveOwnedCustomers,
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
  fetchAfterSalesSourceConfigs,
  createAfterSalesSourceConfig,
  updateAfterSalesSourceConfig,
  deleteAfterSalesSourceConfig,
};
