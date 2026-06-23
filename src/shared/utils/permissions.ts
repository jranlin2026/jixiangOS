import type { Permission, Role } from '../../types/role';
import type { AuthenticatedUser } from '../../types/auth';
import type { User } from '../../types/settings';
import { normalizeUserRoleName } from './roles';

export const CAPABILITY_KEYS = {
  LEADS_RECEIVE: 'leads.receive',
  LEADS_ASSIGN: 'leads.assign',
} as const;

export const PERMISSION_KEYS = {
  HOME: '首页',
  DASHBOARD: '驾驶舱',

  LEADS: '线索',
  LEADS_LIST: '线索/线索列表',
  LEADS_DETAIL: '线索/线索列表/查看线索资料',
  LEADS_CREATE: '线索/线索列表/新建线索',
  LEADS_FOLLOW: '线索/线索列表/开始跟进并加入客户',
  LEADS_FLOW_CONFIG: '线索/线索列表/分配销售',
  LEADS_INTAKE_STATUS: '线索/入库情况',
  LEADS_CONVERT: '线索/线索转客户',

  CUSTOMERS: '客户',
  CUSTOMER_CREATE: '客户/新建客户',
  CUSTOMER_DETAIL: '客户/客户详情',
  CUSTOMER_PROFILE: '客户/客户画像',
  CUSTOMER_AI_CARD: '客户/AI名片',
  CUSTOMER_CREATE_ORDER: '客户/新建客户订单',
  CUSTOMER_VIEW_ORDERS: '客户/查看客户订单',

  ORDERS: '订单',
  ORDER_MANAGE: '订单/订单列表',
  ORDER_REVIEW: '订单/订单审核台',
  ORDER_CREATE: '订单/新增订单',
  ORDER_EDIT: '订单/编辑订单',
  ORDER_DELETE: '订单/删除订单',
  ORDER_HISTORY: '订单/订单修改记录',
  ORDER_PAYMENT_SCREENSHOT: '订单/付款截图识别',

  DELIVERY: '交付',
  DELIVERY_CENTER: '交付/交付中心',
  DELIVERY_MOVE_CARD: '交付/移动交付卡片',
  DELIVERY_STAGE_CONFIG: '交付/交付阶段配置',

  FINANCE: '财务中心',
  FINANCE_OVERVIEW: '财务中心/财务总览',
  FINANCE_SETTLEMENT: '财务中心/订单分账',
  FINANCE_PAYOUT: '财务中心/月度发放',
  FINANCE_REFUND: '财务中心/退款付款',
  FINANCE_FLOW: '财务中心/收支流水',
  FINANCE_RULES: '财务中心/规则配置',

  UPGRADE_CENTER: '升单中心',
  UPGRADE_POOL: '升单中心/机会池',
  UPGRADE_CUSTOMER_SUCCESS: '升单中心/客户成功',
  UPGRADE_ANALYSIS: '升单中心/升单分析',
  UPGRADE_TASKS: '升单中心/行动任务',

  AI_ASSISTANT: 'AI助手',
  AI_CHAT: 'AI助手/AI对话',
  AI_SUGGESTIONS: 'AI助手/运营建议',
  AI_ANALYTICS: 'AI助手/数据分析',

  SETTINGS: '系统设置',
  SETTINGS_EMPLOYEES_DEPARTMENTS: '系统设置/组织架构/员工&部门',
  SETTINGS_USERS: '系统设置/组织架构/员工&部门',
  SETTINGS_DEPARTMENTS: '系统设置/组织架构/员工&部门',
  SETTINGS_ROLES: '系统设置/组织架构/角色权限',
  SETTINGS_ACCOUNT_RECYCLE: '系统设置/组织架构/账号回收站',
  SETTINGS_PRODUCTS: '系统设置/产品设置/产品配置',
  SETTINGS_ORDER_TYPES: '系统设置/产品设置/订单类型',
  SETTINGS_CUSTOMER_LEVELS: '系统设置/客户管理/客户等级',
  SETTINGS_LIFECYCLE: '系统设置/客户管理/客户生命周期',
  SETTINGS_LEAD_SOURCES: '系统设置/客户管理/线索来源',
  SETTINGS_LEAD_FLOW: '系统设置/客户管理/线索流转',
  SETTINGS_DATA_MAINTENANCE: '系统设置/系统维护/数据维护',

  // Deprecated: kept only so older imports fail closed instead of crashing.
  COMMISSION: '提成',
  REFUND_CENTER: '退款中心',
} as const;

