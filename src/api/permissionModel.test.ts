import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { authApi, roleApi, settingsApi } from './index';
import { DEFAULT_USER_PASSWORD } from '../shared/utils/auth';
import { STORAGE_KEYS } from '../shared/utils/constants';
import { DEFAULT_ROLES, mergeRoleWithDefaultAccess, normalizeRoleDataScopes } from '../shared/utils/organizationConfig';
import { CAPABILITY_KEYS, canReceiveLead, canReviewRecoveryOrders, getPermissionLeafDisplayLabel, getRoleEditorPermissionActions, hasPermission, isSuperAdmin, PERMISSION_KEYS, roleHasPermission, sanitizeRolePermissions, toAuthenticatedUser } from '../shared/utils/permissions';
import type { Role } from '../types/role';

const appSource = readFileSync(join(process.cwd(), 'src', 'App.tsx'), 'utf8');
const sidebarSource = readFileSync(join(process.cwd(), 'src', 'layouts', 'Sidebar.tsx'), 'utf8');
const settingsSource = readFileSync(join(process.cwd(), 'src', 'pages', 'Settings', 'index.tsx'), 'utf8');
const rolePermissionSource = readFileSync(join(process.cwd(), 'src', 'pages', 'Settings', 'RolePermission.tsx'), 'utf8');
assert.match(appSource, /ProtectedRoute permissionKey=\{PERMISSION_KEYS\.CUSTOMERS\}/);
assert.match(appSource, /ROUTES\.GEO/);
assert.match(sidebarSource, /ROUTES\.GEO/);
assert.match(rolePermissionSource, /PERMISSION_KEYS\.GEO_OVERVIEW/);
assert.match(rolePermissionSource, /PERMISSION_KEYS\.GEO_CONTENT/);
assert.match(rolePermissionSource, /PERMISSION_KEYS\.GEO_ANALYTICS/);
assert.match(
  rolePermissionSource,
  /buildRoleEditorPermissions/,
  '角色编辑器保存与切换必须复用已由纯函数行为测试覆盖的权限构建契约',
);
assert.doesNotMatch(appSource, /PERMISSION_KEYS\.COMMISSION|PERMISSION_KEYS\.REFUND_CENTER/);
assert.doesNotMatch(sidebarSource, /PERMISSION_KEYS\.COMMISSION|PERMISSION_KEYS\.REFUND_CENTER/);
assert.doesNotMatch(sidebarSource, /group=leadCustomer[\s\S]*PERMISSION_KEYS\.LEADS_FLOW_CONFIG/);
assert.doesNotMatch(settingsSource, /permissionKey: PERMISSION_KEYS\.LEADS_FLOW_CONFIG/);
assert.doesNotMatch(rolePermissionSource, /label:\s*'提成'/);
assert.doesNotMatch(rolePermissionSource, /label:\s*'退款中心'/);
assert.match(rolePermissionSource, /财务中心/);
assert.match(rolePermissionSource, /订单分账/);
assert.match(rolePermissionSource, /员工提成月报/);
assert.match(rolePermissionSource, /提成规则/);
assert.match(rolePermissionSource, /订单审核列表/);
assert.match(rolePermissionSource, /订单审核操作/);
assert.match(rolePermissionSource, /售后服务/);
assert.match(rolePermissionSource, /售后挽回订单列表/);
assert.match(rolePermissionSource, /售后挽回订单审核列表/);
assert.match(rolePermissionSource, /售后挽回订单审核操作/);
assert.match(rolePermissionSource, /新增售后挽回订单/);
assert.match(rolePermissionSource, /编辑售后挽回订单/);
assert.match(rolePermissionSource, /删除售后挽回订单/);
assert.match(rolePermissionSource, /售后挽回订单修改记录/);
assert.match(rolePermissionSource, /售后挽回订单数据/);
assert.match(rolePermissionSource, /售后挽回订单审核台数据/);
assert.doesNotMatch(rolePermissionSource, /订单退款|退款挽回单|新建挽回单|审核挽回单/);
assert.doesNotMatch(rolePermissionSource, /售后工单/);
assert.doesNotMatch(rolePermissionSource, /退款冲销/);
assert.doesNotMatch(rolePermissionSource, /退款付款/);
assert.match(rolePermissionSource, /getCustomerPermissionTree/);
assert.match(rolePermissionSource, /CUSTOMER_SCOPE_OPTIONS/);
assert.match(rolePermissionSource, /旧权限兼容/);
assert.match(rolePermissionSource, /权限决定可执行动作；客户数据范围决定可管理的负责人覆盖范围/);
assert.doesNotMatch(rolePermissionSource, /客户画像/);
assert.doesNotMatch(rolePermissionSource, /AI名片/);
assert.match(rolePermissionSource, /客户等级/);
assert.match(rolePermissionSource, /线索流转/);
assert.match(rolePermissionSource, /label:\s*'资产管理'/);
assert.match(rolePermissionSource, /label:\s*'资产总览'/);
assert.match(rolePermissionSource, /label:\s*'查看敏感字段'/);
assert.match(rolePermissionSource, /label:\s*'导入导出'/);
assert.match(rolePermissionSource, /业务回收与CRM迁移/);
assert.doesNotMatch(rolePermissionSource, /数据维护/);
assert.match(rolePermissionSource, /label:\s*'线索列表'/);
assert.match(rolePermissionSource, /label:\s*'入库情况'/);
assert.match(rolePermissionSource, /label:\s*'查看线索资料'/);
assert.match(rolePermissionSource, /label:\s*'新建线索'/);
assert.match(rolePermissionSource, /label:\s*'开始跟进并加入客户'/);
assert.match(rolePermissionSource, /label:\s*'分配销售'/);
assert.doesNotMatch(rolePermissionSource, /label:\s*'接收\/领取线索'|label:\s*'分配线索能力'|label:\s*'线索跟进'|label:\s*'线索转客户'/);
assert.equal(PERMISSION_KEYS.CUSTOMER_TRANSFER, '客户/转移客户', 'stored permission key must stay stable for existing roles');
assert.equal(getPermissionLeafDisplayLabel(PERMISSION_KEYS.CUSTOMER_TRANSFER), '转让客户');

