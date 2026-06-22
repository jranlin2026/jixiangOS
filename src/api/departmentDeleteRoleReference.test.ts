import assert from 'node:assert/strict';
import { departmentApi, roleApi } from './index';
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

const department = await departmentApi.createDepartment({
  name: '空部门',
  code: 'EMPTY_ROLE_DEPT',
  memberCount: 0,
  isActive: true,
});
assert.equal(department.code, 0);

const role = await roleApi.createRole({
  name: '空部门角色',
  code: 'empty_role_dept_role',
  departmentId: department.data.id,
  permissions: [],
  memberCount: 0,
  isActive: true,
});
assert.equal(role.code, 0);

const deleteResult = await departmentApi.deleteDepartment(department.data.id);
assert.equal(deleteResult.code, 0);

const rolesAfterDelete = JSON.parse(storage.getItem(STORAGE_KEYS.ROLES) || '[]') as Array<{ id: string; departmentId?: string }>;
assert.equal(rolesAfterDelete.find((item) => item.id === role.data.id)?.departmentId, undefined);

storage.clear();

const initialDepartments = await departmentApi.getDepartments();
assert.equal(initialDepartments.code, 0);
assert.equal(initialDepartments.data.some((item) => item.id === 'dept-delivery'), true);

const deleteDefaultDepartment = await departmentApi.deleteDepartment('dept-delivery');
assert.equal(deleteDefaultDepartment.code, 0);

const departmentsAfterDefaultDelete = await departmentApi.getDepartments();
assert.equal(departmentsAfterDefaultDelete.data.some((item) => item.id === 'dept-delivery'), false);
