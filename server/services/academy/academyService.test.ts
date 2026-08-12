import assert from "node:assert/strict";
import { createAcademyService, type AcademyRepository } from "./academyService";
import { PERMISSION_KEYS } from "../../../src/shared/utils/permissions";

const actor = {
  id: "user-admin",
  name: "系统管理员",
  role: "超级管理员",
  roleId: "role-admin",
  department: "总经办",
  departmentId: "dept-admin",
  permissions: [{ module: "全部", actions: ["admin"] }],
  isActive: true,
} as any;
const TASKS_REQUIRING_EVIDENCE_FOR_TEST = new Set(["COURSE_DEVELOPMENT", "COURSE_PACKAGING", "CONTENT", "ASSETS"]);

function createRepository(): AcademyRepository {
  const courses: any[] = [];
  const courseVersions: any[] = [];
  const categories: any[] = [];
  const assets: any[] = [];
  const sessions: any[] = [];
  const tasks: any[] = [];
  const engagements: any[] = [];
  const reviews: any[] = [];
  const taskAttachments = new Map<string, any[]>();
  const users = [
    { id: actor.id, name: actor.name },
    { id: "user-lecturer", name: "课程讲师" },
    { id: "user-content", name: "课程内容负责人" },
    { id: "user-material", name: "素材负责人" },
    { id: "user-review", name: "复盘负责人" },
    { id: "user-outsider", name: "其他部门负责人" },
  ];
  const sessionVisible = (session: any, scope?: any) => (
    !scope
    || scope.unrestricted
    || scope.visibleUserIds.includes(session.createdById)
    || scope.visibleUserIds.includes(session.facilitatorUserId)
    || scope.visibleUserIds.includes(session.lecturerUserId)
    || (session.collaboratorUserIds || []).some((id: string) => scope.visibleUserIds.includes(id))
    || scope.visibleUserIds.includes(courses.find((course) => course.id === session.courseId)?.ownerUserId)
  );
  const products = [{ id: "product-ai", name: "AI企业升级计划" }];
  return {
    listCourseCategories: async () => categories,
    upsertCourseCategory: async (category) => {
      const index = categories.findIndex((item) => item.id === category.id);
      if (index >= 0) categories[index] = category;
      else categories.push(category);
      return category;
    },
    listCourses: async ({ page, pageSize }) => ({
      items: courses.slice((page - 1) * pageSize, page * pageSize),
      total: courses.length,
    }),
    findCourseByCode: async (code) =>
      courses.find((course) => course.code === code) || null,
    findCourseById: async (id, scope) =>
      courses.find((course) => (
        course.id === id
        && (!scope || scope.unrestricted || scope.visibleUserIds.includes(course.ownerUserId))
      )) || null,
    findActiveUserById: async (id) => users.find((user) => user.id === id) || null,
    findActiveProductById: async (id) => products.find((product) => product.id === id) || null,
    findLatestCourseVersionId: async (courseId) =>
      courses.some((course) => course.id === courseId)
        ? `version-${courseId}`
        : null,
    createCourse: async (course) => (courses.push(course), course),
    createCourseVersion: async (version) => (courseVersions.push(version), version),
    getNextCourseVersionNumber: async (courseId) => courseVersions.filter((item) => item.courseId === courseId).length + 1,
    updateCourse: async (id, update) => {
      const course = courses.find((item) => item.id === id);
      if (!course) return null;
      Object.assign(course, update);
      return course;
    },
    listCourseAssets: async (courseId) =>
      assets.filter((asset) => asset.courseId === courseId),
    upsertCourseAsset: async (asset) => {
      const index = assets.findIndex(
        (item) => item.courseId === asset.courseId && item.assetType === asset.assetType,
      );
      if (index >= 0) assets[index] = { ...assets[index], ...asset };
      else assets.push(asset);
      return index >= 0 ? assets[index] : asset;
    },
    updateCourseStatus: async (id, expectedStatus, status) => {
      const course = courses.find(
        (item) => item.id === id && item.status === expectedStatus,
      );
      if (!course) return null;
      course.status = status;
      return course;
    },
    listSessions: async ({ page, pageSize }) => ({
      items: sessions.slice((page - 1) * pageSize, page * pageSize),
      total: sessions.length,
    }),
    listPublicCalendar: async ({ start, end }) => sessions
      .filter((session) => session.status !== "CANCELLED" && session.startsAt < end && session.endsAt > start)
      .map((session) => ({
        id: session.id,
        title: session.title,
        courseTitle: courses.find((course) => course.id === session.courseId)?.title || session.title,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        deliveryMode: session.deliveryMode,
        status: session.status,
        lecturerUserName: session.lecturerUserName,
      })),
    findSessionById: async (id, scope) =>
      sessions.find((session) => session.id === id && sessionVisible(session, scope)) || null,
    getSessionDetail: async (id, scope) => {
      const session = sessions.find((item) => item.id === id && sessionVisible(item, scope));
      return session
        ? {
            ...session,
            tasks: tasks.filter((task) => task.sessionId === id),
            engagements: engagements.filter((item) => item.sessionId === id),
            review: reviews.find((item) => item.sessionId === id) || null,
          }
        : null;
    },
    createSession: async (session, checklist) => {
      sessions.push(session);
      tasks.push(...checklist);
      return { ...session, tasks: checklist };
    },
    updateSessionStatus: async (id, expectedStatus, status) => {
      const session = sessions.find(
        (item) => item.id === id && item.status === expectedStatus,
      );
      if (!session) return null;
      session.status = status;
      return session;
    },
    listSessionTasks: async (sessionId) =>
      tasks.filter((task) => task.sessionId === sessionId),
    listMyTasks: async (userId, { page, pageSize }) => {
      const mine = tasks.filter((task) => task.assigneeUserId === userId).map((task) => {
        const session = sessions.find((item) => item.id === task.sessionId)!;
        return {
          ...task,
          session: {
            id: session.id,
            title: session.title,
            startsAt: session.startsAt,
            endsAt: session.endsAt,
            status: session.status,
          },
        };
      });
      return { items: mine.slice((page - 1) * pageSize, page * pageSize), total: mine.length };
    },
    findTaskById: async (id, scope) => tasks.find((task) => {
      const session = sessions.find((item) => item.id === task.sessionId);
      return task.id === id && session && sessionVisible(session, scope);
    }) || null,
    updateTaskStatus: async (id, update) => {
      const task = tasks.find((item) => item.id === id);
      if (!task) return null;
      Object.assign(task, update);
      return task;
    },
    listTaskAttachments: async (taskId) => structuredClone(taskAttachments.get(taskId) || []),
    listTaskAttachmentsByTaskIds: async (taskIds) => new Map(taskIds.map((taskId) => [taskId, structuredClone(taskAttachments.get(taskId) || [])])),
    replaceTaskAttachments: async (taskId, attachmentIds, current) => {
      const currentItems = taskAttachments.get(taskId) || [];
      const byId = new Map(currentItems.map((item) => [item.id, item]));
      const items = attachmentIds.map((id) => byId.get(id) || {
        id,
        name: `${id}.pptx`,
        mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        size: 1024,
        category: "academy-task-evidence",
        uploadedById: current.id,
        uploadedByName: current.name,
        uploadedAt: "2026-08-08T09:00:00.000Z",
      });
      taskAttachments.set(taskId, items);
      return structuredClone(items);
    },
    removeTaskAttachmentReference: async (taskId, attachmentId) => {
      taskAttachments.set(taskId, (taskAttachments.get(taskId) || []).filter((item) => item.id !== attachmentId));
    },
    isTaskAttachmentLinked: async (taskId, attachmentId) => (taskAttachments.get(taskId) || []).some((item) => item.id === attachmentId),
    listLinkedTaskAttachmentIds: async (taskIds) => new Set(
      taskIds.flatMap((taskId) => (taskAttachments.get(taskId) || []).map((item) => item.id)),
    ),
    upsertEngagement: async (engagement) => {
      const index = engagements.findIndex(
        (item) =>
          item.sessionId === engagement.sessionId &&
          item.participantKey === engagement.participantKey,
      );
      if (index >= 0)
        engagements[index] = {
          ...engagements[index],
          ...engagement,
          id: engagements[index].id,
          createdAt: engagements[index].createdAt,
        };
      else engagements.push(engagement);
      return index >= 0 ? engagements[index] : engagement;
    },
    findEngagementById: async (id, scope) =>
      engagements.find((engagement) => {
        const session = sessions.find((item) => item.id === engagement.sessionId);
        return engagement.id === id && session && sessionVisible(session, scope);
      }) || null,
    findEngagementByKey: async (sessionId, participantKey) =>
      engagements.find(
        (engagement) =>
          engagement.sessionId === sessionId && engagement.participantKey === participantKey,
      ) || null,
    saveReview: async (review) => {
      const index = reviews.findIndex(
        (item) => item.sessionId === review.sessionId,
      );
      if (index >= 0) reviews[index] = { ...reviews[index], ...review };
      else reviews.push(review);
      return index >= 0 ? reviews[index] : review;
    },
    getDashboard: async () => ({
      activeCourses: courses.filter((course) => course.status === "ACTIVE")
        .length,
      upcomingSessions: sessions.filter(
        (session) => session.status === "PLANNED",
      ).length,
      sessionsNeedingAttention: sessions.filter(
        (session) => session.status === "READY",
      ).length,
      pendingFollowUps: engagements.filter(
        (item) => item.followUpStatus === "PENDING",
      ).length,
    }),
  };
}

