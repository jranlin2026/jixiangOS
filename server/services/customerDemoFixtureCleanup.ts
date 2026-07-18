import { STORAGE_KEYS } from '../../src/shared/utils/constants';

type DemoRefundSignature = {
  recordId: string;
  refundNo: string;
  customerId: string;
  orderId: string;
};

export const LEGACY_DEMO_REFUND_SIGNATURES: readonly DemoRefundSignature[] = [
  { recordId: 'refund-001', refundNo: 'REF-202501-0001', customerId: 'cust-006', orderId: 'order-005' },
  { recordId: 'refund-002', refundNo: 'REF-202501-0002', customerId: 'cust-013', orderId: 'order-012' },
  { recordId: 'refund-003', refundNo: 'REF-202501-0003', customerId: 'cust-020', orderId: 'order-028' },
  { recordId: 'refund-004', refundNo: 'REF-202501-0004', customerId: 'cust-003', orderId: 'order-003' },
  { recordId: 'refund-005', refundNo: 'REF-202501-0005', customerId: 'cust-008', orderId: 'order-008' },
  { recordId: 'refund-006', refundNo: 'REF-202501-0006', customerId: 'cust-016', orderId: 'order-015' },
  { recordId: 'refund-007', refundNo: 'REF-202501-0007', customerId: 'cust-023', orderId: 'order-022' },
  { recordId: 'refund-008', refundNo: 'REF-202501-0008', customerId: 'cust-019', orderId: 'order-018' },
  { recordId: 'refund-009', refundNo: 'REF-202501-0009', customerId: 'cust-002', orderId: 'order-025' },
  { recordId: 'refund-010', refundNo: 'REF-202501-0010', customerId: 'cust-010', orderId: 'order-031' },
] as const;

export type DemoRefundRow = {
  id: string;
  domain: string;
  recordId: string;
  customerId: string | null;
  orderId?: string | null;
  updatedAt: Date;
  data: unknown;
};

const signaturesByRecordId = new Map(LEGACY_DEMO_REFUND_SIGNATURES.map((item) => [item.recordId, item]));

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function classifyLegacyDemoRefundRows(rows: DemoRefundRow[]): {
  matched: DemoRefundRow[];
  conflicts: string[];
} {
  const matched: DemoRefundRow[] = [];
  const conflicts: string[] = [];
  for (const row of rows) {
    const expected = signaturesByRecordId.get(row.recordId);
    if (!expected) continue;
    const data = objectValue(row.data);
    const exact = row.domain === STORAGE_KEYS.REFUNDS
      && row.customerId === expected.customerId
      && row.orderId === expected.orderId
      && data.refundNo === expected.refundNo
      && data.customerId === expected.customerId
      && data.orderId === expected.orderId;
    if (exact) matched.push(row);
    else conflicts.push(row.recordId);
  }
  return {
    matched: matched.sort((left, right) => left.recordId.localeCompare(right.recordId)),
    conflicts: conflicts.sort(),
  };
}

type DemoCleanupPrisma = {
  businessRecord: {
    findMany(input: unknown): Promise<DemoRefundRow[]>;
    deleteMany(input: unknown): Promise<{ count: number }>;
  };
  $transaction<T>(operation: (tx: DemoCleanupPrisma) => Promise<T>): Promise<T>;
};

async function loadCandidateRows(prisma: DemoCleanupPrisma): Promise<DemoRefundRow[]> {
  return prisma.businessRecord.findMany({
    where: {
      domain: STORAGE_KEYS.REFUNDS,
      recordId: { in: LEGACY_DEMO_REFUND_SIGNATURES.map((item) => item.recordId) },
    },
    orderBy: { recordId: 'asc' },
  });
}

export async function cleanupLegacyDemoRefundFixtures(
  prisma: DemoCleanupPrisma,
  options: { apply: boolean; backup?: (rows: DemoRefundRow[]) => Promise<void> },
): Promise<{ found: number; deleted: number; conflicts: string[] }> {
  const preflight = classifyLegacyDemoRefundRows(await loadCandidateRows(prisma));
  if (preflight.conflicts.length || !options.apply) {
    return { found: preflight.matched.length, deleted: 0, conflicts: preflight.conflicts };
  }
  if (preflight.matched.length === 0) return { found: 0, deleted: 0, conflicts: [] };
  if (!options.backup) throw new Error('清理演示退款数据前必须生成备份');
  await options.backup(preflight.matched);

  return prisma.$transaction(async (tx) => {
    const current = classifyLegacyDemoRefundRows(await loadCandidateRows(tx));
    if (current.conflicts.length
      || current.matched.length !== preflight.matched.length
      || current.matched.some((row, index) => (
        row.id !== preflight.matched[index].id
        || row.updatedAt.getTime() !== preflight.matched[index].updatedAt.getTime()
      ))) {
      throw new Error('演示退款数据在备份后发生变化，已取消清理');
    }
    let deleted = 0;
    for (const row of current.matched) {
      const result = await tx.businessRecord.deleteMany({
        where: { id: row.id, domain: row.domain, recordId: row.recordId, updatedAt: row.updatedAt },
      });
      if (result.count !== 1) throw new Error(`演示退款记录并发变更：${row.recordId}`);
      deleted += 1;
    }
    return { found: preflight.matched.length, deleted, conflicts: [] };
  });
}
