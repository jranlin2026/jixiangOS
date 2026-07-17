import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { prisma } from '../server/db/client';
import {
  backfillContactIdentities,
  createContactIdentityCryptoFromEnv,
} from '../server/services/contactIdentityService';

export async function runContactIdentityBackfill(
  argv: string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const summary = await backfillContactIdentities(prisma as any, {
    apply: argv.includes('--apply'),
    crypto: createContactIdentityCryptoFromEnv(env),
  });
  console.info(JSON.stringify({
    canonicalCustomers: summary.canonicalCustomers,
    conflicts: summary.conflicts,
    invalidValues: summary.invalidValues,
    duplicateGroups: summary.duplicateGroups,
    legacyContactLockKeysCleared: summary.legacyContactLockKeysCleared,
  }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  dotenv.config({ quiet: true });
  try {
    await runContactIdentityBackfill();
  } finally {
    await prisma.$disconnect();
  }
}
