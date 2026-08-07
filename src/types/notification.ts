export type NotificationSeverity = 'S0' | 'S1' | 'S2' | 'S3';
export type NotificationListStatus = 'all' | 'unread' | 'pending' | 'resolved';

export interface NotificationItem {
  id: string;
  eventType: string;
  businessType: string;
  businessId: string;
  title: string;
  content?: string;
  severity: NotificationSeverity;
  actionUrl: string;
  requiresAck: boolean;
  readAt?: string;
  ackAt?: string;
  resolvedAt?: string;
  resolvedReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationRuleView {
  eventType: 'LEAD_WORKFLOW' | 'CUSTOMER_TODO_WORKFLOW';
  label: string;
  description: string;
  enabled: boolean;
  channels: string[];
  config: Record<string, number | boolean>;
  updatedAt?: string;
  updatedByName?: string;
}

export interface NotificationDeliveryLog {
  id: string;
  notificationId: string;
  channel: string;
  status: string;
  attemptCount: number;
  recipientId: string;
  recipientName: string;
  title: string;
  lastError?: string;
  sentAt?: string;
  createdAt: string;
}

export interface NotificationChannelStatus {
  channel: 'FEISHU';
  configured: boolean;
  bound: boolean;
  verifiedAt?: string;
  lastError?: string;
}
