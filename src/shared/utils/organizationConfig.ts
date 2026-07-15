import type { Department } from '../../types/department';
import type { Position } from '../../types/position';
import type { DataScopeDomain, DataScopeLevel, Permission, Role, RoleDataScopes } from '../../types/role';
import type { OrganizationProfile, User } from '../../types/settings';
import { STORAGE_KEYS } from './constants';
import { CAPABILITY_KEYS, PERMISSION_KEYS, sanitizeRolePermissions } from './permissions';
import { normalizeUserRoleName } from './roles';
import { getStorageData, setStorageData } from '../../api/mock/storage';

const now = '2026-06-01T00:00:00.000Z';
const ORGANIZATION_SCHEMA_VERSION = 9;
const DATA_SCOPE_DOMAINS: DataScopeDomain[] = [
  'leads',
  'customers',
  'orders',
  'deliveries',
  'orderApplications',
  'recoveryOrders',
  'recoveryOrderApplications',
  'assets',
];
const DATA_SCOPE_LEVELS: DataScopeLevel[] = ['self', 'department', 'all'];

export const DEFAULT_ORGANIZATION_PROFILE: OrganizationProfile = {
  companyName: '福建极享信息科技有限公司',
};

export const DEFAULT_DEPARTMENTS: Department[] = [
  { id: 'dept-general', name: '总经办', code: 'GENERAL', memberCount: 0, isActive: true, createdAt: now, updatedAt: now },
  { id: 'dept-market', name: '市场获客部', code: 'MARKET', memberCount: 0, isActive: true, createdAt: now, updatedAt: now },
  { id: 'dept-sales', name: '销售部', code: 'SALES', memberCount: 0, isActive: true, createdAt: now, updatedAt: now },
  { id: 'dept-success', name: '客户成功部', code: 'CUSTOMER_SUCCESS', memberCount: 0, isActive: true, createdAt: now, updatedAt: now },
  { id: 'dept-delivery', name: '交付服务部', code: 'DELIVERY', memberCount: 0, isActive: true, createdAt: now, updatedAt: now },
  { id: 'dept-finance', name: '财务结算部', code: 'FINANCE', memberCount: 0, isActive: true, createdAt: now, updatedAt: now },
  { id: 'dept-ops', name: '运营管理部', code: 'OPS', memberCount: 0, isActive: true, createdAt: now, updatedAt: now },
];

export const DEFAULT_POSITIONS: Position[] = [
  { id: 'pos-general-manager', name: '总经理', code: 'general_manager', departmentId: 'dept-general', description: '公司经营管理', sortOrder: 1, isActive: true, createdAt: now, updatedAt: now },
  { id: 'pos-market-specialist', name: '市场专员', code: 'market_specialist', departmentId: 'dept-market', description: '获客渠道和线索录入', sortOrder: 2, isActive: true, createdAt: now, updatedAt: now },
  { id: 'pos-sales-manager', name: '销售经理', code: 'sales_manager', departmentId: 'dept-sales', description: '销售团队管理和线索分配', sortOrder: 3, isActive: true, createdAt: now, updatedAt: now },
  { id: 'pos-sales-consultant', name: '销售顾问', code: 'sales_consultant', departmentId: 'dept-sales', description: '客户跟进和成交转化', sortOrder: 4, isActive: true, createdAt: now, updatedAt: now },
  { id: 'pos-customer-success', name: '客户成功', code: 'customer_success', departmentId: 'dept-success', description: '客户运营、续费和复购', sortOrder: 5, isActive: true, createdAt: now, updatedAt: now },
  { id: 'pos-delivery-engineer', name: '交付工程师', code: 'delivery_engineer', departmentId: 'dept-delivery', description: '项目部署和服务交付', sortOrder: 6, isActive: true, createdAt: now, updatedAt: now },
  { id: 'pos-finance-specialist', name: '财务专员', code: 'finance_specialist', departmentId: 'dept-finance', description: '收款、退款、结算和分账', sortOrder: 7, isActive: true, createdAt: now, updatedAt: now },
  { id: 'pos-ops-admin', name: '运营管理员', code: 'ops_admin', departmentId: 'dept-ops', description: '系统运营和业务配置', sortOrder: 8, isActive: true, createdAt: now, updatedAt: now },
];