const storage = (() => {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: storage,
  configurable: true,
});

storage.clear();

const readOnlyAllUser = {
  role: '只读审计员',
  roleId: 'role-read-only-auditor',
  isActive: true,
  permissions: [{ module: '全部', actions: ['read'] }],
};
assert.equal(isSuperAdmin(readOnlyAllUser), false);
assert.equal(hasPermission(readOnlyAllUser, PERMISSION_KEYS.SETTINGS_ROLES, 'read'), true);
assert.equal(hasPermission(readOnlyAllUser, PERMISSION_KEYS.SETTINGS_ROLES, 'write'), false);

const realAdminUser = {
  ...readOnlyAllUser,
  role: '具备全权的普通命名角色',
  roleId: 'role-full-access',
  permissions: [{ module: '全部', actions: ['admin'] }],
};
assert.equal(isSuperAdmin(realAdminUser), true);
assert.equal(hasPermission(realAdminUser, PERMISSION_KEYS.SETTINGS_ROLES, 'write'), true);

const marketRole = DEFAULT_ROLES.find((role) => role.code === 'market_specialist');
assert.ok(marketRole);
assert.equal(roleHasPermission(marketRole, PERMISSION_KEYS.GEO), true);
assert.equal(roleHasPermission(marketRole, PERMISSION_KEYS.GEO_CONTENT), true);
const defaultSalesManagerRole = DEFAULT_ROLES.find((role) => role.code === 'sales_manager');
assert.ok(defaultSalesManagerRole);
assert.equal(defaultSalesManagerRole.permissions.some((permission) => permission.module === '提成'), false);
const defaultFinanceRole = DEFAULT_ROLES.find((role) => role.code === 'finance_specialist');
assert.ok(defaultFinanceRole);
assert.equal(defaultFinanceRole.permissions.some((permission) => permission.module === '财务中心/订单分账'), true);
assert.equal(roleHasPermission(defaultFinanceRole, PERMISSION_KEYS.FINANCE), true);
assert.equal(roleHasPermission(defaultFinanceRole, PERMISSION_KEYS.FINANCE_MY_COMMISSION), false);
assert.equal(roleHasPermission(defaultFinanceRole, PERMISSION_KEYS.FINANCE_SETTLEMENT), true);
assert.equal(roleHasPermission(defaultFinanceRole, PERMISSION_KEYS.FINANCE_RECOVERY_SETTLEMENT), true);

