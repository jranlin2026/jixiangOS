type WorkbenchPerson = { id: string; name: string };
type CycleDraft = {
  name: string;
  year: number;
  month?: number;
  quarter?: number;
  cycleType: 'MONTH' | 'QUARTER' | 'CUSTOM';
  startAt: string;
  endAt: string;
  checkInWeekday: number;
};

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

export const getWorkbenchPeople = <T extends WorkbenchPerson>(
  currentUser: T | null | undefined,
  directory: readonly T[],
  canReadTeam: boolean,
): T[] => {
  if (!currentUser) return [];
  if (!canReadTeam) return [currentUser];
  return [
    currentUser,
    ...directory.filter((person) => person.id !== currentUser.id),
  ];
};

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

export const createCycleDraft = (
  cycleType: 'MONTH' | 'QUARTER' | 'CUSTOM',
  now = new Date(),
): CycleDraft => {
  const { year, month } = shanghaiParts(now);
  const quarter = Math.floor((month - 1) / 3) + 1;
  if (cycleType === 'MONTH') {
    const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return {
      name: `${year}年${month}月`,
      year,
      month,
      cycleType,
      startAt: dateInput(year, month, 1),
      endAt: dateInput(year, month, endDay),
      checkInWeekday: 5,
    };
  }
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const endDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate();
  const quarterDraft = {
    name: `${year}年第${['一', '二', '三', '四'][quarter - 1]}季度`,
    year,
    quarter,
    cycleType: 'QUARTER' as const,
    startAt: dateInput(year, startMonth, 1),
    endAt: dateInput(year, endMonth, endDay),
    checkInWeekday: 5,
  };
  return cycleType === 'CUSTOM'
    ? { ...quarterDraft, cycleType, quarter: undefined, name: `${year}年自定义周期` }
    : quarterDraft;
};

export const createCurrentQuarterCycleDraft = (now = new Date()) =>
  createCycleDraft('QUARTER', now);

export const updateCycleDraftPeriod = (
  draft: CycleDraft,
  period: { year?: number; month?: number; quarter?: number },
) => {
  const year = period.year ?? draft.year;
  const month = period.month ?? ('month' in draft ? draft.month : 1);
  const quarter = period.quarter ?? draft.quarter ?? 1;
  const anchorMonth = draft.cycleType === 'MONTH' ? month : (quarter - 1) * 3 + 1;
  const anchor = new Date(`${year}-${String(anchorMonth).padStart(2, '0')}-15T12:00:00+08:00`);
  return createCycleDraft(draft.cycleType, anchor);
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
