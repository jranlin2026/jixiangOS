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
  employeeId: string;
  employeeName: string;
  departmentIdSnapshot: string | null;
  positionIdSnapshot: string | null;
  positionNameSnapshot: string | null;
  workDate: string;
  title: string;
  description: string | null;
  targetValue: number | null;
  actualValue: number | null;
  unit: string | null;
  evidenceRequired: boolean;
  status: 'PENDING' | 'COMPLETED' | 'CONFIRMED' | 'RETURNED';
  result: string | null;
  dueAt: string | null;
  returnedReason: string | null;
  evidence: Array<{ id: string; type: string; referenceId: string | null; content: string | null }>;
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
    okr: { objectiveCount: number; riskObjectiveCount: number; objectivesWithoutKeyResults: number; averageProgress: number };
    delivery: { activeCount: number; overdueCount: number; blockedCount: number; completedCount: number };
  };
  insights: string[];
  generatedAt: string;
};

export type Paginated<T> = { items: T[]; total: number; page: number; pageSize: number };