const ALL_PERMISSION_KEY = '全部';

const PERMISSION_GRANT_TREE: Record<string, string[]> = {
  [PERMISSION_KEYS.HOME]: [PERMISSION_KEYS.HOME],
  [PERMISSION_KEYS.DASHBOARD]: [PERMISSION_KEYS.DASHBOARD],

  [PERMISSION_KEYS.LEADS]: [
    PERMISSION_KEYS.LEADS_LIST,
    PERMISSION_KEYS.LEADS_DETAIL,
    PERMISSION_KEYS.LEADS_CREATE,
    PERMISSION_KEYS.LEADS_FOLLOW,
    PERMISSION_KEYS.LEADS_FLOW_CONFIG,
    PERMISSION_KEYS.LEADS_INTAKE_STATUS,
    CAPABILITY_KEYS.LEADS_RECEIVE,
    CAPABILITY_KEYS.LEADS_ASSIGN,
    PERMISSION_KEYS.LEADS_CONVERT,
  ],
  [PERMISSION_KEYS.LEADS_LIST]: [
    PERMISSION_KEYS.LEADS_DETAIL,
    PERMISSION_KEYS.LEADS_CREATE,
    PERMISSION_KEYS.LEADS_FOLLOW,
    PERMISSION_KEYS.LEADS_FLOW_CONFIG,
  ],
  [PERMISSION_KEYS.LEADS_DETAIL]: [PERMISSION_KEYS.LEADS_DETAIL],
  [PERMISSION_KEYS.LEADS_CREATE]: [PERMISSION_KEYS.LEADS_CREATE],
  [PERMISSION_KEYS.LEADS_FOLLOW]: [
    PERMISSION_KEYS.LEADS_FOLLOW,
    CAPABILITY_KEYS.LEADS_RECEIVE,
    PERMISSION_KEYS.LEADS_CONVERT,
  ],
  [PERMISSION_KEYS.LEADS_FLOW_CONFIG]: [
    PERMISSION_KEYS.LEADS_FLOW_CONFIG,
    CAPABILITY_KEYS.LEADS_ASSIGN,
  ],
  [PERMISSION_KEYS.LEADS_INTAKE_STATUS]: [PERMISSION_KEYS.LEADS_INTAKE_STATUS],
  [CAPABILITY_KEYS.LEADS_RECEIVE]: [CAPABILITY_KEYS.LEADS_RECEIVE],
  [CAPABILITY_KEYS.LEADS_ASSIGN]: [CAPABILITY_KEYS.LEADS_ASSIGN],
  [PERMISSION_KEYS.LEADS_CONVERT]: [PERMISSION_KEYS.LEADS_CONVERT],

  [PERMISSION_KEYS.CUSTOMERS]: [
    PERMISSION_KEYS.CUSTOMER_CREATE,
    PERMISSION_KEYS.CUSTOMER_DETAIL,
    PERMISSION_KEYS.CUSTOMER_PROFILE,
    PERMISSION_KEYS.CUSTOMER_AI_CARD,
    PERMISSION_KEYS.CUSTOMER_CREATE_ORDER,
    PERMISSION_KEYS.CUSTOMER_VIEW_ORDERS,
  ],
  [PERMISSION_KEYS.CUSTOMER_CREATE]: [PERMISSION_KEYS.CUSTOMER_CREATE],
  [PERMISSION_KEYS.CUSTOMER_DETAIL]: [PERMISSION_KEYS.CUSTOMER_DETAIL],
  [PERMISSION_KEYS.CUSTOMER_PROFILE]: [PERMISSION_KEYS.CUSTOMER_PROFILE],
  [PERMISSION_KEYS.CUSTOMER_AI_CARD]: [PERMISSION_KEYS.CUSTOMER_AI_CARD],
  [PERMISSION_KEYS.CUSTOMER_CREATE_ORDER]: [PERMISSION_KEYS.CUSTOMER_CREATE_ORDER],
  [PERMISSION_KEYS.CUSTOMER_VIEW_ORDERS]: [PERMISSION_KEYS.CUSTOMER_VIEW_ORDERS],

  [PERMISSION_KEYS.ORDERS]: [
    PERMISSION_KEYS.ORDER_MANAGE,
    PERMISSION_KEYS.ORDER_REVIEW,
    PERMISSION_KEYS.ORDER_CREATE,
    PERMISSION_KEYS.ORDER_EDIT,
    PERMISSION_KEYS.ORDER_DELETE,
    PERMISSION_KEYS.ORDER_HISTORY,
    PERMISSION_KEYS.ORDER_PAYMENT_SCREENSHOT,
  ],
  [PERMISSION_KEYS.ORDER_MANAGE]: [PERMISSION_KEYS.ORDER_MANAGE],
  [PERMISSION_KEYS.ORDER_REVIEW]: [PERMISSION_KEYS.ORDER_REVIEW],
  [PERMISSION_KEYS.ORDER_CREATE]: [PERMISSION_KEYS.ORDER_CREATE],
  [PERMISSION_KEYS.ORDER_EDIT]: [PERMISSION_KEYS.ORDER_EDIT],
  [PERMISSION_KEYS.ORDER_DELETE]: [PERMISSION_KEYS.ORDER_DELETE],
  [PERMISSION_KEYS.ORDER_HISTORY]: [PERMISSION_KEYS.ORDER_HISTORY],
  [PERMISSION_KEYS.ORDER_PAYMENT_SCREENSHOT]: [PERMISSION_KEYS.ORDER_PAYMENT_SCREENSHOT],

  [PERMISSION_KEYS.DELIVERY]: [
    PERMISSION_KEYS.DELIVERY_CENTER,
    PERMISSION_KEYS.DELIVERY_MOVE_CARD,
    PERMISSION_KEYS.DELIVERY_STAGE_CONFIG,
  ],
  [PERMISSION_KEYS.DELIVERY_CENTER]: [PERMISSION_KEYS.DELIVERY_CENTER],
  [PERMISSION_KEYS.DELIVERY_MOVE_CARD]: [PERMISSION_KEYS.DELIVERY_MOVE_CARD],
  [PERMISSION_KEYS.DELIVERY_STAGE_CONFIG]: [PERMISSION_KEYS.DELIVERY_STAGE_CONFIG],

  [PERMISSION_KEYS.FINANCE]: [
    PERMISSION_KEYS.FINANCE_OVERVIEW,
    PERMISSION_KEYS.FINANCE_SETTLEMENT,
    PERMISSION_KEYS.FINANCE_PAYOUT,
    PERMISSION_KEYS.FINANCE_REFUND,
    PERMISSION_KEYS.FINANCE_FLOW,
    PERMISSION_KEYS.FINANCE_RULES,
  ],
  [PERMISSION_KEYS.FINANCE_OVERVIEW]: [PERMISSION_KEYS.FINANCE_OVERVIEW],
  [PERMISSION_KEYS.FINANCE_SETTLEMENT]: [PERMISSION_KEYS.FINANCE_SETTLEMENT],
  [PERMISSION_KEYS.FINANCE_PAYOUT]: [PERMISSION_KEYS.FINANCE_PAYOUT],
  [PERMISSION_KEYS.FINANCE_REFUND]: [PERMISSION_KEYS.FINANCE_REFUND],
  [PERMISSION_KEYS.FINANCE_FLOW]: [PERMISSION_KEYS.FINANCE_FLOW],
  [PERMISSION_KEYS.FINANCE_RULES]: [PERMISSION_KEYS.FINANCE_RULES],

  [PERMISSION_KEYS.UPGRADE_CENTER]: [
    PERMISSION_KEYS.UPGRADE_POOL,
    PERMISSION_KEYS.UPGRADE_CUSTOMER_SUCCESS,
    PERMISSION_KEYS.UPGRADE_ANALYSIS,
    PERMISSION_KEYS.UPGRADE_TASKS,
  ],
  [PERMISSION_KEYS.UPGRADE_POOL]: [PERMISSION_KEYS.UPGRADE_POOL],
  [PERMISSION_KEYS.UPGRADE_CUSTOMER_SUCCESS]: [PERMISSION_KEYS.UPGRADE_CUSTOMER_SUCCESS],
  [PERMISSION_KEYS.UPGRADE_ANALYSIS]: [PERMISSION_KEYS.UPGRADE_ANALYSIS],
  [PERMISSION_KEYS.UPGRADE_TASKS]: [PERMISSION_KEYS.UPGRADE_TASKS],

  [PERMISSION_KEYS.AI_ASSISTANT]: [
    PERMISSION_KEYS.AI_CHAT,
    PERMISSION_KEYS.AI_SUGGESTIONS,
    PERMISSION_KEYS.AI_ANALYTICS,
  ],
  [PERMISSION_KEYS.AI_CHAT]: [PERMISSION_KEYS.AI_CHAT],
  [PERMISSION_KEYS.AI_SUGGESTIONS]: [PERMISSION_KEYS.AI_SUGGESTIONS],
  [PERMISSION_KEYS.AI_ANALYTICS]: [PERMISSION_KEYS.AI_ANALYTICS],

  [PERMISSION_KEYS.SETTINGS]: [
    PERMISSION_KEYS.SETTINGS_EMPLOYEES_DEPARTMENTS,
    PERMISSION_KEYS.SETTINGS_ROLES,
    PERMISSION_KEYS.SETTINGS_ACCOUNT_RECYCLE,
    PERMISSION_KEYS.SETTINGS_PRODUCTS,
    PERMISSION_KEYS.SETTINGS_ORDER_TYPES,
    PERMISSION_KEYS.SETTINGS_CUSTOMER_LEVELS,
    PERMISSION_KEYS.SETTINGS_LIFECYCLE,
    PERMISSION_KEYS.SETTINGS_LEAD_SOURCES,
    PERMISSION_KEYS.SETTINGS_LEAD_FLOW,
    PERMISSION_KEYS.SETTINGS_DATA_MAINTENANCE,
  ],
  [PERMISSION_KEYS.SETTINGS_EMPLOYEES_DEPARTMENTS]: [PERMISSION_KEYS.SETTINGS_EMPLOYEES_DEPARTMENTS],
  [PERMISSION_KEYS.SETTINGS_ROLES]: [PERMISSION_KEYS.SETTINGS_ROLES],
  [PERMISSION_KEYS.SETTINGS_ACCOUNT_RECYCLE]: [PERMISSION_KEYS.SETTINGS_ACCOUNT_RECYCLE],
  [PERMISSION_KEYS.SETTINGS_PRODUCTS]: [PERMISSION_KEYS.SETTINGS_PRODUCTS],
  [PERMISSION_KEYS.SETTINGS_ORDER_TYPES]: [PERMISSION_KEYS.SETTINGS_ORDER_TYPES],
  [PERMISSION_KEYS.SETTINGS_CUSTOMER_LEVELS]: [PERMISSION_KEYS.SETTINGS_CUSTOMER_LEVELS],
  [PERMISSION_KEYS.SETTINGS_LIFECYCLE]: [PERMISSION_KEYS.SETTINGS_LIFECYCLE],
  [PERMISSION_KEYS.SETTINGS_LEAD_SOURCES]: [PERMISSION_KEYS.SETTINGS_LEAD_SOURCES],
  [PERMISSION_KEYS.SETTINGS_LEAD_FLOW]: [PERMISSION_KEYS.SETTINGS_LEAD_FLOW],
  [PERMISSION_KEYS.SETTINGS_DATA_MAINTENANCE]: [PERMISSION_KEYS.SETTINGS_DATA_MAINTENANCE],
};

