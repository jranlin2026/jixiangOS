import assert from 'node:assert/strict';
import {
  CUSTOMER_LEAF_PERMISSION_KEYS,
  getCustomerBatchActionPermissions,
  getCustomerPermissionTree,
  getGrantedPermissionModules,
  getRoleEditorPermissionActions,
  hasPermission,
  hasExplicitPermission,
  PERMISSION_KEYS,
  roleHasPermission,
  sanitizeRolePermissions,
} from './permissions';
import { mergeRoleWithDefaultAccess, normalizeRoleDataScopes } from './organizationConfig';
import type { Role } from '../../types/role';

const granted = getGrantedPermissionModules([
  { module: PERMISSION_KEYS.CUSTOMERS, actions: ['read'] },
]);
assert.equal(granted.has(PERMISSION_KEYS.CUSTOMER_LIST), true);
assert.equal(granted.has(PERMISSION_KEYS.CUSTOMER_DETAIL), true);
assert.equal(granted.has(PERMISSION_KEYS.CUSTOMER_SET_PROGRESS), false);
assert.equal(granted.has(PERMISSION_KEYS.CUSTOMER_BATCH_MANAGE), false);
assert.equal(getGrantedPermissionModules([{ module: PERMISSION_KEYS.CUSTOMERS, actions: ['write'] }]).has(PERMISSION_KEYS.CUSTOMER_SET_PROGRESS), false);
assert.equal(getGrantedPermissionModules([{ module: PERMISSION_KEYS.CUSTOMER_SET_PROGRESS, actions: ['write'] }]).has(PERMISSION_KEYS.CUSTOMER_SET_PROGRESS), true);
for (const leaf of CUSTOMER_LEAF_PERMISSION_KEYS) {
  assert.equal(getGrantedPermissionModules([{ module: leaf, actions: ['write'] }]).has(leaf), true);
}
for (const highRiskKey of [
  PERMISSION_KEYS.CUSTOMER_SET_PROGRESS,
  PERMISSION_KEYS.CUSTOMER_TRANSFER,
  PERMISSION_KEYS.CUSTOMER_BATCH_MANAGE,
  PERMISSION_KEYS.CUSTOMER_DELETE,
  PERMISSION_KEYS.CUSTOMER_IMPORT,
  PERMISSION_KEYS.CUSTOMER_EXPORT,
  PERMISSION_KEYS.CUSTOMER_MERGE,
  PERMISSION_KEYS.CUSTOMER_BATCH_CANCEL,
]) {
  for (const legacyAction of ['read', 'write', 'delete', 'admin']) {
    const legacyGrant = getGrantedPermissionModules([{ module: PERMISSION_KEYS.CUSTOMERS, actions: [legacyAction] }]);
    assert.equal(legacyGrant.has(highRiskKey), false);
  }
}
assert.equal(normalizeRoleDataScopes({ code: 'test', dataScopes: { customers: 'department' } }).customers, 'department');
assert.equal(normalizeRoleDataScopes({ code: 'test', dataScopes: { customers: 'department_only' } }).customers, 'department');
assert.equal(normalizeRoleDataScopes({ code: 'test', dataScopes: { customers: 'department_and_descendants' } }).customers, 'department');
assert.equal(normalizeRoleDataScopes({ code: 'test', dataScopes: { orders: 'department' } }).orders, 'department');
assert.equal(normalizeRoleDataScopes({ code: 'test', dataScopes: { orders: 'department' } }).deliveries, 'department');
assert.equal(normalizeRoleDataScopes({ code: 'finance_specialist' }).orders, 'all');

const omittedScopes = normalizeRoleDataScopes({ code: 'test' });
assert.deepEqual(omittedScopes, {
  leads: 'self',
  customers: 'self',
  orders: 'self',
  deliveries: 'self',
  orderApplications: 'self',
  recoveryOrders: 'self',
  recoveryOrderApplications: 'self',
  assets: 'self',
});
assert.deepEqual(
  normalizeRoleDataScopes({
    code: 'test',
    dataScopes: {
      leads: 'all',
      customers: 'department_only',
      orders: 'department',
      deliveries: 'all',
      orderApplications: 'department',
      recoveryOrders: 'all',
      recoveryOrderApplications: 'department',
      assets: 'all',
    },
  }),
  {
    leads: 'all',
    customers: 'department',
    orders: 'department',
    deliveries: 'all',
    orderApplications: 'department',
    recoveryOrders: 'all',
    recoveryOrderApplications: 'department',
    assets: 'all',
  },
);
assert.equal(
  normalizeRoleDataScopes({
    code: 'test',
    permissions: [{ module: PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW_LIST, actions: ['read'] }],
  }).recoveryOrderApplications,
  'all',
);
assert.equal(normalizeRoleDataScopes({ code: 'finance_specialist' }).assets, 'self');

