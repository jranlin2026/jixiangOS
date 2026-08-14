import type { DashboardDateRange, DashboardRangePreset } from '../../types/dashboard';

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