const defaultSalesRole = DEFAULT_ROLES.find((role) => role.code === 'sales_consultant');
assert.ok(defaultSalesRole);
const savedSalesRoleWithoutLeadActions = mergeRoleWithDefaultAccess({
  ...defaultSalesRole,
  permissions: [{ module: PERMISSION_KEYS.LEADS_DETAIL, actions: ['read'] }],
});
assert.equal(roleHasPermission(savedSalesRoleWithoutLeadActions, PERMISSION_KEYS.LEADS_DETAIL), true);
assert.equal(roleHasPermission(savedSalesRoleWithoutLeadActions, PERMISSION_KEYS.LEADS_CREATE), false);
assert.equal(roleHasPermission(savedSalesRoleWithoutLeadActions, PERMISSION_KEYS.LEADS_FLOW_CONFIG), false);
const authenticatedSales = toAuthenticatedUser({
  id: 'user-sales-assets',
  name: 'Sales Assets',
  account: 'sales_assets',
  email: '',
  phone: '',
  role: defaultSalesRole.name,
  roleId: defaultSalesRole.id,
  isActive: true,
  createdAt: '2026-07-03T00:00:00.000Z',
  updatedAt: '2026-07-03T00:00:00.000Z',
}, DEFAULT_ROLES);
assert.equal(hasPermission(authenticatedSales, PERMISSION_KEYS.ASSETS), true);
assert.equal(hasPermission(authenticatedSales, PERMISSION_KEYS.ASSETS_OVERVIEW), true);
assert.equal(hasPermission(authenticatedSales, PERMISSION_KEYS.ASSETS_DEVICES), true);
assert.equal(hasPermission(authenticatedSales, PERMISSION_KEYS.ASSETS_PHONES), true);
assert.equal(hasPermission(authenticatedSales, PERMISSION_KEYS.ASSETS_ACCOUNTS), true);
assert.equal(hasPermission(authenticatedSales, PERMISSION_KEYS.ASSETS_RISKS), true);
assert.equal(hasPermission(authenticatedSales, PERMISSION_KEYS.ASSETS_LOGS), true);
assert.equal(hasPermission(authenticatedSales, PERMISSION_KEYS.ASSETS_OFFBOARDING), true);
assert.equal(hasPermission(authenticatedSales, PERMISSION_KEYS.ASSETS_MATRIX_PUBLISH), true);
assert.equal(hasPermission(authenticatedSales, PERMISSION_KEYS.ASSETS, 'write'), false);
assert.equal(hasPermission(authenticatedSales, PERMISSION_KEYS.ASSETS_DEVICES, 'write'), false);
assert.equal(hasPermission(authenticatedSales, PERMISSION_KEYS.ASSETS_MATRIX_PUBLISH, 'write'), false);
assert.equal(hasPermission(authenticatedSales, PERMISSION_KEYS.ASSETS_SENSITIVE_VIEW), false);
assert.equal(hasPermission(authenticatedSales, PERMISSION_KEYS.ASSETS_IMPORT_EXPORT, 'write'), false);

const defaultOpsRole = DEFAULT_ROLES.find((role) => role.code === 'ops_admin');
assert.ok(defaultOpsRole);
assert.equal(roleHasPermission(defaultOpsRole, PERMISSION_KEYS.GEO, 'write'), true);
assert.equal(roleHasPermission(defaultOpsRole, PERMISSION_KEYS.GEO_ANALYTICS), true);
const authenticatedOps = toAuthenticatedUser({
  id: 'user-ops-assets',
  name: 'Ops Assets',
  account: 'ops_assets',
  email: '',
  phone: '',
  role: defaultOpsRole.name,
  roleId: defaultOpsRole.id,
  isActive: true,
  createdAt: '2026-07-03T00:00:00.000Z',
  updatedAt: '2026-07-03T00:00:00.000Z',
}, DEFAULT_ROLES);
assert.equal(hasPermission(authenticatedOps, PERMISSION_KEYS.ASSETS, 'write'), true);
assert.equal(hasPermission(authenticatedOps, PERMISSION_KEYS.ASSETS_SENSITIVE_VIEW), true);
assert.equal(hasPermission(authenticatedOps, PERMISSION_KEYS.ASSETS_IMPORT_EXPORT, 'write'), true);

const createdMarketUser = await settingsApi.createUser({
  name: 'Permission Market',
  account: 'permission_market',
  email: 'permission_market@company.com',
  phone: '13900008888',
  departmentId: 'dept-market',
  role: marketRole.name,
  roleId: marketRole.id,
  isActive: true,
  password: DEFAULT_USER_PASSWORD,
});
assert.equal(createdMarketUser.code, 0);

