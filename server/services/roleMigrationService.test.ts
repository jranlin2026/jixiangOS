import assert from 'node:assert/strict';
import { migrateDefaultRoleAccess } from './roleMigrationService';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';

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

let markerValue: unknown;
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
    findUnique: async () => markerValue ? ({ key: 'marker', value: markerValue }) : null,
    upsert: async (input: any) => {
      markerWrites.push(input);
      markerValue = input.create.value;
      return { key: input.where.key, value: markerValue };
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
assert.equal(customRoleUpdates.length, 0);
assert.equal(
  customReadOnlyRole.permissions.some((permission: any) => permission.module === PERMISSION_KEYS.CUSTOMER_PUBLIC_POOL_CLAIM),
  false,
  '自定义角色不得自动获得公海领取权限',
);