const repository = createRepository();
const businessAttachments = new Map<string, any>([
  ["attachment-1", {
    id: "attachment-1", name: "课程课件.pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    size: 1024, category: "academy-course-asset", uploadedById: actor.id, uploadedByName: actor.name,
    uploadedAt: "2026-08-08T09:00:00.000Z", draftKey: "",
  }],
  ["task-file-1", {
    id: "task-file-1", name: "课程大纲.pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    size: 1024, category: "academy-task-evidence", uploadedById: "user-content", uploadedByName: "课程内容负责人",
    uploadedAt: "2026-08-08T09:00:00.000Z", draftKey: "",
  }],
  ["task-file-2", {
    id: "task-file-2", name: "课程海报.png", mimeType: "image/png",
    size: 1024, category: "academy-task-evidence", uploadedById: "user-material", uploadedByName: "素材负责人",
    uploadedAt: "2026-08-08T09:00:00.000Z", draftKey: "",
  }],
]);
const service = createAcademyService(repository, {
  now: () => new Date("2026-08-08T09:00:00.000Z"),
  resolveCustomer: async (id) => ["cust-100", "cust-batch"].includes(id) ? {
    id,
    name: "CRM测试客户",
    ownerUserId: actor.id,
    ownerUserName: actor.name,
    isPublicPool: false,
  } : null,
  resolveLead: async () => null,
  resolveOrder: async (id) => id === "order-100" ? {
    id,
    orderNo: "ORD-20260808-001",
    customerId: "cust-100",
  } : null,
  addCustomerFollowUp: async (customerId, input, current) => ({
    code: 0,
    message: "success",
    data: null,
  }),
  findBusinessAttachment: async (id) => structuredClone(businessAttachments.get(id) || null),
  purgeBusinessAttachment: async (id) => businessAttachments.delete(id),
});

const initialCategories = await service.listCourseCategories(actor);
assert.equal(initialCategories.code, 0);
assert.ok(initialCategories.data!.some((item) => item.name === "公开课"), "系统应提供可配置的默认课程分类");
const customCategory = await service.saveCourseCategory({ name: "老板增长课", description: "面向企业老板", sortOrder: 8, isActive: true }, actor);
assert.equal(customCategory.code, 0);
assert.equal(customCategory.data?.name, "老板增长课");

