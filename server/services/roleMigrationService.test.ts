import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  CUSTOMER_PERMISSION_SCOPE_BASELINE_KEY,
  CUSTOMER_PERMISSION_SCOPE_BASELINE_VERSION,
  CUSTOMER_PERMISSION_SCOPE_MIGRATION_MANIFEST_KEY,
  ROLE_PERMISSION_ACTION_BASELINE_KEY,
  ROLE_PERMISSION_ACTION_BASELINE_VERSION,
  assertCustomerPermissionMigrationPrerequisites,
  computeCustomerPermissionMigrationManifestChecksum,
  createCustomerPermissionMigrationManifest,
  createCustomerPermissionMigrationManifestAuthenticator,
  createCustomerPermissionMigrationManifestAuthenticatorFromEnv,
  migrateCustomerPermissionAndScopeBaseline,
  migrateDefaultRoleAccess,
  toSafeCustomerPermissionMigrationErrorCode,
  validateCustomerPermissionMigrationManifest,
} from './roleMigrationService';
import { PERMISSION_KEYS, roleHasPermission } from '../../src/shared/utils/permissions';
import {
  captureLegacyCustomerDeleteRoleIds,
  mergeRoleWithDefaultAccess,
} from '../../src/shared/utils/organizationConfig';
import { mapPrismaRole } from '../db/prismaMappers';
import {
  applyCustomerPermissionMigrationManifest,
  captureCustomerPermissionMigrationManifest,
  parseCustomerPermissionMigrationCliArgs,
} from '../../scripts/prepare-customer-permission-migration';

const TEST_MANIFEST_SIGNING_KEY = 'task-2-test-manifest-signing-key-32-bytes-minimum';
const manifestAuthenticator = createCustomerPermissionMigrationManifestAuthenticator(TEST_MANIFEST_SIGNING_KEY);
assert.throws(
  () => createCustomerPermissionMigrationManifestAuthenticatorFromEnv({}),
  /CUSTOMER_PERMISSION_MIGRATION_SIGNING_KEY_REQUIRED/,
  'capture、apply 与启动缺少发布签名密钥时必须 fail closed',
);

