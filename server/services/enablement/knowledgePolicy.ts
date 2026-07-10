import type { AuthenticatedUser } from '../../../src/types/auth';
import type { KnowledgeDocumentDto } from '../../../src/types/enablement';
import { getDefaultPermissionActions, hasPermission, isSuperAdmin, normalizePermissionKey, PERMISSION_KEYS } from '../../../src/shared/utils/permissions';

type DepartmentFacts = { id: string; managerId?: string | null };

const ALL_PERMISSION_KEY = normalizePermissionKey('全部');

function withoutReadOnlyAllPermission(actor: AuthenticatedUser): AuthenticatedUser {
  return {
    ...actor,
    permissions: actor.permissions.filter((permission) => (
      normalizePermissionKey(permission.module) !== ALL_PERMISSION_KEY
      || !getDefaultPermissionActions(permission.module, permission.actions).every((action) => action === 'read')
    )),
  };
}

export function canReadKnowledge(actor: AuthenticatedUser, document: Pick<KnowledgeDocumentDto, 'sensitivity' | 'visibility'>): boolean {
  if (!hasPermission(actor, PERMISSION_KEYS.ENABLEMENT_KNOWLEDGE)) return false;
  if (document.sensitivity !== 'INTERNAL' && !hasPermission(actor, PERMISSION_KEYS.ENABLEMENT_SENSITIVE)) {
    if (document.sensitivity !== 'DEPARTMENT') return false;
  }
  return document.visibility.some((rule) => (
    rule.subjectType === 'ALL_EMPLOYEES'
    || (rule.subjectType === 'DEPARTMENT' && rule.subjectId === actor.departmentId)
    || (rule.subjectType === 'ROLE' && rule.subjectId === actor.roleId)
    || (rule.subjectType === 'POSITION' && rule.subjectId === actor.positionId)
  ));
}

export function canReviewKnowledge(actor: AuthenticatedUser, department: DepartmentFacts): boolean {
  if (!actor.isActive) return false;
  const authorizedActor = withoutReadOnlyAllPermission(actor);
  if (!hasPermission(authorizedActor, PERMISSION_KEYS.ENABLEMENT_REVIEW, 'write')) return false;
  if (isSuperAdmin(authorizedActor)) return true;
  return department.managerId === actor.id;
}

export function canPublishKnowledge(actor: AuthenticatedUser): boolean {
  return hasPermission(actor, PERMISSION_KEYS.ENABLEMENT_PUBLISH, 'write');
}
