import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildRoleEditorPermissions, hasDuplicateRoleName, normalizeRoleEditorDataScopes } from './rolePermissionModel';
import { PERMISSION_KEYS } from '../../shared/utils/permissions';
import { mergeRoleWithDefaultAccess } from '../../shared/utils/organizationConfig';
import type { Role } from '../../types/role';

const rolePermissionSource = readFileSync(new URL('./RolePermission.tsx', import.meta.url), 'utf8');
assert.doesNotMatch(rolePermissionSource, /仅本部门|本部门及所有下级部门/);
assert.match(rolePermissionSource, /CUSTOMER_SCOPE_OPTIONS[\s\S]*value: 'self'[\s\S]*value: 'department'[\s\S]*value: 'all'/);

const roleNames = [
  { id: 'role-sales', name: '销售经理' },
  { id: 'role-finance', name: 'Finance Manager' },
];
assert.equal(hasDuplicateRoleName('  销售经理  ', roleNames), true);
assert.equal(hasDuplicateRoleName('FINANCE manager', roleNames), true);
assert.equal(hasDuplicateRoleName('销售经理', roleNames, 'role-sales'), false);
assert.equal(hasDuplicateRoleName('销售总监', roleNames), false);

const sparseFinanceScopes = normalizeRoleEditorDataScopes('finance_specialist', {
  customers: 'department_only',
});
assert.deepEqual(sparseFinanceScopes, {
  leads: 'self',
  customers: 'department',
  orders: 'all',
  deliveries: 'all',
  orderApplications: 'all',
  recoveryOrders: 'all',
  recoveryOrderApplications: 'all',
  assets: 'self',
});
assert.deepEqual(
  normalizeRoleEditorDataScopes('finance_specialist', sparseFinanceScopes),
  sparseFinanceScopes,
  '财务角色打开、保存并重新加载后必须保留完整默认范围',
);

const sparseSalesManagerScopes = normalizeRoleEditorDataScopes('sales_manager', {
  customers: 'department',
  assets: 'all',
});
assert.deepEqual(sparseSalesManagerScopes, {
  leads: 'department',
  customers: 'department',
  orders: 'department',
  deliveries: 'department',
  orderApplications: 'department',
  recoveryOrders: 'department',
  recoveryOrderApplications: 'department',
  assets: 'all',
});
assert.deepEqual(
  normalizeRoleEditorDataScopes('sales_manager', sparseSalesManagerScopes),
  sparseSalesManagerScopes,
  '销售经理角色打开、保存并重新加载后必须保留完整默认范围',
);

const recoveryReviewPermissions = [
  { module: PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW_LIST, actions: ['read'] },
];
const sparseRecoveryReviewScopes = normalizeRoleEditorDataScopes(
  'recovery_review_reader',
  undefined,
  recoveryReviewPermissions,
);
assert.equal(
  sparseRecoveryReviewScopes.recoveryOrderApplications,
  'all',
  '售后审核列表角色打开编辑器时必须保留审核台 all 回退',
);
assert.deepEqual(
  normalizeRoleEditorDataScopes('recovery_review_reader', sparseRecoveryReviewScopes, recoveryReviewPermissions),
  sparseRecoveryReviewScopes,
  '售后审核列表角色保存并重新加载后必须保留审核台范围回退',
);

const legacyLoadedRole = mergeRoleWithDefaultAccess({
  id: 'role-legacy-customer-parent',
  name: '旧客户父权限',
  code: 'legacy_customer_parent',
  permissions: [{ module: PERMISSION_KEYS.CUSTOMERS, actions: ['admin'] }],
  memberCount: 0,
  isActive: true,
  createdAt: '2026-07-17T00:00:00.000Z',
  updatedAt: '2026-07-17T00:00:00.000Z',
} satisfies Role);
const editorSavedPermissions = buildRoleEditorPermissions(
  legacyLoadedRole.permissions.map((permission) => permission.module),
);
assert.equal(editorSavedPermissions.some((permission) => permission.module === PERMISSION_KEYS.CUSTOMERS), false);
assert.deepEqual(
  editorSavedPermissions.find((permission) => permission.module === PERMISSION_KEYS.CUSTOMER_LIST)?.actions,
  undefined,
  '历史 admin 父权限不得在角色编辑器打开保存时扩张成客户列表读取权',
);
assert.deepEqual(
  editorSavedPermissions.find((permission) => permission.module === PERMISSION_KEYS.CUSTOMER_DETAIL)?.actions,
  undefined,
  '历史 admin 父权限不得在角色编辑器打开保存时扩张成客户详情读取权',
);

const toggledEditorPermissions = buildRoleEditorPermissions([
  PERMISSION_KEYS.CUSTOMERS,
  PERMISSION_KEYS.CUSTOMER_LIST,
  PERMISSION_KEYS.CUSTOMER_DETAIL,
  PERMISSION_KEYS.CUSTOMER_SET_PROGRESS,
]);
assert.equal(toggledEditorPermissions.some((permission) => permission.module === PERMISSION_KEYS.CUSTOMERS), false);
assert.deepEqual(
  toggledEditorPermissions.find((permission) => permission.module === PERMISSION_KEYS.CUSTOMER_SET_PROGRESS)?.actions,
  ['read', 'write'],
);

const publicPoolClaimPermissions = buildRoleEditorPermissions([
  PERMISSION_KEYS.CUSTOMER_PUBLIC_POOL_CLAIM,
]);
assert.deepEqual(
  publicPoolClaimPermissions.find((permission) => permission.module === PERMISSION_KEYS.CUSTOMER_PUBLIC_POOL_CLAIM)?.actions,
  ['read', 'write'],
);
assert.deepEqual(
  publicPoolClaimPermissions.find((permission) => permission.module === PERMISSION_KEYS.CUSTOMER_PUBLIC_POOL_VIEW)?.actions,
  ['read'],
  '角色编辑器选中领取时必须持久化查看公海池依赖',
);
assert.deepEqual(
  publicPoolClaimPermissions.find((permission) => permission.module === PERMISSION_KEYS.CUSTOMER_LIST)?.actions,
  undefined,
  '领取公海权不得在角色编辑器中隐式扩张为普通客户列表权',
);