const updates: any[] = [];
const legacyRole = {
  id: 'role-sales-consultant',
  name: '销售专员',
  code: 'sales_consultant',
  description: null,
  departmentId: 'dept-sales',
  permissions: [
    { module: PERMISSION_KEYS.CUSTOMERS, actions: ['read'] },
    { module: PERMISSION_KEYS.ASSETS_DEVICES, actions: ['read', 'write'] },
  ],
  dataScopes: { customers: 'self' },
  memberCount: 0,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const migratedCount = await migrateDefaultRoleAccess({
  role: {
    findMany: async () => [legacyRole],
    update: async (input: any) => {
      updates.push(input);
      return legacyRole;
    },
  },
} as any);

assert.equal(migratedCount, 1);
assert.equal(updates.length, 1);
assert.equal(updates[0].where.id, 'role-sales-consultant');
assert.ok(updates[0].data.permissions.some((permission: any) => permission.module === PERMISSION_KEYS.ASSETS_OVERVIEW));
assert.deepEqual(
  updates[0].data.permissions.find((permission: any) => permission.module === PERMISSION_KEYS.ASSETS_DEVICES)?.actions,
  ['read'],
);
assert.equal(updates[0].data.dataScopes.assets, 'self');
assert.deepEqual(
  updates[0].data.permissions.find((permission: any) => permission.module === PERMISSION_KEYS.CUSTOMER_ASSIGN)?.actions,
  ['read', 'write'],
  '现有默认销售角色必须一次性恢复放入公海、领取和分配客户所需的显式写权限',
);
assert.deepEqual(
  updates[0].data.permissions.find((permission: any) => permission.module === PERMISSION_KEYS.CUSTOMER_PUBLIC_POOL_CLAIM)?.actions,
  ['read', 'write'],
  '现有默认销售角色必须获得独立的公海领取权限',
);
assert.deepEqual(
  updates[0].data.permissions.find((permission: any) => permission.module === PERMISSION_KEYS.LEADS_CREATE)?.actions,
  ['read', 'write'],
  '现有默认销售角色必须一次性恢复新建线索所需的显式写权限',
);

const idempotentCount = await migrateDefaultRoleAccess({
  role: {
    findMany: async () => [{
      ...legacyRole,
      permissions: updates[0].data.permissions,
      dataScopes: updates[0].data.dataScopes,
    }],
    update: async (input: any) => {
      updates.push(input);
      return legacyRole;
    },
  },
} as any);

assert.equal(idempotentCount, 0);
assert.equal(updates.length, 1);

const financeUpdates: any[] = [];
const legacyFinanceRole = {
  ...legacyRole,
  id: 'role-finance-specialist',
  name: '财务专员',
  code: 'finance_specialist',
  departmentId: 'dept-finance',
  permissions: [{ module: PERMISSION_KEYS.ORDERS, actions: ['read'] }],
  dataScopes: { orders: 'all', orderApplications: 'all' },
};
const financeMigratedCount = await migrateDefaultRoleAccess({
  role: {
    findMany: async () => [legacyFinanceRole],
    update: async (input: any) => {
      financeUpdates.push(input);
      return legacyFinanceRole;
    },
  },
} as any);

assert.equal(financeMigratedCount, 1);
assert.deepEqual(
  financeUpdates[0].data.permissions.find((permission: any) => permission.module === PERMISSION_KEYS.ORDER_REVIEW)?.actions,
  ['read', 'write'],
  '现有默认财务角色必须迁移出显式订单审核写权限',
);
assert.deepEqual(
  financeUpdates[0].data.permissions.find((permission: any) => permission.module === PERMISSION_KEYS.ORDER_REVIEW_LIST)?.actions,
  ['read'],
  '现有默认财务角色必须迁移出独立订单审核列表查看权限',
);

const baselineMarkers = new Map<string, unknown>();
let currentStoredRole: any = {
  ...legacyRole,
  permissions: [{ module: PERMISSION_KEYS.CUSTOMER_LIST, actions: ['read'] }],
  dataScopes: {
    leads: 'self',
    customers: 'self',
    orders: 'self',
    orderApplications: 'self',
    recoveryOrders: 'self',
    recoveryOrderApplications: 'self',
    assets: 'self',
  },
};
const markerWrites: any[] = [];
const transactionalRoleUpdates: any[] = [];
const transactionStore = {
  role: {
    findMany: async () => [currentStoredRole],
    update: async (input: any) => {
      transactionalRoleUpdates.push(input);
      currentStoredRole = {
        ...currentStoredRole,
        permissions: input.data.permissions,
        dataScopes: input.data.dataScopes,
      };
      return currentStoredRole;
    },
  },
  appStorage: {
    findUnique: async (input: any) => baselineMarkers.has(input.where.key)
      ? ({ key: input.where.key, value: baselineMarkers.get(input.where.key) })
      : null,
    upsert: async (input: any) => {
      markerWrites.push(input);
      const value = baselineMarkers.has(input.where.key) ? input.update.value : input.create.value;
      baselineMarkers.set(input.where.key, value);
      return { key: input.where.key, value };
    },
  },
};
const transactionClient = {
  ...transactionStore,
  $transaction: async (callback: (store: typeof transactionStore) => Promise<number>) => callback(transactionStore),
};

const firstBaselineCount = await migrateDefaultRoleAccess(transactionClient as any);
assert.equal(firstBaselineCount, 1);
assert.equal(markerWrites.length, 1, '成功恢复默认角色基线后必须写入一次性迁移标记');
assert.deepEqual(
  currentStoredRole.permissions.find((permission: any) => permission.module === PERMISSION_KEYS.CUSTOMER_ASSIGN)?.actions,
  ['read', 'write'],
);

currentStoredRole = {
  ...currentStoredRole,
  permissions: currentStoredRole.permissions.filter((permission: any) => permission.module !== PERMISSION_KEYS.CUSTOMER_ASSIGN),
};
transactionalRoleUpdates.length = 0;
const postAdminEditCount = await migrateDefaultRoleAccess(transactionClient as any);
assert.equal(postAdminEditCount, 0, '迁移标记存在后不得覆盖管理员后续移除的默认角色权限');
assert.equal(markerWrites.length, 1);
assert.equal(transactionalRoleUpdates.length, 0);

const customRoleUpdates: any[] = [];
const customReadOnlyRole = {
  ...currentStoredRole,
  id: 'role-custom-customer-reader',
  code: 'custom_customer_reader',
  name: '自定义客户只读',
  permissions: [{ module: PERMISSION_KEYS.CUSTOMER_LIST, actions: ['read'] }],
};
const customRoleCount = await migrateDefaultRoleAccess({
  role: {
    findMany: async () => [customReadOnlyRole],
    update: async (input: any) => {
      customRoleUpdates.push(input);
      return customReadOnlyRole;
    },
  },
} as any);
assert.equal(customRoleCount, 0, '一次性基线不得为自定义角色扩权');

const combinedReviewRoleUpdates: any[] = [];
const legacyCombinedReviewRole = {
  ...customReadOnlyRole,
  id: 'role-legacy-recovery-reviewer',
  code: 'legacy_recovery_reviewer',
  name: '旧售后审核角色',
  permissions: [{ module: PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW, actions: ['read', 'write'] }],
};
const combinedReviewRoleCount = await migrateDefaultRoleAccess({
  role: {
    findMany: async () => [legacyCombinedReviewRole],
    update: async (input: any) => {
      combinedReviewRoleUpdates.push(input);
      return legacyCombinedReviewRole;
    },
  },
} as any);
assert.equal(combinedReviewRoleCount, 1);
assert.deepEqual(
  combinedReviewRoleUpdates[0].data.permissions.find((permission: any) => permission.module === PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW_LIST)?.actions,
  ['read'],
  '旧版合并权限必须一次性迁移出独立审核列表查看权限',
);

const legacyOrderReviewUpdates: any[] = [];
const legacyOrderReviewRole = {
  ...customReadOnlyRole,
  id: 'role-legacy-order-reviewer',
  code: 'legacy_order_reviewer',
  name: '旧订单审核角色',
  permissions: [{ module: '订单/订单审核台', actions: ['read', 'write'] }],
};
const legacyOrderReviewCount = await migrateDefaultRoleAccess({
  role: {
    findMany: async () => [legacyOrderReviewRole],
    update: async (input: any) => {
      legacyOrderReviewUpdates.push(input);
      return legacyOrderReviewRole;
    },
  },
} as any);
assert.equal(legacyOrderReviewCount, 1);
assert.deepEqual(
  legacyOrderReviewUpdates[0].data.permissions.find((permission: any) => permission.module === PERMISSION_KEYS.ORDER_REVIEW_LIST)?.actions,
  ['read'],
  '旧版订单审核台合并权限必须迁移出独立审核列表权限',
);
assert.deepEqual(
  legacyOrderReviewUpdates[0].data.permissions.find((permission: any) => permission.module === PERMISSION_KEYS.ORDER_REVIEW)?.actions,
  ['read', 'write'],
  '旧版订单审核台合并权限必须保留原有审核操作能力',
);
assert.equal(customRoleUpdates.length, 0);
assert.equal(
  customReadOnlyRole.permissions.some((permission: any) => permission.module === PERMISSION_KEYS.CUSTOMER_PUBLIC_POOL_CLAIM),
  false,
  '自定义角色不得自动获得公海领取权限',
);

const migrationRole = (
  id: string,
  permissions: Array<{ module: string; actions: string[] }>,
  dataScopes: Record<string, string> = { customers: 'self' },
  overrides: Record<string, unknown> = {},
) => ({
  id,
  name: `角色 ${id}`,
  code: id,
  description: null,
  departmentId: null,
  permissions,
  dataScopes,
  memberCount: 0,
  isActive: true,
  createdAt: new Date('2026-07-17T00:00:00.000Z'),
  updatedAt: new Date('2026-07-17T00:00:00.000Z'),
  ...overrides,
});

const clone = <T>(value: T): T => (
  value === undefined ? value : JSON.parse(JSON.stringify(value)) as T
);

function customerMigrationHarness(
  initialRoles: any[],
  manifest?: unknown,
  options: { roleBaselineVersion?: number | null } = {},
) {
  let roles = clone(initialRoles);
  const storage = new Map<string, unknown>();
  const roleUpdates: any[] = [];
  const storageWrites: any[] = [];
  const transactionOptions: any[] = [];
  let failingRoleId: string | undefined;
  let conflictingRoleId: string | undefined;
  let beforeFinalRoleRead: ((workingRoles: any[]) => any[]) | undefined;
  const roleBaselineVersion = options.roleBaselineVersion === undefined
    ? ROLE_PERMISSION_ACTION_BASELINE_VERSION
    : options.roleBaselineVersion;
  if (roleBaselineVersion !== null) {
    storage.set(ROLE_PERMISSION_ACTION_BASELINE_KEY, { version: roleBaselineVersion });
  }
  if (manifest !== undefined) storage.set(CUSTOMER_PERMISSION_SCOPE_MIGRATION_MANIFEST_KEY, clone(manifest));

  const prisma = {
    role: {} as any,
    appStorage: {} as any,
    $transaction: async <T>(callback: (tx: any) => Promise<T>, options?: unknown): Promise<T> => {
      transactionOptions.push(clone(options));
      let workingRoles = clone(roles);
      let roleReadCount = 0;
      const workingStorage = new Map<string, unknown>(
        Array.from(storage.entries()).map(([key, value]) => [key, clone(value)]),
      );
      const attemptedRoleUpdates: any[] = [];
      const attemptedStorageWrites: any[] = [];
      const transactionStore = {
        role: {
          findMany: async () => {
            roleReadCount += 1;
            if (roleReadCount === 2 && beforeFinalRoleRead) {
              workingRoles = beforeFinalRoleRead(clone(workingRoles));
            }
            return clone(workingRoles);
          },
          updateMany: async (input: any) => {
            attemptedRoleUpdates.push(clone(input));
            if (input.where.id === failingRoleId) throw new Error('SIMULATED_ROLE_UPDATE_FAILURE');
            if (input.where.id === conflictingRoleId) return { count: 0 };
            const index = workingRoles.findIndex((role) => (
              role.id === input.where.id
              && new Date(role.updatedAt).getTime() === new Date(input.where.updatedAt).getTime()
            ));
            if (index < 0) return { count: 0 };
            workingRoles[index] = { ...workingRoles[index], ...clone(input.data) };
            return { count: 1 };
          },
        },
        appStorage: {
          findUnique: async (input: any) => {
            if (!workingStorage.has(input.where.key)) return null;
            return { key: input.where.key, value: clone(workingStorage.get(input.where.key)) };
          },
          upsert: async (input: any) => {
            attemptedStorageWrites.push(clone(input));
            const value = workingStorage.has(input.where.key) ? input.update.value : input.create.value;
            workingStorage.set(input.where.key, clone(value));
            return { key: input.where.key, value: clone(value) };
          },
        },
      };
      try {
        const result = await callback(transactionStore);
        roles = workingRoles;
        storage.clear();
        workingStorage.forEach((value, key) => storage.set(key, clone(value)));
        return result;
      } finally {
        roleUpdates.push(...attemptedRoleUpdates);
        storageWrites.push(...attemptedStorageWrites);
      }
    },
  };

  return {
    prisma,
    roleUpdates,
    storageWrites,
    transactionOptions,
    role: (id: string) => clone(roles.find((role) => role.id === id)),
    setRole: (id: string, update: (role: any) => any) => {
      roles = roles.map((role) => role.id === id ? update(clone(role)) : role);
    },
    failRoleUpdate: (id?: string) => {
      failingRoleId = id;
    },
    conflictRoleUpdate: (id?: string) => {
      conflictingRoleId = id;
    },
    mutateBeforeFinalRoleRead: (mutate: (workingRoles: any[]) => any[]) => {
      beforeFinalRoleRead = mutate;
    },
    setStored: (key: string, value: unknown) => {
      storage.set(key, clone(value));
    },
    stored: (key: string) => clone(storage.get(key)),
    marker: () => clone(storage.get(CUSTOMER_PERMISSION_SCOPE_BASELINE_KEY)),
  };
}

const legacyCustomerRoles = [
  migrationRole(
    'role-legacy-reader',
    [{ module: PERMISSION_KEYS.CUSTOMERS, actions: ['read', 'write'] }],
    { customers: 'department' },
  ),
  migrationRole('role-legacy-assigner', [
    { module: PERMISSION_KEYS.CUSTOMER_ASSIGN, actions: ['read'] },
  ]),
  migrationRole('role-legacy-editor', [
    { module: PERMISSION_KEYS.CUSTOMER_EDIT, actions: ['read', 'write'] },
  ]),
  migrationRole('role-legacy-read-only-editor', [
    { module: PERMISSION_KEYS.CUSTOMER_EDIT, actions: ['read'] },
  ]),
  migrationRole('role-captured-deleter', []),
  migrationRole('role-unproven-preexisting-delete', [
    { module: PERMISSION_KEYS.CUSTOMER_DELETE, actions: ['read', 'delete'] },
    { module: ' 客户 / 删除客户 ', actions: ['delete'] },
  ]),
  migrationRole('role-unproven-all-delete', [
    { module: '全部', actions: ['delete'] },
  ]),
  migrationRole('role-name-must-not-grant-delete', [], { customers: 'self' }, {
    name: '超级管理员',
    code: 'super_admin',
  }),
  migrationRole('role-parent-without-read', [
    { module: PERMISSION_KEYS.CUSTOMERS, actions: ['write', 'delete', 'admin'] },
  ]),
];
const legacyCustomerRoleModels = legacyCustomerRoles.map(mapPrismaRole);
const customerManifest = createCustomerPermissionMigrationManifest(
  legacyCustomerRoleModels,
  ['role-captured-deleter'],
  manifestAuthenticator,
  '2026-07-17T01:00:00.000Z',
);
const reorderedLegacyModels = [...legacyCustomerRoleModels]
  .reverse()
  .map((role) => ({
    ...role,
    permissions: [...role.permissions]
      .reverse()
      .map((permission) => ({ ...permission, actions: [...permission.actions].reverse() })),
  }));
assert.equal(
  createCustomerPermissionMigrationManifest(
    reorderedLegacyModels,
    ['role-captured-deleter'],
    manifestAuthenticator,
    '2026-07-17T01:00:00.000Z',
  ).roleDataHash,
  customerManifest.roleDataHash,
  'raw Role canonical hash 不得依赖数据库行、权限或 action 数组顺序',
);
const customerHarness = customerMigrationHarness(legacyCustomerRoles, customerManifest);

const firstCustomerMigration = await migrateCustomerPermissionAndScopeBaseline(customerHarness.prisma as any, manifestAuthenticator);
assert.equal(firstCustomerMigration.version, CUSTOMER_PERMISSION_SCOPE_BASELINE_VERSION);
assert.deepEqual(
  [...firstCustomerMigration.migratedRoleIds].sort(),
  [
    'role-legacy-reader',
    'role-legacy-assigner',
    'role-legacy-editor',
    'role-captured-deleter',
    'role-unproven-preexisting-delete',
  ].sort(),
  '迁移只报告实际权限或范围发生变化的角色',
);
assert.deepEqual(
  customerHarness.role('role-legacy-reader').permissions
    .filter((permission: any) => [PERMISSION_KEYS.CUSTOMER_LIST, PERMISSION_KEYS.CUSTOMER_DETAIL].includes(permission.module))
    .map((permission: any) => permission.module),
  [PERMISSION_KEYS.CUSTOMER_LIST, PERMISSION_KEYS.CUSTOMER_DETAIL],
  '旧客户父节点只能迁移出列表和详情读取能力',
);
assert.equal(
  customerHarness.role('role-legacy-reader').permissions.some((permission: any) => [
    PERMISSION_KEYS.CUSTOMER_CREATE,
    PERMISSION_KEYS.CUSTOMER_EDIT_PROFILE,
    PERMISSION_KEYS.CUSTOMER_TRANSFER,
  ].includes(permission.module)),
  false,
  '旧客户父节点不得迁移出任何写能力',
);
assert.equal(
  customerHarness.role('role-legacy-reader').dataScopes.customers,
  'department',
  '旧客户部门范围必须统一为本部门树语义',
);
assert.deepEqual(
  customerHarness.role('role-legacy-assigner').permissions
    .filter((permission: any) => [PERMISSION_KEYS.CUSTOMER_TRANSFER, PERMISSION_KEYS.CUSTOMER_RELEASE_TO_POOL].includes(permission.module))
    .map((permission: any) => permission.module),
  [PERMISSION_KEYS.CUSTOMER_TRANSFER, PERMISSION_KEYS.CUSTOMER_RELEASE_TO_POOL],
  '旧分配能力必须同时迁移为转移和释放至公海',
);
assert.deepEqual(
  customerHarness.role('role-legacy-editor').permissions
    .filter((permission: any) => [
      PERMISSION_KEYS.CUSTOMER_EDIT_PROFILE,
      PERMISSION_KEYS.CUSTOMER_SET_TAGS,
      PERMISSION_KEYS.CUSTOMER_SET_TODOS,
      PERMISSION_KEYS.CUSTOMER_EDIT_ATTRIBUTION,
    ].includes(permission.module))
    .map((permission: any) => permission.module),
  [
    PERMISSION_KEYS.CUSTOMER_EDIT_PROFILE,
    PERMISSION_KEYS.CUSTOMER_SET_TAGS,
    PERMISSION_KEYS.CUSTOMER_SET_TODOS,
    PERMISSION_KEYS.CUSTOMER_EDIT_ATTRIBUTION,
  ],
  '旧编辑能力只迁移出资料、标签、待办和归属',
);
assert.equal(
  customerHarness.role('role-legacy-editor').permissions.some((permission: any) => permission.module === PERMISSION_KEYS.CUSTOMER_SET_PROGRESS),
  false,
  '旧编辑能力绝不能隐式获得进展修改权限',
);
assert.equal(
  customerHarness.role('role-legacy-read-only-editor').permissions.some((permission: any) => [
    PERMISSION_KEYS.CUSTOMER_EDIT_PROFILE,
    PERMISSION_KEYS.CUSTOMER_SET_TAGS,
    PERMISSION_KEYS.CUSTOMER_SET_TODOS,
    PERMISSION_KEYS.CUSTOMER_EDIT_ATTRIBUTION,
  ].includes(permission.module)),
  false,
  '旧 CUSTOMER_EDIT/read 不具备有效写能力，不得扩成四个 write leaf',
);
assert.equal(
  customerHarness.role('role-captured-deleter').permissions.some((permission: any) => permission.module === PERMISSION_KEYS.CUSTOMER_DELETE),
  true,
  '只有 manifest 捕获的不可变角色 ID 才能获得删除权限',
);
assert.equal(
  roleHasPermission(
    mapPrismaRole(customerHarness.role('role-captured-deleter')),
    PERMISSION_KEYS.CUSTOMER_DELETE,
    'delete',
  ),
  true,
  'manifest 角色迁移出的显式 CUSTOMER_DELETE 必须成为实际删除授权',
);
assert.equal(
  roleHasPermission(
    mapPrismaRole(customerHarness.role('role-unproven-all-delete')),
    PERMISSION_KEYS.CUSTOMER_DELETE,
    'delete',
  ),
  false,
  '非 manifest 的 全部/delete 在 Task 3 接入显式叶子后仍不得恢复客户删除能力',
);
assert.equal(
  customerHarness.role('role-unproven-preexisting-delete').permissions.some((permission: any) => permission.module === PERMISSION_KEYS.CUSTOMER_DELETE),
  false,
  '不在 manifest 证明集中的预存 CUSTOMER_DELETE 必须清除',
);
assert.equal(
  customerHarness.role('role-unproven-preexisting-delete').permissions.some((permission: any) => (
    String(permission.module).replace(/\s+/g, '') === PERMISSION_KEYS.CUSTOMER_DELETE
  )),
  false,
  '非证明集删除叶子的空白变体也必须清除',
);
assert.equal(
  customerHarness.role('role-name-must-not-grant-delete').permissions.some((permission: any) => permission.module === PERMISSION_KEYS.CUSTOMER_DELETE),
  false,
  '运行时迁移不得根据角色名称或编码推断删除权限',
);
assert.equal(
  customerHarness.role('role-parent-without-read').permissions.some((permission: any) => [
    PERMISSION_KEYS.CUSTOMER_LIST,
    PERMISSION_KEYS.CUSTOMER_DETAIL,
  ].includes(permission.module)),
  false,
  '旧客户父节点只有显式 read 才能展开；write/delete/admin 不能暗中当成 read',
);
assert.equal((customerHarness.marker() as any).version, CUSTOMER_PERMISSION_SCOPE_BASELINE_VERSION);

const secondCustomerMigration = await migrateCustomerPermissionAndScopeBaseline(customerHarness.prisma as any, manifestAuthenticator);
assert.deepEqual(secondCustomerMigration.migratedRoleIds, [], 'marker 后二次运行必须零变更');
const updateCountAfterMarker = customerHarness.roleUpdates.length;
customerHarness.setRole('role-legacy-editor', (role) => ({
  ...role,
  permissions: role.permissions.filter((permission: any) => permission.module !== PERMISSION_KEYS.CUSTOMER_SET_TAGS),
}));
const postAdminCustomerMigration = await migrateCustomerPermissionAndScopeBaseline(customerHarness.prisma as any, manifestAuthenticator);
assert.deepEqual(postAdminCustomerMigration.migratedRoleIds, []);
assert.equal(customerHarness.roleUpdates.length, updateCountAfterMarker, 'marker 后不得再写角色');
assert.equal(
  customerHarness.role('role-legacy-editor').permissions.some((permission: any) => permission.module === PERMISSION_KEYS.CUSTOMER_SET_TAGS),
  false,
  '管理员在 marker 后移除的权限不得被恢复',
);

const missingManifestHarness = customerMigrationHarness(legacyCustomerRoles);
await assert.rejects(
  () => migrateCustomerPermissionAndScopeBaseline(missingManifestHarness.prisma as any, manifestAuthenticator),
  /CUSTOMER_PERMISSION_MIGRATION_MANIFEST_REQUIRED/,
  'manifest 缺失必须阻止启动迁移',
);
assert.equal(missingManifestHarness.roleUpdates.length, 0);

const invalidChecksumManifest = { ...customerManifest, checksum: '0'.repeat(64) };
const invalidChecksumHarness = customerMigrationHarness(legacyCustomerRoles, invalidChecksumManifest);
await assert.rejects(
  () => migrateCustomerPermissionAndScopeBaseline(invalidChecksumHarness.prisma as any, manifestAuthenticator),
  /CUSTOMER_PERMISSION_MIGRATION_MANIFEST_CHECKSUM_INVALID/,
  'checksum 不匹配必须 fail closed',
);
assert.equal(invalidChecksumHarness.roleUpdates.length, 0);

const invalidMarkerHarness = customerMigrationHarness(legacyCustomerRoles, customerManifest);
invalidMarkerHarness.setStored(CUSTOMER_PERMISSION_SCOPE_BASELINE_KEY, '1');
await assert.rejects(
  () => migrateCustomerPermissionAndScopeBaseline(invalidMarkerHarness.prisma as any, manifestAuthenticator),
  /CUSTOMER_PERMISSION_MIGRATION_MARKER_INVALID/,
  'baseline marker 必须是带整数 version 的 Prisma JSON object',
);
assert.equal(invalidMarkerHarness.roleUpdates.length, 0);

const staleRoles = clone(legacyCustomerRoles);
staleRoles[0].permissions.push({ module: PERMISSION_KEYS.CUSTOMER_CREATE, actions: ['read', 'write'] });
const staleManifestHarness = customerMigrationHarness(staleRoles, customerManifest);
await assert.rejects(
  () => migrateCustomerPermissionAndScopeBaseline(staleManifestHarness.prisma as any, manifestAuthenticator),
  /CUSTOMER_PERMISSION_MIGRATION_MANIFEST_STALE/,
  '当前角色数据 hash 与捕获时不一致必须 fail closed',
);
assert.equal(staleManifestHarness.roleUpdates.length, 0);

const unknownRoleManifestBase = {
  ...customerManifest,
  deleteRoleIds: [...customerManifest.deleteRoleIds, 'role-no-longer-exists'],
};
const unknownRoleManifest = {
  ...unknownRoleManifestBase,
  checksum: computeCustomerPermissionMigrationManifestChecksum(unknownRoleManifestBase),
  signature: manifestAuthenticator.sign(
    computeCustomerPermissionMigrationManifestChecksum(unknownRoleManifestBase),
  ),
};
const unknownRoleHarness = customerMigrationHarness(legacyCustomerRoles, unknownRoleManifest);
await assert.rejects(
  () => migrateCustomerPermissionAndScopeBaseline(unknownRoleHarness.prisma as any, manifestAuthenticator),
  /CUSTOMER_PERMISSION_MIGRATION_MANIFEST_UNKNOWN_ROLE_ID/,
  'manifest 中的未知不可变角色 ID 必须 fail closed',
);
assert.equal(unknownRoleHarness.roleUpdates.length, 0);

const duplicateRoleManifestBase = {
  ...customerManifest,
  deleteRoleIds: [...customerManifest.deleteRoleIds, customerManifest.deleteRoleIds[0]],
};
const duplicateRoleManifest = {
  ...duplicateRoleManifestBase,
  checksum: computeCustomerPermissionMigrationManifestChecksum(duplicateRoleManifestBase),
  signature: manifestAuthenticator.sign(
    computeCustomerPermissionMigrationManifestChecksum(duplicateRoleManifestBase),
  ),
};
const duplicateRoleHarness = customerMigrationHarness(legacyCustomerRoles, duplicateRoleManifest);
await assert.rejects(
  () => migrateCustomerPermissionAndScopeBaseline(duplicateRoleHarness.prisma as any, manifestAuthenticator),
  /CUSTOMER_PERMISSION_MIGRATION_MANIFEST_DUPLICATE_ROLE_ID/,
  '重复 role ID 即使重算 checksum 也必须在任何角色写入前失败',
);
assert.equal(duplicateRoleHarness.roleUpdates.length, 0);

const expiredManifestBase = { ...customerManifest, version: 0 };
const expiredManifest = {
  ...expiredManifestBase,
  checksum: computeCustomerPermissionMigrationManifestChecksum(expiredManifestBase),
  signature: manifestAuthenticator.sign(
    computeCustomerPermissionMigrationManifestChecksum(expiredManifestBase),
  ),
};
await assert.rejects(
  () => migrateCustomerPermissionAndScopeBaseline(
    customerMigrationHarness(legacyCustomerRoles, expiredManifest).prisma as any,
    manifestAuthenticator,
  ),
  /CUSTOMER_PERMISSION_MIGRATION_MANIFEST_STALE/,
  '旧版本 manifest 必须 fail closed',
);

const extraKnownRoleManifestBase = {
  ...customerManifest,
  deleteRoleIds: [...customerManifest.deleteRoleIds, 'role-legacy-editor'].sort(),
};
const extraKnownRoleManifest = {
  ...extraKnownRoleManifestBase,
  checksum: computeCustomerPermissionMigrationManifestChecksum(extraKnownRoleManifestBase),
};
assert.throws(
  () => validateCustomerPermissionMigrationManifest(
    extraKnownRoleManifest as any,
    legacyCustomerRoleModels,
    manifestAuthenticator,
  ),
  /CUSTOMER_PERMISSION_MIGRATION_MANIFEST_SIGNATURE_INVALID/,
  '额外已知 role ID 即使重算普通 checksum，也不能伪造 capture 签名',
);

const tamperedGeneratedAtManifestBase = {
  ...customerManifest,
  generatedAt: '2026-07-17T02:00:00.000Z',
};
const tamperedGeneratedAtManifest = {
  ...tamperedGeneratedAtManifestBase,
  checksum: computeCustomerPermissionMigrationManifestChecksum(tamperedGeneratedAtManifestBase),
};
assert.throws(
  () => validateCustomerPermissionMigrationManifest(
    tamperedGeneratedAtManifest as any,
    legacyCustomerRoleModels,
    manifestAuthenticator,
  ),
  /CUSTOMER_PERMISSION_MIGRATION_MANIFEST_SIGNATURE_INVALID/,
  'generatedAt 被改写并重算普通 checksum 后仍必须因 HMAC 签名失效而拒绝',
);
assert.throws(
  () => validateCustomerPermissionMigrationManifest(
    { ...customerManifest, signature: undefined } as any,
    legacyCustomerRoleModels,
    manifestAuthenticator,
  ),
  /CUSTOMER_PERMISSION_MIGRATION_MANIFEST_SIGNATURE_INVALID/,
  '签名缺失必须 fail closed',
);
const wrongManifestAuthenticator = createCustomerPermissionMigrationManifestAuthenticator(
  'wrong-task-2-test-manifest-signing-key-32-bytes-minimum',
);
assert.throws(
  () => validateCustomerPermissionMigrationManifest(
    customerManifest as any,
    legacyCustomerRoleModels,
    wrongManifestAuthenticator,
  ),
  /CUSTOMER_PERMISSION_MIGRATION_MANIFEST_SIGNATURE_INVALID/,
  '错误发布密钥必须 fail closed',
);

assert.throws(
  () => assertCustomerPermissionMigrationPrerequisites({ version: ROLE_PERMISSION_ACTION_BASELINE_VERSION - 1 } as any),
  /CUSTOMER_PERMISSION_MIGRATION_ROLE_BASELINE_REQUIRED/,
  '旧权限基线未到 v4 时不得捕获或应用 manifest',
);
assert.doesNotThrow(
  () => assertCustomerPermissionMigrationPrerequisites({ version: ROLE_PERMISSION_ACTION_BASELINE_VERSION } as any),
);
const missingRoleBaselineHarness = customerMigrationHarness(
  legacyCustomerRoles,
  customerManifest,
  { roleBaselineVersion: null },
);
await assert.rejects(
  () => migrateCustomerPermissionAndScopeBaseline(missingRoleBaselineHarness.prisma as any, manifestAuthenticator),
  /CUSTOMER_PERMISSION_MIGRATION_ROLE_BASELINE_REQUIRED/,
);
assert.equal(missingRoleBaselineHarness.roleUpdates.length, 0);

const rollbackRoles = legacyCustomerRoles.slice(0, 3);
const rollbackManifest = createCustomerPermissionMigrationManifest(
  rollbackRoles.map(mapPrismaRole),
  [],
  manifestAuthenticator,
  '2026-07-17T01:30:00.000Z',
);
const rollbackHarness = customerMigrationHarness(rollbackRoles, rollbackManifest);
const rollbackBefore = rollbackRoles.map((role) => clone(role));
rollbackHarness.failRoleUpdate('role-legacy-assigner');
await assert.rejects(
  () => migrateCustomerPermissionAndScopeBaseline(rollbackHarness.prisma as any, manifestAuthenticator),
  (error: unknown) => {
    assert.equal(
      (error as Error).message,
      'CUSTOMER_PERMISSION_MIGRATION_FAILED',
      '数据库或旧 pod 抛出的任意详情必须压缩成固定迁移错误码',
    );
    assert.doesNotMatch((error as Error).message, /role-legacy-assigner/);
    return true;
  },
);
assert.deepEqual(
  rollbackRoles.map((role) => rollbackHarness.role(role.id)),
  rollbackBefore,
  '事务中任一角色更新失败必须回滚此前角色变更',
);
assert.equal(rollbackHarness.marker(), undefined, '事务失败不得留下 baseline marker');

const conflictHarness = customerMigrationHarness(rollbackRoles, rollbackManifest);
const conflictBefore = rollbackRoles.map((role) => clone(role));
conflictHarness.conflictRoleUpdate('role-legacy-assigner');
await assert.rejects(
  () => migrateCustomerPermissionAndScopeBaseline(conflictHarness.prisma as any, manifestAuthenticator),
  /CUSTOMER_PERMISSION_MIGRATION_ROLE_CONFLICT/,
  'hash 后若旧 pod 或管理员改了 Role.updatedAt，CAS 必须中止整笔迁移',
);
assert.deepEqual(
  rollbackRoles.map((role) => conflictHarness.role(role.id)),
  conflictBefore,
  '并发角色更新冲突必须回滚此前迁移写入',
);
assert.equal(conflictHarness.marker(), undefined);

const concurrentFullSetRoles = [
  migrationRole('role-concurrent-editor', [
    { module: PERMISSION_KEYS.CUSTOMER_EDIT, actions: ['read', 'write'] },
  ]),
  migrationRole('role-concurrent-stable', []),
];
const concurrentFullSetManifest = createCustomerPermissionMigrationManifest(
  concurrentFullSetRoles.map(mapPrismaRole),
  [],
  manifestAuthenticator,
  '2026-07-17T01:45:00.000Z',
);
const concurrentStableEditHarness = customerMigrationHarness(
  concurrentFullSetRoles,
  concurrentFullSetManifest,
);
concurrentStableEditHarness.mutateBeforeFinalRoleRead((roles) => roles.map((role) => (
  role.id === 'role-concurrent-stable'
    ? {
        ...role,
        permissions: [{ module: PERMISSION_KEYS.CUSTOMER_DELETE, actions: ['read', 'delete'] }],
        updatedAt: new Date('2026-07-17T02:00:00.000Z'),
      }
    : role
)));
await assert.rejects(
  () => migrateCustomerPermissionAndScopeBaseline(
    concurrentStableEditHarness.prisma as any,
    manifestAuthenticator,
  ),
  /CUSTOMER_PERMISSION_MIGRATION_CONCURRENT_ROLE_CHANGE/,
  'hash 后无需迁移的角色若被并发加入 CUSTOMER_DELETE，完整角色集复核必须中止',
);
assert.equal(concurrentStableEditHarness.marker(), undefined);
assert.deepEqual(
  concurrentStableEditHarness.role('role-concurrent-editor').permissions,
  concurrentFullSetRoles[0].permissions,
  '完整角色集冲突必须回滚此前已迁移角色，不能留下部分更新',
);
assert.deepEqual(
  concurrentStableEditHarness.transactionOptions,
  [{ isolationLevel: 'Serializable' }],
  '客户权限迁移必须使用 Prisma Serializable callback transaction',
);

const concurrentInsertHarness = customerMigrationHarness(
  concurrentFullSetRoles,
  concurrentFullSetManifest,
);
concurrentInsertHarness.mutateBeforeFinalRoleRead((roles) => [
  ...roles,
  migrationRole('role-concurrent-insert', [
    { module: PERMISSION_KEYS.CUSTOMER_DELETE, actions: ['read', 'delete'] },
  ], { customers: 'all' }, { updatedAt: new Date('2026-07-17T02:01:00.000Z') }),
]);
await assert.rejects(
  () => migrateCustomerPermissionAndScopeBaseline(
    concurrentInsertHarness.prisma as any,
    manifestAuthenticator,
  ),
  /CUSTOMER_PERMISSION_MIGRATION_CONCURRENT_ROLE_CHANGE/,
  'hash 后并发新增角色属于 phantom change，必须整事务失败',
);
assert.equal(concurrentInsertHarness.marker(), undefined);
assert.deepEqual(
  concurrentInsertHarness.role('role-concurrent-editor').permissions,
  concurrentFullSetRoles[0].permissions,
);

const sensitiveMigrationRoleId = 'role-sensitive-do-not-log';
assert.equal(
  toSafeCustomerPermissionMigrationErrorCode(
    new Error(`CUSTOMER_PERMISSION_MIGRATION_ROLE_CONFLICT:${sensitiveMigrationRoleId}`),
  ),
  'CUSTOMER_PERMISSION_MIGRATION_FAILED',
);
assert.doesNotMatch(
  toSafeCustomerPermissionMigrationErrorCode(new Error(`database payload ${sensitiveMigrationRoleId}`)),
  new RegExp(sensitiveMigrationRoleId),
  '启动日志格式化不得泄露 role ID 或数据库 payload',
);

const legacyDeleteCaptureRoles = [
  migrationRole('role-super-admin', [], { customers: 'all' }, { name: '已改名管理员', code: 'renamed-admin' }),
  migrationRole('role-code-admin', [], { customers: 'all' }, { code: 'super_admin' }),
  migrationRole('role-name-admin', [], { customers: 'all' }, { name: '超级管理员' }),
  migrationRole('role-all-admin', [{ module: '全部', actions: ['read', 'write', 'delete', 'admin'] }]),
  migrationRole('role-spaced-all-admin', [{ module: ' 全 部 ', actions: ['admin'] }]),
  migrationRole('role-all-delete-only', [{ module: '全部', actions: ['delete'] }]),
  migrationRole('role-disabled-admin', [{ module: '全部', actions: ['admin'] }], { customers: 'all' }, { isActive: false }),
  migrationRole('role-ordinary', [{ module: PERMISSION_KEYS.CUSTOMERS, actions: ['delete'] }]),
].map(mapPrismaRole);
const legacyDeleteScopeNegativeRoles = [
  migrationRole('role-super-admin', [], { customers: 'self' }, {
    name: '已改名管理员',
    code: 'renamed-admin',
  }),
  migrationRole('role-name-admin-self', [], { customers: 'self' }, {
    name: '超级管理员',
    code: 'ordinary-name-match',
  }),
].map(mapPrismaRole);
assert.deepEqual(
  captureLegacyCustomerDeleteRoleIds(legacyDeleteScopeNegativeRoles),
  [],
  '旧授权入口匹配但 raw customer scope 仍为 self 的默认 ID/name-only 角色，真实旧命令无法删除，不得捕获',
);
assert.deepEqual(
  captureLegacyCustomerDeleteRoleIds(legacyDeleteCaptureRoles),
  ['role-all-admin', 'role-code-admin', 'role-name-admin', 'role-spaced-all-admin', 'role-super-admin'],
  '预发布捕获适配器只输出旧路径真正能删除客户的不可变角色 ID',
);
assert.equal(
  captureLegacyCustomerDeleteRoleIds(legacyDeleteCaptureRoles).includes('role-all-delete-only'),
  false,
  '旧路由 middleware 虽接受 全部/delete，但命令服务 isSuperAdmin 仍拒绝，不能算实际有效删除能力',
);
for (const roleId of ['role-code-admin', 'role-name-admin']) {
  const role = legacyDeleteCaptureRoles.find((candidate) => candidate.id === roleId)!;
  assert.equal(
    mergeRoleWithDefaultAccess(role).permissions.some((permission) => permission.module === '全部'),
    false,
    '冻结捕获可识别旧 name/code 行为，但普通运行时默认合并不得再据此赋予全部权限',
  );
}
assert.equal(
  mergeRoleWithDefaultAccess(legacyDeleteCaptureRoles.find((role) => role.id === 'role-super-admin')!)
    .permissions.some((permission) => permission.module === '全部'),
  true,
  '默认超级管理员只按不可变默认角色 ID 保留全部权限',
);

const preparationStorage = new Map<string, unknown>([[
  ROLE_PERMISSION_ACTION_BASELINE_KEY,
  { version: ROLE_PERMISSION_ACTION_BASELINE_VERSION },
]]);
assert.deepEqual(
  parseCustomerPermissionMigrationCliArgs(['capture', '--out', 'private_reports/customer-permission-v1.json']),
  { command: 'capture', filePath: 'private_reports/customer-permission-v1.json' },
);
assert.deepEqual(
  parseCustomerPermissionMigrationCliArgs(['apply-manifest', '--file', 'private_reports/customer-permission-v1.json']),
  { command: 'apply-manifest', filePath: 'private_reports/customer-permission-v1.json' },
);
assert.deepEqual(
  parseCustomerPermissionMigrationCliArgs(['apply-manifest', 'manifest.json']),
  { command: 'apply-manifest', filePath: 'manifest.json' },
  '保留 positional 输入兼容',
);
assert.throws(
  () => parseCustomerPermissionMigrationCliArgs(['capture', '--file', 'manifest.json']),
  /CUSTOMER_PERMISSION_MIGRATION_CLI_ARGUMENTS_INVALID/,
);
await assert.rejects(
  () => captureCustomerPermissionMigrationManifest({
    role: {
      findMany: async () => {
        throw new Error('database payload role-sensitive-do-not-log');
      },
    },
    appStorage: {
      findUnique: async (input: any) => (
        input.where.key === ROLE_PERMISSION_ACTION_BASELINE_KEY
          ? { key: input.where.key, value: { version: ROLE_PERMISSION_ACTION_BASELINE_VERSION } }
          : null
      ),
    },
  } as any, manifestAuthenticator),
  (error: unknown) => {
    assert.equal((error as Error).message, 'CUSTOMER_PERMISSION_MIGRATION_FAILED');
    assert.doesNotMatch((error as Error).message, /role-sensitive-do-not-log/);
    return true;
  },
  'CLI capture 核心也不得把数据库 payload 或角色 ID 暴露给调用方',
);
const preparationWrites: any[] = [];
const preparationStore = {
  role: {
    findMany: async () => clone(legacyDeleteCaptureRoles),
  },
  appStorage: {
    findUnique: async (input: any) => preparationStorage.has(input.where.key)
      ? { key: input.where.key, value: clone(preparationStorage.get(input.where.key)) }
      : null,
    upsert: async (input: any) => {
      preparationWrites.push(clone(input));
      const value = preparationStorage.has(input.where.key) ? input.update.value : input.create.value;
      preparationStorage.set(input.where.key, clone(value));
      return { key: input.where.key, value: clone(value) };
    },
    create: async (input: any) => {
      if (preparationStorage.has(input.data.key)) throw new Error('UNIQUE_CONSTRAINT');
      preparationWrites.push(clone(input));
      preparationStorage.set(input.data.key, clone(input.data.value));
      return { key: input.data.key, value: clone(input.data.value) };
    },
  },
};
preparationStorage.set(ROLE_PERMISSION_ACTION_BASELINE_KEY, {
  version: ROLE_PERMISSION_ACTION_BASELINE_VERSION - 1,
});
await assert.rejects(
  () => captureCustomerPermissionMigrationManifest(preparationStore as any, manifestAuthenticator),
  /CUSTOMER_PERMISSION_MIGRATION_ROLE_BASELINE_REQUIRED/,
  '旧 baseline 可能改写 Role 行，未到 v4 时 capture 必须先停止而不能生成立刻过期的 hash',
);
preparationStorage.set(ROLE_PERMISSION_ACTION_BASELINE_KEY, {
  version: ROLE_PERMISSION_ACTION_BASELINE_VERSION,
});
const capturedByCliCore = await captureCustomerPermissionMigrationManifest(
  preparationStore as any,
  manifestAuthenticator,
  '2026-07-17T02:00:00.000Z',
);
assert.deepEqual(
  capturedByCliCore.deleteRoleIds,
  ['role-all-admin', 'role-code-admin', 'role-name-admin', 'role-spaced-all-admin', 'role-super-admin'],
);
const appliedByCliCore = await applyCustomerPermissionMigrationManifest(
  preparationStore as any,
  capturedByCliCore as any,
  manifestAuthenticator,
);
assert.deepEqual(appliedByCliCore, {
  version: CUSTOMER_PERMISSION_SCOPE_BASELINE_VERSION,
  roleCount: legacyDeleteCaptureRoles.length,
  deleteRoleCount: 5,
});
assert.deepEqual(
  preparationStorage.get(CUSTOMER_PERMISSION_SCOPE_MIGRATION_MANIFEST_KEY),
  capturedByCliCore,
  'apply-manifest 必须把 manifest 作为 Prisma JSON object 直接保存',
);
assert.equal(preparationWrites.length, 1);
await applyCustomerPermissionMigrationManifest(
  preparationStore as any,
  capturedByCliCore as any,
  manifestAuthenticator,
);
assert.equal(preparationWrites.length, 1, '完全相同的 manifest 可幂等 apply，但不得改写不可变审计证据');
await assert.rejects(
  () => captureCustomerPermissionMigrationManifest(preparationStore as any, manifestAuthenticator),
  /CUSTOMER_PERMISSION_MIGRATION_MANIFEST_ALREADY_STORED/,
  'manifest 存储后不得重新 capture 覆盖审计证据',
);

const injectedKnownRoleManifestBase = {
  ...capturedByCliCore,
  deleteRoleIds: [...capturedByCliCore.deleteRoleIds, 'role-ordinary'].sort(),
};
const injectedKnownRoleManifest = {
  ...injectedKnownRoleManifestBase,
  checksum: computeCustomerPermissionMigrationManifestChecksum(injectedKnownRoleManifestBase),
};
await assert.rejects(
  () => applyCustomerPermissionMigrationManifest(
    preparationStore as any,
    injectedKnownRoleManifest as any,
    manifestAuthenticator,
  ),
  /CUSTOMER_PERMISSION_MIGRATION_MANIFEST_SIGNATURE_INVALID/,
  'CLI apply 只验证签名证据，不得重跑旧 name/code 谓词；夹带角色无法伪造签名',
);
assert.equal(preparationWrites.length, 1, 'CLI manifest 校验失败不得写 appStorage');
preparationStorage.set(CUSTOMER_PERMISSION_SCOPE_BASELINE_KEY, {
  version: CUSTOMER_PERMISSION_SCOPE_BASELINE_VERSION,
});
await assert.rejects(
  () => applyCustomerPermissionMigrationManifest(
    preparationStore as any,
    capturedByCliCore as any,
    manifestAuthenticator,
  ),
  /CUSTOMER_PERMISSION_MIGRATION_ALREADY_APPLIED/,
  'baseline marker 后不得再次 capture/apply',
);
preparationStorage.delete(CUSTOMER_PERMISSION_SCOPE_BASELINE_KEY);

const serverSource = await readFile(new URL('../index.ts', import.meta.url), 'utf8');
const envExampleSource = await readFile(new URL('../../.env.example', import.meta.url), 'utf8');
const defaultRoleMigrationIndex = serverSource.indexOf('await migrateDefaultRoleAccess(prisma)');
const customerRoleMigrationIndex = serverSource.indexOf(
  'await migrateCustomerPermissionAndScopeBaseline(prisma, manifestAuthenticator)',
);
const httpListenIndex = serverSource.indexOf('app.listen(port, host');
assert.ok(defaultRoleMigrationIndex >= 0 && customerRoleMigrationIndex > defaultRoleMigrationIndex);
assert.ok(httpListenIndex > customerRoleMigrationIndex, '客户权限迁移必须在 HTTP 监听前顺序完成');
assert.match(serverSource, /migratedRoleIds\.length/);
assert.doesNotMatch(serverSource, /JSON\.stringify\(customerPermissionMigration/);
assert.match(serverSource, /toSafeCustomerPermissionMigrationErrorCode\(error\)/);
assert.match(
  envExampleSource,
  /^CUSTOMER_PERMISSION_MIGRATION_SIGNING_KEY=""$/m,
  '部署示例必须明确声明 server-only manifest HMAC 环境键',
);
const runtimeStorageStart = serverSource.indexOf('const runtimeStorageKeys = [');
const runtimeStorageEnd = serverSource.indexOf('];', runtimeStorageStart);
const runtimeStorageSource = serverSource.slice(runtimeStorageStart, runtimeStorageEnd);
assert.match(
  runtimeStorageSource,
  /STORAGE_KEYS\.ROLES\b/,
  'runtime hydration 必须显式刷新既有浏览器 aaos_roles cache',
);
assert.match(
  serverSource,
  /key === STORAGE_KEYS\.ROLES[\s\S]*prisma\.role\.findMany[\s\S]*rows\.map\(mapPrismaRole\)/,
  'aaos_roles 客户端缓存必须由 Prisma Role 权威表刷新，不得再读取 appStorage 镜像',
);

const preparationScriptSource = await readFile(
  new URL('../../scripts/prepare-customer-permission-migration.ts', import.meta.url),
  'utf8',
);
assert.match(preparationScriptSource, /captureLegacyCustomerDeleteRoleIds/);
assert.match(preparationScriptSource, /assertCustomerPermissionMigrationPrerequisites/);
assert.match(preparationScriptSource, /createCustomerPermissionMigrationManifestAuthenticatorFromEnv\(process\.env\)/);
assert.match(preparationScriptSource, /capture/);
assert.match(preparationScriptSource, /apply-manifest/);
const captureCoreSource = preparationScriptSource.slice(
  preparationScriptSource.indexOf('export async function captureCustomerPermissionMigrationManifest'),
  preparationScriptSource.indexOf('export async function applyCustomerPermissionMigrationManifest'),
);
const applyCoreSource = preparationScriptSource.slice(
  preparationScriptSource.indexOf('export async function applyCustomerPermissionMigrationManifest'),
  preparationScriptSource.indexOf('async function capture('),
);
assert.match(captureCoreSource, /captureLegacyCustomerDeleteRoleIds/);
assert.doesNotMatch(
  applyCoreSource,
  /captureLegacyCustomerDeleteRoleIds|role\.(?:name|code)/,
  'apply 只能验证 capture 签名证据，不得再次执行旧 name/code 谓词',
);
assert.doesNotMatch(preparationScriptSource, /role\.(?:name|code)/, 'CLI 只能调用隔离的旧行为捕获适配器，不得自行推断角色名称或编码');