const courseResult = await service.createCourse(
  {
    code: "CLIENT-SHOULD-NOT-CONTROL-CODE",
    title: "AI企业升级公开课",
    category: "公开课",
    summary: "帮助企业老板理解AI升级路径",
    targetAudience: "传统企业经营者",
    customerProblem: "团队不会把AI落到业务流程",
    coreViewpoint: "先改流程，再谈工具",
    conversionProductId: "product-ai",
    ownerUserId: actor.id,
    lecturerUserId: "user-lecturer",
    defaultDurationMinutes: 120,
    objectives: ["识别企业AI升级机会"],
  },
  actor,
);
assert.equal(courseResult.code, 0);
assert.equal(courseResult.data?.status, "DRAFT");
assert.match(courseResult.data?.code || "", /^AC-202608-[A-Z0-9]{6}$/);
assert.notEqual(courseResult.data?.code, "CLIENT-SHOULD-NOT-CONTROL-CODE");
assert.equal(courseResult.data?.ownerUserName, actor.name);
assert.equal(courseResult.data?.lecturerUserName, "课程讲师");
assert.equal(courseResult.data?.conversionProductName, "AI企业升级计划");
assert.equal(courseResult.data?.targetAudience, "传统企业经营者");
assert.equal(courseResult.data?.customerProblem, "团队不会把AI落到业务流程");
assert.equal(courseResult.data?.coreViewpoint, "先改流程，再谈工具");

const updatedCourse = await service.updateCourse(courseResult.data!.id, {
  ...courseResult.data,
  title: "AI企业升级公开课 V2",
  objectives: ["识别机会", "形成行动清单"],
  category: "老板增长课",
}, actor);
assert.equal(updatedCourse.code, 0);
assert.equal(updatedCourse.data?.title, "AI企业升级公开课 V2");
assert.deepEqual(updatedCourse.data?.objectives, ["识别机会", "形成行动清单"]);

const activatedCourse = await service.changeCourseStatus(
  courseResult.data!.id,
  "ACTIVE",
  actor,
);
assert.equal(activatedCourse.code, 0);
assert.equal(
  activatedCourse.data?.status,
  "ACTIVE",
  "课程草稿应可由课程管理员正式启用",
);

const nextCourse = await service.createCourse(
  {
    code: courseResult.data?.code,
    title: "第二门课程",
    category: "公开课",
    summary: "",
    defaultDurationMinutes: 60,
    objectives: [],
  },
  actor,
);
assert.equal(nextCourse.code, 0);
assert.notEqual(nextCourse.data?.code, courseResult.data?.code, "课程编码必须由服务端自动生成且保持唯一");

const outsider = { ...actor, id: "user-outsider", name: "其他部门负责人" };
const outsiderService = createAcademyService(repository, {
  now: () => new Date("2026-08-08T09:00:00.000Z"),
  resolveScope: async () => ({ unrestricted: false, visibleUserIds: [outsider.id] }),
  resolveCustomer: async () => null,
  resolveLead: async () => null,
  resolveOrder: async () => null,
});
const outsiderCourse = await outsiderService.createCourse(
  {
    title: "其他部门课程",
    category: "公开课",
    summary: "不属于当前用户的数据范围",
    defaultDurationMinutes: 60,
    objectives: [],
  },
  outsider,
);
assert.equal(outsiderCourse.code, 0);

const restrictedService = createAcademyService(repository, {
  now: () => new Date("2026-08-08T09:00:00.000Z"),
  resolveScope: async () => ({ unrestricted: false, visibleUserIds: [actor.id] }),
  resolveCustomer: async () => null,
  resolveLead: async () => null,
  resolveOrder: async () => null,
});
const forbiddenCourseStatus = await restrictedService.changeCourseStatus(
  outsiderCourse.data!.id,
  "ACTIVE",
  actor,
);
assert.equal(forbiddenCourseStatus.code, 404, "范围外课程必须按不存在处理，不能发布或归档");

assert.equal((await outsiderService.changeCourseStatus(outsiderCourse.data!.id, "ACTIVE", outsider)).code, 0);
const outsiderSession = await outsiderService.createSession(
  {
    courseId: outsiderCourse.data!.id,
    title: "其他部门课程安排",
    startsAt: "2026-08-12T09:00:00.000Z",
    endsAt: "2026-08-12T10:00:00.000Z",
    venue: "其他部门直播间",
    capacity: 20,
    audience: "ALL_EMPLOYEES",
    isInvitable: true,
    facilitatorUserId: outsider.id,
  },
  outsider,
);
assert.equal(outsiderSession.code, 0);
assert.equal(
  (await restrictedService.changeSessionStatus(outsiderSession.data!.id, "READY", actor)).code,
  404,
  "范围外课程安排不能推进状态",
);
assert.equal(
  (await restrictedService.updateTask(outsiderSession.data!.tasks[0].id, { status: "IN_PROGRESS" }, actor)).code,
  404,
  "范围外课程任务不能更新",
);
const restrictedSessionReader = {
  ...actor,
  permissions: [{ module: PERMISSION_KEYS.ACADEMY_SESSION_MANAGE, actions: ["read"] }],
};
assert.equal(
  (await (restrictedService as any).listTaskAttachments(outsiderSession.data!.tasks[0].id, restrictedSessionReader)).code,
  404,
  "课程运营管理员不得按任务ID读取数据范围外附件",
);
assert.equal(
  (await restrictedService.saveReview({ sessionId: outsiderSession.data!.id, summary: "越权复盘" }, actor)).code,
  404,
  "范围外课程结果不能保存",
);
const firstInviteService = createAcademyService(repository, {
  now: () => new Date("2026-08-08T09:00:00.000Z"),
  resolveScope: async () => ({ unrestricted: false, visibleUserIds: [actor.id] }),
  resolveCustomer: async (id) => id === "cust-first" ? {
    id,
    name: "首次邀约客户",
    ownerUserId: actor.id,
    ownerUserName: actor.name,
    isPublicPool: false,
  } : null,
});
assert.equal(
  (await firstInviteService.saveEngagement({
    sessionId: outsiderSession.data!.id,
    customerId: "cust-first",
    invitationStatus: "INVITED",
  }, actor)).code,
  0,
  "销售无需已有学员记录，也能向公开课程安排发起首次邀约",
);

