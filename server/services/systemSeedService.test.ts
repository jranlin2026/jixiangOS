import assert from 'node:assert/strict';
import { seedSystemBaseline } from './systemSeedService';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import {
  CUSTOMER_PERMISSION_SCOPE_BASELINE_KEY,
  CUSTOMER_PERMISSION_SCOPE_BASELINE_VERSION,
  ROLE_PERMISSION_ACTION_BASELINE_KEY,
  ROLE_PERMISSION_ACTION_BASELINE_VERSION,
} from './roleMigrationService';

function createStore() {
  const departments: any[] = [];
  const positions: any[] = [];
  const roles: any[] = [];
  const storage = new Map<string, unknown>();
  return {
    store: {
      department: { upsert: async ({ create }: any) => departments.push(create) },
      position: { upsert: async ({ create }: any) => positions.push(create) },
      role: { upsert: async ({ create }: any) => roles.push(create) },
      appStorage: {
        upsert: async ({ where, create, update }: any) => {
          storage.set(where.key, storage.has(where.key) ? update.value : create.value);
        },
      },
    } as any,
    departments,
    positions,
    roles,
    storage,
  };
}

const minimal = createStore();
await seedSystemBaseline(minimal.store, {
  companyName: '空白企业',
  organizationTemplate: 'minimal',
});
assert.equal(minimal.departments.length, 0);
assert.equal(minimal.positions.length, 0);
assert.ok(minimal.roles.some((role) => role.code === 'super_admin'));
assert.deepEqual(minimal.storage.get(STORAGE_KEYS.ORGANIZATION_PROFILE), { companyName: '空白企业' });
assert.equal(minimal.storage.get(STORAGE_KEYS.INITIALIZED), true);
assert.deepEqual(minimal.storage.get(STORAGE_KEYS.LEADS), []);
assert.deepEqual(minimal.storage.get(STORAGE_KEYS.CUSTOMERS), []);
assert.deepEqual(minimal.storage.get(STORAGE_KEYS.ORDERS), []);
assert.equal((minimal.storage.get(ROLE_PERMISSION_ACTION_BASELINE_KEY) as any).version, ROLE_PERMISSION_ACTION_BASELINE_VERSION);
assert.equal((minimal.storage.get(CUSTOMER_PERMISSION_SCOPE_BASELINE_KEY) as any).version, CUSTOMER_PERMISSION_SCOPE_BASELINE_VERSION);

const recommended = createStore();
await seedSystemBaseline(recommended.store, {
  companyName: '模板企业',
  organizationTemplate: 'recommended',
});
assert.ok(recommended.departments.length > 1);
assert.ok(recommended.positions.length > 1);
assert.ok(recommended.roles.length > 1);
for (const role of recommended.roles) {
  assert.equal(
    role.permissions.some((permission: any) => permission.module === PERMISSION_KEYS.CUSTOMERS),
    false,
    `全新初始化角色 ${role.name} 不得携带旧客户父权限`,
  );
}
for (const code of ['sales_manager', 'sales_consultant', 'customer_success']) {
  const role = recommended.roles.find((candidate) => candidate.code === code);
  assert.ok(role, `缺少默认角色 ${code}`);
  assert.ok(role.permissions.some((permission: any) => permission.module === PERMISSION_KEYS.CUSTOMER_LIST));
  assert.ok(role.permissions.some((permission: any) => permission.module === PERMISSION_KEYS.CUSTOMER_DETAIL));
}

console.log('system seed service tests passed');