const PERMISSION_GRANTS_BY_NORMALIZED = new Map<string, string[]>(
  Object.entries(PERMISSION_GRANT_TREE).map(([module, grants]) => [normalizePermissionKey(module), grants]),
);

const WRITE_ACTION_PERMISSION_KEYS = [
  PERMISSION_KEYS.ORDER_CREATE,
  PERMISSION_KEYS.ORDER_EDIT,
];

const DELETE_ACTION_PERMISSION_KEYS = [
  PERMISSION_KEYS.ORDER_DELETE,
];

const ROLE_CODE_BY_USER_ROLE: Record<string, string> = {
  超级管理员: 'super_admin',
  管理员: 'super_admin',
  'Super Admin': 'super_admin',
  销售经理: 'sales_manager',
  'Sales Manager': 'sales_manager',
  销售顾问: 'sales_consultant',
  'Sales Consultant': 'sales_consultant',
  销售: 'sales_consultant',
  运营专员: 'ops_admin',
  运营管理员: 'ops_admin',
  运营: 'ops_admin',
  交付工程师: 'delivery_engineer',
  财务专员: 'finance_specialist',
  财务: 'finance_specialist',
  市场专员: 'market_specialist',
  客户成功: 'customer_success',
};

export function isSuperAdmin(user?: Pick<AuthenticatedUser, 'role' | 'permissions'> | null): boolean {
  if (!user) return false;
  return user.permissions?.some((permission) => normalizePermissionKey(permission.module) === ALL_PERMISSION_KEY) || false;
}

