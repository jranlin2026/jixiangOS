import type { ID, Timestamp } from './common';
import type { PositionDepartmentScope } from '../shared/utils/positionApplicability';

export type { PositionDepartmentScope } from '../shared/utils/positionApplicability';

/** 岗位配置：只表达岗位职责，不控制系统权限 */
export interface Position {
  id: ID;
  name: string;
  code: string;
  departmentId?: ID;
  departmentScope: PositionDepartmentScope;
  description?: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PositionFilters {
  search?: string;
  departmentId?: ID;
  isActive?: boolean;
}
