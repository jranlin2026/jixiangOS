import type { ID, Timestamp } from './common';

/** 权限 */
export interface Permission {
  module: string;
  actions: string[];
}

/** 角色 */
export interface Role {
  id: ID;
  name: string;
  code: string;
  departmentId?: ID;
  permissions: Permission[];
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
