import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { prisma } from '../server/db/client';
import { mapPrismaRole } from '../server/db/prismaMappers';
import {
  CUSTOMER_PERMISSION_SCOPE_BASELINE_KEY,
  CUSTOMER_PERMISSION_SCOPE_BASELINE_VERSION,
  CUSTOMER_PERMISSION_SCOPE_MIGRATION_MANIFEST_KEY,
} from '../server/services/roleMigrationService';
import {
  CUSTOMER_LEAF_PERMISSION_KEYS,
  PERMISSION_KEYS,
  roleHasPermission,
} from '../src/shared/utils/permissions';

const validScopes = new Set(['self', 'department_only', 'department_and_descendants', 'all']);
const readOnlyCustomerLeaves = new Set<string>([
  PERMISSION_KEYS.CUSTOMER_LIST,
  PERMISSION_KEYS.CUSTOMER_DETAIL,
  PERMISSION_KEYS.CUSTOMER_PROFILE,
  PERMISSION_KEYS.CUSTOMER_AI_CARD,
  PERMISSION_KEYS.CUSTOMER_VIEW_ORDERS,
  PERMISSION_KEYS.CUSTOMER_BATCH_AUDIT_READ,
]);

export async function auditCustomerPermissionMigration(client: typeof prisma) {
  const [rows, markerRow, manifestRow] = await Promise.all([
    client.role.findMany(),
    client.appStorage.findUnique({ where: { key: CUSTOMER_PERMISSION_SCOPE_BASELINE_KEY } }),
    client.appStorage.findUnique({ where: { key: CUSTOMER_PERMISSION_SCOPE_MIGRATION_MANIFEST_KEY } }),
  ]);
  const roles = rows.map(mapPrismaRole);
  const marker = markerRow?.value && typeof markerRow.value === 'object' && !Array.isArray(markerRow.value)
    ? markerRow.value as Record<string, unknown>
    : {};
  const manifest = manifestRow?.value && typeof manifestRow.value === 'object' && !Array.isArray(manifestRow.value)
    ? manifestRow.value as Record<string, unknown>
    : {};
  const unexpectedPrivilegeChanges: Array<{ roleId: string; reason: string }> = [];
  const unexpectedScopeChanges: Array<{ roleId: string; scope: string }> = [];

  if (Number(marker.version) !== CUSTOMER_PERMISSION_SCOPE_BASELINE_VERSION) {
    unexpectedPrivilegeChanges.push({ roleId: '*', reason: 'CUSTOMER_PERMISSION_BASELINE_MARKER_MISSING' });
  }
  if (!manifestRow || String(marker.manifestChecksum || '') !== String(manifest.checksum || '')) {
    unexpectedPrivilegeChanges.push({ roleId: '*', reason: 'CUSTOMER_PERMISSION_MANIFEST_CHECKSUM_MISMATCH' });
  }

  const roleReports = roles.map((role) => {
    const scope = String(role.dataScopes?.customers || 'self');
    if (!validScopes.has(scope)) unexpectedScopeChanges.push({ roleId: role.id, scope });
    const effectiveLeafPermissions = CUSTOMER_LEAF_PERMISSION_KEYS.filter((permissionKey) => {
      const action = permissionKey === PERMISSION_KEYS.CUSTOMER_DELETE ? 'delete'
        : readOnlyCustomerLeaves.has(permissionKey) ? 'read'
          : 'write';
      return roleHasPermission(role, permissionKey, action);
    });
    return {
      roleId: role.id,
      roleCode: role.code,
      customersScope: scope,
      effectiveLeafPermissions,
    };
  });

  return {
    baselineVersion: Number(marker.version || 0),
    manifestChecksumMatches: Boolean(manifestRow && String(marker.manifestChecksum || '') === String(manifest.checksum || '')),
    roleCount: roles.length,
    roles: roleReports,
    unexpectedPrivilegeChanges,
    unexpectedScopeChanges,
    passed: unexpectedPrivilegeChanges.length === 0 && unexpectedScopeChanges.length === 0,
  };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const report = await auditCustomerPermissionMigration(prisma);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.passed) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
