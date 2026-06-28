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
import { mockUpgradePool } from './data/upgradePool';
import { mockCommissionRules } from './data/commissionRules';
import { mockTags } from './data/tags';
import { initializeStorage, isStorageInitialized, markStorageInitialized } from './storage';
import { DEFAULT_LEAD_FLOW_CONFIG, DEFAULT_LEAD_SOURCE_CONFIGS, DEFAULT_LIFECYCLE_STATUS_CONFIGS, DEFAULT_ORDER_TYPE_CONFIGS, STORAGE_KEYS } from '../../shared/utils/constants';

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
export { mockUpgradePool } from './data/upgradePool';
export { mockCommissionRules } from './data/commissionRules';
export { mockTags } from './data/tags';

/** 初始化所有 Mock 数据到 localStorage */
export function initializeMockData(): void {
  if (isStorageInitialized()) return;

  initializeStorage(STORAGE_KEYS.LEADS, mockLeads);
  initializeStorage(STORAGE_KEYS.CUSTOMERS, mockCustomers);
  initializeStorage(STORAGE_KEYS.ORDERS, mockOrders);
  initializeStorage(STORAGE_KEYS.DELIVERIES, mockDeliveries);
  initializeStorage(STORAGE_KEYS.COMMISSIONS, mockCommissions);
  initializeStorage(STORAGE_KEYS.FINANCE, {
    dailyRecords: mockFinanceDailyRecords,
    channelROI: mockChannelROI,
  });
  initializeStorage(STORAGE_KEYS.USERS, mockUsers);
  initializeStorage(STORAGE_KEYS.AI_SESSIONS, []);
  initializeStorage(STORAGE_KEYS.DEPARTMENTS, mockDepartments);
  initializeStorage(STORAGE_KEYS.POSITIONS, mockPositions);
  initializeStorage(STORAGE_KEYS.ROLES, mockRoles);
  initializeStorage(STORAGE_KEYS.PRODUCTS, mockProducts);
  initializeStorage(STORAGE_KEYS.PRODUCT_LEVELS, mockProductLevelConfigs);
  initializeStorage(STORAGE_KEYS.ORDER_TYPE_CONFIGS, DEFAULT_ORDER_TYPE_CONFIGS);
  initializeStorage(STORAGE_KEYS.LIFECYCLE_STATUS_CONFIGS, DEFAULT_LIFECYCLE_STATUS_CONFIGS);
  initializeStorage(STORAGE_KEYS.REFUNDS, mockRefunds);
  initializeStorage(STORAGE_KEYS.RECOVERY_ORDERS, []);
  initializeStorage(STORAGE_KEYS.UPGRADE_POOL, mockUpgradePool);
  initializeStorage(STORAGE_KEYS.AI_CARDS, []);
  initializeStorage(STORAGE_KEYS.CUSTOMER_SUCCESS_TASKS, []);
  initializeStorage(STORAGE_KEYS.SERVICE_TICKETS, []);
  initializeStorage(STORAGE_KEYS.OPPORTUNITIES, []);
  initializeStorage(STORAGE_KEYS.LEAD_FLOW_CONFIG, DEFAULT_LEAD_FLOW_CONFIG);
  initializeStorage(STORAGE_KEYS.LEAD_INTAKE_RECORDS, []);
  initializeStorage(STORAGE_KEYS.LEAD_SOURCE_CONFIGS, DEFAULT_LEAD_SOURCE_CONFIGS);
  initializeStorage(STORAGE_KEYS.COMMISSION_RULES, mockCommissionRules);
  initializeStorage(STORAGE_KEYS.COMMISSION_ROLE_CONFIGS, []);
  initializeStorage(STORAGE_KEYS.TAGS, mockTags);

  markStorageInitialized();
}

/** 重置 Mock 数据 */
export function resetMockData(): void {
  localStorage.removeItem(STORAGE_KEYS.INITIALIZED);
  initializeMockData();
}
