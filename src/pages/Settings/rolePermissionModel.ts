import type { NormalizedRoleDataScopes, Permission, RoleDataScopes } from '../../types/role';
import { normalizeRoleDataScopes } from '../../shared/utils/organizationConfig';
import { getRoleEditorPermissionActions, normalizePermissionKey, PERMISSION_KEYS } from '../../shared/utils/permissions';

export function buildRoleEditorPermissions(modules: Iterable<string>): Permission[] {
  return Array.from(new Set(modules))
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
