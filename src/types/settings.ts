import type { ID, Timestamp } from './common';

/** 用户角色 */
export type UserRole = '超级管理员' | '管理员' | '销售经理' | '销售' | '运营' | '财务';

/** 用户 */
export interface User {
  id: ID;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  avatar?: string;
  departmentId?: ID;
  roleId?: ID;
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

/** 渠道配置 */
export interface ChannelConfig {
  id: ID;
  name: string;
  type: string;
  budget: number;
  isActive: boolean;
  description: string;
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
  name: string;
  description?: string;
  color: string;
  isActive: boolean;
  sortOrder: number;
  isSystem?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** 设置筛选 */
export interface SettingsFilters {
  search?: string;
  role?: UserRole;
  isActive?: boolean;
}
