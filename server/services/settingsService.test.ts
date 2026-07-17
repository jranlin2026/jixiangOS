import assert from 'node:assert/strict';
import { createSettingsService } from './settingsService';

const now = new Date('2026-06-24T00:00:00.000Z');

const users: any[] = [
  {
    id: 'user-sales',
    name: 'Sales User',
    account: 'test_sales',
    email: 'test_sales@company.com',
    phone: '13000000000',
    role: 'Sales',
    avatar: null,
    departmentId: 'dept-sales',
    positionId: null,
    positionName: 'Sales',
    roleId: 'role-sales',
    passwordHash: null,
    passwordSalt: null,
    passwordUpdatedAt: null,
    lastLoginAt: null,
    isActive: true,
    employmentStatus: 'active',
    leftAt: null,
    leftBy: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'user-receiver',
    name: 'Receiver User',
    account: 'receiver',
    email: 'receiver@company.com',
    phone: '13000000001',
    role: 'Sales',
    avatar: null,
    departmentId: 'dept-sales',
    positionId: null,
    positionName: 'Sales',
    roleId: 'role-sales',
    passwordHash: null,
    passwordSalt: null,
    passwordUpdatedAt: null,
    lastLoginAt: null,
    isActive: true,
    employmentStatus: 'active',
    leftAt: null,
    leftBy: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'user-admin',
    name: 'Admin',
    account: 'admin',
    email: 'admin@company.com',
    phone: '',
    role: 'Super Admin',
    avatar: null,
    departmentId: 'dept-general',
    positionId: null,
    positionName: 'General Manager',
    roleId: 'role-super-admin',
    passwordHash: null,
    passwordSalt: null,
    passwordUpdatedAt: null,
    lastLoginAt: null,
    isActive: true,
    employmentStatus: 'active',
    leftAt: null,
    leftBy: null,
    createdAt: now,
    updatedAt: now,
  },
];