const marketLogin = await authApi.login({ account: 'permission_market', password: DEFAULT_USER_PASSWORD, remember: false });
assert.equal(marketLogin.code, 0);
assert.ok(marketLogin.data);
assert.equal(hasPermission(marketLogin.data, PERMISSION_KEYS.LEADS), true);
assert.equal(hasPermission(marketLogin.data, PERMISSION_KEYS.CUSTOMERS), false);

const legacyOpportunityRole: Role = {
  id: 'role-legacy-opportunity',
  name: 'Legacy Opportunity',
  code: 'legacy_opportunity',
  permissions: [{ module: '商机', actions: ['read'] }],
  memberCount: 0,
  isActive: true,
  createdAt: '2026-06-22T00:00:00.000Z',
  updatedAt: '2026-06-22T00:00:00.000Z',
};
assert.equal(roleHasPermission(legacyOpportunityRole, PERMISSION_KEYS.LEADS), false);
assert.equal(roleHasPermission(legacyOpportunityRole, PERMISSION_KEYS.CUSTOMERS), false);

const legacyCommissionRole: Role = {
  ...legacyOpportunityRole,
  id: 'role-legacy-commission',
  code: 'legacy_commission',
  permissions: [{ module: '提成', actions: ['read'] }],
};
assert.equal(roleHasPermission(legacyCommissionRole, '提成'), false);
assert.deepEqual(sanitizeRolePermissions(legacyCommissionRole.permissions), []);

const financeSettlementRole: Role = {
  ...legacyOpportunityRole,
  id: 'role-finance-settlement',
  code: 'finance_settlement',
  permissions: [{ module: '财务中心/订单分账', actions: ['read'] }],
};
assert.equal(roleHasPermission(financeSettlementRole, '财务中心'), true);
assert.equal(roleHasPermission(financeSettlementRole, '财务中心/订单分账'), true);
assert.equal(roleHasPermission(financeSettlementRole, PERMISSION_KEYS.FINANCE_MY_COMMISSION), false);

const financeParentOnlyRole: Role = {
  ...legacyOpportunityRole,
  id: 'role-finance-parent-only',
  code: 'finance_parent_only',
  permissions: [{ module: PERMISSION_KEYS.FINANCE, actions: ['read'] }],
};
assert.equal(roleHasPermission(financeParentOnlyRole, PERMISSION_KEYS.FINANCE), true);
assert.equal(roleHasPermission(financeParentOnlyRole, PERMISSION_KEYS.FINANCE_MY_COMMISSION), false);
assert.equal(roleHasPermission(financeParentOnlyRole, PERMISSION_KEYS.FINANCE_SETTLEMENT), false);

const customerChildRole: Role = {
  ...legacyOpportunityRole,
  id: 'role-customer-child',
  code: 'customer_child',
  permissions: [{ module: PERMISSION_KEYS.CUSTOMER_CREATE, actions: ['read'] }],
};
assert.equal(roleHasPermission(customerChildRole, PERMISSION_KEYS.CUSTOMERS), true);

const legacyCustomerParentUser = {
  role: '旧客户父权限角色',
  isActive: true,
  permissions: [{ module: PERMISSION_KEYS.CUSTOMERS, actions: ['read'] }],
};
[
  PERMISSION_KEYS.CUSTOMER_SET_PROGRESS,
  PERMISSION_KEYS.CUSTOMER_TRANSFER,
  PERMISSION_KEYS.CUSTOMER_BATCH_MANAGE,
  PERMISSION_KEYS.CUSTOMER_DELETE,
  PERMISSION_KEYS.CUSTOMER_IMPORT,
  PERMISSION_KEYS.CUSTOMER_EXPORT,
  PERMISSION_KEYS.CUSTOMER_MERGE,
  PERMISSION_KEYS.CUSTOMER_BATCH_CANCEL,
].forEach((permissionKey) => {
  assert.equal(
    hasPermission(legacyCustomerParentUser, permissionKey, permissionKey === PERMISSION_KEYS.CUSTOMER_DELETE ? 'delete' : 'write'),
    false,
    `旧客户父权限不得隐式获得 ${permissionKey}`,
  );
});

