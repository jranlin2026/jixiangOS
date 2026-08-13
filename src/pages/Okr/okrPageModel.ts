export type OkrPageTab = 'overview' | 'mine' | 'team' | 'checkins' | 'cycles';

export interface OkrPageAccess {
  canReadTeam: boolean;
  canCheckIn: boolean;
  canManageCycles: boolean;
}

export interface OkrObjectiveScopeAccess {
  canCreate: boolean;
  canManageDepartment: boolean;
  canManageCompany: boolean;
}

export const isSystemMetricValueReadOnly = (keyResult: { source: string }) =>
  keyResult.source === 'SYSTEM_METRIC';

type ObjectiveReviewIdentity = {
  reviewerId: string;
  reviewerType: 'SELF' | 'MANAGER';
};

export const hasSubmittedObjectiveReview = (
  objective: { reviews?: readonly ObjectiveReviewIdentity[] },
  reviewerId: string | undefined,
  reviewerType: ObjectiveReviewIdentity['reviewerType'],
) => Boolean(
  reviewerId
  && objective.reviews?.some((review) => (
    review.reviewerId === reviewerId && review.reviewerType === reviewerType
  )),
);

export const getVisibleOkrTabs = (access: OkrPageAccess): Array<{ value: OkrPageTab; label: string }> => [
  { value: 'overview', label: 'OKR总览' },
  { value: 'mine', label: '我的OKR' },
  ...(access.canReadTeam ? [{ value: 'team' as const, label: '团队OKR' }] : []),
  ...(access.canCheckIn ? [{ value: 'checkins' as const, label: '周检视' }] : []),
  ...(access.canManageCycles ? [{ value: 'cycles' as const, label: '周期设置' }] : []),
];

export const getAllowedObjectiveScopes = (access: OkrObjectiveScopeAccess) => [
  ...(access.canManageCompany ? ['COMPANY' as const] : []),
  ...(access.canManageDepartment ? ['DEPARTMENT' as const] : []),
  ...(access.canCreate || access.canManageDepartment || access.canManageCompany ? ['INDIVIDUAL' as const] : []),
];

const shanghaiParts = (date: Date) => Object.fromEntries(
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]),
) as { year: number; month: number; day: number };

const dateInput = (year: number, month: number, day: number) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

export const createCurrentQuarterCycleDraft = (now = new Date()) => {
  const { year, month } = shanghaiParts(now);
  const quarter = Math.floor((month - 1) / 3) + 1;
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const endDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate();
  return {
    name: `${year}年第${['一', '二', '三', '四'][quarter - 1]}季度`,
    year,
    quarter,
    startAt: dateInput(year, startMonth, 1),
    endAt: dateInput(year, endMonth, endDay),
    checkInWeekday: 5,
  };
};

const shanghaiDayOrdinal = (date: Date) => {
  const { year, month, day } = shanghaiParts(date);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
};

const weekStartOrdinal = (date: Date) => {
  const ordinal = shanghaiDayOrdinal(date);
  const weekday = new Date(ordinal * 86_400_000).getUTCDay();
  return ordinal - (weekday === 0 ? 6 : weekday - 1);
};

export const isKeyResultCheckInDue = (
  keyResult: { lastCheckInAt?: string | null },
  now = new Date(),
  checkInWeekday = 5,
) => {
  if (!keyResult.lastCheckInAt) return true;
  const today = shanghaiDayOrdinal(now);
  const todayWeekday = new Date(today * 86_400_000).getUTCDay();
  const periodStartWeekday = (Math.max(0, Math.min(6, checkInWeekday)) + 1) % 7;
  const periodStart = today - ((todayWeekday - periodStartWeekday + 7) % 7);
  return shanghaiDayOrdinal(new Date(keyResult.lastCheckInAt)) < periodStart;
};
