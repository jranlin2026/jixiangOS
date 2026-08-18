import { randomUUID } from "node:crypto";
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
  AcademySopTemplateRecord,
} from "./academyService";
import { STORAGE_KEYS } from "../../../src/shared/utils/constants";
import { BUSINESS_ATTACHMENT_DOMAIN } from "../businessAttachmentService";

const ACADEMY_COURSE_ASSET_DOMAIN = "academy_course_assets";
const ACADEMY_COURSE_CATEGORY_DOMAIN = "academy_course_categories";
const ACADEMY_TASK_ATTACHMENT_DOMAIN = "academy_task_attachments";
const ACADEMY_TASK_EVENT_DOMAIN = "academy_task_events";
const ACADEMY_ALL_EMPLOYEES_MARKER = "__academy_all_employees__";
const ACADEMY_INVITABLE_MARKER = "__academy_invitable__";

const taskEventRecord = (task: any, eventType: string) => {
  const session = task.session
    ? {
        id: task.session.id,
        title: task.session.title,
        startsAt: task.session.startsAt,
        endsAt: task.session.endsAt,
        status: task.session.status,
      }
    : undefined;
  const taskSnapshot = { ...task, session };
  return {
    id: `academy-task-event:${randomUUID()}`,
    domain: ACADEMY_TASK_EVENT_DOMAIN,
    recordId: randomUUID(),
    title: task.title,
    status: task.status,
    owner: task.assigneeUserId || null,
    mergedById:
      ["DONE", "REJECTED"].includes(task.status) && task.reviewedById
        ? task.reviewedById
        : null,
    mergedByName:
      ["DONE", "REJECTED"].includes(task.status) && task.reviewedByName
        ? task.reviewedByName
        : null,
    eventAt: task.updatedAt || new Date(),
    data: {
      eventType,
      task: JSON.parse(JSON.stringify(taskSnapshot)),
    },
  };
};

const publicTaskAttachment = (row: any) => {
  const data = row?.data && typeof row.data === "object" ? row.data as any : {};
  if (data.category !== "academy-task-evidence") return null;
  return {
    id: String(data.id || row.recordId || ""),
    name: String(data.name || row.title || ""),
    mimeType: String(data.mimeType || "application/octet-stream"),
    size: Number(data.size || 0),
    category: "academy-task-evidence" as const,
    uploadedById: String(data.uploadedById || ""),
    uploadedByName: String(data.uploadedByName || ""),
    uploadedAt: String(data.uploadedAt || row.createdAt?.toISOString?.() || ""),
  };
};

const mapCourse = (record: any): AcademyCourseRecord => ({
  ...record,
  objectives: Array.isArray(record.objectives) ? record.objectives : [],
  defaultDurationMinutes: Number(record.defaultDurationMinutes),
});

