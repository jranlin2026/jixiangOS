import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { DEFAULT_ROLES, mergeRoleWithDefaultAccess } from '../../src/shared/utils/organizationConfig';
import { PERMISSION_KEYS, sanitizeRolePermissions } from '../../src/shared/utils/permissions';
import { mapPrismaRole } from '../db/prismaMappers';
import type { Permission, Role, RoleDataScopes } from '../../src/types/role';

type RoleMigrationStore = Pick<PrismaClient, 'role'> & Partial<Pick<PrismaClient, 'appStorage'>>;
type RoleMigrationPrisma = RoleMigrationStore & Partial<Pick<PrismaClient, '$transaction'>>;
type CustomerPermissionMigrationStore = Pick<PrismaClient, 'role' | 'appStorage'>;
type CustomerPermissionMigrationPrisma = Pick<PrismaClient, 'role' | 'appStorage' | '$transaction'>;
type PrismaRoleRow = Parameters<typeof mapPrismaRole>[0];

export const CUSTOMER_PERMISSION_SCOPE_BASELINE_KEY = 'aaos_customer_permission_scope_baseline_version';
export const CUSTOMER_PERMISSION_SCOPE_BASELINE_VERSION = 1;
export const CUSTOMER_PERMISSION_SCOPE_MIGRATION_MANIFEST_KEY = 'aaos_customer_permission_scope_migration_manifest_v1';
export const CUSTOMER_PERMISSION_MIGRATION_SIGNING_KEY_ENV = 'CUSTOMER_PERMISSION_MIGRATION_SIGNING_KEY';

export type CustomerPermissionMigrationManifest = {
  version: number;
  roleDataHash: string;
  deleteRoleIds: string[];
  generatedAt: string;
  checksum: string;
  signature: string;
};

export type CustomerPermissionMigrationSummary = {
  migratedRoleIds: string[];
  version: number;
};

type CustomerPermissionMigrationManifestPayload = Pick<
  CustomerPermissionMigrationManifest,
  'version' | 'roleDataHash' | 'deleteRoleIds' | 'generatedAt'
>;

export type CustomerPermissionMigrationManifestSigner = {
  sign(checksum: string): string;
};

export type CustomerPermissionMigrationManifestVerifier = {
  verify(checksum: string, signature: string): boolean;
};

export type CustomerPermissionMigrationManifestAuthenticator =
  CustomerPermissionMigrationManifestSigner
  & CustomerPermissionMigrationManifestVerifier;

export const ROLE_PERMISSION_ACTION_BASELINE_KEY = 'aaos_role_permission_action_baseline_version';
export const ROLE_PERMISSION_ACTION_BASELINE_VERSION = 4;

export function toSafeCustomerPermissionMigrationErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  return /^CUSTOMER_PERMISSION_MIGRATION_[A-Z0-9_]+$/.test(message)
    ? message
    : 'CUSTOMER_PERMISSION_MIGRATION_FAILED';
}

function compareCanonicalText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function createCustomerPermissionMigrationManifestAuthenticator(
  signingKey: string | undefined,
): CustomerPermissionMigrationManifestAuthenticator {
  if (!signingKey || Buffer.byteLength(signingKey, 'utf8') < 32) {
    throw new Error('CUSTOMER_PERMISSION_MIGRATION_SIGNING_KEY_REQUIRED');
  }
  const sign = (checksum: string) => (
    createHmac('sha256', signingKey).update(checksum, 'utf8').digest('hex')
  );
  return {
    sign,
    verify(checksum, signature) {
      if (!/^[a-f0-9]{64}$/.test(signature)) return false;
      const expected = Buffer.from(sign(checksum), 'hex');
      const received = Buffer.from(signature, 'hex');
      return expected.length === received.length && timingSafeEqual(expected, received);
    },
  };
}

export function createCustomerPermissionMigrationManifestAuthenticatorFromEnv(
  env: Record<string, string | undefined>,
): CustomerPermissionMigrationManifestAuthenticator {
  return createCustomerPermissionMigrationManifestAuthenticator(
    env[CUSTOMER_PERMISSION_MIGRATION_SIGNING_KEY_ENV],
  );
}

