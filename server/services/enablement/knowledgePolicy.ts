import type { AuthenticatedUser } from '../../../src/types/auth';
import type { KnowledgeDocumentDto } from '../../../src/types/enablement';
import { hasPermission, isSuperAdmin, PERMISSION_KEYS } from '../../../src/shared/utils/permissions';

type DepartmentFacts = { id: string; managerId?: string | null };

function hasReviewWriteAuthorization(actor: AuthenticatedUser): boolean {
  return actor.permissions.some((permission) => (
    (permission.module === PERMISSION_KEYS.ENABLEMENT_REVIEW || permission.module === '全部')
    && permission.actions.some((action) => ['write', 'delete', 'admin'].includes(action))
  ));
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
  if (!actor.isActive || !hasReviewWriteAuthorization(actor)) return false;
  if (isSuperAdmin(actor)) return true;
  return hasPermission(actor, PERMISSION_KEYS.ENABLEMENT_REVIEW, 'write') && department.managerId === actor.id;
}

export function canPublishKnowledge(actor: AuthenticatedUser): boolean {
  return hasPermission(actor, PERMISSION_KEYS.ENABLEMENT_PUBLISH, 'write');
}