const invalidSession = await service.createSession(
  {
    courseId: courseResult.data!.id,
    title: "无效场次",
    startsAt: "2026-08-10T10:00:00.000Z",
    endsAt: "2026-08-10T09:00:00.000Z",
    venue: "线上",
    capacity: 20,
  },
  actor,
);
assert.equal(
  invalidSession.code,
  400,
  "结束时间早于开始时间时必须拒绝创建场次",
);

const minimalSession = await service.createSession(
  {
    courseId: courseResult.data!.id,
    title: "默认全员可邀约课程安排",
    startsAt: "2026-08-18T09:00:00.000Z",
    endsAt: "2026-08-18T11:00:00.000Z",
    venue: "极享直播间",
    capacity: 20,
    projectOwnerUserId: actor.id,
    contentOwnerUserId: actor.id,
    materialOwnerUserId: actor.id,
    reviewOwnerUserId: actor.id,
  },
  actor,
);
assert.equal(minimalSession.code, 0);
assert.equal(minimalSession.data?.audience, "ALL_EMPLOYEES", "新建课程安排缺省应在全员周历展示");
assert.equal(minimalSession.data?.isInvitable, true, "新建课程安排缺省应允许销售邀约");
assert.equal((await service.saveEngagement({ sessionId: minimalSession.data!.id, customerId: "cust-100", invitationStatus: "INVITED" }, actor)).code, 0, "默认课程安排应可直接首次邀约CRM客户");

const sessionResult = await service.createSession(
  {
    courseId: courseResult.data!.id,
    title: "8月公开课第一场",
    startsAt: "2026-08-10T09:00:00.000Z",
    endsAt: "2026-08-10T11:00:00.000Z",
    venue: "极享直播间",
    capacity: 20,
    deliveryMode: "LIVE",
    audience: "ALL_EMPLOYEES",
    isInvitable: true,
    facilitatorUserId: actor.id,
    projectOwnerUserId: actor.id,
    contentOwnerUserId: "user-content",
    materialOwnerUserId: "user-material",
    lecturerUserId: "user-lecturer",
    reviewOwnerUserId: "user-review",
  },
  actor,
);
assert.equal(sessionResult.code, 0);
assert.equal(sessionResult.data?.tasks[0]?.assigneeUserName, actor.name);
assert.ok(sessionResult.data?.tasks[0]?.dueAt instanceof Date);
assert.match(sessionResult.data?.tasks[0]?.acceptanceCriteria || "", /课程目标/);
assert.equal(
  "dueOffsetMinutes" in (sessionResult.data?.tasks[0] || {}),
  false,
  "任务模板的截止时间偏移只用于计算，不得泄漏到持久化任务记录",
);
assert.deepEqual(
  sessionResult.data?.tasks.map((task: any) => task.templateKey),
  [
    "COURSE_CONFIRMATION",
    "COURSE_DEVELOPMENT",
    "COURSE_PACKAGING",
    "CUSTOMER_INVITATION",
    "PRECLASS_GATE",
    "COURSE_DELIVERY",
    "CUSTOMER_SEGMENTATION",
    "DEAL_FOLLOW_UP",
    "COURSE_REVIEW",
  ],
  "新课程安排必须生成T-5至T+3的固定九节点SOP",
);
assert.deepEqual(
  Object.fromEntries(sessionResult.data!.tasks.map((task: any) => [task.templateKey, task.assigneeUserId])),
  {
    COURSE_CONFIRMATION: actor.id,
    COURSE_DEVELOPMENT: "user-content",
    COURSE_PACKAGING: "user-material",
    CUSTOMER_INVITATION: actor.id,
    PRECLASS_GATE: actor.id,
    COURSE_DELIVERY: "user-lecturer",
    CUSTOMER_SEGMENTATION: actor.id,
    DEAL_FOLLOW_UP: actor.id,
    COURSE_REVIEW: "user-review",
  },
  "创建课程安排时的具体负责人必须真正落到对应SOP节点，不得全部默认项目负责人",
);
assert.equal(sessionResult.data?.tasks.find((task: any) => task.templateKey === "COURSE_CONFIRMATION")?.dueAt?.toISOString(), "2026-08-05T09:00:00.000Z");
assert.equal(sessionResult.data?.tasks.find((task: any) => task.templateKey === "COURSE_REVIEW")?.dueAt?.toISOString(), "2026-08-13T11:00:00.000Z");

const taskAuthorizationSession = await repository.createSession({
  ...sessionResult.data!,
  id: "task-authorization-session",
} as any, [{
  ...sessionResult.data!.tasks.find((task: any) => task.templateKey === "COURSE_DELIVERY")!,
  id: "task-authorization-task",
  sessionId: "task-authorization-session",
  status: "PENDING",
  assigneeUserId: "task-worker",
  assigneeUserName: "任务执行人",
} as any]);
const taskWorker = { ...actor, id: "task-worker", name: "任务执行人", permissions: [] };
const taskManager = actor;
assert.equal(
  (await service.updateTask(taskAuthorizationSession.tasks[0].id, { status: "IN_PROGRESS" }, taskManager)).code,
  403,
  "SESSION管理员不得代员工开始任务",
);
assert.equal((await service.updateTask(taskAuthorizationSession.tasks[0].id, { status: "IN_PROGRESS" }, taskWorker)).code, 0);
assert.equal(
  (await service.updateTask(taskAuthorizationSession.tasks[0].id, { status: "SUBMITTED", submissionNote: "管理员代交" }, taskManager)).code,
  403,
  "SESSION管理员不得代员工提交验收",
);
assert.equal(
  (await service.updateTask(taskAuthorizationSession.tasks[0].id, { status: "SUBMITTED", submissionNote: "本人已完成" }, taskWorker)).code,
  0,
);
assert.equal(
  (await service.updateTask(taskAuthorizationSession.tasks[0].id, { status: "DONE", reviewNote: "试图自审" }, taskWorker)).code,
  403,
  "任务执行人不得自行验收通过",
);
assert.equal(
  (await service.updateTask(taskAuthorizationSession.tasks[0].id, { status: "DONE", reviewNote: "验收通过" }, taskManager)).code,
  0,
  "SESSION管理员只在任务已提交后验收",
);

