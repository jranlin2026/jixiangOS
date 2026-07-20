import type { NormalizedRoleDataScopes, Permission, RoleDataScopes } from '../../types/role';
import { normalizeRoleDataScopes } from '../../shared/utils/organizationConfig';
import { getRoleEditorPermissionActions, normalizePermissionKey, PERMISSION_KEYS } from '../../shared/utils/permissions';
import { normalizeRoleNameForComparison } from '../../shared/utils/roles';

export function hasDuplicateRoleName(
  name: string,
  roles: Array<{ id: string; name: string }>,
  currentRoleId?: string,
): boolean {
  const normalizedName = normalizeRoleNameForComparison(name);
  return Boolean(normalizedName) && roles.some((role) => (
    role.id !== currentRoleId
    && normalizeRoleNameForComparison(role.name) === normalizedName
  ));
}

export function buildRoleEditorPermissions(modules: Iterable<string>): Permission[] {
  const selected = new Set(modules);
  if (selected.has(PERMISSION_KEYS.CUSTOMER_PUBLIC_POOL_CLAIM)) {
    selected.add(PERMISSION_KEYS.CUSTOMER_PUBLIC_POOL_VIEW);
  }
  return Array.from(selected)
    .filter((module) => normalizePermissionKey(module) !== normalizePermissionKey(PERMISSION_KEYS.CUSTOMERS))
    .sort()
    .map((module) => ({ module, actions: getRoleEditorPermissionActions(module) }));
}

export function normalizeRoleEditorDataScopes(
  code: string | undefined,
  dataScopes?: RoleDataScopes,
  permissions?: Permission[],
): NormalizedRoleDataScopes {
  return normalizeRoleDataScopes({ code: code || '', dataScopes, permissions });
}
