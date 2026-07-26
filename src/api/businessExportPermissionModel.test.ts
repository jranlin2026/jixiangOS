import assert from 'node:assert/strict';
import { DEFAULT_ROLES } from '../shared/utils/organizationConfig';
import { hasPermission, PERMISSION_KEYS } from '../shared/utils/permissions';

const exportPermissionKeys = [
  'ORDER_EXPORT',
  'ORDER_SETTLEMENT_EXPORT',
  'AFTER_SALES_RECOVERY_EXPORT',
  'RECOVERY_SETTLEMENT_EXPORT',
] as const;

for (const key of exportPermissionKeys) {
  assert.equal(typeof (PERMISSION_KEYS as Record<string, unknown>)[key], 'string', `${key} 必须是独立权限键`);
}

const financeRole = DEFAULT_ROLES.find((role) => role.code === 'finance_specialist');
assert.ok(financeRole, '默认财务角色必须存在');
for (const key of exportPermissionKeys) {
  const permission = (PERMISSION_KEYS as Record<string, string>)[key];
  assert.equal(
    hasPermission({ ...financeRole, role: financeRole!.name, isActive: true }, permission),
    false,
    '导出权限只能默认授予超级管理员',
  );
}

const superAdmin = DEFAULT_ROLES.find((role) => role.code === 'super_admin');
assert.ok(superAdmin, '默认超级管理员角色必须存在');
for (const key of exportPermissionKeys) {
  const permission = (PERMISSION_KEYS as Record<string, string>)[key];
  assert.equal(hasPermission({ ...superAdmin, role: superAdmin!.name, isActive: true }, permission), true);
}

assert.equal(
  hasPermission({ role: '旧售后角色', isActive: true, permissions: [{ module: PERMISSION_KEYS.AFTER_SALES, actions: ['read'] }] }, PERMISSION_KEYS.AFTER_SALES_RECOVERY_EXPORT),
  false,
  '售后父权限不得隐式获得独立导出权限',
);
