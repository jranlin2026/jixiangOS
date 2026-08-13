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
  {
    id: 'user-inactive-manager',
    name: 'Inactive Manager',
    account: 'inactive_manager',
    email: 'inactive_manager@company.com',
    phone: '',
    role: 'Sales',
    avatar: null,
    departmentId: 'dept-sales',
    positionId: null,
    positionName: 'Sales Manager',
    roleId: 'role-sales',
    passwordHash: null,
    passwordSalt: null,
    passwordUpdatedAt: null,
    lastLoginAt: null,
    isActive: false,
    employmentStatus: 'active',
    leftAt: null,
    leftBy: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'user-left-manager',
    name: 'Left Manager',
    account: 'left_manager',
    email: 'left_manager@company.com',
    phone: '',
    role: 'Sales',
    avatar: null,
    departmentId: 'dept-sales',
    positionId: null,
    positionName: 'Sales Manager',
    roleId: 'role-sales',
    passwordHash: null,
    passwordSalt: null,
    passwordUpdatedAt: null,
    lastLoginAt: null,
    isActive: true,
    employmentStatus: 'left',
    leftAt: now,
    leftBy: 'user-admin',
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
  {
    id: 'dept-sales-one',
    name: 'Sales Team One',
    code: 'SALES_ONE',
    description: null,
    parentId: 'dept-sales',
    managerId: null,
    memberCount: 0,
    sortOrder: 3,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
];

const positions: any[] = [
  {
    id: 'pos-sales-consultant',
    name: 'Sales Consultant',
    code: 'sales_consultant',
    departmentId: 'dept-sales',
    departmentScope: 'DEPARTMENT_TREE',
    description: null,
    sortOrder: 1,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
];

const knowledgeVisibilities: any[] = [];
const positionHistories: any[] = [];

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
let normalizedReferenceUserId: string | null = null;
let coCreationBriefReferenceUserId: string | null = null;
let transactionCalls = 0;

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
      const definedData = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
      items[idx] = { ...items[idx], ...definedData };
      return items[idx];
    },
    updateMany: async ({ where, data }: any) => {
      const idx = items.findIndex((item: any) => (
        item.id === where.id
        && (where.updatedAt === undefined || item.updatedAt.getTime() === where.updatedAt.getTime())
      ));
      if (idx < 0) return { count: 0 };
      const definedData = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
      items[idx] = { ...items[idx], ...definedData };
      return { count: 1 };
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
  $transaction: async (work: (client: any) => Promise<any>) => {
    transactionCalls += 1;
    return work(prisma);
  },
  user: createModel(users),
  role: createModel(roles),
  department: createModel(departments),
  position: createModel(positions),
  knowledgeVisibility: createModel(knowledgeVisibilities),
  employeePositionHistory: createModel(positionHistories),
  customerTodo: {
    findFirst: async () => normalizedReferenceUserId ? { id: 'todo-user-reference' } : null,
  },
  coCreationBrief: {
    findFirst: async () => coCreationBriefReferenceUserId ? { id: 'brief-user-reference' } : null,
  },
  authSession: { deleteMany: async () => ({ count: 1 }) },
  businessRecord: {
    findMany: async (args?: any) => (!args?.where?.domain || args.where.domain === 'aaos_customers' ? [customerRecord] : []),
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

const mismatchedPositionUser = await service.createUser({
  name: 'Mismatched Position User',
  account: 'mismatched_position_user',
  email: 'mismatched_position_user@company.com',
  phone: '13000000009',
  role: 'Sales',
  roleId: 'role-sales',
  departmentId: 'dept-general',
  positionId: 'pos-sales-consultant',
  isActive: true,
  password: 'Secret123',
} as any);
assert.notEqual(mismatchedPositionUser.code, 0);
assert.match(mismatchedPositionUser.message || '', /不属于所选部门/);

const inheritedPositionUser = await service.createUser({
  name: 'Inherited Position User',
  account: 'inherited_position_user',
  email: 'inherited_position_user@company.com',
  phone: '13000000008',
  role: 'Sales',
  roleId: 'role-sales',
  departmentId: 'dept-sales-one',
  positionId: 'pos-sales-consultant',
  isActive: true,
  password: 'Secret123',
} as any);
assert.equal(inheritedPositionUser.code, 0);
assert.equal((inheritedPositionUser.data as any).departmentId, 'dept-sales-one');
assert.equal((inheritedPositionUser.data as any).positionId, 'pos-sales-consultant');

const createdUser = await service.createUser({
  name: 'Created User',
  account: 'created_user',
  email: 'created_user@company.com',
  phone: '13000000002',
  role: 'Sales',
  roleId: 'role-sales',
  departmentId: 'dept-sales',
  positionId: 'pos-sales-consultant',
  isActive: true,
  password: 'Secret123',
} as any);
assert.equal(createdUser.code, 0);
const createdUserData = createdUser.data as any;
assert.equal(createdUserData.account, 'created_user');
const persistedCreatedUser = users.find((item) => item.id === createdUserData.id)!;
assert.ok(persistedCreatedUser.passwordHash);
assert.ok(persistedCreatedUser.passwordSalt);
assert.equal(persistedCreatedUser.positionId, 'pos-sales-consultant');
assert.equal(persistedCreatedUser.positionName, 'Sales Consultant');
assert.equal('passwordHash' in createdUserData, false);
assert.equal('passwordSalt' in createdUserData, false);
assert.equal('passwordUpdatedAt' in createdUserData, false);

const freeTextPositionUser = await service.createUser({
  name: 'Free Text Position User',
  account: 'free_text_position_user',
  email: 'free_text_position_user@company.com',
  phone: '13000000007',
  role: 'Sales',
  roleId: 'role-sales',
  departmentId: 'dept-sales',
  positionName: '自由文本职务',
  isActive: true,
  password: 'Secret123',
} as any);
assert.equal(freeTextPositionUser.code, 0);
assert.equal((freeTextPositionUser.data as any).positionId, undefined);
assert.equal((freeTextPositionUser.data as any).positionName, undefined);

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

const referencedUserDelete = await service.deleteUser('user-sales');
assert.notEqual(referencedUserDelete.code, 0);
assert.match(referencedUserDelete.message || '', /历史业务数据/);

await service.restoreUser('user-sales');
leadRecords = [];

await service.leaveUser(createdUserData.id);
normalizedReferenceUserId = createdUserData.id;
const normalizedReferenceDelete = await service.deleteUser(createdUserData.id);
assert.notEqual(normalizedReferenceDelete.code, 0);
assert.match(normalizedReferenceDelete.message || '', /历史业务数据/);
normalizedReferenceUserId = null;
coCreationBriefReferenceUserId = createdUserData.id;
const coCreationBriefReferenceDelete = await service.deleteUser(createdUserData.id);
assert.notEqual(coCreationBriefReferenceDelete.code, 0);
assert.match(coCreationBriefReferenceDelete.message || '', /历史业务数据/);
coCreationBriefReferenceUserId = null;
customerRecord = {
  ...customerRecord,
  data: { ...customerRecord.data, name: createdUserData.name },
};
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

const missingParentDepartment = await service.createDepartment({
  name: 'Missing Parent Department',
  code: 'MISSING_PARENT',
  parentId: 'dept-missing',
  isActive: true,
} as any);
assert.notEqual(missingParentDepartment.code, 0);
assert.match(missingParentDepartment.message || '', /上级部门不存在/);

departments.push({
  id: 'dept-inactive-parent',
  name: 'Inactive Parent',
  code: 'INACTIVE_PARENT',
  description: null,
  parentId: null,
  managerId: null,
  memberCount: 0,
  sortOrder: 10,
  isActive: false,
  createdAt: now,
  updatedAt: now,
});
const inactiveParentDepartment = await service.createDepartment({
  name: 'Inactive Parent Child',
  code: 'INACTIVE_PARENT_CHILD',
  parentId: 'dept-inactive-parent',
  isActive: true,
} as any);
assert.notEqual(inactiveParentDepartment.code, 0);
assert.match(inactiveParentDepartment.message || '', /上级部门已停用/);

const selfParentDepartment = await service.updateDepartment('dept-sales', { parentId: 'dept-sales' });
assert.notEqual(selfParentDepartment.code, 0);
assert.match(selfParentDepartment.message || '', /不能选择自己/);

const cycleParentDepartment = await service.updateDepartment('dept-sales', { parentId: 'dept-sales-one' });
assert.notEqual(cycleParentDepartment.code, 0);
assert.match(cycleParentDepartment.message || '', /下级部门/);

const createdDepartmentManager = await service.createDepartment({
  name: 'Managed Department',
  code: 'MANAGED_DEPARTMENT',
  parentId: 'dept-sales',
  managerId: 'user-sales',
  isActive: true,
} as any);
assert.equal(createdDepartmentManager.code, 0);
assert.equal((createdDepartmentManager.data as any).managerId, 'user-sales');

const missingDepartmentManager = await service.updateDepartment('dept-sales', { managerId: 'user-missing-manager' });
assert.notEqual(missingDepartmentManager.code, 0);
assert.match(missingDepartmentManager.message || '', /负责人不存在/);

const inactiveDepartmentManager = await service.updateDepartment('dept-sales', { managerId: 'user-inactive-manager' });
assert.notEqual(inactiveDepartmentManager.code, 0);
assert.match(inactiveDepartmentManager.message || '', /账号已停用/);

const leftDepartmentManager = await service.updateDepartment('dept-sales', { managerId: 'user-left-manager' });
assert.notEqual(leftDepartmentManager.code, 0);
assert.match(leftDepartmentManager.message || '', /已离职/);

const crossDepartmentManager = await service.updateDepartment('dept-sales', { managerId: 'user-admin' });
assert.notEqual(crossDepartmentManager.code, 0);
assert.match(crossDepartmentManager.message || '', /不属于本部门或上级部门/);

const updatedDepartmentManager = await service.updateDepartment('dept-sales', { managerId: 'user-sales' });
assert.equal(updatedDepartmentManager.code, 0);
assert.equal((updatedDepartmentManager.data as any).managerId, 'user-sales');

const inheritedDepartmentManager = await service.updateDepartment('dept-sales-one', { managerId: 'user-sales' });
assert.equal(inheritedDepartmentManager.code, 0);
assert.equal((inheritedDepartmentManager.data as any).managerId, 'user-sales');

await service.deleteDepartment((createdDepartmentManager.data as any).id);

const updatedDepartment = await service.updateDepartment(createdDepartmentData.id, { name: 'Updated Department', sortOrder: 4 });
const updatedDepartmentData = updatedDepartment.data as any;
assert.equal(updatedDepartment.code, 0);
assert.equal(updatedDepartmentData.sortOrder, 4);

const deletedDepartment = await service.deleteDepartment(createdDepartmentData.id);
assert.equal(deletedDepartment.code, 0);
assert.equal(departments.some((department) => department.id === createdDepartmentData.id), false);

const createdPosition = await service.createPosition({
  name: 'Sales Manager',
  code: 'sales_manager',
  departmentId: 'dept-sales',
  description: 'Owns the sales team standard',
  sortOrder: 2,
  isActive: true,
});
assert.equal(createdPosition.code, 0);
const createdPositionData = createdPosition.data as any;
assert.equal(createdPositionData.name, 'Sales Manager');
assert.equal(createdPositionData.departmentId, 'dept-sales');
assert.ok(positions.some((position) => position.id === createdPositionData.id));
const clearedPositionDepartment = await service.updatePosition(createdPositionData.id, { departmentId: '' });
assert.equal(clearedPositionDepartment.code, 0);
assert.equal((clearedPositionDepartment.data as any).departmentId, undefined);

const missingPositionChangeReason = await service.updateUser(
  'user-sales',
  { positionId: 'pos-sales-consultant' },
  { id: 'user-admin', name: 'Admin' },
);
assert.notEqual(missingPositionChangeReason.code, 0);
assert.match(missingPositionChangeReason.message || '', /原因/);
assert.equal(positionHistories.length, 0);

const boundSalesUser = await service.updateUser('user-sales', { positionId: 'pos-sales-consultant', reason: '调整销售岗位' }, { id: 'user-admin', name: 'Admin' });
assert.equal(boundSalesUser.code, 0);
assert.equal((boundSalesUser.data as any).positionName, 'Sales Consultant');
assert.equal(positionHistories.length, 1);
assert.equal(positionHistories[0].oldPositionId, null);
assert.equal(positionHistories[0].newPositionId, 'pos-sales-consultant');
assert.equal(positionHistories[0].changedById, 'user-admin');

const movedBoundPosition = await service.updatePosition('pos-sales-consultant', { departmentId: 'dept-general' });
assert.notEqual(movedBoundPosition.code, 0);
assert.match(movedBoundPosition.message || '', /已有员工使用/);
const clearedBoundPositionDepartment = await service.updatePosition('pos-sales-consultant', { departmentId: '' });
assert.equal(clearedBoundPositionDepartment.code, 0);
assert.equal((clearedBoundPositionDepartment.data as any).departmentId, undefined);
const restoredBoundPositionDepartment = await service.updatePosition('pos-sales-consultant', { departmentId: 'dept-sales' });
assert.equal(restoredBoundPositionDepartment.code, 0, restoredBoundPositionDepartment.message);

const updatedPosition = await service.updatePosition('pos-sales-consultant', { name: 'Senior Sales Consultant' });
assert.equal(updatedPosition.code, 0);
assert.ok(transactionCalls > 0);
assert.equal((updatedPosition.data as any).name, 'Senior Sales Consultant');
assert.equal(users.find((user) => user.id === 'user-sales')?.positionName, 'Senior Sales Consultant');

await service.updatePosition('pos-sales-consultant', { isActive: false });
const inactivePositionProfileUpdate = await service.updateUser('user-sales', {
  name: 'Sales User Updated',
  positionId: 'pos-sales-consultant',
});
assert.equal(inactivePositionProfileUpdate.code, 0);
await service.updatePosition('pos-sales-consultant', { isActive: true });

const boundPositionDelete = await service.deletePosition('pos-sales-consultant');
assert.notEqual(boundPositionDelete.code, 0);
assert.match(boundPositionDelete.message || '', /员工使用/);

knowledgeVisibilities.push({
  id: 'visibility-created-position',
  documentId: 'knowledge-sales',
  subjectType: 'POSITION',
  subjectId: createdPositionData.id,
  createdAt: now,
});
const visiblePositionDelete = await service.deletePosition(createdPositionData.id);
assert.notEqual(visiblePositionDelete.code, 0);
assert.match(visiblePositionDelete.message || '', /知识可见范围/);
knowledgeVisibilities.splice(0, knowledgeVisibilities.length);

const unusedPositionDelete = await service.deletePosition(createdPositionData.id);
assert.equal(unusedPositionDelete.code, 0);
assert.equal(positions.some((position) => position.id === createdPositionData.id), false);

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
assert.equal(roles.find((role) => role.id === createdRoleData.id)?.normalizedName, 'backend role');

const duplicateRole = await service.createRole({
  name: '  Backend Role  ',
  code: 'duplicate_backend_role',
  permissions: [],
  isActive: true,
} as any);
assert.notEqual(duplicateRole.code, 0);
assert.equal(duplicateRole.message, '角色名称已存在');
assert.equal(roles.filter((role) => role.name === 'Backend Role').length, 1);

const originalRoleCreate = prisma.role.create;
prisma.role.create = async () => {
  const error = new Error('unique constraint') as Error & { code: string; meta: { target: string } };
  error.code = 'P2002';
  error.meta = { target: 'roles_normalized_name_key' };
  throw error;
};
const concurrentDuplicateRole = await service.createRole({
  name: 'Concurrent Backend Role',
  code: 'concurrent_backend_role',
  permissions: [],
  isActive: true,
} as any);
prisma.role.create = originalRoleCreate;
assert.notEqual(concurrentDuplicateRole.code, 0);
assert.equal(concurrentDuplicateRole.message, '角色名称已存在');

const duplicateRoleUpdate = await service.updateRole(createdRoleData.id, { name: ' sales ' });
assert.notEqual(duplicateRoleUpdate.code, 0);
assert.equal(duplicateRoleUpdate.message, '角色名称已存在');
assert.equal(roles.find((role) => role.id === createdRoleData.id)?.name, 'Backend Role');

const updatedRole = await service.updateRole(createdRoleData.id, { name: 'Updated Backend Role', isActive: false });
const updatedRoleData = updatedRole.data as any;
assert.equal(updatedRole.code, 0);
assert.equal(updatedRoleData.name, 'Updated Backend Role');
assert.equal(updatedRoleData.isActive, false);
assert.equal(roles.find((role) => role.id === createdRoleData.id)?.normalizedName, 'updated backend role');

const deletedRole = await service.deleteRole(createdRoleData.id);
assert.equal(deletedRole.code, 0);
assert.equal(roles.some((role) => role.id === createdRoleData.id), false);
