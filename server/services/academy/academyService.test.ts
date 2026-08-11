import assert from "node:assert/strict";
import { createAcademyService, type AcademyRepository } from "./academyService";

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

function createRepository(): AcademyRepository {
  const courses: any[] = [];
  const courseVersions: any[] = [];
  const categories: any[] = [];
  const assets: any[] = [];
  const sessions: any[] = [];
  const tasks: any[] = [];
  const engagements: any[] = [];
  const reviews: any[] = [];
  const users = [
    { id: actor.id, name: actor.name },
    { id: "user-lecturer", name: "课程讲师" },
  ];
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
    findCourseById: async (id) =>
      courses.find((course) => course.id === id) || null,
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
    findSessionById: async (id) =>
      sessions.find((session) => session.id === id) || null,
    getSessionDetail: async (id) => {
      const session = sessions.find((item) => item.id === id);
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
    findTaskById: async (id) => tasks.find((task) => task.id === id) || null,
    updateTaskStatus: async (id, update) => {
      const task = tasks.find((item) => item.id === id);
      if (!task) return null;
      Object.assign(task, update);
      return task;
    },
    upsertEngagement: async (engagement) => {
      const index = engagements.findIndex(
        (item) =>
          item.sessionId === engagement.sessionId &&
          item.participantKey === engagement.participantKey,
      );
      if (index >= 0)
        engagements[index] = { ...engagements[index], ...engagement };
      else engagements.push(engagement);
      return index >= 0 ? engagements[index] : engagement;
    },
    findEngagementById: async (id) =>
      engagements.find((engagement) => engagement.id === id) || null,
    findEngagementByKey: async (sessionId, participantKey) =>
      engagements.find(
        (engagement) =>
          engagement.sessionId === sessionId && engagement.participantKey === participantKey,
      ) || null,
    findOrderById: async (id) =>
      id === "order-100"
        ? { id, orderNo: "ORD-20260808-001", customerId: "cust-100" }
        : null,
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
const service = createAcademyService(repository, {
  now: () => new Date("2026-08-08T09:00:00.000Z"),
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

const sessionResult = await service.createSession(
  {
    courseId: courseResult.data!.id,
    title: "8月公开课第一场",
    startsAt: "2026-08-10T09:00:00.000Z",
    endsAt: "2026-08-10T11:00:00.000Z",
    venue: "极享直播间",
    capacity: 20,
  },
  actor,
);
assert.equal(sessionResult.code, 0);
assert.equal(sessionResult.data?.tasks[0]?.assigneeUserName, actor.name);
assert.ok(sessionResult.data?.tasks[0]?.dueAt instanceof Date);
assert.match(sessionResult.data?.tasks[0]?.acceptanceCriteria || "", /课程目标/);
assert.deepEqual(
  sessionResult.data?.tasks.map((task: any) => task.templateKey),
  [
    "PLANNING",
    "CONTENT",
    "ASSETS",
    "INVITATION",
    "PRECHECK",
    "DELIVERY",
    "SEGMENTATION",
    "FOLLOW_UP",
    "REVIEW",
  ],
  "新场次必须自动生成从课程规划到经营复盘的九阶段执行清单",
);

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
  (item: any) => item.category === "BEFORE",
)) {
  const started = await service.updateTask(
    task.id,
    { status: "IN_PROGRESS" },
    actor,
  );
  assert.equal(started.code, 0);
  const submitted = await service.updateTask(
    task.id,
    { status: "SUBMITTED", submissionNote: "已按验收标准完成" },
    actor,
  );
  assert.equal(submitted.code, 0);
  const completed = await service.updateTask(
    task.id,
    { status: "DONE", reviewNote: "验收通过" },
    actor,
  );
  assert.equal(completed.code, 0);
}
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
assert.equal(engagement.data?.courseAssessment, "A");

const linkedOrder = await service.linkEngagementOrder(
  engagement.data!.id,
  { orderId: "order-100", orderNo: "ORD-20260808-001" },
  actor,
);
assert.equal(linkedOrder.code, 0);
assert.equal(linkedOrder.data?.orderNo, "ORD-20260808-001");
assert.equal(linkedOrder.data?.handoffStatus, "ORDER_LINKED");
assert.equal(linkedOrder.data?.followUpStatus, "DONE");

const editedAfterHandoff = await service.saveEngagement(
  {
    sessionId: sessionResult.data!.id,
    participantKey: "customer:cust-100",
    customerId: "cust-100",
    participantName: "测试客户",
    invitationStatus: "CONFIRMED",
    attendanceStatus: "ATTENDED",
    interactionLevel: "HIGH",
    courseAssessment: "A",
    followUpStatus: "DONE",
    notes: "完成二次回访",
  },
  actor,
);
assert.equal(editedAfterHandoff.data?.orderId, "order-100");
assert.equal(editedAfterHandoff.data?.handoffStatus, "ORDER_LINKED");

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
const listedAssets = await service.listCourseAssets(courseResult.data!.id, actor);
assert.equal(listedAssets.data?.length, 1);

const detail = await service.getSessionDetail(sessionResult.data!.id, actor);
assert.equal(detail.code, 0);
assert.equal(detail.data?.tasks.length, 9);
assert.equal(detail.data?.engagements.length, 1);

const dashboard = await service.getDashboard(actor);
assert.equal(dashboard.code, 0);
assert.equal(dashboard.data?.sessionsNeedingAttention, 1);
assert.equal(dashboard.data?.pendingFollowUps, 0, "订单交接完成后不应继续计入待跟进");

console.log("academy service tests passed");
