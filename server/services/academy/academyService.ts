import { randomUUID } from "node:crypto";
import type { AuthenticatedUser } from "../../../src/types/auth";
import type { Customer } from "../../../src/types/customer";
import type { BusinessAttachment } from "../../../src/types/businessAttachment";
import { hasPermission, PERMISSION_KEYS } from "../../../src/shared/utils/permissions";
import { failure, success } from "../../api/response";

export type AcademyCourseStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type AcademySessionStatus =
  "PLANNED" | "READY" | "IN_PROGRESS" | "POST_COURSE" | "COMPLETED" | "CANCELLED";
export type AcademyDeliveryMode = "OFFLINE" | "LIVE" | "ONLINE";
export type AcademyTaskStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "DONE"
  | "REJECTED"
  | "BLOCKED"
  | "SKIPPED";
export type AcademyAssetType = "PPT" | "SCRIPT" | "CASE" | "POSTER" | "INVITATION" | "REPLAY";
export type AcademyTaskCompletionMode = "CONFIRM" | "NOTE" | "ATTACHMENT" | "CHECKLIST";
export type AcademyTaskAssigneeRole = "PROJECT_OWNER" | "CONTENT_OWNER" | "MATERIAL_OWNER" | "LECTURER" | "REVIEW_OWNER";

