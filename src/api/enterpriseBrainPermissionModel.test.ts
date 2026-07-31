import assert from 'node:assert/strict';
import { DEFAULT_ROLES } from '../shared/utils/organizationConfig';
import { PERMISSION_KEYS, roleHasPermission } from '../shared/utils/permissions';
import { getCoreRolePermissionTree } from '../pages/Settings/corePermissionCatalog';

const tree = getCoreRolePermissionTree();
const enterpriseBrain = tree.find((node) => node.label === '企业AI大脑');
assert.ok(enterpriseBrain, '角色权限页必须提供企业AI大脑权限组');

const salesConsultant = DEFAULT_ROLES.find((role) => role.code === 'sales_consultant');
const salesManager = DEFAULT_ROLES.find((role) => role.code === 'sales_manager');

assert.ok(roleHasPermission(salesConsultant, PERMISSION_KEYS.STANDARD_READ), '销售顾问可以读取适用岗位标准');
assert.ok(roleHasPermission(salesConsultant, PERMISSION_KEYS.TASK_SELF), '销售顾问可以执行本人任务');
assert.ok(roleHasPermission(salesConsultant, PERMISSION_KEYS.REVIEW_SELF, 'write'), '销售顾问可以提交本人复盘');
assert.ok(roleHasPermission(salesConsultant, PERMISSION_KEYS.AI_POSITION_ASSISTANT), '销售顾问可以使用岗位AI助手');
assert.equal(roleHasPermission(salesConsultant, PERMISSION_KEYS.TASK_TEAM), false, '销售顾问不能读取团队任务');

assert.ok(roleHasPermission(salesManager, PERMISSION_KEYS.TASK_TEAM), '销售经理可以读取团队任务');
assert.ok(roleHasPermission(salesManager, PERMISSION_KEYS.TASK_ASSIGN, 'write'), '销售经理可以指派任务');
assert.ok(roleHasPermission(salesManager, PERMISSION_KEYS.REVIEW_TEAM), '销售经理可以读取团队复盘');
assert.ok(roleHasPermission(salesManager, PERMISSION_KEYS.BRAIN_DASHBOARD), '销售经理可以读取执行驾驶舱');

console.log('enterprise brain permission model tests passed');
