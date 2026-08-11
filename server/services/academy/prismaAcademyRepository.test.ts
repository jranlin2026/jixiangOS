import assert from "node:assert/strict";
import { createPrismaAcademyRepository } from "./prismaAcademyRepository";

const calls: Array<{ model: string; method: string; args: any }> = [];
const now = new Date("2026-08-08T09:00:00.000Z");
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
    update: async ({ data }: any) => ({
      id: "course-1",
      code: "AC-1",
      status: "DRAFT",
      createdAt: now,
      ...data,
    }),
    updateMany: async (args: any) => (
      calls.push({ model: "course", method: "updateMany", args }),
      { count: 1 }
    ),
  },
  academyCourseVersion: {
    create: async ({ data }: any) => data,
    findFirst: async () => ({ id: "version-1" }),
    aggregate: async () => ({ _max: { versionNumber: 2 } }),
  },
  businessRecord: {
    findMany: async (args: any) => (
      calls.push({ model: "businessRecord", method: "findMany", args }),
      []
    ),
    upsert: async (args: any) => (
      calls.push({ model: "businessRecord", method: "upsert", args }),
      { data: args.create.data, createdAt: now, updatedAt: now }
    ),
  },
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
    findUnique: async ({ where }: any) => ({ id: where.id, status: "PENDING" }),
    update: async ({ data }: any) => data,
  },
  academyEngagement: {
    upsert: async ({ create }: any) => create,
    findUnique: async ({ where }: any) => ({ id: where.id }),
    count: async () => 0,
  },
  order: {
    findUnique: async ({ where }: any) => ({ id: where.id, orderNo: "ORD-1", customerId: "customer-1" }),
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
const initialCategories = await repository.listCourseCategories();
assert.deepEqual(initialCategories, []);
const categoryListCall = calls.find(
  (call) => call.model === "businessRecord" && call.method === "findMany",
);
assert.deepEqual(categoryListCall?.args.where, { domain: "academy_course_categories" });

await repository.upsertCourseCategory({
  id: "category-1",
  name: "老板增长课",
  description: "面向老板",
  sortOrder: 8,
  isActive: true,
  createdAt: now,
  updatedAt: now,
});
const categorySaveCall = calls.find(
  (call) => call.model === "businessRecord" && call.method === "upsert",
);
assert.deepEqual(categorySaveCall?.args.where.domain_recordId, {
  domain: "academy_course_categories",
  recordId: "category-1",
});

assert.equal(await repository.getNextCourseVersionNumber("course-1"), 3);
const updatedCourse = await repository.updateCourse("course-1", { title: "更新后课程" });
assert.equal(updatedCourse?.title, "更新后课程");

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
  AND: [
    {},
    { status: "ACTIVE" },
    {
      OR: [
        { title: { contains: "AI" } },
        { code: { contains: "AI" } },
        { category: { contains: "AI" } },
      ],
    },
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
  {
    AND: [
      {
        OR: [
          { ownerUserId: { in: ["user-owner", "user-team"] } },
          { lecturerUserId: { in: ["user-owner", "user-team"] } },
        ],
      },
      {},
      {},
    ],
  },
  "商学院课程列表必须按角色数据范围过滤",
);

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
    audience: "RESPONSIBLE_ONLY",
    isInvitable: false,
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

await repository.listCourseAssets("course-1");
const assetListCall = calls.find(
  (call) => call.model === "businessRecord" && call.method === "findMany" && call.args.where.domain === "academy_course_assets",
);
assert.deepEqual(assetListCall?.args.where, {
  domain: "academy_course_assets",
  recordId: { startsWith: "course-1:" },
});

await repository.upsertCourseAsset({
  id: "asset-course-1-PPT",
  courseId: "course-1",
  courseVersionId: "version-1",
  assetType: "PPT",
  title: "课件",
  attachments: [],
  ownerUserId: "u1",
  ownerUserName: "管理员",
  createdAt: now,
  updatedAt: now,
});
const assetSaveCall = calls.find(
  (call) => call.model === "businessRecord" && call.method === "upsert" && call.args.where.domain_recordId.domain === "academy_course_assets",
);
assert.deepEqual(assetSaveCall?.args.where.domain_recordId, {
  domain: "academy_course_assets",
  recordId: "course-1:PPT",
});

console.log("prisma academy repository tests passed");
