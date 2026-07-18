import assert from 'node:assert/strict';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import {
  classifyLegacyDemoRefundRows,
  cleanupLegacyDemoRefundFixtures,
  type DemoRefundRow,
} from './customerDemoFixtureCleanup';

const updatedAt = new Date('2026-07-18T00:00:00.000Z');
const exact: DemoRefundRow = {
  id: 'aaos_refunds:refund-001',
  domain: STORAGE_KEYS.REFUNDS,
  recordId: 'refund-001',
  customerId: 'cust-006',
  orderId: 'order-005',
  updatedAt,
  data: { id: 'refund-001', refundNo: 'REF-202501-0001', customerId: 'cust-006', orderId: 'order-005' },
};

assert.deepEqual(classifyLegacyDemoRefundRows([exact]), { matched: [exact], conflicts: [] });
assert.deepEqual(
  classifyLegacyDemoRefundRows([{ ...exact, customerId: 'real-customer' }]),
  { matched: [], conflicts: ['refund-001'] },
  '固定编号的记录只要被业务修改就必须拒绝删除',
);

const rows = [structuredClone(exact)];
let backedUp = false;
const prisma: any = {
  businessRecord: {
    findMany: async () => structuredClone(rows),
    deleteMany: async ({ where }: any) => {
      const index = rows.findIndex((row) => row.id === where.id && row.updatedAt.getTime() === where.updatedAt.getTime());
      if (index < 0) return { count: 0 };
      rows.splice(index, 1);
      return { count: 1 };
    },
  },
};
prisma.$transaction = async (operation: (tx: any) => Promise<unknown>) => operation(prisma);
const result = await cleanupLegacyDemoRefundFixtures(prisma, {
  apply: true,
  backup: async (snapshot) => {
    assert.equal(snapshot.length, 1);
    backedUp = true;
  },
});
assert.equal(backedUp, true);
assert.deepEqual(result, { found: 1, deleted: 1, conflicts: [] });
assert.equal(rows.length, 0);
