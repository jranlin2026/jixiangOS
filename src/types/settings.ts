import type { ID, Timestamp } from './common';

/** 用户角色 */
export type UserRole = string;

export type LifecycleStatusCode =
  | 'pending_followup'
  | 'following'
  | 'ordered'
  | 'refunded'
  | 'public_pool';

/** 用户 */
export interface User {
  id: ID;
  name: string;
  account?: string;
  email: string;
  phone: string;
  role: UserRole;
  avatar?: string;
  departmentId?: ID;
  positionId?: ID;
  positionName?: string;
  roleId?: ID;
  passwordHash?: string;
  passwordSalt?: string;
  passwordUpdatedAt?: Timestamp;
  lastLoginAt?: Timestamp;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** 产品配置 */
export interface ProductConfig {
  id: ID;
  name: string;
  level: string;
  price: number;
  commissionRate: number;
  description: string;
  isActive: boolean;
}

/** 线索来源配置：一级来源 + 二级来源 */
export interface LeadSourceConfig {
  id: ID;
  name: string;
  parentId?: ID;
  isActive: boolean;
  sortOrder: number;
  description?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** 订单类型配置 */
export interface OrderTypeConfig {
  id: ID;
  name: string;
  description?: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** 线索/客户生命周期状态配置 */
export interface LifecycleStatusConfig {
  id: ID;
  code: LifecycleStatusCode;
  name: string;
  description?: string;
  color: string;
  isActive: boolean;
  sortOrder: number;
  isSystem?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** 客户等级配置 */
export interface CustomerLevelConfig {
  id: ID;
  value: string;
  label: string;
  color: string;
  description?: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** 设置筛选 */
export interface SettingsFilters {
  search?: string;
  role?: UserRole;
  isActive?: boolean;
}
