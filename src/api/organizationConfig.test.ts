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

const departments = await departmentApi.getDepartments({ isActive: true });
assert.equal(departments.code, 0);
assert.deepEqual(
  departments.data.map((item) => item.name),
  ['总经办', '市场获客部', '销售部', '客户成功部', '交付服务部', '财务结算部', '运营管理部'],
);

const roles = await roleApi.getRoles({ isActive: true });
assert.equal(roles.code, 0);
assert.deepEqual(
  roles.data.map((item) => item.name),
  ['超级管理员', '销售经理', '销售顾问', '市场专员', '客户成功', '交付工程师', '财务专员', '运营管理员'],
);

const positions = await positionApi.getPositions({ isActive: true });
assert.equal(positions.code, 0);
assert.deepEqual(
  positions.data.map((item) => item.name),
  ['总经理', '市场专员', '销售经理', '销售顾问', '客户成功', '交付工程师', '财务专员', '运营管理员'],
);

const existingUsers = await settingsApi.fetchUsers();
assert.equal(existingUsers.code, 0);
for (const user of existingUsers.data) {
  assert.ok(user.roleId, `user must carry roleId: ${user.name}`);
  assert.ok(user.positionId, `user must carry positionId: ${user.name}`);
  assert.ok(user.positionName, `user must carry positionName: ${user.name}`);
}

const customPosition = await positionApi.createPosition({
  name: '高级销售顾问',
  code: 'senior_sales_consultant',
  departmentId: 'dept-sales',
  description: '销售部可配置职位',
  sortOrder: 99,
  isActive: true,
});
assert.equal(customPosition.code, 0);
assert.ok(customPosition.data);

const createdUser = await settingsApi.createUser({
  name: '配置化测试用户',
  account: 'org_config_user',
  email: 'org_config_user@company.com',
  phone: '13900009999',
  departmentId: 'dept-sales',
  positionId: customPosition.data!.id,
  role: '销售顾问',
  roleId: 'role-sales-consultant',
  isActive: true,
  password: DEFAULT_USER_PASSWORD,
});
assert.equal(createdUser.code, 0);
assert.equal(createdUser.data?.positionId, customPosition.data!.id);
assert.equal(createdUser.data?.positionName, '高级销售顾问');
assert.equal(createdUser.data?.role, '销售顾问');
assert.equal(createdUser.data?.roleId, 'role-sales-consultant');

storage.clear();
const legacyNow = '2026-06-19T00:00:00.000Z';
storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
storage.setItem(STORAGE_KEYS.DEPARTMENTS, JSON.stringify([
  { id: 'dept-old-sales', name: '销售旧部', code: 'SALES', memberCount: 1, isActive: true, createdAt: legacyNow, updatedAt: legacyNow },
  { id: 'dept-custom', name: '自定义部门', code: 'CUSTOM', memberCount: 0, isActive: true, createdAt: legacyNow, updatedAt: legacyNow },
]));
storage.setItem(STORAGE_KEYS.POSITIONS, JSON.stringify([
  { id: 'pos-old-sales', name: '旧销售岗位', code: 'sales_consultant', departmentId: 'dept-old-sales', sortOrder: 1, isActive: true, createdAt: legacyNow, updatedAt: legacyNow },
]));
storage.setItem(STORAGE_KEYS.ROLES, JSON.stringify([
  { id: 'role-sales', name: 'Sales Consultant', code: 'sales_consultant', departmentId: 'dept-old-sales', permissions: [], memberCount: 1, isActive: true, createdAt: legacyNow, updatedAt: legacyNow },
]));
storage.setItem(STORAGE_KEYS.USERS, JSON.stringify([
  { id: 'user-legacy-sales', name: 'Legacy Sales', account: 'legacy_sales', email: '', phone: '', role: 'Sales Consultant', roleId: 'role-sales', departmentId: 'dept-old-sales', positionId: 'pos-old-sales', isActive: true, createdAt: legacyNow, updatedAt: legacyNow },
]));

const migratedUsers = await settingsApi.fetchUsers();
const legacyUser = migratedUsers.data.find((user) => user.id === 'user-legacy-sales');
assert.equal(legacyUser?.role, '销售顾问');
assert.equal(legacyUser?.roleId, 'role-sales-consultant');
assert.equal(legacyUser?.positionId, 'pos-sales-consultant');
assert.equal(legacyUser?.positionName, '销售顾问');
assert.equal(legacyUser?.departmentId, 'dept-sales');

const migratedRoles = await roleApi.getRoles({ isActive: true });
const salesRole = migratedRoles.data.find((role) => role.code === 'sales_consultant');
assert.ok(salesRole?.permissions.some((permission) => permission.module === 'leads.receive'));

const migratedDepartments = await departmentApi.getDepartments();
assert.ok(migratedDepartments.data.some((department) => department.id === 'dept-custom' && department.name === '自定义部门'));

assert.notEqual((await roleApi.deleteRole('role-sales-consultant')).code, 0);
assert.notEqual((await positionApi.deletePosition('pos-sales-consultant')).code, 0);
assert.notEqual((await departmentApi.deleteDepartment('dept-sales')).code, 0);
