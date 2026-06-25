import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { authApi, departmentApi, settingsApi } from './index';
import { AUTH_SESSION_STORAGE_KEY, DEFAULT_USER_PASSWORD } from '../shared/utils/auth';
import { STORAGE_KEYS } from '../shared/utils/constants';
import type { User } from '../types/settings';

const storage = (() => {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: storage,
  configurable: true,
});

storage.clear();

const recycleDepartment = await departmentApi.createDepartment({
  name: 'Recycle Test Department',
  code: 'RECYCLE_TEST',
  memberCount: 0,
  isActive: true,
});
assert.equal(recycleDepartment.code, 0);
assert.ok(recycleDepartment.data);

const receiverDepartment = await departmentApi.createDepartment({
  name: 'Handoff Receiver Department',
  code: 'HANDOFF_RECEIVER_TEST',
  memberCount: 0,
  isActive: true,
});
assert.equal(receiverDepartment.code, 0);
assert.ok(receiverDepartment.data);

const created = await settingsApi.createUser({
  name: 'Lifecycle Sales',
  account: 'lifecycle_sales',
  email: 'lifecycle_sales@company.com',
  phone: '13900006666',
  departmentId: recycleDepartment.data.id,
  role: 'Sales Consultant',
  roleId: 'role-sales-consultant',
  isActive: true,
  password: DEFAULT_USER_PASSWORD,
});

assert.equal(created.code, 0);
assert.ok(created.data);
assert.equal(created.data.employmentStatus, 'active');

const receiver = await settingsApi.createUser({
  name: 'Handoff Receiver',
  account: 'handoff_receiver',
  email: 'handoff_receiver@company.com',
  phone: '13900007777',
  departmentId: receiverDepartment.data.id,
  role: 'Sales Consultant',
  roleId: 'role-sales-consultant',
  isActive: true,
  password: DEFAULT_USER_PASSWORD,
});
assert.equal(receiver.code, 0);
assert.ok(receiver.data);

storage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([{
  id: 'cust-leave-transfer',
  name: '离职交接客户',
  company: '离职交接客户公司',
  phone: '13900008888',
  customerLevel: 'L1',
  owner: 'Lifecycle Sales',
  totalSpent: 0,
  orderCount: 0,
  growthPath: [],
  growthRecords: [],
  activityRecords: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}]));
storage.setItem(STORAGE_KEYS.LEADS, JSON.stringify([{
  id: 'lead-leave-transfer',
  customerId: 'cust-leave-transfer',
  name: '离职交接线索',
  company: '离职交接客户公司',
  phone: '13900008888',
  source: '官网',
  status: '已联系',
  inputBy: 'Lifecycle Sales',
  assignedTo: 'Lifecycle Sales',
  owner: 'Lifecycle Sales',
  followUpRecords: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}]));

const activeBeforeLeave = await settingsApi.fetchUsers();
assert.ok(activeBeforeLeave.data.some((user) => user.id === created.data!.id));

const leaveOwnedCustomerCount = await settingsApi.countLeaveOwnedCustomers([created.data!.id]);
assert.equal(leaveOwnedCustomerCount.code, 0);
assert.equal(leaveOwnedCustomerCount.data, 1);

const leaveWithoutHandoffRes = await settingsApi.leaveUser(created.data!.id);
assert.notEqual(leaveWithoutHandoffRes.code, 0);
assert.match(leaveWithoutHandoffRes.message || '', /客户交接/);

const leaveRes = await settingsApi.leaveUser(created.data!.id, {
  customerAction: 'transfer',
  targetUserId: receiver.data!.id,
  reason: '员工离职交接',
});
assert.equal(leaveRes.code, 0);
assert.equal(leaveRes.data?.employmentStatus, 'left');
assert.equal(leaveRes.data?.isActive, false);
assert.ok(leaveRes.data?.leftAt);

const transferredCustomers = JSON.parse(storage.getItem(STORAGE_KEYS.CUSTOMERS) || '[]');
assert.equal(transferredCustomers[0].owner, 'Handoff Receiver');
assert.equal(transferredCustomers[0].originalSalesTransferBy, 'Lifecycle Sales');
assert.equal(transferredCustomers[0].activityRecords[0].type, 'transfer');
assert.match(transferredCustomers[0].activityRecords[0].content, /员工离职交接/);