const ASSET_SELF_SERVICE_PERMISSIONS: Role['permissions'] = [
  { module: PERMISSION_KEYS.ASSETS_OVERVIEW, actions: ['read'] },
  { module: PERMISSION_KEYS.ASSETS_DEVICES, actions: ['read'] },
  { module: PERMISSION_KEYS.ASSETS_PHONES, actions: ['read'] },
  { module: PERMISSION_KEYS.ASSETS_ACCOUNTS, actions: ['read'] },
  { module: PERMISSION_KEYS.ASSETS_MATRIX_PUBLISH, actions: ['read'] },
  { module: PERMISSION_KEYS.ASSETS_RISKS, actions: ['read'] },
  { module: PERMISSION_KEYS.ASSETS_LOGS, actions: ['read'] },
  { module: PERMISSION_KEYS.ASSETS_OFFBOARDING, actions: ['read'] },
];

const ASSET_SELF_SERVICE_PERMISSION_KEYS = new Set(ASSET_SELF_SERVICE_PERMISSIONS.map((permission) => permission.module));

const CO_CREATION_EMPLOYEE_PERMISSION: Permission = {
  module: PERMISSION_KEYS.CO_CREATION_SUBMIT,
  actions: ['read', 'write'],
};

export const DEFAULT_ROLES: Role[] = [
  {
    id: 'role-super-admin',
    name: '超级管理员',
    code: 'super_admin',
    departmentId: 'dept-general',
    permissions: [{ module: '全部', actions: ['read', 'write', 'delete', 'admin'] }],
    dataScopes: { leads: 'all', customers: 'all', orders: 'all', orderApplications: 'all', assets: 'all' },
    memberCount: 0,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'role-sales-manager',
    name: '销售经理',
    code: 'sales_manager',
    departmentId: 'dept-sales',
    permissions: [
      { module: PERMISSION_KEYS.LEADS, actions: ['read', 'write', 'delete'] },
      { module: CAPABILITY_KEYS.LEADS_RECEIVE, actions: ['read'] },
      { module: CAPABILITY_KEYS.LEADS_ASSIGN, actions: ['read'] },
      { module: PERMISSION_KEYS.CUSTOMERS, actions: ['read', 'write'] },
      { module: PERMISSION_KEYS.CUSTOMER_PUBLIC_POOL_CLAIM, actions: ['read', 'write'] },
      { module: PERMISSION_KEYS.ORDER_MANAGE, actions: ['read', 'write', 'delete'] },
      { module: PERMISSION_KEYS.ORDER_REVIEW_LIST, actions: ['read'] },
      { module: PERMISSION_KEYS.ORDER_CREATE, actions: ['read', 'write'] },
      { module: PERMISSION_KEYS.ORDER_EDIT, actions: ['read', 'write'] },
      { module: PERMISSION_KEYS.ORDER_DELETE, actions: ['read', 'delete'] },
      { module: PERMISSION_KEYS.ORDER_HISTORY, actions: ['read'] },
      { module: PERMISSION_KEYS.FINANCE_MY_COMMISSION, actions: ['read'] },
      { module: PERMISSION_KEYS.DASHBOARD, actions: ['read'] },
      CO_CREATION_EMPLOYEE_PERMISSION,
      { module: PERMISSION_KEYS.CO_CREATION_SUPERVISE, actions: ['read', 'write'] },
      ...ASSET_SELF_SERVICE_PERMISSIONS,
    ],
    dataScopes: { leads: 'department', customers: 'department', orders: 'department', orderApplications: 'department', assets: 'department' },
    memberCount: 0,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'role-sales-consultant',
    name: '销售顾问',
    code: 'sales_consultant',
    departmentId: 'dept-sales',
    permissions: [
      { module: PERMISSION_KEYS.LEADS, actions: ['read', 'write'] },
      { module: CAPABILITY_KEYS.LEADS_RECEIVE, actions: ['read'] },
      { module: PERMISSION_KEYS.CUSTOMERS, actions: ['read', 'write'] },
      { module: PERMISSION_KEYS.CUSTOMER_PUBLIC_POOL_CLAIM, actions: ['read', 'write'] },
      { module: PERMISSION_KEYS.ORDER_MANAGE, actions: ['read', 'write'] },
      { module: PERMISSION_KEYS.ORDER_REVIEW_LIST, actions: ['read'] },
      { module: PERMISSION_KEYS.ORDER_CREATE, actions: ['read', 'write'] },
      { module: PERMISSION_KEYS.ORDER_EDIT, actions: ['read', 'write'] },
      { module: PERMISSION_KEYS.FINANCE_MY_COMMISSION, actions: ['read'] },
      CO_CREATION_EMPLOYEE_PERMISSION,
      ...ASSET_SELF_SERVICE_PERMISSIONS,
    ],
    dataScopes: { leads: 'self', customers: 'self', orders: 'self', orderApplications: 'self', assets: 'self' },
    memberCount: 0,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'role-market-specialist',
    name: '市场专员',
    code: 'market_specialist',
    departmentId: 'dept-market',
    permissions: [
      { module: PERMISSION_KEYS.LEADS_DETAIL, actions: ['read'] },
      { module: PERMISSION_KEYS.LEADS_CREATE, actions: ['read', 'write'] },
      { module: PERMISSION_KEYS.LEADS_INTAKE_STATUS, actions: ['read'] },
      { module: PERMISSION_KEYS.FINANCE_MY_COMMISSION, actions: ['read'] },
      { module: PERMISSION_KEYS.DASHBOARD, actions: ['read'] },
      { module: PERMISSION_KEYS.GEO, actions: ['read', 'write'] },
      CO_CREATION_EMPLOYEE_PERMISSION,
      ...ASSET_SELF_SERVICE_PERMISSIONS.filter((permission) => permission.module !== PERMISSION_KEYS.ASSETS_MATRIX_PUBLISH),
      { module: PERMISSION_KEYS.ASSETS_MATRIX_PUBLISH, actions: ['read', 'write'] },
    ],
    dataScopes: { leads: 'self', customers: 'self', orders: 'self', orderApplications: 'self', assets: 'self' },
    memberCount: 0,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'role-customer-success',
    name: '客户成功',
    code: 'customer_success',
    departmentId: 'dept-success',
    permissions: [
      { module: PERMISSION_KEYS.CUSTOMERS, actions: ['read', 'write'] },
      { module: PERMISSION_KEYS.ORDER_MANAGE, actions: ['read'] },
      { module: PERMISSION_KEYS.ORDER_REVIEW_LIST, actions: ['read'] },
      { module: PERMISSION_KEYS.FINANCE_MY_COMMISSION, actions: ['read'] },
      CO_CREATION_EMPLOYEE_PERMISSION,
      ...ASSET_SELF_SERVICE_PERMISSIONS,
    ],
    dataScopes: { leads: 'self', customers: 'self', orders: 'self', orderApplications: 'self', assets: 'self' },
    memberCount: 0,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'role-delivery-engineer',
    name: '交付工程师',
    code: 'delivery_engineer',
    departmentId: 'dept-delivery',
    permissions: [
      { module: PERMISSION_KEYS.DELIVERY, actions: ['read', 'write'] },
      { module: PERMISSION_KEYS.ORDER_MANAGE, actions: ['read'] },
      { module: PERMISSION_KEYS.ORDER_REVIEW_LIST, actions: ['read'] },
      { module: PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE, actions: ['read', 'write'] },
      { module: PERMISSION_KEYS.FINANCE_MY_COMMISSION, actions: ['read'] },
      CO_CREATION_EMPLOYEE_PERMISSION,
      ...ASSET_SELF_SERVICE_PERMISSIONS,
    ],
    dataScopes: { leads: 'self', customers: 'self', orders: 'self', orderApplications: 'self', assets: 'self' },
    memberCount: 0,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'role-finance-specialist',
    name: '财务专员',
    code: 'finance_specialist',
    departmentId: 'dept-finance',
    permissions: [
      { module: PERMISSION_KEYS.FINANCE_SETTLEMENT, actions: ['read', 'write'] },
      { module: PERMISSION_KEYS.FINANCE_RECOVERY_SETTLEMENT, actions: ['read', 'write'] },
      { module: PERMISSION_KEYS.FINANCE_PAYOUT, actions: ['read', 'write'] },
      { module: PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW_LIST, actions: ['read'] },
      { module: PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW, actions: ['read', 'write'] },
      { module: PERMISSION_KEYS.FINANCE_FLOW, actions: ['read', 'write'] },
      { module: PERMISSION_KEYS.FINANCE_RULES, actions: ['read', 'write'] },
      { module: PERMISSION_KEYS.ECOMMERCE_SETTLEMENT, actions: ['read', 'write'] },
      { module: PERMISSION_KEYS.ORDERS, actions: ['read'] },
      { module: PERMISSION_KEYS.ORDER_REVIEW_LIST, actions: ['read'] },
      { module: PERMISSION_KEYS.ORDER_REVIEW, actions: ['read', 'write'] },
      CO_CREATION_EMPLOYEE_PERMISSION,
      ...ASSET_SELF_SERVICE_PERMISSIONS,
    ],
    dataScopes: { leads: 'self', customers: 'self', orders: 'all', orderApplications: 'all', assets: 'self' },
    memberCount: 0,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'role-ops-admin',
    name: '运营管理员',
    code: 'ops_admin',
    departmentId: 'dept-ops',
    permissions: [
      { module: PERMISSION_KEYS.DASHBOARD, actions: ['read'] },
      { module: PERMISSION_KEYS.AI_ASSISTANT, actions: ['read', 'write'] },
      { module: PERMISSION_KEYS.SETTINGS_PRODUCTS, actions: ['read', 'write'] },
      { module: PERMISSION_KEYS.SETTINGS_ORDER_TYPES, actions: ['read', 'write'] },
      { module: PERMISSION_KEYS.SETTINGS_CUSTOMER_LEVELS, actions: ['read', 'write'] },
      { module: PERMISSION_KEYS.SETTINGS_LIFECYCLE, actions: ['read', 'write'] },
      { module: PERMISSION_KEYS.SETTINGS_LEAD_SOURCES, actions: ['read', 'write'] },
      { module: PERMISSION_KEYS.SETTINGS_LEAD_FLOW, actions: ['read', 'write'] },
      { module: PERMISSION_KEYS.GEO, actions: ['read', 'write'] },
      { module: PERMISSION_KEYS.ECOMMERCE_SETTLEMENT, actions: ['read', 'write'] },
      { module: PERMISSION_KEYS.ASSETS, actions: ['read', 'write'] },
      CO_CREATION_EMPLOYEE_PERMISSION,
      { module: PERMISSION_KEYS.CO_CREATION_DECIDE, actions: ['read', 'write'] },
      { module: PERMISSION_KEYS.CO_CREATION_VALIDATE, actions: ['read', 'write'] },
    ],
    dataScopes: { leads: 'self', customers: 'self', orders: 'self', orderApplications: 'self', assets: 'all' },
    memberCount: 0,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
];

const ROLE_CODE_BY_NAME: Record<string, string> = {
  超级管理员: 'super_admin',
  管理员: 'super_admin',
  系统管理员: 'super_admin',
  'Super Admin': 'super_admin',
  销售经理: 'sales_manager',
  'Sales Manager': 'sales_manager',
  销售顾问: 'sales_consultant',
  'Sales Consultant': 'sales_consultant',
  销售: 'sales_consultant',
  市场专员: 'market_specialist',
  客户成功: 'customer_success',
  交付工程师: 'delivery_engineer',
  财务专员: 'finance_specialist',
  财务: 'finance_specialist',
  运营专员: 'ops_admin',
  运营管理员: 'ops_admin',
  运营: 'ops_admin',
};

function normalizeCode(value?: string): string {
  return String(value || '').trim().toLowerCase();
}

function isDataScopeLevel(value: unknown): value is DataScopeLevel {
  return DATA_SCOPE_LEVELS.includes(value as DataScopeLevel);
}

function buildDataScopes(
  leads: DataScopeLevel,
  customers: DataScopeLevel,
  orders: DataScopeLevel,
  orderApplications: DataScopeLevel,
  recoveryOrders: DataScopeLevel = orders,
  recoveryOrderApplications: DataScopeLevel = orderApplications,
  assets: DataScopeLevel = customers,
  deliveries: DataScopeLevel = orders,
): Required<Record<DataScopeDomain, DataScopeLevel>> {
  return { leads, customers, orders, deliveries, orderApplications, recoveryOrders, recoveryOrderApplications, assets };
}

function defaultRoleDataScopes(code?: string): Required<Record<DataScopeDomain, DataScopeLevel>> {
  const normalizedCode = normalizeCode(code);
  if (normalizedCode === 'super_admin') {
    return buildDataScopes('all', 'all', 'all', 'all');
  }
  if (normalizedCode === 'sales_manager') {
    return buildDataScopes('department', 'department', 'department', 'department');
  }
  if (normalizedCode === 'finance_specialist') {
    return buildDataScopes('self', 'self', 'all', 'all');
  }
  if (normalizedCode === 'ops_admin') {
    return buildDataScopes('self', 'self', 'self', 'self', 'self', 'self', 'all');
  }
  return buildDataScopes('self', 'self', 'self', 'self');
}

function hasRecoveryReviewListPermission(role: { permissions?: Role['permissions'] }): boolean {
  return Boolean(role.permissions?.some((permission) => [
    PERMISSION_KEYS.AFTER_SALES,
    PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW_LIST,
    '售后服务/售后挽回订单/审核挽回订单',
  ].includes(permission.module)));
}

export function normalizeRoleDataScopes(role: Pick<Role, 'code'> & { dataScopes?: RoleDataScopes; permissions?: Role['permissions'] }): Required<Record<DataScopeDomain, DataScopeLevel>> {
  const defaults = defaultRoleDataScopes(role.code);
  if (normalizeCode(role.code) === 'super_admin') return defaults;
  return DATA_SCOPE_DOMAINS.reduce((acc, domain) => {
    const value = role.dataScopes?.[domain];
    acc[domain] = isDataScopeLevel(value)
      ? value
      : domain === 'deliveries' && isDataScopeLevel(role.dataScopes?.orders)
        ? role.dataScopes.orders
      : domain === 'recoveryOrderApplications' && hasRecoveryReviewListPermission(role)
        ? 'all'
        : defaults[domain];
    return acc;
  }, { ...defaults });
}

function stripLeadSalesAssignmentPermissions(permissions: Role['permissions'] = []): Role['permissions'] {
  const blocked = new Set<string>([
    PERMISSION_KEYS.LEADS,
    PERMISSION_KEYS.LEADS_LIST,
    PERMISSION_KEYS.LEADS_FOLLOW,
    PERMISSION_KEYS.LEADS_FLOW_CONFIG,
    PERMISSION_KEYS.LEADS_CONVERT,
    CAPABILITY_KEYS.LEADS_RECEIVE,
    CAPABILITY_KEYS.LEADS_ASSIGN,
  ]);
  return permissions.filter((permission) => !blocked.has(permission.module));
}

function normalizeDefaultAssetSelfServicePermissions(permissions: Role['permissions'] = []): Role['permissions'] {
  const hasAssetSelfServicePermission = permissions.some((permission) => ASSET_SELF_SERVICE_PERMISSION_KEYS.has(permission.module));
  const normalized = permissions.map((permission) => (
    ASSET_SELF_SERVICE_PERMISSION_KEYS.has(permission.module)
      && permission.module !== PERMISSION_KEYS.ASSETS_MATRIX_PUBLISH
      ? { ...permission, actions: ['read'] }
      : permission
  ));
  if (!hasAssetSelfServicePermission) return normalized;
  const existingModules = new Set(normalized.map((permission) => permission.module));
  return [
    ...normalized,
    ...ASSET_SELF_SERVICE_PERMISSIONS.filter((permission) => !existingModules.has(permission.module)),
  ];
}

function ensureDefaultRoleRequiredPermissions(
  permissions: Role['permissions'] = [],
  code?: string,
): Role['permissions'] {
  if (normalizeCode(code) !== 'finance_specialist') return permissions;
  const required = new Map<string, string[]>([
    [PERMISSION_KEYS.ORDER_REVIEW_LIST, ['read']],
    [PERMISSION_KEYS.ORDER_REVIEW, ['read', 'write']],
  ]);
  const normalized = permissions.map((permission) => {
    const requiredActions = required.get(permission.module);
    if (!requiredActions) return permission;
    required.delete(permission.module);
    return { ...permission, actions: Array.from(new Set([...(permission.actions || []), ...requiredActions])) };
  });
  required.forEach((actions, module) => normalized.push({ module, actions }));
  return normalized;
}

function migrateLegacyOrderReviewListPermission(permissions: Role['permissions'] = []): Role['permissions'] {
  const legacyCombinedPermissions = permissions.filter((permission) => permission.module === '订单/订单审核台');
  if (legacyCombinedPermissions.length) {
    const legacyActions = Array.from(new Set(legacyCombinedPermissions.flatMap((permission) => permission.actions || ['read'])));
    const withoutLegacy = permissions.filter((permission) => permission.module !== '订单/订单审核台');
    const hasReviewList = withoutLegacy.some((permission) => permission.module === PERMISSION_KEYS.ORDER_REVIEW_LIST);
    const existingReviewAction = withoutLegacy.find((permission) => permission.module === PERMISSION_KEYS.ORDER_REVIEW);
    const migrated = withoutLegacy.map((permission) => (
      permission.module === PERMISSION_KEYS.ORDER_REVIEW
        ? { ...permission, actions: Array.from(new Set([...(permission.actions || []), ...legacyActions])) }
        : permission
    ));
    if (!hasReviewList) migrated.push({ module: PERMISSION_KEYS.ORDER_REVIEW_LIST, actions: ['read'] });
    if (!existingReviewAction) migrated.push({ module: PERMISSION_KEYS.ORDER_REVIEW, actions: legacyActions });
    return migrated;
  }
  if (permissions.some((permission) => permission.module === PERMISSION_KEYS.ORDER_REVIEW_LIST)) {
    return permissions;
  }
  const previousReviewListModules = new Set<string>([
    PERMISSION_KEYS.ORDER_REVIEW,
    PERMISSION_KEYS.ORDER_MANAGE,
    PERMISSION_KEYS.ORDER_CREATE,
  ]);
  const previouslyCouldReadReviewList = permissions.some((permission) => (
    previousReviewListModules.has(permission.module)
    && (permission.actions || []).some((action) => ['read', 'write', 'delete', 'admin'].includes(action))
  ));
  return previouslyCouldReadReviewList
    ? [...permissions, { module: PERMISSION_KEYS.ORDER_REVIEW_LIST, actions: ['read'] }]
    : permissions;
}

function migrateLegacyRecoveryReviewListPermission(permissions: Role['permissions'] = []): Role['permissions'] {
  if (permissions.some((permission) => permission.module === PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW_LIST)) {
    return permissions;
  }
  const hadCombinedReviewPermission = permissions.some((permission) => [
    PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW,
    '售后服务/售后挽回订单/审核挽回订单',
  ].includes(permission.module) && (permission.actions || []).some((action) => ['read', 'write', 'delete', 'admin'].includes(action)));
  return hadCombinedReviewPermission
    ? [...permissions, { module: PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW_LIST, actions: ['read'] }]
    : permissions;
}

export function mergeRoleWithDefaultAccess(role: Role): Role {
  const seed = DEFAULT_ROLES.find((item) => (
    item.id === role.id
    || normalizeCode(item.code) === normalizeCode(role.code)
    || item.name === role.name
  ));
  const code = seed?.code || role.code;
  const permissions = seed?.code === 'super_admin'
    ? seed.permissions
    : sanitizeRolePermissions(ensureDefaultRoleRequiredPermissions(
      normalizeDefaultAssetSelfServicePermissions(role.permissions),
      code,
    ));

  return {
    ...role,
    code,
    permissions,
    dataScopes: normalizeRoleDataScopes({ ...role, code, permissions }),
  };
}

function mergeDefaultItems<T extends { code: string; id: string; name: string }>(
  existing: T[] | null | undefined,
  defaults: T[],
  onMerge?: (current: T, seed: T) => T,
): { items: T[]; idMap: Record<string, string> } {
  if (!existing?.length) return { items: defaults, idMap: {} };
  const used = new Set<string>();
  const idMap: Record<string, string> = {};
  const next: T[] = defaults.map((seed) => {
    const currentIndex = existing.findIndex((item) => (
      !used.has(item.id)
      && (item.id === seed.id || normalizeCode(item.code) === normalizeCode(seed.code))
    ));
    if (currentIndex === -1) return seed;
    const current = existing[currentIndex];
    used.add(current.id);
    if (current.id !== seed.id) idMap[current.id] = seed.id;
    return onMerge ? onMerge(current, seed) : { ...current, id: seed.id, code: seed.code, name: seed.name };
  });
  existing.forEach((item) => {
    if (!used.has(item.id) && !defaults.some((seed) => seed.id === item.id || normalizeCode(seed.code) === normalizeCode(item.code))) {
      next.push(item);
    }
  });
  return { items: next, idMap };
}

function keepExistingOrDefaults<T>(existing: T[] | null | undefined, defaults: T[]): T[] {
  return existing ?? defaults;
}

function sortPositions(positions: Position[]): Position[] {
  return [...positions].sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder) || a.name.localeCompare(b.name));
}