export function getUserRole(user: Pick<User, 'role' | 'roleId'>, roles: Role[]): Role | undefined {
  const normalizedRole = normalizeUserRoleName(user.role);
  const normalizedCode = ROLE_CODE_BY_USER_ROLE[normalizedRole] || normalizePermissionKey(normalizedRole).toLowerCase();
  return roles.find((item) => (
    item.isActive
    && (
      item.id === user.roleId
      || item.name === normalizedRole
      || normalizePermissionKey(item.code).toLowerCase() === normalizedCode
    )
  ));
}

export function roleHasPermission(role: Role | undefined, permissionKey: string, action = 'read'): boolean {
  if (!role?.isActive) return false;
  if (role.code === 'super_admin') return true;
  const requestedKeys = expandPermissionGrants(permissionKey);
  if (!requestedKeys.length) return false;
  return role.permissions.some((permission) => {
    if (!actionAllowed(getDefaultPermissionActions(permission.module, permission.actions || []), action)) return false;
    const grantedKeys = expandPermissionGrants(permission.module);
    if (grantedKeys.includes(ALL_PERMISSION_KEY)) return true;
    return grantedKeys.some((granted) => requestedKeys.some((requested) => (
      requested === granted || requested.startsWith(`${granted}/`) || granted.startsWith(`${requested}/`)
    )));
  });
}