const nextStep = await (service as any).getSessionNextStep(sessionResult.data!.id, actor);
assert.equal(nextStep.code, 0);
assert.equal(nextStep.data?.task.templateKey, "COURSE_CONFIRMATION", "无逾期任务时应推荐最近到期的未完成SOP节点");
assert.equal(nextStep.data?.reason, "OVERDUE");
assert.equal(
  ((await (service as any).listMyTasks({ page: 1, pageSize: 10, status: "OPEN" }, { ...actor, id: "user-content", name: "课程内容负责人" })).data?.items || []).some(
    (task: any) => task.templateKey === "COURSE_DEVELOPMENT",
  ),
  true,
  "OPEN待办必须包含未关闭的本人SOP任务",
);

const contentTask = sessionResult.data!.tasks.find((task: any) => task.templateKey === "COURSE_DEVELOPMENT")!;
const contentOwner = { ...actor, id: "user-content", name: "课程内容负责人", permissions: [] };
businessAttachments.get("task-file-1")!.draftKey = `academy-task:${contentTask.id}`;
assert.equal((await (service as any).listTaskAttachments(contentTask.id, contentOwner)).code, 0, "任务负责人可查看本人交付附件");
assert.equal((await (service as any).replaceTaskAttachments(contentTask.id, { attachmentIds: ["task-file-1"] }, contentOwner)).code, 0, "任务负责人可关联已上传的交付附件");
assert.equal((await (service as any).listTaskAttachments(contentTask.id, { ...contentOwner, id: "user-outsider" })).code, 404, "他人不得枚举任务附件");
const wrongTaskAttachment = { ...businessAttachments.get("task-file-2"), id: "wrong-task-file", uploadedById: contentOwner.id, draftKey: "academy-task:another-task" };
businessAttachments.set("wrong-task-file", wrongTaskAttachment);
assert.equal(
  (await (service as any).replaceTaskAttachments(contentTask.id, { attachmentIds: ["task-file-1", "wrong-task-file"] }, contentOwner)).code,
  404,
  "不得关联其他任务的附件ID",
);
businessAttachments.set("wrong-category-file", { ...wrongTaskAttachment, id: "wrong-category-file", draftKey: `academy-task:${contentTask.id}`, category: "academy-course-asset" });
assert.equal(
  (await (service as any).replaceTaskAttachments(contentTask.id, { attachmentIds: ["task-file-1", "wrong-category-file"] }, contentOwner)).code,
  404,
  "不得把课程资产伪造为任务交付证据",
);
const reassignedContentOwner = { ...contentOwner, id: "user-content-new", name: "新内容负责人" };
(await repository.findTaskById(contentTask.id))!.assigneeUserId = reassignedContentOwner.id;
(await repository.findTaskById(contentTask.id))!.assigneeUserName = reassignedContentOwner.name;
businessAttachments.set("task-file-new-owner", {
  ...businessAttachments.get("task-file-1"), id: "task-file-new-owner", uploadedById: reassignedContentOwner.id,
  uploadedByName: reassignedContentOwner.name, draftKey: `academy-task:${contentTask.id}`,
});
assert.equal(
  (await (service as any).replaceTaskAttachments(contentTask.id, { attachmentIds: ["task-file-1", "task-file-new-owner"] }, reassignedContentOwner)).code,
  0,
  "任务重分配后新负责人应保留旧证据并追加自己的附件",
);
assert.equal(
  (await (service as any).replaceTaskAttachments(contentTask.id, { attachmentIds: ["task-file-new-owner"] }, reassignedContentOwner)).code,
  403,
  "新负责人不得移除旧负责人的审计证据",
);
(await repository.findTaskById(contentTask.id))!.assigneeUserId = contentOwner.id;
(await repository.findTaskById(contentTask.id))!.assigneeUserName = contentOwner.name;

const materialTask = sessionResult.data!.tasks.find((task: any) => task.templateKey === "COURSE_PACKAGING")!;
const materialOwner = { ...actor, id: "user-material", name: "素材负责人", permissions: [] };
businessAttachments.get("task-file-2")!.draftKey = `academy-task:${materialTask.id}`;
assert.equal((await service.updateTask(materialTask.id, { status: "IN_PROGRESS" }, materialOwner)).code, 0);
assert.equal(
  (await service.updateTask(materialTask.id, { status: "SUBMITTED", submissionNote: "包装素材已完成" }, materialOwner)).code,
  409,
  "课程包装任务没有绑定交付附件时不得提交验收",
);
assert.equal((await (service as any).replaceTaskAttachments(materialTask.id, { attachmentIds: ["task-file-2"] }, materialOwner)).code, 0);
assert.equal(
  (await service.updateTask(materialTask.id, { status: "SUBMITTED", submissionNote: "包装素材已完成" }, materialOwner)).code,
  0,
  "绑定交付附件后可提交验收",
);
assert.equal(
  (await (service as any).replaceTaskAttachments(materialTask.id, { attachmentIds: [] }, materialOwner)).code,
  409,
  "提交验收后附件关联必须冻结",
);

