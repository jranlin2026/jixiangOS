import type { NotificationPublisher } from './notificationService';

type Recipient = { id: string; name: string };
type WorkflowClient = {
  notificationRule: {
    findUnique(args: { where: { eventType: string } }): Promise<any | null>;
  };
};

type Rule<T> = {
  enabled: boolean;
  channels: Array<'FEISHU'>;
  config: T;
};

const DEFAULT_LEAD_RULE = {
  ackReminderMinutes: 20,
  firstFollowUpReminderMinutes: 60,
  firstFollowUpEscalationMinutes: 120,
};

const DEFAULT_TODO_RULE = {
  dueSoonMinutes: 30,
  overdueReminderMinutes: 120,
  escalateNextWorkday: true,
};

const DEFAULT_OKR_RULE = {
  checkInReminderMinutes: 24 * 60,
  riskEscalationMinutes: 24 * 60,
};

const LEAD_POLICY_VERSION = 'noise-v2';

export function leadAssignmentNotificationKey(leadId: string, assigneeId: string, assignedAt: Date) {
  return `lead.assigned:${leadId}:${assigneeId}:${assignedAt.toISOString()}:${LEAD_POLICY_VERSION}`;
}

function minutesAfter(value: Date, minutes: number) {
  return new Date(value.getTime() + minutes * 60_000);
}

function channels(value: unknown): Array<'FEISHU'> {
  return Array.isArray(value) && value.includes('FEISHU') ? ['FEISHU'] : [];
}

function positive(value: unknown, fallback: number) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

async function loadRule<T extends Record<string, any>>(
  client: WorkflowClient,
  key: string,
  defaults: T,
): Promise<Rule<T>> {
  const stored = await client.notificationRule.findUnique({ where: { eventType: key } });
  const source = stored?.config && typeof stored.config === 'object' ? stored.config : {};
  const config = Object.fromEntries(Object.entries(defaults).map(([field, fallback]) => [
    field,
    typeof fallback === 'boolean' ? (typeof source[field] === 'boolean' ? source[field] : fallback) : positive(source[field], fallback),
  ])) as T;
  return {
    enabled: stored?.enabled !== false,
    channels: stored ? channels(stored.channels) : ['FEISHU'],
    config,
  };
}

function nextShanghaiWorkdayNine(value: Date) {
  const local = new Date(value.getTime() + 8 * 60 * 60_000);
  let year = local.getUTCFullYear();
  let month = local.getUTCMonth();
  let day = local.getUTCDate() + 1;
  while (true) {
    const candidate = new Date(Date.UTC(year, month, day, 1, 0, 0));
    const localCandidate = new Date(candidate.getTime() + 8 * 60 * 60_000);
    const weekDay = localCandidate.getUTCDay();
    if (weekDay !== 0 && weekDay !== 6) return candidate;
    day += 1;
    const normalized = new Date(Date.UTC(year, month, day));
    year = normalized.getUTCFullYear();
    month = normalized.getUTCMonth();
    day = normalized.getUTCDate();
  }
}

