import type { AuthenticatedUser } from '../../src/types/auth';
import type {
  AssetDevice,
  AssetDashboard,
  AssetDetailBundle,
  AssetFilters,
  AssetFilterOption,
  AssetFilterOptions,
  AssetInternetAccount,
  AssetOverviewRelationshipRow,
  AssetMatrixPublishStats,
  AssetMatrixPublishTask,
  AssetOffboardingTask,
  AssetOperationLog,
  AssetPhoneNumber,
  AssetRisk,
  AssetType,
} from '../../src/types/asset';
import type { Role } from '../../src/types/role';
import type { User } from '../../src/types/settings';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { hasPermission, PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import { readAccountControlStatus, readDeviceCommunicationType } from '../../src/domain/assets/assetFields';
import { normalizeAccountLoginDeviceIds } from '../../src/domain/assets/accountDeviceBindings';
import { normalizeIdentityAccountIds } from '../../src/domain/assets/accountIdentityBindings';
import { isMatrixTargetDone } from '../../src/domain/assets/assetGovernance';
import { ACCOUNT_PLATFORM_OPTIONS } from '../../src/domain/assets/accountPlatformCatalog';
import { success } from '../api/response';
import { filterAssetStorageData } from './assetStorageAccess';

const ASSET_KEYS = [
  STORAGE_KEYS.ASSET_DEVICES,
  STORAGE_KEYS.ASSET_PHONE_NUMBERS,
  STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS,
  STORAGE_KEYS.ASSET_RISKS,
  STORAGE_KEYS.ASSET_OPERATION_LOGS,
  STORAGE_KEYS.ASSET_OFFBOARDING_TASKS,
  STORAGE_KEYS.ASSET_MATRIX_PUBLISH_TASKS,
] as const;

const KEY_BY_KIND = {
  devices: STORAGE_KEYS.ASSET_DEVICES,
  phones: STORAGE_KEYS.ASSET_PHONE_NUMBERS,
  accounts: STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS,
  risks: STORAGE_KEYS.ASSET_RISKS,
  logs: STORAGE_KEYS.ASSET_OPERATION_LOGS,
  offboarding: STORAGE_KEYS.ASSET_OFFBOARDING_TASKS,
  'matrix-publish': STORAGE_KEYS.ASSET_MATRIX_PUBLISH_TASKS,
} as const;

export type AssetListKind = keyof typeof KEY_BY_KIND;

type AssetRow = AssetDevice | AssetPhoneNumber | AssetInternetAccount | AssetRisk
  | AssetOperationLog | AssetOffboardingTask | AssetMatrixPublishTask;

type AssetStorageReader = { get(key: string): Promise<{ code: number; data: unknown }> };
type AssetContext = { roles: Role[]; users: User[] };

function text(value: unknown): string {
  return String(value || '').toLowerCase();
}

function normalizeOperator(value: unknown): string {
  const raw = String(value || '').trim();
  if (raw.includes('移动')) return '移动';
  if (raw.includes('联通')) return '联通';
  if (raw.includes('电信')) return '电信';
  if (raw.includes('广电')) return '广电';
  return raw || '未知';
}

function matchesOrganizationFilter(value: Record<string, unknown>, idKey: string, nameKey: string, filterValue?: string): boolean {
  if (!filterValue) return true;
  if (filterValue.startsWith('org:')) {
    const [encodedId = '', encodedName = ''] = filterValue.slice(4).split(':');
    const id = decodeURIComponent(encodedId);
    const name = decodeURIComponent(encodedName);
    const rowId = String(value[idKey] || '');
    if (rowId) return Boolean(id && rowId === id);
    return Boolean(name && String(value[nameKey] || '') === name);
  }
  return filterValue.startsWith('name:')
    ? String(value[nameKey] || '') === filterValue.slice(5)
    : String(value[idKey] || '') === filterValue;
}

function uniqueOptions(values: Array<AssetFilterOption | undefined>): AssetFilterOption[] {
  return [...new Map(values.filter((item): item is AssetFilterOption => Boolean(item?.value)).map((item) => [item.value, item])).values()]
    .sort((left, right) => left.label.localeCompare(right.label, 'zh-CN'));
}

function matchesSearch(
  row: AssetRow,
  keyword: string,
  accountById?: Map<string, AssetInternetAccount>,
  deviceById?: Map<string, AssetDevice>,
  phoneById?: Map<string, AssetPhoneNumber>,
): boolean {
  if (!keyword) return true;
  const values = Object.values(row as unknown as Record<string, unknown>);
  if (accountById && 'identityAccountIds' in row && Array.isArray(row.identityAccountIds)) {
    row.identityAccountIds.forEach((id) => {
      const identityAccount = accountById.get(id);
      if (identityAccount) values.push(identityAccount.platform, identityAccount.accountName, identityAccount.loginAccount);
    });
  }
  if (deviceById && 'loginDeviceIds' in row) {
    normalizeAccountLoginDeviceIds(row.loginDeviceIds).forEach((id) => {
      const device = deviceById.get(id);
      if (device) values.push(device.deviceCode, device.deviceName, device.brand, device.model);
    });
  }
  if (deviceById && 'deviceId' in row && row.deviceId) {
    const device = deviceById.get(row.deviceId);
    if (device) values.push(device.deviceCode, device.deviceName, device.brand, device.model);
  }
  if (phoneById && 'phoneId' in row && row.phoneId) {
    const phone = phoneById.get(row.phoneId);
    if (phone) values.push(phone.phoneNumber, phone.phoneNumberMasked);
  }
  return values.some((value) => {
    if (Array.isArray(value)) return value.some((entry) => text(JSON.stringify(entry)).includes(keyword));
    return typeof value !== 'object' && text(value).includes(keyword);
  });
}

function matchesFilters(
  kind: AssetListKind,
  row: AssetRow,
  filters: AssetFilters,
  accountById?: Map<string, AssetInternetAccount>,
  deviceById?: Map<string, AssetDevice>,
  boundPhoneIds?: Set<string>,
  phoneById?: Map<string, AssetPhoneNumber>,
): boolean {
  if (!matchesSearch(row, text(filters.search).trim(), accountById, deviceById, phoneById)) return false;
  const value = row as unknown as Record<string, unknown>;
  if (filters.platform && (kind === 'matrix-publish'
    ? !(value.targets as AssetMatrixPublishTask['targets']).some((target) => target.platform === filters.platform)
    : value.platform !== filters.platform)) return false;
  if (filters.loginDeviceId && (
    kind !== 'accounts'
    || !normalizeAccountLoginDeviceIds(value.loginDeviceIds as string[] | undefined).includes(filters.loginDeviceId)
  )) return false;
  if (filters.bindingStatus) {
    const loginDeviceIds = normalizeAccountLoginDeviceIds(value.loginDeviceIds as string[] | undefined);
    const credentialPending = value.loginCredentialStatus === '待补齐' || value.paymentCredentialStatus === '待补齐';
    const matchesBinding = filters.bindingStatus === 'unassigned-user'
      ? kind === 'devices' && !value.currentUserId && !value.currentUser
      : filters.bindingStatus === 'bound-device'
        ? kind === 'phones' && Boolean(value.deviceId)
        : filters.bindingStatus === 'unbound-device'
          ? kind === 'phones' && !value.deviceId
          : filters.bindingStatus === 'bound-phone'
            ? kind === 'accounts' && Boolean(value.phoneId)
            : filters.bindingStatus === 'unbound-phone'
              ? kind === 'accounts' && !value.phoneId
              : filters.bindingStatus === 'with-login-device'
                ? kind === 'accounts' && loginDeviceIds.length > 0
                : filters.bindingStatus === 'without-login-device'
                  ? kind === 'accounts' && loginDeviceIds.length === 0
                  : filters.bindingStatus === 'credential-pending'
                    ? kind === 'accounts' && credentialPending
                    : true;
    if (!matchesBinding) return false;
  }
  if (filters.permissionStatus && (kind !== 'accounts' || readAccountControlStatus(value) !== filters.permissionStatus)) return false;
  if (filters.riskLevel && value.riskLevel !== filters.riskLevel && value.level !== filters.riskLevel) return false;
  if (filters.status) {
    const matchesStatus = kind === 'matrix-publish'
      ? (value.targets as AssetMatrixPublishTask['targets']).some((target) => target.status === filters.status)
      : (kind === 'accounts' ? value.accountStatus : value.status) === filters.status;
    if (!matchesStatus) return false;
  }
  if (filters.deviceCategory && (kind !== 'devices' || value.deviceCategory !== filters.deviceCategory)) return false;
  if (filters.brand && (kind !== 'devices' || value.brand !== filters.brand)) return false;
  if (filters.communicationType && (kind !== 'devices' || readDeviceCommunicationType(value as unknown as AssetDevice) !== filters.communicationType)) return false;
  if (filters.acquisitionType && (kind !== 'devices' || value.acquisitionType !== filters.acquisitionType)) return false;
  if (filters.profileStatus) {
    const complete = kind === 'devices' && Boolean(value.deviceCategory && value.brand && value.model && readDeviceCommunicationType(value as unknown as AssetDevice));
    if ((filters.profileStatus === 'complete') !== complete) return false;
  }
  if (filters.operator && (kind !== 'phones' || normalizeOperator(value.operator) !== normalizeOperator(filters.operator))) return false;
  if (filters.attributionLocation && (kind !== 'phones' || value.attributionLocation !== filters.attributionLocation)) return false;
  if (filters.simForm && (kind !== 'phones' || value.simForm !== filters.simForm)) return false;
  if (filters.accountCategory && (kind !== 'accounts' || value.accountCategory !== filters.accountCategory)) return false;
  if (!matchesOrganizationFilter(value, 'departmentId', 'department', filters.departmentId)) return false;
  if (!matchesOrganizationFilter(value, 'ownerId', 'owner', filters.ownerId)) return false;
  if (!matchesOrganizationFilter(value, 'currentUserId', 'currentUser', filters.currentUserId)) return false;
  if (filters.userAssignment) {
    const assigned = Boolean(value.currentUserId || value.currentUser);
    if ((filters.userAssignment === 'assigned') !== assigned) return false;
  }
  if (filters.phoneBinding) {
    const bound = kind === 'accounts'
      ? Boolean(value.phoneId)
      : kind === 'devices'
        ? Number(value.phoneNumberCount || 0) > 0
        : false;
    if ((filters.phoneBinding === 'bound') !== bound) return false;
  }
  if (filters.deviceBinding) {
    const bound = kind === 'phones' && Boolean(value.deviceId);
    if ((filters.deviceBinding === 'bound') !== bound) return false;
  }
  if (filters.loginDeviceBinding) {
    const bound = kind === 'accounts'
      ? normalizeAccountLoginDeviceIds(value.loginDeviceIds as string[] | undefined).length > 0
      : kind === 'devices'
        ? Number(value.internetAccountCount || 0) > 0
        : false;
    if ((filters.loginDeviceBinding === 'with') !== bound) return false;
  }
  if (filters.accountBinding) {
    const bound = kind === 'phones' && Boolean(boundPhoneIds?.has(String(value.id)));
    if ((filters.accountBinding === 'with') !== bound) return false;
  }
  if (filters.identityBinding) {
    const identityIds = normalizeIdentityAccountIds(value.identityAccountIds as string[] | undefined);
    const identityPlatforms = identityIds.map((id) => accountById?.get(id)?.platform || '');
    const matchesIdentity = filters.identityBinding === 'any'
      ? identityIds.length > 0
      : filters.identityBinding === 'none'
        ? identityIds.length === 0
        : identityPlatforms.some((identityPlatform) => filters.identityBinding === 'apple' ? identityPlatform === 'Apple ID' : identityPlatform === 'Google账号');
    if (kind !== 'accounts' || !matchesIdentity) return false;
  }
  if (filters.credentialStatus) {
    const pending = value.loginCredentialStatus === '待补齐' || value.paymentCredentialStatus === '待补齐';
    const complete = value.loginCredentialStatus === '已设置'
      && (!value.requiresPaymentPassword || value.paymentCredentialStatus === '已设置');
    if (kind !== 'accounts' || (filters.credentialStatus === 'pending' ? !pending : !complete)) return false;
  }
  if (filters.twoFactorStatus) {
    const configured = Boolean(text(value.twoFactorMethod).trim());
    if (kind !== 'accounts' || (filters.twoFactorStatus === 'configured') !== configured) return false;
  }
  if (filters.servicePasswordStatus) {
    const configured = Boolean(text(value.servicePassword).trim() || text(value.servicePasswordMasked).trim());
    if (kind !== 'phones' || (filters.servicePasswordStatus === 'configured') !== configured) return false;
  }
  if (filters.packageName && (kind !== 'phones' || value.packageName !== filters.packageName)) return false;
  if (filters.contractStatus) {
    const expiresAt = text(value.contractExpiresAt).trim();
    const expired = Boolean(expiresAt && new Date(expiresAt).getTime() < Date.now());
    const matchesContract = filters.contractStatus === 'unset'
      ? !expiresAt
      : filters.contractStatus === 'expired'
        ? expired
        : Boolean(expiresAt) && !expired;
    if (kind !== 'phones' || !matchesContract) return false;
  }
  if (filters.monthlyFeeMin !== undefined && (kind !== 'phones' || Number(value.monthlyFee || 0) < filters.monthlyFeeMin)) return false;
  if (filters.monthlyFeeMax !== undefined && (kind !== 'phones' || Number(value.monthlyFee || 0) > filters.monthlyFeeMax)) return false;
  return true;
}

export function createAssetListService(
  storage: AssetStorageReader,
  readContext: () => Promise<AssetContext>,
  readEmployeeTaskStatuses?: (taskIds: string[]) => Promise<Array<{ id: string; status: string; completedAt?: string | Date | null }>>,
) {
  let bundlePromise: Promise<Record<string, unknown>> | null = null;
  let bundleLoadedAt = 0;
  let contextPromise: Promise<AssetContext> | null = null;
  let contextLoadedAt = 0;

  const loadBundle = () => {
    if (bundlePromise && Date.now() - bundleLoadedAt < 1000) return bundlePromise;
    bundleLoadedAt = Date.now();
    bundlePromise = Promise.all(ASSET_KEYS.map(async (key) => {
      const result = await storage.get(key);
      return [key, result.code === 0 ? result.data : []] as const;
    })).then(Object.fromEntries);
    return bundlePromise;
  };
  const loadContext = () => {
    if (contextPromise && Date.now() - contextLoadedAt < 1000) return contextPromise;
    contextLoadedAt = Date.now();
    contextPromise = readContext();
    return contextPromise;
  };
  const loadVisible = async (user: AuthenticatedUser) => filterAssetStorageData(
    await loadBundle(), user, await loadContext(),
  );
  const overlayMatrixTaskStatuses = async (batches: AssetMatrixPublishTask[]): Promise<AssetMatrixPublishTask[]> => {
    if (!readEmployeeTaskStatuses) return batches;
    const taskIds = batches.flatMap((batch) => batch.targets
      .map((target) => target.employeeTaskId)
      .filter((id): id is string => Boolean(id)));
    const statuses = new Map((await readEmployeeTaskStatuses(taskIds)).map((task) => [task.id, task]));
    return batches.map((batch) => ({
      ...batch,
      targets: batch.targets.map((target) => {
        const employeeTask = target.employeeTaskId ? statuses.get(target.employeeTaskId) : undefined;
        if (!employeeTask) return target;
        const status: AssetMatrixPublishTask['targets'][number]['status'] = employeeTask.status === 'CONFIRMED' ? 'confirmed'
          : employeeTask.status === 'COMPLETED' ? 'completed'
            : employeeTask.status === 'RETURNED' ? 'returned'
              : 'pending';
        return {
          ...target,
          status,
          completedAt: employeeTask.completedAt ? new Date(employeeTask.completedAt).toISOString() : target.completedAt,
        };
      }),
    }));
  };

  return {
    invalidate() {
      bundlePromise = null;
      bundleLoadedAt = 0;
    },
    async list(kind: AssetListKind, filters: AssetFilters, user: AuthenticatedUser) {
      const visible = await loadVisible(user);
      let rows = (Array.isArray(visible[KEY_BY_KIND[kind]]) ? visible[KEY_BY_KIND[kind]] : []) as AssetRow[];
      if (kind === 'matrix-publish') rows = await overlayMatrixTaskStatuses(rows as AssetMatrixPublishTask[]);
      const canReadDevices = hasPermission(user, PERMISSION_KEYS.ASSETS_DEVICES, 'read');
      const canReadPhones = hasPermission(user, PERMISSION_KEYS.ASSETS_PHONES, 'read');
      const canReadAccounts = hasPermission(user, PERMISSION_KEYS.ASSETS_ACCOUNTS, 'read');
      const visibleAccounts = canReadAccounts
        ? (visible[STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS] || []) as AssetInternetAccount[]
        : [];
      const accountById = kind === 'accounts' || kind === 'phones' ? new Map(visibleAccounts.map((account) => [account.id, account])) : undefined;
      const boundPhoneIds = kind === 'phones' && canReadAccounts
        ? new Set(visibleAccounts.map((account) => account.phoneId).filter((id): id is string => Boolean(id)))
        : undefined;
      const visibleDevices = canReadDevices ? (visible[STORAGE_KEYS.ASSET_DEVICES] || []) as AssetDevice[] : [];
      const deviceById = kind === 'accounts' || kind === 'phones' ? new Map(visibleDevices.map((device) => [device.id, device])) : undefined;
      const accountCountByDeviceId = kind === 'devices' && canReadAccounts
        ? visibleAccounts.reduce((counts, account) => {
          normalizeAccountLoginDeviceIds(account.loginDeviceIds).forEach((deviceId) => {
            counts.set(deviceId, (counts.get(deviceId) || 0) + 1);
          });
          return counts;
        }, new Map<string, number>())
        : undefined;
      const visiblePhones = canReadPhones ? (visible[STORAGE_KEYS.ASSET_PHONE_NUMBERS] || []) as AssetPhoneNumber[] : [];
      const phoneById = kind === 'accounts' ? new Map(visiblePhones.map((phone) => [phone.id, phone])) : undefined;
      const phoneCountByDeviceId = kind === 'devices' && canReadPhones
        ? visiblePhones.reduce((counts, phone) => {
          if (phone.deviceId) counts.set(phone.deviceId, (counts.get(phone.deviceId) || 0) + 1);
          return counts;
        }, new Map<string, number>())
        : undefined;
      const rowsWithRelationshipCounts = kind === 'devices'
        ? (rows as AssetDevice[]).map((device) => {
          const cleanDevice = { ...device } as AssetDevice & { phoneNumberCount?: number };
          delete cleanDevice.internetAccountCount;
          delete cleanDevice.phoneNumberCount;
          return {
            ...cleanDevice,
            ...(canReadAccounts ? { internetAccountCount: accountCountByDeviceId?.get(device.id) || 0 } : {}),
            ...(canReadPhones ? { phoneNumberCount: phoneCountByDeviceId?.get(device.id) || 0 } : {}),
          };
        })
        : rows;
      const rowsWithVisibleRelationships = rowsWithRelationshipCounts.map((row) => {
        if (kind === 'phones' && !canReadDevices) {
          const phone = { ...(row as AssetPhoneNumber) };
          delete phone.deviceId;
          return phone;
        }
        if (kind === 'accounts') {
          const account = { ...(row as AssetInternetAccount) };
          if (!canReadPhones) delete account.phoneId;
          if (!canReadDevices) delete account.loginDeviceIds;
          return account;
        }
        return row;
      });
      const effectiveFilters = { ...filters };
      if (!canReadPhones) {
        if (kind === 'devices' || kind === 'accounts') delete effectiveFilters.phoneBinding;
        if (effectiveFilters.bindingStatus === 'bound-phone' || effectiveFilters.bindingStatus === 'unbound-phone') delete effectiveFilters.bindingStatus;
      }
      if (!canReadDevices) {
        if (kind === 'phones') delete effectiveFilters.deviceBinding;
        if (kind === 'accounts') {
          delete effectiveFilters.loginDeviceBinding;
          delete effectiveFilters.loginDeviceId;
        }
        if (effectiveFilters.bindingStatus === 'bound-device' || effectiveFilters.bindingStatus === 'unbound-device'
          || effectiveFilters.bindingStatus === 'with-login-device' || effectiveFilters.bindingStatus === 'without-login-device') delete effectiveFilters.bindingStatus;
      }
      if (!canReadAccounts) {
        if (kind === 'phones') delete effectiveFilters.accountBinding;
        if (kind === 'devices') delete effectiveFilters.loginDeviceBinding;
      }
      const filtered = rowsWithVisibleRelationships.filter((row) => matchesFilters(kind, row, effectiveFilters, accountById, deviceById, boundPhoneIds, phoneById));
      const page = Math.max(1, Number(filters.page) || 1);
      const pageSize = Math.min(500, Math.max(1, Number(filters.pageSize) || 20));
      const start = (page - 1) * pageSize;
      return success({
        items: filtered.slice(start, start + pageSize),
        pagination: {
          page,
          pageSize,
          total: filtered.length,
          totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)),
        },
      });
    },
    async matrixStats(user: AuthenticatedUser, nowIso = new Date().toISOString()) {
      const visible = await loadVisible(user);
      const batches = await overlayMatrixTaskStatuses(
        (visible[STORAGE_KEYS.ASSET_MATRIX_PUBLISH_TASKS] || []) as AssetMatrixPublishTask[],
      );
      const dueAtByTargetId = new Map<string, string>();
      const targets = batches.flatMap((batch) => {
        batch.targets.forEach((target) => dueAtByTargetId.set(target.id, batch.dueAt));
        return batch.targets;
      });
      const isOverdue = (target: AssetMatrixPublishTask['targets'][number]) => {
        const dueAt = dueAtByTargetId.get(target.id);
        return !isMatrixTargetDone(target.status)
          && Boolean(dueAt)
          && new Date(dueAt!).getTime() < new Date(nowIso).getTime();
      };
      const summarize = <K extends 'platform' | 'department' | 'assignee'>(groupKey: K) => {
        const groups = new Map<string, { total: number; completed: number; overdue: number }>();
        targets.forEach((target) => {
          const key = String(target[groupKey] || '未分组');
          const current = groups.get(key) || { total: 0, completed: 0, overdue: 0 };
          current.total += 1;
          if (isMatrixTargetDone(target.status)) current.completed += 1;
          if (isOverdue(target)) current.overdue += 1;
          groups.set(key, current);
        });
        return Array.from(groups.entries()).map(([key, value]) => ({ [groupKey]: key, ...value }));
      };
      const completedTargets = targets.filter((target) => isMatrixTargetDone(target.status)).length;
      const overdueAccounts = targets.filter(isOverdue);
      return success<AssetMatrixPublishStats>({
        totalTargets: targets.length,
        completedTargets,
        pendingTargets: targets.length - completedTargets,
        overdueTargets: overdueAccounts.length,
        completionRate: targets.length ? Math.round((completedTargets / targets.length) * 100) : 0,
        overdueAccounts,
        byPlatform: summarize('platform') as AssetMatrixPublishStats['byPlatform'],
        byDepartment: summarize('department') as AssetMatrixPublishStats['byDepartment'],
        byAssignee: summarize('assignee') as AssetMatrixPublishStats['byAssignee'],
      });
    },
    async filterOptions(kind: 'devices' | 'phones' | 'accounts', user: AuthenticatedUser) {
      const visible = await loadVisible(user);
      const rows = (visible[KEY_BY_KIND[kind]] || []) as Array<Record<string, unknown>>;
      const canReadDevices = hasPermission(user, PERMISSION_KEYS.ASSETS_DEVICES, 'read');
      const toFieldOptions = (field: string, normalize: (value: unknown) => string = (value) => String(value || '').trim()) => uniqueOptions(
        rows.map((row) => {
          const value = normalize(row[field]);
          return value ? { value, label: value } : undefined;
        }),
      );
      const organizationOptions = (idField: string, nameField: string) => uniqueOptions(rows.map((row) => {
        const id = String(row[idField] || '').trim();
        const name = String(row[nameField] || '').trim();
        return id || name ? { value: `org:${encodeURIComponent(id)}:${encodeURIComponent(name)}`, label: name || id } : undefined;
      }));
      const empty: AssetFilterOptions = {
        deviceCategories: [], brands: [], communicationTypes: [], acquisitionTypes: [], statuses: [],
        operators: [], attributionLocations: [], simForms: [], packageNames: [], platforms: [],
        controlStatuses: [], accountCategories: [], departments: [], owners: [], currentUsers: [], loginDevices: [],
      };
      const options: AssetFilterOptions = {
        ...empty,
        statuses: toFieldOptions(kind === 'accounts' ? 'accountStatus' : 'status'),
        departments: organizationOptions('departmentId', 'department'),
        owners: organizationOptions('ownerId', 'owner'),
        currentUsers: organizationOptions('currentUserId', 'currentUser'),
      };
      if (kind === 'devices') {
        options.deviceCategories = toFieldOptions('deviceCategory');
        options.brands = toFieldOptions('brand');
        options.communicationTypes = uniqueOptions(rows.map((row) => {
          const value = readDeviceCommunicationType(row as unknown as AssetDevice);
          return value ? { value, label: value } : undefined;
        }));
        options.acquisitionTypes = toFieldOptions('acquisitionType');
      } else if (kind === 'phones') {
        options.operators = toFieldOptions('operator', normalizeOperator);
        options.attributionLocations = toFieldOptions('attributionLocation');
        options.simForms = toFieldOptions('simForm');
        options.packageNames = toFieldOptions('packageName');
      } else {
        options.platforms = uniqueOptions([
          ...ACCOUNT_PLATFORM_OPTIONS.map((platform) => ({ value: platform, label: platform })),
          ...toFieldOptions('platform'),
        ]);
        options.controlStatuses = uniqueOptions(rows.map((row) => {
          const value = readAccountControlStatus(row);
          return value ? { value, label: value } : undefined;
        }));
        options.accountCategories = toFieldOptions('accountCategory');
        if (canReadDevices) {
          options.loginDevices = uniqueOptions(((visible[STORAGE_KEYS.ASSET_DEVICES] || []) as AssetDevice[])
            .map((device) => ({ value: device.id, label: `${device.deviceCode} / ${device.deviceName}` })));
        }
      }
      return success(options);
    },
    async detail(type: AssetType, id: string, user: AuthenticatedUser) {
      const visible = await loadVisible(user);
      const devices = hasPermission(user, PERMISSION_KEYS.ASSETS_DEVICES, 'read')
        ? (visible[STORAGE_KEYS.ASSET_DEVICES] || []) as AssetDevice[]
        : [];
      const phones = hasPermission(user, PERMISSION_KEYS.ASSETS_PHONES, 'read')
        ? (visible[STORAGE_KEYS.ASSET_PHONE_NUMBERS] || []) as AssetPhoneNumber[]
        : [];
      const accounts = hasPermission(user, PERMISSION_KEYS.ASSETS_ACCOUNTS, 'read')
        ? (visible[STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS] || []) as AssetInternetAccount[]
        : [];
      const risks = hasPermission(user, PERMISSION_KEYS.ASSETS_RISKS, 'read')
        ? (visible[STORAGE_KEYS.ASSET_RISKS] || []) as AssetRisk[]
        : [];
      const logs = hasPermission(user, PERMISSION_KEYS.ASSETS_LOGS, 'read')
        ? (visible[STORAGE_KEYS.ASSET_OPERATION_LOGS] || []) as AssetOperationLog[]
        : [];
      let bundle: AssetDetailBundle | null = null;

      if (type === 'device') {
        const device = devices.find((item) => item.id === id);
        if (device) {
          const relatedPhones = phones.filter((phone) => phone.deviceId === id);
          const relatedPhoneIds = new Set(relatedPhones.map((phone) => phone.id));
          const relatedAccounts = accounts.filter((account) => (
            normalizeAccountLoginDeviceIds(account.loginDeviceIds).includes(id)
            || Boolean(account.phoneId && relatedPhoneIds.has(account.phoneId))
          ));
          const ids = new Set([id, ...relatedPhones.map((phone) => phone.id), ...relatedAccounts.map((account) => account.id)]);
          bundle = { type, device, relatedPhones, relatedAccounts, risks: risks.filter((risk) => ids.has(risk.targetId)), logs: logs.filter((log) => ids.has(log.targetId)) };
        }
      } else if (type === 'phone') {
        const phone = phones.find((item) => item.id === id);
        if (phone) {
          const relatedDevice = devices.find((device) => device.id === phone.deviceId);
          const relatedAccounts = accounts.filter((account) => account.phoneId === id);
          const ids = new Set([id, relatedDevice?.id || '', ...relatedAccounts.map((account) => account.id)]);
          bundle = { type, phone, relatedDevice, relatedPhones: [phone], relatedAccounts, risks: risks.filter((risk) => ids.has(risk.targetId)), logs: logs.filter((log) => ids.has(log.targetId)) };
        }
      } else {
        const account = accounts.find((item) => item.id === id);
        if (account) {
          const relatedDevices = devices.filter((device) => normalizeAccountLoginDeviceIds(account.loginDeviceIds).includes(device.id));
          const relatedPhones = phones.filter((phone) => phone.id === account.phoneId);
          const identityIds = new Set(normalizeIdentityAccountIds(account.identityAccountIds));
          const relatedAccounts = accounts.filter((item) => (
            item.id === account.id
            || identityIds.has(item.id)
            || normalizeIdentityAccountIds(item.identityAccountIds).includes(account.id)
          ));
          const ids = new Set([...relatedDevices.map((device) => device.id), ...relatedPhones.map((phone) => phone.id), ...relatedAccounts.map((item) => item.id)]);
          bundle = { type, account, relatedDevices, relatedPhones, relatedAccounts, risks: risks.filter((risk) => ids.has(risk.targetId)), logs: logs.filter((log) => ids.has(log.targetId)) };
        }
      }
      return success(bundle);
    },
    async relationships(filters: AssetFilters, user: AuthenticatedUser) {
      const visible = await loadVisible(user);
      const devices = hasPermission(user, PERMISSION_KEYS.ASSETS_DEVICES, 'read')
        ? (visible[STORAGE_KEYS.ASSET_DEVICES] || []) as AssetDevice[]
        : [];
      const phones = hasPermission(user, PERMISSION_KEYS.ASSETS_PHONES, 'read')
        ? (visible[STORAGE_KEYS.ASSET_PHONE_NUMBERS] || []) as AssetPhoneNumber[]
        : [];
      const accounts = hasPermission(user, PERMISSION_KEYS.ASSETS_ACCOUNTS, 'read')
        ? (visible[STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS] || []) as AssetInternetAccount[]
        : [];
      const keyword = text(filters.search).trim();
      const rows = devices.map<AssetOverviewRelationshipRow>((device) => ({
        device,
        phones: phones.filter((phone) => phone.deviceId === device.id),
        accounts: accounts.filter((account) => normalizeAccountLoginDeviceIds(account.loginDeviceIds).includes(device.id)),
      })).filter((row) => {
        if (filters.status && row.device.status !== filters.status) return false;
        if (!keyword) return true;
        return [
          row.device.deviceCode,
          row.device.deviceName,
          row.device.brand,
          row.device.model,
          row.device.department,
          row.device.owner,
          row.device.currentUser,
          ...row.phones.flatMap((phone) => [phone.phoneNumber, phone.phoneNumberMasked, phone.realName, phone.operator]),
          ...row.accounts.flatMap((account) => [account.platform, account.accountName, account.loginAccount, account.loginAccountMasked]),
        ].some((value) => text(value).includes(keyword));
      });
      const page = Math.max(1, Number(filters.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize) || 10));
      const start = (page - 1) * pageSize;
      return success({
        items: rows.slice(start, start + pageSize),
        pagination: {
          page,
          pageSize,
          total: rows.length,
          totalPages: Math.max(1, Math.ceil(rows.length / pageSize)),
        },
      });
    },
    async dashboard(user: AuthenticatedUser) {
      const visible = await loadVisible(user);
      const canReadDevices = hasPermission(user, PERMISSION_KEYS.ASSETS_DEVICES, 'read');
      const canReadPhones = hasPermission(user, PERMISSION_KEYS.ASSETS_PHONES, 'read');
      const canReadAccounts = hasPermission(user, PERMISSION_KEYS.ASSETS_ACCOUNTS, 'read');
      const devices = canReadDevices
        ? (visible[STORAGE_KEYS.ASSET_DEVICES] || []) as AssetDevice[]
        : [];
      const phones = canReadPhones
        ? (visible[STORAGE_KEYS.ASSET_PHONE_NUMBERS] || []) as AssetPhoneNumber[]
        : [];
      const accounts = canReadAccounts
        ? (visible[STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS] || []) as AssetInternetAccount[]
        : [];
      const risks = hasPermission(user, PERMISSION_KEYS.ASSETS_RISKS, 'read')
        ? (visible[STORAGE_KEYS.ASSET_RISKS] || []) as AssetRisk[]
        : [];
      const offboarding = hasPermission(user, PERMISSION_KEYS.ASSETS_OFFBOARDING, 'read')
        ? (visible[STORAGE_KEYS.ASSET_OFFBOARDING_TASKS] || []) as AssetOffboardingTask[]
        : [];
      const deviceMonthlyCost = devices.reduce((sum, row) => sum + Number(row.monthlyCost || 0), 0);
      const phoneMonthlyCost = phones.reduce((sum, row) => sum + Number(row.monthlyFee || 0), 0);
      const accountMonthlyCost = accounts.reduce((sum, row) => sum + Number(row.monthlyFee || 0), 0);
      const canReadPhoneDeviceRelationship = canReadPhones && canReadDevices;
      const canReadAccountPhoneRelationship = canReadAccounts && canReadPhones;
      const canReadAccountDeviceRelationship = canReadAccounts && canReadDevices;
      const boundPhoneCount = canReadPhoneDeviceRelationship ? phones.filter((phone) => Boolean(phone.deviceId)).length : 0;
      const boundAccountCount = canReadAccountPhoneRelationship ? accounts.filter((account) => Boolean(account.phoneId)).length : 0;
      const accountsWithLoginDevice = canReadAccountDeviceRelationship
        ? accounts.filter((account) => normalizeAccountLoginDeviceIds(account.loginDeviceIds).length > 0).length
        : 0;
      const credentialPending = accounts.filter((account) => (
        account.loginCredentialStatus === '待补齐' || account.paymentCredentialStatus === '待补齐'
      )).length;
      const openRiskCount = risks.filter((risk) => risk.status === 'open').length;
      const offboardingCount = offboarding.filter((task) => task.status === '待回收').length;
      const unassignedDevices = devices.filter((device) => !device.currentUserId && !device.currentUser).length;
      return success<AssetDashboard>({
        deviceCount: devices.length,
        phoneCount: phones.length,
        accountCount: accounts.length,
        openRiskCount,
        offboardingCount,
        monthlyCost: deviceMonthlyCost + phoneMonthlyCost + accountMonthlyCost,
        unboundAccountCount: canReadAccountPhoneRelationship ? accounts.length - boundAccountCount : 0,
        deviceSummary: {
          total: devices.length,
          inUse: devices.filter((device) => device.status === '使用中').length,
          inventory: devices.filter((device) => device.status === '库存中').length,
          attention: devices.filter((device) => !['使用中', '库存中'].includes(device.status)).length,
          unassignedUser: unassignedDevices,
          monthlyCost: deviceMonthlyCost,
        },
        phoneSummary: {
          total: phones.length,
          boundDevice: boundPhoneCount,
          unboundDevice: canReadPhoneDeviceRelationship ? phones.length - boundPhoneCount : 0,
          inUse: phones.filter((phone) => phone.status === '使用中').length,
          inactive: phones.filter((phone) => phone.status !== '使用中').length,
          monthlyCost: phoneMonthlyCost,
        },
        accountSummary: {
          total: accounts.length,
          withLoginDevice: accountsWithLoginDevice,
          withoutLoginDevice: canReadAccountDeviceRelationship ? accounts.length - accountsWithLoginDevice : 0,
          boundPhone: boundAccountCount,
          unboundPhone: canReadAccountPhoneRelationship ? accounts.length - boundAccountCount : 0,
          credentialPending,
          monthlyCost: accountMonthlyCost,
        },
        relationshipHealth: {
          openRisks: openRiskCount,
          offboarding: offboardingCount,
          unassignedDevices,
          unboundPhones: canReadPhoneDeviceRelationship ? phones.length - boundPhoneCount : 0,
          accountsWithoutLoginDevice: canReadAccountDeviceRelationship ? accounts.length - accountsWithLoginDevice : 0,
          accountsWithoutPhone: canReadAccountPhoneRelationship ? accounts.length - boundAccountCount : 0,
          credentialPending,
        },
      });
    },
  };
}

export function isAssetListKind(value: string): value is AssetListKind {
  return value in KEY_BY_KIND;
}
