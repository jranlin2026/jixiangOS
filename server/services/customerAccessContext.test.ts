import assert from 'node:assert/strict';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import type { AuthenticatedUser } from '../../src/types/auth';
import { loadCustomerAccessContext } from './customerAccessPolicy';

const NOW = new Date('2026-07-17T00:00:00.000Z');
const actor: AuthenticatedUser = {
  id: 'user-actor', name: '主管', account: 'manager', email: '', phone: '', role: '不可依赖的角色名' as any,
  roleId: 'role-authoritative', departmentId: 'dept-root', permissions: [{ module: '全部', actions: ['admin'] }], isActive: true,
};
const users = [
  { id: actor.id, name: actor.name, account: actor.account, email: '', phone: '', role: actor.role, roleId: actor.roleId, departmentId: 'dept-root', isActive: true, employmentStatus: 'active' },
  { id: 'user-peer', name: '同部门', account: 'peer', email: '', phone: '', role: '员工', roleId: 'role-authoritative', departmentId: 'dept-root', isActive: true, employmentStatus: 'active' },
  { id: 'user-child', name: '子部门', account: 'child', email: '', phone: '', role: '员工', roleId: 'role-authoritative', departmentId: 'dept-child', isActive: true, employmentStatus: 'active' },
  { id: 'user-left', name: '离职', account: 'left', email: '', phone: '', role: '员工', roleId: 'role-authoritative', departmentId: 'dept-root', isActive: true, employmentStatus: 'left' },
].map((user) => ({
  ...user, avatar: null, positionId: null, positionName: null, passwordHash: null, passwordSalt: null,
  passwordUpdatedAt: null, lastLoginAt: null, leftAt: null, leftBy: null, createdAt: NOW, updatedAt: NOW,
}));
const departments = [
  { id: 'dept-root', name: '根部门', code: 'ROOT', parentId: null, managerId: actor.id, memberCount: 2, sortOrder: 1, isActive: true, createdAt: NOW, updatedAt: NOW },
  { id: 'dept-child', name: '子部门', code: 'CHILD', parentId: 'dept-root', managerId: null, memberCount: 1, sortOrder: 2, isActive: true, createdAt: NOW, updatedAt: NOW },
];
function role(customers: unknown, permissions: Array<{ module: string; actions: string[] }> = [
  { module: PERMISSION_KEYS.CUSTOMER_EDIT_PROFILE, actions: ['write'] },
  { module: PERMISSION_KEYS.CUSTOMER_TRANSFER, actions: ['write'] },
  { module: PERMISSION_KEYS.CUSTOMER_PUBLIC_POOL_CLAIM, actions: ['write'] },
  { module: PERMISSION_KEYS.CUSTOMER_DELETE, actions: ['delete'] },
]) {
  return {
    id: 'role-authoritative', name: '服务端角色', code: 'authoritative', description: null, departmentId: 'dept-root',
    permissions, dataScopes: { customers }, memberCount: 3, isActive: true, createdAt: NOW, updatedAt: NOW,
  };
}
function directory(customers: unknown, permissions?: Array<{ module: string; actions: string[] }>) {
  return {
    user: { findMany: async () => users },
    role: { findMany: async () => [role(customers, permissions)] },
    department: { findMany: async () => departments },
  };
}

const maliciousStorage = new Map<string, string>([
  ['aaos_roles', JSON.stringify([{ id: 'role-authoritative', code: 'super_admin', isActive: true, permissions: [{ module: '全部', actions: ['admin'] }], dataScopes: { customers: 'all' } }])],
  ['aaos_users', JSON.stringify([{ ...actor, departmentId: 'dept-child' }])],
]);
Object.defineProperty(globalThis, 'localStorage', {
  value: { getItem: (key: string) => maliciousStorage.get(key) || null },
  configurable: true,
});

const departmentOnly = await loadCustomerAccessContext(directory('department_only') as any, actor);
assert.deepEqual(departmentOnly.manageableOwnerIds, new Set(['user-actor', 'user-peer', 'user-child']));
assert.equal(departmentOnly.manageableOwnerIds.has('user-child'), true, '旧 department_only 必须兼容为新的本部门树范围');
assert.equal(departmentOnly.manageableOwnerIds.has('user-left'), false, '离职员工不得进入可管理集');
assert.equal(departmentOnly.grantedPermissions.has(PERMISSION_KEYS.CUSTOMER_EDIT_PROFILE), true);
assert.equal(departmentOnly.grantedPermissions.has(PERMISSION_KEYS.CUSTOMER_DELETE), true, '直接 delete 授权应生效');
assert.equal(departmentOnly.canReadCustomerList, false, '数据范围本身不得授予客户列表详情披露权');

const listReadable = await loadCustomerAccessContext(directory('self', [
  { module: PERMISSION_KEYS.CUSTOMER_LIST, actions: ['read'] },
]) as any, actor);
assert.equal(listReadable.canReadCustomerList, true, '客户列表 read 必须来自服务端角色目录');

const batchManage = await loadCustomerAccessContext(directory('self', [
  { module: PERMISSION_KEYS.CUSTOMER_BATCH_MANAGE, actions: ['write'] },
  { module: PERMISSION_KEYS.CUSTOMER_BATCH_CANCEL, actions: ['write'] },
  { module: PERMISSION_KEYS.CUSTOMER_BATCH_AUDIT_READ, actions: ['read'] },
]) as any, actor);
assert.equal(batchManage.grantedPermissions.has(PERMISSION_KEYS.CUSTOMER_BATCH_MANAGE), true, '批量管理必须从服务端角色目录显式授予');
assert.equal(batchManage.grantedPermissions.has(PERMISSION_KEYS.CUSTOMER_BATCH_CANCEL), true, '批量取消必须从服务端角色目录显式授予');
assert.equal(batchManage.grantedPermissions.has(PERMISSION_KEYS.CUSTOMER_BATCH_AUDIT_READ), true, '批量审计读取必须从服务端角色目录显式授予');

const descendants = await loadCustomerAccessContext(directory('department_and_descendants') as any, actor);
assert.equal(descendants.manageableOwnerIds.has('user-child'), true);

const invalid = await loadCustomerAccessContext(directory('surprise_scope') as any, actor);
assert.equal(invalid.manageableOwnerIds.size, 0, '未知 scope 必须 fail closed，不得默认为 self');
assert.equal(invalid.canReadPublicPool, false);

const globalOnly = await loadCustomerAccessContext(directory('all', [{ module: '全部', actions: ['admin', 'delete'] }]) as any, actor);
assert.equal(globalOnly.grantedPermissions.has(PERMISSION_KEYS.CUSTOMER_TRANSFER), true, '非删除权限仍可由全局 admin 授予');
assert.equal(globalOnly.grantedPermissions.has(PERMISSION_KEYS.CUSTOMER_DELETE), false, '客户删除必须遵守 Task 2 explicit-only 规则');

console.log('customer access context tests passed');