const departments: any[] = [
  {
    id: 'dept-general',
    name: 'General',
    code: 'GENERAL',
    description: null,
    parentId: null,
    managerId: null,
    memberCount: 0,
    sortOrder: 1,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'dept-sales',
    name: 'Sales',
    code: 'SALES',
    description: null,
    parentId: null,
    managerId: null,
    memberCount: 1,
    sortOrder: 2,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
];

const roles: any[] = [
  {
    id: 'role-super-admin',
    name: 'Super Admin',
    code: 'super_admin',
    description: null,
    departmentId: 'dept-general',
    permissions: [{ module: 'all', actions: ['admin'] }],
    dataScopes: {},
    memberCount: 1,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'role-sales',
    name: 'Sales',
    code: 'sales',
    description: null,
    departmentId: 'dept-sales',
    permissions: [{ module: 'leads', actions: ['read'] }],
    dataScopes: {},
    memberCount: 1,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
];

let updatePayload: any = null;
let customerRecord: any = {
  id: 'aaos_customers:cust-sales',
  domain: 'aaos_customers',
  recordId: 'cust-sales',
  owner: 'Other User',
  data: {
    id: 'cust-sales',
    name: 'Leave Handoff Customer',
    owner: 'Other User',
    activityRecords: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  },
};
let leadRecords: any[] = [];

function createModel<T extends { id: string }>(items: T[]) {
  return {
    findMany: async () => items,
    findUnique: async ({ where }: any) => items.find((item: any) => (
      (where.id !== undefined && item.id === where.id)
      || (where.code !== undefined && item.code === where.code)
      || (where.account !== undefined && item.account === where.account)
    )) || null,
    create: async ({ data }: any) => {
      const row = { ...data, createdAt: data.createdAt || now, updatedAt: data.updatedAt || now };
      items.push(row);
      return row;
    },
    update: async ({ where, data }: any) => {
      updatePayload = { where, data };
      const idx = items.findIndex((item: any) => (
        (where.id !== undefined && item.id === where.id)
        || (where.code !== undefined && item.code === where.code)
        || (where.account !== undefined && item.account === where.account)
      ));
      items[idx] = { ...items[idx], ...data };
      return items[idx];
    },
    deleteMany: async ({ where }: any) => {
      const before = items.length;
      for (let index = items.length - 1; index >= 0; index -= 1) {
        if (items[index].id === where.id) items.splice(index, 1);
      }
      return { count: before - items.length };
    },
  };
}

const prisma = {
  user: createModel(users),
  role: createModel(roles),
  department: createModel(departments),
  position: { findMany: async () => [] },
  authSession: { deleteMany: async () => ({ count: 1 }) },
  businessRecord: {
    findMany: async ({ where }: any) => (where.domain === 'aaos_customers' ? [customerRecord] : []),
    update: async ({ data }: any) => {
      customerRecord = { ...customerRecord, ...data };
      return customerRecord;
    },
  },
  leadRecord: {
    findMany: async () => leadRecords,
    update: async ({ where, data }: any) => {
      const index = leadRecords.findIndex((row) => row.id === where.id);
      if (index !== -1) leadRecords[index] = { ...leadRecords[index], ...data };
      return index !== -1 ? leadRecords[index] : null;
    },
  },
} as any;

const service = createSettingsService(prisma);

const createdUser = await service.createUser({
  name: 'Created User',
  account: 'created_user',
  email: 'created_user@company.com',
  phone: '13000000002',
  role: 'Sales',
  roleId: 'role-sales',
  departmentId: 'dept-sales',
  positionName: 'Sales',
  isActive: true,
  password: 'Secret123',
} as any);
assert.equal(createdUser.code, 0);
const createdUserData = createdUser.data as any;
assert.equal(createdUserData.account, 'created_user');
const persistedCreatedUser = users.find((item) => item.id === createdUserData.id)!;
assert.ok(persistedCreatedUser.passwordHash);
assert.ok(persistedCreatedUser.passwordSalt);
assert.equal('passwordHash' in createdUserData, false);
assert.equal('passwordSalt' in createdUserData, false);
assert.equal('passwordUpdatedAt' in createdUserData, false);

const updatedUser = await service.updateUser(createdUserData.id, { name: 'Updated User', account: 'updated_user' });
const updatedUserData = updatedUser.data as any;
assert.equal(updatedUser.code, 0);
assert.equal(updatedUserData.name, 'Updated User');
assert.equal(updatedUserData.account, 'updated_user');

const previousHash = persistedCreatedUser.passwordHash;
const resetUser = await service.resetUserPassword(createdUserData.id, 'NewPass123');
assert.equal(resetUser.code, 0);
const persistedAfterReset = users.find((item) => item.id === createdUserData.id)!;
assert.notEqual(persistedAfterReset.passwordHash, previousHash);
assert.equal('passwordHash' in (resetUser.data as any), false);
assert.equal('passwordSalt' in (resetUser.data as any), false);
assert.equal('passwordUpdatedAt' in (resetUser.data as any), false);

const listedUsers = await service.listUsers();
const assignableUsers = await service.listAssignableUsers();
for (const row of [...(listedUsers.data || []), ...(assignableUsers.data || [])] as any[]) {
  assert.equal('passwordHash' in row, false);
  assert.equal('passwordSalt' in row, false);
  assert.equal('passwordUpdatedAt' in row, false);
}

const leaveResult = await service.leaveUser('user-sales');
const leftUser = leaveResult.data as any;
assert.equal(leaveResult.code, 0);
assert.equal(leftUser.id, 'user-sales');
assert.equal(leftUser.employmentStatus, 'left');
assert.equal(leftUser.isActive, false);
assert.ok(leftUser.leftAt);
assert.equal(updatePayload.where.id, 'user-sales');
assert.equal(updatePayload.data.employmentStatus, 'left');
assert.equal(updatePayload.data.isActive, false);
assert.equal((customerRecord.data as any).owner, 'Other User');

users[0] = {
  ...users[0],
  isActive: true,
  employmentStatus: 'active',
  leftAt: null,
  leftBy: null,
};
customerRecord = {
  ...customerRecord,
  data: {
    ...(customerRecord.data as any),
    owner: 'Sales User',
    activityRecords: [],
  },
};

const leaveWithHandoff = await service.leaveUser('user-sales', {
  customerAction: 'transfer',
  targetUserId: 'user-receiver',
  reason: 'leave handoff',
});
assert.notEqual(leaveWithHandoff.code, 0);
assert.match(leaveWithHandoff.message || '', /客户列表/);
assert.equal((customerRecord.data as any).owner, 'Sales User');
assert.equal(users.find((user) => user.id === 'user-sales')?.employmentStatus, 'active');

customerRecord = {
  ...customerRecord,
  owner: 'Other User',
  data: {
    ...(customerRecord.data as any),
    owner: 'Other User',
    ownerId: 'user-sales',
    ownerIdentityStatus: 'resolved',
  },
};
const stableOwnerBlocked = await service.leaveUser('user-sales', {
  customerAction: 'public_pool',
  reason: '不得绕过客户命令',
});
assert.notEqual(stableOwnerBlocked.code, 0, '稳定 ownerId 必须阻止 settings 直接移交客户');
assert.equal((customerRecord.data as any).ownerId, 'user-sales');
assert.equal(users.find((user) => user.id === 'user-sales')?.employmentStatus, 'active');

customerRecord = {
  ...customerRecord,
  owner: 'Receiver User',
  data: {
    ...(customerRecord.data as any),
    owner: undefined,
    ownerId: undefined,
    ownerIdentityStatus: 'unresolved',
    activityRecords: [],
  },
};
const blockedLeaveWithColumnOwner = await service.leaveUser('user-receiver');
assert.notEqual(blockedLeaveWithColumnOwner.code, 0);
assert.match(blockedLeaveWithColumnOwner.message || '', /1/);
assert.equal(users.find((user) => user.id === 'user-receiver')?.employmentStatus, 'active');

const restoredUser = await service.restoreUser('user-sales');
const restoredUserData = restoredUser.data as any;
assert.equal(restoredUser.code, 0);
assert.equal(restoredUserData.employmentStatus, 'active');
assert.equal(restoredUserData.isActive, true);

customerRecord = {
  ...customerRecord,
  owner: 'Other User',
  data: {
    ...(customerRecord.data as any),
    owner: 'Other User',
    activityRecords: [],
  },
};
leadRecords = [{
  id: 'lead-sales-only',
  owner: 'Sales User',
  assignedTo: 'Sales User',
  lifecycleStatusCode: 'pending_followup',
  data: {
    id: 'lead-sales-only',
    owner: 'Sales User',
    assignedTo: 'Sales User',
    changeHistory: [],
  },
}];
const leadOnlyCount = await service.countLeaveOwnedCustomers(['user-sales']);
assert.equal(leadOnlyCount.code, 0);
assert.equal(leadOnlyCount.data, 1);
const leadOnlyLeaveBlocked = await service.leaveUser('user-sales');
assert.notEqual(leadOnlyLeaveBlocked.code, 0);
assert.match(leadOnlyLeaveBlocked.message || '', /线索/);
const leadOnlyLeave = await service.leaveUser('user-sales', {
  customerAction: 'transfer',
  targetUserId: 'user-receiver',
  reason: 'lead handoff',
});
assert.equal(leadOnlyLeave.code, 0);
assert.equal(leadRecords[0].owner, 'Receiver User');
assert.equal(leadRecords[0].assignedTo, 'Receiver User');
assert.equal(leadRecords[0].data.owner, 'Receiver User');
assert.match(leadRecords[0].data.changeHistory[0].summary, /lead handoff/);

await service.restoreUser('user-sales');
leadRecords = [];

await service.leaveUser(createdUserData.id);
const deletedUser = await service.deleteUser(createdUserData.id);
assert.equal(deletedUser.code, 0);
assert.equal(users.some((user) => user.id === createdUserData.id), false);

const createdDepartment = await service.createDepartment({
  name: 'New Department',
  code: 'NEW_DEPT',
  description: 'Created from backend',
  parentId: 'dept-general',
  memberCount: 0,
  sortOrder: 3,
  isActive: true,
} as any);
assert.equal(createdDepartment.code, 0);
const createdDepartmentData = createdDepartment.data as any;
assert.equal(createdDepartmentData.parentId, 'dept-general');

const updatedDepartment = await service.updateDepartment(createdDepartmentData.id, { name: 'Updated Department', sortOrder: 4 });
const updatedDepartmentData = updatedDepartment.data as any;
assert.equal(updatedDepartment.code, 0);
assert.equal(updatedDepartmentData.sortOrder, 4);

const deletedDepartment = await service.deleteDepartment(createdDepartmentData.id);
assert.equal(deletedDepartment.code, 0);
assert.equal(departments.some((department) => department.id === createdDepartmentData.id), false);

const createdRole = await service.createRole({
  name: 'Backend Role',
  code: 'backend_role',
  departmentId: 'dept-sales',
  permissions: [{ module: 'leads', actions: ['read'] }],
  dataScopes: { leads: 'self' },
  memberCount: 0,
  isActive: true,
} as any);
assert.equal(createdRole.code, 0);
const createdRoleData = createdRole.data as any;
assert.equal(createdRoleData.code, 'backend_role');

const updatedRole = await service.updateRole(createdRoleData.id, { name: 'Updated Backend Role', isActive: false });
const updatedRoleData = updatedRole.data as any;
assert.equal(updatedRole.code, 0);
assert.equal(updatedRoleData.name, 'Updated Backend Role');
assert.equal(updatedRoleData.isActive, false);

const deletedRole = await service.deleteRole(createdRoleData.id);
assert.equal(deletedRole.code, 0);
assert.equal(roles.some((role) => role.id === createdRoleData.id), false);
