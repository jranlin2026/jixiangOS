import { randomUUID } from "node:crypto";
import type { AuthenticatedUser } from "../../../src/types/auth";
import type { Customer } from "../../../src/types/customer";
import type { BusinessAttachment } from "../../../src/types/businessAttachment";
import { hasPermission, PERMISSION_KEYS } from "../../../src/shared/utils/permissions";
import { failure, success } from "../../api/response";

export type AcademyCourseStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type AcademySessionStatus =
  "PLANNED" | "READY" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
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
  audience: "ALL_EMPLOYEES" | "RESPONSIBLE_ONLY";
  isInvitable: boolean;
  facilitatorUserId?: string | null;
  facilitatorUserName?: string | null;
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
  acceptanceCriteria?: string | null;
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
  session: Pick<AcademySessionRecord, "id" | "title" | "startsAt" | "endsAt" | "status">;
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
  "id" | "title" | "startsAt" | "endsAt" | "deliveryMode" | "status" | "lecturerUserName"
> & { courseTitle: string; tasks: AcademySessionTaskRecord[] };

export interface AcademyRepository {
  listCourseCategories(): Promise<AcademyCourseCategoryRecord[]>;
  upsertCourseCategory(category: AcademyCourseCategoryRecord): Promise<AcademyCourseCategoryRecord>;
  listCourses(
    input: { page: number; pageSize: number; search?: string; status?: string },
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
  ): Promise<AcademySessionRecord | null>;
  listSessionTasks(sessionId: string): Promise<AcademySessionTaskRecord[]>;
  listMyTasks(
    userId: string,
    input: { page: number; pageSize: number; status?: string },
  ): Promise<{ items: AcademyMyTaskRecord[]; total: number }>;
  findTaskById(id: string, scope?: AcademyAccessScope): Promise<AcademySessionTaskRecord | null>;
  updateTaskStatus(
    id: string,
    update: Partial<AcademySessionTaskRecord>,
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

const CHECKLIST = [
  {
    templateKey: "COURSE_CONFIRMATION",
    title: "T-5 课程确定",
    category: "BEFORE",
    isRequired: true,
    dueOffsetMinutes: -5 * 24 * 60,
    assigneeRole: "PROJECT_OWNER",
    acceptanceCriteria: "课程主题、目标客户、课程目标、成交产品、主讲人和课程执行负责人已确认。",
  },
  {
    templateKey: "COURSE_DEVELOPMENT",
    title: "T-4 课程研发",
    category: "BEFORE",
    isRequired: true,
    dueOffsetMinutes: -4 * 24 * 60,
    assigneeRole: "CONTENT_OWNER",
    acceptanceCriteria: "大纲、PPT结构、案例、互动设计、核心观点说明和成交路径已完成。",
  },
  {
    templateKey: "COURSE_PACKAGING",
    title: "T-3 课程包装",
    category: "BEFORE",
    isRequired: true,
    dueOffsetMinutes: -3 * 24 * 60,
    assigneeRole: "MATERIAL_OWNER",
    acceptanceCriteria: "海报、朋友圈素材、销售邀约图、预热内容、直播画面与封面已准备。",
  },
  {
    templateKey: "CUSTOMER_INVITATION",
    title: "T-2 客户邀约",
    category: "BEFORE",
    isRequired: true,
    dueOffsetMinutes: -2 * 24 * 60,
    assigneeRole: "PROJECT_OWNER",
    acceptanceCriteria: "邀约名单中每位客户都有邀约状态和下一步。",
  },
  {
    templateKey: "PRECLASS_GATE",
    title: "T-1 开课关卡",
    category: "BEFORE",
    isRequired: true,
    dueOffsetMinutes: -24 * 60,
    assigneeRole: "PROJECT_OWNER",
    acceptanceCriteria: "最终PPT、讲稿、直播链接、画面、设备、网络、素材、客户名单和重点客户已确认，并给出Go/No-Go结论。",
  },
  {
    templateKey: "COURSE_DELIVERY",
    title: "T日 课程执行",
    category: "DURING",
    isRequired: true,
    dueOffsetMinutes: 0,
    assigneeRole: "LECTURER",
    acceptanceCriteria: "完成授课，保障直播，并记录客户行为、问题和关键反馈。",
  },
  {
    templateKey: "CUSTOMER_SEGMENTATION",
    title: "T+0.5小时 客户分层",
    category: "AFTER",
    isRequired: true,
    dueOffsetMinutes: 30,
    assigneeRole: "PROJECT_OWNER",
    acceptanceCriteria: "30分钟内完成A/B/C分类，并为每位重点客户设定下一步和时间。",
  },
  {
    templateKey: "DEAL_FOLLOW_UP",
    title: "T+1 成交跟进",
    category: "AFTER",
    isRequired: true,
    dueOffsetMinutes: 24 * 60,
    assigneeRole: "PROJECT_OWNER",
    acceptanceCriteria: "客户已成交或已明确下一步跟进；成交客户已发起交接。",
  },
  {
    templateKey: "COURSE_REVIEW",
    title: "T+3 复盘优化",
    category: "AFTER",
    isRequired: true,
    dueOffsetMinutes: 3 * 24 * 60,
    assigneeRole: "REVIEW_OWNER",
    acceptanceCriteria: "报名、到课、互动、咨询、成交和客户反馈已复盘，改进项已指定负责人和完成时间。",
  },
] as const;

const STATUS_TRANSITIONS: Record<AcademySessionStatus, AcademySessionStatus[]> =
  {
    PLANNED: ["READY", "CANCELLED"],
    READY: ["IN_PROGRESS", "CANCELLED"],
    IN_PROGRESS: ["COMPLETED"],
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
  PENDING: ["IN_PROGRESS", "BLOCKED", "SKIPPED"],
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
      const stepOrder = [
        "COURSE_CONFIRMATION", "COURSE_DEVELOPMENT", "COURSE_PACKAGING",
        "CUSTOMER_INVITATION", "PRECLASS_GATE", "COURSE_DELIVERY",
        "CUSTOMER_SEGMENTATION", "DEAL_FOLLOW_UP", "COURSE_REVIEW",
      ];
      const stepLabel: Record<string, { timeLabel: string; title: string }> = {
        COURSE_CONFIRMATION: { timeLabel: "T-5", title: "课程确定" },
        COURSE_DEVELOPMENT: { timeLabel: "T-4", title: "课程研发" },
        COURSE_PACKAGING: { timeLabel: "T-3", title: "课程包装" },
        CUSTOMER_INVITATION: { timeLabel: "T-2", title: "客户邀约" },
        PRECLASS_GATE: { timeLabel: "T-1", title: "开课关卡" },
        COURSE_DELIVERY: { timeLabel: "T日", title: "课程执行" },
        CUSTOMER_SEGMENTATION: { timeLabel: "T+0.5小时", title: "客户分层" },
        DEAL_FOLLOW_UP: { timeLabel: "T+1", title: "成交跟进" },
        COURSE_REVIEW: { timeLabel: "T+3", title: "复盘优化" },
      };
      const legacyKey: Record<string, string> = { PLANNING: "COURSE_CONFIRMATION", CONTENT: "COURSE_DEVELOPMENT", ASSETS: "COURSE_PACKAGING", INVITATION: "CUSTOMER_INVITATION", PRECHECK: "PRECLASS_GATE", DELIVERY: "COURSE_DELIVERY", SEGMENTATION: "CUSTOMER_SEGMENTATION", FOLLOW_UP: "DEAL_FOLLOW_UP", REVIEW: "COURSE_REVIEW" };
      const rows = await repository.listPublicCalendar({ start, end });
      return success(rows.map((session) => {
        const sorted = [...session.tasks].sort((left, right) => {
          const leftKey = legacyKey[left.templateKey] || left.templateKey;
          const rightKey = legacyKey[right.templateKey] || right.templateKey;
          return stepOrder.indexOf(leftKey) - stepOrder.indexOf(rightKey);
        });
        const done = sorted.filter((task) => ["DONE", "SKIPPED"].includes(task.status)).length;
        const publicTasks = sorted.map((task) => ({
          ...(task.assigneeUserId === actor.id ? { taskId: task.id } : {}),
          ...(task.assigneeUserId === actor.id ? { templateKey: task.templateKey, acceptanceCriteria: task.acceptanceCriteria || undefined } : {}),
          timeLabel: stepLabel[legacyKey[task.templateKey] || task.templateKey]?.timeLabel || "其他",
          title: stepLabel[legacyKey[task.templateKey] || task.templateKey]?.title || task.title,
          assigneeUserName: task.assigneeUserName || undefined,
          dueAt: task.dueAt?.toISOString(),
          status: task.status,
          isMine: task.assigneeUserId === actor.id,
        }));
        const currentStep = publicTasks.find((task) => !["DONE", "SKIPPED"].includes(task.status));
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
      return success({ ...result, items: await attachTaskEvidence(result.items), page, pageSize });
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
      if (!owner) return invalid("课程负责人不存在或已停用");
      const lecturerUserId = String(raw.lecturerUserId || "").trim();
      const lecturer = lecturerUserId
        ? await repository.findActiveUserById(lecturerUserId)
        : null;
      if (lecturerUserId && !lecturer) return invalid("主讲人不存在或已停用");
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
        lecturerUserId: lecturer?.id || null,
        lecturerUserName: lecturer?.name || null,
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
      if (!owner) return invalid("课程负责人不存在或已停用");
      const lecturerUserId = String(raw.lecturerUserId || "").trim();
      const lecturer = lecturerUserId ? await repository.findActiveUserById(lecturerUserId) : null;
      if (lecturerUserId && !lecturer) return invalid("主讲人不存在或已停用");
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
        objectives: Array.isArray(raw.objectives) ? raw.objectives.map(String).map((item) => item.trim()).filter(Boolean) : [],
        ownerUserId: owner.id,
        ownerUserName: owner.name,
        lecturerUserId: lecturer?.id || null,
        lecturerUserName: lecturer?.name || null,
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
      const projectOwnerUserId = String(raw.projectOwnerUserId || raw.facilitatorUserId || "").trim();
      const projectOwner = projectOwnerUserId
        ? await repository.findActiveUserById(projectOwnerUserId)
        : null;
      if (!projectOwner) return invalid("请选择有效的项目负责人");
      const contentOwnerUserId = String(raw.contentOwnerUserId || projectOwnerUserId).trim();
      const materialOwnerUserId = String(raw.materialOwnerUserId || projectOwnerUserId).trim();
      const reviewOwnerUserId = String(raw.reviewOwnerUserId || projectOwnerUserId).trim();
      const [contentOwner, materialOwner, reviewOwner] = await Promise.all([
        repository.findActiveUserById(contentOwnerUserId),
        repository.findActiveUserById(materialOwnerUserId),
        repository.findActiveUserById(reviewOwnerUserId),
      ]);
      if (!contentOwner) return invalid("请选择有效的课程内容负责人");
      if (!materialOwner) return invalid("请选择有效的素材负责人");
      if (!reviewOwner) return invalid("请选择有效的复盘负责人");
      const lecturerUserId = String(raw.lecturerUserId || course.lecturerUserId || "").trim();
      const lecturer = lecturerUserId
        ? await repository.findActiveUserById(lecturerUserId)
        : null;
      if (lecturerUserId && !lecturer) return invalid("所选主讲人不存在或已停用");
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
        audience,
        isInvitable: audience === "ALL_EMPLOYEES" && raw.isInvitable !== false,
        facilitatorUserId: projectOwner.id,
        facilitatorUserName: projectOwner.name,
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
        CONTENT_OWNER: contentOwner,
        MATERIAL_OWNER: materialOwner,
        LECTURER: lecturer || projectOwner,
        REVIEW_OWNER: reviewOwner,
      };
      const checklist: AcademySessionTaskRecord[] = CHECKLIST.map((item) => {
        const { dueOffsetMinutes, assigneeRole, ...taskTemplate } = item;
        const assignee = assigneeForRole[assigneeRole];
        return {
          ...taskTemplate,
          id: `academy-task-${randomUUID()}`,
          sessionId: session.id,
          status: "PENDING",
          assigneeUserId: assignee.id,
          assigneeUserName: assignee.name,
          collaboratorNames: [],
          dueAt: new Date(
            (item.category === "BEFORE" ? startsAt : endsAt).getTime() +
              dueOffsetMinutes * 60_000,
          ),
          createdAt: timestamp,
          updatedAt: timestamp,
        };
      });
      return success(await repository.createSession(session, checklist));
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
      if (nextStatus === "READY") {
        const tasks = await repository.listSessionTasks(id);
        const pending = tasks.filter(
          (task) =>
            task.category === "BEFORE" &&
            task.isRequired &&
            task.status !== "DONE",
        );
        if (pending.length)
          return invalid(`还有${pending.length}项必做准备未完成`, 409);
      }
      const updated = await repository.updateSessionStatus(
        id,
        session.status,
        nextStatus,
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
      if (!isAssignee && !canManageAllTasks)
        return invalid("执行项不存在", 404);
      const assigneeAction = isAssignee && ["IN_PROGRESS", "SUBMITTED"].includes(raw.status);
      const managerReviewAction = canManageAllTasks
        && current.status === "SUBMITTED"
        && ["DONE", "REJECTED"].includes(raw.status);
      if (!assigneeAction && !managerReviewAction)
        return invalid(isAssignee ? "任务负责人只能开始、重新处理并提交本人任务" : "课程运营管理员只能验收已提交的任务", 403);
      if (raw.status === "SUBMITTED" && !String(raw.submissionNote || raw.note || "").trim())
        return invalid("提交验收时必须填写完成说明");
      if (
        raw.status === "SUBMITTED"
        && TASKS_REQUIRING_EVIDENCE.has(current.templateKey)
        && !(await repository.listTaskAttachments(id)).length
      ) return invalid("该任务至少需要上传一个交付附件", 409);
      if (raw.status === "REJECTED" && !String(raw.reviewNote || raw.note || "").trim())
        return invalid("驳回验收时必须填写原因");
      const timestamp = now();
      const updated = await repository.updateTaskStatus(id, {
        status: raw.status,
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
          raw.status === "DONE" || raw.status === "REJECTED"
            ? timestamp
            : current.reviewedAt,
        reviewedById:
          raw.status === "DONE" || raw.status === "REJECTED"
            ? actor.id
            : current.reviewedById,
        reviewedByName:
          raw.status === "DONE" || raw.status === "REJECTED"
            ? actor.name
            : current.reviewedByName,
        completedAt: raw.status === "DONE" ? timestamp : null,
        completedById: raw.status === "DONE" ? actor.id : null,
        completedByName: raw.status === "DONE" ? actor.name : null,
        updatedAt: timestamp,
      });
      return updated ? success(updated) : invalid("执行项不存在", 404);
    },
    async listTaskAttachments(id: string, actor: AuthenticatedUser) {
      const current = await repository.findTaskById(id);
      if (!current) return invalid("执行项不存在", 404);
      const canManage = hasPermission(actor, PERMISSION_KEYS.ACADEMY_SESSION_MANAGE, "read");
      const scopedTask = canManage ? await repository.findTaskById(id, await resolveScope(actor)) : null;
      const canRead = current.assigneeUserId === actor.id || Boolean(scopedTask);
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
