import type { AuthSession } from '../../types/auth';
import type { AssetDevice, AssetInternetAccount, AssetOffboardingTask, AssetPhoneNumber } from '../../types/asset';
import type { Customer } from '../../types/customer';
import type { Department } from '../../types/department';
import type { Lead } from '../../types/lead';
import type { Order } from '../../types/order';
import type { DataScopeDomain, DataScopeLevel, Role } from '../../types/role';
import type { User } from '../../types/settings';
import { AUTH_SESSION_STORAGE_KEY } from './auth';
import { LIFECYCLE_STATUS_CODES, STORAGE_KEYS, normalizeLifecycleStatusCode } from './constants';
import { canReceiveLead, getUserRole, isSuperAdminUser } from './permissions';
import { ensureOrganizationConfigData, getDepartmentDescendantIds, normalizeRoleDataScopes } from './organizationConfig';

export interface DataVisibilityScope {
  unrestricted: boolean;
  dataScopeLevel: DataScopeLevel;
  currentUser?: User;
  visibleUserIds: string[];
  visibleUserNames: string[];
  canViewPublicPool: boolean;
  roleCode?: string;
}

type ScopeUser = Pick<User, 'id' | 'name' | 'role' | 'roleId' | 'departmentId' | 'isActive'> & Partial<Pick<User, 'account' | 'employmentStatus'>>;

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

function getRoleCode(user: User, roles: Role[]): string {
  const role = getUserRole(user, roles);
  return cleanText(role?.code || user.role).toLowerCase();
}

