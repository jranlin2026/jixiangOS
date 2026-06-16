import type { ID, Timestamp } from './common';

/** 部门 */
export interface Department {
  id: ID;
  name: string;
  code: string;
  parentId?: ID;
  managerId?: ID;
  memberCount: number;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** 部门筛选参数 */
export interface DepartmentFilters {
  search?: string;
  isActive?: boolean;
}
