export type OkrScope = "COMPANY" | "DEPARTMENT" | "INDIVIDUAL";

export type OkrCycleStatus = "DRAFT" | "ACTIVE" | "SCORING" | "CLOSED";

export type OkrObjectiveStatus =
  "DRAFT" | "PUBLISHED" | "COMPLETED" | "CANCELLED";

export type OkrHealth = "ON_TRACK" | "AT_RISK" | "OFF_TRACK";

export type OkrKeyResultType = "NUMERIC" | "PERCENTAGE" | "MILESTONE";

export type OkrDirection = "INCREASE" | "DECREASE";

export type OkrMetricSource = "MANUAL" | "SYSTEM_METRIC" | "MILESTONE";

export interface OkrCycle {
  id: string;
  name: string;
  year: number;
  quarter: number;
  startAt: string;
  endAt: string;
  checkInWeekday?: number;
  status: OkrCycleStatus;
  objectiveCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface OkrCheckIn {
  id: string;
  keyResultId: string;
  previousValue?: number | null;
  currentValue: number;
  confidence?: number | null;
  health: OkrHealth;
  blocker?: string | null;
  nextAction?: string | null;
  evidence?: Array<{ type: string; content?: string; referenceId?: string }>;
  actorId?: string;
  actorName?: string;
  createdAt: string;
}

export interface OkrKeyResult {
  id: string;
  objectiveId: string;
  title: string;
  ownerId: string;
  ownerName: string;
  type: OkrKeyResultType;
  direction: OkrDirection;
  baselineValue: number;
  targetValue: number;
  currentValue: number;
  unit?: string | null;
  weight: number;
  source: OkrMetricSource;
  health: OkrHealth;
  progress: number;
  dueAt?: string | null;
  lastCheckInAt?: string | null;
  checkIns?: OkrCheckIn[];
  taskLinks?: OkrTaskLink[];
  metricBinding?: OkrMetricBinding | null;
  updatedAt?: string;
}

export interface OkrMetricCatalogItem {
  code:
    | "FORMAL_ORDER_PAID_AMOUNT"
    | "FORMAL_ORDER_COUNT"
    | "RECOVERY_BUSINESS_AMOUNT"
    | "RECOVERY_ORDER_COUNT";
  name: string;
  unit: string;
}

export interface OkrMetricBinding {
  id: string;
  keyResultId: string;
  metricCode: OkrMetricCatalogItem["code"];
  metricVersion: number;
  scopeType: "COMPANY" | "DEPARTMENT" | "USER";
  scopeId?: string | null;
}

export interface OkrTaskLink {
  id: string;
  keyResultId: string;
  taskId: string;
  taskTitle: string;
  linkedById?: string;
  linkedByName?: string;
  createdAt?: string;
}

export interface OkrDirectoryUser {
  id: string;
  name: string;
  departmentId?: string | null;
  departmentName?: string | null;
  positionId?: string | null;
  positionName?: string | null;
}

export interface OkrObjective {
  id: string;
  cycleId: string;
  cycleName?: string;
  scope: OkrScope;
  title: string;
  description?: string | null;
  ownerId: string;
  ownerName: string;
  departmentId?: string | null;
  departmentNameSnapshot?: string | null;
  positionId?: string | null;
  positionNameSnapshot?: string | null;
  parentObjectiveId?: string | null;
  parentObjectiveTitle?: string | null;
  parent?: Pick<OkrObjective, "id" | "title" | "scope"> | null;
  weight: number;
  status: OkrObjectiveStatus;
  health: OkrHealth;
  progress: number;
  keyResults: OkrKeyResult[];
  reviews?: OkrReview[];
  createdAt?: string;
  updatedAt?: string;
}

export type OkrAlignmentObjective = Pick<
  OkrObjective,
  "id" | "title" | "scope" | "ownerName" | "departmentNameSnapshot"
>;

export interface OkrReview {
  id: string;
  objectiveId: string;
  reviewerId: string;
  reviewerName: string;
  reviewerType: "SELF" | "MANAGER";
  score: number;
  summary: string;
  lessons?: string | null;
  createdAt: string;
}

export interface OkrPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface OkrDueCheckInItem {
  objective: OkrObjective;
  keyResult: OkrKeyResult;
}

export interface CreateOkrCycleInput {
  name: string;
  year: number;
  quarter: number;
  startAt: string;
  endAt: string;
  checkInWeekday: number;
}

export interface CreateOkrObjectiveInput {
  cycleId: string;
  scope: OkrScope;
  title: string;
  description?: string;
  ownerId?: string;
  departmentId?: string;
  parentObjectiveId?: string;
  weight: number;
}

export interface CreateOkrKeyResultInput {
  title: string;
  ownerId?: string;
  type: OkrKeyResultType;
  direction: OkrDirection;
  baselineValue: number;
  targetValue: number;
  currentValue?: number;
  unit?: string;
  weight: number;
  dueAt?: string;
}

export interface CreateOkrCheckInInput {
  currentValue: number;
  confidence?: number;
  health?: OkrHealth;
  blocker?: string;
  nextAction?: string;
  evidence?: Array<{
    type: "TEXT" | "LINK";
    content?: string;
    referenceId?: string;
  }>;
}

export interface OkrObjectiveListInput {
  page: number;
  pageSize: number;
  cycleId?: string;
  scope?: OkrScope;
  health?: OkrHealth;
  owner?: "mine" | "team";
  search?: string;
}
