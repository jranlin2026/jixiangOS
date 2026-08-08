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
  const sessions: any[] = [];
  const tasks: any[] = [];
  const engagements: any[] = [];
  const reviews: any[] = [];
  return {
    listCourses: async ({ page, pageSize }) => ({
      items: courses.slice((page - 1) * pageSize, page * pageSize),
      total: courses.length,
    }),
    findCourseByCode: async (code) =>
      courses.find((course) => course.code === code) || null,
    findCourseById: async (id) =>
      courses.find((course) => course.id === id) || null,
    findLatestCourseVersionId: async (courseId) =>
      courses.some((course) => course.id === courseId)
        ? `version-${courseId}`
        : null,
    createCourse: async (course) => (courses.push(course), course),
    createCourseVersion: async (version) => version,
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

const courseResult = await service.createCourse(
  {
    code: "AI-OPEN-01",
    title: "AI企业升级公开课",
    category: "公开课",
    summary: "帮助企业老板理解AI升级路径",
    defaultDurationMinutes: 120,
    objectives: ["识别企业AI升级机会"],
  },
  actor,
);
assert.equal(courseResult.code, 0);
assert.equal(courseResult.data?.status, "DRAFT");

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

const duplicateCourse = await service.createCourse(
  {
    code: " ai-open-01 ",
    title: "重复课程",
    category: "公开课",
    summary: "",
    defaultDurationMinutes: 60,
    objectives: [],
  },
  actor,
);
assert.equal(
  duplicateCourse.code,
  409,
  "课程编码应在去空格和大小写归一后保持唯一",
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

for (const task of sessionResult.data!.tasks.filter(
  (item: any) => item.category === "BEFORE",
)) {
  const completed = await service.updateTask(
    task.id,
    { status: "DONE", note: "已完成" },
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

const detail = await service.getSessionDetail(sessionResult.data!.id, actor);
assert.equal(detail.code, 0);
assert.equal(detail.data?.tasks.length, 9);
assert.equal(detail.data?.engagements.length, 1);

const dashboard = await service.getDashboard(actor);
assert.equal(dashboard.code, 0);
assert.equal(dashboard.data?.sessionsNeedingAttention, 1);
assert.equal(dashboard.data?.pendingFollowUps, 1);

console.log("academy service tests passed");
