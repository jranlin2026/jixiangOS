import type { AuthenticatedUser } from '../../src/types/auth';
import type {
  AssetDevice,
  AssetInternetAccount,
  AssetMatrixPublishTask,
  AssetOffboardingTask,
  AssetOperationLog,
  AssetPhoneNumber,
  AssetRisk,
} from '../../src/types/asset';
import type { Role } from '../../src/types/role';
import type { User } from '../../src/types/settings';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import {
  PERMISSION_KEYS,
  getUserRole,
  hasPermission,
  isSuperAdmin,
  isSuperAdminUser,
  normalizePermissionKey,
} from '../../src/shared/utils/permissions';
import { normalizeRoleDataScopes } from '../../src/shared/utils/organizationConfig';

const ASSET_STORAGE_KEYS = new Set<string>([
  STORAGE_KEYS.ASSET_DEVICES,
  STORAGE_KEYS.ASSET_PHONE_NUMBERS,
  STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS,
  STORAGE_KEYS.ASSET_RISKS,
  STORAGE_KEYS.ASSET_OPERATION_LOGS,
  STORAGE_KEYS.ASSET_OFFBOARDING_TASKS,
  STORAGE_KEYS.ASSET_MATRIX_PUBLISH_TASKS,
]);

const ASSET_WRITE_PERMISSIONS: Record<string, string[]> = {
  [STORAGE_KEYS.ASSET_DEVICES]: [PERMISSION_KEYS.ASSETS, PERMISSION_KEYS.ASSETS_DEVICES, PERMISSION_KEYS.ASSETS_IMPORT_EXPORT],
  [STORAGE_KEYS.ASSET_PHONE_NUMBERS]: [PERMISSION_KEYS.ASSETS, PERMISSION_KEYS.ASSETS_PHONES, PERMISSION_KEYS.ASSETS_IMPORT_EXPORT],
  [STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS]: [PERMISSION_KEYS.ASSETS, PERMISSION_KEYS.ASSETS_ACCOUNTS, PERMISSION_KEYS.ASSETS_IMPORT_EXPORT],
  [STORAGE_KEYS.ASSET_RISKS]: [PERMISSION_KEYS.ASSETS, PERMISSION_KEYS.ASSETS_RISKS],
  [STORAGE_KEYS.ASSET_OPERATION_LOGS]: [PERMISSION_KEYS.ASSETS, PERMISSION_KEYS.ASSETS_LOGS],
  [STORAGE_KEYS.ASSET_OFFBOARDING_TASKS]: [PERMISSION_KEYS.ASSETS, PERMISSION_KEYS.ASSETS_OFFBOARDING],
  [STORAGE_KEYS.ASSET_MATRIX_PUBLISH_TASKS]: [PERMISSION_KEYS.ASSETS, PERMISSION_KEYS.ASSETS_MATRIX_PUBLISH],
};

type AssetStorageContext = {
  roles: Role[];
  users: User[];
};

type AssetVisibilityScope = {
  unrestricted: boolean;
  visibleNames: Set<string>;
};

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

export function isAssetStorageKey(key: string): boolean {
  return ASSET_STORAGE_KEYS.has(key);
}

function hasAnyExactPermission(user: AuthenticatedUser, permissions: string[], action = 'read'): boolean {
  if (isSuperAdmin(user)) return true;
  const exactModules = new Set(permissions.map(normalizePermissionKey));
  return user.permissions.some((permission) => {
    if (!exactModules.has(normalizePermissionKey(permission.module))) return false;
    const actions = permission.actions || [];
    if (actions.includes('admin')) return true;
    if (action === 'read') return actions.some((item) => ['read', 'write', 'delete'].includes(item));
    if (action === 'write') return actions.some((item) => ['write', 'delete'].includes(item));
    return actions.includes(action);
  });
}

export function canReadStorageKey(user: AuthenticatedUser, key: string): boolean {
  if (!isAssetStorageKey(key)) return true;
  return hasPermission(user, PERMISSION_KEYS.ASSETS, 'read');
}

export function canWriteStorageKey(user: AuthenticatedUser, key: string): boolean {
  if (!isAssetStorageKey(key)) return true;
  return hasAnyExactPermission(user, ASSET_WRITE_PERMISSIONS[key] || [PERMISSION_KEYS.ASSETS], 'write');
}

function assetScopeForUser(user: AuthenticatedUser, context: AssetStorageContext): AssetVisibilityScope {
  const currentUser = context.users.find((item) => item.id === user.id || item.name === user.name);
  if (!currentUser) return { unrestricted: false, visibleNames: new Set() };
  if (isSuperAdminUser(currentUser, context.roles)) {
    return { unrestricted: true, visibleNames: new Set(context.users.map((item) => item.name).filter(Boolean)) };
  }

  const role = getUserRole(currentUser, context.roles);
  const level = normalizeRoleDataScopes(role || { code: currentUser.role, permissions: [] }).assets;
  const activeUsers = context.users.filter((item) => item.isActive && (item.employmentStatus || 'active') === 'active');
  const visibleUsers = level === 'all'
    ? activeUsers
    : level === 'department' && currentUser.departmentId
      ? activeUsers.filter((item) => item.departmentId === currentUser.departmentId)
      : [currentUser];

  return {
    unrestricted: level === 'all',
    visibleNames: new Set(visibleUsers.map((item) => item.name).filter(Boolean)),
  };
}

function hasVisibleName(scope: AssetVisibilityScope, value?: string): boolean {
  const text = String(value || '').trim();
  return Boolean(text && scope.visibleNames.has(text));
}

