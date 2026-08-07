import { backendRequest } from './backendClient';
import type { PaginatedResponse } from './types';
import type {
  NotificationChannelStatus,
  NotificationDeliveryLog,
  NotificationItem,
  NotificationListStatus,
  NotificationRuleView,
} from '../types/notification';

export const notificationApi = {
  list(input: { page?: number; pageSize?: number; status?: NotificationListStatus; severity?: string; eventType?: string } = {}) {
    const params = new URLSearchParams();
    Object.entries(input).forEach(([key, value]) => {
      if (value !== undefined && value !== '') params.set(key, String(value));
    });
    return backendRequest<PaginatedResponse<NotificationItem>>(`/notifications?${params.toString()}`);
  },
  unreadCount: () => backendRequest<{ count: number }>('/notifications/unread-count'),
  markRead: (id: string) => backendRequest<NotificationItem>(`/notifications/${id}/read`, { method: 'POST' }),
  markAllRead: () => backendRequest<{ count: number }>('/notifications/read-all', { method: 'POST' }),
  acknowledge: (id: string) => backendRequest<NotificationItem>(`/notifications/${id}/acknowledge`, { method: 'POST' }),
  listRules: () => backendRequest<NotificationRuleView[]>('/notification-settings/rules'),
  updateRule: (eventType: string, input: Pick<NotificationRuleView, 'enabled' | 'channels' | 'config'>) => (
    backendRequest<NotificationRuleView>(`/notification-settings/rules/${eventType}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    })
  ),
  listDeliveries: (page = 1, pageSize = 10) => (
    backendRequest<PaginatedResponse<NotificationDeliveryLog>>(`/notification-settings/deliveries?page=${page}&pageSize=${pageSize}`)
  ),
  channelStatus: () => backendRequest<NotificationChannelStatus>('/notification-settings/channel-status'),
};
