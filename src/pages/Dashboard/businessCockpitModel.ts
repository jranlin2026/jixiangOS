import type { CockpitRiskItem, DashboardDateRange, DashboardRangePreset } from '../../types/dashboard';

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