export function hasRolePermission(user: Pick<User, 'role' | 'roleId' | 'isActive'>, roles: Role[], permissionKey: string, action = 'read'): boolean {
  if (!user.isActive) return false;
  return roleHasPermission(getUserRole(user, roles), permissionKey, action);
}

export function isSuperAdminUser(user: Pick<User, 'role' | 'roleId' | 'isActive'>, roles: Role[]): boolean {
  return hasRolePermission(user, roles, ALL_PERMISSION_KEY, 'admin') || getUserRole(user, roles)?.code === 'super_admin';
}

function roleHasDirectPermission(role: Role | undefined, permissionKeys: string[], action = 'read'): boolean {
  if (!role?.isActive) return false;
  if (role.code === 'super_admin') return true;
  const requestedKeys = permissionKeys.map(normalizePermissionKey);
  return role.permissions.some((permission) => (
    actionAllowed(permission.actions || [], action)
    && requestedKeys.includes(normalizePermissionKey(permission.module))
  ));
}

export function canReceiveLead(user: Pick<User, 'role' | 'roleId' | 'isActive'>, roles: Role[]): boolean {
  if (!user.isActive) return false;
  return roleHasDirectPermission(getUserRole(user, roles), [
    CAPABILITY_KEYS.LEADS_RECEIVE,
    PERMISSION_KEYS.LEADS_FOLLOW,
  ]);
}

