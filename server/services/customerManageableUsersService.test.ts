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

let customerScope: 'self' | 'department' = 'self';
let canTransfer = false;
const directory = {
  user: { findMany: async () => [
    userRow('user-actor', 'dept-sales'),
    userRow('user-peer', 'dept-sales'),
    userRow('user-child', 'dept-sales-one'),
    userRow('user-other-dept', 'dept-other'),
    { ...userRow('user-left', 'dept-sales'), employmentStatus: 'left' },
  ] },
  role: { findMany: async () => [{
    id: 'role-profile',
    name: '客户资料编辑',
    code: 'customer_profile',
    description: null,
    departmentId: null,
    permissions: [
      { module: PERMISSION_KEYS.CUSTOMER_EDIT_PROFILE, actions: ['write'] },
      ...(canTransfer ? [{ module: PERMISSION_KEYS.CUSTOMER_TRANSFER, actions: ['write'] }] : []),
    ],
    dataScopes: { customers: customerScope },
    memberCount: 2,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  }] },
  department: { findMany: async () => [
    {
      id: 'dept-sales', name: '销售部', code: 'SALES', description: null, parentId: null,
      managerId: null, memberCount: 2, sortOrder: 1, isActive: true, createdAt: now, updatedAt: now,
    },
    {
      id: 'dept-sales-one', name: '销售一部', code: 'SALES_ONE', description: null, parentId: 'dept-sales',
      managerId: null, memberCount: 1, sortOrder: 2, isActive: true, createdAt: now, updatedAt: now,
    },
  ] },
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

customerScope = 'department';
const createOnlyDepartmentResult = await createCustomerManageableUsersService(directory as any).list(actor);
assert.deepEqual(
  createOnlyDepartmentResult.data?.map((user) => user.id),
  ['user-actor'],
  '没有客户转移权限时，即使数据范围为本部门也只能把新客户分配给本人',
);

canTransfer = true;
const departmentResult = await createCustomerManageableUsersService(directory as any).list(actor);
assert.deepEqual(
  departmentResult.data?.map((user) => user.id),
  ['user-actor', 'user-peer', 'user-child'],
  '上级部门员工的本部门范围必须包含下级部门在职成员，且不受请求旧 departmentId 影响',
);

const contributorResult = await createCustomerManageableUsersService(directory as any).listContributors();
assert.deepEqual(
  contributorResult.data?.map((user) => user.id),
  ['user-actor', 'user-peer', 'user-child', 'user-other-dept'],
  '线索贡献人使用独立的在职人员最小目录，不应被客户负责人数据范围误缩小',
);
assert.deepEqual(Object.keys(contributorResult.data?.[0] || {}).sort(), ['id', 'name', 'positionName']);

console.log('customer manageable users service tests passed');
