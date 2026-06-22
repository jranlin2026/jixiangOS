import assert from 'node:assert/strict';
import { authApi } from './authApi';
import { settingsApi } from './settingsApi';
import { roleApi } from './roleApi';
import { DEFAULT_ADMIN_PASSWORD, DEFAULT_USER_PASSWORD } from '../shared/utils/auth';

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

assert.equal(DEFAULT_USER_PASSWORD, '1234567');

const badLogin = await authApi.login({ account: 'admin', password: 'bad-password', remember: true });
assert.notEqual(badLogin.code, 0);

const adminLogin = await authApi.login({ account: 'admin', password: DEFAULT_ADMIN_PASSWORD, remember: true });
assert.equal(adminLogin.code, 0);
assert.equal(adminLogin.data?.account, 'admin');
assert.equal(adminLogin.data?.role, '超级管理员');

const currentUser = await authApi.getCurrentUser();
assert.equal(currentUser.code, 0);
assert.equal(currentUser.data?.account, 'admin');

const roles = await roleApi.getRoles({ isActive: true });
assert.equal(roles.code, 0);
assert.equal(roles.data.length, 8);
const roleNames = new Set(roles.data.map((role) => role.name));

const existingUsers = await settingsApi.fetchUsers();
assert.equal(existingUsers.code, 0);
for (const user of existingUsers.data) {
  assert.ok(roleNames.has(user.role), `user role must come from role permissions: ${user.name} -> ${user.role}`);
}

const createUser = await settingsApi.createUser({
  name: '测试销售',
  account: 'test_sales',
  email: 'test_sales@company.com',
  phone: '13900001111',
  role: '销售顾问',
  isActive: true,
  password: DEFAULT_USER_PASSWORD,
});
assert.equal(createUser.code, 0);
assert.ok(createUser.data);
assert.ok(roleNames.has(createUser.data.role));

const userLogin = await authApi.login({ account: 'test_sales', password: DEFAULT_USER_PASSWORD, remember: false });
assert.equal(userLogin.code, 0);
assert.equal(userLogin.data?.account, 'test_sales');

const reset = await settingsApi.resetUserPassword(createUser.data!.id, 'NewPass123');
assert.equal(reset.code, 0);

const oldPasswordLogin = await authApi.login({ account: 'test_sales', password: DEFAULT_USER_PASSWORD, remember: false });
assert.notEqual(oldPasswordLogin.code, 0);

const newPasswordLogin = await authApi.login({ account: 'test_sales', password: 'NewPass123', remember: false });
assert.equal(newPasswordLogin.code, 0);
