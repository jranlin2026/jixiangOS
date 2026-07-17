import type { ID, Timestamp } from './common';

/** 权限 */
export interface Permission {
  module: string;
  actions: string[];
}

export type DataScopeLevel = 'self' | 'department' | 'all';

export type CustomerDataScopeLevel = 'self' | 'department_only' | 'department_and_descendants' | 'all';

export type LegacyCustomerDataScopeInput = CustomerDataScopeLevel | 'department';

export type DataScopeDomain =
  | 'leads'
  | 'customers'
  | 'orders'
  | 'deliveries'
  | 'orderApplications'
  | 'recoveryOrders'
  | 'recoveryOrderApplications'
  | 'assets';

export type NonCustomerDataScopeDomain = Exclude<DataScopeDomain, 'customers'>;

export type RoleDataScopes = Partial<Record<NonCustomerDataScopeDomain, DataScopeLevel>> & {
  customers?: LegacyCustomerDataScopeInput;
};

export type NormalizedRoleDataScopes = Required<Record<NonCustomerDataScopeDomain, DataScopeLevel>> & {
  customers: CustomerDataScopeLevel;
};

export function normalizeCustomerDataScope(value: LegacyCustomerDataScopeInput): CustomerDataScopeLevel {
  return value === 'department' ? 'department_and_descendants' : value;
}

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
