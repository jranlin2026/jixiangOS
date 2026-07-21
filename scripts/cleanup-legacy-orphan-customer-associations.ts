import 'dotenv/config';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { Prisma } from '@prisma/client';
import { prisma } from '../server/db/client';
import { STORAGE_KEYS } from '../src/shared/utils/constants';

const CLEANUP_MARKER = 'aaos_cleanup_legacy_orphan_customer_associations_v1';
const LEGACY_MIGRATION_MARKER = 'aaos_migration_legacy_business_records_v1';
const EXPECTED_ORDER_IDS = Array.from({ length: 40 }, (_, index) => `order-${String(index + 1).padStart(3, '0')}`);

function readObject(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function normalizeIdentity(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
}

function parseArgs(args: string[]): { apply: boolean; confirmed: boolean; outputPath: string } {
  const apply = args.includes('--apply');
  const confirmed = args.includes('--confirm-production');
  const outIndex = args.indexOf('--out');
  const outputPath = outIndex >= 0 ? args[outIndex + 1] : '';
  if (!apply || !outputPath || (process.env.NODE_ENV === 'production' && !confirmed)) {
    throw new Error('LEGACY_ORPHAN_ASSOCIATION_CLEANUP_CONFIRMATION_REQUIRED');
  }
  return { apply, confirmed, outputPath: path.resolve(outputPath) };
}

async function writePrivateBackup(filePath: string, value: unknown): Promise<void> {
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  await mkdir(path.dirname(filePath), { recursive: true });
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
    await rename(temporaryPath, filePath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

function expectedLegacyMissingCount(marker: unknown, domain: string): number {
  const reports = Array.isArray(readObject(marker).reports) ? readObject(marker).reports : [];
  return Number(reports.find((report: any) => report?.domain === domain)?.missing || 0);
}

export async function cleanupLegacyOrphanCustomerAssociations(outputPath: string) {
  const existingMarker = await prisma.appStorage.findUnique({ where: { key: CLEANUP_MARKER } });
  if (existingMarker) return { skipped: true, marker: existingMarker.value };

  const [legacyMarker, orders, commissions, customers, leads, allBusinessRecords] = await Promise.all([
    prisma.appStorage.findUnique({ where: { key: LEGACY_MIGRATION_MARKER } }),
    prisma.businessRecord.findMany({
      where: { domain: STORAGE_KEYS.ORDERS, recordId: { in: EXPECTED_ORDER_IDS } },
      orderBy: { recordId: 'asc' },
    }),
    prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.COMMISSIONS } }),
    prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.CUSTOMERS } }),
    prisma.leadRecord.findMany(),
    prisma.businessRecord.findMany({ select: { id: true, domain: true, recordId: true, data: true } }),
  ]);
  if (!legacyMarker) throw new Error('LEGACY_ORPHAN_ASSOCIATION_MIGRATION_MARKER_REQUIRED');

  const customerStates = new Map<string, 'active' | 'deleted'>(customers.map((row) => {
    const data = readObject(row.data);
    return [String(data.id || row.recordId), data.deletedAt || data.isDeleted ? 'deleted' : 'active'];
  }));
  const activeCustomerIdentities = customers.flatMap((row) => {
    const data = readObject(row.data);
    const id = String(data.id || row.recordId);
    if (customerStates.get(id) !== 'active') return [];
    return [{
      id,
      identities: Array.from(new Set([normalizeIdentity(data.name), normalizeIdentity(data.company)].filter(Boolean))),
    }];
  });

  if (orders.length !== expectedLegacyMissingCount(legacyMarker.value, STORAGE_KEYS.ORDERS)) {
    throw new Error('LEGACY_ORPHAN_ASSOCIATION_ORDER_COUNT_MISMATCH');
  }
  if (orders.length > 0) {
    if (orders.length !== EXPECTED_ORDER_IDS.length || orders.some((row, index) => row.recordId !== EXPECTED_ORDER_IDS[index])) {
      throw new Error('LEGACY_ORPHAN_ASSOCIATION_ORDER_SIGNATURE_MISMATCH');
    }
    const createdTimes = orders.map((row) => row.createdAt.getTime());
    if (Math.max(...createdTimes) - Math.min(...createdTimes) > 1000) {
      throw new Error('LEGACY_ORPHAN_ASSOCIATION_ORDER_BATCH_MISMATCH');
    }
    for (const row of orders) {
      const data = readObject(row.data);
      const customerIds = Array.from(new Set([String(row.customerId || ''), String(data.customerId || '')].filter(Boolean)));
      if (customerIds.length === 0 || customerIds.some((id) => customerStates.has(id))) {
        throw new Error('LEGACY_ORPHAN_ASSOCIATION_CUSTOMER_REFERENCE_MISMATCH');
      }
      const identity = normalizeIdentity(data.customerName);
      if (!identity || activeCustomerIdentities.some((customer) => customer.identities.includes(identity))) {
        throw new Error('LEGACY_ORPHAN_ASSOCIATION_RECOVERABLE_ORDER_FOUND');
      }
    }
  }

  const expectedOrderIdSet = new Set(EXPECTED_ORDER_IDS);
  const dependentCommissions = commissions.filter((row) => expectedOrderIdSet.has(String(readObject(row.data).orderId || '')));
  if (dependentCommissions.length !== expectedLegacyMissingCount(legacyMarker.value, STORAGE_KEYS.COMMISSIONS)) {
    throw new Error('LEGACY_ORPHAN_ASSOCIATION_COMMISSION_COUNT_MISMATCH');
  }
  const unexpectedDependents = allBusinessRecords.filter((row) => {
    if (row.domain === STORAGE_KEYS.ORDERS && expectedOrderIdSet.has(row.recordId)) return false;
    if (row.domain === STORAGE_KEYS.COMMISSIONS && dependentCommissions.some((item) => item.id === row.id)) return false;
    const serialized = JSON.stringify(row.data || {});
    return EXPECTED_ORDER_IDS.some((orderId) => serialized.includes(orderId));
  });
  if (unexpectedDependents.length > 0) throw new Error('LEGACY_ORPHAN_ASSOCIATION_UNEXPECTED_DEPENDENCY');

  const detachedLeads = leads.filter((row) => {
    const data = readObject(row.data);
    const customerId = String(data.customerId || '');
    return customerStates.get(customerId) === 'deleted' && !data.convertedAt;
  });
  await writePrivateBackup(outputPath, {
    version: 1,
    createdAt: new Date().toISOString(),
    orders,
    commissions: dependentCommissions,
    leads: detachedLeads,
  });

  const summary = await prisma.$transaction(async (transaction) => {
    const commissionDelete = await transaction.businessRecord.deleteMany({
      where: { id: { in: dependentCommissions.map((row) => row.id) } },
    });
    const orderDelete = await transaction.businessRecord.deleteMany({
      where: { id: { in: orders.map((row) => row.id) } },
    });
    let detachedLeadCount = 0;
    for (const lead of detachedLeads) {
      const data = { ...readObject(lead.data) };
      delete data.customerId;
      const update = await transaction.leadRecord.updateMany({
        where: { id: lead.id, updatedAt: lead.updatedAt },
        data: { data },
      });
      if (update.count !== 1) throw new Error('LEGACY_ORPHAN_ASSOCIATION_CONCURRENT_LEAD_UPDATE');
      detachedLeadCount += 1;
    }
    const markerValue = {
      version: 1,
      cleanedAt: new Date().toISOString(),
      deletedOrderCount: orderDelete.count,
      deletedCommissionCount: commissionDelete.count,
      detachedLeadCount,
    };
    await transaction.appStorage.create({
      data: { key: CLEANUP_MARKER, value: markerValue as unknown as Prisma.InputJsonValue },
    });
    return markerValue;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  return { skipped: false, ...summary };
}

try {
  const { outputPath } = parseArgs(process.argv.slice(2));
  const summary = await cleanupLegacyOrphanCustomerAssociations(outputPath);
  process.stdout.write(`${JSON.stringify(summary)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'LEGACY_ORPHAN_ASSOCIATION_CLEANUP_FAILED'}\n`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
