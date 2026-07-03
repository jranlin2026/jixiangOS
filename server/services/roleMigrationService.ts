import { Prisma, type PrismaClient } from '@prisma/client';
import { mergeRoleWithDefaultAccess } from '../../src/shared/utils/organizationConfig';
import { mapPrismaRole } from '../db/prismaMappers';
import type { Permission, RoleDataScopes } from '../../src/types/role';

type RoleMigrationPrisma = Pick<PrismaClient, 'role'>;

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

export async function migrateDefaultRoleAccess(prisma: RoleMigrationPrisma): Promise<number> {
  const rows = await prisma.role.findMany();
  let changed = 0;

  for (const row of rows) {
    const current = mapPrismaRole(row);
    const migrated = mergeRoleWithDefaultAccess(current);
    const permissionsChanged = permissionsSignature(current.permissions) !== permissionsSignature(migrated.permissions);
    const scopesChanged = dataScopesSignature(current.dataScopes) !== dataScopesSignature(migrated.dataScopes);

    if (!permissionsChanged && !scopesChanged) continue;

    await prisma.role.update({
      where: { id: row.id },
      data: {
        permissions: migrated.permissions as unknown as Prisma.InputJsonValue,
        dataScopes: (migrated.dataScopes || {}) as unknown as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    });
    changed += 1;
  }

  return changed;
}
