import assert from "node:assert/strict";
import { createPrismaAcademyRepository } from "./prismaAcademyRepository";

const calls: Array<{ model: string; method: string; args: any }> = [];
const now = new Date("2026-08-08T09:00:00.000Z");
let transactionSessionRow: any = null;
let businessRecordFindManyRows: any[] | null = null;
let businessRecordFindManyQueue: any[][] = [];
let businessRecordFindUniqueRow: any = null;
const client: any = {
  academySopTemplate: {
    findMany: async (args: any) => (
      calls.push({ model: "sopTemplate", method: "findMany", args }),
      [{ id: "sop-1", name: "标准流程", description: "", status: "ACTIVE", isDefault: true, createdById: "u-1", createdByName: "管理员", createdAt: now, updatedAt: now, steps: [{ id: "step-2", templateId: "sop-1", stepKey: "SECOND", title: "第二步", category: "AFTER", sortOrder: 2, assigneeRole: "PROJECT_OWNER", dueAnchor: "ENDS_AT", dueOffsetMinutes: 30, completionMode: "NOTE", requiresReview: false, acceptanceCriteria: "记录结果", isRequired: true, createdAt: now, updatedAt: now }, { id: "step-1", templateId: "sop-1", stepKey: "FIRST", title: "第一步", category: "BEFORE", sortOrder: 1, assigneeRole: "PROJECT_OWNER", dueAnchor: "STARTS_AT", dueOffsetMinutes: -60, completionMode: "CONFIRM", requiresReview: false, acceptanceCriteria: "确认", isRequired: true, createdAt: now, updatedAt: now }] }]
    ),
    findUnique: async () => null,
    findFirst: async () => null,
    delete: async (args: any) => (calls.push({ model: "sopTemplate", method: "delete", args }), args.where),
  },
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
      businessRecordFindManyQueue.length ? businessRecordFindManyQueue.shift()! : businessRecordFindManyRows ?? []
    ),
    upsert: async (args: any) => (
      calls.push({ model: "businessRecord", method: "upsert", args }),
      { data: args.create.data, createdAt: now, updatedAt: now }
    ),
    findUnique: async (args: any) => (
      calls.push({ model: "businessRecord", method: "findUnique", args }),
      businessRecordFindUniqueRow
    ),
    update: async (args: any) => (
      calls.push({ model: "businessRecord", method: "update", args }),
      args.data
    ),
    count: async (args: any) => (
      calls.push({ model: "businessRecord", method: "count", args }),
      0
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
    findFirst: async () => null,
    updateMany: async (args: any) => (
      calls.push({ model: "session", method: "updateMany", args }),
      { count: 1 }
    ),
  },
  academySessionTask: {
    findMany: async (args: any) => (
      calls.push({ model: "task", method: "findMany", args }),
      []
    ),
    count: async (args: any) => (
      calls.push({ model: "task", method: "count", args }),
      0
    ),
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
      academySopTemplate: {
        updateMany: async (args: any) => (calls.push({ model: "sopTemplate", method: "updateMany", args }), { count: 1 }),
        upsert: async (args: any) => (calls.push({ model: "sopTemplate", method: "upsert", args }), args.create),
      },
      academySopTemplateStep: {
        deleteMany: async (args: any) => (calls.push({ model: "sopStep", method: "deleteMany", args }), { count: 0 }),
        createMany: async (args: any) => (calls.push({ model: "sopStep", method: "createMany", args }), { count: args.data.length }),
      },
      academySession: {
        create: async ({ data }: any) => data,
        findUnique: async () => transactionSessionRow,
        updateMany: async (args: any) => {
          calls.push({ model: "transactionSession", method: "updateMany", args });
          transactionSessionRow = transactionSessionRow ? { ...transactionSessionRow, ...args.data } : null;
          return { count: transactionSessionRow ? 1 : 0 };
        },
      },
      academySessionTask: {
        createMany: async ({ data }: any) => ({ count: data.length }),
        findMany: async (args: any) => (
          calls.push({ model: "transactionTask", method: "findMany", args }),
          []
        ),
        update: async (args: any) => (calls.push({ model: "task", method: "update", args }), args.data),
        updateMany: async (args: any) => (calls.push({ model: "transactionTask", method: "updateMany", args }), { count: 1 }),
        findUnique: async ({ where }: any) => ({ id: where.id, title: "测试任务", status: "DONE", updatedAt: now, session: transactionSessionRow }),
      },
      businessRecord: {
        create: async (args: any) => (
          calls.push({ model: "transactionBusinessRecord", method: "create", args }),
          args.data
        ),
      },
    });
  },
};

