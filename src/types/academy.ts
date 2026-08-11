import type { BusinessAttachment } from './businessAttachment';

export type AcademyCourseStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type AcademySessionStatus =
  "PLANNED" | "READY" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type AcademyTaskStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "DONE"
  | "REJECTED"
  | "BLOCKED"
  | "SKIPPED";
export type AcademyAssetType =
  | "PPT"
  | "SCRIPT"
  | "CASE"
  | "POSTER"
  | "INVITATION"
  | "REPLAY";

export interface AcademyDashboard {
  activeCourses: number;
  upcomingSessions: number;
  sessionsNeedingAttention: number;
  pendingFollowUps: number;
}

export interface AcademyCourse {
  id: string;
  code: string;
  title: string;
  category: string;
  summary: string;
  defaultDurationMinutes: number;
  objectives: string[];
  status: AcademyCourseStatus;
  ownerUserName: string;
  createdAt: string;
  updatedAt: string;
}

export interface AcademyCourseAsset {
  id: string;
  courseId: string;
  courseVersionId: string;
  assetType: AcademyAssetType;
  title: string;
  attachments: BusinessAttachment[];
  ownerUserId: string;
  ownerUserName: string;
  createdAt: string;
  updatedAt: string;
}

export interface AcademySession {
  id: string;
  courseId: string;
  courseVersionId?: string;
  title: string;
  startsAt: string;
  endsAt: string;
  venue: string;
  capacity: number;
  status: AcademySessionStatus;
  facilitatorUserName?: string;
  course?: Pick<AcademyCourse, "code" | "title" | "category">;
  _count?: { engagements: number; tasks: number };
}

export interface AcademySessionTask {
  id: string;
  sessionId: string;
  templateKey: string;
  title: string;
  category: "BEFORE" | "DURING" | "AFTER";
  isRequired: boolean;
  status: AcademyTaskStatus;
  note?: string;
  assigneeUserId?: string;
  assigneeUserName?: string;
  collaboratorNames?: string[];
  dueAt?: string;
  acceptanceCriteria?: string;
  submissionNote?: string;
  submittedAt?: string;
  submittedByName?: string;
  reviewNote?: string;
  reviewedAt?: string;
  reviewedByName?: string;
  completedByName?: string;
  completedAt?: string;
}

export interface AcademyEngagement {
  id: string;
  sessionId: string;
  participantKey: string;
  participantName: string;
  customerId?: string;
  leadId?: string;
  invitationStatus: string;
  attendanceStatus: string;
  interactionLevel?: string;
  courseAssessment?: string;
  followUpStatus: string;
  nextFollowUpAt?: string;
  orderId?: string;
  orderNo?: string;
  handoffStatus: string;
  handedOffAt?: string;
  handedOffByName?: string;
  notes?: string;
  ownerUserName?: string;
}

export interface AcademySessionReview {
  id: string;
  sessionId: string;
  summary: string;
  issues: string;
  improvements: string;
  metrics: Record<string, number>;
  actionItems: Array<{ title: string; ownerUserId?: string; dueAt?: string }>;
  createdByName: string;
  updatedAt: string;
}

export interface AcademySessionDetail extends AcademySession {
  tasks: AcademySessionTask[];
  engagements: AcademyEngagement[];
  review: AcademySessionReview | null;
}

export interface AcademyPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type CreateAcademyCourseInput = Pick<
  AcademyCourse,
  | "code"
  | "title"
  | "category"
  | "summary"
  | "defaultDurationMinutes"
  | "objectives"
>;
export type CreateAcademySessionInput = Pick<
  AcademySession,
  "courseId" | "title" | "startsAt" | "endsAt" | "venue" | "capacity"
>;
export type SaveAcademyEngagementInput = Omit<
  AcademyEngagement,
  | "id"
  | "ownerUserName"
  | "orderId"
  | "orderNo"
  | "handoffStatus"
  | "handedOffAt"
  | "handedOffByName"
>;
export interface SaveAcademyCourseAssetInput {
  assetType: AcademyAssetType;
  title: string;
  attachments: BusinessAttachment[];
}
export type SaveAcademyReviewInput = Pick<
  AcademySessionReview,
  | "sessionId"
  | "summary"
  | "issues"
  | "improvements"
  | "metrics"
  | "actionItems"
>;
