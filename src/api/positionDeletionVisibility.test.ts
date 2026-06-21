import assert from 'node:assert/strict';
import { positionApi, settingsApi } from './index';
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
storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
storage.setItem(STORAGE_KEYS.USERS, JSON.stringify([{
  id: 'user-legacy-ops',
  name: '旧运营员工',
  account: 'legacy_ops',
  email: '',
  phone: '13000000000',
  role: '运营管理员',
  roleId: 'role-ops-admin',
  departmentId: 'dept-ops',
  positionName: '运营管理员',
  isActive: true,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
}]));

const users = await settingsApi.fetchUsers();
assert.equal(users.code, 0);
assert.equal(users.data.find((user) => user.id === 'user-legacy-ops')?.positionId, 'pos-ops-admin');

const deleteResult = await positionApi.deletePosition('pos-ops-admin');
assert.notEqual(deleteResult.code, 0);
assert.match(deleteResult.message || '', /旧运营员工/);