const customerAssignRole: Role = {
  ...legacyOpportunityRole,
  id: 'role-customer-assign',
  code: 'customer_assign',
  permissions: [{ module: PERMISSION_KEYS.CUSTOMER_ASSIGN, actions: ['read'] }],
};
assert.equal(roleHasPermission(customerAssignRole, PERMISSION_KEYS.CUSTOMERS), true);
assert.equal(roleHasPermission(customerAssignRole, PERMISSION_KEYS.CUSTOMER_ASSIGN, 'write'), true);
assert.equal(roleHasPermission(customerAssignRole, PERMISSION_KEYS.CUSTOMER_PUBLIC_POOL_CLAIM, 'write'), false);

const customerClaimRole: Role = {
  ...legacyOpportunityRole,
  id: 'role-customer-claim',
  code: 'customer_claim',
  permissions: [{ module: PERMISSION_KEYS.CUSTOMER_PUBLIC_POOL_CLAIM, actions: ['read', 'write'] }],
};
assert.equal(roleHasPermission(customerClaimRole, PERMISSION_KEYS.CUSTOMER_PUBLIC_POOL_CLAIM, 'write'), true);
assert.equal(roleHasPermission(customerClaimRole, PERMISSION_KEYS.CUSTOMER_PUBLIC_POOL_VIEW, 'read'), true, '领取权必须包含公海查看权');
assert.equal(roleHasPermission(customerClaimRole, PERMISSION_KEYS.CUSTOMER_LIST, 'read'), false, '领取权不得隐式获得普通客户列表权');
assert.equal(roleHasPermission(customerClaimRole, PERMISSION_KEYS.CUSTOMER_ASSIGN, 'write'), false);

const customerPoolViewRole: Role = {
  ...legacyOpportunityRole,
  id: 'role-customer-pool-view',
  code: 'customer_pool_view',
  permissions: [{ module: PERMISSION_KEYS.CUSTOMER_PUBLIC_POOL_VIEW, actions: ['read'] }],
};
assert.equal(roleHasPermission(customerPoolViewRole, PERMISSION_KEYS.CUSTOMER_PUBLIC_POOL_VIEW, 'read'), true);
assert.equal(roleHasPermission(customerPoolViewRole, PERMISSION_KEYS.CUSTOMER_LIST, 'read'), false);
assert.equal(roleHasPermission(customerPoolViewRole, PERMISSION_KEYS.CUSTOMER_PUBLIC_POOL_CLAIM, 'write'), false, '只查看公海不得反向获得领取权');

const leadFollowRole: Role = {
  ...legacyOpportunityRole,
  id: 'role-lead-follow',
  code: 'lead_follow',
  permissions: [{ module: PERMISSION_KEYS.LEADS_FOLLOW, actions: ['read'] }],
};
assert.equal(roleHasPermission(leadFollowRole, PERMISSION_KEYS.LEADS), true);
assert.equal(roleHasPermission(leadFollowRole, PERMISSION_KEYS.LEADS_FOLLOW), true);
assert.equal(roleHasPermission(leadFollowRole, CAPABILITY_KEYS.LEADS_RECEIVE), true);
assert.equal(roleHasPermission(leadFollowRole, PERMISSION_KEYS.LEADS_CONVERT), true);

const leadAssignRole: Role = {
  ...legacyOpportunityRole,
  id: 'role-lead-assign',
  code: 'lead_assign',
  permissions: [{ module: PERMISSION_KEYS.LEADS_FLOW_CONFIG, actions: ['read'] }],
};
assert.equal(roleHasPermission(leadAssignRole, PERMISSION_KEYS.LEADS), true);
assert.equal(roleHasPermission(leadAssignRole, CAPABILITY_KEYS.LEADS_ASSIGN), true);

const orderActionRole: Role = {
  ...legacyOpportunityRole,
  id: 'role-order-actions',
  code: 'order_actions',
  permissions: [
    { module: PERMISSION_KEYS.ORDER_EDIT, actions: ['read'] },
    { module: PERMISSION_KEYS.ORDER_DELETE, actions: ['read'] },
  ],
};

