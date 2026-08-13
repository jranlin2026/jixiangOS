import assert from 'node:assert/strict';
import { hasPermission, PERMISSION_KEYS } from '../shared/utils/permissions';
import { canAccessAcademy } from '../shared/utils/academyAccess';

const operator: any = {
  id: 'academy-operator',
  isActive: true,
  permissions: [{ module: '极享商学院/场次运营', actions: ['read', 'write'] }],
};

assert.equal(hasPermission(operator, PERMISSION_KEYS.ACADEMY), true, '商学院子权限必须允许进入独立商学院');
assert.equal(hasPermission(operator, PERMISSION_KEYS.ENABLEMENT), false, '商学院权限不得越权进入企业标准中心');
assert.equal(hasPermission(operator, PERMISSION_KEYS.ACADEMY_VIEW), true, '商学院写权限必须包含商学院查看能力');
assert.equal(hasPermission(operator, PERMISSION_KEYS.ACADEMY_SESSION_MANAGE, 'write'), true);
assert.equal(hasPermission(operator, PERMISSION_KEYS.ACADEMY_COURSE_MANAGE, 'write'), false, '场次运营不能越权维护课程');
assert.equal(canAccessAcademy(operator), true, '任一商学院子权限必须显示菜单并允许进入路由');

const noAcademyPermission: any = {
  id: 'sales-manager-without-academy',
  isActive: true,
  permissions: [{ module: PERMISSION_KEYS.CUSTOMER_LIST, actions: ['read'] }],
};
assert.equal(hasPermission(noAcademyPermission, PERMISSION_KEYS.ACADEMY), false, '未开通商学院权限的角色不得进入商学院');
assert.equal(canAccessAcademy(noAcademyPermission), false, '未开通商学院权限的角色必须隐藏菜单并被路由拦截');

const superAdmin: any = {
  id: 'academy-super-admin',
  role: '超级管理员',
  isActive: true,
  permissions: [{ module: '全部', actions: ['admin'] }],
};
assert.equal(hasPermission(superAdmin, PERMISSION_KEYS.ACADEMY), true, '超级管理员必须保持商学院访问能力');
assert.equal(canAccessAcademy(superAdmin), true, '超级管理员必须显示菜单并允许进入路由');

const legacyOperator: any = {
  id: 'legacy-academy-operator',
  isActive: true,
  permissions: [{ module: '赋能中台/极享商学院/场次运营', actions: ['read', 'write'] }],
};
assert.equal(hasPermission(legacyOperator, PERMISSION_KEYS.ACADEMY_SESSION_MANAGE, 'write'), true, '历史角色授权升级后不得失效');
assert.equal(hasPermission(legacyOperator, PERMISSION_KEYS.ENABLEMENT), false, '历史商学院权限也不得继续越权进入企业标准中心');

console.log('academy permission model tests passed');
