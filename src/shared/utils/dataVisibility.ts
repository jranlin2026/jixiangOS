import type { AuthSession } from '../../types/auth';
import type { Customer } from '../../types/customer';
import type { Department } from '../../types/department';
import type { Lead } from '../../types/lead';
import type { Order } from '../../types/order';
import type { Role } from '../../types/role';
import type { User } from '../../types/settings';
import { AUTH_SESSION_STORAGE_KEY } from './auth';
import { LIFECYCLE_STATUS_CODES, STORAGE_KEYS, normalizeLifecycleStatusCode } from './constants';
import { isSalesRoleName, normalizeUserRoleName } from './roles';

export interface DataVisibilityScope {
  unrestricted: boolean;
  currentUser?: User;
  visibleUserIds: string[];
  visibleUserNames: string[];
  canViewPublicPool: boolean;
  roleCode?: string;
}

function readLocalStorageJson<T>(key: string): T | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function cleanText(value?: string | null): string {
  return String(value || '').trim();
}

function isSessionValid(session: AuthSession | null): session is AuthSession {
  if (!session?.userId) return false;
  if (!session.expiresAt) return true;
  return new Date(session.expiresAt).getTime() > Date.now();
}

function getRole(user: User, roles: Role[]): Role | undefined {
  const normalizedRole = normalizeUserRoleName(user.role);
  return roles.find((role) => (
    role.isActive
    && (
      role.id === user.roleId
      || role.name === normalizedRole
      || role.name === user.role
    )
  ));
}

function getRoleCode(user: User, roles: Role[]): string {
  const role = getRole(user, roles);
  return cleanText(role?.code || user.role).toLowerCase();
}

function isSuperAdminRole(user: User, roles: Role[]): boolean {
  const role = getRole(user, roles);
  const roleCode = getRoleCode(user, roles);
  if (roleCode === 'super_admin') return true;
  const normalized = normalizeUserRoleName(user.role);
  if (normalized === '瓒呯骇绠＄悊鍛?' || normalized === 'super_admin') return true;
  return Boolean(role?.permissions?.some((permission) => cleanText(permission.module) === '全部' && permission.actions.includes('admin')));
}

function isSalesManagerRole(user: User, roles: Role[]): boolean {
  const roleCode = getRoleCode(user, roles);
  const normalized = normalizeUserRoleName(user.role);
  return roleCode === 'sales_manager' || normalized === '閿€鍞粡鐞?';
}