const transferredLeads = JSON.parse(storage.getItem(STORAGE_KEYS.LEADS) || '[]');
assert.equal(transferredLeads[0].owner, 'Handoff Receiver');
assert.equal(transferredLeads[0].assignedTo, 'Handoff Receiver');

const leftLogin = await authApi.login({ account: 'lifecycle_sales', password: DEFAULT_USER_PASSWORD, remember: false });
assert.notEqual(leftLogin.code, 0);

const activeUsers = await settingsApi.fetchUsers();
assert.equal(activeUsers.data.some((user) => user.id === created.data!.id), false);

const leftUsers = await settingsApi.fetchUsers({ employmentStatus: 'left' });
assert.deepEqual(leftUsers.data.map((user) => user.id), [created.data!.id]);

const deleteDepartmentWithLeftUser = await departmentApi.deleteDepartment(recycleDepartment.data.id);
assert.equal(deleteDepartmentWithLeftUser.code, 0);

const restoreRes = await settingsApi.restoreUser(created.data!.id);
assert.equal(restoreRes.code, 0);
assert.equal(restoreRes.data?.employmentStatus, 'active');
assert.equal(restoreRes.data?.isActive, true);
assert.equal(restoreRes.data?.leftAt, undefined);

const leftAfterRestore = await settingsApi.fetchUsers({ employmentStatus: 'left' });
assert.equal(leftAfterRestore.data.some((user) => user.id === created.data!.id), false);

storage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([{
  id: 'cust-leave-public',
  name: '离职入公海客户',
  company: '离职入公海客户公司',
  phone: '13900009999',
  customerLevel: 'L1',
  owner: 'Lifecycle Sales',
  totalSpent: 0,
  orderCount: 0,
  growthPath: [],
  growthRecords: [],
  activityRecords: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}]));

const leaveAgainRes = await settingsApi.leaveUser(created.data!.id, {
  customerAction: 'public_pool',
  reason: '离职客户统一释放到公海',
});
assert.equal(leaveAgainRes.code, 0);
const publicPoolCustomers = JSON.parse(storage.getItem(STORAGE_KEYS.CUSTOMERS) || '[]');
assert.equal(publicPoolCustomers[0].owner, '公海');
assert.equal(publicPoolCustomers[0].lifecycleStatusCode, 'public_pool');
assert.equal(publicPoolCustomers[0].releasedBy, 'Lifecycle Sales');
assert.match(publicPoolCustomers[0].activityRecords[0].content, /统一释放到公海/);
const deleteRes = await settingsApi.deleteUser(created.data!.id);
assert.equal(deleteRes.code, 0);
const allUsersAfterDelete = await settingsApi.fetchUsers({ employmentStatus: 'all' });
assert.equal(allUsersAfterDelete.data.some((user) => user.id === created.data!.id), false);

const adminLeave = await settingsApi.leaveUser('user-admin');
assert.notEqual(adminLeave.code, 0);
const adminDelete = await settingsApi.deleteUser('user-admin');
assert.notEqual(adminDelete.code, 0);

const now = new Date().toISOString();
const legacyUser: User = {
  id: 'legacy-user',
  name: 'Legacy User',
  account: 'legacy_user',
  email: 'legacy_user@company.com',
  phone: '',
  role: 'Sales Consultant',
  isActive: true,
  createdAt: now,
  updatedAt: now,
};
storage.setItem(STORAGE_KEYS.USERS, JSON.stringify([legacyUser]));
storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
  userId: 'legacy-user',
  token: 'test-token',
  remember: true,
  createdAt: now,
}));
const migratedUsers = await settingsApi.fetchUsers({ employmentStatus: 'all' });
assert.equal(migratedUsers.data.find((user) => user.id === 'legacy-user')?.employmentStatus, 'active');

const settingsDir = join(process.cwd(), 'src', 'pages', 'Settings');
const employeeSource = readFileSync(join(settingsDir, 'EmployeeDepartmentManagement.tsx'), 'utf8');
const recycleSource = readFileSync(join(settingsDir, 'AccountRecycleBin.tsx'), 'utf8');
const settingsSource = readFileSync(join(settingsDir, 'index.tsx'), 'utf8');

assert.match(employeeSource, /办理离职/);
assert.match(employeeSource, /handleBatchLeave/);
assert.match(employeeSource, />办理离职</);
assert.doesNotMatch(employeeSource, /删除员工/);
assert.match(recycleSource, /永久删除/);
assert.match(recycleSource, /离职时间/);
assert.match(settingsSource, /value === index \? children : null/);
