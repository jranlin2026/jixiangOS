import type { Permission, Role } from '../../types/role';
import type { AuthenticatedUser } from '../../types/auth';
import type { User } from '../../types/settings';
import { normalizeUserRoleName } from './roles';

export const PERMISSION_KEYS = {
  HOME: '首页',
  DASHBOARD: '驾驶舱',
  LEADS: '线索',
  LEADS_CREATE: '线索/线索池',
  LEADS_FLOW_CONFIG: '线索/线索分配',
  CUSTOMERS: '客户',
  CUSTOMER_CREATE: '客户/客户管理',
  CUSTOMER_DETAIL: '客户/客户详情',
  CUSTOMER_CREATE_ORDER: '客户/新建客户订单',
  CUSTOMER_VIEW_ORDERS: '客户/查看客户订单',
  ORDERS: '订单',
  ORDER_REVIEW: '订单/订单审核台',
  ORDER_CREATE: '订单/新增订单',
  ORDER_EDIT: '订单/编辑订单',
  ORDER_DELETE: '订单/删除订单',
  ORDER_HISTORY: '订单/订单修改记录',
  DELIVERY: '交付',
  COMMISSION: '提成',
  FINANCE: '财务',
  REFUND_CENTER: '退款中心',
  UPGRADE_POOL: '升单',
  UPGRADE_ANALYSIS: '升单/升单分析',
  AI_ASSISTANT: 'AI助手',
  SETTINGS: '系统设置',
  SETTINGS_EMPLOYEES_DEPARTMENTS: '系统设置/组织权限/员工&部门',
  SETTINGS_USERS: '系统设置/组织权限/员工&部门',
  SETTINGS_ROLES: '系统设置/组织权限/角色权限',
  SETTINGS_DEPARTMENTS: '系统设置/组织权限/员工&部门',
  SETTINGS_PRODUCTS: '系统设置/业务配置/产品配置',
  SETTINGS_ORDER_TYPES: '系统设置/业务配置/订单类型配置',
  SETTINGS_LIFECYCLE: '系统设置/业务配置/生命周期状态',
  SETTINGS_LEAD_SOURCES: '系统设置/业务配置/线索来源',
} as const;

const SUPER_ADMIN_NAMES = new Set(['超级管理员', 'super_admin']);

const MODULE_ALIASES: Record<string, string[]> = {
  财务结算台: ['提成', '财务结算台'],
  提成: ['提成', '财务结算台'],
  升单池: ['升单', '升单池'],
  升单分析: ['升单', '升单分析'],
  数据: ['驾驶舱', '首页', '升单分析'],
  商机: ['线索', '客户'],
};

const ROLE_CODE_BY_USER_ROLE: Record<string, string> = {
  超级管理员: 'super_admin',
  管理员: 'super_admin',
  销售经理: 'sales_manager',
  销售顾问: 'sales_consultant',
  销售: 'sales_consultant',
  运营专员: 'ops_specialist',
  运营: 'ops_specialist',
  交付工程师: 'delivery_engineer',
  财务专员: 'finance_specialist',
  财务: 'finance_specialist',
  市场专员: 'market_specialist',
};

export function isSuperAdmin(user?: Pick<AuthenticatedUser, 'role' | 'permissions'> | null): boolean {
  if (!user) return false;
  if (SUPER_ADMIN_NAMES.has(String(user.role))) return true;
  return user.permissions?.some((permission) => normalizePermissionKey(permission.module) === '全部') || false;
}

export function resolveUserPermissions(user: User, roles: Role[]): Permission[] {
  const normalizedRole = normalizeUserRoleName(user.role);
  const mappedCode = ROLE_CODE_BY_USER_ROLE[normalizedRole] || ROLE_CODE_BY_USER_ROLE[String(user.role)];
  const role = roles.find((item) => (
    item.isActive
    && (
      item.id === user.roleId
      || item.name === normalizedRole
      || Boolean(mappedCode && item.code === mappedCode)
    )
  ));
  if (role?.permissions?.length) return role.permissions;
  if (normalizedRole === '超级管理员') return [{ module: '全部', actions: ['read', 'write', 'delete', 'admin'] }];
  return [{ module: normalizedRole, actions: ['read'] }];
}

export function toAuthenticatedUser(user: User, roles: Role[]): AuthenticatedUser {
  return {
    id: user.id,
    name: user.name,
    account: user.account || '',
    email: user.email,
    phone: user.phone,
    role: normalizeUserRoleName(user.role),
    roleId: user.roleId,
    avatar: user.avatar,
    departmentId: user.departmentId,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    permissions: resolveUserPermissions(user, roles),
  };
}

export function normalizePermissionKey(value: string): string {
  return String(value || '').replace(/\s+/g, '').trim();
}

function actionAllowed(actions: string[], requestedAction: string): boolean {
  if (actions.includes('admin')) return true;
  if (requestedAction === 'read') return actions.some((action) => ['read', 'write', 'delete'].includes(action));
  if (requestedAction === 'write') return actions.some((action) => ['write', 'delete'].includes(action));
  return actions.includes(requestedAction);
}

function expandAliases(module: string): string[] {
  const normalized = normalizePermissionKey(module);
  const aliases = MODULE_ALIASES[normalized] || [];
  return [normalized, ...aliases.map(normalizePermissionKey)];
}

export function hasPermission(
  user: Pick<AuthenticatedUser, 'role' | 'permissions' | 'isActive'> | null | undefined,
  permissionKey: string,
  action = 'read',
): boolean {
  if (!user?.isActive) return false;
  if (normalizePermissionKey(permissionKey) === '首页') return true;
  if (isSuperAdmin(user)) return true;

  const requestedKeys = expandAliases(permissionKey);
  return user.permissions.some((permission) => {
    if (!actionAllowed(permission.actions || [], action)) return false;
    const grantedKeys = expandAliases(permission.module);
    return grantedKeys.some((granted) => (
      requestedKeys.some((requested) => (
        requested === granted || requested.startsWith(`${granted}/`) || granted.startsWith(`${requested}/`)
      ))
    ));
  });
}
