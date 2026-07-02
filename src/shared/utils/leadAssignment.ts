import type { LeadFlowConfig } from '../../types/lead';
import type { User } from '../../types/settings';

export const NO_LEAD_FLOW_PARTICIPANTS_MARKER = '__lead_flow_no_participants__';

export function isActiveLeadAssignableUser(user: User): boolean {
  return user.isActive && (user.employmentStatus || 'active') !== 'left';
}

export function getLeadAssignmentCandidates(users: User[], config?: LeadFlowConfig | null): User[] {
  const activeUsers = users.filter(isActiveLeadAssignableUser);
  if (!config || !config.participantUserIds.length) return activeUsers;
  if (config.participantUserIds.includes(NO_LEAD_FLOW_PARTICIPANTS_MARKER)) return [];

  const participantIds = new Set(config.participantUserIds);
  return activeUsers.filter((user) => participantIds.has(user.id));
}

export function sortLeadAssignmentCandidates(users: User[]): User[] {
  return [...users].sort((a, b) => (a.name || a.account || '').localeCompare(b.name || b.account || '', 'zh-Hans-CN'));
}
