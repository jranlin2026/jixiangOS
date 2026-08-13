import assert from "node:assert/strict";
import type {
  AcademySession,
  AcademySessionDetail,
  AcademySessionTask,
} from "../../types/academy";
import {
  getAcademyPriorityTask,
  getAcademyWorkbenchSummary,
  getCoursePhaseProgress,
  getAcademyTaskStep,
  getAcademyPrivateLoadPlan,
  getMyAcademyTodos,
  getSessionNextStep,
  taskRequiresEvidence,
} from "./academyMvpModel";

assert.equal(taskRequiresEvidence("COURSE_DEVELOPMENT"), true, "课程研发必须上传交付文件");
assert.equal(taskRequiresEvidence("COURSE_PACKAGING"), true, "课程包装必须上传交付文件");
assert.equal(taskRequiresEvidence("CUSTOMER_INVITATION"), false, "客户邀约可仅填写完成说明");

assert.deepEqual(
  getAcademyPrivateLoadPlan({ plan: true, course: false, session: false, engagement: false, review: false }),
  { dashboard: true, courses: true, sessions: true, categories: false, templates: true },
  "仅课程排期权限应请求课程列表、课程安排和负责人动态分配所需模板",
);
assert.deepEqual(
  getAcademyPrivateLoadPlan({ plan: false, course: false, session: false, engagement: true, review: false }),
  { dashboard: true, courses: false, sessions: true, categories: false, templates: false },
  "仅邀约跟进权限不应请求课程库或分类管理数据",
);

const session = {
  id: "session-1",
  courseId: "course-1",
  title: "AI实战课程安排",
  startsAt: "2026-08-20T11:30:00.000Z",
  endsAt: "2026-08-20T13:30:00.000Z",
  deliveryMode: "LIVE",
  venue: "视频号直播间",
  capacity: 30,
  inviteTarget: 20,
  registrationTarget: 15,
  attendanceTarget: 12,
  consultationTarget: 5,
  dealTarget: 2,
  targetRevenue: 20_000,
  status: "PLANNED",
} satisfies AcademySession;

const task = (
  id: string,
  templateKey: string,
  status: AcademySessionTask["status"],
  dueAt: string,
  assigneeUserId = "user-me",
): AcademySessionTask => ({
  id,
  sessionId: session.id,
  templateKey,
  title: templateKey,
  category: templateKey.includes("REVIEW") ? "AFTER" : "BEFORE",
  isRequired: true,
  status,
  dueAt,
  assigneeUserId,
  assigneeUserName: assigneeUserId === "user-me" ? "我" : "其他人",
});

assert.equal(getAcademyTaskStep("CUSTOM_STEP").timeLabel, "未排序", "未持久化顺序的旧任务只能使用通用兼容展示，不得写死业务步骤");

const detail = {
  ...session,
  tasks: [
    task("task-done", "COURSE_CONFIRMATION", "DONE", "2026-08-15T10:00:00.000Z"),
    task("task-other", "COURSE_DEVELOPMENT", "PENDING", "2026-08-16T10:00:00.000Z", "user-other"),
    task("task-overdue", "COURSE_PACKAGING", "PENDING", "2026-08-17T10:00:00.000Z"),
    task("task-later", "CUSTOMER_INVITATION", "PENDING", "2026-08-18T10:00:00.000Z"),
  ],
  engagements: [],
  review: null,
} satisfies AcademySessionDetail;

assert.equal(
  getSessionNextStep(detail, new Date("2026-08-18T08:00:00.000Z"))?.task.id,
  "task-other",
  "下一步应优先指向最早逾期的必做节点",
);

assert.deepEqual(
  getMyAcademyTodos([detail], "user-me").map((item) => item.task.id),
  ["task-overdue", "task-later"],
  "待我处理只返回当前员工仍需操作的任务，已提交任务进入待验收，并按截止时间排序",
);

const workbenchTasks = [
  {
    ...task("task-today", "TODAY_TASK", "PENDING", "2026-08-18T09:00:00.000Z"),
    session,
  },
  {
    ...task("task-late", "LATE_TASK", "REJECTED", "2026-08-17T09:00:00.000Z"),
    session,
  },
];

assert.equal(
  getAcademyPriorityTask(workbenchTasks, new Date("2026-08-18T08:00:00.000Z"))?.id,
  "task-late",
  "我的下一步应优先显示已逾期或被驳回的本人任务",
);

assert.deepEqual(
  getAcademyWorkbenchSummary({
    openTaskTotal: 2,
    reviewTaskTotal: 1,
    sessions: [
      { startsAt: "2026-08-18T01:00:00.000Z", status: "READY" },
      { startsAt: session.startsAt, status: "IN_PROGRESS" },
    ],
    now: new Date("2026-08-18T08:00:00.000Z"),
  }),
  { openTaskTotal: 2, reviewTaskTotal: 1, todayCourseTotal: 1, activeCourseTotal: 1 },
  "工作台摘要应同时呈现本人任务和课程执行情况",
);

assert.deepEqual(
  getCoursePhaseProgress({
    ...session,
    tasks: [
      { taskId: "before-done", title: "BEFORE_DONE", category: "BEFORE", isRequired: true, stepNumber: 1, status: "DONE", isMine: true },
      { taskId: "before-open", title: "BEFORE_OPEN", category: "BEFORE", isRequired: true, stepNumber: 2, status: "PENDING", isMine: true },
      { taskId: "during", title: "DURING", category: "DURING", isRequired: true, stepNumber: 3, status: "PENDING", isMine: true },
    ],
  }),
  [
    { category: "BEFORE", label: "课前准备", done: 1, total: 2, percent: 50 },
    { category: "DURING", label: "课程执行", done: 0, total: 1, percent: 0 },
    { category: "AFTER", label: "课后跟进", done: 0, total: 0, percent: 0 },
  ],
  "课程进度应收敛为课前、课中、课后三阶段摘要",
);

console.log("academy MVP model tests passed");
