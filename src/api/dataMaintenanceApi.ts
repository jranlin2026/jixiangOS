import type { User } from '../types/settings';
import type { ApiResponse } from './types';
import { createSuccessResponse } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { STORAGE_KEYS } from '../shared/utils/constants';
import { ensureAdminUser } from '../shared/utils/auth';
import { ensureOrganizationConfigData, migrateUsersWithOrganization } from '../shared/utils/organizationConfig';

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
  { key: STORAGE_KEYS.REFUNDS, label: '退款', description: '退款中心申请与处理记录' },
  { key: STORAGE_KEYS.COMMISSIONS, label: '提成', description: '订单提成、分账与结算明细' },
  { key: STORAGE_KEYS.COMMISSION_SETTLEMENT_BATCHES, label: '提成结算批次', description: '财务结算台批次记录' },
  { key: STORAGE_KEYS.UPGRADE_POOL, label: '升单池', description: '升单机会与升单跟进数据' },
  { key: STORAGE_KEYS.OPPORTUNITIES, label: '商机兼容数据', description: '旧商机兼容缓存' },
  { key: STORAGE_KEYS.LEAD_INTAKE_RECORDS, label: '入库记录', description: '线索入库成功、失败、重复原因记录' },
  { key: STORAGE_KEYS.CUSTOMER_SUCCESS_TASKS, label: '客户成功任务', description: '客户成功待办和续费任务' },
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

export function clearBusinessTestData(): ApiResponse<{ clearedKeys: string[] }> {
  BUSINESS_DATA_STORAGE_KEYS.forEach((item) => setStorageData(item.key, []));
  setStorageData(STORAGE_KEYS.FINANCE, FINANCE_EMPTY_VALUE);
  Object.keys(localStorage)
    .filter((key) => key.startsWith(CONTRACT_KEY_PREFIX))
    .forEach((key) => localStorage.removeItem(key));
  repairOrganizationStorage();
  localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
  return createSuccessResponse({ clearedKeys: BUSINESS_DATA_STORAGE_KEYS.map((item) => item.key) });
}