export function createNotificationWorkflow(publisher: NotificationPublisher) {
  return {
    async assignLead(client: WorkflowClient, input: {
      leadId: string;
      leadName: string;
      assignedAt: Date;
      assignee: Recipient;
      manager?: Recipient | null;
    }) {
      const rule = await loadRule(client, 'LEAD_WORKFLOW', DEFAULT_LEAD_RULE);
      if (!rule.enabled) return;
      const version = input.assignedAt.toISOString();
      const actionUrl = `/leads?leadId=${encodeURIComponent(input.leadId)}`;
      await publisher.publish(client as any, {
        eventType: 'LEAD_ASSIGNED', businessType: 'lead', businessId: input.leadId,
        recipientId: input.assignee.id, recipientName: input.assignee.name,
        title: '新线索待处理', content: `${input.leadName || '新线索'} · 已分配给你，请在${rule.config.firstFollowUpReminderMinutes}分钟内完成首次跟进。`,
        severity: 'S1', actionUrl, requiresAck: true,
        dedupeKey: leadAssignmentNotificationKey(input.leadId, input.assignee.id, input.assignedAt),
        channels: rule.channels,
        metadata: { assignmentVersion: version, ackBusinessType: 'lead_ack' },
      });
      await publisher.schedule(client as any, {
        eventType: 'LEAD_ACK_REMINDER', businessType: 'lead_ack', businessId: input.leadId,
        recipientId: input.assignee.id, recipientName: input.assignee.name,
        title: '新线索待处理', content: `${input.leadName || '新线索'} · 尚未确认且无跟进记录，请尽快处理。`,
        severity: 'S1', actionUrl, requiresAck: true,
        dedupeKey: `lead.ack-reminder:${input.leadId}:${input.assignee.id}:${version}:${LEAD_POLICY_VERSION}`,
        channels: rule.channels,
        scheduledAt: minutesAfter(input.assignedAt, rule.config.ackReminderMinutes),
      });
      await publisher.schedule(client as any, {
        eventType: 'LEAD_FIRST_FOLLOW_UP_DUE', businessType: 'lead_follow_up', businessId: input.leadId,
        recipientId: input.assignee.id, recipientName: input.assignee.name,
        title: '新线索待处理', content: `${input.leadName || '新线索'} · 尚无跟进记录，已达到首次跟进时限，请立即联系。`,
        severity: 'S1', actionUrl, requiresAck: false,
        dedupeKey: `lead.first-follow-up:${input.leadId}:${input.assignee.id}:${version}:reminder:${LEAD_POLICY_VERSION}`,
        channels: rule.channels,
        scheduledAt: minutesAfter(input.assignedAt, rule.config.firstFollowUpReminderMinutes),
      });
      if (input.manager && input.manager.id !== input.assignee.id) {
        await publisher.schedule(client as any, {
          eventType: 'LEAD_FIRST_FOLLOW_UP_ESCALATION', businessType: 'lead_follow_up', businessId: input.leadId,
          recipientId: input.manager.id, recipientName: input.manager.name,
          title: '成员线索跟进超时', content: `${input.assignee.name}超过${rule.config.firstFollowUpEscalationMinutes}分钟仍未跟进“${input.leadName || input.leadId}”。`,
          severity: 'S1', actionUrl, requiresAck: false,
          dedupeKey: `lead.first-follow-up:${input.leadId}:${input.manager.id}:${version}:escalation:${LEAD_POLICY_VERSION}`,
          channels: rule.channels, escalationLevel: 1,
          scheduledAt: minutesAfter(input.assignedAt, rule.config.firstFollowUpEscalationMinutes),
        });
      }
    },

    async resolveLead(client: WorkflowClient, leadId: string, reason: string) {
      const results = [];
      for (const businessType of ['lead', 'lead_ack', 'lead_follow_up']) {
        results.push(await publisher.resolveBusiness(client as any, { businessType, businessId: leadId, reason }));
      }
      return results;
    },

    async bootstrapLead(client: WorkflowClient, input: {
      leadId: string; leadName: string; assignedAt: Date; bootstrapAt: Date; acknowledged: boolean;
      assignee: Recipient; manager?: Recipient | null;
    }) {
      const rule = await loadRule(client, 'LEAD_WORKFLOW', DEFAULT_LEAD_RULE);
      if (!rule.enabled) return;
      const version = input.assignedAt.toISOString();
      const actionUrl = `/leads?leadId=${encodeURIComponent(input.leadId)}`;
      const ackReminderAt = minutesAfter(input.assignedAt, rule.config.ackReminderMinutes);
      const followUpAt = minutesAfter(input.assignedAt, rule.config.firstFollowUpReminderMinutes);
      const followUpEscalationAt = minutesAfter(input.assignedAt, rule.config.firstFollowUpEscalationMinutes);
      const ackReminder = {
        eventType: 'LEAD_ACK_REMINDER', businessType: 'lead_ack', businessId: input.leadId,
        recipientId: input.assignee.id, recipientName: input.assignee.name,
        title: '新线索待处理', content: `${input.leadName || '新线索'} · 尚未确认且无跟进记录，请尽快处理。`,
        severity: 'S1' as const, actionUrl, requiresAck: true,
        dedupeKey: `lead.ack-reminder:${input.leadId}:${input.assignee.id}:${version}:${LEAD_POLICY_VERSION}`, channels: rule.channels,
      };
      if (!input.acknowledged && input.bootstrapAt < ackReminderAt) {
        await publisher.publish(client as any, {
          eventType: 'LEAD_ASSIGNED', businessType: 'lead', businessId: input.leadId,
          recipientId: input.assignee.id, recipientName: input.assignee.name,
          title: '新线索待处理', content: `${input.leadName || '新线索'} · 已分配给你，请在${rule.config.firstFollowUpReminderMinutes}分钟内完成首次跟进。`,
          severity: 'S1', actionUrl, requiresAck: true,
          dedupeKey: leadAssignmentNotificationKey(input.leadId, input.assignee.id, input.assignedAt), channels: rule.channels,
        });
        await publisher.schedule(client as any, { ...ackReminder, scheduledAt: ackReminderAt });
      } else if (!input.acknowledged && input.bootstrapAt < followUpAt) {
        await publisher.publish(client as any, ackReminder);
      }
      const followUp = {
        eventType: 'LEAD_FIRST_FOLLOW_UP_DUE', businessType: 'lead_follow_up', businessId: input.leadId,
        recipientId: input.assignee.id, recipientName: input.assignee.name,
        title: '新线索待处理', content: `${input.leadName || '新线索'} · 尚无跟进记录，已达到首次跟进时限，请立即联系。`,
        severity: 'S1' as const, actionUrl, requiresAck: false,
        dedupeKey: `lead.first-follow-up:${input.leadId}:${input.assignee.id}:${version}:reminder:${LEAD_POLICY_VERSION}`, channels: rule.channels,
      };
      if (input.bootstrapAt < followUpAt) await publisher.schedule(client as any, { ...followUp, scheduledAt: followUpAt });
      else await publisher.publish(client as any, followUp);
      if (input.manager && input.manager.id !== input.assignee.id) {
        const escalation = {
          eventType: 'LEAD_FIRST_FOLLOW_UP_ESCALATION', businessType: 'lead_follow_up', businessId: input.leadId,
          recipientId: input.manager.id, recipientName: input.manager.name,
          title: '成员线索跟进超时', content: `${input.assignee.name}超过${rule.config.firstFollowUpEscalationMinutes}分钟仍未跟进“${input.leadName || input.leadId}”。`,
          severity: 'S1' as const, actionUrl, requiresAck: false,
          dedupeKey: `lead.first-follow-up:${input.leadId}:${input.manager.id}:${version}:escalation:${LEAD_POLICY_VERSION}`, channels: rule.channels,
        };
        if (input.bootstrapAt < followUpEscalationAt) await publisher.schedule(client as any, { ...escalation, scheduledAt: followUpEscalationAt, escalationLevel: 1 });
        else await publisher.publish(client as any, escalation);
      }
    },

    async scheduleTodo(client: WorkflowClient, input: {
      todoId: string;
      customerId: string;
      customerName: string;
      title: string;
      dueAt: Date;
      createdAt: Date;
      assignee: Recipient;
      manager?: Recipient | null;
    }) {
      const rule = await loadRule(client, 'CUSTOMER_TODO_WORKFLOW', DEFAULT_TODO_RULE);
      if (!rule.enabled) return;
      const version = input.createdAt.toISOString();
      const actionUrl = `/customers?customerId=${encodeURIComponent(input.customerId)}&detailTab=todo`;
      const content = `${input.customerName} · ${input.title}`;
      await publisher.publish(client as any, {
        eventType: 'TODO_ASSIGNED', businessType: 'customer_todo', businessId: input.todoId,
        recipientId: input.assignee.id, recipientName: input.assignee.name,
        title: '你收到一项客户待办', content, severity: 'S1', actionUrl, requiresAck: false,
        dedupeKey: `todo.assigned:${input.todoId}:${input.assignee.id}:${version}`,
        channels: rule.channels,
      });
      const dueSoonAt = minutesAfter(input.dueAt, -rule.config.dueSoonMinutes);
      if (dueSoonAt.getTime() > input.createdAt.getTime()) {
        await publisher.schedule(client as any, {
          eventType: 'TODO_DUE_SOON', businessType: 'customer_todo', businessId: input.todoId,
          recipientId: input.assignee.id, recipientName: input.assignee.name,
          title: '客户待办即将到期', content, severity: 'S2', actionUrl, requiresAck: false,
          dedupeKey: `todo.due-soon:${input.todoId}:${input.assignee.id}:${version}`,
          channels: rule.channels, scheduledAt: dueSoonAt,
        });
      }
      await publisher.schedule(client as any, {
        eventType: 'TODO_DUE', businessType: 'customer_todo', businessId: input.todoId,
        recipientId: input.assignee.id, recipientName: input.assignee.name,
        title: '客户待办已经到期', content, severity: 'S1', actionUrl, requiresAck: false,
        dedupeKey: `todo.due:${input.todoId}:${input.assignee.id}:${version}`,
        channels: rule.channels, scheduledAt: new Date(Math.max(input.createdAt.getTime(), input.dueAt.getTime())),
      });
      await publisher.schedule(client as any, {
        eventType: 'TODO_OVERDUE', businessType: 'customer_todo', businessId: input.todoId,
        recipientId: input.assignee.id, recipientName: input.assignee.name,
        title: '客户待办已经逾期', content, severity: 'S1', actionUrl, requiresAck: false,
        dedupeKey: `todo.overdue:${input.todoId}:${input.assignee.id}:${version}`,
        channels: rule.channels, scheduledAt: minutesAfter(input.dueAt, rule.config.overdueReminderMinutes),
      });
      if (rule.config.escalateNextWorkday && input.manager && input.manager.id !== input.assignee.id) {
        await publisher.schedule(client as any, {
          eventType: 'TODO_MANAGER_ESCALATION', businessType: 'customer_todo', businessId: input.todoId,
          recipientId: input.manager.id, recipientName: input.manager.name,
          title: '成员客户待办仍未完成', content: `${input.assignee.name}的待办：${content}`,
          severity: 'S1', actionUrl, requiresAck: false,
          dedupeKey: `todo.manager-escalation:${input.todoId}:${input.manager.id}:${version}`,
          channels: rule.channels, escalationLevel: 1, scheduledAt: nextShanghaiWorkdayNine(input.dueAt),
        });
      }
    },

    async bootstrapTodo(client: WorkflowClient, input: {
      todoId: string; customerId: string; customerName: string; title: string;
      dueAt: Date; versionAt: Date; bootstrapAt: Date; assignee: Recipient; manager?: Recipient | null;
    }) {
      const rule = await loadRule(client, 'CUSTOMER_TODO_WORKFLOW', DEFAULT_TODO_RULE);
      if (!rule.enabled) return;
      const version = input.versionAt.toISOString();
      const actionUrl = `/customers?customerId=${encodeURIComponent(input.customerId)}&detailTab=todo`;
      const content = `${input.customerName} · ${input.title}`;
      const dueSoonAt = minutesAfter(input.dueAt, -rule.config.dueSoonMinutes);
      const overdueAt = minutesAfter(input.dueAt, rule.config.overdueReminderMinutes);
      const escalationAt = nextShanghaiWorkdayNine(input.dueAt);
      const stages = [
        { at: input.versionAt, eventType: 'TODO_ASSIGNED', title: '你收到一项客户待办', key: `todo.assigned:${input.todoId}:${input.assignee.id}:${version}` },
        ...(dueSoonAt > input.versionAt ? [{ at: dueSoonAt, eventType: 'TODO_DUE_SOON', title: '客户待办即将到期', key: `todo.due-soon:${input.todoId}:${input.assignee.id}:${version}` }] : []),
        { at: input.dueAt, eventType: 'TODO_DUE', title: '客户待办已经到期', key: `todo.due:${input.todoId}:${input.assignee.id}:${version}` },
        { at: overdueAt, eventType: 'TODO_OVERDUE', title: '客户待办已经逾期', key: `todo.overdue:${input.todoId}:${input.assignee.id}:${version}` },
      ];
      const currentIndex = stages.reduce((latest, stage, index) => stage.at <= input.bootstrapAt ? index : latest, -1);
      for (let index = 0; index < stages.length; index += 1) {
        if (index < currentIndex) continue;
        const stage = stages[index];
        const event = {
          eventType: stage.eventType, businessType: 'customer_todo', businessId: input.todoId,
          recipientId: input.assignee.id, recipientName: input.assignee.name,
          title: stage.title, content, severity: stage.eventType === 'TODO_DUE_SOON' ? 'S2' as const : 'S1' as const,
          actionUrl, requiresAck: false, dedupeKey: stage.key, channels: rule.channels,
        };
        if (index === currentIndex) await publisher.publish(client as any, event);
        else await publisher.schedule(client as any, { ...event, scheduledAt: stage.at });
      }
      if (rule.config.escalateNextWorkday && input.manager && input.manager.id !== input.assignee.id) {
        const escalation = {
          eventType: 'TODO_MANAGER_ESCALATION', businessType: 'customer_todo', businessId: input.todoId,
          recipientId: input.manager.id, recipientName: input.manager.name,
          title: '成员客户待办仍未完成', content: `${input.assignee.name}的待办：${content}`,
          severity: 'S1' as const, actionUrl, requiresAck: false,
          dedupeKey: `todo.manager-escalation:${input.todoId}:${input.manager.id}:${version}`, channels: rule.channels,
        };
        if (escalationAt <= input.bootstrapAt) await publisher.publish(client as any, escalation);
        else await publisher.schedule(client as any, { ...escalation, scheduledAt: escalationAt, escalationLevel: 1 });
      }
    },

    resolveTodo(client: WorkflowClient, todoId: string, reason: string) {
      return publisher.resolveBusiness(client as any, { businessType: 'customer_todo', businessId: todoId, reason });
    },

    async assignOkr(client: WorkflowClient, input: {
      cycleId: string;
      objectiveId: string;
      title: string;
      assignee: Recipient;
      publishedAt: Date;
      checkInAt?: Date | null;
      manager?: Recipient | null;
    }) {
      const rule = await loadRule(client, 'OKR_WORKFLOW', DEFAULT_OKR_RULE);
      if (!rule.enabled) return;
      const version = input.publishedAt.toISOString();
      const content = `目标“${input.title || input.objectiveId}”已发布，请按周期推进并检视。`;
      await publisher.publish(client as any, {
        eventType: 'OKR_ASSIGNED', businessType: 'okr_objective', businessId: input.objectiveId,
        recipientId: input.assignee.id, recipientName: input.assignee.name,
        title: '你收到一项目标', content, severity: 'S2', actionUrl: '/okr', requiresAck: false,
        dedupeKey: `okr.assigned:${input.cycleId}:${input.objectiveId}:${input.assignee.id}:${version}`,
        channels: rule.channels, metadata: { cycleId: input.cycleId, objectiveVersion: version },
      });
      if (input.checkInAt) {
        const reminderAt = minutesAfter(input.checkInAt, -rule.config.checkInReminderMinutes);
        if (reminderAt > input.publishedAt) {
          await publisher.schedule(client as any, {
            eventType: 'OKR_CHECK_IN_DUE_SOON', businessType: 'okr_objective', businessId: input.objectiveId,
            recipientId: input.assignee.id, recipientName: input.assignee.name,
            title: '目标即将到检视时间', content: `请检视目标“${input.title || input.objectiveId}”的进展与风险。`,
            severity: 'S2', actionUrl: '/okr', requiresAck: false,
            dedupeKey: `okr.check-in:${input.cycleId}:${input.objectiveId}:${input.assignee.id}:${input.checkInAt.toISOString()}`,
            channels: rule.channels, scheduledAt: reminderAt,
            metadata: { cycleId: input.cycleId, checkInAt: input.checkInAt.toISOString() },
          });
        }
      }
    },

    async scheduleOkrCheckIn(client: WorkflowClient, input: {
      cycleId: string;
      objectiveId: string;
      title: string;
      assignee: Recipient;
      scheduledFrom: Date;
      checkInAt?: Date | null;
    }) {
      if (!input.checkInAt) return;
      const rule = await loadRule(client, 'OKR_WORKFLOW', DEFAULT_OKR_RULE);
      if (!rule.enabled) return;
      const reminderAt = minutesAfter(input.checkInAt, -rule.config.checkInReminderMinutes);
      if (reminderAt <= input.scheduledFrom) return;
      await publisher.schedule(client as any, {
        eventType: 'OKR_CHECK_IN_DUE_SOON', businessType: 'okr_objective', businessId: input.objectiveId,
        recipientId: input.assignee.id, recipientName: input.assignee.name,
        title: '目标即将到检视时间', content: `请检视目标“${input.title || input.objectiveId}”的进展与风险。`,
        severity: 'S2', actionUrl: '/okr', requiresAck: false,
        dedupeKey: `okr.check-in:${input.cycleId}:${input.objectiveId}:${input.assignee.id}:${input.checkInAt.toISOString()}`,
        channels: rule.channels, scheduledAt: reminderAt,
        metadata: { cycleId: input.cycleId, checkInAt: input.checkInAt.toISOString() },
      });
    },

    async riskOkr(client: WorkflowClient, input: {
      cycleId: string;
      objectiveId: string;
      title: string;
      assignee: Recipient;
      riskAt: Date;
      manager?: Recipient | null;
    }) {
      const rule = await loadRule(client, 'OKR_WORKFLOW', DEFAULT_OKR_RULE);
      if (!rule.enabled) return;
      const version = input.riskAt.toISOString();
      await publisher.publish(client as any, {
        eventType: 'OKR_AT_RISK', businessType: 'okr_objective', businessId: input.objectiveId,
        recipientId: input.assignee.id, recipientName: input.assignee.name,
        title: '目标出现风险', content: `目标“${input.title || input.objectiveId}”已标记为有风险，请及时处理。`,
        severity: 'S1', actionUrl: '/okr', requiresAck: false,
        dedupeKey: `okr.risk:${input.cycleId}:${input.objectiveId}:${input.assignee.id}:${version}`,
        channels: rule.channels, metadata: { cycleId: input.cycleId, riskVersion: version },
      });
      if (input.manager && input.manager.id !== input.assignee.id) {
        await publisher.schedule(client as any, {
          eventType: 'OKR_RISK_ESCALATION', businessType: 'okr_objective', businessId: input.objectiveId,
          recipientId: input.manager.id, recipientName: input.manager.name,
          title: '成员目标风险待处理', content: `${input.assignee.name}的目标“${input.title || input.objectiveId}”仍处于风险状态。`,
          severity: 'S1', actionUrl: '/okr', requiresAck: false,
          dedupeKey: `okr.risk-escalation:${input.cycleId}:${input.objectiveId}:${input.manager.id}:${version}`,
          channels: rule.channels, escalationLevel: 1,
          scheduledAt: minutesAfter(input.riskAt, rule.config.riskEscalationMinutes),
          metadata: { cycleId: input.cycleId, riskVersion: version },
        });
      }
    },

    resolveOkr(client: WorkflowClient, objectiveId: string, reason: string) {
      return publisher.resolveBusiness(client as any, { businessType: 'okr_objective', businessId: objectiveId, reason });
    },
  };
}

export type NotificationWorkflow = ReturnType<typeof createNotificationWorkflow>;
export const notificationRuleDefaults = {
  LEAD_WORKFLOW: DEFAULT_LEAD_RULE,
  CUSTOMER_TODO_WORKFLOW: DEFAULT_TODO_RULE,
  OKR_WORKFLOW: DEFAULT_OKR_RULE,
};