export type AcademySopTemplateStepRecord = {
  id: string;
  templateId: string;
  stepKey: string;
  title: string;
  category: "BEFORE" | "DURING" | "AFTER";
  sortOrder: number;
  assigneeRole: AcademyTaskAssigneeRole;
  dueAnchor: "STARTS_AT" | "ENDS_AT";
  dueOffsetMinutes?: number | null;
  completionMode: AcademyTaskCompletionMode;
  requiresReview: boolean;
  acceptanceCriteria?: string | null;
  isRequired: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type AcademySopTemplateRecord = {
  id: string;
  name: string;
  description: string;
  status: "ACTIVE" | "INACTIVE";
  isDefault: boolean;
  createdById: string;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
  steps: AcademySopTemplateStepRecord[];
};

export type AcademyCourseRecord = {
  id: string;
  code: string;
  title: string;
  category: string;
  summary: string;
  targetAudience?: string | null;
  customerProblem?: string | null;
  coreViewpoint?: string | null;
  conversionProductId?: string | null;
  conversionProductName?: string | null;
  defaultDurationMinutes: number;
  objectives: string[];
  status: AcademyCourseStatus;
  ownerUserId: string;
  ownerUserName: string;
  lecturerUserId?: string | null;
  lecturerUserName?: string | null;
  sopTemplateId?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AcademyCourseCategoryRecord = {
  id: string;
  name: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type AcademyCourseAssetRecord = {
  id: string;
  courseId: string;
  courseVersionId: string;
  assetType: AcademyAssetType;
  title: string;
  attachments: BusinessAttachment[];
  ownerUserId: string;
  ownerUserName: string;
  createdAt: Date;
  updatedAt: Date;
};

export type AcademySessionRecord = {
  id: string;
  courseId: string;
  courseVersionId?: string | null;
  title: string;
  startsAt: Date;
  endsAt: Date;
  deliveryMode?: AcademyDeliveryMode;
  venue: string;
  meetingUrl?: string | null;
  capacity: number;
  inviteTarget?: number;
  registrationTarget?: number;
  attendanceTarget?: number;
  consultationTarget?: number;
  dealTarget?: number;
  targetRevenue?: number;
  status: AcademySessionStatus;
  isHistoricalBackfill?: boolean;
  audience: "ALL_EMPLOYEES" | "RESPONSIBLE_ONLY";
  isInvitable: boolean;
  facilitatorUserId?: string | null;
  facilitatorUserName?: string | null;
  taskReviewerUserId?: string | null;
  taskReviewerUserName?: string | null;
  lecturerUserId?: string | null;
  lecturerUserName?: string | null;
  collaboratorUserIds?: string[] | null;
  collaboratorNames?: string[] | null;
  createdById: string;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
};

export type AcademySessionTaskRecord = {
  id: string;
  sessionId: string;
  templateKey: string;
  title: string;
  category: "BEFORE" | "DURING" | "AFTER";
  isRequired: boolean;
  status: AcademyTaskStatus;
  note?: string | null;
  assigneeUserId?: string | null;
  assigneeUserName?: string | null;
  collaboratorNames?: string[] | null;
  dueAt?: Date | null;
  dueAnchor?: "STARTS_AT" | "ENDS_AT" | null;
  dueOffsetMinutes?: number | null;
  acceptanceCriteria?: string | null;
  sopTemplateId?: string | null;
  sopTemplateStepId?: string | null;
  assigneeRole?: AcademyTaskAssigneeRole | null;
  sortOrder?: number;
  completionMode?: AcademyTaskCompletionMode;
  requiresReview?: boolean;
  submissionNote?: string | null;
  submittedAt?: Date | null;
  submittedById?: string | null;
  submittedByName?: string | null;
  reviewNote?: string | null;
  reviewedAt?: Date | null;
  reviewedById?: string | null;
  reviewedByName?: string | null;
  completedAt?: Date | null;
  completedById?: string | null;
  completedByName?: string | null;
  attachments?: BusinessAttachment[];
  createdAt: Date;
  updatedAt: Date;
};

export type AcademyMyTaskRecord = AcademySessionTaskRecord & {
  session: Pick<AcademySessionRecord, "id" | "title" | "startsAt" | "endsAt" | "status" | "taskReviewerUserId" | "taskReviewerUserName">;
};

export type AcademyEngagementRecord = {
  id: string;
  sessionId: string;
  participantKey: string;
  customerId?: string | null;
  leadId?: string | null;
  participantName: string;
  invitationStatus: string;
  attendanceStatus: string;
  interactionLevel?: string | null;
  courseAssessment?: string | null;
  followUpStatus: string;
  nextFollowUpAt?: Date | null;
  orderId?: string | null;
  orderNo?: string | null;
  handoffStatus: string;
  handedOffAt?: Date | null;
  handedOffById?: string | null;
  handedOffByName?: string | null;
  notes?: string | null;
  ownerUserId?: string | null;
  ownerUserName?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AcademyReviewRecord = {
  id: string;
  sessionId: string;
  summary: string;
  issues: string;
  improvements: string;
  metrics: Record<string, number>;
  actionItems: Array<{ title: string; ownerUserId?: string; dueAt?: string }>;
  createdById: string;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
};

export type AcademyAccessScope = {
  unrestricted: boolean;
  visibleUserIds: string[];
};

export type AcademyParticipantReference = {
  id: string;
  name: string;
  ownerUserId?: string | null;
  ownerUserName?: string | null;
  isPublicPool?: boolean;
};

export type AcademyOrderReference = {
  id: string;
  orderNo: string;
  customerId: string;
};

export type AcademyPublicCalendarRecord = Pick<
  AcademySessionRecord,
  "id" | "title" | "startsAt" | "endsAt" | "deliveryMode" | "status" | "lecturerUserName" | "taskReviewerUserName"
> & { courseTitle: string; tasks: AcademySessionTaskRecord[] };

export interface AcademyRepository {
  listSopTemplates?(): Promise<AcademySopTemplateRecord[]>;
  findSopTemplateById?(id: string): Promise<AcademySopTemplateRecord | null>;
  findDefaultSopTemplate?(): Promise<AcademySopTemplateRecord | null>;
  saveSopTemplate?(template: AcademySopTemplateRecord): Promise<AcademySopTemplateRecord>;
  deleteSopTemplate?(id: string): Promise<void>;
  listCourseCategories(): Promise<AcademyCourseCategoryRecord[]>;
  upsertCourseCategory(category: AcademyCourseCategoryRecord): Promise<AcademyCourseCategoryRecord>;
  listCourses(
    input: { page: number; pageSize: number; search?: string; status?: string; sopTemplateId?: string },
    scope: AcademyAccessScope,
  ): Promise<{ items: AcademyCourseRecord[]; total: number }>;
  findCourseByCode(code: string): Promise<AcademyCourseRecord | null>;
  findCourseById(id: string, scope?: AcademyAccessScope): Promise<AcademyCourseRecord | null>;
  findActiveUserById(id: string): Promise<{ id: string; name: string } | null>;
  findActiveProductById(id: string): Promise<{ id: string; name: string } | null>;
  findLatestCourseVersionId(courseId: string): Promise<string | null>;
  createCourse(course: AcademyCourseRecord): Promise<AcademyCourseRecord>;
  createCourseVersion(version: Record<string, unknown>): Promise<unknown>;
  getNextCourseVersionNumber(courseId: string): Promise<number>;
  updateCourse(id: string, update: Partial<AcademyCourseRecord>): Promise<AcademyCourseRecord | null>;
  listCourseAssets(courseId: string): Promise<AcademyCourseAssetRecord[]>;
  upsertCourseAsset(asset: AcademyCourseAssetRecord): Promise<AcademyCourseAssetRecord>;
  updateCourseStatus(
    id: string,
    expectedStatus: AcademyCourseStatus,
    status: AcademyCourseStatus,
  ): Promise<AcademyCourseRecord | null>;
  listSessions(
    input: { page: number; pageSize: number; search?: string; status?: string; includeAudience?: string },
    scope: AcademyAccessScope,
  ): Promise<{ items: AcademySessionRecord[]; total: number }>;
  listPublicCalendar(input: { start: Date; end: Date }): Promise<AcademyPublicCalendarRecord[]>;
  findSessionById(id: string, scope?: AcademyAccessScope): Promise<AcademySessionRecord | null>;
  getSessionDetail(
    id: string,
    scope: AcademyAccessScope,
  ): Promise<
    | (AcademySessionRecord & {
        tasks: AcademySessionTaskRecord[];
        engagements: AcademyEngagementRecord[];
        review: AcademyReviewRecord | null;
      })
    | null
  >;
  createSession(
    session: AcademySessionRecord,
    checklist: AcademySessionTaskRecord[],
  ): Promise<AcademySessionRecord & { tasks: AcademySessionTaskRecord[] }>;
  updateSessionStatus(
    id: string,
    expectedStatus: AcademySessionStatus,
    status: AcademySessionStatus,
    taskUpdate?: Partial<AcademySessionTaskRecord>,
  ): Promise<AcademySessionRecord | null>;
  updateSession(
    id: string,
    expectedStatus: AcademySessionStatus,
    update: Partial<AcademySessionRecord>,
    taskUpdates: Array<{ id: string; update: Partial<AcademySessionTaskRecord> }>,
  ): Promise<AcademySessionRecord | null>;
  listSessionTasks(sessionId: string): Promise<AcademySessionTaskRecord[]>;
  listMyTasks(
    userId: string,
    input: { page: number; pageSize: number; status?: string },
    scope?: AcademyAccessScope,
  ): Promise<{ items: AcademyMyTaskRecord[]; total: number }>;
  findTaskById(id: string, scope?: AcademyAccessScope): Promise<AcademySessionTaskRecord | null>;
  updateTaskStatus(
    id: string,
    expectedStatus: AcademyTaskStatus,
    update: Partial<AcademySessionTaskRecord>,
    allowedSessionStatuses: AcademySessionStatus[],
  ): Promise<AcademySessionTaskRecord | null>;
  listTaskAttachments(taskId: string): Promise<BusinessAttachment[]>;
  listTaskAttachmentsByTaskIds(taskIds: string[]): Promise<Map<string, BusinessAttachment[]>>;
  replaceTaskAttachments(taskId: string, attachmentIds: string[], actor: AuthenticatedUser): Promise<BusinessAttachment[]>;
  removeTaskAttachmentReference(taskId: string, attachmentId: string): Promise<void>;
  isTaskAttachmentLinked(taskId: string, attachmentId: string): Promise<boolean>;
  listLinkedTaskAttachmentIds(taskIds: string[]): Promise<Set<string>>;
  upsertEngagement(
    engagement: AcademyEngagementRecord,
  ): Promise<AcademyEngagementRecord>;
  findEngagementById(id: string, scope?: AcademyAccessScope): Promise<AcademyEngagementRecord | null>;
  findEngagementByKey(
    sessionId: string,
    participantKey: string,
  ): Promise<AcademyEngagementRecord | null>;
  saveReview(review: AcademyReviewRecord): Promise<AcademyReviewRecord>;
  getDashboard(
    scope: AcademyAccessScope,
  ): Promise<{
    activeCourses: number;
    upcomingSessions: number;
    sessionsNeedingAttention: number;
    pendingFollowUps: number;
  }>;
}

const COMPLETION_MODES = new Set<AcademyTaskCompletionMode>(["CONFIRM", "NOTE", "ATTACHMENT", "CHECKLIST"]);
const ASSIGNEE_ROLES = new Set<AcademyTaskAssigneeRole>(["PROJECT_OWNER", "CONTENT_OWNER", "MATERIAL_OWNER", "LECTURER", "REVIEW_OWNER"]);
const TASK_CATEGORIES = new Set(["BEFORE", "DURING", "AFTER"]);
const DUE_ANCHORS = new Set(["STARTS_AT", "ENDS_AT"]);

const STATUS_TRANSITIONS: Record<AcademySessionStatus, AcademySessionStatus[]> =
  {
    PLANNED: ["READY", "CANCELLED"],
    READY: ["IN_PROGRESS", "CANCELLED"],
    IN_PROGRESS: ["POST_COURSE"],
    POST_COURSE: ["COMPLETED"],
    COMPLETED: [],
    CANCELLED: [],
  };

const COURSE_STATUS_TRANSITIONS: Record<
  AcademyCourseStatus,
  AcademyCourseStatus[]
> = {
  DRAFT: ["ACTIVE"],
  ACTIVE: ["ARCHIVED"],
  ARCHIVED: ["ACTIVE"],
};

const TASK_STATUS_TRANSITIONS: Record<AcademyTaskStatus, AcademyTaskStatus[]> = {
  PENDING: ["IN_PROGRESS", "SUBMITTED", "BLOCKED", "SKIPPED"],
  IN_PROGRESS: ["SUBMITTED", "BLOCKED"],
  SUBMITTED: ["DONE", "REJECTED"],
  REJECTED: ["IN_PROGRESS"],
  BLOCKED: ["IN_PROGRESS"],
  DONE: [],
  SKIPPED: [],
};

const ASSET_TYPES = new Set<AcademyAssetType>([
  "PPT",
  "SCRIPT",
  "CASE",
  "POSTER",
  "INVITATION",
  "REPLAY",
]);
const DELIVERY_MODES = new Set<AcademyDeliveryMode>(["OFFLINE", "LIVE", "ONLINE"]);
const INVITATION_STATUSES = new Set(["PENDING", "INVITED", "REGISTERED", "CONFIRMED", "DECLINED"]);
const FOLLOW_UP_STATUSES = new Set(["PENDING", "IN_PROGRESS", "DONE"]);
const TASKS_REQUIRING_EVIDENCE = new Set(["COURSE_DEVELOPMENT", "COURSE_PACKAGING", "CONTENT", "ASSETS"]);
const asNonNegativeInteger = (value: unknown) => {
  const number = Number(value || 0);
  return Number.isInteger(number) && number >= 0 ? number : null;
};

const invalid = (message: string, code = 400) => failure<never>(message, code);
const DEFAULT_COURSE_CATEGORIES = [
  "公开课",
  "训练营",
  "企业内训",
  "产品培训",
  "销售转化课",
  "客户服务课",
  "内部员工培训",
].map((name, index) => ({
  id: `academy-category-${index + 1}`,
  name,
  description: "",
  sortOrder: index + 1,
  isActive: true,
}));
const buildCourseCode = (at: Date) => {
  const yearMonth = `${at.getUTCFullYear()}${String(at.getUTCMonth() + 1).padStart(2, "0")}`;
  return `AC-${yearMonth}-${randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`;
};

export function createAcademyService(
  repository: AcademyRepository,
  deps: {
    now?: () => Date;
    resolveScope?: (actor: AuthenticatedUser) => Promise<AcademyAccessScope>;
    resolveCustomer?: (id: string, actor: AuthenticatedUser) => Promise<AcademyParticipantReference | null>;
    resolveLead?: (id: string, actor: AuthenticatedUser) => Promise<AcademyParticipantReference | null>;
    resolveOrder?: (id: string, actor: AuthenticatedUser) => Promise<AcademyOrderReference | null>;
    addCustomerFollowUp?: (
      customerId: string,
      input: { content: string; type: "跟进记录" },
      actor: AuthenticatedUser,
    ) => Promise<{ code: number; message: string; data?: Customer | null }>;
    findBusinessAttachment?: (id: string) => Promise<(BusinessAttachment & { draftKey: string }) | null>;
    purgeBusinessAttachment?: (id: string) => Promise<boolean>;
  } = {},
) {
  const now = deps.now || (() => new Date());
  const resolveScope =
    deps.resolveScope ||
    (async (actor: AuthenticatedUser) => ({
      unrestricted: false,
      visibleUserIds: [actor.id],
    }));
  const loadCourseCategories = async () => {
    const stored = await repository.listCourseCategories();
    const byId = new Map(stored.map((item) => [item.id, item]));
    const timestamp = now();
    const defaults = DEFAULT_COURSE_CATEGORIES.map((item) => ({
      ...item,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...byId.get(item.id),
    }));
    const custom = stored.filter(
      (item) => !DEFAULT_COURSE_CATEGORIES.some((preset) => preset.id === item.id),
    );
    return [...defaults, ...custom].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh-CN"),
    );
  };
  const attachTaskEvidence = async <T extends AcademySessionTaskRecord>(tasks: T[]): Promise<Array<T & { attachments: BusinessAttachment[] }>> => {
    const byTaskId = await repository.listTaskAttachmentsByTaskIds(tasks.map((task) => task.id));
    return tasks.map((task) => ({ ...task, attachments: byTaskId.get(task.id) || [] }));
  };
  return {
    async authorizeCourseAsset(input: {
      courseId: string;
      actor: AuthenticatedUser;
      action: "read" | "write";
    }) {
      if (!hasPermission(input.actor, PERMISSION_KEYS.ACADEMY_COURSE_MANAGE, input.action)) return false;
      return Boolean(await repository.findCourseById(input.courseId, await resolveScope(input.actor)));
    },
    async authorizeTaskEvidence(input: {
      taskId: string;
      actor: AuthenticatedUser;
      action: "read" | "write";
      attachment?: BusinessAttachment;
    }) {
      const task = await repository.findTaskById(input.taskId);
      if (!task) return false;
      const attachments = await repository.listTaskAttachments(input.taskId);
      const isLinked = input.attachment ? attachments.some((item) => item.id === input.attachment!.id) : false;
      if (input.action === "write") {
        if (input.attachment && !isLinked) return input.attachment.uploadedById === input.actor.id;
        if (task.assigneeUserId !== input.actor.id || !["PENDING", "IN_PROGRESS", "REJECTED", "BLOCKED"].includes(task.status)) return false;
        if (input.attachment) return input.attachment.uploadedById === input.actor.id;
        return true;
      }
      if (task.assigneeUserId === input.actor.id) return isLinked;
      const session = await repository.findSessionById(task.sessionId);
      if (session?.taskReviewerUserId === input.actor.id) return isLinked;
      if (!hasPermission(input.actor, PERMISSION_KEYS.ACADEMY_SESSION_MANAGE, "read")) return false;
      const scoped = await repository.findTaskById(input.taskId, await resolveScope(input.actor));
      return Boolean(scoped) && isLinked;
    },
    async removeTaskAttachmentReference(taskId: string, attachmentId: string) {
      await repository.removeTaskAttachmentReference(taskId, attachmentId);
    },
    async isTaskAttachmentLinked(taskId: string, attachmentId: string) {
      return (await repository.listTaskAttachments(taskId)).some((item) => item.id === attachmentId);
    },
    async listLinkedTaskAttachmentIds(taskIds: string[]) {
      return repository.listLinkedTaskAttachmentIds(taskIds);
    },
    async listPublicCalendar(raw: { start?: string; end?: string }, actor: AuthenticatedUser) {
      const current = now();
      const day = current.getUTCDay() || 7;
      const defaultStart = new Date(current);
      defaultStart.setUTCDate(current.getUTCDate() - day + 1);
      defaultStart.setUTCHours(0, 0, 0, 0);
      const defaultEnd = new Date(defaultStart);
      defaultEnd.setUTCDate(defaultStart.getUTCDate() + 7);
      const start = raw.start ? new Date(raw.start) : defaultStart;
      const end = raw.end ? new Date(raw.end) : defaultEnd;
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start)
        return invalid("请选择有效的周历时间范围");
      if (end.getTime() - start.getTime() > 93 * 24 * 60 * 60 * 1000)
        return invalid("周历查询范围不能超过93天");
      const rows = await repository.listPublicCalendar({ start, end });
      return success(rows.map((session) => {
        const sorted = [...session.tasks].sort((left, right) => {
          const byOrder = Number(left.sortOrder || 0) - Number(right.sortOrder || 0);
          if (byOrder) return byOrder;
          return Number(left.dueAt || 0) - Number(right.dueAt || 0);
        });
        const done = sorted.filter((task) => ["DONE", "SKIPPED"].includes(task.status)).length;
        const publicTasks = sorted.map((task, index) => ({
          ...(task.assigneeUserId === actor.id ? { taskId: task.id } : {}),
          ...(task.assigneeUserId === actor.id ? { templateKey: task.templateKey, acceptanceCriteria: task.acceptanceCriteria || undefined, completionMode: task.completionMode || "NOTE", requiresReview: task.requiresReview === true, note: task.note || undefined, submissionNote: task.submissionNote || undefined, completedAt: task.completedAt?.toISOString(), reviewedAt: task.reviewedAt?.toISOString(), submittedAt: task.submittedAt?.toISOString() } : {}),
          stepNumber: Number(task.sortOrder || 0) || index + 1,
          title: task.title.replace(/^T(?:[+-][^\s]+|日)?\s*/, ""),
          category: task.category,
          isRequired: task.isRequired,
          reviewerUserName: task.requiresReview ? session.taskReviewerUserName || undefined : undefined,
          assigneeUserName: task.assigneeUserName || undefined,
          dueAt: task.dueAt?.toISOString(),
          status: task.status,
          isMine: task.assigneeUserId === actor.id,
        }));
        const activeCategory = session.status === "PLANNED" || session.status === "READY"
          ? "BEFORE"
          : session.status === "IN_PROGRESS"
            ? "DURING"
            : session.status === "POST_COURSE"
              ? "AFTER"
              : null;
        const currentStep = publicTasks.find((task) => task.category === activeCategory && !["DONE", "SKIPPED"].includes(task.status));
        return {
          id: session.id,
          title: session.title,
          courseTitle: session.courseTitle,
          startsAt: session.startsAt,
          endsAt: session.endsAt,
          deliveryMode: session.deliveryMode,
          status: session.status,
          lecturerUserName: session.lecturerUserName,
          progress: { done, total: sorted.length, percent: sorted.length ? Math.round(done / sorted.length * 100) : 0 },
          currentStep,
          tasks: publicTasks,
        };
      }));
    },
    async listMyTasks(
      raw: { page?: number; pageSize?: number; status?: string },
      actor: AuthenticatedUser,
    ) {
      const page = Math.max(1, Number(raw.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(raw.pageSize) || 10));
      const requestedStatus = String(raw.status || "OPEN").trim().toUpperCase();
      const result = await repository.listMyTasks(actor.id, {
        page,
        pageSize,
        status: requestedStatus === "ALL" ? undefined : requestedStatus,
      });
      return success({
        ...result,
        items:
          requestedStatus === "HISTORY"
            ? result.items.map((item) => ({ ...item, attachments: [] }))
            : await attachTaskEvidence(result.items),
        page,
        pageSize,
      });
    },
    async getSessionNextStep(id: string, actor: AuthenticatedUser) {
      const session = await repository.findSessionById(id, await resolveScope(actor));
      if (!session) return invalid("课程安排不存在", 404);
      const openTasks = (await repository.listSessionTasks(id))
        .filter((task) => !["DONE", "SKIPPED"].includes(task.status));
      const timestamp = now().getTime();
      const overdue = openTasks
        .filter((task) => task.dueAt && task.dueAt.getTime() < timestamp)
        .sort((a, b) => a.dueAt!.getTime() - b.dueAt!.getTime());
      const nearest = [...openTasks].sort((a, b) => {
        if (!a.dueAt) return 1;
        if (!b.dueAt) return -1;
        return a.dueAt.getTime() - b.dueAt.getTime();
      });
      const task = overdue[0] || nearest[0] || null;
      return success({ task, reason: overdue.length ? "OVERDUE" : task ? "NEAREST_DUE" : "COMPLETE" });
    },
    async listCourseCategories(_actor: AuthenticatedUser) {
      return success(await loadCourseCategories());
    },
    async listSopTemplates(_actor: AuthenticatedUser) {
      return success(await repository.listSopTemplates?.() || []);
    },
    async saveSopTemplate(raw: Record<string, unknown>, actor: AuthenticatedUser) {
      const id = String(raw.id || "").trim() || `academy-sop-${randomUUID()}`;
      const name = String(raw.name || "").trim();
      const rawSteps = Array.isArray(raw.steps) ? raw.steps as Array<Record<string, unknown>> : [];
      if (!name) return invalid("课程流程名称不能为空");
      if (id.length > 64) return invalid("课程流程标识不能超过64个字符");
      if (name.length > 160) return invalid("课程流程名称不能超过160个字符");
      if (!rawSteps.length) return invalid("课程流程至少需要一个步骤");
      if (rawSteps.length > 30) return invalid("一套课程流程最多配置30个步骤");
      const duplicateKeys = rawSteps.map((item) => String(item.stepKey || "").trim()).filter(Boolean);
      if (new Set(duplicateKeys).size !== rawSteps.length) return invalid("流程步骤标识不能为空且不能重复");
      if (!repository.saveSopTemplate) return invalid("课程流程配置暂不可用", 503);
      const existing = await repository.findSopTemplateById?.(id) || null;
      const nextStatus = raw.status === "INACTIVE" ? "INACTIVE" : "ACTIVE";
      if (raw.isDefault === true && nextStatus !== "ACTIVE") return invalid("默认课程流程必须保持启用");
      if (existing?.isDefault && raw.isDefault !== true) return invalid("请先将另一套启用流程设为默认流程", 409);
      const timestamp = now();
      const steps: AcademySopTemplateStepRecord[] = [];
      for (let index = 0; index < rawSteps.length; index += 1) {
        const item = rawSteps[index];
        const title = String(item.title || "").trim();
        const stepKey = String(item.stepKey || "").trim();
        const category = String(item.category || "BEFORE") as AcademySopTemplateStepRecord["category"];
        const assigneeRole = String(item.assigneeRole || "PROJECT_OWNER") as AcademyTaskAssigneeRole;
        const dueAnchor = String(item.dueAnchor || "STARTS_AT") as AcademySopTemplateStepRecord["dueAnchor"];
        const completionMode = String(item.completionMode || "CONFIRM") as AcademyTaskCompletionMode;
        const dueOffsetMinutes = item.dueOffsetMinutes === "" || item.dueOffsetMinutes == null ? null : Number(item.dueOffsetMinutes);
        if (!title) return invalid(`第${index + 1}个步骤名称不能为空`);
        if (stepKey.length > 40) return invalid(`第${index + 1}个步骤标识不能超过40个字符`);
        if (title.length > 200) return invalid(`第${index + 1}个步骤名称不能超过200个字符`);
        if (!TASK_CATEGORIES.has(category)) return invalid(`第${index + 1}个步骤阶段无效`);
        if (!ASSIGNEE_ROLES.has(assigneeRole)) return invalid(`第${index + 1}个步骤负责人角色无效`);
        if (!DUE_ANCHORS.has(dueAnchor)) return invalid(`第${index + 1}个步骤时间基准无效`);
        if (!COMPLETION_MODES.has(completionMode)) return invalid(`第${index + 1}个步骤完成方式无效`);
        if (dueOffsetMinutes !== null && (!Number.isInteger(dueOffsetMinutes) || Math.abs(dueOffsetMinutes) > 525600)) return invalid(`第${index + 1}个步骤时间偏移无效`);
        steps.push({
          id: existing?.steps.find((step) => step.stepKey === stepKey)?.id || `academy-sop-step-${randomUUID()}`,
          templateId: id,
          stepKey,
          title,
          category,
          sortOrder: index + 1,
          assigneeRole,
          dueAnchor,
          dueOffsetMinutes,
          completionMode,
          requiresReview: item.requiresReview === true,
          acceptanceCriteria: String(item.acceptanceCriteria || "").trim() || null,
          isRequired: item.isRequired !== false,
          createdAt: existing?.steps.find((step) => step.stepKey === item.stepKey)?.createdAt || timestamp,
          updatedAt: timestamp,
        });
      }
      return success(await repository.saveSopTemplate({
        id,
        name,
        description: String(raw.description || "").trim(),
        status: nextStatus,
        isDefault: raw.isDefault === true,
        createdById: existing?.createdById || actor.id,
        createdByName: existing?.createdByName || actor.name,
        createdAt: existing?.createdAt || timestamp,
        updatedAt: timestamp,
        steps,
      }));
    },
    async deleteSopTemplate(id: string, _actor: AuthenticatedUser) {
      const templateId = String(id || "").trim();
      if (!templateId) return invalid("课程流程标识不能为空");
      const existing = await repository.findSopTemplateById?.(templateId) || null;
      if (!existing) return invalid("课程流程不存在", 404);
      if (existing.isDefault) return invalid("默认课程流程不能删除，请先将其他流程设为默认", 409);
      if (!repository.deleteSopTemplate) return invalid("课程流程删除暂不可用", 503);
      await repository.deleteSopTemplate(templateId);
      return success({ id: templateId });
    },
    async saveCourseCategory(raw: Record<string, unknown>, _actor: AuthenticatedUser) {
      const id = String(raw.id || "").trim() || `academy-category-${randomUUID()}`;
      const name = String(raw.name || "").trim();
      if (!name) return invalid("课程分类名称不能为空");
      const categories = await loadCourseCategories();
      if (categories.some((item) => item.id !== id && item.name === name)) return invalid("课程分类名称已存在", 409);
      const existing = categories.find((item) => item.id === id);
      const timestamp = now();
      return success(await repository.upsertCourseCategory({
        id,
        name,
        description: String(raw.description || "").trim(),
        sortOrder: Math.max(1, Number(raw.sortOrder) || existing?.sortOrder || categories.length + 1),
        isActive: raw.isActive !== false,
        createdAt: existing?.createdAt || timestamp,
        updatedAt: timestamp,
      }));
    },
    async getDashboard(actor: AuthenticatedUser) {
      const dashboard = await repository.getDashboard(await resolveScope(actor));
      return success({
        ...dashboard,
        pendingFollowUps: hasPermission(actor, PERMISSION_KEYS.ACADEMY_ENGAGEMENT_MANAGE)
          ? dashboard.pendingFollowUps
          : 0,
      });
    },
    async listCourses(
      raw: {
        page?: number;
        pageSize?: number;
        search?: string;
        status?: string;
      },
      actor: AuthenticatedUser,
    ) {
      const page = Math.max(1, Number(raw.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(raw.pageSize) || 10));
      return success({
        ...(await repository.listCourses(
          { page, pageSize, search: raw.search?.trim(), status: raw.status },
          await resolveScope(actor),
        )),
        page,
        pageSize,
      });
    },
    async listCourseAssets(courseId: string, actor: AuthenticatedUser) {
      const course = await repository.findCourseById(courseId, await resolveScope(actor));
      if (!course) return invalid("课程不存在", 404);
      return success(await repository.listCourseAssets(courseId));
    },
    async saveCourseAsset(
      courseId: string,
      raw: Record<string, unknown>,
      actor: AuthenticatedUser,
    ) {
      const course = await repository.findCourseById(courseId, await resolveScope(actor));
      if (!course) return invalid("课程不存在", 404);
      const assetType = String(raw.assetType || "") as AcademyAssetType;
      if (!ASSET_TYPES.has(assetType)) return invalid("课程资产类型无效");
      const requestedIds = Array.isArray(raw.attachments)
        ? [...new Set(raw.attachments.map((item) => String((item as { id?: unknown })?.id || "").trim()).filter(Boolean))]
        : [];
      if (!requestedIds.length) return invalid("请至少上传一个课程资产文件");
      if (requestedIds.length > 20) return invalid("每类课程资产最多关联20个文件");
      if (!deps.findBusinessAttachment) return invalid("附件服务暂不可用", 409);
      const existingAssets = await repository.listCourseAssets(courseId);
      const existingAttachmentIds = new Set(existingAssets.flatMap((item) => item.attachments.map((attachment) => attachment.id)));
      const attachments: BusinessAttachment[] = [];
      const expectedDraftKey = `academy-course-${courseId}-${assetType}`;
      for (const attachmentId of requestedIds) {
        const attachment = await deps.findBusinessAttachment(attachmentId);
        if (
          !attachment
          || attachment.category !== "academy-course-asset"
          || attachment.draftKey !== expectedDraftKey
          || (!existingAttachmentIds.has(attachmentId) && attachment.uploadedById !== actor.id)
        ) return invalid("课程资产附件不存在或无权关联", 404);
        const { draftKey: _draftKey, ...publicAttachment } = attachment;
        attachments.push(publicAttachment);
      }
      const courseVersionId = await repository.findLatestCourseVersionId(courseId);
      if (!courseVersionId) return invalid("课程尚无可用版本", 409);
      const timestamp = now();
      const existing = existingAssets.find(
        (item) => item.assetType === assetType,
      );
      return success(
        await repository.upsertCourseAsset({
          id: `academy-asset-${courseId}-${assetType}`,
          courseId,
          courseVersionId,
          assetType,
          title: String(raw.title || "").trim() || course.title,
          attachments,
          ownerUserId: actor.id,
          ownerUserName: actor.name,
          createdAt: existing?.createdAt || timestamp,
          updatedAt: timestamp,
        }),
      );
    },
    async createCourse(raw: Record<string, unknown>, actor: AuthenticatedUser) {
      const title = String(raw.title || "").trim();
      const category = String(raw.category || "").trim();
      const duration = Number(raw.defaultDurationMinutes);
      if (!title || !category) return invalid("课程名称和分类不能为空");
      const categories = await loadCourseCategories();
      if (!categories.some((item) => item.name === category && item.isActive)) return invalid("课程分类不存在或已停用");
      if (!Number.isInteger(duration) || duration <= 0 || duration > 1440)
        return invalid("课程时长必须是1到1440分钟的整数");
      const timestamp = now();
      let code = "";
      for (let attempts = 0; attempts < 5; attempts += 1) {
        const candidate = buildCourseCode(timestamp);
        if (!await repository.findCourseByCode(candidate)) {
          code = candidate;
          break;
        }
      }
      if (!code) return invalid("课程编码生成失败，请重试", 409);

      const requestedOwnerId = String(raw.ownerUserId || actor.id).trim();
      const owner = requestedOwnerId === actor.id
        ? { id: actor.id, name: actor.name }
        : await repository.findActiveUserById(requestedOwnerId);
      if (!owner) return invalid("课程维护人不存在或已停用");
      const conversionProductId = String(raw.conversionProductId || "").trim();
      const conversionProduct = conversionProductId
        ? await repository.findActiveProductById(conversionProductId)
        : null;
      if (conversionProductId && !conversionProduct) return invalid("转化产品不存在或已停用");
      const course: AcademyCourseRecord = {
        id: `academy-course-${randomUUID()}`,
        code,
        title,
        category,
        summary: String(raw.summary || "").trim(),
        targetAudience: String(raw.targetAudience || "").trim() || null,
        customerProblem: String(raw.customerProblem || "").trim() || null,
        coreViewpoint: String(raw.coreViewpoint || "").trim() || null,
        conversionProductId: conversionProduct?.id || null,
        conversionProductName: conversionProduct?.name || null,
        defaultDurationMinutes: duration,
        objectives: Array.isArray(raw.objectives)
          ? raw.objectives
              .map(String)
              .map((item) => item.trim())
              .filter(Boolean)
          : [],
        status: "DRAFT",
        ownerUserId: owner.id,
        ownerUserName: owner.name,
        lecturerUserId: null,
        lecturerUserName: null,
        sopTemplateId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const created = await repository.createCourse(course);
      await repository.createCourseVersion({
        id: `academy-course-version-${randomUUID()}`,
        courseId: created.id,
        versionNumber: 1,
        title: created.title,
        summary: created.summary,
        targetAudience: created.targetAudience,
        customerProblem: created.customerProblem,
        coreViewpoint: created.coreViewpoint,
        conversionProductId: created.conversionProductId,
        conversionProductName: created.conversionProductName,
        objectives: created.objectives,
        status: "DRAFT",
        createdById: actor.id,
        createdByName: actor.name,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      return success(created);
    },
    async updateCourse(id: string, raw: Record<string, unknown>, actor: AuthenticatedUser) {
      const course = await repository.findCourseById(id, await resolveScope(actor));
      if (!course) return invalid("课程不存在", 404);
      const title = String(raw.title || "").trim();
      const category = String(raw.category || "").trim();
      const duration = Number(raw.defaultDurationMinutes);
      if (!title || !category) return invalid("课程名称和分类不能为空");
      const categories = await loadCourseCategories();
      if (!categories.some((item) => item.name === category && item.isActive)) return invalid("课程分类不存在或已停用");
      if (!Number.isInteger(duration) || duration <= 0 || duration > 1440) return invalid("课程时长必须是1到1440分钟的整数");
      const ownerId = String(raw.ownerUserId || course.ownerUserId).trim();
      const owner = ownerId === actor.id ? { id: actor.id, name: actor.name } : await repository.findActiveUserById(ownerId);
      if (!owner) return invalid("课程维护人不存在或已停用");
      const conversionProductId = String(raw.conversionProductId || "").trim();
      const conversionProduct = conversionProductId ? await repository.findActiveProductById(conversionProductId) : null;
      if (conversionProductId && !conversionProduct) return invalid("转化产品不存在或已停用");
      const timestamp = now();
      const update = {
        title,
        category,
        summary: String(raw.summary || "").trim(),
        targetAudience: String(raw.targetAudience || "").trim() || null,
        customerProblem: String(raw.customerProblem || "").trim() || null,
        coreViewpoint: String(raw.coreViewpoint || "").trim() || null,
        conversionProductId: conversionProduct?.id || null,
        conversionProductName: conversionProduct?.name || null,
        defaultDurationMinutes: duration,
        sopTemplateId: null,
        objectives: Array.isArray(raw.objectives) ? raw.objectives.map(String).map((item) => item.trim()).filter(Boolean) : [],
        ownerUserId: owner.id,
        ownerUserName: owner.name,
        lecturerUserId: null,
        lecturerUserName: null,
        updatedAt: timestamp,
      };
      const updated = await repository.updateCourse(id, update);
      if (!updated) return invalid("课程已变化，请刷新后重试", 409);
      await repository.createCourseVersion({
        id: `academy-course-version-${randomUUID()}`,
        courseId: id,
        versionNumber: await repository.getNextCourseVersionNumber(id),
        title: updated.title,
        summary: updated.summary,
        targetAudience: updated.targetAudience,
        customerProblem: updated.customerProblem,
        coreViewpoint: updated.coreViewpoint,
        conversionProductId: updated.conversionProductId,
        conversionProductName: updated.conversionProductName,
        objectives: updated.objectives,
        status: updated.status === "ACTIVE" ? "ACTIVE" : "DRAFT",
        createdById: actor.id,
        createdByName: actor.name,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      return success(updated);
    },
    async changeCourseStatus(
      id: string,
      nextStatus: AcademyCourseStatus,
      actor: AuthenticatedUser,
    ) {
      const course = await repository.findCourseById(id, await resolveScope(actor));
      if (!course) return invalid("课程不存在", 404);
      if (!COURSE_STATUS_TRANSITIONS[course.status].includes(nextStatus))
        return invalid("当前课程状态不允许执行该操作", 409);
      const updated = await repository.updateCourseStatus(
        id,
        course.status,
        nextStatus,
      );
      return updated
        ? success(updated)
        : invalid("课程状态已变化，请刷新后重试", 409);
    },
    async listSessions(
      raw: {
        page?: number;
        pageSize?: number;
        search?: string;
        status?: string;
      },
      actor: AuthenticatedUser,
    ) {
      const page = Math.max(1, Number(raw.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(raw.pageSize) || 10));
      const canManage =
        hasPermission(actor, PERMISSION_KEYS.ACADEMY_SESSION_MANAGE) ||
        hasPermission(actor, PERMISSION_KEYS.ACADEMY_PLAN_MANAGE) ||
        hasPermission(actor, PERMISSION_KEYS.ACADEMY_REVIEW_MANAGE);
      const actorScope = await resolveScope(actor);
      const result = await repository.listSessions(
        {
          page,
          pageSize,
          search: raw.search?.trim(),
          status: raw.status,
          includeAudience: "ALL_EMPLOYEES",
        },
        actorScope,
      );
      const items = result.items.map((item: any) => {
            const { tasks: assignedTasks = [], ...session } = item;
            const canOpenDetail = actorScope.unrestricted ||
              actorScope.visibleUserIds.includes(item.createdById) ||
              actorScope.visibleUserIds.includes(item.facilitatorUserId) ||
              actorScope.visibleUserIds.includes(item.lecturerUserId) ||
              (item.collaboratorUserIds || []).some((id: string) => actorScope.visibleUserIds.includes(id)) ||
              actorScope.visibleUserIds.includes(item.course?.ownerUserId) ||
              assignedTasks.length > 0;
            if (canOpenDetail) return { ...session, canOpenDetail: true };
            return ({
            ...session,
            canOpenDetail,
            meetingUrl: null,
            facilitatorUserId: null,
            facilitatorUserName: null,
            collaboratorUserIds: [],
            collaboratorNames: [],
            inviteTarget: 0,
            registrationTarget: 0,
            attendanceTarget: 0,
            consultationTarget: 0,
            dealTarget: 0,
            targetRevenue: 0,
            course: item.course ? { code: item.course.code, title: item.course.title, category: item.course.category } : undefined,
            _count: { engagements: 0, tasks: 0 },
          });
        });
      return success({
        ...result,
        items,
        page,
        pageSize,
      });
    },
    async getSessionDetail(id: string, actor: AuthenticatedUser) {
      const detail = await repository.getSessionDetail(
        id,
        await resolveScope(actor),
      );
      if (!detail) return invalid("课程安排不存在", 404);
      const canViewSalesData = hasPermission(actor, PERMISSION_KEYS.ACADEMY_ENGAGEMENT_MANAGE);
      const canOperateSession =
        hasPermission(actor, PERMISSION_KEYS.ACADEMY_SESSION_MANAGE) ||
        hasPermission(actor, PERMISSION_KEYS.ACADEMY_REVIEW_MANAGE);
      const engagements = canViewSalesData
        ? (await Promise.all(detail.engagements.map(async (item) => {
            const participant = item.customerId
              ? await deps.resolveCustomer?.(item.customerId, actor)
              : item.leadId
                ? await deps.resolveLead?.(item.leadId, actor)
                : null;
            return participant
              ? {
                  ...item,
                  participantName: participant.name,
                  ownerUserId: participant.ownerUserId || item.ownerUserId,
                  ownerUserName: participant.ownerUserName || item.ownerUserName,
                }
              : null;
          }))).filter(Boolean) as AcademyEngagementRecord[]
        : canOperateSession
          ? detail.engagements.map((item) => ({
              ...item,
              participantKey: `academy:${item.id}`,
              customerId: null,
              leadId: null,
              followUpStatus: "",
              nextFollowUpAt: null,
              orderId: null,
              orderNo: null,
              handoffStatus: "",
              handedOffAt: null,
              handedOffById: null,
              handedOffByName: null,
              notes: null,
              ownerUserId: null,
              ownerUserName: null,
            }))
          : [];
      return success({
        ...detail,
        tasks: await attachTaskEvidence(detail.tasks),
        engagements,
        review: hasPermission(actor, PERMISSION_KEYS.ACADEMY_REVIEW_MANAGE) ? detail.review : null,
      });
    },
    async createSession(
      raw: Record<string, unknown>,
      actor: AuthenticatedUser,
    ) {
      const courseId = String(raw.courseId || "").trim();
      const title = String(raw.title || "").trim();
      const startsAt = new Date(String(raw.startsAt || ""));
      const endsAt = new Date(String(raw.endsAt || ""));
      const capacity = Number(raw.capacity);
      const deliveryMode = String(raw.deliveryMode || "LIVE") as AcademyDeliveryMode;
      if (
        !courseId ||
        Number.isNaN(startsAt.getTime()) ||
        Number.isNaN(endsAt.getTime())
      )
        return invalid("课程和时间不能为空");
      if (endsAt <= startsAt) return invalid("结束时间必须晚于开始时间");
      if (startsAt < now() && raw.isHistoricalBackfill !== true)
        return invalid("正常排期不能选择过去时间；如需补录，请开启历史课程补录");
      if (raw.isHistoricalBackfill === true && startsAt >= now())
        return invalid("历史课程补录必须选择过去的开课时间");
      if (!Number.isInteger(capacity) || capacity <= 0)
        return invalid("场次容量必须是正整数");
      if (!DELIVERY_MODES.has(deliveryMode)) return invalid("请选择有效的授课方式");
      const course = await repository.findCourseById(courseId, await resolveScope(actor));
      if (!course) return invalid("所选课程不存在", 404);
      if (course.status !== "ACTIVE")
        return invalid("只有已启用课程可以创建场次", 409);
      const courseVersionId =
        await repository.findLatestCourseVersionId(courseId);
      if (!courseVersionId)
        return invalid("课程尚无可用版本，不能创建场次", 409);
      const requestedTemplateId = String(raw.sopTemplateId || "").trim();
      if (!requestedTemplateId) return invalid("请选择本次课程执行流程");
      const template = await repository.findSopTemplateById?.(requestedTemplateId);
      if (!template || template.status !== "ACTIVE" || !template.steps.length)
        return invalid("请选择一套已启用的课程执行流程", 409);
      const requiredRoles = new Set(template.steps.map((item) => item.assigneeRole));
      const projectOwnerUserId = String(raw.projectOwnerUserId || raw.facilitatorUserId || "").trim();
      const projectOwner = projectOwnerUserId
        ? await repository.findActiveUserById(projectOwnerUserId)
        : null;
      if (!projectOwner) return invalid("请选择有效的项目负责人");
      const contentOwnerUserId = String(raw.contentOwnerUserId || "").trim();
      const materialOwnerUserId = String(raw.materialOwnerUserId || "").trim();
      const reviewOwnerUserId = String(raw.reviewOwnerUserId || "").trim();
      const taskReviewerUserId = String(raw.taskReviewerUserId || projectOwnerUserId).trim();
      const [contentOwner, materialOwner, reviewOwner] = await Promise.all([
        contentOwnerUserId ? repository.findActiveUserById(contentOwnerUserId) : Promise.resolve(null),
        materialOwnerUserId ? repository.findActiveUserById(materialOwnerUserId) : Promise.resolve(null),
        reviewOwnerUserId ? repository.findActiveUserById(reviewOwnerUserId) : Promise.resolve(null),
      ]);
      if (requiredRoles.has("CONTENT_OWNER") && !contentOwner) return invalid("请选择有效的课程内容负责人");
      if (requiredRoles.has("MATERIAL_OWNER") && !materialOwner) return invalid("请选择有效的素材负责人");
      if (requiredRoles.has("REVIEW_OWNER") && !reviewOwner) return invalid("请选择有效的复盘负责人");
      const taskReviewer = await repository.findActiveUserById(taskReviewerUserId);
      if (!taskReviewer) return invalid("请选择有效的任务验收人");
      const lecturerUserId = String(raw.lecturerUserId || "").trim();
      const lecturer = lecturerUserId
        ? await repository.findActiveUserById(lecturerUserId)
        : null;
      if (lecturerUserId && !lecturer) return invalid("所选主讲人不存在或已停用");
      if (requiredRoles.has("LECTURER") && !lecturer) return invalid("请选择有效的主讲人");
      const collaboratorUserIds = Array.isArray(raw.collaboratorUserIds)
        ? [...new Set(raw.collaboratorUserIds.map(String).map((item) => item.trim()).filter(Boolean))]
        : [];
      const collaborators = await Promise.all(
        collaboratorUserIds.map((userId) => repository.findActiveUserById(userId)),
      );
      if (collaborators.some((user) => !user)) return invalid("协作人员中包含已停用或不存在的员工");
      const venue = String(raw.venue || "").trim();
      const meetingUrl = String(raw.meetingUrl || "").trim();
      if ((deliveryMode === "OFFLINE" || deliveryMode === "LIVE") && !venue)
        return invalid(deliveryMode === "OFFLINE" ? "请填写授课场地" : "请填写直播间");
      if (deliveryMode === "ONLINE" && !meetingUrl) return invalid("请填写会议链接");
      const targets = {
        inviteTarget: asNonNegativeInteger(raw.inviteTarget),
        registrationTarget: asNonNegativeInteger(raw.registrationTarget),
        attendanceTarget: asNonNegativeInteger(raw.attendanceTarget),
        consultationTarget: asNonNegativeInteger(raw.consultationTarget),
        dealTarget: asNonNegativeInteger(raw.dealTarget),
      };
      if (Object.values(targets).some((value) => value === null))
        return invalid("经营目标人数必须是大于等于0的整数");
      const targetRevenue = Number(raw.targetRevenue || 0);
      if (!Number.isFinite(targetRevenue) || targetRevenue < 0)
        return invalid("目标成交金额必须大于等于0");
      const timestamp = now();
      const audience = raw.audience === "RESPONSIBLE_ONLY" ? "RESPONSIBLE_ONLY" : "ALL_EMPLOYEES";
      const session: AcademySessionRecord = {
        id: `academy-session-${randomUUID()}`,
        courseId,
        courseVersionId,
        title: title || `${course.title}｜${startsAt.toLocaleDateString("zh-CN")}`,
        startsAt,
        endsAt,
        deliveryMode,
        venue,
        meetingUrl: meetingUrl || null,
        capacity,
        inviteTarget: targets.inviteTarget!,
        registrationTarget: targets.registrationTarget!,
        attendanceTarget: targets.attendanceTarget!,
        consultationTarget: targets.consultationTarget!,
        dealTarget: targets.dealTarget!,
        targetRevenue,
        status: "PLANNED",
        isHistoricalBackfill: raw.isHistoricalBackfill === true,
        audience,
        isInvitable: audience === "ALL_EMPLOYEES" && raw.isInvitable !== false,
        facilitatorUserId: projectOwner.id,
        facilitatorUserName: projectOwner.name,
        taskReviewerUserId: taskReviewer.id,
        taskReviewerUserName: taskReviewer.name,
        lecturerUserId: lecturer?.id || null,
        lecturerUserName: lecturer?.name || null,
        collaboratorUserIds,
        collaboratorNames: collaborators.filter(Boolean).map((user) => user!.name),
        createdById: actor.id,
        createdByName: actor.name,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const assigneeForRole = {
        PROJECT_OWNER: projectOwner,
        CONTENT_OWNER: contentOwner || projectOwner,
        MATERIAL_OWNER: materialOwner || projectOwner,
        LECTURER: lecturer || projectOwner,
        REVIEW_OWNER: reviewOwner || projectOwner,
      };
      const checklist: AcademySessionTaskRecord[] = template.steps.map((item) => {
        const assignee = assigneeForRole[item.assigneeRole];
        const anchor = item.dueAnchor === "ENDS_AT" ? endsAt : startsAt;
        return {
          id: `academy-task-${randomUUID()}`,
          sessionId: session.id,
          templateKey: item.stepKey,
          title: item.title,
          category: item.category,
          isRequired: item.isRequired,
          status: "PENDING",
          assigneeUserId: assignee.id,
          assigneeUserName: assignee.name,
          collaboratorNames: [],
          dueAt: item.dueOffsetMinutes == null ? null : new Date(anchor.getTime() + item.dueOffsetMinutes * 60_000),
          dueAnchor: item.dueAnchor,
          dueOffsetMinutes: item.dueOffsetMinutes,
          acceptanceCriteria: item.acceptanceCriteria || null,
          sopTemplateId: template.id,
          sopTemplateStepId: item.id,
          assigneeRole: item.assigneeRole,
          sortOrder: item.sortOrder,
          completionMode: item.completionMode,
          requiresReview: item.requiresReview,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
      });
      return success(await repository.createSession(session, checklist));
    },
    async updateSession(id: string, raw: Record<string, unknown>, actor: AuthenticatedUser) {
      const scope = await resolveScope(actor);
      const current = await repository.findSessionById(id, scope);
      if (!current) return invalid("课程安排不存在", 404);
      if (!["PLANNED", "READY"].includes(current.status)) return invalid("只有已排期或待开课课程可以调整安排", 409);
      const startsAt = new Date(String(raw.startsAt || current.startsAt));
      const endsAt = new Date(String(raw.endsAt || current.endsAt));
      if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return invalid("课程时间不能为空");
      if (endsAt <= startsAt) return invalid("结束时间必须晚于开始时间");
      if (current.isHistoricalBackfill && startsAt >= now()) return invalid("历史补录课程必须保留在过去时间");
      if (!current.isHistoricalBackfill && startsAt < now() && current.startsAt >= now()) return invalid("正常排期不能调整到过去时间");
      if (!current.isHistoricalBackfill && current.startsAt < now() && startsAt.getTime() !== current.startsAt.getTime()) return invalid("已过期的普通排期不能再调整开课时间；如需补录请新建历史课程");
      const deliveryMode = String(raw.deliveryMode || current.deliveryMode || "LIVE") as AcademyDeliveryMode;
      if (!DELIVERY_MODES.has(deliveryMode)) return invalid("请选择有效的授课方式");
      const venue = String(raw.venue ?? current.venue ?? "").trim();
      const meetingUrl = String(raw.meetingUrl ?? current.meetingUrl ?? "").trim();
      if ((deliveryMode === "OFFLINE" || deliveryMode === "LIVE") && !venue) return invalid(deliveryMode === "OFFLINE" ? "请填写授课场地" : "请填写直播间");
      if (deliveryMode === "ONLINE" && !meetingUrl) return invalid("请填写会议链接");
      const projectOwnerUserId = String(raw.projectOwnerUserId || raw.facilitatorUserId || current.facilitatorUserId || "").trim();
      const lecturerUserId = String(raw.lecturerUserId || current.lecturerUserId || "").trim();
      const taskReviewerUserId = String(raw.taskReviewerUserId || current.taskReviewerUserId || current.facilitatorUserId || "").trim();
      const [projectOwner, lecturer, taskReviewer] = await Promise.all([
        repository.findActiveUserById(projectOwnerUserId),
        lecturerUserId ? repository.findActiveUserById(lecturerUserId) : Promise.resolve(null),
        repository.findActiveUserById(taskReviewerUserId),
      ]);
      if (!projectOwner) return invalid("请选择有效的项目负责人");
      if (lecturerUserId && !lecturer) return invalid("请选择有效的主讲人");
      if (!taskReviewer) return invalid("请选择有效的任务验收人");
      const tasks = await repository.listSessionTasks(id);
      const ownerIds: Record<AcademyTaskAssigneeRole, string> = {
        PROJECT_OWNER: projectOwner.id,
        CONTENT_OWNER: String(raw.contentOwnerUserId || tasks.find((item) => item.assigneeRole === "CONTENT_OWNER")?.assigneeUserId || projectOwner.id),
        MATERIAL_OWNER: String(raw.materialOwnerUserId || tasks.find((item) => item.assigneeRole === "MATERIAL_OWNER")?.assigneeUserId || projectOwner.id),
        LECTURER: lecturer?.id || projectOwner.id,
        REVIEW_OWNER: String(raw.reviewOwnerUserId || tasks.find((item) => item.assigneeRole === "REVIEW_OWNER")?.assigneeUserId || projectOwner.id),
      };
      const ownerEntries = await Promise.all(Object.entries(ownerIds).map(async ([role, userId]) => [role, await repository.findActiveUserById(userId)] as const));
      if (ownerEntries.some(([, user]) => !user)) return invalid("负责人中包含已停用或不存在的员工");
      const owners = Object.fromEntries(ownerEntries) as Record<AcademyTaskAssigneeRole, { id: string; name: string }>;
      const taskUpdates = tasks.map((task) => {
        const role = task.assigneeRole || "PROJECT_OWNER";
        const owner = owners[role];
        const usesEndAnchor = task.dueAnchor ? task.dueAnchor === "ENDS_AT" : task.category === "AFTER";
        const oldAnchor = usesEndAnchor ? current.endsAt : current.startsAt;
        const newAnchor = usesEndAnchor ? endsAt : startsAt;
        const offsetMinutes = task.dueOffsetMinutes ?? (task.dueAt == null ? null : Math.round((task.dueAt.getTime() - oldAnchor.getTime()) / 60_000));
        const dueAt = offsetMinutes == null ? null : new Date(newAnchor.getTime() + offsetMinutes * 60_000);
        return { id: task.id, update: { assigneeUserId: owner.id, assigneeUserName: owner.name, dueAt, updatedAt: now() } };
      });
      const capacity = Number(raw.capacity ?? current.capacity);
      if (!Number.isInteger(capacity) || capacity <= 0) return invalid("课程容量必须是正整数");
      const targets = {
        inviteTarget: asNonNegativeInteger(raw.inviteTarget ?? current.inviteTarget),
        registrationTarget: asNonNegativeInteger(raw.registrationTarget ?? current.registrationTarget),
        attendanceTarget: asNonNegativeInteger(raw.attendanceTarget ?? current.attendanceTarget),
        consultationTarget: asNonNegativeInteger(raw.consultationTarget ?? current.consultationTarget),
        dealTarget: asNonNegativeInteger(raw.dealTarget ?? current.dealTarget),
      };
      if (Object.values(targets).some((value) => value === null)) return invalid("经营目标人数必须是大于等于0的整数");
      const targetRevenue = Number(raw.targetRevenue ?? current.targetRevenue ?? 0);
      if (!Number.isFinite(targetRevenue) || targetRevenue < 0) return invalid("目标成交金额必须大于等于0");
      const audience = raw.audience == null
        ? current.audience
        : raw.audience === "RESPONSIBLE_ONLY" ? "RESPONSIBLE_ONLY" : "ALL_EMPLOYEES";
      const updated = await repository.updateSession(id, current.status, {
        title: String(raw.title || current.title).trim(), startsAt, endsAt, deliveryMode, venue,
        meetingUrl: meetingUrl || null, capacity, facilitatorUserId: projectOwner.id,
        facilitatorUserName: projectOwner.name, lecturerUserId: lecturer?.id || null,
        lecturerUserName: lecturer?.name || null,
        taskReviewerUserId: taskReviewer.id, taskReviewerUserName: taskReviewer.name,
        inviteTarget: targets.inviteTarget!, registrationTarget: targets.registrationTarget!,
        attendanceTarget: targets.attendanceTarget!, consultationTarget: targets.consultationTarget!,
        dealTarget: targets.dealTarget!, targetRevenue, audience,
        isInvitable: audience === "ALL_EMPLOYEES" && (raw.isInvitable == null ? current.isInvitable : raw.isInvitable !== false),
        updatedAt: now(),
      }, taskUpdates);
      return updated ? success(updated) : invalid("课程安排已变化，请刷新后重试", 409);
    },
    async changeSessionStatus(
      id: string,
      nextStatus: AcademySessionStatus,
      actor: AuthenticatedUser,
    ) {
      const session = await repository.findSessionById(id, await resolveScope(actor));
      if (!session) return invalid("课程场次不存在", 404);
      if (!STATUS_TRANSITIONS[session.status].includes(nextStatus))
        return invalid("当前状态不允许执行该操作", 409);
      if (["READY", "POST_COURSE", "COMPLETED"].includes(nextStatus)) {
        const tasks = await repository.listSessionTasks(id);
        const requiredCategory = nextStatus === "READY"
          ? "BEFORE"
          : nextStatus === "POST_COURSE"
            ? "DURING"
            : "AFTER";
        const pending = tasks.filter(
          (task) =>
            task.category === requiredCategory &&
            task.isRequired &&
            task.status !== "DONE",
        );
        if (pending.length)
          return invalid(`还有${pending.length}项必做${requiredCategory === "BEFORE" ? "课前" : requiredCategory === "DURING" ? "课中" : "课后"}任务未完成`, 409);
      }
      const updated = await repository.updateSessionStatus(
        id,
        session.status,
        nextStatus,
        nextStatus === "CANCELLED"
          ? {
              status: "SKIPPED",
              note: "课程安排已取消，任务自动关闭",
              completedAt: now(),
              completedById: actor.id,
              completedByName: actor.name,
              updatedAt: now(),
            }
          : undefined,
      );
      return updated
        ? success(updated)
        : invalid("场次状态已变化，请刷新后重试", 409);
    },
    async updateTask(
      id: string,
      raw: {
        status: AcademyTaskStatus;
        note?: string;
        submissionNote?: string;
        reviewNote?: string;
      },
      actor: AuthenticatedUser,
    ) {
      if (!Object.prototype.hasOwnProperty.call(TASK_STATUS_TRANSITIONS, raw.status))
        return invalid("无效的执行项状态");
      const canManageAllTasks = hasPermission(actor, PERMISSION_KEYS.ACADEMY_SESSION_MANAGE, "write");
      const current = await repository.findTaskById(id, canManageAllTasks ? await resolveScope(actor) : undefined);
      if (!current) return invalid("执行项不存在", 404);
      if (!TASK_STATUS_TRANSITIONS[current.status].includes(raw.status))
        return invalid("当前执行项状态不允许执行该操作", 409);
      const isAssignee = current.assigneeUserId === actor.id;
      const session = await repository.findSessionById(current.sessionId);
      if (!session) return invalid("课程安排不存在", 404);
      const isReviewer = session.taskReviewerUserId === actor.id;
      if (!isAssignee && !isReviewer && !canManageAllTasks)
        return invalid("执行项不存在", 404);
      const assigneeAction = isAssignee && ["IN_PROGRESS", "SUBMITTED"].includes(raw.status);
      const managerReviewAction = isReviewer
        && current.status === "SUBMITTED"
        && ["DONE", "REJECTED"].includes(raw.status);
      if (!assigneeAction && !managerReviewAction)
        return invalid(isAssignee ? "任务负责人只能开始、重新处理并提交本人任务" : "只有本次课程指定验收人可以验收已提交任务", 403);
      const activeCategory = session.status === "PLANNED" || session.status === "READY"
        ? "BEFORE"
        : session.status === "IN_PROGRESS"
          ? "DURING"
          : session.status === "POST_COURSE"
            ? "AFTER"
            : null;
      if (current.category !== activeCategory)
        return invalid(`当前课程阶段不能处理${current.category === "BEFORE" ? "课前" : current.category === "DURING" ? "课中" : "课后"}任务`, 409);
      const completionMode = current.completionMode || (TASKS_REQUIRING_EVIDENCE.has(current.templateKey) ? "ATTACHMENT" : "NOTE");
      if (raw.status === "SUBMITTED" && ["NOTE", "ATTACHMENT", "CHECKLIST"].includes(completionMode) && !String(raw.submissionNote || raw.note || "").trim())
        return invalid(completionMode === "CHECKLIST" ? "请确认检查结果并填写说明" : "请填写完成说明");
      if (
        raw.status === "SUBMITTED"
        && completionMode === "ATTACHMENT"
        && !(await repository.listTaskAttachments(id)).length
      ) return invalid("该步骤配置为必须上传附件，请上传后再提交", 409);
      if (raw.status === "REJECTED" && !String(raw.reviewNote || raw.note || "").trim())
        return invalid("驳回验收时必须填写原因");
      const timestamp = now();
      const nextStatus = raw.status === "SUBMITTED" && !current.requiresReview ? "DONE" : raw.status;
      const allowedSessionStatuses: AcademySessionStatus[] = current.category === "BEFORE"
        ? ["PLANNED", "READY"]
        : current.category === "DURING"
          ? ["IN_PROGRESS"]
          : ["POST_COURSE"];
      const updated = await repository.updateTaskStatus(id, current.status, {
        status: nextStatus,
        note: raw.note?.trim() || null,
        submissionNote:
          raw.status === "SUBMITTED"
            ? String(raw.submissionNote || raw.note || "").trim()
            : current.submissionNote,
        submittedAt: raw.status === "SUBMITTED" ? timestamp : current.submittedAt,
        submittedById: raw.status === "SUBMITTED" ? actor.id : current.submittedById,
        submittedByName: raw.status === "SUBMITTED" ? actor.name : current.submittedByName,
        reviewNote:
          raw.status === "DONE" || raw.status === "REJECTED"
            ? String(raw.reviewNote || raw.note || "").trim() || null
            : current.reviewNote,
        reviewedAt:
          nextStatus === "DONE" || raw.status === "REJECTED"
            ? timestamp
            : current.reviewedAt,
        reviewedById:
          nextStatus === "DONE" || raw.status === "REJECTED"
            ? actor.id
            : current.reviewedById,
        reviewedByName:
          nextStatus === "DONE" || raw.status === "REJECTED"
            ? actor.name
            : current.reviewedByName,
        completedAt: nextStatus === "DONE" ? timestamp : null,
        completedById: nextStatus === "DONE" ? actor.id : null,
        completedByName: nextStatus === "DONE" ? actor.name : null,
        updatedAt: timestamp,
      }, allowedSessionStatuses);
      return updated ? success(updated) : invalid("执行项不存在", 404);
    },
    async listTaskAttachments(id: string, actor: AuthenticatedUser) {
      const current = await repository.findTaskById(id);
      if (!current) return invalid("执行项不存在", 404);
      const canManage = hasPermission(actor, PERMISSION_KEYS.ACADEMY_SESSION_MANAGE, "read");
      const scopedTask = canManage ? await repository.findTaskById(id, await resolveScope(actor)) : null;
      const session = await repository.findSessionById(current.sessionId);
      const canRead = current.assigneeUserId === actor.id
        || session?.taskReviewerUserId === actor.id
        || Boolean(scopedTask);
      if (!canRead) return invalid("执行项不存在", 404);
      return success(await repository.listTaskAttachments(id));
    },
    async replaceTaskAttachments(id: string, raw: Record<string, unknown>, actor: AuthenticatedUser) {
      const current = await repository.findTaskById(id);
      if (!current || current.assigneeUserId !== actor.id) return invalid("执行项不存在", 404);
      if (!["PENDING", "IN_PROGRESS", "REJECTED", "BLOCKED"].includes(current.status)) {
        return invalid("当前任务状态不允许修改交付附件", 409);
      }
      const attachmentIds = Array.isArray(raw.attachmentIds)
        ? [...new Set(raw.attachmentIds.map(String).map((item) => item.trim()).filter(Boolean))]
        : [];
      if (attachmentIds.length > 10) return invalid("每个任务最多关联10个交付附件");
      if (!deps.findBusinessAttachment) return invalid("附件服务暂不可用", 503);
      const previous = await repository.listTaskAttachments(id);
      const previousById = new Map(previous.map((item) => [item.id, item]));
      const verified: BusinessAttachment[] = [];
      for (const attachmentId of attachmentIds) {
        const existing = previousById.get(attachmentId);
        if (existing && existing.uploadedById !== actor.id) {
          verified.push(existing);
          continue;
        }
        const attachment = await deps.findBusinessAttachment(attachmentId);
        if (
          !attachment
          || attachment.category !== "academy-task-evidence"
          || attachment.draftKey !== `academy-task:${id}`
          || attachment.uploadedById !== actor.id
        ) return invalid("附件不存在或不属于当前任务", 404);
        const { draftKey: _draftKey, ...publicAttachment } = attachment;
        verified.push(publicAttachment);
      }
      const removed = previous.filter((item) => !attachmentIds.includes(item.id));
      if (removed.some((item) => item.uploadedById !== actor.id)) {
        return invalid("不得删除原负责人已提交的附件", 403);
      }
      if (removed.length && !deps.purgeBusinessAttachment) return invalid("附件服务暂不可用", 503);
      await repository.replaceTaskAttachments(id, verified.map((item) => item.id), actor);
      for (const attachment of removed) await deps.purgeBusinessAttachment?.(attachment.id);
      return success(verified);
    },
    async saveEngagement(
      raw: Record<string, unknown>,
      actor: AuthenticatedUser,
    ) {
      const sessionId = String(raw.sessionId || "").trim();
      if (!sessionId)
        return invalid("场次和参与客户不能为空");
      const session = await repository.findSessionById(sessionId, { unrestricted: true, visibleUserIds: [] });
      if (!session) return invalid("课程安排不存在", 404);
      const customerId = String(raw.customerId || "").trim();
      const leadId = String(raw.leadId || "").trim();
      if ((customerId && leadId) || (!customerId && !leadId))
        return invalid("请选择一个可见的客户或线索");
      const participant = customerId
        ? await deps.resolveCustomer?.(customerId, actor)
        : await deps.resolveLead?.(leadId, actor);
      if (!participant) return invalid(customerId ? "客户不存在或无权访问" : "线索不存在或无权访问", 404);
      if (participant.isPublicPool) return invalid("公海客户需先领取后才能邀约", 409);
      const participantKey = customerId ? `customer:${customerId}` : `lead:${leadId}`;
      const nextFollowUpAt = raw.nextFollowUpAt
        ? new Date(String(raw.nextFollowUpAt))
        : null;
      if (nextFollowUpAt && Number.isNaN(nextFollowUpAt.getTime()))
        return invalid("下次跟进时间格式无效");
      const invitationStatus = String(raw.invitationStatus || "PENDING").trim();
      const followUpStatus = String(raw.followUpStatus || "PENDING").trim();
      if (!INVITATION_STATUSES.has(invitationStatus)) return invalid("请选择有效的邀约状态");
      if (!FOLLOW_UP_STATUSES.has(followUpStatus)) return invalid("请选择有效的跟进状态");
      const timestamp = now();
      const existing = await repository.findEngagementByKey(sessionId, participantKey);
      if (existing) return invalid("客户已在本课程名单，请通过跟进功能更新状态", 409);
      if (!existing && (!["PLANNED", "READY"].includes(session.status) || session.audience !== "ALL_EMPLOYEES" || !session.isInvitable))
        return invalid("当前课程安排不接受新增邀约", 409);
      return success(
        await repository.upsertEngagement({
          id: `academy-engagement-${randomUUID()}`,
          sessionId,
          participantKey,
          customerId: customerId || null,
          leadId: leadId || null,
          participantName: participant.name,
          invitationStatus,
          attendanceStatus: "UNKNOWN",
          interactionLevel: null,
          courseAssessment: null,
          followUpStatus,
          nextFollowUpAt,
          orderId: null,
          orderNo: null,
          handoffStatus: "PENDING",
          handedOffAt: null,
          handedOffById: null,
          handedOffByName: null,
          notes: raw.notes ? String(raw.notes) : null,
          ownerUserId: participant.ownerUserId || actor.id,
          ownerUserName: participant.ownerUserName || actor.name,
          createdAt: timestamp,
          updatedAt: timestamp,
        }),
      );
    },
    async saveEngagementBatch(raw: Record<string, unknown>, actor: AuthenticatedUser) {
      const sessionId = String(raw.sessionId || "").trim();
      const customerIds = Array.isArray(raw.customerIds)
        ? [...new Set(raw.customerIds.map(String).map((item) => item.trim()).filter(Boolean))]
        : [];
      if (!sessionId || !customerIds.length) return invalid("请选择课程安排和客户");
      if (customerIds.length > 100) return invalid("单次最多邀约100位客户");
      const created: AcademyEngagementRecord[] = [];
      const rejected: Array<{ customerId: string; message: string }> = [];
      for (const customerId of customerIds) {
        const existing = await repository.findEngagementByKey(sessionId, `customer:${customerId}`);
        if (existing) {
          rejected.push({ customerId, message: "客户已在本课程名单" });
          continue;
        }
        const result = await this.saveEngagement({
          sessionId,
          customerId,
          invitationStatus: "PENDING",
        }, actor);
        if (result.code === 0 && result.data) created.push(result.data);
        else rejected.push({ customerId, message: result.message });
      }
      return success({ created, rejected });
    },
    async quickFollowUp(
      id: string,
      raw: Record<string, unknown>,
      actor: AuthenticatedUser,
    ) {
      const current = await repository.findEngagementById(id, await resolveScope(actor));
      if (!current || !current.customerId) return invalid("学员跟进记录不存在", 404);
      const content = String(raw.content || "").trim();
      if (!content) return invalid("请填写跟进内容");
      if (!deps.addCustomerFollowUp) return invalid("客户跟进服务暂不可用", 503);
      const customer = await deps.resolveCustomer?.(current.customerId, actor);
      if (!customer || customer.isPublicPool) return invalid("客户不存在或已不在你的数据范围内", 404);
      const nextFollowUpAt = raw.nextFollowUpAt ? new Date(String(raw.nextFollowUpAt)) : current.nextFollowUpAt || null;
      if (nextFollowUpAt && Number.isNaN(nextFollowUpAt.getTime())) return invalid("下次跟进时间格式无效");
      const courseAssessment = String(raw.courseAssessment || current.courseAssessment || "").trim() || null;
      if (courseAssessment && !new Set(["A", "B", "C"]).has(courseAssessment)) return invalid("请选择有效的客户分层");
      const invitationStatus = String(raw.invitationStatus || current.invitationStatus || "PENDING").trim();
      if (!INVITATION_STATUSES.has(invitationStatus)) return invalid("请选择有效的邀约状态");
      const crmResult = await deps.addCustomerFollowUp(current.customerId, {
        content: `商学院｜${content}`,
        type: "跟进记录",
      }, actor);
      if (crmResult.code !== 0) return failure<never>(crmResult.message, crmResult.code);
      return success(await repository.upsertEngagement({
        ...current,
        invitationStatus,
        courseAssessment,
        nextFollowUpAt,
        followUpStatus: "IN_PROGRESS",
        notes: content,
        updatedAt: now(),
      }));
    },
    async updateEngagementExecution(
      id: string,
      raw: Record<string, unknown>,
      actor: AuthenticatedUser,
    ) {
      const current = await repository.findEngagementById(id, await resolveScope(actor));
      if (!current) return invalid("学员执行记录不存在", 404);
      const attendanceStatus = String(raw.attendanceStatus || "UNKNOWN").trim();
      if (!new Set(["UNKNOWN", "CONFIRMED", "ATTENDED", "ABSENT"]).has(attendanceStatus))
        return invalid("请选择有效的到课状态");
      const interactionLevel = String(raw.interactionLevel || "").trim() || null;
      const courseAssessment = String(raw.courseAssessment || "").trim() || null;
      if (interactionLevel && !new Set(["HIGH", "MEDIUM", "LOW"]).has(interactionLevel))
        return invalid("请选择有效的课堂互动等级");
      if (courseAssessment && !new Set(["A", "B", "C"]).has(courseAssessment))
        return invalid("请选择有效的课程评估");
      return success(await repository.upsertEngagement({
        ...current,
        attendanceStatus,
        interactionLevel,
        courseAssessment,
        updatedAt: now(),
      }));
    },
    async linkEngagementOrder(
      id: string,
      raw: Record<string, unknown>,
      actor: AuthenticatedUser,
    ) {
      const current = await repository.findEngagementById(id, await resolveScope(actor));
      if (!current) return invalid("学员转化记录不存在", 404);
      const currentCustomer = current.customerId
        ? await deps.resolveCustomer?.(current.customerId, actor)
        : null;
      if (!currentCustomer) return invalid("关联客户不存在或已不在你的数据范围内", 404);
      if (currentCustomer.isPublicPool) return invalid("公海客户不能关联课程成交订单", 409);
      const orderId = String(raw.orderId || "").trim();
      if (!orderId) return invalid("请选择需要关联的正式订单");
      const order = await deps.resolveOrder?.(orderId, actor);
      if (!order) return invalid("所选正式订单不存在", 404);
      if (!current.customerId || order.customerId !== current.customerId)
        return invalid("所选订单不属于当前学员关联客户", 409);
      const timestamp = now();
      return success(
        await repository.upsertEngagement({
          ...current,
          orderId,
          orderNo: order.orderNo,
          followUpStatus: "DONE",
          handoffStatus: "ORDER_LINKED",
          handedOffAt: timestamp,
          handedOffById: actor.id,
          handedOffByName: actor.name,
          updatedAt: timestamp,
        }),
      );
    },
    async saveReview(raw: Record<string, unknown>, actor: AuthenticatedUser) {
      const sessionId = String(raw.sessionId || "").trim();
      if (!sessionId) return invalid("场次不能为空");
      const session = await repository.findSessionById(sessionId, await resolveScope(actor));
      if (!session) return invalid("课程安排不存在", 404);
      const timestamp = now();
      return success(
        await repository.saveReview({
          id: `academy-review-${randomUUID()}`,
          sessionId,
          summary: String(raw.summary || "").trim(),
          issues: String(raw.issues || "").trim(),
          improvements: String(raw.improvements || "").trim(),
          metrics:
            raw.metrics && typeof raw.metrics === "object"
              ? (raw.metrics as Record<string, number>)
              : {},
          actionItems: Array.isArray(raw.actionItems)
            ? (raw.actionItems as AcademyReviewRecord["actionItems"])
            : [],
          createdById: actor.id,
          createdByName: actor.name,
          createdAt: timestamp,
          updatedAt: timestamp,
        }),
      );
    },
  };
}

export type AcademyService = ReturnType<typeof createAcademyService>;