function migrateStoredUsersWithIdMaps(
  users: User[] | null | undefined,
  roles: Role[],
  idMaps: { roles: Record<string, string> },
): User[] | null {
  if (!users?.length) return null;
  return users.map((user) => {
    const roleId = user.roleId ? idMaps.roles[user.roleId] || user.roleId : user.roleId;
    const role = resolveRoleForUser({ role: user.role, roleId }, roles);
    return {
      ...user,
      role: role?.name || normalizeUserRoleName(user.role),
      roleId: role?.id || roleId,
      employmentStatus: user.employmentStatus || 'active',
    };
  });
}

export function sortDepartments(departments: Department[]): Department[] {
  return [...departments].sort((a, b) => {
    if ((a.parentId || '') !== (b.parentId || '')) return (a.parentId || '').localeCompare(b.parentId || '');
    return Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || a.name.localeCompare(b.name);
  });
}

function normalizeDepartmentSortOrders(departments: Department[]): Department[] {
  const byParent = new Map<string, Department[]>();
  departments.forEach((department, index) => {
    const key = department.parentId || '';
    const item = { ...department, sortOrder: Number(department.sortOrder || index + 1) };
    byParent.set(key, [...(byParent.get(key) || []), item]);
  });
  return Array.from(byParent.values()).flatMap((siblings) => (
    [...siblings]
      .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || a.name.localeCompare(b.name))
      .map((department, index) => ({ ...department, sortOrder: index + 1 }))
  ));
}

