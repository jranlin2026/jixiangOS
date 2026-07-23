import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { Prisma, PrismaClient } from '@prisma/client';
import { STORAGE_KEYS } from '../src/shared/utils/constants';

export const RESET_BUSINESS_DOMAINS = [
  STORAGE_KEYS.LEADS,
  STORAGE_KEYS.CUSTOMERS,
  STORAGE_KEYS.ORDERS,
  STORAGE_KEYS.ORDER_APPLICATIONS,
  STORAGE_KEYS.DELIVERIES,
  STORAGE_KEYS.COMMISSIONS,
  STORAGE_KEYS.COMMISSION_OPERATION_LOGS,
  STORAGE_KEYS.COMMISSION_SETTLEMENT_BATCHES,
  STORAGE_KEYS.REFUNDS,
  STORAGE_KEYS.RECOVERY_ORDERS,
  STORAGE_KEYS.FINANCE,
  STORAGE_KEYS.OPPORTUNITIES,
  STORAGE_KEYS.SERVICE_TICKETS,
  STORAGE_KEYS.AI_CARDS,
  STORAGE_KEYS.AI_SESSIONS,
] as const;

export const RESET_APP_STORAGE_KEYS = [
  ...RESET_BUSINESS_DOMAINS,
  STORAGE_KEYS.LEAD_INTAKE_RECORDS,
  STORAGE_KEYS.COMMISSION_PAYOUT_PLANS,
  STORAGE_KEYS.ECOMMERCE_SETTLEMENT_RECORDS,
] as const;

export function assertLocalResetTarget(databaseUrlValue: string): { host: string; database: string } {
  if (!databaseUrlValue.trim()) throw new Error('DATABASE_URL is required');
  const databaseUrl = new URL(databaseUrlValue);
  const database = databaseUrl.pathname.slice(1);
  if (!['127.0.0.1', 'localhost', '::1'].includes(databaseUrl.hostname)) {
    throw new Error('BUSINESS_TEST_DATA_RESET_REQUIRES_LOOPBACK_DATABASE');
  }
  if (!database) throw new Error('DATABASE_URL must include a database name');
  return { host: databaseUrl.hostname, database };
}

type ResetCounts = {
  businessRecords: number;
  appStorageRows: number;
  leadRecords: number;
  customerTodos: number;
  batchPrechecks: number;
  batchJobs: number;
  auditEvents: number;
  contactIdentities: number;
  contactIdentityLinks: number;
  duplicateGroups: number;
  mergeLedgers: number;
  mergeLedgerEntries: number;
};

async function readCounts(prisma: any): Promise<ResetCounts> {
  const [
    businessRecords,
    appStorageRows,
    leadRecords,
    customerTodos,
    batchPrechecks,
    batchJobs,
    auditEvents,
    contactIdentities,
    contactIdentityLinks,
    duplicateGroups,
    mergeLedgers,
    mergeLedgerEntries,
  ] = await Promise.all([
    prisma.businessRecord.count({ where: { domain: { in: [...RESET_BUSINESS_DOMAINS] } } }),
    prisma.appStorage.count({ where: { key: { in: [...RESET_APP_STORAGE_KEYS] } } }),
    prisma.leadRecord.count(),
    prisma.customerTodo.count(),
    prisma.customerBatchPrecheck.count(),
    prisma.customerBatchJob.count(),
    prisma.customerAuditEvent.count(),
    prisma.contactIdentity.count(),
    prisma.contactIdentityLink.count(),
    prisma.customerDuplicateGroup.count(),
    prisma.customerMergeLedger.count(),
    prisma.customerMergeLedgerEntry.count(),
  ]);
  return {
    businessRecords, appStorageRows, leadRecords, customerTodos, batchPrechecks, batchJobs,
    auditEvents, contactIdentities, contactIdentityLinks, duplicateGroups, mergeLedgers, mergeLedgerEntries,
  };
}

function total(counts: ResetCounts): number {
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
}

export async function resetBusinessTestData(prisma: PrismaClient, apply: boolean) {
  const before = await readCounts(prisma);
  if (!apply) return { applied: false, before };

  await prisma.$transaction(async (tx) => {
    await tx.customerMergeLedgerEntry.deleteMany();
    await tx.customerMergeLedger.deleteMany();
    await tx.customerDuplicateGroup.deleteMany();
    await tx.contactIdentityLink.deleteMany();
    await tx.contactIdentity.deleteMany();
    await tx.customerAuditEvent.deleteMany();
    await tx.customerBatchPrecheck.deleteMany();
    await tx.customerBatchJob.deleteMany();
    await tx.customerTodo.deleteMany();
    await tx.leadRecord.deleteMany();
    await tx.businessRecord.deleteMany({ where: { domain: { in: [...RESET_BUSINESS_DOMAINS] } } });
    await tx.appStorage.deleteMany({ where: { key: { in: [...RESET_APP_STORAGE_KEYS] } } });

    // Keep explicit empty values for cache-backed modules. A missing key does
    // not reliably evict a stale browser localStorage value during hydration.
    await tx.appStorage.createMany({
      data: [
        { key: STORAGE_KEYS.FINANCE, value: { dailyRecords: [], channelROI: [], incomes: [], expenses: [] } },
        { key: STORAGE_KEYS.LEAD_INTAKE_RECORDS, value: [] },
        { key: STORAGE_KEYS.COMMISSION_PAYOUT_PLANS, value: [] },
        { key: STORAGE_KEYS.ECOMMERCE_SETTLEMENT_RECORDS, value: [] },
      ] as Prisma.AppStorageCreateManyInput[],
    });
  }, { isolationLevel: 'Serializable', timeout: 120_000 });

  const after = await readCounts(prisma);
  // Four explicit empty cache sentinels are expected; every business record
  // count must otherwise be zero.
  if (total({ ...after, appStorageRows: 0 }) !== 0 || after.appStorageRows !== 4) {
    throw new Error(`BUSINESS_TEST_DATA_RESET_VERIFICATION_FAILED: ${JSON.stringify(after)}`);
  }
  return { applied: true, before, after };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const confirmed = process.argv.includes('--confirm-local-business-reset');
  const target = assertLocalResetTarget(String(process.env.DATABASE_URL || ''));
  if (apply && !confirmed) throw new Error('Use --confirm-local-business-reset together with --apply');

  const prisma = new PrismaClient();
  try {
    const result = await resetBusinessTestData(prisma, apply);
    console.log(JSON.stringify({ target, ...result }, null, 2));
    if (!apply) console.log('Dry run only. Add --apply --confirm-local-business-reset to delete these records.');
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
