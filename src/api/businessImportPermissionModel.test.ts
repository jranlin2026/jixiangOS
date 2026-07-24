import assert from 'node:assert/strict';
import { DEFAULT_ROLES } from '../shared/utils/organizationConfig';
import { hasPermission, PERMISSION_KEYS } from '../shared/utils/permissions';

const orderImport = PERMISSION_KEYS.ORDER_IMPORT;
const recoveryImport = PERMISSION_KEYS.AFTER_SALES_RECOVERY_IMPORT;

assert.equal(hasPermission({ role: '订单列表编辑者', isActive: true, permissions: [{ module: PERMISSION_KEYS.ORDER_MANAGE, actions: ['read', 'write'] }] }, orderImport, 'write'), false,
  '订单列表权限不得隐式授予导入订单');
assert.equal(hasPermission({ role: '售后编辑者', isActive: true, permissions: [{ module: PERMISSION_KEYS.AFTER_SALES_RECOVERY, actions: ['read', 'write'] }] }, recoveryImport, 'write'), false,
  '售后列表权限不得隐式授予导入售后挽回订单');
assert.equal(hasPermission({ role: '导入员', isActive: true, permissions: [{ module: orderImport, actions: ['read', 'write'] }] }, orderImport, 'write'), true);
assert.equal(hasPermission({ role: '导入员', isActive: true, permissions: [{ module: recoveryImport, actions: ['read', 'write'] }] }, recoveryImport, 'write'), true);
assert.equal(DEFAULT_ROLES.find((role) => role.code === 'sales_manager')?.permissions.some((item) => item.module === orderImport || item.module === recoveryImport), false,
  '非超级管理员默认角色不应在未显式配置时获得导入权限');
assert.equal(DEFAULT_ROLES.find((role) => role.code === 'super_admin')?.permissions.some((item) => item.module === '全部'), true);

console.log('business import permission model: ok');
