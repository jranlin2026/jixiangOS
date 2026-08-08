import { randomUUID } from "node:crypto";
import type { AuthenticatedUser } from "../../../src/types/auth";
import { failure, success } from "../../api/response";

export type AcademyCourseStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type AcademySessionStatus =
  "PLANNED" | "READY" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type AcademyTaskStatus = "PENDING" | "DONE" | "BLOCKED" | "SKIPPED";

export type AcademyCourseRecord = {
  id: string;
  code: string;
  title: string;
  category: string;
  summary: string;
  defaultDurationMinutes: number;
  objectives: string[];
  status: AcademyCourseStatus;
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
  findCourseById(id: string): Promise<AcademyCourseRecord | null>;
  findLatestCourseVersionId(courseId: string): Promise<string | null>;
  createCourse(course: AcademyCourseRecord): Promise<AcademyCourseRecord>;
  createCourseVersion(version: Record<string, unknown>): Promise<unknown>;
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
  updateTaskStatus(
    id: string,
    update: Partial<AcademySessionTaskRecord>,
  ): Promise<AcademySessionTaskRecord | null>;
  upsertEngagement(
    engagement: AcademyEngagementRecord,
  ): Promise<AcademyEngagementRecord>;
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
  },
  {
    templateKey: "CONTENT",
    title: "大纲、核心观点、案例与转化环节锁版",
    category: "BEFORE",
    isRequired: true,
  },
  {
    templateKey: "ASSETS",
    title: "课件、海报、邀约话术与宣传素材确认",
    category: "BEFORE",
    isRequired: true,
  },
  {
    templateKey: "INVITATION",
    title: "邀约名单与到课确认",
    category: "BEFORE",
    isRequired: true,
  },
  {
    templateKey: "PRECHECK",
    title: "场地、直播、设备、网络与备用方案检查",
    category: "BEFORE",
    isRequired: true,
  },
  {
    templateKey: "DELIVERY",
    title: "授课与现场问题记录",
    category: "DURING",
    isRequired: true,
  },
  {
    templateKey: "SEGMENTATION",
    title: "课后30分钟内完成A/B/C客户分层",
    category: "AFTER",
    isRequired: true,
  },
  {
    templateKey: "FOLLOW_UP",
    title: "课后分层与销售跟进",
    category: "AFTER",
    isRequired: true,
  },
  {
    templateKey: "REVIEW",
    title: "课程数据复盘与改进",
    category: "AFTER",
    isRequired: true,
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

const invalid = (message: string, code = 400) => failure<never>(message, code);
const normalizedCode = (value: string) => value.trim().toUpperCase();

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
    async createCourse(raw: Record<string, unknown>, actor: AuthenticatedUser) {
      const code = normalizedCode(String(raw.code || ""));
      const title = String(raw.title || "").trim();
      const category = String(raw.category || "").trim();
      const duration = Number(raw.defaultDurationMinutes);
      if (!code || !title || !category)
        return invalid("课程编码、名称和分类不能为空");
      if (!Number.isInteger(duration) || duration <= 0 || duration > 1440)
        return invalid("课程时长必须是1到1440分钟的整数");
      if (await repository.findCourseByCode(code))
        return invalid("课程编码已存在", 409);
      const timestamp = now();
      const course: AcademyCourseRecord = {
        id: `academy-course-${randomUUID()}`,
        code,
        title,
        category,
        summary: String(raw.summary || "").trim(),
        defaultDurationMinutes: duration,
        objectives: Array.isArray(raw.objectives)
          ? raw.objectives
              .map(String)
              .map((item) => item.trim())
              .filter(Boolean)
          : [],
        status: "DRAFT",
        ownerUserId: actor.id,
        ownerUserName: actor.name,
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
      raw: { status: AcademyTaskStatus; note?: string },
      actor: AuthenticatedUser,
    ) {
      if (!["PENDING", "DONE", "BLOCKED", "SKIPPED"].includes(raw.status))
        return invalid("无效的执行项状态");
      const timestamp = now();
      const updated = await repository.updateTaskStatus(id, {
        status: raw.status,
        note: raw.note?.trim() || null,
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
      const timestamp = now();
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
          notes: raw.notes ? String(raw.notes) : null,
          ownerUserId: actor.id,
          ownerUserName: actor.name,
          createdAt: timestamp,
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
