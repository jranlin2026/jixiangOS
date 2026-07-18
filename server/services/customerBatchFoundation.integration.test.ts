import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prisma } from '../db/client';
import { normalizeCustomerBatchSelection } from './customerBatchService';
import { verifyCustomerBatchFoundation } from '../../scripts/verify-customer-batch-foundation';
import {
  PERMISSION_KEYS,
  roleHasPermission,
  sanitizeRolePermissions,
} from '../../src/shared/utils/permissions';
import type { Role } from '../../src/types/role';

const sensitivePermissions = [
  [PERMISSION_KEYS.CUSTOMER_SET_PROGRESS, 'write'],
  [PERMISSION_KEYS.CUSTOMER_TRANSFER, 'write'],
  [PERMISSION_KEYS.CUSTOMER_BATCH_MANAGE, 'write'],
  [PERMISSION_KEYS.CUSTOMER_DELETE, 'delete'],
  [PERMISSION_KEYS.CUSTOMER_IMPORT, 'write'],
  [PERMISSION_KEYS.CUSTOMER_EXPORT, 'write'],
  [PERMISSION_KEYS.CUSTOMER_MERGE, 'write'],
  [PERMISSION_KEYS.CUSTOMER_BATCH_CANCEL, 'write'],
] as const;

const roleWithParent = (action: 'read' | 'write' | 'delete' | 'admin', normalized = false): Role => ({
  id: `legacy-${action}${normalized ? '-normalized' : ''}`,
  name: `legacy-${action}`,
  code: `legacy-${action}`,
  permissions: normalized
    ? sanitizeRolePermissions([{ module: PERMISSION_KEYS.CUSTOMERS, actions: [action] }])
    : [{ module: PERMISSION_KEYS.CUSTOMERS, actions: [action] }],
  dataScopes: { customers: 'self' },
  memberCount: 0,
  isActive: true,
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T00:00:00.000Z',
});

for (const action of ['read', 'write', 'delete', 'admin'] as const) {
  for (const normalized of [false, true]) {
    const role = roleWithParent(action, normalized);
    assert.equal(roleHasPermission(role, PERMISSION_KEYS.CUSTOMER_LIST, 'read'), action === 'read');
    assert.equal(roleHasPermission(role, PERMISSION_KEYS.CUSTOMER_DETAIL, 'read'), action === 'read');
    for (const [permissionKey, permissionAction] of sensitivePermissions) {
      assert.equal(
        roleHasPermission(role, permissionKey, permissionAction),
        false,
        `${action} 父权限不得授予 ${permissionKey}`,
      );
    }
  }
}

const explicitTransfer: Role = {
  ...roleWithParent('read'),
  id: 'explicit-transfer',
  permissions: [
    { module: PERMISSION_KEYS.CUSTOMERS, actions: ['read'] },
    { module: PERMISSION_KEYS.CUSTOMER_BATCH_MANAGE, actions: ['write'] },
    { module: PERMISSION_KEYS.CUSTOMER_TRANSFER, actions: ['write'] },
  ],
};
assert.equal(roleHasPermission(explicitTransfer, PERMISSION_KEYS.CUSTOMER_BATCH_MANAGE, 'write'), true);
assert.equal(roleHasPermission(explicitTransfer, PERMISSION_KEYS.CUSTOMER_TRANSFER, 'write'), true);

const boundarySelection = normalizeCustomerBatchSelection({
  mode: 'ids',
  customerIds: Array.from({ length: 10_000 }, (_, index) => `c-${index}`),
});
assert.equal(boundarySelection.mode, 'ids');
assert.equal(boundarySelection.mode === 'ids' ? boundarySelection.customerIds.length : 0, 10_000);
assert.throws(
  () => normalizeCustomerBatchSelection({ mode: 'ids', customerIds: Array.from({ length: 10_001 }, (_, index) => `c-${index}`) }),
  /最多处理 10,000 个客户/,
);

const migration = readFileSync(new URL('../../prisma/migrations/20260717090000_customer_batch_foundation/migration.sql', import.meta.url), 'utf8');
assert.match(migration, /customer_batch_jobs_actorId_handlerKey_operation_idempotency_key/);
assert.match(migration, /customer_batch_job_item_target_unique/);
assert.match(migration, /CHECK \(CHAR_LENGTH\(TRIM\(`targetKey`\)\) > 0\)/);

if (process.env.DATABASE_URL) {
  const live = await verifyCustomerBatchFoundation(prisma);
  assert.equal(live.schemaReady, true);
  assert.equal(live.idempotencyUnique, true);
  assert.equal(live.leaseRecovery, true);
  assert.equal(live.staleLeaseFenced, true);
  assert.equal(live.cancellation, true);
  assert.equal(live.cleanedUp, true);
  await prisma.$disconnect();
} else {
  console.info('customer batch live database verification skipped: DATABASE_URL is not set');
}

console.log('customer batch foundation integration tests passed');
