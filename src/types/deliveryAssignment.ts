export interface DeliveryAssignmentParticipant {
  userId: string;
  paused: boolean;
}

export interface DeliveryAssignmentConfig {
  enabled: boolean;
  participants: DeliveryAssignmentParticipant[];
  lastAssignedUserId?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface DeliveryAssignmentUser {
  id: string;
  name: string;
  isActive: boolean;
  employmentStatus?: string;
}

export interface DeliveryAssignmentParticipantView extends DeliveryAssignmentParticipant {
  userName: string;
  eligible: boolean;
  status: 'active' | 'paused' | 'inactive' | 'left' | 'missing';
}

export interface DeliveryAssignmentConfigView extends DeliveryAssignmentConfig {
  participantViews: DeliveryAssignmentParticipantView[];
  nextAssigneeId?: string;
  nextAssigneeName?: string;
}
