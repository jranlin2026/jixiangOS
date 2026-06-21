import type { Department } from '../../types/department';
import type { Position } from '../../types/position';
import type { Role } from '../../types/role';
import type { User } from '../../types/settings';
import { STORAGE_KEYS } from './constants';
import { normalizeUserRoleName } from './roles';
import { getStorageData, setStorageData } from '../../api/mock/storage';

const now = '2026-06-01T00:00:00.000Z';
const ORGANIZATION_SCHEMA_VERSION = 2;
const LEADS_RECEIVE_PERMISSION = 'leads.receive';
const LEADS_ASSIGN_PERMISSION = 'leads.assign';

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
  { id: 'pos-finance-specialist', name: '财务专员', code: 'finance_specialist', departmentId: 'dept-finance', description: '收款、退款、结算和提成', sortOrder: 7, isActive: true, createdAt: now, updatedAt: now },
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
      { module: '线索', actions: ['read', 'write', 'delete'] },
      { module: LEADS_RECEIVE_PERMISSION, actions: ['read'] },
      { module: LEADS_ASSIGN_PERMISSION, actions: ['read'] },
      { module: '客户', actions: ['read', 'write'] },
      { module: '订单', actions: ['read', 'write', 'delete'] },
      { module: '提成', actions: ['read'] },
      { module: '驾驶舱', actions: ['read'] },
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
      { module: '线索', actions: ['read', 'write'] },
      { module: LEADS_RECEIVE_PERMISSION, actions: ['read'] },
      { module: '客户', actions: ['read', 'write'] },
      { module: '订单', actions: ['read', 'write'] },
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
      { module: '线索', actions: ['read', 'write'] },
      { module: '驾驶舱', actions: ['read'] },
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
      { module: '客户', actions: ['read', 'write'] },
      { module: '订单', actions: ['read'] },
      { module: '升单', actions: ['read', 'write'] },
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
      { module: '交付', actions: ['read', 'write'] },
      { module: '订单', actions: ['read'] },
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
      { module: '财务', actions: ['read', 'write'] },
      { module: '提成', actions: ['read', 'write'] },
      { module: '订单', actions: ['read'] },
      { module: '退款中心', actions: ['read', 'write'] },
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
      { module: '驾驶舱', actions: ['read'] },
      { module: 'AI助手', actions: ['read', 'write'] },
      { module: '系统设置/业务配置', actions: ['read', 'write'] },
    ],
    memberCount: 0,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
];

const POSITION_CODE_BY_ROLE_NAME: Record<string, string> = {
  超级管理员: 'general_manager',
  'Super Admin': 'general_manager',
  销售经理: 'sales_manager',
  'Sales Manager': 'sales_manager',
  销售顾问: 'sales_consultant',
  'Sales Consultant': 'sales_consultant',
  市场专员: 'market_specialist',
  客户成功: 'customer_success',
  交付工程师: 'delivery_engineer',
  财务专员: 'finance_specialist',
  运营专员: 'ops_admin',
  运营管理员: 'ops_admin',
};

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
  return merged;
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

function mergeByCode<T extends { code: string; id: string }>(existing: T[] | null | undefined, defaults: T[]): T[] {
  if (!existing?.length) return defaults;
  const next = [...existing];
  const existingKeys = new Set(existing.flatMap((item) => [item.id, normalizeCode(item.code)]));
  defaults.forEach((item) => {
    if (!existingKeys.has(item.id) && !existingKeys.has(normalizeCode(item.code))) next.push(item);
  });
  return next;
}

function sortPositions(positions: Position[]): Position[] {
  return [...positions].sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder) || a.name.localeCompare(b.name));
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
    : { items: mergeByCode(existingDepartments, DEFAULT_DEPARTMENTS), idMap: {} };

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
    : { items: sortPositions(mergeByCode(existingPositions, DEFAULT_POSITIONS)), idMap: {} };

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
    : { items: mergeByCode(existingRoles, DEFAULT_ROLES), idMap: {} };

  const departments = departmentResult.items;
  const positions = sortPositions(positionResult.items.map((position) => ({
    ...position,
    departmentId: position.departmentId ? departmentResult.idMap[position.departmentId] || position.departmentId : position.departmentId,
  })));
  const roles = rolesResult.items.map((role) => ({
    ...role,
    departmentId: role.departmentId ? departmentResult.idMap[role.departmentId] || role.departmentId : role.departmentId,
  }));

  setStorageData(STORAGE_KEYS.DEPARTMENTS, departments);
  setStorageData(STORAGE_KEYS.ROLES, roles);
  setStorageData(STORAGE_KEYS.POSITIONS, positions);
  setStorageData(STORAGE_KEYS.ORGANIZATION_SCHEMA_VERSION, ORGANIZATION_SCHEMA_VERSION);

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

export function resolvePositionForUser(
  user: Pick<User, 'role' | 'positionId' | 'positionName'>,
  positions = ensureOrganizationConfigData().positions,
): Position | undefined {
  const byExisting = positions.find((position) => position.id === user.positionId || position.name === user.positionName);
  if (byExisting) return byExisting;
  const positionCode = POSITION_CODE_BY_ROLE_NAME[normalizeUserRoleName(user.role)] || 'sales_consultant';
  return positions.find((position) => position.code === positionCode) || positions[0];
}

export function migrateUsersWithOrganization(users: User[]): User[] {
  const { departments, roles, positions, idMaps } = ensureOrganizationConfigData();
  return users.map((user) => {
    const normalizedRole = normalizeUserRoleName(user.role);
    const roleId = user.roleId ? idMaps.roles[user.roleId] || user.roleId : user.roleId;
    const positionId = user.positionId ? idMaps.positions[user.positionId] || user.positionId : user.positionId;
    const departmentId = user.departmentId ? idMaps.departments[user.departmentId] || user.departmentId : user.departmentId;
    const role = resolveRoleForUser({ role: normalizedRole, roleId }, roles);
    const position = resolvePositionForUser({ ...user, role: role?.name || normalizedRole, positionId }, positions);
    const hasValidDepartment = Boolean(departmentId && departments.some((department) => department.id === departmentId));
    return {
      ...user,
      role: role?.name || normalizedRole,
      roleId: role?.id || user.roleId,
      positionId: position?.id || user.positionId,
      positionName: position?.name || user.positionName,
      departmentId: hasValidDepartment ? departmentId : position?.departmentId,
    };
  });
}
