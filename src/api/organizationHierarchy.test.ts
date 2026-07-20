import assert from 'node:assert/strict';
import { departmentApi, roleApi, settingsApi } from './index';
import { DEFAULT_USER_PASSWORD } from '../shared/utils/auth';
import { STORAGE_KEYS } from '../shared/utils/constants';

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

const profile = await settingsApi.fetchOrganizationProfile();
assert.equal(profile.code, 0);
assert.equal(profile.data.companyName, '福建极享信息科技有限公司');

const updatedProfile = await settingsApi.updateOrganizationProfile({ companyName: '福建极享科技' });
assert.equal(updatedProfile.code, 0);
assert.equal(updatedProfile.data?.companyName, '福建极享科技');
assert.equal((await settingsApi.fetchOrganizationProfile()).data.companyName, '福建极享科技');

const existingRoles = await roleApi.getRoles();
const existingRole = existingRoles.data[0];
const duplicateRoleCreate = await roleApi.createRole({
  ...existingRole,
  name: `  ${existingRole.name}  `,
  code: 'duplicate-role-name',
});
assert.notEqual(duplicateRoleCreate.code, 0);
assert.equal(duplicateRoleCreate.message, '角色名称已存在');

const temporaryRole = await roleApi.createRole({
  name: '临时唯一角色',
  code: 'temporary-unique-role',
  permissions: [],
  dataScopes: {},
  memberCount: 0,
  isActive: true,
});
assert.equal(temporaryRole.code, 0);
const duplicateRoleUpdate = await roleApi.updateRole(temporaryRole.data!.id, { name: existingRole.name });
assert.notEqual(duplicateRoleUpdate.code, 0);
assert.equal(duplicateRoleUpdate.message, '角色名称已存在');
assert.equal((await roleApi.deleteRole(temporaryRole.data!.id)).code, 0);

const salesOne = await departmentApi.createDepartment({
  name: '销售一部',
  code: 'SALES_ONE',
  parentId: 'dept-sales',
  memberCount: 0,
  isActive: true,
});
assert.equal(salesOne.code, 0);
assert.ok(salesOne.data);

const salesTwo = await departmentApi.createDepartment({
  name: '销售二部',
  code: 'SALES_TWO',
  parentId: 'dept-sales',
  memberCount: 0,
  isActive: true,
});
assert.equal(salesTwo.code, 0);
assert.ok(salesTwo.data);

await departmentApi.updateDepartment(salesOne.data!.id, { sortOrder: 2 });
await departmentApi.updateDepartment(salesTwo.data!.id, { sortOrder: 1 });
const reorderedDepartments = await departmentApi.getDepartments();
const salesChildren = reorderedDepartments.data.filter((department) => department.parentId === 'dept-sales');
assert.deepEqual(
  salesChildren.map((department) => department.id).sort(),
  [salesTwo.data!.id, salesOne.data!.id].sort(),
);

const cycleResult = await departmentApi.updateDepartment('dept-sales', { parentId: salesOne.data!.id });
assert.notEqual(cycleResult.code, 0);

const deleteWithChildResult = await departmentApi.deleteDepartment('dept-sales');
assert.notEqual(deleteWithChildResult.code, 0);

const createdUser = await settingsApi.createUser({
  name: '销售一部员工',
  account: 'sales_one_user',
  email: 'sales_one_user@company.com',
  phone: '13900008888',
  departmentId: salesOne.data!.id,
  positionName: '销售顾问',
  role: '销售顾问',
  roleId: 'role-sales-consultant',
  isActive: true,
  password: DEFAULT_USER_PASSWORD,
});
assert.equal(createdUser.code, 0);

const deleteWithUserResult = await departmentApi.deleteDepartment(salesOne.data!.id);
assert.notEqual(deleteWithUserResult.code, 0);

await settingsApi.leaveUser(createdUser.data!.id);

assert.notEqual((await roleApi.deleteRole('role-sales-consultant')).code, 0);

storage.removeItem(STORAGE_KEYS.ORGANIZATION_PROFILE);
const restoredProfile = await settingsApi.fetchOrganizationProfile();
assert.equal(restoredProfile.data.companyName, '福建极享信息科技有限公司');
