import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { assertAssociationRegistryComplete, discoverCustomerAssociationDomains } from './customerAssociationRegistry';
import { createCustomerMergeSnapshotKeyringFromEnv } from './customerMergeSnapshotCrypto';

export interface CustomerMergeReleaseReadiness {
  schemaReady: boolean;
  registryComplete: boolean;
  markerConsistency: boolean;
  noStableLinksToMergedCustomers: boolean;
  keyringReady: boolean;
}

export function assertCustomerMergeReleaseReady(report: CustomerMergeReleaseReadiness): void {
  const failed = Object.entries(report).filter(([, ready]) => !ready).map(([name]) => name);
  if (failed.length) throw new Error(`CUSTOMER_MERGE_RELEASE_GATE_FAILED:${failed.join(',')}`);
}

function data(value: unknown): Record<string, any> {
  if (typeof value === 'string') { try { return data(JSON.parse(value)); } catch { return {}; } }
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

export async function verifyCustomerMergeReleaseGate(client: any, env: NodeJS.ProcessEnv): Promise<CustomerMergeReleaseReadiness> {
  const report: CustomerMergeReleaseReadiness = {
    schemaReady: false,
    registryComplete: false,
    markerConsistency: false,
    noStableLinksToMergedCustomers: false,
    keyringReady: false,
  };
  const schemaRows = await client.$queryRawUnsafe(`
    SELECT
      (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('customer_merge_ledgers','customer_merge_ledger_entries')) AS tableCount,
      (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'business_records' AND COLUMN_NAME IN ('mergedIntoId','mergedAt','mergedById','mergedByName','mergeLedgerId','recordRevision')) AS columnCount
  `);
  report.schemaReady = Number(schemaRows[0]?.tableCount || 0) === 2 && Number(schemaRows[0]?.columnCount || 0) === 6;

  const rows = await client.businessRecord.findMany({
    where: { domain: STORAGE_KEYS.CUSTOMERS },
    select: { recordId: true, data: true, mergedIntoId: true, mergedAt: true, mergedById: true, mergedByName: true, mergeLedgerId: true, recordRevision: true },
  });
  const ids = rows.map((row: any) => row.recordId);
  await assertAssociationRegistryComplete(client, ids);
  report.registryComplete = true;
  report.markerConsistency = rows.every((row: any) => {
    const customer = data(row.data);
    return (customer.mergedIntoId || null) === (row.mergedIntoId || null)
      && (customer.mergeLedgerId || null) === (row.mergeLedgerId || null)
      && Number(customer.recordRevision ?? 0) === Number(row.recordRevision ?? 0);
  });
  const mergedIds = rows.filter((row: any) => row.mergedIntoId).map((row: any) => row.recordId);
  const occurrences = await discoverCustomerAssociationDomains(client, mergedIds);
  report.noStableLinksToMergedCustomers = occurrences.every((item) => item.storageDomain === STORAGE_KEYS.CUSTOMERS);
  const keyring = createCustomerMergeSnapshotKeyringFromEnv(env);
  const usedVersions = await client.customerMergeLedger.findMany({ distinct: ['snapshotKeyVersion'], select: { snapshotKeyVersion: true } });
  report.keyringReady = usedVersions.every((row: any) => keyring.keys.has(row.snapshotKeyVersion));
  assertCustomerMergeReleaseReady(report);
  return report;
}
