import assert from 'node:assert/strict';
import { createNotificationWorker } from './notificationWorker';

const schedule = { id: 'schedule-1' } as any;
const delivery = { id: 'delivery-1', channel: 'FEISHU' } as any;
const calls: string[] = [];

const store = {
  claimSchedule: async () => {
    if (calls.includes('claim-schedule')) return null;
    calls.push('claim-schedule');
    return schedule;
  },
  publishSchedule: async (value: any) => {
    assert.equal(value.id, schedule.id);
    calls.push('publish-schedule');
  },
  retrySchedule: async () => calls.push('retry-schedule'),
  claimDelivery: async () => {
    if (calls.includes('claim-delivery')) return null;
    calls.push('claim-delivery');
    return delivery;
  },
  loadDeliveryContext: async () => ({
    delivery,
    notification: { id: 'notification-1', recipientId: 'user-1', title: '新线索' },
    recipient: { id: 'user-1', phone: '13800000000' },
    binding: { externalUserId: 'ou-user-1' },
  }),
  settleDelivery: async (_value: any, result: any) => calls.push(`settle:${result.status}`),
};

const worker = createNotificationWorker({
  store: store as any,
  adapters: {
    FEISHU: { send: async () => ({ status: 'SENT' as const }) },
  },
  workerId: 'worker-test',
  now: () => new Date('2026-08-08T02:00:00.000Z'),
});

const result = await worker.runOnce();
assert.deepEqual(result, { schedules: 1, deliveries: 1 });
assert.deepEqual(calls, [
  'claim-schedule',
  'publish-schedule',
  'claim-delivery',
  'settle:SENT',
]);

console.log('notification worker tests passed');
