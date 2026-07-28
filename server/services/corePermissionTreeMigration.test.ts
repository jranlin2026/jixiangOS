import assert from 'node:assert/strict';
import {
  migrateCorePermissionTreeRole,
  migrateDefaultRoleAccess,
  ROLE_PERMISSION_ACTION_BASELINE_KEY,
  ROLE_PERMISSION_ACTION_BASELINE_VERSION,
} from './roleMigrationService';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import type { Role } from '../../src/types/role';

const legacyRole: Role = {
  id: 'role-existing-core-user',
  name: '现有核心模块角色',
  code: 'existing_core_user',
  permissions: [
    { module: PERMISSION_KEYS.LEADS_CREATE, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.FINANCE_PAYOUT, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.FINANCE_FLOW, actions: ['read'] },
  ],
  memberCount: 0,
  isActive: true,
  createdAt: '2026-07-28T00:00:00.000Z',
  updatedAt: '2026-07-28T00:00:00.000Z',
};

const migrated = migrateCorePermissionTreeRole(legacyRole);
assert.deepEqual(
  migrated.permissions.find((permission) => permission.module === PERMISSION_KEYS.LEADS_EDIT)?.actions,
  ['read', 'write'],
  '已有线索编辑能力必须迁移到独立权限',
);
assert.deepEqual(
  migrated.permissions.find((permission) => permission.module === PERMISSION_KEYS.FINANCE_PAYOUT_REPORT_EXPORT)?.actions,
  ['read'],
  '已有提成发放查看权必须保留原有月报导出能力',
);
assert.deepEqual(
  migrated.permissions.find((permission) => permission.module === PERMISSION_KEYS.FINANCE_FLOW_EXPORT)?.actions,
  ['read'],
  '已有收支流水查看权必须保留原有流水导出能力',
);
assert.deepEqual(
  migrateCorePermissionTreeRole(migrated).permissions,
  migrated.permissions,
  '核心权限迁移必须幂等',
);

const unrelatedRole = migrateCorePermissionTreeRole({
  ...legacyRole,
  id: 'role-unrelated',
  permissions: [{ module: PERMISSION_KEYS.CUSTOMER_LIST, actions: ['read'] }],
});
assert.deepEqual(unrelatedRole.permissions, [{ module: PERMISSION_KEYS.CUSTOMER_LIST, actions: ['read'] }]);

const existingCustomizedDefaultRole = {
  ...legacyRole,
  id: 'role-sales-consultant',
  name: '销售顾问',
  code: 'sales_consultant',
  permissions: [{ module: PERMISSION_KEYS.CUSTOMER_LIST, actions: ['read'] }],
  createdAt: new Date(legacyRole.createdAt),
  updatedAt: new Date(legacyRole.updatedAt),
};
let persistedPermissions: Array<{ module: string; actions: string[] }> | undefined;
let writtenMarkerVersion = 0;
const migratedCount = await migrateDefaultRoleAccess({
  role: {
    findMany: async () => [existingCustomizedDefaultRole],
    update: async ({ data }: any) => {
      persistedPermissions = data.permissions;
      return existingCustomizedDefaultRole;
    },
  },
  appStorage: {
    findUnique: async ({ where }: any) => where.key === ROLE_PERMISSION_ACTION_BASELINE_KEY
      ? ({ key: where.key, value: { version: 4 } })
      : null,
    upsert: async (input: any) => {
      writtenMarkerVersion = Number(input.update.value.version);
      return { key: input.where.key, value: input.update.value };
    },
  },
  $transaction: async (callback: (store: any) => Promise<number>) => callback({
    role: {
      findMany: async () => [existingCustomizedDefaultRole],
      update: async ({ data }: any) => {
        persistedPermissions = data.permissions;
        return existingCustomizedDefaultRole;
      },
    },
    appStorage: {
      upsert: async (input: any) => {
        writtenMarkerVersion = Number(input.update.value.version);
        return { key: input.where.key, value: input.update.value };
      },
    },
  }),
} as any);
assert.equal(migratedCount, 1);
assert.ok(persistedPermissions, '兼容规范化发生变化时应保存角色');
assert.equal(
  persistedPermissions?.some((permission) => permission.module === PERMISSION_KEYS.ORDER_CREATE),
  false,
  'v4 升级不得重新灌入管理员已移除的默认角色权限',
);
assert.equal(writtenMarkerVersion, ROLE_PERMISSION_ACTION_BASELINE_VERSION);

console.log('core permission tree migration tests passed');
