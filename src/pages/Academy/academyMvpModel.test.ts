import assert from "node:assert/strict";
import type {
  AcademySession,
  AcademySessionDetail,
  AcademySessionTask,
} from "../../types/academy";
import {
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
  { dashboard: true, courses: true, sessions: true, categories: false },
  "仅课程排期权限只应请求排期所需的课程列表和课程安排",
);
assert.deepEqual(
  getAcademyPrivateLoadPlan({ plan: false, course: false, session: false, engagement: true, review: false }),
  { dashboard: true, courses: false, sessions: true, categories: false },
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

assert.deepEqual(
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
  ].map((key) => getAcademyTaskStep(key).timeLabel),
  ["T-5", "T-4", "T-3", "T-2", "T-1", "T日", "T+0.5小时", "T+1", "T+3"],
  "固定SOP必须以T-5到T+3的业务时间轴展示",
);

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
  "我的待办只返回当前员工未完成的任务，并按截止时间排序",
);

console.log("academy MVP model tests passed");
