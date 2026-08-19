import type { AuthenticatedUser } from '../../src/types/auth';
import type {
  AssetDevice,
  AssetDashboard,
  AssetDetailBundle,
  AssetFilters,
  AssetInternetAccount,
  AssetOverviewRelationshipRow,
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
import { readAccountControlStatus } from '../../src/domain/assets/assetFields';
import { normalizeAccountLoginDeviceIds } from '../../src/domain/assets/accountDeviceBindings';
import { normalizeIdentityAccountIds } from '../../src/domain/assets/accountIdentityBindings';
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

function matchesSearch(
  row: AssetRow,
  keyword: string,
  accountById?: Map<string, AssetInternetAccount>,
  deviceById?: Map<string, AssetDevice>,
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
): boolean {
  if (!matchesSearch(row, text(filters.search).trim(), accountById, deviceById)) return false;
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
  return true;
}

export function createAssetListService(
  storage: AssetStorageReader,
  readContext: () => Promise<AssetContext>,
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

  return {
    invalidate() {
      bundlePromise = null;
      bundleLoadedAt = 0;
    },
    async list(kind: AssetListKind, filters: AssetFilters, user: AuthenticatedUser) {
      const visible = await loadVisible(user);
      const rows = (Array.isArray(visible[KEY_BY_KIND[kind]]) ? visible[KEY_BY_KIND[kind]] : []) as AssetRow[];
      const visibleAccounts = hasPermission(user, PERMISSION_KEYS.ASSETS_ACCOUNTS, 'read')
        ? (visible[STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS] || []) as AssetInternetAccount[]
        : [];
      const accountById = kind === 'accounts' ? new Map(visibleAccounts.map((account) => [account.id, account])) : undefined;
      const visibleDevices = (visible[STORAGE_KEYS.ASSET_DEVICES] || []) as AssetDevice[];
      const deviceById = kind === 'accounts' ? new Map(visibleDevices.map((device) => [device.id, device])) : undefined;
      const accountCountByDeviceId = kind === 'devices'
        ? visibleAccounts.reduce((counts, account) => {
          normalizeAccountLoginDeviceIds(account.loginDeviceIds).forEach((deviceId) => {
            counts.set(deviceId, (counts.get(deviceId) || 0) + 1);
          });
          return counts;
        }, new Map<string, number>())
        : undefined;
      const rowsWithRelationshipCounts = kind === 'devices'
        ? (rows as AssetDevice[]).map((device) => ({
          ...device,
          internetAccountCount: accountCountByDeviceId?.get(device.id) || 0,
        }))
        : rows;
      const filtered = rowsWithRelationshipCounts.filter((row) => matchesFilters(kind, row, filters, accountById, deviceById));
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
          const relatedAccounts = accounts.filter((account) => normalizeAccountLoginDeviceIds(account.loginDeviceIds).includes(id));
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
      const offboarding = hasPermission(user, PERMISSION_KEYS.ASSETS_OFFBOARDING, 'read')
        ? (visible[STORAGE_KEYS.ASSET_OFFBOARDING_TASKS] || []) as AssetOffboardingTask[]
        : [];
      const deviceMonthlyCost = devices.reduce((sum, row) => sum + Number(row.monthlyCost || 0), 0);
      const phoneMonthlyCost = phones.reduce((sum, row) => sum + Number(row.monthlyFee || 0), 0);
      const accountMonthlyCost = accounts.reduce((sum, row) => sum + Number(row.monthlyFee || 0), 0);
      const boundPhoneCount = phones.filter((phone) => Boolean(phone.deviceId)).length;
      const boundAccountCount = accounts.filter((account) => Boolean(account.phoneId)).length;
      const accountsWithLoginDevice = accounts.filter((account) => normalizeAccountLoginDeviceIds(account.loginDeviceIds).length > 0).length;
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
        unboundAccountCount: accounts.length - boundAccountCount,
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
          unboundDevice: phones.length - boundPhoneCount,
          inUse: phones.filter((phone) => phone.status === '使用中').length,
          inactive: phones.filter((phone) => phone.status !== '使用中').length,
          monthlyCost: phoneMonthlyCost,
        },
        accountSummary: {
          total: accounts.length,
          withLoginDevice: accountsWithLoginDevice,
          withoutLoginDevice: accounts.length - accountsWithLoginDevice,
          boundPhone: boundAccountCount,
          unboundPhone: accounts.length - boundAccountCount,
          credentialPending,
          monthlyCost: accountMonthlyCost,
        },
        relationshipHealth: {
          openRisks: openRiskCount,
          offboarding: offboardingCount,
          unassignedDevices,
          unboundPhones: phones.length - boundPhoneCount,
          accountsWithoutLoginDevice: accounts.length - accountsWithLoginDevice,
          accountsWithoutPhone: accounts.length - boundAccountCount,
          credentialPending,
        },
      });
    },
  };
}

export function isAssetListKind(value: string): value is AssetListKind {
  return value in KEY_BY_KIND;
}
