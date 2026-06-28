import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { authApi, roleApi, settingsApi } from './index';
import { DEFAULT_USER_PASSWORD } from '../shared/utils/auth';
import { STORAGE_KEYS } from '../shared/utils/constants';
import { DEFAULT_ROLES } from '../shared/utils/organizationConfig';
import { CAPABILITY_KEYS, hasPermission, PERMISSION_KEYS, roleHasPermission, sanitizeRolePermissions, toAuthenticatedUser } from '../shared/utils/permissions';
import type { Role } from '../types/role';

const appSource = readFileSync(join(process.cwd(), 'src', 'App.tsx'), 'utf8');
const sidebarSource = readFileSync(join(process.cwd(), 'src', 'layouts', 'Sidebar.tsx'), 'utf8');
const settingsSource = readFileSync(join(process.cwd(), 'src', 'pages', 'Settings', 'index.tsx'), 'utf8');
const rolePermissionSource = readFileSync(join(process.cwd(), 'src', 'pages', 'Settings', 'RolePermission.tsx'), 'utf8');
assert.match(appSource, /ProtectedRoute permissionKey=\{PERMISSION_KEYS\.CUSTOMERS\}/);
assert.doesNotMatch(appSource, /PERMISSION_KEYS\.COMMISSION|PERMISSION_KEYS\.REFUND_CENTER/);
assert.doesNotMatch(sidebarSource, /PERMISSION_KEYS\.COMMISSION|PERMISSION_KEYS\.REFUND_CENTER/);
assert.doesNotMatch(sidebarSource, /group=leadCustomer[\s\S]*PERMISSION_KEYS\.LEADS_FLOW_CONFIG/);
assert.doesNotMatch(settingsSource, /permissionKey: PERMISSION_KEYS\.LEADS_FLOW_CONFIG/);
assert.doesNotMatch(rolePermissionSource, /label:\s*'提成'/);
assert.doesNotMatch(rolePermissionSource, /label:\s*'退款中心'/);
assert.match(rolePermissionSource, /财务中心/);
assert.match(rolePermissionSource, /订单分账/);
assert.match(rolePermissionSource, /月度发放/);
assert.match(rolePermissionSource, /规则配置/);
assert.match(rolePermissionSource, /售后服务/);
assert.match(rolePermissionSource, /订单退款/);
assert.match(rolePermissionSource, /退款挽回单/);
assert.match(rolePermissionSource, /新建挽回单/);
assert.match(rolePermissionSource, /审核挽回单/);
assert.doesNotMatch(rolePermissionSource, /售后工单/);
assert.doesNotMatch(rolePermissionSource, /退款冲销/);
assert.doesNotMatch(rolePermissionSource, /退款付款/);
assert.match(rolePermissionSource, /客户等级/);
assert.match(rolePermissionSource, /线索流转/);
assert.match(rolePermissionSource, /数据维护/);
assert.match(rolePermissionSource, /label:\s*'线索列表'/);
assert.match(rolePermissionSource, /label:\s*'入库情况'/);
assert.match(rolePermissionSource, /label:\s*'查看线索资料'/);
assert.match(rolePermissionSource, /label:\s*'新建线索'/);
assert.match(rolePermissionSource, /label:\s*'开始跟进并加入客户'/);
assert.match(rolePermissionSource, /label:\s*'分配销售'/);
assert.doesNotMatch(rolePermissionSource, /label:\s*'接收\/领取线索'|label:\s*'分配线索能力'|label:\s*'线索跟进'|label:\s*'线索转客户'/);

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

const marketRole = DEFAULT_ROLES.find((role) => role.code === 'market_specialist');
assert.ok(marketRole);
const defaultSalesManagerRole = DEFAULT_ROLES.find((role) => role.code === 'sales_manager');
assert.ok(defaultSalesManagerRole);
assert.equal(defaultSalesManagerRole.permissions.some((permission) => permission.module === '提成'), false);
const defaultFinanceRole = DEFAULT_ROLES.find((role) => role.code === 'finance_specialist');
assert.ok(defaultFinanceRole);
assert.equal(defaultFinanceRole.permissions.some((permission) => permission.module === '财务中心/订单分账'), true);

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

const customerChildRole: Role = {
  ...legacyOpportunityRole,
  id: 'role-customer-child',
  code: 'customer_child',
  permissions: [{ module: PERMISSION_KEYS.CUSTOMER_CREATE, actions: ['read'] }],
};
assert.equal(roleHasPermission(customerChildRole, PERMISSION_KEYS.CUSTOMERS), true);

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
