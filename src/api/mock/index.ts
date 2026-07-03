/** Mock 数据聚合导出 + localStorage 初始化 */
import { mockLeads } from './data/leads';
import { mockCustomers } from './data/customers';
import { mockOrders } from './data/orders';
import { mockDeliveries } from './data/deliveries';
import { mockCommissions } from './data/commissions';
import { mockFinanceDailyRecords, mockChannelROI } from './data/finance';
import { mockUsers } from './data/users';
import { mockDepartments } from './data/departments';
import { mockPositions } from './data/positions';
import { mockRoles } from './data/roles';
import { mockProducts } from './data/products';
import { mockProductLevelConfigs } from './data/productLevels';
import { mockRefunds } from './data/refunds';
import { mockCommissionRules } from './data/commissionRules';
import { mockTags } from './data/tags';
import {
  mockAssetDevices,
  mockAssetInternetAccounts,
  mockAssetOffboardingTasks,
  mockAssetOperationLogs,
  mockAssetPhoneNumbers,
  mockAssetRisks,
} from './data/assets';
import { getStorageData, initializeStorage, isStorageInitialized, markStorageInitialized, setStorageData } from './storage';
import { shouldUseBackendApi } from '../backendClient';
import { DEFAULT_LEAD_FLOW_CONFIG, DEFAULT_LEAD_SOURCE_CONFIGS, DEFAULT_LIFECYCLE_STATUS_CONFIGS, DEFAULT_ORDER_TYPE_CONFIGS, STORAGE_KEYS } from '../../shared/utils/constants';
import type { Product } from '../../types/product';

export { mockLeads } from './data/leads';
export { mockCustomers } from './data/customers';
export { mockOrders } from './data/orders';
export { mockDeliveries } from './data/deliveries';
export { mockCommissions } from './data/commissions';
export { mockFinanceDailyRecords, mockChannelROI } from './data/finance';
export { mockUsers } from './data/users';
export { mockDepartments } from './data/departments';
export { mockPositions } from './data/positions';
export { mockRoles } from './data/roles';
export { mockProducts } from './data/products';
export { mockProductLevelConfigs } from './data/productLevels';
export { mockRefunds } from './data/refunds';
export { mockCommissionRules } from './data/commissionRules';
export { mockTags } from './data/tags';
export {
  mockAssetDevices,
  mockAssetInternetAccounts,
  mockAssetOffboardingTasks,
  mockAssetOperationLogs,
  mockAssetPhoneNumbers,
  mockAssetRisks,
} from './data/assets';

const LEGACY_DEFAULT_DELIVERY_STAGES: Record<string, string[]> = {
  'prod-001': ['合同签订', '需求确认', '系统部署', '培训交付', '验收完成'],
  'prod-002': ['合同签订', '课程安排', '授课进行', '培训完成', '验收完成'],
  'prod-003': ['合同签订', '代理授权', '系统开通', '培训完成', '运营支持'],
  'prod-004': ['合同签订', '品牌定制', '系统部署', '测试验收', '上线运营'],
  'prod-005': ['合同签订', '需求确认', '系统部署', '培训交付', '验收完成'],
};

function isSameStringList(left: string[] = [], right: string[] = []): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function migrateLegacyDefaultProductDeliveryStages(): void {
  const products = getStorageData<Product[]>(STORAGE_KEYS.PRODUCTS);
  if (!products?.length) return;

  let changed = false;
  const nextProducts = products.map((product) => {
    const legacyStages = LEGACY_DEFAULT_DELIVERY_STAGES[product.id];
    if (legacyStages && isSameStringList(product.deliveryStages || [], legacyStages)) {
      changed = true;
      return { ...product, deliveryStages: [] };
    }
    return product;
  });

  if (changed) setStorageData(STORAGE_KEYS.PRODUCTS, nextProducts);
}

function businessSeed<T>(demoData: T, emptyData: T): T {
  return shouldUseBackendApi() ? emptyData : demoData;
}

