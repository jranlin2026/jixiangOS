import assert from 'node:assert/strict';
import { departmentApi, positionApi, roleApi, settingsApi } from './index';
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

const childOnlyPosition = await positionApi.createPosition({
  name: '销售二部专属岗位',
  code: 'sales_two_only',
  departmentId: salesTwo.data!.id,
  sortOrder: 200,
  isActive: true,
});
assert.equal(childOnlyPosition.code, 0);

const salesOnePositions = await positionApi.getPositionsForDepartment(salesOne.data!.id);
assert.equal(salesOnePositions.code, 0);
assert.ok(salesOnePositions.data.some((position) => position.id === 'pos-sales-manager'));
assert.ok(salesOnePositions.data.some((position) => position.id === 'pos-sales-consultant'));
assert.equal(salesOnePositions.data.some((position) => position.id === childOnlyPosition.data!.id), false);

const salesTwoPositions = await positionApi.getPositionsForDepartment(salesTwo.data!.id);
assert.equal(salesTwoPositions.code, 0);
assert.ok(salesTwoPositions.data.some((position) => position.id === childOnlyPosition.data!.id));

await departmentApi.updateDepartment(salesOne.data!.id, { sortOrder: 2 });
await departmentApi.updateDepartment(salesTwo.data!.id, { sortOrder: 1 });
const reorderedDepartments = await departmentApi.getDepartments();
const salesChildren = reorderedDepartments.data.filter((department) => department.parentId === 'dept-sales');
assert.deepEqual(salesChildren.map((department) => department.id), [salesTwo.data!.id, salesOne.data!.id]);

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
  positionId: 'pos-sales-consultant',
  role: '销售顾问',
  roleId: 'role-sales-consultant',
  isActive: true,
  password: DEFAULT_USER_PASSWORD,
});
assert.equal(createdUser.code, 0);

const deleteWithUserResult = await departmentApi.deleteDepartment(salesOne.data!.id);
assert.notEqual(deleteWithUserResult.code, 0);

await settingsApi.leaveUser(createdUser.data!.id);

const inactiveOnlyPosition = await positionApi.createPosition({
  name: 'Inactive Only Position',
  code: 'inactive_only_position',
  departmentId: 'dept-ops',
  sortOrder: 201,
  isActive: true,
});
assert.equal(inactiveOnlyPosition.code, 0);
assert.ok(inactiveOnlyPosition.data);

const inactiveUser = await settingsApi.createUser({
  name: 'Inactive Position User',
  account: 'inactive_position_user',
  email: 'inactive_position_user@company.com',
  phone: '13900007777',
  departmentId: 'dept-ops',
  positionId: inactiveOnlyPosition.data!.id,
  role: '运营管理员',
  roleId: 'role-ops-admin',
  isActive: false,
  password: DEFAULT_USER_PASSWORD,
});
assert.equal(inactiveUser.code, 0);
await settingsApi.leaveUser(inactiveUser.data!.id);
assert.equal((await positionApi.deletePosition(inactiveOnlyPosition.data!.id)).code, 0);

assert.notEqual((await roleApi.deleteRole('role-sales-consultant')).code, 0);

storage.removeItem(STORAGE_KEYS.ORGANIZATION_PROFILE);
const restoredProfile = await settingsApi.fetchOrganizationProfile();
assert.equal(restoredProfile.data.companyName, '福建极享信息科技有限公司');
