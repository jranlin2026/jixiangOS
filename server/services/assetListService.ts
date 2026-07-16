import type { AuthenticatedUser } from '../../src/types/auth';
import type {
  AssetDevice,
  AssetDashboard,
  AssetFilters,
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

function matchesSearch(row: AssetRow, keyword: string): boolean {
  if (!keyword) return true;
  return Object.values(row as unknown as Record<string, unknown>).some((value) => {
    if (Array.isArray(value)) return value.some((entry) => text(JSON.stringify(entry)).includes(keyword));
    return typeof value !== 'object' && text(value).includes(keyword);
  });
}

function matchesFilters(kind: AssetListKind, row: AssetRow, filters: AssetFilters): boolean {
  if (!matchesSearch(row, text(filters.search).trim())) return false;
  const value = row as unknown as Record<string, unknown>;
  if (filters.platform && (kind === 'matrix-publish'
    ? !(value.targets as AssetMatrixPublishTask['targets']).some((target) => target.platform === filters.platform)
    : value.platform !== filters.platform)) return false;
  if (filters.permissionStatus && value.permissionStatus !== filters.permissionStatus) return false;
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
    async list(kind: AssetListKind, filters: AssetFilters, user: AuthenticatedUser) {
      const visible = await loadVisible(user);
      const rows = (Array.isArray(visible[KEY_BY_KIND[kind]]) ? visible[KEY_BY_KIND[kind]] : []) as AssetRow[];
      const filtered = rows.filter((row) => matchesFilters(kind, row, filters));
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
    async dashboard(user: AuthenticatedUser) {
      const visible = await loadVisible(user);
      const devices = (visible[STORAGE_KEYS.ASSET_DEVICES] || []) as AssetDevice[];
      const phones = (visible[STORAGE_KEYS.ASSET_PHONE_NUMBERS] || []) as AssetPhoneNumber[];
      const accounts = (visible[STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS] || []) as AssetInternetAccount[];
      const risks = (visible[STORAGE_KEYS.ASSET_RISKS] || []) as AssetRisk[];
      const offboarding = (visible[STORAGE_KEYS.ASSET_OFFBOARDING_TASKS] || []) as AssetOffboardingTask[];
      return success<AssetDashboard>({
        deviceCount: devices.length,
        phoneCount: phones.length,
        accountCount: accounts.length,
        openRiskCount: risks.filter((risk) => risk.status === 'open').length,
        offboardingCount: offboarding.filter((task) => task.status === '待回收').length,
        monthlyCost: devices.reduce((sum, row) => sum + Number(row.monthlyCost || 0), 0)
          + phones.reduce((sum, row) => sum + Number(row.monthlyFee || 0), 0),
        unboundAccountCount: accounts.filter((account) => !account.phoneId).length,
      });
    },
  };
}

export function isAssetListKind(value: string): value is AssetListKind {
  return value in KEY_BY_KIND;
}