export function getDepartmentAncestorIds(departments: Department[], departmentId?: string): string[] {
  const ancestors: string[] = [];
  let current = departments.find((department) => department.id === departmentId);
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    ancestors.push(current.id);
    visited.add(current.id);
    current = current.parentId ? departments.find((department) => department.id === current?.parentId) : undefined;
  }
  return ancestors;
}

export function getDepartmentDescendantIds(departments: Department[], departmentId: string): string[] {
  const children = departments.filter((department) => department.parentId === departmentId);
  return children.flatMap((department) => [department.id, ...getDepartmentDescendantIds(departments, department.id)]);
}

export function isDepartmentDescendantOf(departments: Department[], childId: string, parentId: string): boolean {
  return getDepartmentAncestorIds(departments, childId).includes(parentId);
}

export function getOrganizationProfile(): OrganizationProfile {
  const existing = getStorageData<OrganizationProfile>(STORAGE_KEYS.ORGANIZATION_PROFILE);
  const companyName = String(existing?.companyName || '').trim() || DEFAULT_ORGANIZATION_PROFILE.companyName;
  const profile = { ...DEFAULT_ORGANIZATION_PROFILE, ...existing, companyName };
  setStorageData(STORAGE_KEYS.ORGANIZATION_PROFILE, profile, { persist: false });
  return profile;
}