function visibleDevice(device: Pick<AssetDevice, 'owner' | 'currentUser'>, scope: AssetVisibilityScope): boolean {
  return scope.unrestricted || hasVisibleName(scope, device.owner) || hasVisibleName(scope, device.currentUser);
}

function visiblePhone(phone: Pick<AssetPhoneNumber, 'owner' | 'deviceId'>, visibleDeviceIds: Set<string>, scope: AssetVisibilityScope): boolean {
  return scope.unrestricted || hasVisibleName(scope, phone.owner) || visibleDeviceIds.has(phone.deviceId);
}

function visibleAccount(account: Pick<AssetInternetAccount, 'owner' | 'currentUser' | 'phoneId'>, visiblePhoneIds: Set<string>, scope: AssetVisibilityScope): boolean {
  return scope.unrestricted || hasVisibleName(scope, account.owner) || hasVisibleName(scope, account.currentUser) || Boolean(account.phoneId && visiblePhoneIds.has(account.phoneId));
}

function sanitizeDevice(device: AssetDevice, canViewSensitive: boolean): AssetDevice {
  if (canViewSensitive) return device;
  return { ...device, imei: device.imeiMasked || '' };
}

function sanitizePhone(phone: AssetPhoneNumber, canViewSensitive: boolean): AssetPhoneNumber {
  if (canViewSensitive) return phone;
  return { ...phone, phoneNumber: phone.phoneNumberMasked || '' };
}

function sanitizeAccount(account: AssetInternetAccount, canViewSensitive: boolean): AssetInternetAccount {
  if (canViewSensitive) return account;
  return {
    ...account,
    loginAccount: account.loginAccountMasked || '',
    boundEmail: account.boundEmailMasked || undefined,
  };
}

export function filterAssetStorageData(
  data: Record<string, unknown>,
  user: AuthenticatedUser,
  context: AssetStorageContext,
): Record<string, unknown> {
  if (!hasPermission(user, PERMISSION_KEYS.ASSETS, 'read')) {
    return Object.fromEntries(Object.entries(data).filter(([key]) => !isAssetStorageKey(key)));
  }

  const scope = assetScopeForUser(user, context);
  const canViewSensitive = hasPermission(user, PERMISSION_KEYS.ASSETS_SENSITIVE_VIEW, 'read');
  const devices = asArray<AssetDevice>(data[STORAGE_KEYS.ASSET_DEVICES])
    .filter((device) => visibleDevice(device, scope))
    .map((device) => sanitizeDevice(device, canViewSensitive));
  const visibleDeviceIds = new Set(devices.map((device) => device.id));
  const phones = asArray<AssetPhoneNumber>(data[STORAGE_KEYS.ASSET_PHONE_NUMBERS])
    .filter((phone) => visiblePhone(phone, visibleDeviceIds, scope))
    .map((phone) => sanitizePhone(phone, canViewSensitive));
  const visiblePhoneIds = new Set(phones.map((phone) => phone.id));
  const accounts = asArray<AssetInternetAccount>(data[STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS])
    .filter((account) => visibleAccount(account, visiblePhoneIds, scope))
    .map((account) => sanitizeAccount(account, canViewSensitive));
  const visibleAssetIds = new Set<string>([
    ...devices.map((device) => device.id),
    ...phones.map((phone) => phone.id),
    ...accounts.map((account) => account.id),
  ]);
  const risks = asArray<AssetRisk>(data[STORAGE_KEYS.ASSET_RISKS])
    .filter((risk) => scope.unrestricted || visibleAssetIds.has(risk.targetId));
  const logs = asArray<AssetOperationLog>(data[STORAGE_KEYS.ASSET_OPERATION_LOGS])
    .filter((log) => scope.unrestricted || visibleAssetIds.has(log.targetId));
  const offboardingTasks = asArray<AssetOffboardingTask>(data[STORAGE_KEYS.ASSET_OFFBOARDING_TASKS])
    .filter((task) => scope.unrestricted || hasVisibleName(scope, task.employeeName) || visibleAssetIds.has(task.assetId));
  const matrixPublishTasks = asArray<AssetMatrixPublishTask>(data[STORAGE_KEYS.ASSET_MATRIX_PUBLISH_TASKS])
    .map((task) => ({
      ...task,
      targets: scope.unrestricted
        ? task.targets
        : task.targets.filter((target) => visibleAssetIds.has(target.accountId) || hasVisibleName(scope, target.assignee)),
    }))
    .filter((task) => scope.unrestricted || task.targets.length);

  return {
    ...data,
    [STORAGE_KEYS.ASSET_DEVICES]: devices,
    [STORAGE_KEYS.ASSET_PHONE_NUMBERS]: phones,
    [STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS]: accounts,
    [STORAGE_KEYS.ASSET_RISKS]: risks,
    [STORAGE_KEYS.ASSET_OPERATION_LOGS]: logs,
    [STORAGE_KEYS.ASSET_OFFBOARDING_TASKS]: offboardingTasks,
    [STORAGE_KEYS.ASSET_MATRIX_PUBLISH_TASKS]: matrixPublishTasks,
  };
}

export function filterSingleStorageKey(
  key: string,
  data: Record<string, unknown>,
  user: AuthenticatedUser,
  context: AssetStorageContext,
): unknown {
  if (!isAssetStorageKey(key)) return data[key] ?? null;
  return filterAssetStorageData(data, user, context)[key] ?? null;
}
