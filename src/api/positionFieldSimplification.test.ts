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
assert.equal(legacyUser.positionId, undefined);
assert.equal(legacyUser.positionName, undefined);

const createdUser = await settingsApi.createUser({
  name: 'Manual Position User',
  account: 'manual_position_user',
  email: 'manual_position_user@example.com',
  phone: '13900001111',
  role: 'Sales Consultant',
  roleId: 'role-sales-consultant',
  departmentId: 'dept-custom',
  positionName: 'Hand Written Consultant',
  isActive: true,
  password: DEFAULT_USER_PASSWORD,
});
assert.equal(createdUser.code, 0);
assert.equal(createdUser.data?.positionId, undefined);
assert.equal(createdUser.data?.positionName, 'Hand Written Consultant');

const updatedUser = await settingsApi.updateUser(createdUser.data!.id, { positionName: 'Senior Hand Written Consultant' });
assert.equal(updatedUser.code, 0);
assert.equal(updatedUser.data?.positionId, undefined);
assert.equal(updatedUser.data?.positionName, 'Senior Hand Written Consultant');

const storedUsers = JSON.parse(storage.getItem(STORAGE_KEYS.USERS) || '[]') as User[];
assert.equal(storedUsers.find((user) => user.id === 'user-legacy')?.positionId, undefined);
assert.equal(storedUsers.find((user) => user.id === createdUser.data!.id)?.positionName, 'Senior Hand Written Consultant');

const deleteDepartment = await departmentApi.deleteDepartment('dept-position-only');
assert.equal(deleteDepartment.code, 0);
