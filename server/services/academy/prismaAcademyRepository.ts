import type {
  AcademyCourseRecord,
  AcademyCourseAssetRecord,
  AcademyAccessScope,
  AcademyEngagementRecord,
  AcademyRepository,
  AcademyReviewRecord,
  AcademySessionRecord,
  AcademySessionStatus,
  AcademySessionTaskRecord,
} from "./academyService";
import { STORAGE_KEYS } from "../../../src/shared/utils/constants";

const ACADEMY_COURSE_ASSET_DOMAIN = "academy_course_assets";
const ACADEMY_COURSE_CATEGORY_DOMAIN = "academy_course_categories";
const ACADEMY_ALL_EMPLOYEES_MARKER = "__academy_all_employees__";
const ACADEMY_INVITABLE_MARKER = "__academy_invitable__";

const mapCourse = (record: any): AcademyCourseRecord => ({
  ...record,
  objectives: Array.isArray(record.objectives) ? record.objectives : [],
  defaultDurationMinutes: Number(record.defaultDurationMinutes),
});

const mapSession = (record: any): AcademySessionRecord => {
  const storedCollaboratorIds = Array.isArray(record.collaboratorUserIds) ? record.collaboratorUserIds : [];
  return ({
  ...record,
  capacity: Number(record.capacity),
  inviteTarget: Number(record.inviteTarget || 0),
  registrationTarget: Number(record.registrationTarget || 0),
  attendanceTarget: Number(record.attendanceTarget || 0),
  consultationTarget: Number(record.consultationTarget || 0),
  dealTarget: Number(record.dealTarget || 0),
  targetRevenue: Number(record.targetRevenue || 0),
  collaboratorUserIds: storedCollaboratorIds.filter((id: string) => !id.startsWith("__academy_")),
  collaboratorNames: Array.isArray(record.collaboratorNames) ? record.collaboratorNames : [],
  audience: storedCollaboratorIds.includes(ACADEMY_ALL_EMPLOYEES_MARKER) ? "ALL_EMPLOYEES" : "RESPONSIBLE_ONLY",
  isInvitable: storedCollaboratorIds.includes(ACADEMY_INVITABLE_MARKER),
});
};

const courseScopeWhere = (scope: AcademyAccessScope) =>
  scope.unrestricted
    ? {}
    : {
        OR: [
          { ownerUserId: { in: scope.visibleUserIds } },
          { lecturerUserId: { in: scope.visibleUserIds } },
        ],
      };

const sessionScopeWhere = (scope: AcademyAccessScope) =>
  scope.unrestricted
    ? {}
    : {
        OR: [
          { createdById: { in: scope.visibleUserIds } },
          { facilitatorUserId: { in: scope.visibleUserIds } },
          { lecturerUserId: { in: scope.visibleUserIds } },
          { course: { ownerUserId: { in: scope.visibleUserIds } } },
          { tasks: { some: { assigneeUserId: { in: scope.visibleUserIds } } } },
          ...scope.visibleUserIds.map((userId) => ({
            collaboratorUserIds: { array_contains: [userId] },
          })),
          {
            engagements: {
              some: { ownerUserId: { in: scope.visibleUserIds } },
            },
          },
        ],
      };

