import type { DeliveryAssignmentConfig, DeliveryAssignmentUser } from '../../src/types/deliveryAssignment';

export function selectNextDeliveryAssignee(
  config: DeliveryAssignmentConfig,
  users: DeliveryAssignmentUser[],
): { user: DeliveryAssignmentUser; participantIndex: number } | null {
  if (!config.enabled || !config.participants.length) return null;
  const usersById = new Map(users.map((user) => [user.id, user]));
  const lastIndex = config.lastAssignedUserId
    ? config.participants.findIndex((item) => item.userId === config.lastAssignedUserId)
    : -1;

  for (let offset = 1; offset <= config.participants.length; offset += 1) {
    const participantIndex = (lastIndex + offset) % config.participants.length;
    const participant = config.participants[participantIndex];
    const user = usersById.get(participant.userId);
    if (!participant.paused && user?.isActive && (user.employmentStatus || 'active') === 'active') {
      return { user, participantIndex };
    }
  }
  return null;
}
