import type { ID, Timestamp } from './common';

/** 权限 */
export interface Permission {
  module: string;
  actions: string[];
}

export type DataScopeLevel = 'self' | 'department' | 'all';

export type DataScopeDomain = 'leads' | 'customers' | 'orders' | 'orderApplications';

export type RoleDataScopes = Partial<Record<DataScopeDomain, DataScopeLevel>>;

/** 角色 */
export interface Role {
  id: ID;
  name: string;
  code: string;
  description?: string;
  departmentId?: ID;
  permissions: Permission[];
  dataScopes?: RoleDataScopes;
  memberCount: number;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** 角色筛选参数 */
export interface RoleFilters {
  search?: string;
  departmentId?: ID;
  isActive?: boolean;
}
