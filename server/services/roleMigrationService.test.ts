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