function customerRoleHashInput(role: Role) {
  const actionsByModule = new Map<string, Set<string>>();
  for (const permission of role.permissions || []) {
    const module = String(permission.module || '');
    const actions = actionsByModule.get(module) || new Set<string>();
    (permission.actions || []).map(String).forEach((action) => actions.add(action));
    actionsByModule.set(module, actions);
  }
  const permissions = Array.from(actionsByModule.entries())
    .map(([module, actions]) => ({ module, actions: Array.from(actions).sort(compareCanonicalText) }))
    .sort((left, right) => compareCanonicalText(left.module, right.module));
  const dataScopes = Object.entries(role.dataScopes || {})
    .sort(([left], [right]) => compareCanonicalText(left, right))
    .reduce<Record<string, string>>((result, [key, value]) => {
      result[key] = String(value ?? '');
      return result;
    }, {});

  return {
    id: String(role.id),
    name: String(role.name || ''),
    code: String(role.code || ''),
    isActive: Boolean(role.isActive),
    permissions,
    dataScopes,
  };
}

export function computeCustomerPermissionRoleDataHash(roles: readonly Role[]): string {
  const input = roles
    .map(customerRoleHashInput)
    .sort((left, right) => compareCanonicalText(left.id, right.id));
  return sha256(JSON.stringify(input));
}

export function computeCustomerPermissionMigrationManifestChecksum(
  input: CustomerPermissionMigrationManifestPayload | CustomerPermissionMigrationManifest,
): string {
  const payload: CustomerPermissionMigrationManifestPayload = {
    version: Number(input.version),
    roleDataHash: String(input.roleDataHash || ''),
    deleteRoleIds: Array.from(new Set((input.deleteRoleIds || []).map(String))).sort(compareCanonicalText),
    generatedAt: String(input.generatedAt || ''),
  };
  return sha256(JSON.stringify(payload));
}

export function createCustomerPermissionMigrationManifest(
  roles: readonly Role[],
  deleteRoleIds: readonly string[],
  signer: CustomerPermissionMigrationManifestSigner,
  generatedAt = new Date().toISOString(),
): CustomerPermissionMigrationManifest {
  if (!signer || typeof signer.sign !== 'function') {
    throw new Error('CUSTOMER_PERMISSION_MIGRATION_SIGNING_KEY_REQUIRED');
  }
  const payload: CustomerPermissionMigrationManifestPayload = {
    version: CUSTOMER_PERMISSION_SCOPE_BASELINE_VERSION,
    roleDataHash: computeCustomerPermissionRoleDataHash(roles),
    deleteRoleIds: Array.from(new Set(deleteRoleIds.map(String))).sort(compareCanonicalText),
    generatedAt,
  };
  const checksum = computeCustomerPermissionMigrationManifestChecksum(payload);
  return {
    ...payload,
    checksum,
    signature: signer.sign(checksum),
  };
}

function parseCustomerPermissionMigrationManifest(
  value: Prisma.JsonValue | undefined,
): CustomerPermissionMigrationManifest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, Prisma.JsonValue>;
  const keys = Object.keys(input).sort(compareCanonicalText);
  const expectedKeys = ['checksum', 'deleteRoleIds', 'generatedAt', 'roleDataHash', 'signature', 'version'];
  if (
    keys.length !== expectedKeys.length
    || keys.some((key, index) => key !== expectedKeys[index])
    || typeof input.version !== 'number'
    || !Number.isInteger(input.version)
    || typeof input.roleDataHash !== 'string'
    || !Array.isArray(input.deleteRoleIds)
    || input.deleteRoleIds.some((id) => typeof id !== 'string' || !id.trim())
    || typeof input.generatedAt !== 'string'
    || Number.isNaN(Date.parse(input.generatedAt))
    || new Date(input.generatedAt).toISOString() !== input.generatedAt
    || typeof input.checksum !== 'string'
    || typeof input.signature !== 'string'
  ) return null;
  return {
    version: input.version,
    roleDataHash: input.roleDataHash,
    deleteRoleIds: input.deleteRoleIds.map(String),
    generatedAt: input.generatedAt,
    checksum: input.checksum,
    signature: input.signature,
  };
}

