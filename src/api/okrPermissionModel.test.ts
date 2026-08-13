import assert from 'node:assert/strict';
import { DEFAULT_ROLES, normalizeRoleDataScopes } from '../shared/utils/organizationConfig';
import {
  getRoleEditorPermissionActions,
  PERMISSION_KEYS,
  roleHasPermission,
} from '../shared/utils/permissions';

assert.deepEqual({
  module: PERMISSION_KEYS.OKR,
  self: PERMISSION_KEYS.OKR_SELF_READ,
  team: PERMISSION_KEYS.OKR_TEAM_READ,
  create: PERMISSION_KEYS.OKR_CREATE,
  checkIn: PERMISSION_KEYS.OKR_CHECK_IN,
  department: PERMISSION_KEYS.OKR_DEPARTMENT_MANAGE,
  company: PERMISSION_KEYS.OKR_COMPANY_MANAGE,
  cycle: PERMISSION_KEYS.OKR_CYCLE_MANAGE,
  scoreClose: PERMISSION_KEYS.OKR_SCORE_CLOSE,
  metricBind: PERMISSION_KEYS.OKR_METRIC_BIND,
}, {
  module: '目标管理',
  self: '目标管理/查看本人目标',
  team: '目标管理/查看团队目标',
  create: '目标管理/创建目标',
  checkIn: '目标管理/提交检视',
  department: '目标管理/管理部门目标',
  company: '目标管理/管理公司目标',
  cycle: '目标管理/管理周期',
  scoreClose: '目标管理/评分与关闭',
  metricBind: '目标管理/绑定经营指标',
});

const employee = DEFAULT_ROLES.find((role) => role.code === 'sales_consultant');
const manager = DEFAULT_ROLES.find((role) => role.code === 'sales_manager');
const admin = DEFAULT_ROLES.find((role) => role.code === 'super_admin');

assert.ok(roleHasPermission(employee, PERMISSION_KEYS.OKR_SELF_READ));
assert.ok(roleHasPermission(employee, PERMISSION_KEYS.OKR_CREATE, 'write'));
assert.ok(roleHasPermission(employee, PERMISSION_KEYS.OKR_CHECK_IN, 'write'));
assert.equal(roleHasPermission(employee, PERMISSION_KEYS.OKR_TEAM_READ), false);
assert.equal(roleHasPermission(employee, PERMISSION_KEYS.OKR_DEPARTMENT_MANAGE, 'write'), false);

assert.ok(roleHasPermission(manager, PERMISSION_KEYS.OKR_SELF_READ));
assert.ok(roleHasPermission(manager, PERMISSION_KEYS.OKR_TEAM_READ));
assert.ok(roleHasPermission(manager, PERMISSION_KEYS.OKR_DEPARTMENT_MANAGE, 'write'));
assert.equal(roleHasPermission(manager, PERMISSION_KEYS.OKR_COMPANY_MANAGE, 'write'), false);
assert.equal(roleHasPermission(manager, PERMISSION_KEYS.OKR_CYCLE_MANAGE, 'write'), false);
assert.ok(roleHasPermission(admin, PERMISSION_KEYS.OKR_COMPANY_MANAGE, 'write'));
assert.ok(roleHasPermission(admin, PERMISSION_KEYS.OKR_METRIC_BIND, 'write'));

assert.equal(normalizeRoleDataScopes({ code: 'employee' }).okr, 'self');
assert.equal(normalizeRoleDataScopes({ code: 'sales_manager' }).okr, 'department');
assert.equal(normalizeRoleDataScopes({ code: 'sales_director' }).okr, 'department');
assert.equal(normalizeRoleDataScopes({ code: 'super_admin' }).okr, 'all');
assert.equal(normalizeRoleDataScopes({ code: 'sales_manager', dataScopes: { okr: 'all' } }).okr, 'all');

assert.deepEqual(getRoleEditorPermissionActions(PERMISSION_KEYS.OKR_TEAM_READ), ['read']);
assert.deepEqual(getRoleEditorPermissionActions(PERMISSION_KEYS.OKR_CHECK_IN), ['read', 'write']);
assert.deepEqual(getRoleEditorPermissionActions(PERMISSION_KEYS.OKR_CYCLE_MANAGE), ['read', 'write']);

console.log('okr permission model tests passed');
