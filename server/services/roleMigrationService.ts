import { Prisma, type PrismaClient } from '@prisma/client';
import { DEFAULT_ROLES, mergeRoleWithDefaultAccess } from '../../src/shared/utils/organizationConfig';
import { PERMISSION_KEYS, sanitizeRolePermissions } from '../../src/shared/utils/permissions';
import { mapPrismaRole } from '../db/prismaMappers';
import type { Permission, Role, RoleDataScopes } from '../../src/types/role';

type RoleMigrationStore = Pick<PrismaClient, 'role'> & Partial<Pick<PrismaClient, 'appStorage'>>;
type RoleMigrationPrisma = RoleMigrationStore & Partial<Pick<PrismaClient, '$transaction'>>;

const ROLE_PERMISSION_ACTION_BASELINE_KEY = 'aaos_role_permission_action_baseline_version';
const ROLE_PERMISSION_ACTION_BASELINE_VERSION = 3;

function permissionsSignature(permissions: Permission[] = []): string {
  return JSON.stringify(permissions
    .map((permission) => ({
      module: permission.module,
      actions: [...(permission.actions || [])].sort(),
    }))
    .sort((left, right) => left.module.localeCompare(right.module)));
}

function dataScopesSignature(dataScopes?: RoleDataScopes): string {
  const scopes = dataScopes || {};
  return JSON.stringify(Object.keys(scopes)
    .sort()
    .reduce<Record<string, string>>((acc, key) => {
      acc[key] = String(scopes[key as keyof RoleDataScopes] || '');
      return acc;
    }, {}));
}

function normalizeRoleCode(value?: string): string {
  return String(value || '').trim().toLowerCase();
}

function mergeDefaultRolePermissionBaseline(role: Role): Role {
  const seed = DEFAULT_ROLES.find((candidate) => (
    candidate.id === role.id
    || normalizeRoleCode(candidate.code) === normalizeRoleCode(role.code)
  ));
  if (!seed) return role;
  if (seed.code === 'super_admin') {
    return { ...role, code: seed.code, permissions: seed.permissions };
  }
  return {
    ...role,
    code: seed.code,
    permissions: sanitizeRolePermissions([
      ...(role.permissions || []),
      ...seed.permissions,
    ]),
  };
}

function migrateLegacyRecoveryReviewListPermission(role: Role): Role {
  if (role.permissions?.some((permission) => permission.module === PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW_LIST)) {
    return role;
  }
  const hadCombinedReviewPermission = role.permissions?.some((permission) => [
    PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW,
    '售后服务/售后挽回订单/审核挽回订单',
  ].includes(permission.module) && (permission.actions || []).some((action) => ['read', 'write', 'delete', 'admin'].includes(action)));
  if (!hadCombinedReviewPermission) return role;
  return {
    ...role,
    permissions: sanitizeRolePermissions([
      ...(role.permissions || []),
      { module: PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW_LIST, actions: ['read'] },
    ]),
  };
}

function readBaselineVersion(value: Prisma.JsonValue | undefined): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value) || 0;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Number((value as Record<string, Prisma.JsonValue>).version) || 0;
  }
  return 0;
}

async function migrateRoleRows(store: RoleMigrationStore, applyPermissionBaseline: boolean): Promise<number> {
  const rows = await store.role.findMany();
  let changed = 0;

  for (const row of rows) {
    const current = mapPrismaRole(row);
    const migrated = mergeRoleWithDefaultAccess(
      applyPermissionBaseline
        ? migrateLegacyRecoveryReviewListPermission(mergeDefaultRolePermissionBaseline(current))
        : current,
    );
    const permissionsChanged = permissionsSignature(current.permissions) !== permissionsSignature(migrated.permissions);
    const scopesChanged = dataScopesSignature(current.dataScopes) !== dataScopesSignature(migrated.dataScopes);

    if (!permissionsChanged && !scopesChanged) continue;

    await store.role.update({
      where: { id: row.id },
      data: {
        permissions: migrated.permissions as unknown as Prisma.InputJsonValue,
        dataScopes: (migrated.dataScopes || {}) as unknown as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    });
    changed += 1;
  }

  if (applyPermissionBaseline && store.appStorage) {
    await store.appStorage.upsert({
      where: { key: ROLE_PERMISSION_ACTION_BASELINE_KEY },
      create: {
        key: ROLE_PERMISSION_ACTION_BASELINE_KEY,
        value: {
          version: ROLE_PERMISSION_ACTION_BASELINE_VERSION,
          migratedAt: new Date().toISOString(),
        } as unknown as Prisma.InputJsonValue,
      },
      update: {
        value: {
          version: ROLE_PERMISSION_ACTION_BASELINE_VERSION,
          migratedAt: new Date().toISOString(),
        } as unknown as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    });
  }

  return changed;
}

export async function migrateDefaultRoleAccess(prisma: RoleMigrationPrisma): Promise<number> {
  const marker = prisma.appStorage
    ? await prisma.appStorage.findUnique({ where: { key: ROLE_PERMISSION_ACTION_BASELINE_KEY } })
    : null;
  const applyPermissionBaseline = readBaselineVersion(marker?.value) < ROLE_PERMISSION_ACTION_BASELINE_VERSION;
  if (!applyPermissionBaseline) return 0;

  if (prisma.$transaction && prisma.appStorage) {
    return prisma.$transaction((transaction) => migrateRoleRows(transaction as RoleMigrationStore, true));
  }
  return migrateRoleRows(prisma, true);
}
