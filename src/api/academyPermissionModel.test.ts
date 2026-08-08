import assert from 'node:assert/strict';
import { hasPermission, PERMISSION_KEYS } from '../shared/utils/permissions';

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

const legacyOperator: any = {
  id: 'legacy-academy-operator',
  isActive: true,
  permissions: [{ module: '赋能中台/极享商学院/场次运营', actions: ['read', 'write'] }],
};
assert.equal(hasPermission(legacyOperator, PERMISSION_KEYS.ACADEMY_SESSION_MANAGE, 'write'), true, '历史角色授权升级后不得失效');
assert.equal(hasPermission(legacyOperator, PERMISSION_KEYS.ENABLEMENT), false, '历史商学院权限也不得继续越权进入企业标准中心');

console.log('academy permission model tests passed');
