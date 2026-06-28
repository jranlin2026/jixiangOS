import type { User } from '../types/settings';
import type { ApiResponse } from './types';
import { createSuccessResponse } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { STORAGE_KEYS } from '../shared/utils/constants';
import { ensureAdminUser } from '../shared/utils/auth';
import { ensureOrganizationConfigData, migrateUsersWithOrganization } from '../shared/utils/organizationConfig';
import { backendRequest, shouldUseBackendApi } from './backendClient';

export type BusinessDataStorageKey = {
  key: string;
  label: string;
  description: string;
};

export const BUSINESS_DATA_STORAGE_KEYS: BusinessDataStorageKey[] = [
  { key: STORAGE_KEYS.LEADS, label: '线索', description: '线索列表、领取状态、线索历史' },
  { key: STORAGE_KEYS.CUSTOMERS, label: '客户', description: '客户列表、公海池、客户动态' },
  { key: STORAGE_KEYS.ORDERS, label: '订单', description: '正式订单列表和订单状态' },
  { key: STORAGE_KEYS.ORDER_APPLICATIONS, label: '订单申请', description: '订单审核台待审、驳回、通过记录' },
  { key: STORAGE_KEYS.DELIVERIES, label: '交付', description: '订单交付进度和交付记录' },
  { key: STORAGE_KEYS.RECOVERY_ORDERS, label: '售后挽回订单', description: '第三方平台售后挽回与售后提成审核记录' },
  { key: STORAGE_KEYS.COMMISSIONS, label: '提成', description: '订单提成、分账与结算明细' },
  { key: STORAGE_KEYS.COMMISSION_OPERATION_LOGS, label: '分账操作历史', description: '订单分账调整、确认、取消和发放操作记录' },
  { key: STORAGE_KEYS.COMMISSION_SETTLEMENT_BATCHES, label: '提成结算批次', description: '财务结算台批次记录' },
  { key: STORAGE_KEYS.OPPORTUNITIES, label: '商机兼容数据', description: '旧商机兼容缓存' },
  { key: STORAGE_KEYS.LEAD_INTAKE_RECORDS, label: '入库记录', description: '线索入库成功、失败、重复原因记录' },
  { key: STORAGE_KEYS.SERVICE_TICKETS, label: '服务工单', description: '交付、售后服务工单' },
  { key: STORAGE_KEYS.AI_CARDS, label: 'AI名片', description: '客户相关 AI 名片内容' },
  { key: STORAGE_KEYS.AI_SESSIONS, label: 'AI会话', description: '基于旧业务数据生成的分析会话' },
];

export const FINANCE_EMPTY_VALUE = {
  dailyRecords: [],
  channelROI: [],
};

export const CONTRACT_KEY_PREFIX = 'aaos_customer_contracts_';

function repairOrganizationStorage(): void {
  ensureOrganizationConfigData();
  const users = getStorageData<User[]>(STORAGE_KEYS.USERS);
  setStorageData(STORAGE_KEYS.USERS, migrateUsersWithOrganization(ensureAdminUser(users || [])));
}

function listLocalStorageKeys(): string[] {
  const keys: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key) keys.push(key);
  }
  return keys;
}

export function clearBusinessTestData(): ApiResponse<{ clearedKeys: string[] }> {
  BUSINESS_DATA_STORAGE_KEYS.forEach((item) => setStorageData(item.key, []));
  setStorageData(STORAGE_KEYS.FINANCE, FINANCE_EMPTY_VALUE);
  listLocalStorageKeys()
    .filter((key) => key.startsWith(CONTRACT_KEY_PREFIX))
    .forEach((key) => localStorage.removeItem(key));
  repairOrganizationStorage();
  localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
  return createSuccessResponse({ clearedKeys: BUSINESS_DATA_STORAGE_KEYS.map((item) => item.key) });
}

function collectLocalCacheKeysForResync(): string[] {
  const configuredKeys = new Set<string>(Object.values(STORAGE_KEYS));
  listLocalStorageKeys()
    .filter((key) => key.startsWith(CONTRACT_KEY_PREFIX))
    .forEach((key) => configuredKeys.add(key));
  return Array.from(configuredKeys);
}

export async function resyncLocalCacheFromBackend(): Promise<ApiResponse<{ clearedKeys: string[]; restoredKeys: string[] }>> {
  if (!shouldUseBackendApi()) {
    return {
      code: -1,
      data: { clearedKeys: [], restoredKeys: [] },
      message: '当前未启用后端数据库模式，不能从服务器重新同步本机缓存。',
    };
  }

  let response: ApiResponse<Record<string, unknown>>;
  try {
    response = await backendRequest<Record<string, unknown>>('/storage');
  } catch {
    return {
      code: -1,
      data: { clearedKeys: [], restoredKeys: [] },
      message: '重新同步失败，请检查后端服务或网络连接后重试。',
    };
  }

  if (response.code !== 0 || !response.data) {
    return {
      code: response.code || -1,
      data: { clearedKeys: [], restoredKeys: [] },
      message: response.message || '从服务器读取缓存失败，请稍后重试。',
    };
  }

  const clearedKeys = collectLocalCacheKeysForResync();
  clearedKeys.forEach((key) => localStorage.removeItem(key));

  Object.entries(response.data).forEach(([key, value]) => {
    localStorage.setItem(key, JSON.stringify(value));
  });

  return createSuccessResponse({
    clearedKeys,
    restoredKeys: Object.keys(response.data),
  });
}