const repository = createPrismaAcademyRepository(client);
const templates = await repository.listSopTemplates!();
assert.deepEqual(templates[0].steps.map((step) => step.stepKey), ["FIRST", "SECOND"], "模板步骤必须按配置顺序返回");
await repository.deleteSopTemplate!("sop-delete");
assert.deepEqual(calls.find((call) => call.model === "sopTemplate" && call.method === "delete")?.args.where, { id: "sop-delete" });
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
        ownerUserId: { in: ["user-owner", "user-team"] },
      },
      {},
      {},
    ],
  },
  "课程库必须只按课程维护人范围过滤，旧主讲人不能继续获得课程访问权",
);

await repository.listSessions(
  { page: 1, pageSize: 10 },
  { unrestricted: false, visibleUserIds: ["user-maintainer"] },
);
const scopedSessionCalls = calls.filter(
  (call) => call.model === "session" && call.method === "findMany",
);
const scopedSessionQuery = scopedSessionCalls[scopedSessionCalls.length - 1]?.args;
assert.doesNotMatch(
  JSON.stringify(scopedSessionQuery.where),
  /course.*ownerUserId/,
  "课程维护人不能因为维护课程而自动获得该课程所有安排的访问权",
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

await repository.listPublicCalendar({
  start: new Date("2026-08-10T00:00:00.000Z"),
  end: new Date("2026-08-17T00:00:00.000Z"),
});
const publicCalendarCalls = calls.filter(
  (call) => call.model === "session" && call.method === "findMany",
);
const publicCalendarCall = publicCalendarCalls[publicCalendarCalls.length - 1]?.args;
assert.deepEqual(publicCalendarCall.select, {
  id: true,
  title: true,
  startsAt: true,
  endsAt: true,
  deliveryMode: true,
  status: true,
  lecturerUserName: true,
  tasks: {
    select: {
      id: true,
      templateKey: true,
      title: true,
      assigneeUserId: true,
      assigneeUserName: true,
      dueAt: true,
      status: true,
      sortOrder: true,
      completionMode: true,
      requiresReview: true,
    },
    orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
  },
  course: { select: { title: true } },
}, "全员周历查询必须使用不含客户、附件和提交说明的安全进度投影");
assert.equal(publicCalendarCall.where.status.not, "CANCELLED");

await repository.listMyTasks("user-assignee", { page: 2, pageSize: 10, status: "OPEN" });
const myTaskCall = calls.find((call) => call.model === "task" && call.method === "findMany")?.args;
assert.deepEqual(myTaskCall.where, { assigneeUserId: "user-assignee", session: { status: { not: "CANCELLED" } }, status: { notIn: ["DONE", "SKIPPED", "SUBMITTED"] } });
assert.equal(myTaskCall.skip, 10);
assert.equal(myTaskCall.take, 10);
assert.equal(myTaskCall.select.completionMode, true);
assert.equal(myTaskCall.select.requiresReview, true);
assert.equal(myTaskCall.select.sortOrder, true);
assert.equal(myTaskCall.select.sopTemplateId, true);
assert.equal(myTaskCall.select.sopTemplateStepId, true);
assert.equal(myTaskCall.select.assigneeRole, true);
assert.deepEqual(myTaskCall.select.session.select, {
  id: true,
  title: true,
  startsAt: true,
  endsAt: true,
  status: true,
}, "本人任务投影只能带上打开待办所必需的课程安排上下文");

calls.length = 0;
await repository.listMyTasks("user-reviewer", { page: 1, pageSize: 10, status: "REVIEW" }, { unrestricted: false, visibleUserIds: ["user-reviewer"] });
const reviewTaskCall = calls.find((call) => call.model === "task" && call.method === "findMany")?.args;
assert.equal(reviewTaskCall.where.status, "SUBMITTED");
assert.ok(reviewTaskCall.where.session.OR, "待验收任务必须继续受课程安排数据范围限制");

calls.length = 0;
await repository.listMyTasks("user-assignee", { page: 1, pageSize: 10, status: "HISTORY" });
const historyTaskCall = calls.find((call) => call.model === "businessRecord" && call.method === "findMany")?.args;
assert.deepEqual(historyTaskCall.where, {
  domain: "academy_task_events",
  OR: [{ owner: "user-assignee" }, { mergedById: "user-assignee" }],
}, "处理记录必须读取不可覆盖的本人任务与验收事件");

calls.length = 0;
await repository.updateTaskStatus("task-conditional", "PENDING", { status: "SUBMITTED" });
const conditionalTaskUpdate = calls.find((call) => call.model === "transactionTask" && call.method === "updateMany")?.args;
assert.deepEqual(conditionalTaskUpdate.where, { id: "task-conditional", status: "PENDING", session: { status: { not: "CANCELLED" } } }, "任务提交必须原子校验旧状态且课程未取消");
assert.ok(calls.some((call) => call.model === "transactionBusinessRecord" && call.method === "create"), "每次任务状态变化必须写入不可覆盖的操作事件");

transactionSessionRow = { id: "session-1", status: "PLANNED", collaboratorUserIds: [], capacity: 10 };
calls.length = 0;
await repository.updateSessionStatus("session-1", "PLANNED", "CANCELLED", { status: "SKIPPED", note: "课程安排已取消，任务自动关闭" });
const statusCall = calls.find(
  (call) => call.model === "transactionSession" && call.method === "updateMany",
);
const cancelledTaskUpdate = calls.find(
  (call) => call.model === "transactionTask" && call.method === "updateMany",
)?.args;
assert.deepEqual(cancelledTaskUpdate.where, { sessionId: "session-1", status: { notIn: ["DONE", "SKIPPED"] } }, "取消课程必须只关闭尚未完成的任务");
assert.equal(cancelledTaskUpdate.data.status, "SKIPPED", "取消课程必须把未完成任务标记为已关闭");

transactionSessionRow = {
  id: "session-edit",
  status: "PLANNED",
  capacity: 20,
  targetRevenue: 0,
  collaboratorUserIds: ["collaborator-1", "__academy_all_employees__", "__academy_invitable__"],
};
await repository.updateSession("session-edit", "PLANNED", {
  title: "调整安排",
  audience: "RESPONSIBLE_ONLY",
  isInvitable: false,
}, []);
const arrangementUpdateCalls = calls.filter((call) => call.model === "transactionSession" && call.method === "updateMany");
const arrangementUpdateCall = arrangementUpdateCalls[arrangementUpdateCalls.length - 1];
assert.deepEqual(arrangementUpdateCall?.args.where, { id: "session-edit", status: "PLANNED" }, "编辑课程安排必须带旧状态避免并发覆盖");
assert.deepEqual(arrangementUpdateCall?.args.data.collaboratorUserIds, ["collaborator-1"], "调整课程可见范围时必须移除旧公共标记并保留真实协作人");
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

const attachmentQueryStart = calls.length;
businessRecordFindManyQueue = [[
  { recordId: "task-1", data: { attachmentIds: ["evidence-2", "evidence-1", "missing"] } },
], [
  {
    recordId: "evidence-1",
    data: {
      id: "evidence-1", name: "大纲.pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      size: 100, category: "academy-task-evidence", uploadedById: "u1", uploadedByName: "员工", uploadedAt: now.toISOString(),
      storageName: "do-not-leak.pptx", draftKey: "academy-task:task-1",
    },
  },
  {
    recordId: "evidence-2",
    data: {
      id: "evidence-2", name: "海报.png", mimeType: "image/png", size: 200, category: "academy-task-evidence",
      uploadedById: "u1", uploadedByName: "员工", uploadedAt: now.toISOString(), storageName: "do-not-leak.png", draftKey: "academy-task:task-1",
    },
  },
  { recordId: "wrong-category", data: { id: "wrong-category", category: "academy-course-asset" } },
]];
const batchAttachments = await repository.listTaskAttachmentsByTaskIds(["task-1", "task-2"]);
assert.deepEqual(batchAttachments.get("task-1")?.map((item) => item.id), ["evidence-2", "evidence-1"], "批量回显必须保持任务中的附件顺序并忽略缺失记录");
assert.deepEqual(batchAttachments.get("task-2"), []);
assert.equal("storageName" in batchAttachments.get("task-1")![0], false, "回显不得泄漏存储文件名");
assert.equal("draftKey" in batchAttachments.get("task-1")![0], false, "回显不得泄漏草稿关联键");
const attachmentCalls = calls.slice(attachmentQueryStart).filter((call) => call.model === "businessRecord" && call.method === "findMany");
assert.equal(attachmentCalls.length, 2, "批量合并任务附件只能执行两次BusinessRecord查询");
assert.deepEqual(attachmentCalls[0].args.where, { domain: "academy_task_attachments", recordId: { in: ["task-1", "task-2"] } });
assert.deepEqual(attachmentCalls[1].args.where.domain, "jixiang_os_business_attachments");

businessRecordFindManyRows = [];
await repository.replaceTaskAttachments("task-1", ["evidence-1", "evidence-2"], {
  id: "u1", name: "员工", permissions: [], isActive: true,
} as any);
businessRecordFindManyRows = null;
const taskAttachmentSaveCalls = calls.filter((call) => call.model === "businessRecord" && call.method === "upsert");
const taskAttachmentSave = taskAttachmentSaveCalls[taskAttachmentSaveCalls.length - 1]!;
assert.deepEqual(taskAttachmentSave.args.where.domain_recordId, { domain: "academy_task_attachments", recordId: "task-1" });
assert.deepEqual(taskAttachmentSave.args.create.data.attachmentIds, ["evidence-1", "evidence-2"]);

businessRecordFindUniqueRow = { data: { taskId: "task-1", attachmentIds: ["evidence-1", "evidence-2"] } };
await repository.removeTaskAttachmentReference("task-1", "evidence-1");
businessRecordFindUniqueRow = null;
const taskAttachmentUpdateCalls = calls.filter((call) => call.model === "businessRecord" && call.method === "update");
const taskAttachmentUpdate = taskAttachmentUpdateCalls[taskAttachmentUpdateCalls.length - 1]!;
assert.deepEqual(taskAttachmentUpdate.args.data.data.attachmentIds, ["evidence-2"], "物理删除后必须同步移除任务关联");

businessRecordFindManyQueue = [[
  { data: { attachmentIds: ["evidence-1", "evidence-2"] } },
  { data: { attachmentIds: ["evidence-2", "evidence-3"] } },
]];
const linkedQueryStart = calls.length;
assert.deepEqual(
  [...await repository.listLinkedTaskAttachmentIds(["task-1", "task-2"])].sort(),
  ["evidence-1", "evidence-2", "evidence-3"],
  "过期草稿清理应一次批量读取任务附件关联",
);
const linkedQueries = calls.slice(linkedQueryStart).filter((call) => call.model === "businessRecord" && call.method === "findMany");
assert.equal(linkedQueries.length, 1);
assert.deepEqual(linkedQueries[0].args.where, { domain: "academy_task_attachments", recordId: { in: ["task-1", "task-2"] } });

console.log("prisma academy repository tests passed");