const legacyEvidenceRepository = createRepository();
const legacyEvidenceService = createAcademyService(legacyEvidenceRepository, {
  resolveScope: async () => ({ unrestricted: true, visibleUserIds: [contentOwner.id] }),
});
for (const templateKey of ["CONTENT", "ASSETS"]) {
  const legacyTask = await legacyEvidenceRepository.createSession({
    ...sessionResult.data!, id: `legacy-session-${templateKey}`, createdById: contentOwner.id,
  } as any, [{
    ...contentTask, id: `legacy-task-${templateKey}`, sessionId: `legacy-session-${templateKey}`,
    templateKey, status: "IN_PROGRESS", assigneeUserId: contentOwner.id,
  } as any]);
  assert.equal(
    (await legacyEvidenceService.updateTask(legacyTask.tasks[0].id, { status: "SUBMITTED", submissionNote: "旧任务完成" }, contentOwner)).code,
    409,
    `历史${templateKey}任务也必须上传交付附件`,
  );
}

const prematureReady = await service.changeSessionStatus(
  sessionResult.data!.id,
  "READY",
  actor,
);
assert.equal(prematureReady.code, 409, "必做准备项未完成时不能进入已就绪");

const invalidTaskTransition = await service.updateTask(
  sessionResult.data!.tasks[0].id,
  { status: "DONE" },
  actor,
);
assert.equal(invalidTaskTransition.code, 409, "待处理任务不能绕过执行与验收直接完成");

for (const task of sessionResult.data!.tasks.filter(
  (item: any) => item.category === "BEFORE" && ![contentTask.id, materialTask.id].includes(item.id),
)) {
  const taskActor = task.assigneeUserId === actor.id
    ? actor
    : { ...actor, id: task.assigneeUserId, name: task.assigneeUserName, permissions: [] };
  const started = await service.updateTask(
    task.id,
    { status: "IN_PROGRESS" },
    taskActor,
  );
  assert.equal(started.code, 0);
  if (TASKS_REQUIRING_EVIDENCE_FOR_TEST.has(task.templateKey) && !(await repository.listTaskAttachments(task.id)).length) {
    const evidenceId = `loop-evidence-${task.id}`;
    businessAttachments.set(evidenceId, {
      id: evidenceId, name: "交付文件.pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      size: 1024, category: "academy-task-evidence", uploadedById: taskActor.id, uploadedByName: taskActor.name,
      uploadedAt: "2026-08-08T09:00:00.000Z", draftKey: `academy-task:${task.id}`,
    });
    assert.equal((await (service as any).replaceTaskAttachments(task.id, { attachmentIds: [evidenceId] }, taskActor)).code, 0);
  }
  const submitted = await service.updateTask(
    task.id,
    { status: "SUBMITTED", submissionNote: "已按验收标准完成" },
    taskActor,
  );
  assert.equal(submitted.code, 0);
  const completed = await service.updateTask(
    task.id,
    { status: "DONE", reviewNote: "验收通过" },
    actor,
  );
  assert.equal(completed.code, 0);
}
assert.equal((await service.updateTask(contentTask.id, { status: "IN_PROGRESS" }, contentOwner)).code, 0);
assert.equal((await service.updateTask(contentTask.id, { status: "SUBMITTED", submissionNote: "课程研发已完成" }, contentOwner)).code, 0);
assert.equal((await service.updateTask(contentTask.id, { status: "DONE", reviewNote: "验收通过" }, actor)).code, 0);
assert.equal((await service.updateTask(materialTask.id, { status: "DONE", reviewNote: "验收通过" }, actor)).code, 0);
const ready = await service.changeSessionStatus(
  sessionResult.data!.id,
  "READY",
  actor,
);
assert.equal(ready.code, 0);
assert.equal(ready.data?.status, "READY");

const engagement = await service.saveEngagement(
  {
    sessionId: sessionResult.data!.id,
    participantKey: "customer:cust-100",
    customerId: "cust-100",
    participantName: "测试客户",
    invitationStatus: "CONFIRMED",
    attendanceStatus: "ATTENDED",
    interactionLevel: "HIGH",
    courseAssessment: "A",
    followUpStatus: "PENDING",
  },
  actor,
);
assert.equal(engagement.code, 0);
assert.equal(engagement.data?.attendanceStatus, "UNKNOWN", "销售邀约不能直接写入到课状态");
assert.equal(engagement.data?.courseAssessment, null, "销售邀约不能直接写入课程评估");
assert.equal(engagement.data?.participantName, "CRM测试客户", "学员名称必须来自服务端可信 CRM 数据");

const duplicateSingleInvite = await service.saveEngagement({
  sessionId: sessionResult.data!.id,
  customerId: "cust-100",
  invitationStatus: "PENDING",
}, actor);
assert.equal(duplicateSingleInvite.code, 409, "单条邀约接口也不得覆盖已有客户状态");
assert.equal((await repository.findEngagementById(engagement.data!.id))?.invitationStatus, "CONFIRMED");

const batchEngagements = await (service as any).saveEngagementBatch({
  sessionId: sessionResult.data!.id,
  customerIds: ["cust-batch", "cust-hidden", "cust-batch"],
}, actor);
assert.equal(batchEngagements.code, 0);
assert.equal(batchEngagements.data?.created.length, 1, "批量邀约应去重后创建当前销售可见客户");
assert.equal(batchEngagements.data?.created[0]?.invitationStatus, "PENDING", "新加入名单的客户必须统一进入待邀约");
assert.deepEqual(batchEngagements.data?.rejected, [{ customerId: "cust-hidden", message: "客户不存在或无权访问" }]);

const duplicateBatch = await (service as any).saveEngagementBatch({
  sessionId: sessionResult.data!.id,
  customerIds: ["cust-100"],
}, actor);
assert.equal(duplicateBatch.data?.created.length, 0, "已有客户不得重复加入名单");
assert.equal(duplicateBatch.data?.rejected[0]?.message, "客户已在本课程名单");
assert.equal((await repository.findEngagementById(engagement.data!.id))?.invitationStatus, "CONFIRMED", "重复批量邀约不得重置已有邀约状态");

