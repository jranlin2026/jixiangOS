export type PositionStandardVersion = {
  id: string;
  standardId: string;
  versionNumber: number;
  status: string;
  mission: string;
  goals: string[];
  dailyActions: string[];
  kpis: string[];
  workflow: string[];
  speechTemplates: string[];
  faq: string[];
  effectiveAt: string | null;
  publishedAt: string | null;
  createdAt: string;
};

export type PositionStandardDetail = {
  id: string;
  positionId: string;
  positionName: string;
  title: string;
  currentVersionId: string | null;
  version: PositionStandardVersion;
  resources: Array<{ knowledgeVersionId: string; title: string }>;
};

export type TaskTemplate = {
  id: string;
  positionId: string;
  standardVersionId: string | null;
  name: string;
  description: string | null;
  targetValue: number | null;
  unit: string | null;
  scheduleType: string;
  weekdays: number[];
  dueTime: string | null;
  evidenceRequired: boolean;
  isActive: boolean;
  effectiveAt: string | null;
  expiresAt: string | null;
};

export type EmployeeTask = {
  id: string;
  /** Nullable during the expand rollout; Task 17 contracts this after old writers are retired. */
  sourceKey?: string | null;
  taskType?: 'ACTION' | 'APPROVAL' | 'CONFIRMATION' | 'FOLLOW_UP' | 'LEARNING' | 'PUBLISH';
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  businessModule?: string;
  sourceRoute?: string | null;
  sourceLabel?: string | null;
  employeeId: string;
  employeeName: string;
  departmentIdSnapshot: string | null;
  departmentNameSnapshot?: string | null;
  positionIdSnapshot: string | null;
  positionNameSnapshot: string | null;
  workDate: string;
  title: string;
  description: string | null;
  targetValue: number | null;
  actualValue: number | null;
  unit: string | null;
  evidenceRequired: boolean;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CONFIRMED' | 'RETURNED' | 'CANCELED';
  result: string | null;
  dueAt: string | null;
  returnedReason: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  confirmedAt?: string | null;
  confirmedById?: string | null;
  confirmedByName?: string | null;
  canceledAt?: string | null;
  canceledById?: string | null;
  canceledReason?: string | null;
  collaboratorIds?: string[] | null;
  estimatedMinutes?: number | null;
  qualityScore?: number | null;
  qualityComment?: string | null;
  remindedAt?: string | null;
  lastOverdueNotifiedAt?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  sourceItemId?: string | null;
  sourceVersion?: string | null;
  evidence: Array<{ id: string; type: string; referenceId: string | null; content: string | null }>;
  activities?: TaskActivity[];
};

export type CustomerInterventionOutcome = {
  followUpSummary: string;
  nextActionTitle: string;
  nextActionDueAt: string;
  opportunityStageCode?: 'not_set' | 'needs_discovery' | 'solution_demo' | 'proposal' | 'objection' | 'payment_pending' | 'won' | 'lost';
  opportunityAmount?: number | null;
};

export type TaskActivity = {
  id: string;
  /** Database-monotonic ordering used by durable lifecycle publication. */
  sequence?: string;
  taskId: string;
  action: string;
  actorId: string | null;
  actorName: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  comment: string | null;
  metadata: unknown | null;
  createdAt: string;
};

export type DailyReview = {
  id: string;
  employeeId: string;
  employeeName: string;
  workDate: string;
  completedSummary: string;
  problems: string;
  successCases: string;
  failureCases: string;
  customerNeeds: string;
  suggestions: string;
  aiSummary: string | null;
  submittedAt: string;
};

export type AiCitation = {
  documentId: string;
  versionId: string;
  title: string;
  versionNumber: number;
  excerpt: string;
  updatedAt: string;
};

export type EnterpriseAiConversation = {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: Array<{ id: string; role: 'USER' | 'ASSISTANT'; content: string; citations: AiCitation[]; createdAt: string }>;
};

export type EnterpriseCockpit = {
  range: { dateFrom: string; dateTo: string };
  scope: { departmentIds: string[]; employeeCount: number; rolloutLabel: string };
  execution: {
    standardCoverageRate: number;
    taskCompletionRate: number;
    overdueCount: number;
    reviewRate: number;
    taskCount: number;
    completedTaskCount: number;
    reviewCount: number;
  };
  business: { leadCount: number; orderCount: number; orderAmount: number; upgradeCount: number; refundCount: number };
  organization: {
    okr: { activeCycleCount: number; objectiveCount: number; riskObjectiveCount: number; objectivesWithoutKeyResults: number; averageProgress: number };
    delivery: { activeCount: number; overdueCount: number; blockedCount: number; completedCount: number };
  };
  insights: string[];
  generatedAt: string;
};

export type Paginated<T> = { items: T[]; total: number; page: number; pageSize: number };