export function ensureOrganizationConfigData() {
  const storedVersion = Number(getStorageData<number>(STORAGE_KEYS.ORGANIZATION_SCHEMA_VERSION) || 0);
  const existingDepartments = getStorageData<Department[]>(STORAGE_KEYS.DEPARTMENTS);
  const existingRoles = getStorageData<Role[]>(STORAGE_KEYS.ROLES);
  const existingPositions = getStorageData<Position[]>(STORAGE_KEYS.POSITIONS);

  const departmentResult = storedVersion < ORGANIZATION_SCHEMA_VERSION
    ? mergeDefaultItems(existingDepartments, DEFAULT_DEPARTMENTS, (current, seed) => ({
      ...current,
      id: seed.id,
      code: seed.code,
      name: seed.name,
      isActive: current.isActive ?? seed.isActive,
      createdAt: current.createdAt || seed.createdAt,
      updatedAt: new Date().toISOString(),
    }))
    : { items: keepExistingOrDefaults(existingDepartments, DEFAULT_DEPARTMENTS), idMap: {} };

  const positionResult = storedVersion < ORGANIZATION_SCHEMA_VERSION
    ? mergeDefaultItems(existingPositions, DEFAULT_POSITIONS, (current, seed) => ({
      ...current,
      id: seed.id,
      code: seed.code,
      name: seed.name,
      departmentId: current.departmentId ? departmentResult.idMap[current.departmentId] || current.departmentId : seed.departmentId,
      sortOrder: seed.sortOrder,
      isActive: current.isActive ?? seed.isActive,
      createdAt: current.createdAt || seed.createdAt,
      updatedAt: new Date().toISOString(),
    }))
    : { items: sortPositions(keepExistingOrDefaults(existingPositions, DEFAULT_POSITIONS)), idMap: {} };

  const rolesResult = storedVersion < ORGANIZATION_SCHEMA_VERSION
    ? mergeDefaultItems(existingRoles, DEFAULT_ROLES, (current, seed) => ({
      ...current,
      id: seed.id,
      code: seed.code,
      name: seed.name,
      departmentId: current.departmentId ? departmentResult.idMap[current.departmentId] || current.departmentId : seed.departmentId,
      permissions: seed.code === 'super_admin'
        ? seed.permissions
        : sanitizeRolePermissions(normalizeDefaultAssetSelfServicePermissions(
          [
            ...(seed.code === 'market_specialist'
              ? stripLeadSalesAssignmentPermissions(current.permissions)
              : current.permissions),
            ...seed.permissions,
          ],
        )),
      isActive: seed.code === 'super_admin' ? true : (current.isActive ?? seed.isActive),
      createdAt: current.createdAt || seed.createdAt,
      updatedAt: new Date().toISOString(),
    }))
    : { items: keepExistingOrDefaults(existingRoles, DEFAULT_ROLES), idMap: {} };

  const departments = sortDepartments(normalizeDepartmentSortOrders(departmentResult.items));
  const positions = sortPositions(positionResult.items.map((position) => ({
    ...position,
    departmentId: position.departmentId ? departmentResult.idMap[position.departmentId] || position.departmentId : position.departmentId,
  })));
  const roles = rolesResult.items.map((role) => mergeRoleWithDefaultAccess({
    ...role,
    permissions: storedVersion < ORGANIZATION_SCHEMA_VERSION
      ? migrateLegacyOrderReviewListPermission(migrateLegacyRecoveryReviewListPermission(role.permissions))
      : role.permissions,
    departmentId: role.departmentId ? departmentResult.idMap[role.departmentId] || role.departmentId : role.departmentId,
  }));
  const migratedUsers = storedVersion < ORGANIZATION_SCHEMA_VERSION
    ? migrateStoredUsersWithIdMaps(getStorageData<User[]>(STORAGE_KEYS.USERS), roles, { roles: rolesResult.idMap })
    : null;

  // This helper runs during ordinary page reads (for example, the sidebar).
  // Keep its normalization local so employees never attempt administrator-only writes.
  setStorageData(STORAGE_KEYS.DEPARTMENTS, departments, { persist: false });
  setStorageData(STORAGE_KEYS.ROLES, roles, { persist: false });
  setStorageData(STORAGE_KEYS.POSITIONS, positions, { persist: false });
  if (migratedUsers) setStorageData(STORAGE_KEYS.USERS, migratedUsers, { persist: false });
  setStorageData(STORAGE_KEYS.ORGANIZATION_SCHEMA_VERSION, ORGANIZATION_SCHEMA_VERSION, { persist: false });
  getOrganizationProfile();

  return {
    departments,
    roles,
    positions,
    idMaps: {
      departments: departmentResult.idMap,
      positions: positionResult.idMap,
      roles: rolesResult.idMap,
    },
  };
}