export function createPrismaAcademyRepository(prisma: any): AcademyRepository {
  return {
    async listCourseCategories() {
      const rows = await prisma.businessRecord.findMany({
        where: { domain: ACADEMY_COURSE_CATEGORY_DOMAIN },
        orderBy: { createdAt: "asc" },
      });
      return rows.map((row: any) => {
        const data = row.data as any;
        return {
          id: row.recordId,
          name: String(data.name || row.title || ""),
          description: String(data.description || ""),
          sortOrder: Number(data.sortOrder) || 1,
          isActive: data.isActive !== false,
          createdAt: new Date(data.createdAt || row.createdAt),
          updatedAt: new Date(data.updatedAt || row.updatedAt),
        };
      });
    },
    async upsertCourseCategory(category) {
      const data = {
        ...category,
        createdAt: category.createdAt.toISOString(),
        updatedAt: category.updatedAt.toISOString(),
      };
      const row = await prisma.businessRecord.upsert({
        where: { domain_recordId: { domain: ACADEMY_COURSE_CATEGORY_DOMAIN, recordId: category.id } },
        create: {
          id: `${ACADEMY_COURSE_CATEGORY_DOMAIN}:${category.id}`,
          domain: ACADEMY_COURSE_CATEGORY_DOMAIN,
          recordId: category.id,
          title: category.name,
          status: category.isActive ? "ACTIVE" : "INACTIVE",
          data,
        },
        update: {
          title: category.name,
          status: category.isActive ? "ACTIVE" : "INACTIVE",
          data,
        },
      });
      const saved = row.data as any;
      return {
        ...saved,
        createdAt: new Date(saved.createdAt || row.createdAt),
        updatedAt: new Date(saved.updatedAt || row.updatedAt),
      };
    },
    async listCourses({ page, pageSize, search, status }, scope) {
      const where = {
        AND: [
          courseScopeWhere(scope),
          status ? { status } : {},
          search
          ? {
              OR: [
                { title: { contains: search } },
                { code: { contains: search } },
                { category: { contains: search } },
              ],
            }
          : {},
        ],
      };
      const [items, total] = await prisma.$transaction([
        prisma.academyCourse.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.academyCourse.count({ where }),
      ]);
      return { items: items.map(mapCourse), total };
    },
    async findCourseByCode(code) {
      const record = await prisma.academyCourse.findFirst({ where: { code } });
      return record ? mapCourse(record) : null;
    },
    async findCourseById(id, scope) {
      const record = scope
        ? await prisma.academyCourse.findFirst({ where: { id, ...courseScopeWhere(scope) } })
        : await prisma.academyCourse.findUnique({ where: { id } });
      return record ? mapCourse(record) : null;
    },
    async findActiveUserById(id) {
      return prisma.user.findFirst({
        where: { id, isActive: true, employmentStatus: "active" },
        select: { id: true, name: true },
      });
    },
    async findActiveProductById(id) {
      const record = await prisma.businessRecord.findFirst({
        where: { domain: STORAGE_KEYS.PRODUCTS, recordId: id },
        select: { recordId: true, data: true },
      });
      const data = record?.data as any;
      if (!record || data?.isActive === false || !String(data?.name || "").trim()) return null;
      return { id: record.recordId, name: String(data.name).trim() };
    },
    async findLatestCourseVersionId(courseId) {
      const version = await prisma.academyCourseVersion.findFirst({
        where: { courseId },
        orderBy: { versionNumber: "desc" },
        select: { id: true },
      });
      return version?.id || null;
    },
    async createCourse(course) {
      return mapCourse(await prisma.academyCourse.create({ data: course }));
    },
    async createCourseVersion(version) {
      return prisma.academyCourseVersion.create({ data: version });
    },
    async getNextCourseVersionNumber(courseId) {
      const aggregate = await prisma.academyCourseVersion.aggregate({
        where: { courseId },
        _max: { versionNumber: true },
      });
      return Number(aggregate._max.versionNumber || 0) + 1;
    },
    async updateCourse(id, update) {
      try {
        return mapCourse(await prisma.academyCourse.update({ where: { id }, data: update }));
      } catch (error: any) {
        if (error?.code === "P2025") return null;
        throw error;
      }
    },
    async listCourseAssets(courseId) {
      const rows = await prisma.businessRecord.findMany({
        where: {
          domain: ACADEMY_COURSE_ASSET_DOMAIN,
          recordId: { startsWith: `${courseId}:` },
        },
        orderBy: { updatedAt: "desc" },
      });
      return rows.map((row: any) => {
        const data = row.data as any;
        return {
          ...data,
          createdAt: new Date(data.createdAt || row.createdAt),
          updatedAt: new Date(data.updatedAt || row.updatedAt),
          attachments: Array.isArray(data.attachments) ? data.attachments : [],
        } as AcademyCourseAssetRecord;
      });
    },
    async upsertCourseAsset(asset) {
      const recordId = `${asset.courseId}:${asset.assetType}`;
      const data = {
        ...asset,
        createdAt: asset.createdAt.toISOString(),
        updatedAt: asset.updatedAt.toISOString(),
      };
      const row = await prisma.businessRecord.upsert({
        where: {
          domain_recordId: {
            domain: ACADEMY_COURSE_ASSET_DOMAIN,
            recordId,
          },
        },
        create: {
          id: `${ACADEMY_COURSE_ASSET_DOMAIN}:${recordId}`,
          domain: ACADEMY_COURSE_ASSET_DOMAIN,
          recordId,
          title: asset.title,
          owner: asset.ownerUserName,
          eventAt: asset.updatedAt,
          data,
        },
        update: {
          title: asset.title,
          owner: asset.ownerUserName,
          eventAt: asset.updatedAt,
          data,
        },
      });
      const saved = row.data as any;
      return {
        ...saved,
        createdAt: new Date(saved.createdAt || row.createdAt),
        updatedAt: new Date(saved.updatedAt || row.updatedAt),
        attachments: Array.isArray(saved.attachments) ? saved.attachments : [],
      } as AcademyCourseAssetRecord;
    },
    async updateCourseStatus(id, expectedStatus, status) {
      const result = await prisma.academyCourse.updateMany({
        where: { id, status: expectedStatus },
        data: { status },
      });
      if (!result.count) return null;
      const record = await prisma.academyCourse.findUnique({ where: { id } });
      return record ? mapCourse(record) : null;
    },
    async listSessions({ page, pageSize, search, status, includeAudience }, scope) {
      const visibilityWhere = includeAudience === "ALL_EMPLOYEES"
        ? { OR: [sessionScopeWhere(scope), { collaboratorUserIds: { array_contains: [ACADEMY_ALL_EMPLOYEES_MARKER] } }] }
        : sessionScopeWhere(scope);
      const where = {
        AND: [
          visibilityWhere,
          status ? { status } : {},
          search
          ? {
              OR: [
                { title: { contains: search } },
                { venue: { contains: search } },
                { course: { title: { contains: search } } },
              ],
            }
          : {},
        ],
      };
      const [items, total] = await prisma.$transaction([
        prisma.academySession.findMany({
          where,
          include: {
            course: { select: { code: true, title: true, category: true, ownerUserId: true } },
            tasks: {
              where: { assigneeUserId: { in: scope.visibleUserIds } },
              select: { id: true },
              take: 1,
            },
            _count: { select: { engagements: true, tasks: true } },
          },
          orderBy: { startsAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.academySession.count({ where }),
      ]);
      return { items: items.map(mapSession), total };
    },
    async findSessionById(id, scope) {
      const record = scope
        ? await prisma.academySession.findFirst({ where: { id, ...sessionScopeWhere(scope) } })
        : await prisma.academySession.findUnique({ where: { id } });
      return record ? mapSession(record) : null;
    },
    async getSessionDetail(id, scope) {
      const record = await prisma.academySession.findFirst({
        where: { id, ...sessionScopeWhere(scope) },
        include: {
          course: { select: { code: true, title: true, category: true } },
          tasks: { orderBy: [{ category: "asc" }, { createdAt: "asc" }] },
          engagements: { orderBy: { updatedAt: "desc" } },
          review: true,
        },
      });
      if (!record) return null;
      return {
        ...mapSession(record),
        tasks: record.tasks,
        engagements: record.engagements,
        review: record.review,
      };
    },
    async createSession(session, checklist) {
      const { audience, isInvitable, ...sessionData } = session;
      const collaboratorUserIds = [
        ...(session.collaboratorUserIds || []),
        ...(audience === "ALL_EMPLOYEES" ? [ACADEMY_ALL_EMPLOYEES_MARKER] : []),
        ...(audience === "ALL_EMPLOYEES" && isInvitable ? [ACADEMY_INVITABLE_MARKER] : []),
      ];
      await prisma.$transaction(async (tx: any) => {
        await tx.academySession.create({ data: { ...sessionData, collaboratorUserIds } });
        await tx.academySessionTask.createMany({ data: checklist });
      });
      return { ...session, tasks: checklist };
    },
    async updateSessionStatus(
      id,
      expectedStatus,
      status: AcademySessionStatus,
    ) {
      const result = await prisma.academySession.updateMany({
        where: { id, status: expectedStatus },
        data: { status },
      });
      if (!result.count) return null;
      const record = await prisma.academySession.findUnique({ where: { id } });
      return record ? mapSession(record) : null;
    },
    async listSessionTasks(sessionId) {
      return prisma.academySessionTask.findMany({
        where: { sessionId },
        orderBy: { createdAt: "asc" },
      });
    },
    async findTaskById(id, scope) {
      return scope
        ? prisma.academySessionTask.findFirst({
            where: { id, session: sessionScopeWhere(scope) },
          })
        : prisma.academySessionTask.findUnique({ where: { id } });
    },
    async updateTaskStatus(id, update) {
      try {
        return await prisma.academySessionTask.update({
          where: { id },
          data: update,
        });
      } catch (error: any) {
        if (error?.code === "P2025") return null;
        throw error;
      }
    },
    async upsertEngagement(engagement: AcademyEngagementRecord) {
      const {
        id,
        createdAt,
        ...update
      } = engagement;
      return prisma.academyEngagement.upsert({
        where: {
          sessionId_participantKey: {
            sessionId: engagement.sessionId,
            participantKey: engagement.participantKey,
          },
        },
        create: engagement,
        update,
      });
    },
    async findEngagementById(id, scope) {
      return scope
        ? prisma.academyEngagement.findFirst({
            where: { id, session: sessionScopeWhere(scope) },
          })
        : prisma.academyEngagement.findUnique({ where: { id } });
    },
    async findEngagementByKey(sessionId, participantKey) {
      return prisma.academyEngagement.findUnique({
        where: { sessionId_participantKey: { sessionId, participantKey } },
      });
    },
    async saveReview(review: AcademyReviewRecord) {
      const { id, createdAt, ...update } = review;
      return prisma.academySessionReview.upsert({
        where: { sessionId: review.sessionId },
        create: review,
        update,
      });
    },
    async getDashboard(scope) {
      const current = new Date();
      const courseWhere = courseScopeWhere(scope);
      const sessionWhere = sessionScopeWhere(scope);
      const engagementWhere = scope.unrestricted
        ? {}
        : { ownerUserId: { in: scope.visibleUserIds } };
      const [
        activeCourses,
        upcomingSessions,
        sessionsNeedingAttention,
        pendingFollowUps,
      ] = await Promise.all([
        prisma.academyCourse.count({
          where: { ...courseWhere, status: "ACTIVE" },
        }),
        prisma.academySession.count({
          where: {
            ...sessionWhere,
            startsAt: { gte: current },
            status: { in: ["PLANNED", "READY"] },
          },
        }),
        prisma.academySession.count({
          where: { ...sessionWhere, status: "READY" },
        }),
        prisma.academyEngagement.count({
          where: { ...engagementWhere, followUpStatus: "PENDING" },
        }),
      ]);
      return {
        activeCourses,
        upcomingSessions,
        sessionsNeedingAttention,
        pendingFollowUps,
      };
    },
  };
}