const mapSopTemplate = (record: any): AcademySopTemplateRecord => ({
  ...record,
  steps: (record.steps || []).map((step: any) => ({
    ...step,
    stageOrder: Number(step.stageOrder),
    sortOrder: Number(step.sortOrder),
    dueOffsetMinutes: step.dueOffsetMinutes == null ? null : Number(step.dueOffsetMinutes),
  })).sort((left: any, right: any) => left.sortOrder - right.sortOrder),
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
        ownerUserId: { in: scope.visibleUserIds },
      };

const sessionScopeWhere = (scope: AcademyAccessScope) =>
  scope.unrestricted
    ? {}
    : {
        OR: [
          { createdById: { in: scope.visibleUserIds } },
          { facilitatorUserId: { in: scope.visibleUserIds } },
          { taskReviewerUserId: { in: scope.visibleUserIds } },
          { lecturerUserId: { in: scope.visibleUserIds } },
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
    async listSopTemplates() {
      const rows = await prisma.academySopTemplate.findMany({
        include: { steps: { orderBy: { sortOrder: "asc" } } },
        orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
      });
      return rows.map(mapSopTemplate);
    },
    async findSopTemplateById(id) {
      const row = await prisma.academySopTemplate.findUnique({
        where: { id },
        include: { steps: { orderBy: { sortOrder: "asc" } } },
      });
      return row ? mapSopTemplate(row) : null;
    },
    async findDefaultSopTemplate() {
      const row = await prisma.academySopTemplate.findFirst({
        where: { status: "ACTIVE" },
        include: { steps: { orderBy: { sortOrder: "asc" } } },
        orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
      });
      return row ? mapSopTemplate(row) : null;
    },
    async saveSopTemplate(template) {
      const { steps, ...templateData } = template;
      await prisma.$transaction(async (tx: any) => {
        if (template.isDefault) await tx.academySopTemplate.updateMany({ where: { isDefault: true, id: { not: template.id } }, data: { isDefault: false } });
        await tx.academySopTemplate.upsert({ where: { id: template.id }, create: templateData, update: templateData });
        await tx.academySopTemplateStep.deleteMany({ where: { templateId: template.id } });
        if (steps.length) await tx.academySopTemplateStep.createMany({ data: steps });
      }, { isolationLevel: "Serializable" });
      return template;
    },
    async deleteSopTemplate(id) {
      await prisma.academySopTemplate.delete({ where: { id } });
    },
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
    async listCourses({ page, pageSize, search, status, sopTemplateId }, scope) {
      const where = {
        AND: [
          courseScopeWhere(scope),
          status ? { status } : {},
          ...(sopTemplateId ? [{ sopTemplateId }] : []),
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
          contentText: typeof data.contentText === "string" ? data.contentText : null,
          externalUrl: typeof data.externalUrl === "string" ? data.externalUrl : null,
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
    async listPublicCalendar({ start, end }) {
      const rows = await prisma.academySession.findMany({
        where: {
          status: { not: "CANCELLED" },
          startsAt: { lt: end },
          endsAt: { gt: start },
        },
        select: {
          id: true,
          title: true,
          startsAt: true,
          endsAt: true,
          deliveryMode: true,
          status: true,
          lecturerUserName: true,
          taskReviewerUserName: true,
          tasks: {
            select: {
              id: true,
              templateKey: true,
              title: true,
              category: true,
              stageKey: true,
              stageName: true,
              stageOrder: true,
              isUnlocked: true,
              isRequired: true,
              assigneeUserId: true,
              assigneeUserName: true,
              dueAt: true,
              status: true,
              sortOrder: true,
              completionMode: true,
              requiresReview: true,
            },
            orderBy: [{ category: "asc" }, { stageOrder: "asc" }, { sortOrder: "asc" }],
          },
          course: { select: { title: true } },
        },
        orderBy: [{ startsAt: "asc" }, { title: "asc" }],
      });
      return rows.map((row: any) => ({
        id: row.id,
        title: row.title,
        courseTitle: row.course?.title || row.title,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        deliveryMode: row.deliveryMode,
        status: row.status,
        lecturerUserName: row.lecturerUserName,
        taskReviewerUserName: row.taskReviewerUserName,
        tasks: row.tasks,
      }));
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
      taskUpdate,
      unlockCategory,
    ) {
      const record = await prisma.$transaction(async (tx: any) => {
        const result = await tx.academySession.updateMany({
          where: { id, status: expectedStatus },
          data: { status },
        });
        if (!result.count) return null;
        const session = await tx.academySession.findUnique({ where: { id } });
        if (taskUpdate) {
          const closingTasks = await tx.academySessionTask.findMany({
            where: { sessionId: id, status: { notIn: ["DONE", "SKIPPED"] } },
          });
          await tx.academySessionTask.updateMany({
            where: { sessionId: id, status: { notIn: ["DONE", "SKIPPED"] } },
            data: taskUpdate,
          });
          await Promise.all(
            closingTasks.map((task: any) => {
              const updatedTask = { ...task, ...taskUpdate, session };
              return tx.businessRecord.create({
                data: taskEventRecord(updatedTask, "SESSION_CANCELLED"),
              });
            }),
          );
        }
        if (unlockCategory) {
          const categoryTasks = await tx.academySessionTask.findMany({
            where: { sessionId: id, category: unlockCategory },
            orderBy: [{ stageOrder: "asc" }, { sortOrder: "asc" }],
            select: { stageOrder: true, isRequired: true },
          });
          const stageOrders = [...new Set(categoryTasks.map((task: any) => Number(task.stageOrder)))];
          const firstRequiredStage = stageOrders.find((stageOrder) => categoryTasks.some((task: any) => task.stageOrder === stageOrder && task.isRequired));
          const unlockThrough = firstRequiredStage ?? stageOrders[stageOrders.length - 1];
          if (unlockThrough != null) await tx.academySessionTask.updateMany({
            where: { sessionId: id, category: unlockCategory, stageOrder: { lte: unlockThrough } },
            data: { isUnlocked: true },
          });
        }
        return session;
      });
      return record ? mapSession(record) : null;
    },
    async updateSession(id, expectedStatus, update, taskUpdates) {
      const record = await prisma.$transaction(async (tx: any) => {
        const { audience, isInvitable, ...sessionUpdate } = update;
        const current = await tx.academySession.findUnique({ where: { id }, select: { collaboratorUserIds: true } });
        const collaborators = (Array.isArray(current?.collaboratorUserIds) ? current.collaboratorUserIds : [])
          .filter((value: string) => !value.startsWith("__academy_"));
        const collaboratorUserIds = audience
          ? [
              ...collaborators,
              ...(audience === "ALL_EMPLOYEES" ? [ACADEMY_ALL_EMPLOYEES_MARKER] : []),
              ...(audience === "ALL_EMPLOYEES" && isInvitable ? [ACADEMY_INVITABLE_MARKER] : []),
            ]
          : undefined;
        const changed = await tx.academySession.updateMany({ where: { id, status: expectedStatus }, data: { ...sessionUpdate, ...(collaboratorUserIds ? { collaboratorUserIds } : {}) } });
        if (!changed.count) return null;
        for (const taskUpdate of taskUpdates) {
          await tx.academySessionTask.update({ where: { id: taskUpdate.id }, data: taskUpdate.update });
        }
        return tx.academySession.findUnique({ where: { id } });
      });
      return record ? mapSession(record) : null;
    },
    async listSessionTasks(sessionId) {
      return prisma.academySessionTask.findMany({
        where: { sessionId },
        orderBy: { createdAt: "asc" },
      });
    },
    async listMyTasks(userId, { page, pageSize, status }, scope) {
      if (status === "HISTORY") {
        const where = {
          domain: ACADEMY_TASK_EVENT_DOMAIN,
          OR: [{ owner: userId }, { mergedById: userId }],
        };
        const [rows, total] = await prisma.$transaction([
          prisma.businessRecord.findMany({
            where,
            select: { recordId: true, data: true },
            orderBy: { eventAt: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
          }),
          prisma.businessRecord.count({ where }),
        ]);
        return {
          items: rows
            .map((row: any) => {
              const data = row.data && typeof row.data === "object" ? row.data : {};
              return data.task
                ? { ...data.task, eventId: row.recordId }
                : null;
            })
            .filter(Boolean),
          total,
        };
      }
      const where = status === "REVIEW"
        ? {
            status: "SUBMITTED",
            session: scope
              ? sessionScopeWhere(scope)
              : { taskReviewerUserId: userId, status: { not: "CANCELLED" } },
            OR: [
              { category: "BEFORE", session: { status: { in: ["PLANNED", "READY"] } } },
              { category: "DURING", session: { status: "IN_PROGRESS" } },
              { category: "AFTER", session: { status: "POST_COURSE" } },
            ],
          }
        : {
              assigneeUserId: userId,
              session: { status: { not: "CANCELLED" } },
              ...(status === "OPEN"
                ? {
                    isUnlocked: true,
                    status: { notIn: ["DONE", "SKIPPED", "SUBMITTED"] },
                    OR: [
                      { category: "BEFORE", session: { status: { in: ["PLANNED", "READY"] } } },
                      { category: "DURING", session: { status: "IN_PROGRESS" } },
                      { category: "AFTER", session: { status: "POST_COURSE" } },
                    ],
                  }
                : status ? { status } : {}),
            };
      const select = {
        id: true,
        sessionId: true,
        templateKey: true,
        sopTemplateId: true,
        sopTemplateStepId: true,
        assigneeRole: true,
        sortOrder: true,
        title: true,
        category: true,
        stageKey: true,
        stageName: true,
        stageOrder: true,
        isUnlocked: true,
        completionMode: true,
        requiresReview: true,
        isRequired: true,
        status: true,
        note: true,
        assigneeUserId: true,
        assigneeUserName: true,
        collaboratorNames: true,
        dueAt: true,
        acceptanceCriteria: true,
        submissionNote: true,
        submittedAt: true,
        submittedById: true,
        submittedByName: true,
        reviewNote: true,
        reviewedAt: true,
        reviewedById: true,
        reviewedByName: true,
        completedAt: true,
        completedById: true,
        completedByName: true,
        createdAt: true,
        updatedAt: true,
        session: {
          select: {
            id: true,
            title: true,
            startsAt: true,
            endsAt: true,
            status: true,
            taskReviewerUserId: true,
            taskReviewerUserName: true,
          },
        },
      };
      const [items, total] = await prisma.$transaction([
        prisma.academySessionTask.findMany({
          where,
          select,
          orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.academySessionTask.count({ where }),
      ]);
      return { items, total };
    },
    async findTaskById(id, scope) {
      return scope
        ? prisma.academySessionTask.findFirst({
            where: { id, session: sessionScopeWhere(scope) },
          })
        : prisma.academySessionTask.findUnique({ where: { id } });
    },
    async updateTaskStatus(id, expectedStatus, update, allowedSessionStatuses) {
      return prisma.$transaction(async (tx: any) => {
        const currentTask = await tx.academySessionTask.findUnique({
          where: { id },
          select: { sessionId: true },
        });
        if (!currentTask) return null;
        await tx.$queryRawUnsafe(
          "SELECT `id` FROM `academy_sessions` WHERE `id` = ? FOR UPDATE",
          currentTask.sessionId,
        );
        const changed = await tx.academySessionTask.updateMany({
          where: {
            id,
            status: expectedStatus,
            isUnlocked: true,
            session: { status: { in: allowedSessionStatuses } },
          },
          data: update,
        });
        if (!changed.count) return null;
        const task = await tx.academySessionTask.findUnique({
          where: { id },
          include: { session: true },
        });
        if (!task) return null;
        if (task.status === "DONE") {
          const remainingRequired = await tx.academySessionTask.findMany({
            where: {
              sessionId: task.sessionId,
              category: task.category,
              stageKey: task.stageKey,
              stageOrder: task.stageOrder,
              isRequired: true,
              status: { not: "DONE" },
            },
            select: { id: true },
          });
          if (!remainingRequired.length) {
            const futureTasks = await tx.academySessionTask.findMany({
              where: { sessionId: task.sessionId, category: task.category, stageOrder: { gt: task.stageOrder } },
              orderBy: [{ stageOrder: "asc" }, { sortOrder: "asc" }],
              select: { stageOrder: true, isRequired: true },
            });
            const futureStageOrders = [...new Set(futureTasks.map((item: any) => Number(item.stageOrder)))];
            const nextRequiredStage = futureStageOrders.find((stageOrder) => futureTasks.some((item: any) => item.stageOrder === stageOrder && item.isRequired));
            const unlockThrough = nextRequiredStage ?? futureStageOrders[futureStageOrders.length - 1];
            if (unlockThrough != null) await tx.academySessionTask.updateMany({
              where: { sessionId: task.sessionId, category: task.category, stageOrder: { gt: task.stageOrder, lte: unlockThrough } },
              data: { isUnlocked: true },
            });
          }
        }
        await tx.businessRecord.create({
          data: taskEventRecord(
            task,
            task.status === "REJECTED"
              ? "REVIEW_REJECTED"
              : task.status === "DONE"
                ? "TASK_COMPLETED"
                : task.status === "SUBMITTED"
                  ? "TASK_SUBMITTED"
                  : "TASK_UPDATED",
          ),
        });
        return task;
      });
    },
    async listTaskAttachments(taskId) {
      const result = await prisma.businessRecord.findMany({
        where: { domain: ACADEMY_TASK_ATTACHMENT_DOMAIN, recordId: taskId },
        select: { recordId: true, data: true },
      });
      if (!result.length) return [];
      const data = result[0].data as any;
      const attachmentIds = Array.isArray(data?.attachmentIds) ? data.attachmentIds.map(String) : [];
      if (!attachmentIds.length) return [];
      const rows = await prisma.businessRecord.findMany({
        where: { domain: BUSINESS_ATTACHMENT_DOMAIN, recordId: { in: attachmentIds } },
      });
      const byId = new Map(rows.map((row: any) => [row.recordId, publicTaskAttachment(row)]));
      return attachmentIds.map((id: string) => byId.get(id)).filter(Boolean);
    },
    async listTaskAttachmentsByTaskIds(taskIds) {
      const uniqueTaskIds = [...new Set(taskIds.filter(Boolean))];
      const result = new Map(uniqueTaskIds.map((taskId) => [taskId, [] as any[]]));
      if (!uniqueTaskIds.length) return result;
      const links = await prisma.businessRecord.findMany({
        where: { domain: ACADEMY_TASK_ATTACHMENT_DOMAIN, recordId: { in: uniqueTaskIds } },
        select: { recordId: true, data: true },
      });
      const attachmentIds = [...new Set(links.flatMap((row: any) => {
        const data = row.data as any;
        return Array.isArray(data?.attachmentIds) ? data.attachmentIds.map(String) : [];
      }))];
      if (!attachmentIds.length) return result;
      const attachmentRows = await prisma.businessRecord.findMany({
        where: { domain: BUSINESS_ATTACHMENT_DOMAIN, recordId: { in: attachmentIds } },
      });
      const byId = new Map(attachmentRows.map((row: any) => [row.recordId, publicTaskAttachment(row)]));
      links.forEach((row: any) => {
        const data = row.data as any;
        const items = (Array.isArray(data?.attachmentIds) ? data.attachmentIds : [])
          .map((id: unknown) => byId.get(String(id)))
          .filter(Boolean);
        result.set(row.recordId, items);
      });
      return result;
    },
    async replaceTaskAttachments(taskId, attachmentIds, actor) {
      const updatedAt = new Date();
      await prisma.businessRecord.upsert({
        where: { domain_recordId: { domain: ACADEMY_TASK_ATTACHMENT_DOMAIN, recordId: taskId } },
        create: {
          id: `${ACADEMY_TASK_ATTACHMENT_DOMAIN}:${taskId}`,
          domain: ACADEMY_TASK_ATTACHMENT_DOMAIN,
          recordId: taskId,
          title: "商学院任务交付附件",
          owner: actor.name,
          eventAt: updatedAt,
          data: { taskId, attachmentIds, updatedById: actor.id, updatedByName: actor.name, updatedAt: updatedAt.toISOString() },
        },
        update: {
          owner: actor.name,
          eventAt: updatedAt,
          data: { taskId, attachmentIds, updatedById: actor.id, updatedByName: actor.name, updatedAt: updatedAt.toISOString() },
        },
      });
      const links = await prisma.businessRecord.findMany({
        where: { domain: ACADEMY_TASK_ATTACHMENT_DOMAIN, recordId: taskId },
        select: { recordId: true, data: true },
      });
      if (!links.length || !attachmentIds.length) return [];
      const attachmentRows = await prisma.businessRecord.findMany({
        where: { domain: BUSINESS_ATTACHMENT_DOMAIN, recordId: { in: attachmentIds } },
      });
      const byId = new Map<string, ReturnType<typeof publicTaskAttachment>>(attachmentRows.map((row: any) => [String(row.recordId), publicTaskAttachment(row)]));
      return attachmentIds.map((id) => byId.get(id)).filter((item): item is NonNullable<typeof item> => Boolean(item));
    },
    async removeTaskAttachmentReference(taskId, attachmentId) {
      const row = await prisma.businessRecord.findUnique({
        where: { domain_recordId: { domain: ACADEMY_TASK_ATTACHMENT_DOMAIN, recordId: taskId } },
        select: { data: true },
      });
      const data = row?.data as any;
      const current = Array.isArray(data?.attachmentIds) ? data.attachmentIds.map(String) : [];
      const attachmentIds = current.filter((id: string) => id !== attachmentId);
      if (attachmentIds.length === current.length) return;
      await prisma.businessRecord.update({
        where: { domain_recordId: { domain: ACADEMY_TASK_ATTACHMENT_DOMAIN, recordId: taskId } },
        data: { data: { ...data, attachmentIds, updatedAt: new Date().toISOString() } },
      });
    },
    async isTaskAttachmentLinked(taskId, attachmentId) {
      const row = await prisma.businessRecord.findUnique({
        where: { domain_recordId: { domain: ACADEMY_TASK_ATTACHMENT_DOMAIN, recordId: taskId } },
        select: { data: true },
      });
      const data = row?.data as any;
      return Array.isArray(data?.attachmentIds) && data.attachmentIds.map(String).includes(attachmentId);
    },
    async listLinkedTaskAttachmentIds(taskIds) {
      if (!taskIds.length) return new Set<string>();
      const rows = await prisma.businessRecord.findMany({
        where: { domain: ACADEMY_TASK_ATTACHMENT_DOMAIN, recordId: { in: taskIds } },
        select: { data: true },
      });
      return new Set<string>(rows.flatMap((row: any) => {
        const data = row.data as any;
        return Array.isArray(data?.attachmentIds) ? data.attachmentIds.map(String) : [];
      }));
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