function isSalesDataRole(user: User, roles: Role[]): boolean {
  return canReceiveLead(user, roles);
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function unrestrictedScope(): DataVisibilityScope {
  return {
    unrestricted: true,
    dataScopeLevel: 'all',
    visibleUserIds: [],
    visibleUserNames: [],
    canViewPublicPool: true,
  };
}

function noAccessScope(): DataVisibilityScope {
  return {
    unrestricted: false,
    dataScopeLevel: 'self',
    visibleUserIds: [],
    visibleUserNames: [],
    canViewPublicPool: false,
  };
}

function activeScopeUsers(users: ScopeUser[], currentUser?: ScopeUser): ScopeUser[] {
  const byId = new Map<string, ScopeUser>();
  [...users, ...(currentUser ? [currentUser] : [])].forEach((user) => {
    if (!user?.id) return;
    if (!user.isActive || (user.employmentStatus || 'active') === 'left') return;
    byId.set(user.id, user);
  });
  return Array.from(byId.values());
}

function hydrateScopeUserFromStorage(currentUser?: ScopeUser): ScopeUser | undefined {
  if (!currentUser?.id) return currentUser;
  const storedUsers = readLocalStorageJson<User[]>(STORAGE_KEYS.USERS) || [];
  const storedUser = storedUsers.find((user) => user.id === currentUser.id);
  if (!storedUser) return currentUser;

  return {
    ...storedUser,
    ...currentUser,
    account: currentUser.account || storedUser.account,
    role: currentUser.role || storedUser.role,
    roleId: currentUser.roleId || storedUser.roleId,
    departmentId: currentUser.departmentId || storedUser.departmentId,
    employmentStatus: currentUser.employmentStatus || storedUser.employmentStatus,
  };
}

function buildDataVisibilityScopeForUser(
  rawCurrentUser: ScopeUser | undefined,
  users: ScopeUser[],
  roles: Role[],
  departments: Department[],
  domain: DataScopeDomain,
): DataVisibilityScope {
  const currentUser = hydrateScopeUserFromStorage(rawCurrentUser);
  if (!currentUser?.id || !currentUser.isActive || (currentUser.employmentStatus || 'active') === 'left') return noAccessScope();

  const roleCode = getRoleCode(currentUser as User, roles);
  const role = getUserRole(currentUser, roles);
  const activeUsers = activeScopeUsers(users, currentUser);
  if (isSuperAdminUser(currentUser, roles)) {
    return {
      unrestricted: true,
      dataScopeLevel: 'all',
      currentUser: currentUser as User,
      visibleUserIds: activeUsers.map((user) => user.id),
      visibleUserNames: activeUsers.map((user) => user.name),
      canViewPublicPool: true,
      roleCode,
    };
  }

  const dataScopeLevel = normalizeRoleDataScopes(role || { code: roleCode })[domain];
  let visibleUsers: ScopeUser[];
  if (dataScopeLevel === 'all') {
    visibleUsers = activeUsers;
  } else if (dataScopeLevel === 'department' && currentUser.departmentId) {
    const visibleDepartmentIds = new Set([
      currentUser.departmentId,
      ...getDepartmentDescendantIds(departments, currentUser.departmentId),
    ]);
    visibleUsers = activeUsers.filter((user) => Boolean(user.departmentId && visibleDepartmentIds.has(user.departmentId)));
  } else {
    visibleUsers = [currentUser];
  }

  return {
    unrestricted: dataScopeLevel === 'all',
    dataScopeLevel,
    currentUser: currentUser as User,
    visibleUserIds: unique(visibleUsers.map((user) => user.id).filter(Boolean)),
    visibleUserNames: unique(visibleUsers.map((user) => user.name).filter(Boolean)),
    canViewPublicPool: dataScopeLevel === 'all' || (domain === 'customers' && isSalesDataRole(currentUser as User, roles)),
    roleCode,
  };
}

export function getCurrentDataVisibilityScope(domain: DataScopeDomain = 'customers'): DataVisibilityScope {
  const session = readLocalStorageJson<AuthSession>(AUTH_SESSION_STORAGE_KEY);
  if (!isSessionValid(session)) return noAccessScope();

  const users = readLocalStorageJson<User[]>(STORAGE_KEYS.USERS) || [];
  const organizationConfig = ensureOrganizationConfigData();
  const roles = organizationConfig.roles;
  const departments = organizationConfig.departments || [];
  const currentUser = users.find((user) => (
    user.id === session.userId
    && user.isActive
    && (user.employmentStatus || 'active') === 'active'
  ));
  return buildDataVisibilityScopeForUser(currentUser, users, roles, departments, domain);
}

function hasVisibleName(scope: DataVisibilityScope, value?: string): boolean {
  const text = cleanText(value);
  return Boolean(text && scope.visibleUserNames.includes(text));
}

function hasVisibleId(scope: DataVisibilityScope, value?: string): boolean {
  const text = cleanText(value);
  return Boolean(text && scope.visibleUserIds.includes(text));
}

export function isUserVisibleInCurrentDataScope(user: User, domain: DataScopeDomain = 'customers', currentUser?: ScopeUser): boolean {
  const { roles, departments } = ensureOrganizationConfigData();
  const scope = currentUser
    ? buildDataVisibilityScopeForUser(currentUser, [user], roles, departments || [], domain)
    : getCurrentDataVisibilityScope(domain);
  return scope.unrestricted || hasVisibleId(scope, user.id) || hasVisibleName(scope, user.name);
}

export function filterUsersByCurrentDataScope(users: User[], domain: DataScopeDomain = 'customers', currentUser?: ScopeUser): User[] {
  const { roles, departments } = ensureOrganizationConfigData();
  const scope = currentUser
    ? buildDataVisibilityScopeForUser(currentUser, users, roles, departments || [], domain)
    : getCurrentDataVisibilityScope(domain);
  if (scope.unrestricted) return users;
  return users.filter((user) => hasVisibleId(scope, user.id) || hasVisibleName(scope, user.name));
}

export function filterOrderUsersByCurrentDataScope(users: User[]): User[] {
  const scope = getCurrentDataVisibilityScope('orders');
  if (scope.unrestricted) return users;
  return users.filter((user) => hasVisibleId(scope, user.id) || hasVisibleName(scope, user.name));
}

export function canViewCustomer(customer: Pick<Customer, 'owner' | 'lifecycleStatusCode' | 'leadContributorId' | 'leadContributorName'>, scope = getCurrentDataVisibilityScope('customers')): boolean {
  const lifecycleCode = normalizeLifecycleStatusCode(customer.lifecycleStatusCode);
  if (lifecycleCode === LIFECYCLE_STATUS_CODES.PUBLIC_POOL) return scope.canViewPublicPool;
  if (scope.unrestricted) return true;
  return hasVisibleName(scope, customer.owner)
    || hasVisibleName(scope, customer.leadContributorName)
    || hasVisibleId(scope, customer.leadContributorId);
}

export function canViewLead(lead: Pick<Lead, 'inputBy' | 'assignedTo' | 'owner' | 'leadContributorId' | 'leadContributorName'>, scope = getCurrentDataVisibilityScope('leads')): boolean {
  if (scope.unrestricted) return true;
  return hasVisibleName(scope, lead.inputBy)
    || hasVisibleName(scope, lead.assignedTo)
    || hasVisibleName(scope, lead.owner)
    || hasVisibleName(scope, lead.leadContributorName)
    || hasVisibleId(scope, lead.leadContributorId);
}

export function canViewOrder(order: Pick<Order, 'owner' | 'salesName' | 'salesId'>, scope = getCurrentDataVisibilityScope('orders')): boolean {
  if (scope.unrestricted) return true;
  return hasVisibleName(scope, order.owner)
    || hasVisibleName(scope, order.salesName)
    || hasVisibleId(scope, order.salesId);
}

export function filterVisibleCustomers<T extends Pick<Customer, 'owner' | 'lifecycleStatusCode' | 'leadContributorId' | 'leadContributorName'>>(items: T[], scope = getCurrentDataVisibilityScope('customers')): T[] {
  return items.filter((item) => canViewCustomer(item, scope));
}

export function filterVisibleLeads<T extends Pick<Lead, 'inputBy' | 'assignedTo' | 'owner' | 'leadContributorId' | 'leadContributorName'>>(items: T[], scope = getCurrentDataVisibilityScope('leads')): T[] {
  if (scope.unrestricted) return items;
  return items.filter((item) => canViewLead(item, scope));
}

export function filterVisibleOrders<T extends Pick<Order, 'owner' | 'salesName' | 'salesId'>>(items: T[], scope = getCurrentDataVisibilityScope('orders')): T[] {
  if (scope.unrestricted) return items;
  return items.filter((item) => canViewOrder(item, scope));
}

export function canViewAssetDevice(device: Pick<AssetDevice, 'owner' | 'currentUser'>, scope = getCurrentDataVisibilityScope('assets')): boolean {
  if (scope.unrestricted) return true;
  return hasVisibleName(scope, device.owner) || hasVisibleName(scope, device.currentUser);
}

export function canViewAssetPhone(phone: Pick<AssetPhoneNumber, 'owner'>, scope = getCurrentDataVisibilityScope('assets')): boolean {
  if (scope.unrestricted) return true;
  return hasVisibleName(scope, phone.owner);
}

export function canViewAssetAccount(account: Pick<AssetInternetAccount, 'owner' | 'currentUser'>, scope = getCurrentDataVisibilityScope('assets')): boolean {
  if (scope.unrestricted) return true;
  return hasVisibleName(scope, account.owner) || hasVisibleName(scope, account.currentUser);
}

export function canViewAssetOffboardingTask(task: Pick<AssetOffboardingTask, 'employeeName'>, scope = getCurrentDataVisibilityScope('assets')): boolean {
  if (scope.unrestricted) return true;
  return hasVisibleName(scope, task.employeeName);
}

export function filterVisibleAssetDevices<T extends Pick<AssetDevice, 'owner' | 'currentUser'>>(items: T[], scope = getCurrentDataVisibilityScope('assets')): T[] {
  if (scope.unrestricted) return items;
  return items.filter((item) => canViewAssetDevice(item, scope));
}

export function filterVisibleAssetPhones<T extends Pick<AssetPhoneNumber, 'owner'>>(items: T[], scope = getCurrentDataVisibilityScope('assets')): T[] {
  if (scope.unrestricted) return items;
  return items.filter((item) => canViewAssetPhone(item, scope));
}

export function filterVisibleAssetAccounts<T extends Pick<AssetInternetAccount, 'owner' | 'currentUser'>>(items: T[], scope = getCurrentDataVisibilityScope('assets')): T[] {
  if (scope.unrestricted) return items;
  return items.filter((item) => canViewAssetAccount(item, scope));
}

export function filterVisibleAssetOffboardingTasks<T extends Pick<AssetOffboardingTask, 'employeeName'>>(items: T[], scope = getCurrentDataVisibilityScope('assets')): T[] {
  if (scope.unrestricted) return items;
  return items.filter((item) => canViewAssetOffboardingTask(item, scope));
}

export function getManagedDepartmentsForCurrentDataScope(): Department[] {
  const scope = getCurrentDataVisibilityScope();
  const departments = readLocalStorageJson<Department[]>(STORAGE_KEYS.DEPARTMENTS) || [];
  if (scope.unrestricted) return departments.filter((department) => department.isActive);
  return departments.filter((department) => department.isActive && department.managerId === scope.currentUser?.id);
}