export function resolveUserPermissions(user: User, roles: Role[]): Permission[] {
  const normalizedRole = normalizeUserRoleName(user.role);
  const mappedCode = ROLE_CODE_BY_USER_ROLE[normalizedRole] || ROLE_CODE_BY_USER_ROLE[String(user.role)];
  const role = getUserRole(user, roles)
    || roles.find((item) => item.isActive && Boolean(mappedCode && item.code === mappedCode));
  if (role?.permissions?.length) return sanitizeRolePermissions(role.permissions);
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
    positionId: user.positionId,
    positionName: user.positionName,
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

const permissionKeyMatches = (module: string, keys: string[]) => {
  const normalized = normalizePermissionKey(module);
  return keys.some((key) => normalizePermissionKey(key) === normalized);
};

export function getDefaultPermissionActions(module: string, actions: string[] = ['read']): string[] {
  const next = new Set(actions.length ? actions : ['read']);
  next.add('read');
  if (permissionKeyMatches(module, WRITE_ACTION_PERMISSION_KEYS)) next.add('write');
  if (permissionKeyMatches(module, DELETE_ACTION_PERMISSION_KEYS)) next.add('delete');
  return Array.from(next);
}

function expandPermissionGrants(module: string): string[] {
  const normalized = normalizePermissionKey(module);
  if (normalized === ALL_PERMISSION_KEY) return [ALL_PERMISSION_KEY];
  const grants = PERMISSION_GRANTS_BY_NORMALIZED.get(normalized);
  return (grants || []).map(normalizePermissionKey);
}

function getSanitizedPermissionModules(module: string): string[] {
  const normalized = normalizePermissionKey(module);
  if (normalized === ALL_PERMISSION_KEY) return [ALL_PERMISSION_KEY];
  return PERMISSION_GRANTS_BY_NORMALIZED.get(normalized) || [];
}

export function sanitizeRolePermissions(permissions: Permission[] = []): Permission[] {
  const merged = new Map<string, Set<string>>();

  permissions.forEach((permission) => {
    const modules = getSanitizedPermissionModules(permission.module);
    const permissionActions = getDefaultPermissionActions(permission.module, permission.actions || []);
    modules.forEach((module) => {
      const actions = merged.get(module) || new Set<string>();
      permissionActions.forEach((action) => actions.add(action));
      merged.set(module, actions);
    });
  });

  return Array.from(merged.entries()).map(([module, actions]) => ({
    module,
    actions: Array.from(actions),
  }));
}

export function hasPermission(
  user: Pick<AuthenticatedUser, 'role' | 'permissions' | 'isActive'> | null | undefined,
  permissionKey: string,
  action = 'read',
): boolean {
  if (!user?.isActive) return false;
  if (normalizePermissionKey(permissionKey) === PERMISSION_KEYS.HOME) return true;
  if (isSuperAdmin(user)) return true;

  const requestedKeys = expandPermissionGrants(permissionKey);
  if (!requestedKeys.length) return false;
  return user.permissions.some((permission) => {
    if (!actionAllowed(permission.actions || [], action)) return false;
    const grantedKeys = expandPermissionGrants(permission.module);
    if (grantedKeys.includes(ALL_PERMISSION_KEY)) return true;
    return grantedKeys.some((granted) => requestedKeys.some((requested) => (
      requested === granted || requested.startsWith(`${granted}/`) || granted.startsWith(`${requested}/`)
    )));
  });
}