assert.deepEqual(getCustomerBatchActionPermissions('transfer'), [
  PERMISSION_KEYS.CUSTOMER_BATCH_MANAGE,
  PERMISSION_KEYS.CUSTOMER_TRANSFER,
]);
assert.deepEqual(
  getCustomerPermissionTree().flatMap((node) => node.leafKeys).sort(),
  [...CUSTOMER_LEAF_PERMISSION_KEYS].sort(),
);

const roleFixture = (permissions: Role['permissions']): Role => ({
  id: 'role-customer-leaf-round-trip',
  name: '客户叶子权限回归',
  code: 'customer_leaf_round_trip',
  permissions,
  memberCount: 0,
  isActive: true,
  createdAt: '2026-07-17T00:00:00.000Z',
  updatedAt: '2026-07-17T00:00:00.000Z',
});

for (const leaf of CUSTOMER_LEAF_PERMISSION_KEYS) {
  const editorActions = getRoleEditorPermissionActions(leaf);
  const savedPermissions = sanitizeRolePermissions([{ module: leaf, actions: editorActions }]);
  const reloadedPermission = savedPermissions.find((permission) => permission.module === leaf);
  assert.ok(reloadedPermission, `角色编辑器保存并重新加载后必须保留客户叶子 ${leaf}`);
  assert.deepEqual(reloadedPermission.actions, editorActions, `客户叶子 ${leaf} 的编辑器动作必须无损往返`);

  const runtimeAction = editorActions.includes('delete')
    ? 'delete'
    : editorActions.includes('write')
      ? 'write'
      : 'read';
  assert.equal(roleHasPermission(roleFixture(savedPermissions), leaf, runtimeAction), true, `角色运行时必须授权客户叶子 ${leaf}`);
  assert.equal(hasPermission({ role: '客户叶子权限回归', isActive: true, permissions: savedPermissions }, leaf, runtimeAction), true, `登录态运行时必须授权客户叶子 ${leaf}`);
}

const profileRole = roleFixture(sanitizeRolePermissions([
  { module: PERMISSION_KEYS.CUSTOMER_PROFILE, actions: ['read'] },
]));
assert.equal(roleHasPermission(profileRole, PERMISSION_KEYS.CUSTOMER_PROFILE), true);
assert.equal(roleHasPermission(profileRole, PERMISSION_KEYS.CUSTOMER_DETAIL), false);
assert.equal(roleHasPermission(profileRole, PERMISSION_KEYS.CUSTOMER_AI_CARD), false);

const aiCardRole = roleFixture(sanitizeRolePermissions([
  { module: PERMISSION_KEYS.CUSTOMER_AI_CARD, actions: ['read'] },
]));
assert.equal(roleHasPermission(aiCardRole, PERMISSION_KEYS.CUSTOMER_AI_CARD), true);
assert.equal(roleHasPermission(aiCardRole, PERMISSION_KEYS.CUSTOMER_DETAIL), false);
assert.equal(roleHasPermission(aiCardRole, PERMISSION_KEYS.CUSTOMER_PROFILE), false);

const highRiskCustomerLeaves = [
  PERMISSION_KEYS.CUSTOMER_SET_PROGRESS,
  PERMISSION_KEYS.CUSTOMER_TRANSFER,
  PERMISSION_KEYS.CUSTOMER_BATCH_MANAGE,
  PERMISSION_KEYS.CUSTOMER_DELETE,
  PERMISSION_KEYS.CUSTOMER_IMPORT,
  PERMISSION_KEYS.CUSTOMER_EXPORT,
  PERMISSION_KEYS.CUSTOMER_MERGE,
  PERMISSION_KEYS.CUSTOMER_BATCH_CANCEL,
];