export function resolveRoleForUser(user: Pick<User, 'role' | 'roleId'>, roles = ensureOrganizationConfigData().roles): Role | undefined {
  const normalizedRole = normalizeUserRoleName(user.role);
  const roleCode = ROLE_CODE_BY_NAME[normalizedRole] || normalizeCode(normalizedRole);
  return roles.find((role) => role.id === user.roleId || role.name === normalizedRole || normalizeCode(role.code) === roleCode);
}

export function migrateUsersWithOrganization(users: User[]): User[] {
  const { departments, roles, idMaps } = ensureOrganizationConfigData();
  return users.map((user) => {
    const normalizedRole = normalizeUserRoleName(user.role);
    const roleId = user.roleId ? idMaps.roles[user.roleId] || user.roleId : user.roleId;
    const departmentId = user.departmentId ? idMaps.departments[user.departmentId] || user.departmentId : user.departmentId;
    const role = resolveRoleForUser({ role: normalizedRole, roleId }, roles);
    const hasValidDepartment = Boolean(departmentId && departments.some((department) => department.id === departmentId));
    const positionName = user.positionId
      ? undefined
      : (typeof user.positionName === 'string' ? user.positionName.trim() || undefined : user.positionName);
    return {
      ...user,
      role: role?.name || normalizedRole,
      roleId: role?.id || user.roleId,
      positionId: undefined,
      positionName,
      departmentId: hasValidDepartment ? departmentId : undefined,
      employmentStatus: user.employmentStatus || 'active',
    };
  });
}
