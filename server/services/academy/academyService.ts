import { randomUUID } from "node:crypto";
import type { AuthenticatedUser } from "../../../src/types/auth";
import type { BusinessAttachment } from "../../../src/types/businessAttachment";
import { failure, success } from "../../api/response";

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
  venue: string;
  capacity: number;
  status: AcademySessionStatus;
  facilitatorUserId?: string | null;
  facilitatorUserName?: string | null;
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
  createdAt: Date;
  updatedAt: Date;
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

export interface AcademyRepository {
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
  listCourseAssets(courseId: string): Promise<AcademyCourseAssetRecord[]>;
  upsertCourseAsset(asset: AcademyCourseAssetRecord): Promise<AcademyCourseAssetRecord>;
  updateCourseStatus(
    id: string,
    expectedStatus: AcademyCourseStatus,
    status: AcademyCourseStatus,
  ): Promise<AcademyCourseRecord | null>;
  listSessions(
    input: { page: number; pageSize: number; search?: string; status?: string },
    scope: AcademyAccessScope,
  ): Promise<{ items: AcademySessionRecord[]; total: number }>;
  findSessionById(id: string): Promise<AcademySessionRecord | null>;
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
  findTaskById(id: string): Promise<AcademySessionTaskRecord | null>;
  updateTaskStatus(
    id: string,
    update: Partial<AcademySessionTaskRecord>,
  ): Promise<AcademySessionTaskRecord | null>;
  upsertEngagement(
    engagement: AcademyEngagementRecord,
  ): Promise<AcademyEngagementRecord>;
  findEngagementById(id: string): Promise<AcademyEngagementRecord | null>;
  findEngagementByKey(
    sessionId: string,
    participantKey: string,
  ): Promise<AcademyEngagementRecord | null>;
  findOrderById(id: string): Promise<{ id: string; orderNo: string; customerId: string } | null>;
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
    templateKey: "PLANNING",
    title: "课程目标、客户问题与经营指标确认",
    category: "BEFORE",
    isRequired: true,
    dueOffsetMinutes: -7 * 24 * 60,
    acceptanceCriteria: "课程目标、目标客户问题和本场经营指标均已确认。",
  },
  {
    templateKey: "CONTENT",
    title: "大纲、核心观点、案例与转化环节锁版",
    category: "BEFORE",
    isRequired: true,
    dueOffsetMinutes: -5 * 24 * 60,
    acceptanceCriteria: "大纲、核心观点、案例和转化环节已锁定版本。",
  },
  {
    templateKey: "ASSETS",
    title: "课件、海报、邀约话术与宣传素材确认",
    category: "BEFORE",
    isRequired: true,
    dueOffsetMinutes: -3 * 24 * 60,
    acceptanceCriteria: "课件、海报、邀约话术及宣传素材齐全且可使用。",
  },
  {
    templateKey: "INVITATION",
    title: "邀约名单与到课确认",
    category: "BEFORE",
    isRequired: true,
    dueOffsetMinutes: -24 * 60,
    acceptanceCriteria: "邀约名单已建立，并完成到课确认和负责人分配。",
  },
  {
    templateKey: "PRECHECK",
    title: "场地、直播、设备、网络与备用方案检查",
    category: "BEFORE",
    isRequired: true,
    dueOffsetMinutes: -2 * 60,
    acceptanceCriteria: "场地、直播、设备、网络和备用方案检查通过。",
  },
  {
    templateKey: "DELIVERY",
    title: "授课与现场问题记录",
    category: "DURING",
    isRequired: true,
    dueOffsetMinutes: 0,
    acceptanceCriteria: "完成授课并记录现场问题、互动和关键客户反馈。",
  },
  {
    templateKey: "SEGMENTATION",
    title: "课后30分钟内完成A/B/C客户分层",
    category: "AFTER",
    isRequired: true,
    dueOffsetMinutes: 30,
    acceptanceCriteria: "课后30分钟内完成全部到课客户A/B/C分层。",
  },
  {
    templateKey: "FOLLOW_UP",
    title: "课后分层与销售跟进",
    category: "AFTER",
    isRequired: true,
    dueOffsetMinutes: 24 * 60,
    acceptanceCriteria: "重点客户已分配销售并形成下一步跟进计划。",
  },
  {
    templateKey: "REVIEW",
    title: "课程数据复盘与改进",
    category: "AFTER",
    isRequired: true,
    dueOffsetMinutes: 2 * 24 * 60,
    acceptanceCriteria: "完成课程数据、问题、改进项和责任人复盘。",
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

const invalid = (message: string, code = 400) => failure<never>(message, code);
const buildCourseCode = (at: Date) => {
  const yearMonth = `${at.getUTCFullYear()}${String(at.getUTCMonth() + 1).padStart(2, "0")}`;
  return `AC-${yearMonth}-${randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`;
};

export function createAcademyService(
  repository: AcademyRepository,
  deps: {
    now?: () => Date;
    resolveScope?: (actor: AuthenticatedUser) => Promise<AcademyAccessScope>;
  } = {},
) {
  const now = deps.now || (() => new Date());
  const resolveScope =
    deps.resolveScope ||
    (async (actor: AuthenticatedUser) => ({
      unrestricted: false,
      visibleUserIds: [actor.id],
    }));
  return {
    async getDashboard(actor: AuthenticatedUser) {
      return success(await repository.getDashboard(await resolveScope(actor)));
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
      const attachments = Array.isArray(raw.attachments)
        ? raw.attachments.filter(
            (item): item is BusinessAttachment =>
              Boolean(item) &&
              typeof item === "object" &&
              String((item as BusinessAttachment).id || "").trim() !== "" &&
              (item as BusinessAttachment).category === "academy-course-asset",
          )
        : [];
      if (!attachments.length) return invalid("请至少上传一个课程资产文件");
      const courseVersionId = await repository.findLatestCourseVersionId(courseId);
      if (!courseVersionId) return invalid("课程尚无可用版本", 409);
      const timestamp = now();
      const existing = (await repository.listCourseAssets(courseId)).find(
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
    async changeCourseStatus(
      id: string,
      nextStatus: AcademyCourseStatus,
      _actor: AuthenticatedUser,
    ) {
      const course = await repository.findCourseById(id);
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
      return success({
        ...(await repository.listSessions(
          { page, pageSize, search: raw.search?.trim(), status: raw.status },
          await resolveScope(actor),
        )),
        page,
        pageSize,
      });
    },
    async getSessionDetail(id: string, actor: AuthenticatedUser) {
      const detail = await repository.getSessionDetail(
        id,
        await resolveScope(actor),
      );
      return detail ? success(detail) : invalid("课程场次不存在", 404);
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
      if (
        !courseId ||
        !title ||
        Number.isNaN(startsAt.getTime()) ||
        Number.isNaN(endsAt.getTime())
      )
        return invalid("课程、场次名称和时间不能为空");
      if (endsAt <= startsAt) return invalid("结束时间必须晚于开始时间");
      if (!Number.isInteger(capacity) || capacity <= 0)
        return invalid("场次容量必须是正整数");
      const course = await repository.findCourseById(courseId);
      if (!course) return invalid("所选课程不存在", 404);
      if (course.status !== "ACTIVE")
        return invalid("只有已启用课程可以创建场次", 409);
      const courseVersionId =
        await repository.findLatestCourseVersionId(courseId);
      if (!courseVersionId)
        return invalid("课程尚无可用版本，不能创建场次", 409);
      const timestamp = now();
      const session: AcademySessionRecord = {
        id: `academy-session-${randomUUID()}`,
        courseId,
        courseVersionId,
        title,
        startsAt,
        endsAt,
        venue: String(raw.venue || "").trim(),
        capacity,
        status: "PLANNED",
        facilitatorUserId: raw.facilitatorUserId
          ? String(raw.facilitatorUserId)
          : null,
        facilitatorUserName: raw.facilitatorUserName
          ? String(raw.facilitatorUserName)
          : null,
        createdById: actor.id,
        createdByName: actor.name,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const checklist: AcademySessionTaskRecord[] = CHECKLIST.map((item) => ({
        ...item,
        id: `academy-task-${randomUUID()}`,
        sessionId: session.id,
        status: "PENDING",
        assigneeUserId: session.facilitatorUserId || actor.id,
        assigneeUserName: session.facilitatorUserName || actor.name,
        collaboratorNames: [],
        dueAt: new Date(
          (item.category === "BEFORE" ? startsAt : endsAt).getTime() +
            item.dueOffsetMinutes * 60_000,
        ),
        createdAt: timestamp,
        updatedAt: timestamp,
      }));
      return success(await repository.createSession(session, checklist));
    },
    async changeSessionStatus(
      id: string,
      nextStatus: AcademySessionStatus,
      _actor: AuthenticatedUser,
    ) {
      const session = await repository.findSessionById(id);
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
      const current = await repository.findTaskById(id);
      if (!current) return invalid("执行项不存在", 404);
      if (!TASK_STATUS_TRANSITIONS[current.status].includes(raw.status))
        return invalid("当前执行项状态不允许执行该操作", 409);
      if (raw.status === "SUBMITTED" && !String(raw.submissionNote || raw.note || "").trim())
        return invalid("提交验收时必须填写完成说明");
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
    async saveEngagement(
      raw: Record<string, unknown>,
      actor: AuthenticatedUser,
    ) {
      const sessionId = String(raw.sessionId || "").trim();
      const participantKey = String(raw.participantKey || "").trim();
      const participantName = String(raw.participantName || "").trim();
      if (!sessionId || !participantKey || !participantName)
        return invalid("场次和参与客户不能为空");
      const nextFollowUpAt = raw.nextFollowUpAt
        ? new Date(String(raw.nextFollowUpAt))
        : null;
      if (nextFollowUpAt && Number.isNaN(nextFollowUpAt.getTime()))
        return invalid("下次跟进时间格式无效");
      const timestamp = now();
      const existing = await repository.findEngagementByKey(sessionId, participantKey);
      return success(
        await repository.upsertEngagement({
          id: `academy-engagement-${randomUUID()}`,
          sessionId,
          participantKey,
          customerId: raw.customerId ? String(raw.customerId) : null,
          leadId: raw.leadId ? String(raw.leadId) : null,
          participantName,
          invitationStatus: String(raw.invitationStatus || "PENDING"),
          attendanceStatus: String(raw.attendanceStatus || "UNKNOWN"),
          interactionLevel: raw.interactionLevel
            ? String(raw.interactionLevel)
            : null,
          courseAssessment: raw.courseAssessment
            ? String(raw.courseAssessment)
            : null,
          followUpStatus: String(raw.followUpStatus || "PENDING"),
          nextFollowUpAt,
          orderId: existing?.orderId || null,
          orderNo: existing?.orderNo || null,
          handoffStatus: existing?.handoffStatus || "PENDING",
          handedOffAt: existing?.handedOffAt || null,
          handedOffById: existing?.handedOffById || null,
          handedOffByName: existing?.handedOffByName || null,
          notes: raw.notes ? String(raw.notes) : null,
          ownerUserId: actor.id,
          ownerUserName: actor.name,
          createdAt: existing?.createdAt || timestamp,
          updatedAt: timestamp,
        }),
      );
    },
    async linkEngagementOrder(
      id: string,
      raw: Record<string, unknown>,
      actor: AuthenticatedUser,
    ) {
      const current = await repository.findEngagementById(id);
      if (!current) return invalid("学员转化记录不存在", 404);
      const orderId = String(raw.orderId || "").trim();
      if (!orderId) return invalid("请选择需要关联的正式订单");
      const order = await repository.findOrderById(orderId);
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