const wildcardDeleteRole = roleFixture([
  { module: '全部', actions: ['delete'] },
]);
assert.equal(
  roleHasPermission(wildcardDeleteRole, PERMISSION_KEYS.CUSTOMER_DELETE, 'delete'),
  false,
  'CUSTOMER_DELETE 必须有显式叶子，全部/delete 不得隐式授权',
);
const wildcardAdminRole = {
  ...roleFixture([{ module: '全部', actions: ['admin'] }]),
  code: 'super_admin',
};
assert.equal(
  roleHasPermission(wildcardAdminRole, PERMISSION_KEYS.CUSTOMER_DELETE, 'delete'),
  false,
  '角色 code 或 全部/admin 都不得绕过显式 CUSTOMER_DELETE 叶子',
);
assert.equal(
  hasPermission({ role: '旧超级管理员', isActive: true, permissions: [{ module: '全部', actions: ['admin'] }] }, PERMISSION_KEYS.CUSTOMER_DELETE, 'delete'),
  false,
  '无 live role 的登录态 fallback 也必须拒绝 wildcard 客户删除',
);
assert.equal(
  hasExplicitPermission({ isActive: true, permissions: [{ module: '全部', actions: ['admin'] }] }, PERMISSION_KEYS.CUSTOMER_DELETE, 'delete'),
  false,
  '显式权限 helper 不得把 全部/admin 当成 CUSTOMER_DELETE',
);
const explicitDeletePermissions = [{ module: PERMISSION_KEYS.CUSTOMER_DELETE, actions: ['read', 'delete'] }];
assert.equal(
  roleHasPermission(roleFixture(explicitDeletePermissions), PERMISSION_KEYS.CUSTOMER_DELETE, 'delete'),
  true,
  'manifest 迁移写入的显式 CUSTOMER_DELETE 叶子必须授权删除',
);
assert.equal(
  hasPermission({ role: '清单删除角色', isActive: true, permissions: explicitDeletePermissions }, PERMISSION_KEYS.CUSTOMER_DELETE, 'delete'),
  true,
);
for (const legacyAction of ['read', 'write', 'delete', 'admin']) {
  const parentPermissions = [{ module: PERMISSION_KEYS.CUSTOMERS, actions: [legacyAction] }];
  const parentRole = roleFixture(parentPermissions);
  for (const leaf of highRiskCustomerLeaves) {
    assert.equal(roleHasPermission(parentRole, leaf), false, `客户父权限 ${legacyAction} 不得授权高风险叶子 ${leaf}`);
    assert.equal(hasPermission({ role: '旧客户父权限', isActive: true, permissions: parentPermissions }, leaf), false, `登录态客户父权限 ${legacyAction} 不得授权高风险叶子 ${leaf}`);
  }
}

for (const storedAction of ['read', 'write', 'delete', 'admin']) {
  const loadedRole = mergeRoleWithDefaultAccess(roleFixture([
    { module: PERMISSION_KEYS.CUSTOMERS, actions: [storedAction] },
  ]));
  assert.deepEqual(
    loadedRole.permissions.find((permission) => permission.module === PERMISSION_KEYS.CUSTOMERS)?.actions,
    [storedAction],
    `真实角色加载必须保留客户父权限 ${storedAction} 的原始动作，避免把非 read 历史权限扩张成读取权`,
  );
  assert.deepEqual(
    loadedRole.permissions.find((permission) => permission.module === PERMISSION_KEYS.CUSTOMER_LIST)?.actions,
    storedAction === 'read' ? ['read'] : undefined,
  );
  assert.deepEqual(
    loadedRole.permissions.find((permission) => permission.module === PERMISSION_KEYS.CUSTOMER_DETAIL)?.actions,
    storedAction === 'read' ? ['read'] : undefined,
  );
  assert.equal(roleHasPermission(loadedRole, PERMISSION_KEYS.CUSTOMER_LIST, 'read'), storedAction === 'read');
  assert.equal(roleHasPermission(loadedRole, PERMISSION_KEYS.CUSTOMER_DETAIL, 'read'), storedAction === 'read');
  for (const leaf of highRiskCustomerLeaves) {
    assert.equal(roleHasPermission(loadedRole, leaf), false, `加载后的迁移标记不得授权高风险叶子 ${leaf}`);
  }
}