function initializeAssetStorage(): void {
  initializeStorage(STORAGE_KEYS.ASSET_DEVICES, businessSeed(mockAssetDevices, []));
  initializeStorage(STORAGE_KEYS.ASSET_PHONE_NUMBERS, businessSeed(mockAssetPhoneNumbers, []));
  initializeStorage(STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS, businessSeed(mockAssetInternetAccounts, []));
  initializeStorage(STORAGE_KEYS.ASSET_RISKS, businessSeed(mockAssetRisks, []));
  initializeStorage(STORAGE_KEYS.ASSET_OPERATION_LOGS, businessSeed(mockAssetOperationLogs, []));
  initializeStorage(STORAGE_KEYS.ASSET_OFFBOARDING_TASKS, businessSeed(mockAssetOffboardingTasks, []));
}

/** 初始化所有 Mock 数据到 localStorage */
export function initializeMockData(): void {
  if (isStorageInitialized()) {
    initializeAssetStorage();
    migrateLegacyDefaultProductDeliveryStages();
    return;
  }

  initializeStorage(STORAGE_KEYS.LEADS, businessSeed(mockLeads, []));
  initializeStorage(STORAGE_KEYS.CUSTOMERS, businessSeed(mockCustomers, []));
  initializeStorage(STORAGE_KEYS.ORDERS, businessSeed(mockOrders, []));
  initializeStorage(STORAGE_KEYS.DELIVERIES, mockDeliveries);
  initializeStorage(STORAGE_KEYS.COMMISSIONS, businessSeed(mockCommissions, []));
  initializeStorage(STORAGE_KEYS.FINANCE, businessSeed({
    dailyRecords: mockFinanceDailyRecords,
    channelROI: mockChannelROI,
  }, {
    dailyRecords: [],
    channelROI: [],
  }));
  initializeStorage(STORAGE_KEYS.USERS, mockUsers);
  initializeStorage(STORAGE_KEYS.AI_SESSIONS, []);
  initializeStorage(STORAGE_KEYS.DEPARTMENTS, mockDepartments);
  initializeStorage(STORAGE_KEYS.POSITIONS, mockPositions);
  initializeStorage(STORAGE_KEYS.ROLES, mockRoles);
  initializeStorage(STORAGE_KEYS.PRODUCTS, mockProducts);
  initializeStorage(STORAGE_KEYS.PRODUCT_LEVELS, mockProductLevelConfigs);
  initializeStorage(STORAGE_KEYS.ORDER_TYPE_CONFIGS, DEFAULT_ORDER_TYPE_CONFIGS);
  initializeStorage(STORAGE_KEYS.LIFECYCLE_STATUS_CONFIGS, DEFAULT_LIFECYCLE_STATUS_CONFIGS);
  initializeStorage(STORAGE_KEYS.REFUNDS, businessSeed(mockRefunds, []));
  initializeStorage(STORAGE_KEYS.RECOVERY_ORDERS, []);
  initializeStorage(STORAGE_KEYS.AI_CARDS, []);
  initializeStorage(STORAGE_KEYS.SERVICE_TICKETS, []);
  initializeStorage(STORAGE_KEYS.OPPORTUNITIES, []);
  initializeStorage(STORAGE_KEYS.LEAD_FLOW_CONFIG, DEFAULT_LEAD_FLOW_CONFIG);
  initializeStorage(STORAGE_KEYS.LEAD_INTAKE_RECORDS, []);
  initializeStorage(STORAGE_KEYS.LEAD_SOURCE_CONFIGS, DEFAULT_LEAD_SOURCE_CONFIGS);
  initializeStorage(STORAGE_KEYS.COMMISSION_RULES, mockCommissionRules);
  initializeStorage(STORAGE_KEYS.COMMISSION_ROLE_CONFIGS, []);
  initializeStorage(STORAGE_KEYS.TAGS, mockTags);
  initializeAssetStorage();

  markStorageInitialized();
  migrateLegacyDefaultProductDeliveryStages();
}

/** 重置 Mock 数据 */
export function resetMockData(): void {
  localStorage.removeItem(STORAGE_KEYS.INITIALIZED);
  initializeMockData();
}
