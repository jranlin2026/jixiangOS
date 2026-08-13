import type { AuthenticatedUser } from '../../types/auth';
import { hasPermission, PERMISSION_KEYS } from './permissions';

export const OKR_ACCESS_PERMISSION_KEYS = [
  PERMISSION_KEYS.OKR_SELF_READ,
  PERMISSION_KEYS.OKR_TEAM_READ,
  PERMISSION_KEYS.OKR_CREATE,
  PERMISSION_KEYS.OKR_CHECK_IN,
  PERMISSION_KEYS.OKR_DEPARTMENT_MANAGE,
  PERMISSION_KEYS.OKR_COMPANY_MANAGE,
  PERMISSION_KEYS.OKR_CYCLE_MANAGE,
  PERMISSION_KEYS.OKR_SCORE_CLOSE,
  PERMISSION_KEYS.OKR_METRIC_BIND,
] as const;

export function canAccessOkr(
  user: Pick<AuthenticatedUser, 'role' | 'roleId' | 'permissions' | 'isActive'> | null | undefined,
): boolean {
  return OKR_ACCESS_PERMISSION_KEYS.some((permissionKey) => hasPermission(user, permissionKey));
}
