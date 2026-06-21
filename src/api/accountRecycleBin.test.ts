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

const activeBeforeLeave = await settingsApi.fetchUsers();
assert.ok(activeBeforeLeave.data.some((user) => user.id === created.data!.id));

const leaveRes = await settingsApi.leaveUser(created.data!.id);
assert.equal(leaveRes.code, 0);
assert.equal(leaveRes.data?.employmentStatus, 'left');
assert.equal(leaveRes.data?.isActive, false);
assert.ok(leaveRes.data?.leftAt);

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

const leaveAgainRes = await settingsApi.leaveUser(created.data!.id);
assert.equal(leaveAgainRes.code, 0);
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

assert.match(employeeSource, /办理离职/);
assert.doesNotMatch(employeeSource, /删除员工/);
assert.match(recycleSource, /永久删除/);
assert.match(recycleSource, /离职时间/);
