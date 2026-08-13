import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { AuthenticatedUser } from '../../src/types/auth';
import { isSuperAdmin } from '../../src/shared/utils/permissions';
import { failure, success } from '../api/response';
import { notificationRuleDefaults } from './notificationWorkflow';

type ManagementPrisma = Pick<PrismaClient, 'notificationRule' | 'notificationDelivery' | 'userChannelBinding'>;

const RULE_LABELS: Record<string, { label: string; description: string }> = {
  LEAD_WORKFLOW: { label: '线索分配与首次跟进', description: '新线索确认、首次跟进以及主管升级规则' },
  CUSTOMER_TODO_WORKFLOW: { label: '客户待办', description: '待办临期、到期、逾期以及主管升级规则' },
  OKR_WORKFLOW: { label: '目标管理', description: '周检视提前提醒、风险即时提醒以及主管升级规则' },
};

function channels(value: unknown) {
  return Array.isArray(value) && value.includes('FEISHU') ? ['FEISHU'] : [];
}

function configFor(eventType: string, input: unknown) {
  const defaults = notificationRuleDefaults[eventType as keyof typeof notificationRuleDefaults];
  if (!defaults) return null;
  const source = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => {
    if (typeof fallback === 'boolean') return [key, typeof source[key] === 'boolean' ? source[key] : fallback];
    const value = Math.trunc(Number(source[key]));
    return [key, Number.isFinite(value) && value >= 0 && value <= 30 * 24 * 60 ? value : fallback];
  }));
}

function ruleView(eventType: string, stored?: any) {
  const meta = RULE_LABELS[eventType];
  return {
    eventType,
    label: meta.label,
    description: meta.description,
    enabled: stored?.enabled !== false,
    channels: stored ? channels(stored.channels) : ['FEISHU'],
    config: { ...notificationRuleDefaults[eventType as keyof typeof notificationRuleDefaults], ...(stored?.config || {}) },
    updatedAt: stored?.updatedAt?.toISOString(),
    updatedByName: stored?.updatedByName || undefined,
  };
}

export function createNotificationManagementService(prisma: ManagementPrisma) {
  return {
    async listRules(user: AuthenticatedUser) {
      if (!isSuperAdmin(user)) return failure('仅超级管理员可以配置消息提醒', 403);
      const rows = await prisma.notificationRule.findMany({ where: { eventType: { in: Object.keys(RULE_LABELS) } } });
      const map = new Map(rows.map((row) => [row.eventType, row]));
      return success(Object.keys(RULE_LABELS).map((eventType) => ruleView(eventType, map.get(eventType))));
    },

    async updateRule(eventType: string, input: any, user: AuthenticatedUser) {
      if (!isSuperAdmin(user)) return failure('仅超级管理员可以配置消息提醒', 403);
      if (!RULE_LABELS[eventType]) return failure('提醒规则不存在', 404);
      const config = configFor(eventType, input?.config);
      if (!config) return failure('提醒规则配置无效', 400);
      const stored = await prisma.notificationRule.upsert({
        where: { eventType },
        create: {
          id: `notification-rule-${randomUUID()}`,
          eventType,
          enabled: input?.enabled !== false,
          channels: channels(input?.channels),
          config,
          updatedById: user.id,
          updatedByName: user.name,
        },
        update: {
          enabled: input?.enabled !== false,
          channels: channels(input?.channels),
          config,
          updatedById: user.id,
          updatedByName: user.name,
        },
      });
      return success(ruleView(eventType, stored));
    },

    async listDeliveries(user: AuthenticatedUser, input: { page?: number; pageSize?: number } = {}) {
      if (!isSuperAdmin(user)) return failure('仅超级管理员可以查看投递日志', 403);
      const page = Math.max(1, Math.trunc(Number(input.page) || 1));
      const pageSize = Math.max(1, Math.min(100, Math.trunc(Number(input.pageSize) || 10)));
      const [rows, total] = await Promise.all([
        prisma.notificationDelivery.findMany({
          include: { notification: true },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.notificationDelivery.count(),
      ]);
      return success({
        items: rows.map((row) => ({
          id: row.id,
          notificationId: row.notificationId,
          channel: row.channel,
          status: row.status,
          attemptCount: row.attemptCount,
          recipientId: row.notification.recipientId,
          recipientName: row.notification.recipientName,
          title: row.notification.title,
          lastError: row.lastError || undefined,
          sentAt: row.sentAt?.toISOString(),
          createdAt: row.createdAt.toISOString(),
        })),
        pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      });
    },

    async channelStatus(user: AuthenticatedUser) {
      const binding = await prisma.userChannelBinding.findUnique({
        where: { userId_channel: { userId: user.id, channel: 'FEISHU' } },
      });
      return success({
        channel: 'FEISHU',
        configured: Boolean(process.env.FEISHU_APP_ID && process.env.FEISHU_APP_SECRET && process.env.PUBLIC_APP_URL),
        bound: Boolean(binding?.active && binding.externalUserId),
        verifiedAt: binding?.verifiedAt?.toISOString(),
        lastError: binding?.lastError || undefined,
      });
    },
  };
}
