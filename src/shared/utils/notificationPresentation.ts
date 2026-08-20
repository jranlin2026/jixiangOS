import type { NotificationItem } from '../../types/notification';

export type NotificationPreview = {
  kind: 'single' | 'group';
  id: string;
  title: string;
  content?: string;
  severity: NotificationItem['severity'];
  actionUrl: string;
  createdAt: string;
  count: number;
  item?: NotificationItem;
};

const FIVE_MINUTES = 5 * 60_000;

function groupKind(item: NotificationItem) {
  if (['LEAD_ASSIGNED', 'LEAD_ACK_REMINDER', 'LEAD_FIRST_FOLLOW_UP_DUE'].includes(item.eventType)) return 'lead';
  if (['LEAD_ACK_ESCALATION', 'LEAD_FIRST_FOLLOW_UP_ESCALATION'].includes(item.eventType)) return 'lead-manager';
  if (['TODO_ASSIGNED', 'TODO_DUE_SOON', 'TODO_DUE', 'TODO_OVERDUE'].includes(item.eventType)) return 'todo';
  return '';
}

const groupCopy: Record<string, (count: number) => { title: string; content: string }> = {
  lead: (count) => ({ title: `${count}条新线索待处理`, content: '已合并短时间内的同类提醒，请进入消息中心逐条处理。' }),
  'lead-manager': (count) => ({ title: `${count}条成员线索需要关注`, content: '团队存在多条超时线索，请进入消息中心查看。' }),
  todo: (count) => ({ title: `${count}项客户待办待处理`, content: '已合并短时间内的同类提醒，请进入消息中心逐条处理。' }),
};

export function buildNotificationPreviews(items: NotificationItem[]): NotificationPreview[] {
  const remaining = new Set(items.map((item) => item.id));
  const result: NotificationPreview[] = [];
  for (const item of items) {
    if (!remaining.has(item.id)) continue;
    const kind = groupKind(item);
    const anchor = new Date(item.createdAt).getTime();
    const matches = kind ? items.filter((candidate) => (
      remaining.has(candidate.id)
      && groupKind(candidate) === kind
      && Math.abs(anchor - new Date(candidate.createdAt).getTime()) <= FIVE_MINUTES
    )) : [item];
    if (kind && matches.length >= 3) {
      matches.forEach((candidate) => remaining.delete(candidate.id));
      const copy = groupCopy[kind](matches.length);
      result.push({
        kind: 'group', id: `group-${kind}-${item.id}`, ...copy,
        severity: matches.some((candidate) => candidate.severity === 'S0') ? 'S0' : matches[0].severity,
        actionUrl: '/notifications', createdAt: item.createdAt, count: matches.length,
      });
      continue;
    }
    remaining.delete(item.id);
    result.push({
      kind: 'single', id: item.id, title: item.title, content: item.content,
      severity: item.severity, actionUrl: item.actionUrl, createdAt: item.createdAt,
      count: 1, item,
    });
  }
  return result;
}
