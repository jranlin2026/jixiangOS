import assert from 'node:assert/strict';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import type { AuthenticatedUser } from '../../src/types/auth';
import { createCustomerManageableUsersService } from './customerManageableUsersService';

const now = new Date('2026-07-17T00:00:00.000Z');
const userRow = (id: string, departmentId: string) => ({
  id,
  name: `姓名-${id}`,
  account: `account-${id}`,
  email: `${id}@example.com`,
  phone: '13800000000',
  role: '不可信的显示角色',
  avatar: null,
  departmentId,
  positionId: null,
  positionName: '销售',
  roleId: 'role-profile',
  passwordHash: 'secret-hash',
  passwordSalt: 'secret-salt',
  passwordUpdatedAt: null,
  lastLoginAt: null,
  isActive: true,
  employmentStatus: 'active',
  leftAt: null,
  leftBy: null,
  createdAt: now,
  updatedAt: now,
});

let customerScope: 'self' | 'department_only' = 'self';
const directory = {
  user: { findMany: async () => [
    userRow('user-actor', 'dept-sales'),
    userRow('user-peer', 'dept-sales'),
    userRow('user-other-dept', 'dept-other'),
    { ...userRow('user-left', 'dept-sales'), employmentStatus: 'left' },
  ] },
  role: { findMany: async () => [{
    id: 'role-profile',
    name: '客户资料编辑',
    code: 'customer_profile',
    description: null,
    departmentId: null,
    permissions: [{ module: PERMISSION_KEYS.CUSTOMER_EDIT_PROFILE, actions: ['write'] }],
    dataScopes: { customers: customerScope },
    memberCount: 2,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  }] },
  department: { findMany: async () => [{
    id: 'dept-sales', name: '销售部', code: 'SALES', description: null, parentId: null,
    managerId: null, memberCount: 2, sortOrder: 1, isActive: true, createdAt: now, updatedAt: now,
  }] },
};

const actor: AuthenticatedUser = {
  id: 'user-actor',
  name: '请求快照旧姓名',
  account: 'user-actor',
  email: '',
  phone: '',
  role: '请求快照旧角色' as any,
  roleId: 'role-profile',
  departmentId: 'dept-stale',
  permissions: [],
  isActive: true,
};

const result = await createCustomerManageableUsersService(directory as any).list(actor);
assert.equal(result.code, 0);
assert.deepEqual(result.data, [{ id: 'user-actor', name: '姓名-user-actor', positionName: '销售' }]);
assert.deepEqual(
  Object.keys(result.data?.[0] || {}).sort(),
  ['id', 'name', 'positionName'],
  '客户可管理目录不得泄露 email、phone、role 或鉴权字段',
);

customerScope = 'department_only';
const departmentResult = await createCustomerManageableUsersService(directory as any).list(actor);
assert.deepEqual(
  departmentResult.data?.map((user) => user.id),
  ['user-actor', 'user-peer'],
  '实时 department_only 只返回同部门在职成员，不受请求旧 departmentId 影响',
);

console.log('customer manageable users service tests passed');
