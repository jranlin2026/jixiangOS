import 'dotenv/config';
import { prisma } from '../server/db/client';
import { buildLegacyRepairPlan } from '../server/services/legacyBusinessRecordRepair';
import { createStorageService } from '../server/services/storageService';
import { STORAGE_KEYS } from '../src/shared/utils/constants';

const apply = process.argv.includes('--apply');
const productionConfirmed = process.argv.includes('--confirm-production');
const markerKey = 'aaos_migration_legacy_business_records_v1';
const domains = [STORAGE_KEYS.ORDERS, STORAGE_KEYS.COMMISSIONS];

if (apply && process.env.NODE_ENV === 'production' && !productionConfirmed) {
  throw new Error('Production repair requires --apply --confirm-production after a database backup.');
}

try {
  const marker = await prisma.appStorage.findUnique({ where: { key: markerKey } });
  if (marker) {
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', skipped: true, marker: marker.value }, null, 2));
  } else {
    const storage = createStorageService(prisma);
    const reports = [];
    for (const domain of domains) {
      const [legacyRow, currentRows] = await Promise.all([
        prisma.appStorage.findUnique({ where: { key: domain } }),
        prisma.businessRecord.findMany({ where: { domain }, select: { recordId: true, data: true } }),
      ]);
      const plan = buildLegacyRepairPlan(currentRows, legacyRow?.value);
      reports.push({ domain, current: plan.current, legacy: plan.legacy, missing: plan.missing, merged: plan.merged.length });
      if (apply && plan.missing > 0) {
        const result = await storage.set(domain, plan.merged);
        if (result.code !== 0) throw new Error(`${domain}: ${result.message}`);
      }
    }

    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', reports }, null, 2));
    if (apply) {
      await prisma.appStorage.create({
        data: { key: markerKey, value: { migratedAt: new Date().toISOString(), reports } },
      });
    }
  }
} finally {
  await prisma.$disconnect();
}