const roleEditorWriteActions = [
  PERMISSION_KEYS.LEADS_CREATE,
  PERMISSION_KEYS.LEADS_FOLLOW,
  PERMISSION_KEYS.LEADS_FLOW_CONFIG,
  PERMISSION_KEYS.CUSTOMER_CREATE,
  PERMISSION_KEYS.CUSTOMER_EDIT,
  PERMISSION_KEYS.CUSTOMER_ASSIGN,
  PERMISSION_KEYS.CUSTOMER_PUBLIC_POOL_CLAIM,
  PERMISSION_KEYS.CUSTOMER_EDIT_PROFILE,
  PERMISSION_KEYS.CUSTOMER_SET_PROGRESS,
  PERMISSION_KEYS.CUSTOMER_SET_TAGS,
  PERMISSION_KEYS.CUSTOMER_SET_TODOS,
  PERMISSION_KEYS.CUSTOMER_EDIT_ATTRIBUTION,
  PERMISSION_KEYS.CUSTOMER_TRANSFER,
  PERMISSION_KEYS.CUSTOMER_RELEASE_TO_POOL,
  PERMISSION_KEYS.CUSTOMER_BATCH_MANAGE,
  PERMISSION_KEYS.CUSTOMER_IMPORT,
  PERMISSION_KEYS.CUSTOMER_IMPORT_ATTRIBUTION_OVERRIDE,
  PERMISSION_KEYS.CUSTOMER_EXPORT,
  PERMISSION_KEYS.CUSTOMER_EXPORT_SENSITIVE,
  PERMISSION_KEYS.CUSTOMER_MERGE,
  PERMISSION_KEYS.CUSTOMER_MERGE_UNDO,
  PERMISSION_KEYS.CUSTOMER_BATCH_CANCEL,
  PERMISSION_KEYS.CUSTOMER_CREATE_ORDER,
  PERMISSION_KEYS.ORDER_REVIEW,
  PERMISSION_KEYS.ORDER_CREATE,
  PERMISSION_KEYS.ORDER_EDIT,
  PERMISSION_KEYS.DELIVERY_MOVE_CARD,
  PERMISSION_KEYS.DELIVERY_STAGE_CONFIG,
  PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW,
  PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE,
  PERMISSION_KEYS.AFTER_SALES_RECOVERY_EDIT,
  PERMISSION_KEYS.FINANCE_SETTLEMENT,
  PERMISSION_KEYS.FINANCE_RECOVERY_SETTLEMENT,
  PERMISSION_KEYS.FINANCE_PAYOUT,
  PERMISSION_KEYS.FINANCE_FLOW,
  PERMISSION_KEYS.FINANCE_RULES,
  PERMISSION_KEYS.ASSETS_DEVICES,
  PERMISSION_KEYS.ASSETS_PHONES,
  PERMISSION_KEYS.ASSETS_ACCOUNTS,
  PERMISSION_KEYS.ASSETS_MATRIX_PUBLISH,
  PERMISSION_KEYS.ASSETS_OFFBOARDING,
  PERMISSION_KEYS.ASSETS_IMPORT_EXPORT,
  PERMISSION_KEYS.ENABLEMENT_REVIEW,
  PERMISSION_KEYS.ENABLEMENT_PUBLISH,
  PERMISSION_KEYS.SETTINGS_EMPLOYEES_DEPARTMENTS,
  PERMISSION_KEYS.SETTINGS_ROLES,
  PERMISSION_KEYS.SETTINGS_ACCOUNT_RECYCLE,
  PERMISSION_KEYS.SETTINGS_PRODUCTS,
  PERMISSION_KEYS.SETTINGS_ORDER_TYPES,
  PERMISSION_KEYS.SETTINGS_CUSTOMER_LEVELS,
  PERMISSION_KEYS.SETTINGS_LIFECYCLE,
  PERMISSION_KEYS.SETTINGS_LEAD_SOURCES,
  PERMISSION_KEYS.SETTINGS_LEAD_FLOW,
  PERMISSION_KEYS.SETTINGS_AI_CONFIG,
  PERMISSION_KEYS.SETTINGS_DATA_MAINTENANCE,
];
roleEditorWriteActions.forEach((permissionKey) => {
  assert.equal(
    getRoleEditorPermissionActions(permissionKey).includes('write'),
    true,
    `角色编辑器勾选 ${permissionKey} 后必须保留显式 write 动作`,
  );
});

[
  PERMISSION_KEYS.ORDER_DELETE,
  PERMISSION_KEYS.CUSTOMER_DELETE,
  PERMISSION_KEYS.AFTER_SALES_RECOVERY_DELETE,
  PERMISSION_KEYS.SETTINGS_EMPLOYEES_DEPARTMENTS,
  PERMISSION_KEYS.SETTINGS_ROLES,
  PERMISSION_KEYS.SETTINGS_ACCOUNT_RECYCLE,
  PERMISSION_KEYS.SETTINGS_DATA_MAINTENANCE,
].forEach((permissionKey) => {
  assert.equal(
    getRoleEditorPermissionActions(permissionKey).includes('delete'),
    true,
    `角色编辑器勾选 ${permissionKey} 后必须保留显式 delete 动作`,
  );
});