export function validateCustomerPermissionMigrationManifest(
  value: Prisma.JsonValue | undefined,
  roles: readonly Role[],
  verifier: CustomerPermissionMigrationManifestVerifier,
): CustomerPermissionMigrationManifest {
  if (!verifier || typeof verifier.verify !== 'function') {
    throw new Error('CUSTOMER_PERMISSION_MIGRATION_SIGNING_KEY_REQUIRED');
  }
  if (
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && typeof (value as Record<string, Prisma.JsonValue>).signature !== 'string'
  ) {
    throw new Error('CUSTOMER_PERMISSION_MIGRATION_MANIFEST_SIGNATURE_INVALID');
  }
  const manifest = parseCustomerPermissionMigrationManifest(value);
  if (!manifest) throw new Error('CUSTOMER_PERMISSION_MIGRATION_MANIFEST_REQUIRED');
  if (manifest.version !== CUSTOMER_PERMISSION_SCOPE_BASELINE_VERSION) {
    throw new Error('CUSTOMER_PERMISSION_MIGRATION_MANIFEST_STALE');
  }
  if (!/^[a-f0-9]{64}$/.test(manifest.roleDataHash)) {
    throw new Error('CUSTOMER_PERMISSION_MIGRATION_MANIFEST_STALE');
  }
  if (
    !/^[a-f0-9]{64}$/i.test(manifest.checksum)
    || manifest.checksum !== computeCustomerPermissionMigrationManifestChecksum(manifest)
  ) {
    throw new Error('CUSTOMER_PERMISSION_MIGRATION_MANIFEST_CHECKSUM_INVALID');
  }
  if (!verifier.verify(manifest.checksum, manifest.signature)) {
    throw new Error('CUSTOMER_PERMISSION_MIGRATION_MANIFEST_SIGNATURE_INVALID');
  }
  const canonicalDeleteRoleIds = Array.from(new Set(manifest.deleteRoleIds)).sort(compareCanonicalText);
  if (canonicalDeleteRoleIds.length !== manifest.deleteRoleIds.length) {
    throw new Error('CUSTOMER_PERMISSION_MIGRATION_MANIFEST_DUPLICATE_ROLE_ID');
  }
  if (canonicalDeleteRoleIds.some((roleId, index) => roleId !== manifest.deleteRoleIds[index])) {
    throw new Error('CUSTOMER_PERMISSION_MIGRATION_MANIFEST_ROLE_IDS_NOT_CANONICAL');
  }
  const roleIds = new Set(roles.map((role) => String(role.id)));
  const unknownRoleId = manifest.deleteRoleIds.find((roleId) => !roleIds.has(roleId));
  if (unknownRoleId) {
    throw new Error('CUSTOMER_PERMISSION_MIGRATION_MANIFEST_UNKNOWN_ROLE_ID');
  }
  if (manifest.roleDataHash !== computeCustomerPermissionRoleDataHash(roles)) {
    throw new Error('CUSTOMER_PERMISSION_MIGRATION_MANIFEST_STALE');
  }
  return {
    ...manifest,
    deleteRoleIds: canonicalDeleteRoleIds,
  };
}

