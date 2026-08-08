import type {
  AcademyCourseRecord,
  AcademyAccessScope,
  AcademyEngagementRecord,
  AcademyRepository,
  AcademyReviewRecord,
  AcademySessionRecord,
  AcademySessionStatus,
  AcademySessionTaskRecord,
} from "./academyService";

const mapCourse = (record: any): AcademyCourseRecord => ({
  ...record,
  objectives: Array.isArray(record.objectives) ? record.objectives : [],
  defaultDurationMinutes: Number(record.defaultDurationMinutes),
});

const mapSession = (record: any): AcademySessionRecord => ({
  ...record,
  capacity: Number(record.capacity),
});

const courseScopeWhere = (scope: AcademyAccessScope) =>
  scope.unrestricted ? {} : { ownerUserId: { in: scope.visibleUserIds } };

const sessionScopeWhere = (scope: AcademyAccessScope) =>
  scope.unrestricted
    ? {}
    : {
        OR: [
          { createdById: { in: scope.visibleUserIds } },
          { facilitatorUserId: { in: scope.visibleUserIds } },
          {
            engagements: {
              some: { ownerUserId: { in: scope.visibleUserIds } },
            },
          },
        ],
      };

export function createPrismaAcademyRepository(prisma: any): AcademyRepository {
  return {
    async listCourses({ page, pageSize, search, status }, scope) {
      const where = {
        ...courseScopeWhere(scope),
        ...(status ? { status } : {}),
        ...(search
          ? {
              OR: [
                { title: { contains: search } },
                { code: { contains: search } },
                { category: { contains: search } },
              ],
            }
          : {}),
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
    async findCourseById(id) {
      const record = await prisma.academyCourse.findUnique({ where: { id } });
      return record ? mapCourse(record) : null;
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
    async updateCourseStatus(id, expectedStatus, status) {
      const result = await prisma.academyCourse.updateMany({
        where: { id, status: expectedStatus },
        data: { status },
      });
      if (!result.count) return null;
      const record = await prisma.academyCourse.findUnique({ where: { id } });
      return record ? mapCourse(record) : null;
    },
    async listSessions({ page, pageSize, search, status }, scope) {
      const where = {
        ...sessionScopeWhere(scope),
        ...(status ? { status } : {}),
        ...(search
          ? {
              OR: [
                { title: { contains: search } },
                { venue: { contains: search } },
                { course: { title: { contains: search } } },
              ],
            }
          : {}),
      };
      const [items, total] = await prisma.$transaction([
        prisma.academySession.findMany({
          where,
          include: {
            course: { select: { code: true, title: true, category: true } },
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
    async findSessionById(id) {
      const record = await prisma.academySession.findUnique({ where: { id } });
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
      await prisma.$transaction(async (tx: any) => {
        await tx.academySession.create({ data: session });
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
        ownerUserId: _ownerUserId,
        ownerUserName: _ownerUserName,
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
