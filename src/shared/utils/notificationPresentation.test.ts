import assert from 'node:assert/strict';
import { buildNotificationPreviews } from './notificationPresentation';

const lead = (id: string, minute: number) => ({
  id,
  eventType: 'LEAD_ASSIGNED',
  businessType: 'lead',
  businessId: id,
  title: '新线索待处理',
  content: `客户${id}`,
  severity: 'S1' as const,
  actionUrl: `/leads?leadId=${id}`,
  requiresAck: true,
  createdAt: `2026-08-20T02:0${minute}:00.000Z`,
  updatedAt: `2026-08-20T02:0${minute}:00.000Z`,
});

const grouped = buildNotificationPreviews([lead('1', 4), lead('2', 2), lead('3', 0)]);
assert.equal(grouped.length, 1);
assert.equal(grouped[0].kind, 'group');
assert.equal(grouped[0].count, 3);
assert.equal(grouped[0].title, '3条新线索待处理');
assert.equal(grouped[0].actionUrl, '/notifications');

const notGrouped = buildNotificationPreviews([lead('1', 8), lead('2', 0)]);
assert.equal(notGrouped.length, 2, '不足三条或超出五分钟窗口时保持单条展示');

console.log('notification presentation tests passed');
