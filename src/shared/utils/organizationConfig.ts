import type { Department } from '../../types/department';
import type { Position } from '../../types/position';
import type { Role } from '../../types/role';
import type { OrganizationProfile, User } from '../../types/settings';
import { STORAGE_KEYS } from './constants';
import { CAPABILITY_KEYS, PERMISSION_KEYS, sanitizeRolePermissions } from './permissions';
import { normalizeUserRoleName } from './roles';
import { getStorageData, setStorageData } from '../../api/mock/storage';

const now = '2026-06-01T00:00:00.000Z';
const ORGANIZATION_SCHEMA_VERSION = 3;

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

export const DEFAULT_ROLES: Role[] = [
  {
    id: 'role-super-admin',
    name: '超级管理员',
    code: 'super_admin',
    departmentId: 'dept-general',
    permissions: [{ module: '全部', actions: ['read', 'write', 'delete', 'admin'] }],
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
      { module: PERMISSION_KEYS.ORDER_MANAGE, actions: ['read', 'write', 'delete'] },
      { module: PERMISSION_KEYS.ORDER_CREATE, actions: ['read', 'write'] },
      { module: PERMISSION_KEYS.ORDER_EDIT, actions: ['read', 'write'] },
      { module: PERMISSION_KEYS.ORDER_DELETE, actions: ['read', 'delete'] },
      { module: PERMISSION_KEYS.ORDER_HISTORY, actions: ['read'] },
      { module: PERMISSION_KEYS.DASHBOARD, actions: ['read'] },
    ],
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
      { module: PERMISSION_KEYS.ORDER_MANAGE, actions: ['read', 'write'] },
      { module: PERMISSION_KEYS.ORDER_CREATE, actions: ['read', 'write'] },
      { module: PERMISSION_KEYS.ORDER_EDIT, actions: ['read', 'write'] },
    ],
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
      { module: PERMISSION_KEYS.LEADS, actions: ['read', 'write'] },
      { module: PERMISSION_KEYS.DASHBOARD, actions: ['read'] },
    ],
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
      { module: PERMISSION_KEYS.UPGRADE_CENTER, actions: ['read', 'write'] },
    ],
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
    ],
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
      { module: PERMISSION_KEYS.FINANCE_OVERVIEW, actions: ['read', 'write'] },
      { module: PERMISSION_KEYS.FINANCE_SETTLEMENT, actions: ['read', 'write'] },
      { module: PERMISSION_KEYS.FINANCE_PAYOUT, actions: ['read', 'write'] },
      { module: PERMISSION_KEYS.FINANCE_REFUND, actions: ['read', 'write'] },
      { module: PERMISSION_KEYS.FINANCE_FLOW, actions: ['read', 'write'] },
      { module: PERMISSION_KEYS.FINANCE_RULES, actions: ['read', 'write'] },
      { module: PERMISSION_KEYS.ORDERS, actions: ['read'] },
    ],
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
    ],
    memberCount: 0,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
];

const ROLE_CODE_BY_NAME: Record<string, string> = {
  超级管理员: 'super_admin',
  管理员: 'super_admin',
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

function mergePermissions(existing: Role['permissions'] = [], required: Role['permissions'] = []): Role['permissions'] {
  const merged = [...existing];
  required.forEach((permission) => {
    const found = merged.find((item) => item.module === permission.module);
    if (!found) {
      merged.push(permission);
      return;
    }
    found.actions = Array.from(new Set([...(found.actions || []), ...permission.actions]));
  });
  return sanitizeRolePermissions(merged);
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
  setStorageData(STORAGE_KEYS.ORGANIZATION_PROFILE, profile);
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
      departmentId: departmentResult.idMap[current.departmentId || ''] || seed.departmentId,
      permissions: seed.code === 'super_admin' ? seed.permissions : mergePermissions(current.permissions, seed.permissions),
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
  const roles = rolesResult.items.map((role) => ({
    ...role,
    departmentId: role.departmentId ? departmentResult.idMap[role.departmentId] || role.departmentId : role.departmentId,
    permissions: sanitizeRolePermissions(role.permissions),
  }));

  setStorageData(STORAGE_KEYS.DEPARTMENTS, departments);
  setStorageData(STORAGE_KEYS.ROLES, roles);
  setStorageData(STORAGE_KEYS.POSITIONS, positions);
  setStorageData(STORAGE_KEYS.ORGANIZATION_SCHEMA_VERSION, ORGANIZATION_SCHEMA_VERSION);
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
