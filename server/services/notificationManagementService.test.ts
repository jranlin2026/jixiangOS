import assert from 'node:assert/strict';
import { createNotificationManagementService } from './notificationManagementService';

const rows: any[] = [];
const prisma = {
  notificationRule: {
    findMany: async () => rows,
    upsert: async ({ where, create, update }: any) => {
      const current = rows.find((row) => row.eventType === where.eventType);
      if (current) Object.assign(current, update, { updatedAt: new Date('2026-08-08T00:00:00Z') });
      else rows.push({ ...create, updatedAt: new Date('2026-08-08T00:00:00Z') });
      return rows.find((row) => row.eventType === where.eventType);
    },
  },
  notificationDelivery: { findMany: async () => [], count: async () => 0 },
  userChannelBinding: { findUnique: async () => null },
};
const service = createNotificationManagementService(prisma as any);
const admin: any = { id: 'admin', name: '管理员', role: '超级管理员', permissions: [{ module: '全部', actions: ['admin'] }] };
const sales: any = { id: 'sales', name: '销售', role: '销售专员', permissions: [] };

const denied = await service.listRules(sales);
assert.equal(denied.code, 403);

const initial = await service.listRules(admin);
assert.equal(initial.code, 0);
assert.equal((initial.data as any[])?.length, 3);
const okrRule = (initial.data as any[])?.find((rule) => rule.eventType === 'OKR_WORKFLOW');
assert.deepEqual(okrRule, {
  eventType: 'OKR_WORKFLOW',
  label: '目标管理',
  description: '周检视提前提醒、风险即时提醒以及主管升级规则',
  enabled: true,
  channels: ['FEISHU'],
  config: { checkInReminderMinutes: 1440, riskEscalationMinutes: 1440 },
  updatedAt: undefined,
  updatedByName: undefined,
});

const updated = await service.updateRule('LEAD_WORKFLOW', {
  enabled: true,
  channels: ['FEISHU', 'INVALID'],
  config: { ackReminderMinutes: 8, ackEscalationMinutes: -1 },
}, admin);
assert.equal(updated.code, 0);
assert.deepEqual((updated.data as any)?.channels, ['FEISHU']);
assert.equal((updated.data as any)?.config.ackReminderMinutes, 8);
assert.equal((updated.data as any)?.config.ackEscalationMinutes, 15);

const updatedOkr = await service.updateRule('OKR_WORKFLOW', {
  enabled: false,
  channels: ['FEISHU'],
  config: { checkInReminderMinutes: 720, riskEscalationMinutes: 2880 },
}, admin);
assert.equal(updatedOkr.code, 0);
assert.equal((updatedOkr.data as any)?.enabled, false);
assert.deepEqual((updatedOkr.data as any)?.config, { checkInReminderMinutes: 720, riskEscalationMinutes: 2880 });

console.log('notification management service tests passed');
