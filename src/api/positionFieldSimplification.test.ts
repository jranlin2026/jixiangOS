import assert from 'node:assert/strict';
import { departmentApi, settingsApi } from './index';
import { DEFAULT_USER_PASSWORD } from '../shared/utils/auth';
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

const now = '2026-06-22T00:00:00.000Z';

storage.clear();
storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
storage.setItem(STORAGE_KEYS.DEPARTMENTS, JSON.stringify([
  { id: 'dept-custom', name: 'Custom Department', code: 'CUSTOM', memberCount: 0, isActive: true, createdAt: now, updatedAt: now },
  { id: 'dept-position-only', name: 'Position Only Department', code: 'POSITION_ONLY', memberCount: 0, isActive: true, createdAt: now, updatedAt: now },
]));
storage.setItem(STORAGE_KEYS.POSITIONS, JSON.stringify([
  { id: 'pos-legacy', name: 'Legacy Position', code: 'legacy_position', departmentId: 'dept-custom', sortOrder: 1, isActive: true, createdAt: now, updatedAt: now },
  { id: 'pos-hidden-reference', name: 'Hidden Reference', code: 'hidden_reference', departmentId: 'dept-position-only', sortOrder: 2, isActive: true, createdAt: now, updatedAt: now },
]));
storage.setItem(STORAGE_KEYS.ROLES, JSON.stringify([
  { id: 'role-sales-consultant', name: 'Sales Consultant', code: 'sales_consultant', permissions: [], memberCount: 1, isActive: true, createdAt: now, updatedAt: now },
]));
storage.setItem(STORAGE_KEYS.USERS, JSON.stringify([
  { id: 'user-legacy', name: 'Legacy User', account: 'legacy_user', email: '', phone: '', role: 'Sales Consultant', roleId: 'role-sales-consultant', departmentId: 'dept-custom', positionId: 'pos-legacy', positionName: 'Legacy Position', isActive: true, createdAt: now, updatedAt: now },
]));

const users = await settingsApi.fetchUsers();
assert.equal(users.code, 0);
const legacyUser = users.data.find((user) => user.id === 'user-legacy');
assert.ok(legacyUser);
assert.equal(legacyUser.positionId, 'pos-legacy');
assert.equal(legacyUser.positionName, 'Legacy Position');

const createdPosition = await settingsApi.createPosition({
  name: 'Account Executive',
  code: 'account_executive',
  departmentId: 'dept-custom',
  description: 'Owns customer conversion',
  sortOrder: 3,
  isActive: true,
});
assert.equal(createdPosition.code, 0);
assert.equal(createdPosition.data?.name, 'Account Executive');

const renamedPosition = await settingsApi.updatePosition(createdPosition.data!.id, {
  name: 'Senior Account Executive',
});
assert.equal(renamedPosition.code, 0);
assert.equal(renamedPosition.data?.name, 'Senior Account Executive');
const clearedPositionDepartment = await settingsApi.updatePosition(createdPosition.data!.id, { departmentId: '' });
assert.equal(clearedPositionDepartment.code, 0);
assert.equal(clearedPositionDepartment.data?.departmentId, undefined);

const mismatchedUser = await settingsApi.createUser({
  name: 'Mismatched Position User',
  account: 'mismatched_position_user',
  email: 'mismatched_position_user@example.com',
  phone: '13900001112',
  role: 'Sales Consultant',
  roleId: 'role-sales-consultant',
  departmentId: 'dept-position-only',
  positionId: 'pos-legacy',
  isActive: true,
  password: DEFAULT_USER_PASSWORD,
});
assert.notEqual(mismatchedUser.code, 0);
assert.match(mismatchedUser.message || '', /不属于所选部门/);

const createdUser = await settingsApi.createUser({
  name: 'Canonical Position User',
  account: 'canonical_position_user',
  email: 'canonical_position_user@example.com',
  phone: '13900001111',
  role: 'Sales Consultant',
  roleId: 'role-sales-consultant',
  departmentId: 'dept-custom',
  positionId: 'pos-legacy',
  isActive: true,
  password: DEFAULT_USER_PASSWORD,
});
assert.equal(createdUser.code, 0);
assert.equal(createdUser.data?.positionId, 'pos-legacy');
assert.equal(createdUser.data?.positionName, 'Legacy Position');

const movedBoundPosition = await settingsApi.updatePosition('pos-legacy', { departmentId: 'dept-position-only' });
assert.notEqual(movedBoundPosition.code, 0);
assert.match(movedBoundPosition.message || '', /已有员工使用/);
const clearedBoundPositionDepartment = await settingsApi.updatePosition('pos-legacy', { departmentId: '' });
assert.equal(clearedBoundPositionDepartment.code, 0);
assert.equal(clearedBoundPositionDepartment.data?.departmentId, undefined);
const restoredBoundPositionDepartment = await settingsApi.updatePosition('pos-legacy', { departmentId: 'dept-custom' });
assert.equal(restoredBoundPositionDepartment.code, 0);

const updatedUser = await settingsApi.updateUser(createdUser.data!.id, {
  departmentId: 'dept-position-only',
  positionId: 'pos-hidden-reference',
});
assert.equal(updatedUser.code, 0);
assert.equal(updatedUser.data?.positionId, 'pos-hidden-reference');
assert.equal(updatedUser.data?.positionName, 'Hidden Reference');

await settingsApi.updatePosition('pos-hidden-reference', { isActive: false });
const inactivePositionProfileUpdate = await settingsApi.updateUser(createdUser.data!.id, {
  name: 'Canonical Position User Updated',
  positionId: 'pos-hidden-reference',
});
assert.equal(inactivePositionProfileUpdate.code, 0);
await settingsApi.updatePosition('pos-hidden-reference', { isActive: true });

const storedUsers = JSON.parse(storage.getItem(STORAGE_KEYS.USERS) || '[]') as User[];
assert.equal(storedUsers.find((user) => user.id === 'user-legacy')?.positionId, 'pos-legacy');
assert.equal(storedUsers.find((user) => user.id === createdUser.data!.id)?.positionName, 'Hidden Reference');

const deleteBoundPosition = await settingsApi.deletePosition('pos-hidden-reference');
assert.notEqual(deleteBoundPosition.code, 0);
assert.match(deleteBoundPosition.message || '', /停用/);

const deleteUnusedPosition = await settingsApi.deletePosition(createdPosition.data!.id);
assert.equal(deleteUnusedPosition.code, 0);
assert.equal(deleteUnusedPosition.data, true);

const clearedPositionUser = await settingsApi.updateUser('user-legacy', { positionId: '' });
assert.equal(clearedPositionUser.code, 0);
assert.equal(clearedPositionUser.data?.positionId, undefined);
assert.equal(clearedPositionUser.data?.positionName, undefined);

const deleteDepartment = await departmentApi.deleteDepartment('dept-position-only');
assert.notEqual(deleteDepartment.code, 0);
assert.match(deleteDepartment.message || '', /岗位/);
