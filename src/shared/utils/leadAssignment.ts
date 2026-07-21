import type { LeadFlowConfig } from '../../types/lead';
import type { DataScopeDomain } from '../../types/role';
import type { AuthenticatedUser } from '../../types/auth';
import type { Role } from '../../types/role';
import type { User } from '../../types/settings';
import { STORAGE_KEYS } from './constants';
import { filterUsersByCurrentDataScope } from './dataVisibility';
import { canReceiveLead } from './permissions';

export const NO_LEAD_FLOW_PARTICIPANTS_MARKER = '__lead_flow_no_participants__';

export function isActiveLeadAssignableUser(user: User): boolean {
  return user.isActive && (user.employmentStatus || 'active') !== 'left';
}

export function getLeadReceiveEligibleUsers(users: User[], roles: Role[]): User[] {
  return users.filter((user) => canReceiveLead(user, roles));
}

function readStoredRoles(): Role[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ROLES);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getLeadAssignmentCandidates(
  users: User[],
  config?: LeadFlowConfig | null,
  roles: Role[] = readStoredRoles(),
): User[] {
  const eligibleUsers = getLeadReceiveEligibleUsers(users, roles);
  if (!config || !config.participantUserIds.length) return eligibleUsers;
  if (config.participantUserIds.includes(NO_LEAD_FLOW_PARTICIPANTS_MARKER)) return [];

  const participantIds = new Set(config.participantUserIds);
  return eligibleUsers.filter((user) => participantIds.has(user.id));
}

function readStoredUsers(): User[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.USERS);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mergeWithStoredUsers(users: User[]): User[] {
  const merged = new Map<string, User>();
  readStoredUsers().forEach((user) => {
    if (user?.id) merged.set(user.id, user);
  });
  users.forEach((user) => {
    if (user?.id) merged.set(user.id, { ...merged.get(user.id), ...user });
  });
  return Array.from(merged.values());
}

export function getScopedLeadAssignmentCandidates(
  users: User[],
  config: LeadFlowConfig | null | undefined,
  domain: Extract<DataScopeDomain, 'leads' | 'customers'>,
  currentUser?: AuthenticatedUser | null,
): User[] {
  const flowCandidates = getLeadAssignmentCandidates(mergeWithStoredUsers(users), config);
  const scopedCandidates = filterUsersByCurrentDataScope(
    flowCandidates,
    domain,
    currentUser || undefined,
  );
  return sortLeadAssignmentCandidates(scopedCandidates);
}

export function sortLeadAssignmentCandidates(users: User[]): User[] {
  return [...users].sort((a, b) => (a.name || a.account || '').localeCompare(b.name || b.account || '', 'zh-Hans-CN'));
}
