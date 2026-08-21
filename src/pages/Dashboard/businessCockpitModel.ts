import type { CockpitCustomerBattleItem, CockpitRiskItem, CockpitTrendPoint, DashboardDateRange, DashboardRangePreset, HomeTaskItem } from '../../types/dashboard';

export interface BossCommandItem {
  id: string;
  kind: 'customer' | 'risk';
  title: string;
  owner: string;
  target: string;
  action: string;
  verification: string;
  path: string;
  tone: HomeTaskItem['tone'];
}

const commandDueLabel = (value?: string) => {
  if (!value) return '今日内补齐动作';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '核对截止时间';
  return `截止 ${new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date).replace(/\//g, '-')}`;
};

export function buildBossCommandItems(
  risks: CockpitRiskItem[],
  customerBattles: CockpitCustomerBattleItem[],
  limit = 6,
): BossCommandItem[] {
  const toneScore: Record<HomeTaskItem['tone'], number> = { error: 400, warning: 300, info: 200, primary: 150, success: 100 };
  const customerCommands = customerBattles.map((item) => ({ command: {
    id: `customer:${item.customerId}`,
    kind: 'customer',
    title: `${item.customerName} · ${item.stageLabel}`,
    owner: item.ownerName || '未分配',
    target: `${item.company || '客户'} · ${item.opportunityAmount ? `¥${Math.round(item.opportunityAmount).toLocaleString('zh-CN')}` : '金额待评估'}`,
    action: item.nextActionTitle || '补充下一步动作',
    verification: commandDueLabel(item.nextActionDueAt),
    path: `/customers?customerId=${encodeURIComponent(item.customerId)}&detailTab=todo`,
    tone: item.riskLevel === 'high' ? 'error' : item.riskLevel === 'medium' ? 'warning' : 'success',
  } as BossCommandItem, score: toneScore[item.riskLevel === 'high' ? 'error' : item.riskLevel === 'medium' ? 'warning' : 'success'] + Math.min(item.opportunityAmount / 10000, 50) }));
  const riskCommands = rankCockpitRisks(risks).map((item) => ({ command: {
    id: `risk:${item.id}`,
    kind: 'risk',
    title: item.title,
    owner: '对应业务负责人',
    target: item.description || `${item.count} 项经营异常`,
    action: '进入业务明细处理',
    verification: `${item.count} 项待闭环`,
    path: item.path,
    tone: item.tone,
  } as BossCommandItem, score: toneScore[item.tone] + 60 + Math.min(Number(item.amount || 0) / 10000, 50) }));
  return [...customerCommands, ...riskCommands]
    .sort((left, right) => right.score - left.score || left.command.title.localeCompare(right.command.title, 'zh-CN'))
    .slice(0, Math.max(0, limit))
    .map((item) => item.command);
}

export function toShanghaiDateString(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

export function resolveDashboardDateRange(
  preset: Exclude<DashboardRangePreset, 'custom'>,
  now = new Date(),
): DashboardDateRange {
  const endDate = toShanghaiDateString(now);
  if (preset === 'today') return { preset, startDate: endDate, endDate };
  if (preset === 'month') return { preset, startDate: `${endDate.slice(0, 7)}-01`, endDate };
  const [year, month, day] = endDate.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const distanceFromMonday = weekday === 0 ? 6 : weekday - 1;
  return { preset, startDate: shiftDate(endDate, -distanceFromMonday), endDate };
}

export function buildCockpitDrilldownPath(
  path: string,
  range: DashboardDateRange,
  dateKind: 'payment' | 'created' | 'recovery' = 'created',
): string {
  const [pathname, rawQuery = ''] = path.split('?');
  const query = new URLSearchParams(rawQuery);
  const keys = dateKind === 'payment'
    ? ['paymentStartDate', 'paymentEndDate']
    : dateKind === 'recovery'
      ? ['recoveryStartDate', 'recoveryEndDate']
      : ['startDate', 'endDate'];
  if (range.startDate) query.set(keys[0], range.startDate);
  if (range.endDate) query.set(keys[1], range.endDate);
  query.set('fromCockpit', '1');
  return `${pathname}?${query.toString()}`;
}

export function rankCockpitRisks(risks: CockpitRiskItem[]): CockpitRiskItem[] {
  const toneRank = { error: 4, warning: 3, info: 2, primary: 1, success: 0 };
  return risks.slice().sort((left, right) => (
    (right.amount || 0) - (left.amount || 0)
    || toneRank[right.tone] - toneRank[left.tone]
    || right.count - left.count
  ));
}

export type ComparableTrendPoint = CockpitTrendPoint & { previousFormalReceiptAmount: number };

export function alignComparableTrend(
  current: CockpitTrendPoint[],
  previous: CockpitTrendPoint[],
  currentStartDate: string,
  previousStartDate: string,
): ComparableTrendPoint[] {
  const dayOffset = (date: string, start: string) => {
    const [year, month, day] = date.split('-').map(Number);
    const [startYear, startMonth, startDay] = start.split('-').map(Number);
    return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(startYear, startMonth - 1, startDay)) / 86_400_000);
  };
  const currentByOffset = new Map(current.map((point) => [dayOffset(point.date, currentStartDate), point]));
  const previousByOffset = new Map(previous.map((point) => [dayOffset(point.date, previousStartDate), point]));
  const offsets = [...new Set([...currentByOffset.keys(), ...previousByOffset.keys()])].sort((a, b) => a - b);
  return offsets.map((offset) => {
    const currentPoint = currentByOffset.get(offset);
    return {
      date: currentPoint?.date || shiftDate(currentStartDate, offset),
      label: currentPoint?.label || shiftDate(currentStartDate, offset).slice(5).replace('-', '/'),
      formalReceiptAmount: currentPoint?.formalReceiptAmount || 0,
      recoveryAmount: currentPoint?.recoveryAmount || 0,
      previousFormalReceiptAmount: previousByOffset.get(offset)?.formalReceiptAmount || 0,
    };
  });
}
