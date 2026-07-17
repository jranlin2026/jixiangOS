import 'dotenv/config';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Prisma } from '@prisma/client';
import { prisma } from '../server/db/client';
import { mapPrismaRole } from '../server/db/prismaMappers';
import {
  CUSTOMER_PERMISSION_SCOPE_MIGRATION_MANIFEST_KEY,
  CUSTOMER_PERMISSION_SCOPE_BASELINE_KEY,
  ROLE_PERMISSION_ACTION_BASELINE_KEY,
  assertCustomerPermissionMigrationPrerequisites,
  createCustomerPermissionMigrationManifest,
  createCustomerPermissionMigrationManifestAuthenticatorFromEnv,
  toSafeCustomerPermissionMigrationErrorCode,
  validateCustomerPermissionMigrationManifest,
  type CustomerPermissionMigrationManifestSigner,
  type CustomerPermissionMigrationManifestVerifier,
} from '../server/services/roleMigrationService';
import { captureLegacyCustomerDeleteRoleIds } from '../src/shared/utils/organizationConfig';

type PreparationStore = Pick<Prisma.TransactionClient, 'role' | 'appStorage'>;

export function parseCustomerPermissionMigrationCliArgs(args: string[]): {
  command: 'capture' | 'apply-manifest';
  filePath?: string;
} {
  const [command, optionOrPath, optionValue, ...extra] = args;
  if (command !== 'capture' && command !== 'apply-manifest') {
    throw new Error('Usage: prepare-customer-permission-migration.ts <capture [--out output.json] | apply-manifest --file manifest.json>');
  }
  if (extra.length) throw new Error('CUSTOMER_PERMISSION_MIGRATION_CLI_ARGUMENTS_INVALID');
  const expectedFlag = command === 'capture' ? '--out' : '--file';
  if (optionOrPath?.startsWith('--')) {
    if (optionOrPath !== expectedFlag || !optionValue) {
      throw new Error('CUSTOMER_PERMISSION_MIGRATION_CLI_ARGUMENTS_INVALID');
    }
    return { command, filePath: optionValue };
  }
  if (optionValue) throw new Error('CUSTOMER_PERMISSION_MIGRATION_CLI_ARGUMENTS_INVALID');
  if (command === 'apply-manifest' && !optionOrPath) {
    throw new Error('Usage: prepare-customer-permission-migration.ts apply-manifest --file <manifest.json>');
  }
  return { command, filePath: optionOrPath };
}

async function readPreparedRoles(store: PreparationStore) {
  const appliedBaseline = await store.appStorage.findUnique({
    where: { key: CUSTOMER_PERMISSION_SCOPE_BASELINE_KEY },
  });
  if (appliedBaseline) throw new Error('CUSTOMER_PERMISSION_MIGRATION_ALREADY_APPLIED');
  const roleBaseline = await store.appStorage.findUnique({
    where: { key: ROLE_PERMISSION_ACTION_BASELINE_KEY },
  });
  assertCustomerPermissionMigrationPrerequisites(roleBaseline?.value);
  const rows = await store.role.findMany();
  return rows.map(mapPrismaRole);
}

export async function captureCustomerPermissionMigrationManifest(
  store: PreparationStore,
  signer: CustomerPermissionMigrationManifestSigner,
  generatedAt = new Date().toISOString(),
) {
  try {
    const existingManifest = await store.appStorage.findUnique({
      where: { key: CUSTOMER_PERMISSION_SCOPE_MIGRATION_MANIFEST_KEY },
    });
    if (existingManifest) throw new Error('CUSTOMER_PERMISSION_MIGRATION_MANIFEST_ALREADY_STORED');
    const roles = await readPreparedRoles(store);
    return createCustomerPermissionMigrationManifest(
      roles,
      captureLegacyCustomerDeleteRoleIds(roles),
      signer,
      generatedAt,
    );
  } catch (error) {
    throw new Error(toSafeCustomerPermissionMigrationErrorCode(error));
  }
}

export async function applyCustomerPermissionMigrationManifest(
  store: PreparationStore,
  input: Prisma.JsonValue,
  verifier: CustomerPermissionMigrationManifestVerifier,
) {
  try {
    const roles = await readPreparedRoles(store);
    const manifest = validateCustomerPermissionMigrationManifest(input, roles, verifier);
    const existingManifest = await store.appStorage.findUnique({
      where: { key: CUSTOMER_PERMISSION_SCOPE_MIGRATION_MANIFEST_KEY },
    });
    if (existingManifest) {
      const stored = validateCustomerPermissionMigrationManifest(
        existingManifest.value,
        roles,
        verifier,
      );
      if (stored.checksum !== manifest.checksum) {
        throw new Error('CUSTOMER_PERMISSION_MIGRATION_MANIFEST_ALREADY_STORED');
      }
    } else {
      await store.appStorage.create({
        data: {
          key: CUSTOMER_PERMISSION_SCOPE_MIGRATION_MANIFEST_KEY,
          value: manifest as unknown as Prisma.InputJsonValue,
        },
      });
    }
    return {
      version: manifest.version,
      roleCount: roles.length,
      deleteRoleCount: manifest.deleteRoleIds.length,
    };
  } catch (error) {
    throw new Error(toSafeCustomerPermissionMigrationErrorCode(error));
  }
}

async function capture(
  outputPath: string | undefined,
  signer: CustomerPermissionMigrationManifestSigner,
): Promise<void> {
  const manifest = await prisma.$transaction((transaction) => (
    captureCustomerPermissionMigrationManifest(transaction, signer)
  ));
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  if (outputPath) {
    const resolvedPath = path.resolve(outputPath);
    const temporaryPath = `${resolvedPath}.${randomUUID()}.tmp`;
    await mkdir(path.dirname(resolvedPath), { recursive: true });
    try {
      await writeFile(temporaryPath, serialized, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await rename(temporaryPath, resolvedPath);
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }
  process.stdout.write(serialized);
}

async function applyManifest(
  inputPath: string | undefined,
  verifier: CustomerPermissionMigrationManifestVerifier,
): Promise<void> {
  if (!inputPath) {
    throw new Error('Usage: prepare-customer-permission-migration.ts apply-manifest <manifest.json>');
  }
  const input = JSON.parse(await readFile(path.resolve(inputPath), 'utf8')) as Prisma.JsonValue;
  const summary = await prisma.$transaction((transaction) => (
    applyCustomerPermissionMigrationManifest(transaction, input, verifier)
  ));
  process.stdout.write(`${JSON.stringify({ mode: 'apply-manifest', ...summary })}\n`);
}

const isMain = Boolean(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url));
if (isMain) {
  try {
    const manifestAuthenticator = createCustomerPermissionMigrationManifestAuthenticatorFromEnv(process.env);
    const { command, filePath } = parseCustomerPermissionMigrationCliArgs(process.argv.slice(2));
    if (command === 'capture') {
      await capture(filePath, manifestAuthenticator);
    } else {
      await applyManifest(filePath, manifestAuthenticator);
    }
  } catch (error) {
    process.stderr.write(`${toSafeCustomerPermissionMigrationErrorCode(error)}\n`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