[
  PERMISSION_KEYS.CUSTOMER_LIST,
  PERMISSION_KEYS.CUSTOMER_DETAIL,
  PERMISSION_KEYS.FINANCE_MY_COMMISSION,
  PERMISSION_KEYS.ASSETS_OVERVIEW,
  PERMISSION_KEYS.ASSETS_LOGS,
  PERMISSION_KEYS.ASSETS_SENSITIVE_VIEW,
].forEach((permissionKey) => {
  assert.deepEqual(
    getRoleEditorPermissionActions(permissionKey),
    ['read'],
    `纯查看权限 ${permissionKey} 不得因角色编辑器勾选而自动扩权`,
  );
});

const mixedCustomerRolePermissions = sanitizeRolePermissions([
  { module: PERMISSION_KEYS.CUSTOMER_CREATE, actions: ['read'] },
  { module: PERMISSION_KEYS.CUSTOMER_EDIT, actions: ['read'] },
  { module: PERMISSION_KEYS.CUSTOMER_ASSIGN, actions: ['read', 'write'] },
  { module: PERMISSION_KEYS.CUSTOMER_CREATE_ORDER, actions: ['read'] },
]);
assert.deepEqual(
  mixedCustomerRolePermissions.find((permission) => permission.module === PERMISSION_KEYS.CUSTOMER_CREATE)?.actions,
  ['read', 'write'],
  '客户新建是客户变更叶子，角色模型必须赋予显式 write 动作',
);
assert.deepEqual(
  mixedCustomerRolePermissions.find((permission) => permission.module === PERMISSION_KEYS.CUSTOMER_EDIT)?.actions,
  ['read'],
  '旧编辑客户键只作为迁移输入，不得在新模型中隐式扩权',
);
assert.deepEqual(
  mixedCustomerRolePermissions.find((permission) => permission.module === PERMISSION_KEYS.CUSTOMER_CREATE_ORDER)?.actions,
  ['read', 'write'],
  '客户新建订单是客户变更叶子，角色模型必须赋予显式 write 动作',
);
assert.equal(roleHasPermission(orderActionRole, PERMISSION_KEYS.ORDER_EDIT, 'write'), true);
assert.equal(roleHasPermission(orderActionRole, PERMISSION_KEYS.ORDER_DELETE, 'delete'), true);
assert.deepEqual(
  sanitizeRolePermissions(orderActionRole.permissions).filter((permission) => (
    permission.module === PERMISSION_KEYS.ORDER_EDIT || permission.module === PERMISSION_KEYS.ORDER_DELETE
  )),
  [
    { module: PERMISSION_KEYS.ORDER_EDIT, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.ORDER_DELETE, actions: ['read', 'delete'] },
  ],
);

const orderReadOnlyPermissions = sanitizeRolePermissions([{ module: PERMISSION_KEYS.ORDERS, actions: ['read'] }]);
assert.equal(
  orderReadOnlyPermissions.find((permission) => permission.module === PERMISSION_KEYS.ORDER_EDIT)?.actions.includes('write'),
  false,
);
assert.equal(
  hasPermission({ role: 'Order Reader', isActive: true, permissions: orderReadOnlyPermissions }, PERMISSION_KEYS.ORDER_EDIT, 'write'),
  false,
);
assert.equal(
  hasPermission({ role: 'Order Reader', isActive: true, permissions: orderReadOnlyPermissions }, PERMISSION_KEYS.ORDER_DELETE, 'delete'),
  false,
);