function permissionsSignature(permissions: Permission[] = []): string {
  return JSON.stringify(permissions
    .map((permission) => ({
      module: permission.module,
      actions: [...(permission.actions || [])].sort(),
    }))
    .sort((left, right) => compareCanonicalText(left.module, right.module)));
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

function mergeDefaultRolePermissionBaseline(role: Role): Role {
  const seed = DEFAULT_ROLES.find((candidate) => candidate.id === role.id);
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

function migrateLegacyOrderReviewListPermission(role: Role): Role {
  const permissions = role.permissions || [];
  const legacyCombinedPermissions = permissions.filter((permission) => permission.module === '订单/订单审核台');
  if (legacyCombinedPermissions.length) {
    const legacyActions = Array.from(new Set(legacyCombinedPermissions.flatMap((permission) => permission.actions || ['read'])));
    const withoutLegacy = permissions.filter((permission) => permission.module !== '订单/订单审核台');
    const hasReviewList = withoutLegacy.some((permission) => permission.module === PERMISSION_KEYS.ORDER_REVIEW_LIST);
    const existingReviewAction = withoutLegacy.find((permission) => permission.module === PERMISSION_KEYS.ORDER_REVIEW);
    const migrated = withoutLegacy.map((permission) => (
      permission.module === PERMISSION_KEYS.ORDER_REVIEW
        ? { ...permission, actions: Array.from(new Set([...(permission.actions || []), ...legacyActions])) }
        : permission
    ));
    if (!hasReviewList) migrated.push({ module: PERMISSION_KEYS.ORDER_REVIEW_LIST, actions: ['read'] });
    if (!existingReviewAction) migrated.push({ module: PERMISSION_KEYS.ORDER_REVIEW, actions: legacyActions });
    return { ...role, permissions: sanitizeRolePermissions(migrated) };
  }
  if (permissions.some((permission) => permission.module === PERMISSION_KEYS.ORDER_REVIEW_LIST)) {
    return role;
  }
  const previousReviewListModules = new Set<string>([
    PERMISSION_KEYS.ORDER_REVIEW,
    PERMISSION_KEYS.ORDER_MANAGE,
    PERMISSION_KEYS.ORDER_CREATE,
  ]);
  const previouslyCouldReadReviewList = permissions.some((permission) => (
    previousReviewListModules.has(permission.module)
    && (permission.actions || []).some((action) => ['read', 'write', 'delete', 'admin'].includes(action))
  ));
  if (!previouslyCouldReadReviewList) return role;
  return {
    ...role,
    permissions: sanitizeRolePermissions([
      ...permissions,
      { module: PERMISSION_KEYS.ORDER_REVIEW_LIST, actions: ['read'] },
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

function readCustomerPermissionBaselineVersion(value: Prisma.JsonValue | undefined): number {
  if (value === undefined) return 0;
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || typeof (value as Record<string, Prisma.JsonValue>).version !== 'number'
    || !Number.isInteger((value as Record<string, Prisma.JsonValue>).version)
  ) {
    throw new Error('CUSTOMER_PERMISSION_MIGRATION_MARKER_INVALID');
  }
  return Number((value as Record<string, Prisma.JsonValue>).version);
}

export function assertCustomerPermissionMigrationPrerequisites(
  rolePermissionBaselineValue: Prisma.JsonValue | undefined,
): void {
  if (readBaselineVersion(rolePermissionBaselineValue) < ROLE_PERMISSION_ACTION_BASELINE_VERSION) {
    throw new Error('CUSTOMER_PERMISSION_MIGRATION_ROLE_BASELINE_REQUIRED');
  }
}

function normalizeStoredPermissionModule(module: string): string {
  return String(module || '').replace(/\s+/g, '').trim();
}

function storedPermissionModuleEquals(permission: Permission, module: string): boolean {
  return normalizeStoredPermissionModule(permission.module) === normalizeStoredPermissionModule(module);
}

function hasStoredPermissionModule(permissions: Permission[], module: string): boolean {
  return permissions.some((permission) => storedPermissionModuleEquals(permission, module));
}

function hasStoredPermissionAction(permissions: Permission[], module: string, action: string): boolean {
  return permissions.some((permission) => (
    storedPermissionModuleEquals(permission, module)
    && (permission.actions || []).includes(action)
  ));
}

function hasStoredWritePermission(permissions: Permission[], module: string): boolean {
  return permissions.some((permission) => (
    storedPermissionModuleEquals(permission, module)
    && (permission.actions || []).some((action) => ['write', 'delete', 'admin'].includes(action))
  ));
}

function grantStoredPermission(
  permissions: Permission[],
  module: string,
  actions: string[],
): Permission[] {
  const index = permissions.findIndex((permission) => storedPermissionModuleEquals(permission, module));
  if (index < 0) return [...permissions, { module, actions: [...actions] }];
  const current = permissions[index];
  const nextActions = Array.from(new Set([...(current.actions || []), ...actions]));
  if (
    nextActions.length === (current.actions || []).length
    && nextActions.every((action, actionIndex) => action === current.actions[actionIndex])
  ) return permissions;
  return permissions.map((permission, permissionIndex) => (
    permissionIndex === index ? { ...permission, actions: nextActions } : permission
  ));
}

function migrateLegacyCustomerRole(role: Role, deleteRoleIds: ReadonlySet<string>): Role {
  const storedPermissions = (role.permissions || []).map((permission) => ({
    ...permission,
    actions: [...(permission.actions || [])],
  }));
  let permissions = storedPermissions;

  if (hasStoredPermissionAction(storedPermissions, PERMISSION_KEYS.CUSTOMERS, 'read')) {
    permissions = grantStoredPermission(permissions, PERMISSION_KEYS.CUSTOMER_LIST, ['read']);
    permissions = grantStoredPermission(permissions, PERMISSION_KEYS.CUSTOMER_DETAIL, ['read']);
  }
  if (hasStoredPermissionModule(storedPermissions, PERMISSION_KEYS.CUSTOMER_ASSIGN)) {
    permissions = grantStoredPermission(permissions, PERMISSION_KEYS.CUSTOMER_TRANSFER, ['read', 'write']);
    permissions = grantStoredPermission(permissions, PERMISSION_KEYS.CUSTOMER_RELEASE_TO_POOL, ['read', 'write']);
  }
  if (hasStoredWritePermission(storedPermissions, PERMISSION_KEYS.CUSTOMER_EDIT)) {
    permissions = grantStoredPermission(permissions, PERMISSION_KEYS.CUSTOMER_EDIT_PROFILE, ['read', 'write']);
    permissions = grantStoredPermission(permissions, PERMISSION_KEYS.CUSTOMER_SET_TAGS, ['read', 'write']);
    permissions = grantStoredPermission(permissions, PERMISSION_KEYS.CUSTOMER_SET_TODOS, ['read', 'write']);
    permissions = grantStoredPermission(permissions, PERMISSION_KEYS.CUSTOMER_EDIT_ATTRIBUTION, ['read', 'write']);
  }
  if (deleteRoleIds.has(String(role.id))) {
    permissions = grantStoredPermission(permissions, PERMISSION_KEYS.CUSTOMER_DELETE, ['read', 'delete']);
  } else {
    permissions = permissions.filter((permission) => (
      !storedPermissionModuleEquals(permission, PERMISSION_KEYS.CUSTOMER_DELETE)
    ));
  }

  const currentScopes = role.dataScopes;
  // Fresh migrations persist the canonical three-value model. Databases that
  // already completed the v1 migration keep their signed baseline intact;
  // runtime normalization gives both legacy values the same department-tree
  // semantics, and the role editor writes `department` on the next save.
  const dataScopes = currentScopes?.customers === 'department_only' || currentScopes?.customers === 'department_and_descendants'
    ? { ...currentScopes, customers: 'department' as const }
    : currentScopes;
  return { ...role, permissions, dataScopes };
}

async function migrateLegacyCustomerRoleRows(
  store: CustomerPermissionMigrationStore,
  rows: PrismaRoleRow[],
  deleteRoleIds: ReadonlySet<string>,
): Promise<{ migratedRoleIds: string[]; expectedUpdatedAtByRoleId: Map<string, number> }> {
  const migratedRoleIds: string[] = [];
  const expectedUpdatedAtByRoleId = new Map(
    rows.map((row) => [String(row.id), new Date(row.updatedAt).getTime()]),
  );
  for (const row of rows) {
    const current = mapPrismaRole(row);
    const migrated = migrateLegacyCustomerRole(current, deleteRoleIds);
    const permissionsChanged = permissionsSignature(current.permissions) !== permissionsSignature(migrated.permissions);
    const scopesChanged = dataScopesSignature(current.dataScopes) !== dataScopesSignature(migrated.dataScopes);
    if (!permissionsChanged && !scopesChanged) continue;

    const updatedAt = new Date();
    const data: Prisma.RoleUpdateInput = {
      permissions: migrated.permissions as unknown as Prisma.InputJsonValue,
      updatedAt,
    };
    if (scopesChanged) {
      data.dataScopes = (migrated.dataScopes || {}) as unknown as Prisma.InputJsonValue;
    }
    const update = await store.role.updateMany({
      where: { id: row.id, updatedAt: row.updatedAt },
      data,
    });
    if (update.count !== 1) {
      throw new Error('CUSTOMER_PERMISSION_MIGRATION_ROLE_CONFLICT');
    }
    migratedRoleIds.push(String(row.id));
    expectedUpdatedAtByRoleId.set(String(row.id), updatedAt.getTime());
  }
  return { migratedRoleIds, expectedUpdatedAtByRoleId };
}

function assertCustomerPermissionMigrationRoleSet(
  rows: PrismaRoleRow[],
  expectedRoles: readonly Role[],
  expectedUpdatedAtByRoleId: ReadonlyMap<string, number>,
): void {
  const hasExpectedRows = (
    rows.length === expectedRoles.length
    && rows.every((row) => (
      expectedUpdatedAtByRoleId.get(String(row.id)) === new Date(row.updatedAt).getTime()
    ))
  );
  const hasExpectedData = (
    computeCustomerPermissionRoleDataHash(rows.map(mapPrismaRole))
    === computeCustomerPermissionRoleDataHash(expectedRoles)
  );
  if (!hasExpectedRows || !hasExpectedData) {
    throw new Error('CUSTOMER_PERMISSION_MIGRATION_CONCURRENT_ROLE_CHANGE');
  }
}

async function migrateRoleRows(store: RoleMigrationStore, applyPermissionBaseline: boolean): Promise<number> {
  const rows = await store.role.findMany();
  let changed = 0;

  for (const row of rows) {
    const current = mapPrismaRole(row);
    const migrated = mergeRoleWithDefaultAccess(
      applyPermissionBaseline
        ? migrateLegacyOrderReviewListPermission(migrateLegacyRecoveryReviewListPermission(mergeDefaultRolePermissionBaseline(current)))
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

export async function migrateCustomerPermissionAndScopeBaseline(
  prisma: CustomerPermissionMigrationPrisma,
  verifier: CustomerPermissionMigrationManifestVerifier,
): Promise<CustomerPermissionMigrationSummary> {
  if (!prisma.$transaction || !prisma.appStorage) {
    throw new Error('CUSTOMER_PERMISSION_MIGRATION_TRANSACTION_REQUIRED');
  }

  try {
    return await prisma.$transaction(async (transaction) => {
      const store = transaction as CustomerPermissionMigrationStore;
      const marker = await store.appStorage.findUnique({
        where: { key: CUSTOMER_PERMISSION_SCOPE_BASELINE_KEY },
      });
      if (readCustomerPermissionBaselineVersion(marker?.value) >= CUSTOMER_PERMISSION_SCOPE_BASELINE_VERSION) {
        return { migratedRoleIds: [], version: CUSTOMER_PERMISSION_SCOPE_BASELINE_VERSION };
      }

      const rolePermissionBaseline = await store.appStorage.findUnique({
        where: { key: ROLE_PERMISSION_ACTION_BASELINE_KEY },
      });
      assertCustomerPermissionMigrationPrerequisites(rolePermissionBaseline?.value);

      const rows = await store.role.findMany();
      const roles = rows.map(mapPrismaRole);
      const manifestRow = await store.appStorage.findUnique({
        where: { key: CUSTOMER_PERMISSION_SCOPE_MIGRATION_MANIFEST_KEY },
      });
      const manifest = validateCustomerPermissionMigrationManifest(manifestRow?.value, roles, verifier);
      const deleteRoleIds = new Set(manifest.deleteRoleIds);
      const expectedRoles = roles.map((role) => migrateLegacyCustomerRole(role, deleteRoleIds));
      const { migratedRoleIds, expectedUpdatedAtByRoleId } = await migrateLegacyCustomerRoleRows(
        store,
        rows as PrismaRoleRow[],
        deleteRoleIds,
      );
      const finalRows = await store.role.findMany();
      assertCustomerPermissionMigrationRoleSet(
        finalRows as PrismaRoleRow[],
        expectedRoles,
        expectedUpdatedAtByRoleId,
      );
      const migratedAt = new Date().toISOString();
      const markerValue = {
        version: CUSTOMER_PERMISSION_SCOPE_BASELINE_VERSION,
        migratedAt,
        migratedRoleCount: migratedRoleIds.length,
        manifestChecksum: manifest.checksum,
      };
      await store.appStorage.upsert({
        where: { key: CUSTOMER_PERMISSION_SCOPE_BASELINE_KEY },
        create: {
          key: CUSTOMER_PERMISSION_SCOPE_BASELINE_KEY,
          value: markerValue as unknown as Prisma.InputJsonValue,
        },
        update: {
          value: markerValue as unknown as Prisma.InputJsonValue,
          updatedAt: new Date(),
        },
      });
      return { migratedRoleIds, version: CUSTOMER_PERMISSION_SCOPE_BASELINE_VERSION };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    throw new Error(toSafeCustomerPermissionMigrationErrorCode(error));
  }
}
