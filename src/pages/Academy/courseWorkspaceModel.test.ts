import assert from "node:assert/strict";
import type { AcademyCourse } from "../../types/academy";
import {
  clampPageIndex,
  getCourseStatusAction,
  replaceCourseById,
  updatePendingCourseIds,
} from "./courseWorkspaceModel";

const baseCourse: AcademyCourse = {
  id: "course-1",
  code: "AC-202608-ABC123",
  title: "AI实战",
  category: "公开课",
  summary: "",
  targetAudience: "实体店老板",
  customerProblem: "不会使用AI做增长",
  coreViewpoint: "用真实业务验证AI改造",
  conversionProductId: null,
  conversionProductName: null,
  defaultDurationMinutes: 120,
  objectives: [],
  status: "DRAFT",
  ownerUserName: "系统管理员",
  ownerUserId: "user-1",
  lecturerUserId: null,
  lecturerUserName: null,
  createdAt: "2026-08-11T00:00:00.000Z",
  updatedAt: "2026-08-11T00:00:00.000Z",
};

assert.deepEqual(
  ["DRAFT", "ACTIVE", "ARCHIVED"].map((status) =>
    getCourseStatusAction({ ...baseCourse, status: status as AcademyCourse["status"] }),
  ),
  [
    { nextStatus: "ACTIVE", label: "发布", confirmationRequired: true },
    { nextStatus: "ARCHIVED", label: "归档", confirmationRequired: true },
    { nextStatus: "ACTIVE", label: "恢复", confirmationRequired: false },
  ],
  "每种课程状态应只暴露当前可执行的下一步操作",
);

const sibling = { ...baseCourse, id: "course-2", title: "销售转化" };
const published = { ...baseCourse, status: "ACTIVE" as const, updatedAt: "2026-08-11T01:00:00.000Z" };
const updated = replaceCourseById([baseCourse, sibling], published);

assert.equal(updated[0], published, "状态变更应替换目标课程行");
assert.equal(updated[1], sibling, "状态变更不应重建或替换其他课程行");

const firstPending = updatePendingCourseIds(new Set<string>(), "course-1", true);
const twoPending = updatePendingCourseIds(firstPending, "course-2", true);
const secondStillPending = updatePendingCourseIds(twoPending, "course-1", false);
assert.deepEqual([...secondStillPending], ["course-2"], "一行请求完成时不应清除其他行的加载状态");
assert.equal(clampPageIndex(2, 11, 10), 1, "筛选结果减少时应回到最后一个有效页码");
assert.equal(clampPageIndex(3, 0, 10), 0, "没有筛选结果时应回到第一页");

console.log("academy course workspace model tests passed");
