import assert from 'node:assert/strict';
import type { Customer } from '../../src/types/customer';
import type { Role } from '../../src/types/role';
import { LIFECYCLE_STATUS_CODES } from '../../src/shared/utils/constants';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import { buildDataVisibilityScopeForUser } from '../../src/shared/utils/dataVisibility';
import {
  assertCustomerActionPermission,
  assertCustomerClaimPermission,
  assertCustomerFieldPermissions,
  canManageCustomer,
  canReadCustomer,
  type CustomerAccessContext,
} from './customerAccessPolicy';

const NOW = '2026-07-17T00:00:00.000Z';

function customer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'customer-1',
    name: '客户一',
    company: '公司一',
    phone: '13800000000',
    owner: '销售二',
    ownerId: 'user-owner',
    ownerIdentityStatus: 'resolved',
    customerLevel: 'L1',
    lifecycleStatusCode: LIFECYCLE_STATUS_CODES.FOLLOWING,
    totalSpent: 0,
    orderCount: 0,
    growthPath: [],
    growthRecords: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function access(overrides: Partial<CustomerAccessContext> = {}): CustomerAccessContext {
  return {
    actorId: 'user-actor',
    actorName: '销售一',
    readableUserIds: new Set(['user-actor']),
    legacyReadableNames: new Set(['销售一']),
    manageableOwnerIds: new Set(['user-actor']),
    canReadPublicPool: false,
    canReadCustomerList: false,
    grantedPermissions: new Set(),
    ...overrides,
  };
}

const contributed = customer({ leadContributorId: 'user-actor' });
assert.equal(canReadCustomer(access(), contributed), true, '贡献人可读其他人客户');
assert.equal(canManageCustomer(access(), contributed), false, '贡献人不得写其他人客户');

const publicPool = customer({
  owner: '公海',
  ownerId: undefined,
  ownerIdentityStatus: 'public_pool',
  lifecycleStatusCode: LIFECYCLE_STATUS_CODES.PUBLIC_POOL,
});
assert.equal(canReadCustomer(access({ canReadPublicPool: true }), publicPool), true, '公海可见性只授予读取');
assert.equal(canManageCustomer(access({ canReadPublicPool: true }), publicPool), false, '公海可见不得推导写权');

const unresolved = customer({ ownerId: undefined, ownerIdentityStatus: 'unresolved' });
const legacyReadContext = access({
  readableUserIds: new Set(['user-owner']),
  legacyReadableNames: new Set(['销售二']),
  manageableOwnerIds: new Set(['user-owner']),
});
assert.equal(canReadCustomer(legacyReadContext, unresolved), true, '未解析负责人仅保留旧姓名规则的只读兼容');
assert.equal(canManageCustomer(legacyReadContext, unresolved), false, '未解析负责人的写入必须 fail closed');

const profileOnly = access({ grantedPermissions: new Set([PERMISSION_KEYS.CUSTOMER_EDIT_PROFILE]) });
assert.doesNotThrow(() => assertCustomerFieldPermissions(profileOnly, { name: '新名称' }));
assert.throws(
  () => assertCustomerFieldPermissions(profileOnly, { name: '新名称', lifecycleStatusCode: 'contacted' }),
  /设置客户进展/,
  '混合字段缺任一权限必须整请求拒绝',
);
assert.throws(
  () => assertCustomerActionPermission(access(), 'transfer'),
  /转让／分配客户/,
);

const claimOnly = access({ grantedPermissions: new Set([PERMISSION_KEYS.CUSTOMER_PUBLIC_POOL_CLAIM]) });
assert.equal(canManageCustomer(claimOnly, publicPool), false);
assert.doesNotThrow(() => assertCustomerClaimPermission(claimOnly), '公海领取应使用专用权限，不依赖可管理集');

const departments = [
  { id: 'dept-root', name: '根部门', code: 'ROOT', memberCount: 2, isActive: true, createdAt: NOW, updatedAt: NOW },
  { id: 'dept-child', name: '子部门', code: 'CHILD', parentId: 'dept-root', memberCount: 1, isActive: true, createdAt: NOW, updatedAt: NOW },
];
const directoryUsers = [
  { id: 'user-actor', name: '主管', role: '自定义角色', roleId: 'role-scope', departmentId: 'dept-root', isActive: true },
  { id: 'user-peer', name: '同部门', role: '自定义角色', roleId: 'role-scope', departmentId: 'dept-root', isActive: true },
  { id: 'user-child', name: '子部门', role: '自定义角色', roleId: 'role-scope', departmentId: 'dept-child', isActive: true },
];
function scopedRole(customers: Role['dataScopes'] extends infer S ? S extends object ? S['customers' & keyof S] : never : never): Role {
  return {
    id: 'role-scope', name: '自定义角色', code: 'custom_scope', permissions: [],
    dataScopes: { customers }, memberCount: 3, isActive: true, createdAt: NOW, updatedAt: NOW,
  };
}

const parentDepartment = buildDataVisibilityScopeForUser(
  directoryUsers[0] as any,
  directoryUsers as any,
  [scopedRole('department')],
  departments as any,
  'customers',
);
assert.deepEqual(
  new Set(parentDepartment.visibleUserIds),
  new Set(['user-actor', 'user-peer', 'user-child']),
  '挂在上级部门的员工选择本部门时必须包含所有下级部门',
);

const leafDepartment = buildDataVisibilityScopeForUser(
  directoryUsers[2] as any,
  directoryUsers as any,
  [scopedRole('department')],
  departments as any,
  'customers',
);
assert.deepEqual(
  leafDepartment.visibleUserIds,
  ['user-child'],
  '挂在叶子部门的员工选择本部门时只能看到该叶子部门',
);

console.log('customer access policy tests passed');
