import 'dotenv/config';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Prisma } from '@prisma/client';
import { prisma } from '../server/db/client';
import {
  CUSTOMER_PERMISSION_SCOPE_BASELINE_KEY,
  CUSTOMER_PERMISSION_SCOPE_BASELINE_VERSION,
  CUSTOMER_PERMISSION_SCOPE_MIGRATION_MANIFEST_KEY,
  createCustomerPermissionMigrationManifestAuthenticatorFromEnv,
  migrateCustomerPermissionAndScopeBaseline,
  toSafeCustomerPermissionMigrationErrorCode,
} from '../server/services/roleMigrationService';
import {
  applyCustomerPermissionMigrationManifest,
  captureCustomerPermissionMigrationManifest,
} from './prepare-customer-permission-migration';

function parseReportPath(args: string[]): string | undefined {
  if (args.length === 0) return undefined;
  if (args.length !== 2 || args[0] !== '--out' || !args[1]) {
    throw new Error('CUSTOMER_PERMISSION_MIGRATION_CLI_ARGUMENTS_INVALID');
  }
  return path.resolve(args[1]);
}

function readBaselineVersion(value: Prisma.JsonValue | undefined): number {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
  return Number((value as Record<string, Prisma.JsonValue>).version || 0);
}

async function writePrivateManifestReport(filePath: string, value: Prisma.JsonValue): Promise<void> {
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

export async function migrateCustomerPermissionBaseline(reportPath?: string) {
  const authenticator = createCustomerPermissionMigrationManifestAuthenticatorFromEnv(process.env);
  const marker = await prisma.appStorage.findUnique({
    where: { key: CUSTOMER_PERMISSION_SCOPE_BASELINE_KEY },
  });
  if (readBaselineVersion(marker?.value) >= CUSTOMER_PERMISSION_SCOPE_BASELINE_VERSION) {
    return { skipped: true, version: CUSTOMER_PERMISSION_SCOPE_BASELINE_VERSION, migratedRoleCount: 0 };
  }

  const storedManifest = await prisma.appStorage.findUnique({
    where: { key: CUSTOMER_PERMISSION_SCOPE_MIGRATION_MANIFEST_KEY },
  });
  if (!storedManifest) {
    const manifest = await prisma.$transaction((transaction) => (
      captureCustomerPermissionMigrationManifest(transaction, authenticator)
    ));
    if (!reportPath) throw new Error('CUSTOMER_PERMISSION_MIGRATION_PRIVATE_REPORT_REQUIRED');
    await writePrivateManifestReport(reportPath, manifest as unknown as Prisma.JsonValue);
    await prisma.$transaction((transaction) => (
      applyCustomerPermissionMigrationManifest(
        transaction,
        manifest as unknown as Prisma.JsonValue,
        authenticator,
      )
    ));
  }

  const result = await migrateCustomerPermissionAndScopeBaseline(prisma, authenticator);
  return {
    skipped: false,
    version: result.version,
    migratedRoleCount: result.migratedRoleIds.length,
  };
}

const isMain = Boolean(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url));
if (isMain) {
  try {
    const summary = await migrateCustomerPermissionBaseline(parseReportPath(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  } catch (error) {
    process.stderr.write(`${toSafeCustomerPermissionMigrationErrorCode(error)}\n`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
