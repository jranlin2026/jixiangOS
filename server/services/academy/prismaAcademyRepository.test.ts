import assert from "node:assert/strict";
import { createPrismaAcademyRepository } from "./prismaAcademyRepository";

const calls: Array<{ model: string; method: string; args: any }> = [];
const client: any = {
  academyCourse: {
    findMany: async (args: any) => (
      calls.push({ model: "course", method: "findMany", args }),
      []
    ),
    count: async (args: any) => (
      calls.push({ model: "course", method: "count", args }),
      23
    ),
    findFirst: async () => null,
    findUnique: async () => null,
    create: async ({ data }: any) => data,
    updateMany: async (args: any) => (
      calls.push({ model: "course", method: "updateMany", args }),
      { count: 1 }
    ),
  },
  academyCourseVersion: { create: async ({ data }: any) => data },
  academySession: {
    findMany: async (args: any) => (
      calls.push({ model: "session", method: "findMany", args }),
      []
    ),
    count: async (args: any) => (
      calls.push({ model: "session", method: "count", args }),
      0
    ),
    findUnique: async () => null,
    updateMany: async (args: any) => (
      calls.push({ model: "session", method: "updateMany", args }),
      { count: 1 }
    ),
  },
  academySessionTask: {
    findMany: async () => [],
    update: async ({ data }: any) => data,
  },
  academyEngagement: {
    upsert: async ({ create }: any) => create,
    count: async () => 0,
  },
  academySessionReview: { upsert: async ({ create }: any) => create },
  $transaction: async (arg: any) => {
    if (Array.isArray(arg)) return Promise.all(arg);
    return arg({
      academySession: { create: async ({ data }: any) => data },
      academySessionTask: {
        createMany: async ({ data }: any) => ({ count: data.length }),
      },
    });
  },
};

const repository = createPrismaAcademyRepository(client);
const result = await repository.listCourses(
  { page: 3, pageSize: 10, search: "AI", status: "ACTIVE" },
  { unrestricted: true, visibleUserIds: [] },
);
assert.equal(result.total, 23);
const query = calls.find(
  (call) => call.model === "course" && call.method === "findMany",
)?.args;
assert.equal(query.skip, 20, "课程列表必须使用服务端分页偏移");
assert.equal(query.take, 10, "课程列表必须使用服务端每页条数");
assert.deepEqual(query.where, {
  status: "ACTIVE",
  OR: [
    { title: { contains: "AI" } },
    { code: { contains: "AI" } },
    { category: { contains: "AI" } },
  ],
});

await repository.listCourses(
  { page: 1, pageSize: 10 },
  { unrestricted: false, visibleUserIds: ["user-owner", "user-team"] },
);
const scopedCourseCalls = calls.filter(
  (call) => call.model === "course" && call.method === "findMany",
);
const scopedCourseQuery = scopedCourseCalls[scopedCourseCalls.length - 1]?.args;
assert.deepEqual(
  scopedCourseQuery.where,
  { ownerUserId: { in: ["user-owner", "user-team"] } },
  "商学院课程列表必须按角色数据范围过滤",
);

const now = new Date("2026-08-08T09:00:00.000Z");
const created = await repository.createSession(
  {
    id: "session-1",
    courseId: "course-1",
    title: "测试场次",
    startsAt: now,
    endsAt: new Date(now.getTime() + 3600000),
    venue: "线上",
    capacity: 10,
    status: "PLANNED",
    createdById: "u1",
    createdByName: "管理员",
    createdAt: now,
    updatedAt: now,
  },
  [
    {
      id: "task-1",
      sessionId: "session-1",
      templateKey: "MATERIALS",
      title: "物料",
      category: "BEFORE",
      isRequired: true,
      status: "PENDING",
      createdAt: now,
      updatedAt: now,
    },
  ],
);
assert.equal(created.tasks.length, 1, "场次和初始清单必须在同一事务中创建");

await repository.updateSessionStatus("session-1", "PLANNED", "READY");
const statusCall = calls.find(
  (call) => call.model === "session" && call.method === "updateMany",
);
assert.deepEqual(
  statusCall?.args.where,
  { id: "session-1", status: "PLANNED" },
  "场次状态更新必须带旧状态条件，避免并发覆盖",
);

console.log("prisma academy repository tests passed");