const quickFollowUp = await (service as any).quickFollowUp(engagement.data!.id, {
  content: "客户对AI企业升级计划感兴趣",
  invitationStatus: "INVITED",
  courseAssessment: "A",
  nextFollowUpAt: "2026-08-09T09:00:00.000Z",
}, actor);
assert.equal(quickFollowUp.code, 0);
assert.equal(quickFollowUp.data?.courseAssessment, "A");
assert.equal(quickFollowUp.data?.invitationStatus, "INVITED");
assert.equal(quickFollowUp.data?.followUpStatus, "IN_PROGRESS");
assert.equal(quickFollowUp.data?.notes, "客户对AI企业升级计划感兴趣", "学院端应展示已同步CRM的最近跟进摘要");

const failingCrmService = createAcademyService(repository, {
  now: () => new Date("2026-08-08T09:00:00.000Z"),
  resolveScope: async () => ({ unrestricted: true, visibleUserIds: [actor.id] }),
  resolveCustomer: async (id) => id === "cust-100" ? { id, name: "CRM测试客户", ownerUserId: actor.id, ownerUserName: actor.name, isPublicPool: false } : null,
  addCustomerFollowUp: async () => ({ code: 403, message: "无权编辑客户资料", data: null }),
});
const beforeFailedFollowUp = { ...(await repository.findEngagementById(engagement.data!.id))! };
const failedFollowUp = await (failingCrmService as any).quickFollowUp(engagement.data!.id, { content: "试图越权跟进", courseAssessment: "B" }, actor);
assert.equal(failedFollowUp.code, 403, "商学院快速跟进不得绕过CRM客户编辑权限");
assert.equal((await repository.findEngagementById(engagement.data!.id))?.courseAssessment, beforeFailedFollowUp.courseAssessment, "CRM跟进失败时不得部分更新商学院快照");

let invalidFollowUpCrmWrites = 0;
const validatingFollowUpService = createAcademyService(repository, {
  now: () => new Date("2026-08-08T09:00:00.000Z"),
  resolveScope: async () => ({ unrestricted: true, visibleUserIds: [actor.id] }),
  resolveCustomer: async (id) => id === "cust-100" ? { id, name: "CRM测试客户", ownerUserId: actor.id, ownerUserName: actor.name, isPublicPool: false } : null,
  addCustomerFollowUp: async () => (invalidFollowUpCrmWrites += 1, { code: 0, message: "success", data: null }),
});
assert.equal((await (validatingFollowUpService as any).quickFollowUp(engagement.data!.id, { content: "无效输入", nextFollowUpAt: "not-a-date" }, actor)).code, 400);
assert.equal((await (validatingFollowUpService as any).quickFollowUp(engagement.data!.id, { content: "无效输入", courseAssessment: "S" }, actor)).code, 400);
assert.equal(invalidFollowUpCrmWrites, 0, "快速跟进必须在写入CRM之前完成全部输入校验，避免修正重试产生重复跟进记录");

const invalidExecution = await service.updateEngagementExecution(
  engagement.data!.id,
  { attendanceStatus: "ATTENDED", interactionLevel: "VERY_HIGH", courseAssessment: "S" },
  actor,
);
assert.equal(invalidExecution.code, 400, "课堂执行字段必须由服务端限制在允许枚举内");

const executed = await service.updateEngagementExecution(
  engagement.data!.id,
  { attendanceStatus: "ATTENDED", interactionLevel: "HIGH", courseAssessment: "A" },
  actor,
);
assert.equal(executed.code, 0);
assert.equal(executed.data?.attendanceStatus, "ATTENDED");
assert.equal(executed.data?.courseAssessment, "A");

const invisibleCustomer = await service.saveEngagement(
  {
    sessionId: sessionResult.data!.id,
    participantKey: "customer:cust-hidden",
    customerId: "cust-hidden",
    participantName: "伪造客户",
  },
  actor,
);
assert.equal(invisibleCustomer.code, 404, "销售不能邀约实时 CRM 范围外的客户");

const linkedOrder = await service.linkEngagementOrder(
  engagement.data!.id,
  { orderId: "order-100", orderNo: "ORD-20260808-001" },
  actor,
);
assert.equal(linkedOrder.code, 0);
assert.equal(linkedOrder.data?.orderNo, "ORD-20260808-001");
assert.equal(linkedOrder.data?.handoffStatus, "ORDER_LINKED");
assert.equal(linkedOrder.data?.followUpStatus, "DONE");

const transferredCustomerService = createAcademyService(repository, {
  now: () => new Date("2026-08-08T09:00:00.000Z"),
  resolveScope: async () => ({ unrestricted: true, visibleUserIds: [actor.id] }),
  resolveCustomer: async () => null,
  resolveOrder: async (id) => id === "order-100" ? { id, orderNo: "ORD-20260808-001", customerId: "cust-100" } : null,
});
assert.equal(
  (await transferredCustomerService.linkEngagementOrder(engagement.data!.id, { orderId: "order-100" }, actor)).code,
  404,
  "客户转让后旧销售不能继续关联订单",
);

assert.equal((await service.changeSessionStatus(sessionResult.data!.id, "IN_PROGRESS", actor)).code, 0);

const editedAfterHandoff = await (service as any).quickFollowUp(engagement.data!.id, {
  content: "完成二次回访",
  invitationStatus: "CONFIRMED",
  courseAssessment: "A",
}, actor);
assert.equal(editedAfterHandoff.data?.orderId, "order-100");
assert.equal(editedAfterHandoff.data?.handoffStatus, "ORDER_LINKED");
assert.equal(editedAfterHandoff.code, 0, "课程开始后已有学员仍可继续维护销售跟进");