function isSalesDataRole(user: User, roles: Role[]): boolean {
  const roleCode = getRoleCode(user, roles);
  return roleCode === 'sales_consultant' || roleCode === 'sales_manager' || isSalesRoleName(user.role);
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function unrestrictedScope(): DataVisibilityScope {
  return {
    unrestricted: true,
    visibleUserIds: [],
    visibleUserNames: [],
    canViewPublicPool: true,
  };
}

export function getCurrentDataVisibilityScope(): DataVisibilityScope {
  const session = readLocalStorageJson<AuthSession>(AUTH_SESSION_STORAGE_KEY);
  if (!isSessionValid(session)) return unrestrictedScope();

  const users = readLocalStorageJson<User[]>(STORAGE_KEYS.USERS) || [];
  const roles = readLocalStorageJson<Role[]>(STORAGE_KEYS.ROLES) || [];
  const currentUser = users.find((user) => user.id === session.userId && user.isActive);
  if (!currentUser) return unrestrictedScope();

  const roleCode = getRoleCode(currentUser, roles);
  if (isSuperAdminRole(currentUser, roles)) {
    return {
      unrestricted: true,
      currentUser,
      visibleUserIds: users.filter((user) => user.isActive).map((user) => user.id),
      visibleUserNames: users.filter((user) => user.isActive).map((user) => user.name),
      canViewPublicPool: true,
      roleCode,
    };
  }

  const activeUsers = users.filter((user) => user.isActive);
  let visibleUsers: User[] = [currentUser];
  if (isSalesManagerRole(currentUser, roles) && currentUser.departmentId) {
    visibleUsers = activeUsers.filter((user) => (
      user.departmentId === currentUser.departmentId
      && isSalesDataRole(user, roles)
    ));
  }

  return {
    unrestricted: false,
    currentUser,
    visibleUserIds: unique(visibleUsers.map((user) => user.id).filter(Boolean)),
    visibleUserNames: unique(visibleUsers.map((user) => user.name).filter(Boolean)),
    canViewPublicPool: isSalesDataRole(currentUser, roles),
    roleCode,
  };
}

function hasVisibleName(scope: DataVisibilityScope, value?: string): boolean {
  const text = cleanText(value);
  return Boolean(text && scope.visibleUserNames.includes(text));
}

function hasVisibleId(scope: DataVisibilityScope, value?: string): boolean {
  const text = cleanText(value);
  return Boolean(text && scope.visibleUserIds.includes(text));
}

export function isUserVisibleInCurrentDataScope(user: User): boolean {
  const scope = getCurrentDataVisibilityScope();
  return scope.unrestricted || hasVisibleId(scope, user.id) || hasVisibleName(scope, user.name);
}

export function filterUsersByCurrentDataScope(users: User[]): User[] {
  const scope = getCurrentDataVisibilityScope();
  if (scope.unrestricted) return users;
  return users.filter((user) => hasVisibleId(scope, user.id) || hasVisibleName(scope, user.name));
}

export function canViewCustomer(customer: Pick<Customer, 'owner' | 'lifecycleStatusCode' | 'leadContributorId' | 'leadContributorName'>, scope = getCurrentDataVisibilityScope()): boolean {
  if (scope.unrestricted) return true;
  const lifecycleCode = normalizeLifecycleStatusCode(customer.lifecycleStatusCode);
  if (lifecycleCode === LIFECYCLE_STATUS_CODES.PUBLIC_POOL) return scope.canViewPublicPool;
  return hasVisibleName(scope, customer.owner)
    || hasVisibleName(scope, customer.leadContributorName)
    || hasVisibleId(scope, customer.leadContributorId);
}

export function canViewLead(lead: Pick<Lead, 'inputBy' | 'assignedTo' | 'owner' | 'leadContributorId' | 'leadContributorName'>, scope = getCurrentDataVisibilityScope()): boolean {
  if (scope.unrestricted) return true;
  return hasVisibleName(scope, lead.inputBy)
    || hasVisibleName(scope, lead.assignedTo)
    || hasVisibleName(scope, lead.owner)
    || hasVisibleName(scope, lead.leadContributorName)
    || hasVisibleId(scope, lead.leadContributorId);
}

export function canViewOrder(order: Pick<Order, 'owner' | 'salesName' | 'salesId'>, scope = getCurrentDataVisibilityScope()): boolean {
  if (scope.unrestricted) return true;
  return hasVisibleName(scope, order.owner)
    || hasVisibleName(scope, order.salesName)
    || hasVisibleId(scope, order.salesId);
}

export function filterVisibleCustomers<T extends Pick<Customer, 'owner' | 'lifecycleStatusCode' | 'leadContributorId' | 'leadContributorName'>>(items: T[], scope = getCurrentDataVisibilityScope()): T[] {
  if (scope.unrestricted) return items;
  return items.filter((item) => canViewCustomer(item, scope));
}

export function filterVisibleLeads<T extends Pick<Lead, 'inputBy' | 'assignedTo' | 'owner' | 'leadContributorId' | 'leadContributorName'>>(items: T[], scope = getCurrentDataVisibilityScope()): T[] {
  if (scope.unrestricted) return items;
  return items.filter((item) => canViewLead(item, scope));
}

export function filterVisibleOrders<T extends Pick<Order, 'owner' | 'salesName' | 'salesId'>>(items: T[], scope = getCurrentDataVisibilityScope()): T[] {
  if (scope.unrestricted) return items;
  return items.filter((item) => canViewOrder(item, scope));
}

export function getManagedDepartmentsForCurrentDataScope(): Department[] {
  const scope = getCurrentDataVisibilityScope();
  const departments = readLocalStorageJson<Department[]>(STORAGE_KEYS.DEPARTMENTS) || [];
  if (scope.unrestricted) return departments.filter((department) => department.isActive);
  return departments.filter((department) => department.isActive && department.managerId === scope.currentUser?.id);
}