storage.clear();
const now = '2026-06-22T00:00:00.000Z';
storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
storage.setItem(STORAGE_KEYS.ORGANIZATION_SCHEMA_VERSION, '0');
storage.setItem(STORAGE_KEYS.ROLES, JSON.stringify([
  {
    id: 'role-market-specialist',
    name: '市场专员',
    code: 'market_specialist',
    permissions: [
      { module: '商机', actions: ['read'] },
      { module: '线索', actions: ['read'] },
    ],
    memberCount: 0,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
]));
storage.setItem(STORAGE_KEYS.USERS, JSON.stringify([]));

const migratedRoles = await roleApi.getRoles({ isActive: true });
const migratedMarketRole = migratedRoles.data.find((role) => role.code === 'market_specialist');
assert.ok(migratedMarketRole);
assert.equal(migratedMarketRole.permissions.some((permission) => permission.module === '商机'), false);
assert.equal(migratedMarketRole.permissions.some((permission) => permission.module === PERMISSION_KEYS.CUSTOMERS), false);

const authenticatedMarket = toAuthenticatedUser({
  id: 'user-market-visible',
  name: 'Market Visible',
  account: 'market_visible',
  email: '',
  phone: '',
  role: migratedMarketRole.name,
  roleId: migratedMarketRole.id,
  isActive: true,
  createdAt: now,
  updatedAt: now,
}, migratedRoles.data);
assert.equal(hasPermission(authenticatedMarket, PERMISSION_KEYS.LEADS), true);
assert.equal(hasPermission(authenticatedMarket, PERMISSION_KEYS.CUSTOMERS), false);
assert.equal(hasPermission(authenticatedMarket, PERMISSION_KEYS.ASSETS), true);
assert.equal(hasPermission(authenticatedMarket, PERMISSION_KEYS.ASSETS_MATRIX_PUBLISH, 'write'), true);
assert.equal(hasPermission(authenticatedMarket, PERMISSION_KEYS.ASSETS_SENSITIVE_VIEW), false);

assert.equal(canReceiveLead({
  role: '超级管理员',
  roleId: 'role-super-admin',
  isActive: true,
}, DEFAULT_ROLES), false, '只有通用管理权限的超级管理员不应自动成为销售候选人');

const superAdminWithLeadFollow: Role = {
  ...DEFAULT_ROLES.find((role) => role.code === 'super_admin')!,
  permissions: [
    { module: '全部', actions: ['read', 'write', 'delete', 'admin'] },
    { module: PERMISSION_KEYS.LEADS_FOLLOW, actions: ['read', 'write'] },
  ],
};
assert.equal(canReceiveLead({
  role: '超级管理员',
  roleId: superAdminWithLeadFollow.id,
  isActive: true,
}, [superAdminWithLeadFollow]), true, '显式配置线索跟进权限的超级管理员应允许领取');

const recoveryReviewReadOnlyRole: Role = {
  id: 'role-recovery-review-read-only',
  name: '售后审核台只读',
  code: 'recovery_review_read_only',
  permissions: [{ module: PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW_LIST, actions: ['read'] }],
  memberCount: 0,
  isActive: true,
  createdAt: now,
  updatedAt: now,
};
const orderReviewListOnlyRole: Role = {
  id: 'role-order-review-list-only',
  name: '订单审核列表只读',
  code: 'order_review_list_only',
  permissions: [{ module: PERMISSION_KEYS.ORDER_REVIEW_LIST, actions: ['read'] }],
  memberCount: 0,
  isActive: true,
  createdAt: now,
  updatedAt: now,
};
assert.equal(roleHasPermission(orderReviewListOnlyRole, PERMISSION_KEYS.ORDER_REVIEW_LIST, 'read'), true);
assert.equal(
  roleHasPermission(orderReviewListOnlyRole, PERMISSION_KEYS.ORDER_REVIEW, 'write'),
  false,
  '订单审核列表查看权限不得升级为审核操作权限',
);
assert.equal(
  roleHasPermission(recoveryReviewReadOnlyRole, PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW_LIST, 'read'),
  true,
  '审核列表权限应允许进入审核台',
);
assert.equal(
  roleHasPermission(recoveryReviewReadOnlyRole, PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW, 'write'),
  false,
  '审核列表权限不得自动升级为审核操作权限',
);
assert.equal(
  canReviewRecoveryOrders({
    isActive: true,
    permissions: [{ module: PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW, actions: ['read', 'write'] }],
  }),
  true,
  '审核操作应只由明确的审核操作写权限控制，不应再硬编码绑定财务权限',
);
assert.equal(
  normalizeRoleDataScopes({
    code: 'review_action_only',
    permissions: [{ module: PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW, actions: ['read', 'write'] }],
  }).recoveryOrderApplications,
  'self',
  '审核操作权限不得把审核台数据范围隐式提升为全部',
);

const defaultFinanceReviewRole = DEFAULT_ROLES.find((role) => role.code === 'finance_specialist');
assert.equal(
  roleHasPermission(defaultFinanceReviewRole, PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW_LIST, 'read'),
  true,
  '默认财务角色必须拥有审核列表查看权限',
);
assert.equal(
  roleHasPermission(defaultFinanceReviewRole, PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW, 'write'),
  true,
  '默认财务角色必须单独拥有审核操作权限',
);
