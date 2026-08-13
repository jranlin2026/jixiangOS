import type { AuthenticatedUser } from '../../types/auth';
import { hasPermission, PERMISSION_KEYS } from './permissions';

export const ACADEMY_ACCESS_PERMISSION_KEYS = [
  PERMISSION_KEYS.ACADEMY_VIEW,
  PERMISSION_KEYS.ACADEMY_PLAN_MANAGE,
  PERMISSION_KEYS.ACADEMY_COURSE_MANAGE,
  PERMISSION_KEYS.ACADEMY_SESSION_MANAGE,
  PERMISSION_KEYS.ACADEMY_ENGAGEMENT_MANAGE,
  PERMISSION_KEYS.ACADEMY_REVIEW_MANAGE,
] as const;

export function canAccessAcademy(
  user: Pick<AuthenticatedUser, 'role' | 'roleId' | 'permissions' | 'isActive'> | null | undefined,
): boolean {
  return ACADEMY_ACCESS_PERMISSION_KEYS.some((permissionKey) => hasPermission(user, permissionKey));
}