businessAttachments.get("attachment-1")!.draftKey = `academy-course-${courseResult.data!.id}-PPT`;
const savedAsset = await service.saveCourseAsset(
  courseResult.data!.id,
  {
    assetType: "PPT",
    title: "AI企业升级公开课课件",
    attachments: [
      {
        id: "attachment-1",
        category: "academy-course-asset",
        name: "课程课件.pptx",
        mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        size: 1024,
        uploadedById: actor.id,
        uploadedByName: actor.name,
        uploadedAt: "2026-08-08T09:00:00.000Z",
      },
    ],
  },
  actor,
);
assert.equal(savedAsset.code, 0);
assert.equal(savedAsset.data?.courseVersionId, `version-${courseResult.data!.id}`);
assert.deepEqual(
  Object.keys(savedAsset.data!.attachments[0]).sort(),
  ["category", "id", "mimeType", "name", "size", "uploadedAt", "uploadedById", "uploadedByName"].sort(),
  "课程资产只持久化服务端真实附件的安全投影",
);
businessAttachments.set("other-course-asset", {
  ...businessAttachments.get("attachment-1"), id: "other-course-asset", draftKey: "academy-course-other-course-PPT",
});
assert.equal(
  (await service.saveCourseAsset(courseResult.data!.id, {
    assetType: "PPT", title: "伪造课件", attachments: [{ id: "other-course-asset", category: "academy-course-asset" }],
  }, actor)).code,
  404,
  "不得把其他课程的真实附件ID注入当前课程资产",
);
assert.equal(
  (await service.saveCourseAsset(courseResult.data!.id, {
    assetType: "PPT", title: "虚假课件", attachments: [{
      id: "missing-course-asset", category: "academy-course-asset", name: "客户端伪造.pptx",
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", size: 1,
      uploadedById: actor.id, uploadedByName: actor.name, uploadedAt: "2026-08-08T09:00:00.000Z",
    }],
  }, actor)).code,
  404,
  "不得信任客户端传入的附件元数据",
);
const listedAssets = await service.listCourseAssets(courseResult.data!.id, actor);
assert.equal(listedAssets.data?.length, 1);

const detail = await service.getSessionDetail(sessionResult.data!.id, actor);
assert.equal(detail.code, 0);
assert.equal(detail.data?.tasks.length, 9);
assert.equal(detail.data?.engagements.length, 2);

const viewer = {
  ...actor,
  id: "user-viewer",
  name: "普通员工",
  role: "普通员工",
  permissions: [{ module: PERMISSION_KEYS.ACADEMY_VIEW, actions: ["read"] }],
};
const viewerService = createAcademyService(repository, {
  now: () => new Date("2026-08-08T09:00:00.000Z"),
  resolveScope: async () => ({ unrestricted: false, visibleUserIds: [actor.id] }),
});
const viewerTasks = await (viewerService as any).listMyTasks({ page: 1, pageSize: 10 }, viewer);
assert.equal(viewerTasks.code, 0);
assert.deepEqual(viewerTasks.data, { items: [], total: 0, page: 1, pageSize: 10 }, "普通在职账号无需商学院页面权限也能读取仅属于自己的待办");
const assignedEmployee = { ...viewer, id: "user-lecturer", name: "课程讲师", permissions: [] };
const assignedTask = sessionResult.data!.tasks.find((task: any) => task.templateKey === "COURSE_DELIVERY")!;
assert.equal(
  (await viewerService.updateTask(assignedTask.id, { status: "IN_PROGRESS" }, assignedEmployee)).code,
  0,
  "无商学院页面权限的员工仍必须能推进分配给自己的任务",
);
assert.equal(
  (await viewerService.updateTask(sessionResult.data!.tasks.find((task: any) => task.templateKey === "COURSE_REVIEW")!.id, { status: "IN_PROGRESS" }, assignedEmployee)).code,
  404,
  "无管理权的员工不得操作别人的课程任务",
);
const viewerDetail = await viewerService.getSessionDetail(sessionResult.data!.id, viewer);
assert.equal(viewerDetail.code, 0);
assert.deepEqual(viewerDetail.data?.engagements, [], "普通员工查看课程安排时不得获得客户及转化明细");
const salesOnly = {
  ...viewer,
  id: "user-sales-only",
  name: "其他销售",
  permissions: [
    { module: PERMISSION_KEYS.ACADEMY_VIEW, actions: ["read"] },
    { module: PERMISSION_KEYS.ACADEMY_ENGAGEMENT_MANAGE, actions: ["read", "write"] },
  ],
};
assert.deepEqual(
  (await viewerService.getSessionDetail(sessionResult.data!.id, salesOnly)).data?.engagements,
  [],
  "销售详情必须逐条经过实时 CRM 范围过滤，不能看到同课程其他销售客户",
);

const operator = {
  ...viewer,
  id: "user-operator",
  name: "课程运营",
  permissions: [
    { module: PERMISSION_KEYS.ACADEMY_VIEW, actions: ["read"] },
    { module: PERMISSION_KEYS.ACADEMY_SESSION_MANAGE, actions: ["read", "write"] },
  ],
};
const operatorDetail = await viewerService.getSessionDetail(sessionResult.data!.id, operator);
assert.equal(operatorDetail.data?.engagements[0]?.participantName, "CRM测试客户");
assert.equal(operatorDetail.data?.engagements[0]?.customerId, null, "课程运营不得获得 CRM 客户ID");
assert.equal(operatorDetail.data?.engagements[0]?.orderId, null, "课程运营不得获得销售订单信息");

const dashboard = await service.getDashboard(actor);
assert.equal(dashboard.code, 0);
assert.equal(dashboard.data?.sessionsNeedingAttention, 0);
assert.equal(dashboard.data?.pendingFollowUps, 3, "已关联订单不再计入待跟进，三条未成交邀约记录应保留待跟进");

const publicCalendar = await (service as any).listPublicCalendar({
  start: "2026-08-01T00:00:00.000Z",
  end: "2026-08-31T23:59:59.999Z",
}, viewer);
assert.equal(publicCalendar.code, 0);
assert.ok(
  publicCalendar.data.some((item: any) => item.id === outsiderSession.data!.id),
  "全员周历必须包含范围外的商学院课程安排",
);
assert.deepEqual(
  Object.keys(publicCalendar.data[0]).sort(),
  ["courseTitle", "deliveryMode", "endsAt", "id", "lecturerUserName", "startsAt", "status", "title"].sort(),
  "全员周历只能返回不含任务、客户、会议链接和人员ID的安全投影",
);

console.log("academy service tests passed");
