import assert from 'node:assert/strict';
import { createBusinessImportReviewSelector } from './businessImportPersistence';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';

const records = [
  { domain: STORAGE_KEYS.ORDER_APPLICATIONS, recordId: 'pending-imported', data: { importBatchId: 'batch-1', status: '待财务审核' } },
  { domain: STORAGE_KEYS.ORDER_APPLICATIONS, recordId: 'returned-imported', data: { importBatchId: 'batch-1', status: '退回修改' } },
  { domain: STORAGE_KEYS.ORDER_APPLICATIONS, recordId: 'manual-pending', data: { status: '待财务审核' } },
  { domain: STORAGE_KEYS.RECOVERY_ORDERS, recordId: 'recovery-pending', data: { importBatchId: 'batch-1', status: '待审核' } },
  { domain: STORAGE_KEYS.RECOVERY_ORDERS, recordId: 'recovery-approved', data: { importBatchId: 'batch-1', status: '待分账' } },
];
const prisma = {
  businessRecord: {
    findMany: async ({ where }: any) => records.filter((record) => (
      record.domain === where.domain
      && (!where.recordId?.in || where.recordId.in.includes(record.recordId))
    )),
  },
} as any;
const select = createBusinessImportReviewSelector(prisma);
const actor = { id: 'reviewer' } as any;

assert.deepEqual(
  await select({ module: 'orders', action: 'approve', importBatchId: 'batch-1' }, actor),
  [{ id: 'pending-imported', module: 'orders' }],
  'full-batch selection only expands imported pending applications',
);
assert.deepEqual(
  await select({ module: 'recovery_orders', action: 'approve', importBatchId: 'batch-1' }, actor),
  [{ id: 'recovery-pending', module: 'recovery_orders' }],
  'full-batch selection only expands imported pending recovery records',
);
assert.deepEqual(
  await select({ module: 'orders', action: 'approve', ids: ['returned-imported'] }, actor),
  [],
  'explicit IDs cannot bypass pending-state selection',
);
