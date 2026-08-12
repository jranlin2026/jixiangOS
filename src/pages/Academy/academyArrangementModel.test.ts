import assert from "node:assert/strict";
import type { AcademySession, AcademySessionDetail } from "../../types/academy";
import { getArrangementNextAction, getArrangementTimingState } from "./AcademyPlans";

const session = {
  id: "session-1",
  courseId: "course-1",
  title: "AI实战课程安排",
  startsAt: "2026-08-12T10:00:00.000Z",
  endsAt: "2026-08-12T12:00:00.000Z",
  deliveryMode: "OFFLINE",
  venue: "极享教室",
  capacity: 30,
  inviteTarget: 20,
  registrationTarget: 15,
  attendanceTarget: 12,
  consultationTarget: 5,
  dealTarget: 2,
  targetRevenue: 20000,
  status: "PLANNED",
} satisfies AcademySession;

const detail = {
  ...session,
  tasks: [
    {
      id: "task-1",
      sessionId: session.id,
      templateKey: "PRECHECK",
      title: "开课准备",
      category: "BEFORE",
      isRequired: true,
      status: "PENDING",
    },
  ],
  engagements: [],
  review: null,
} satisfies AcademySessionDetail;

assert.equal(
  getArrangementNextAction(session, detail).label,
  "推进课程任务",
  "必做准备未完成时应引导完善准备",
);

assert.deepEqual(
  getArrangementTimingState({ ...session, endsAt: "2026-08-12T08:00:00.000Z" }, new Date("2026-08-12T10:00:00.000Z")),
  { overdue: true, label: "待确认结束 · 已超时2小时" },
  "授课结束时间已过但课程未完结时必须提醒负责人确认结束",
);
const readyDetail = {
  ...detail,
  tasks: detail.tasks.map((task) => ({ ...task, status: "DONE" as const })),
};
assert.equal(
  getArrangementNextAction({ ...session, status: "IN_PROGRESS" }, readyDetail).label,
  "结束课程",
  "进行中课程必须提供明确的结束操作",
);
assert.deepEqual(
  getArrangementNextAction(session, readyDetail),
  { label: "确认开课", nextStatus: "READY", tab: 0 },
  "必做准备完成后应允许确认开课",
);

assert.equal(
  getArrangementNextAction({ ...session, status: "READY" }, readyDetail).label,
  "进入课程执行",
  "待开课安排应进入课程执行",
);

assert.equal(
  getArrangementNextAction({ ...session, status: "COMPLETED" }, { ...readyDetail, status: "COMPLETED" }).label,
  "填写复盘结果",
  "课程完成且未复盘时应引导填写复盘",
);

assert.equal(
  getArrangementNextAction(
    { ...session, status: "COMPLETED" },
    {
      ...readyDetail,
      status: "COMPLETED",
      review: {
        id: "review-1",
        sessionId: session.id,
        summary: "完成良好",
        issues: "",
        improvements: "",
        metrics: {},
        actionItems: [],
        createdByName: "系统管理员",
        updatedAt: "2026-08-12T12:30:00.000Z",
      },
    },
  ).label,
  "查看复盘结果",
  "完成复盘后应展示课程结果",
);
assert.equal(
  getArrangementNextAction(
    { ...session, status: "COMPLETED" },
    { ...readyDetail, status: "COMPLETED", review: {
      id: "review-2", sessionId: session.id, summary: "完成", issues: "", improvements: "", metrics: {}, actionItems: [], createdByName: "管理员", updatedAt: "2026-08-12T12:30:00.000Z",
    } },
  ).tab,
  2,
  "复盘结果应定位到三页签抽屉的最后一页",
);

console.log("academy arrangement model tests passed");
