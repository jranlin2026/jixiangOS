import assert from "node:assert/strict";
import test from "node:test";
import { createOkrService } from "./okrService";

const permission = (module: string, actions = ["read", "write"]) => ({
  module,
  actions,
});

const admin: any = {
  id: "admin",
  name: "管理员",
  account: "admin",
  email: "admin@example.com",
  phone: "",
  role: "超级管理员",
  departmentId: "dept-hq",
  positionId: "position-ceo",
  positionName: "总经理",
  isActive: true,
  permissions: [{ module: "全部", actions: ["admin"] }],
  dataScopes: { okr: "all" },
};

const employee: any = {
  id: "employee-1",
  name: "员工甲",
  account: "e1",
  email: "e1@example.com",
  phone: "",
  role: "员工",
  departmentId: "dept-sales",
  positionId: "position-sales",
  positionName: "销售顾问",
  isActive: true,
  permissions: [
    permission("目标管理/查看本人目标", ["read"]),
    permission("目标管理/提交检视"),
  ],
  dataScopes: { okr: "self" },
};

const salesManager: any = {
  id: "manager-sales",
  name: "销售经理",
  account: "m1",
  email: "m1@example.com",
  phone: "",
  role: "销售经理",
  departmentId: "dept-sales",
  positionId: "position-manager",
  positionName: "销售经理",
  isActive: true,
  permissions: [
    permission("目标管理/查看团队目标", ["read"]),
    permission("目标管理/管理部门目标"),
  ],
  dataScopes: { okr: "department" },
};

function memoryPrisma() {
  const now = () => new Date("2026-08-13T10:00:00+08:00");
  const db: any = {
    cycles: [],
    objectives: [],
    keyResults: [],
    checkIns: [],
    reviews: [],
    taskLinks: [],
    tasks: [],
    events: [],
    cycleLocks: [],
    users: [
      {
        id: admin.id,
        name: admin.name,
        departmentId: admin.departmentId,
        positionId: admin.positionId,
        positionName: admin.positionName,
      },
      {
        id: employee.id,
        name: employee.name,
        departmentId: employee.departmentId,
        positionId: employee.positionId,
        positionName: employee.positionName,
      },
      {
        id: salesManager.id,
        name: salesManager.name,
        departmentId: salesManager.departmentId,
        positionId: salesManager.positionId,
        positionName: salesManager.positionName,
      },
    ],
    departments: [
      { id: "dept-hq", name: "总经办", parentId: null },
      { id: "dept-sales", name: "销售部", parentId: "dept-hq" },
      { id: "dept-outsider", name: "交付部", parentId: "dept-hq" },
    ],
    positions: [
      { id: "position-ceo", name: "总经理" },
      { id: "position-sales", name: "销售顾问" },
      { id: "position-manager", name: "销售经理" },
    ],
  };
  const match = (row: any, where: any = {}): boolean =>
    Object.entries(where).every(([key, value]: any) => {
      if (key === "OR") return value.some((part: any) => match(row, part));
      if (key === "AND") return value.every((part: any) => match(row, part));
      if (key === "keyResults" && value?.some)
        return db.keyResults.some(
          (kr: any) => kr.objectiveId === row.id && match(kr, value.some),
        );
      if (key === "objective" && value?.is)
        return db.objectives.some(
          (objective: any) =>
            objective.id === row.objectiveId && match(objective, value.is),
        );
      if (key === "cycle" && value?.status)
        return db.cycles.some(
          (cycle: any) => cycle.id === row.cycleId && match(cycle, value),
        );
      if (key === "checkIns" && value?.none)
        return !db.checkIns.some(
          (checkIn: any) =>
            checkIn.keyResultId === row.id && match(checkIn, value.none),
        );
      if (value && typeof value === "object" && !Array.isArray(value)) {
        if ("in" in value) return value.in.includes(row[key]);
        if ("not" in value) return row[key] !== value.not;
        if ("contains" in value)
          return String(row[key] || "")
            .toLowerCase()
            .includes(String(value.contains).toLowerCase());
        if ("gte" in value || "lte" in value) {
          const current =
            row[key] instanceof Date
              ? row[key].getTime()
              : new Date(row[key]).getTime();
          return (
            (!value.gte || current >= new Date(value.gte).getTime()) &&
            (!value.lte || current <= new Date(value.lte).getTime())
          );
        }
      }
      return row[key] === value;
    });
  const model = (rows: any[]) => ({
    create: async ({ data }: any) => {
      const row = {
        ...data,
        createdAt: data.createdAt || now(),
        updatedAt: data.updatedAt || now(),
      };
      rows.push(row);
      return row;
    },
    findUnique: async ({ where, include }: any) => {
      const row = rows.find((item) => match(item, where)) || null;
      if (!row || !include) return row;
      if (include.keyResults)
        return {
          ...row,
          keyResults: db.keyResults
            .filter((kr: any) => kr.objectiveId === row.id)
            .map((kr: any) => ({
              ...kr,
              checkIns: db.checkIns
                .filter((item: any) => item.keyResultId === kr.id)
                .sort(
                  (a: any, b: any) =>
                    b.createdAt.getTime() - a.createdAt.getTime(),
                )
                .slice(0, 1),
              taskLinks: db.taskLinks.filter(
                (item: any) => item.keyResultId === kr.id,
              ),
            })),
        };
      return row;
    },
    findFirst: async ({ where }: any) =>
      rows.find((item) => match(item, where)) || null,
    findMany: async ({
      where = {},
      orderBy,
      skip = 0,
      take,
      include,
    }: any = {}) => {
      let result = rows.filter((item) => match(item, where));
      const orders = Array.isArray(orderBy)
        ? orderBy
        : orderBy
          ? [orderBy]
          : [];
      result = [...result].sort((a, b) => {
        for (const order of orders) {
          const [key, direction] = Object.entries(order)[0] as [string, any];
          const av = a[key] instanceof Date ? a[key].getTime() : a[key];
          const bv = b[key] instanceof Date ? b[key].getTime() : b[key];
          if (av !== bv)
            return (av < bv ? -1 : 1) * (direction === "desc" ? -1 : 1);
        }
        return 0;
      });
      const page = result.slice(
        skip,
        take === undefined ? undefined : skip + take,
      );
      if (include?.objective)
        return page.map((row) => ({
          ...row,
          objective:
            db.objectives.find(
              (objective: any) => objective.id === row.objectiveId,
            ) || null,
        }));
      return include?.keyResults
        ? page.map((row) => ({
            ...row,
            keyResults: db.keyResults
              .filter((kr: any) => kr.objectiveId === row.id)
              .map((kr: any) => ({
                ...kr,
                checkIns: db.checkIns
                  .filter((item: any) => item.keyResultId === kr.id)
                  .sort(
                    (a: any, b: any) =>
                      b.createdAt.getTime() - a.createdAt.getTime(),
                  )
                  .slice(0, 1),
                taskLinks: db.taskLinks.filter(
                  (item: any) => item.keyResultId === kr.id,
                ),
              })),
          }))
        : page;
    },
    count: async ({ where = {} }: any = {}) =>
      rows.filter((item) => match(item, where)).length,
    update: async ({ where, data }: any) => {
      const row = rows.find((item) => match(item, where));
      if (!row) throw new Error("not found");
      Object.assign(row, data, { updatedAt: now() });
      return row;
    },
    updateMany: async ({ where = {}, data }: any) => {
      const found = rows.filter((item) => match(item, where));
      found.forEach((row) => Object.assign(row, data, { updatedAt: now() }));
      return { count: found.length };
    },
  });
  const reviewModel = model(db.reviews);
  const prisma: any = {
    okrCycle: model(db.cycles),
    objective: model(db.objectives),
    keyResult: model(db.keyResults),
    okrCheckIn: model(db.checkIns),
    okrReview: {
      ...reviewModel,
      create: async ({ data }: any) => {
        if (
          db.reviews.some(
            (row: any) =>
              row.objectiveId === data.objectiveId &&
              row.reviewerId === data.reviewerId &&
              row.reviewerType === data.reviewerType,
          )
        ) {
          throw Object.assign(new Error("unique review"), { code: "P2002" });
        }
        return reviewModel.create({ data });
      },
    },
    okrTaskLink: model(db.taskLinks),
    okrEvent: model(db.events),
    user: {
      findUnique: async ({ where }: any) =>
        db.users.find((item: any) => match(item, where)) || null,
      findMany: async ({ where = {}, orderBy }: any = {}) =>
        model(db.users).findMany({ where, orderBy }),
    },
    department: {
      findUnique: async ({ where }: any) =>
        db.departments.find((item: any) => match(item, where)) || null,
      findMany: async ({ where = {} }: any = {}) =>
        db.departments.filter((item: any) => match(item, where)),
    },
    position: {
      findUnique: async ({ where }: any) =>
        db.positions.find((item: any) => match(item, where)) || null,
    },
    role: { findUnique: async () => null },
    employeeTask: model(db.tasks),
    $queryRaw: async (strings: TemplateStringsArray, ...values: any[]) => {
      const sql = Array.from(strings).join("?");
      if (!/FROM okr_cycles[\s\S]*FOR UPDATE/.test(sql))
        throw new Error(`unexpected raw query: ${sql}`);
      db.cycleLocks.push({ cycleId: values[0], sql });
      return db.cycles.filter((cycle: any) => cycle.id === values[0]);
    },
    $transaction: async (work: any) =>
      typeof work === "function" ? work(prisma) : Promise.all(work),
  };
  return { prisma, db };
}

test("creates a quarterly objective, activates its definitions, then appends a manual check-in", async () => {
  const { prisma, db } = memoryPrisma();
  const service = createOkrService({
    prisma,
    now: () => new Date("2026-08-13T10:00:00+08:00"),
  });

  const cycle = await service.createCycle(admin, {
    name: "2026年第三季度",
    year: 2026,
    quarter: 3,
    startAt: "2026-07-01T00:00:00+08:00",
    endAt: "2026-09-30T23:59:59+08:00",
    checkInWeekday: 5,
  });
  assert.equal(cycle.code, 0);
  assert.equal(cycle.data?.status, "DRAFT");

  const objective = await service.createObjective(admin, {
    cycleId: cycle.data!.id,
    scope: "COMPANY",
    title: "让销售经营可预测",
    ownerId: admin.id,
    weight: 100,
  });
  assert.equal(objective.code, 0);

  const kr = await service.addKeyResult(admin, objective.data!.id, {
    title: "季度实收金额达标",
    ownerId: employee.id,
    type: "NUMERIC",
    direction: "INCREASE",
    baselineValue: 100,
    targetValue: 200,
    currentValue: 100,
    unit: "万元",
    weight: 100,
  });
  assert.equal(kr.code, 0);
  assert.equal(kr.data?.source, "MANUAL");

  const activated = await service.transitionCycle(
    admin,
    cycle.data!.id,
    "ACTIVE",
  );
  assert.equal(activated.code, 0);
  assert.equal(activated.data?.status, "ACTIVE");
  assert.equal(db.objectives[0].status, "PUBLISHED");

  const checked = await service.checkIn(employee, kr.data!.id, {
    currentValue: 150,
    confidence: 4,
    blocker: "",
    nextAction: "跟进重点客户",
    evidence: [{ type: "TEXT", content: "财务数据已核对" }],
  });
  assert.equal(checked.code, 0);
  assert.equal(checked.data?.keyResult.currentValue, 150);
  assert.equal(checked.data?.keyResult.progress, 50);
  assert.equal(checked.data?.keyResult.health, "ON_TRACK");
  assert.equal(checked.data?.objectiveProgress, 50);
  assert.equal(db.checkIns.length, 1);
  assert.equal(db.checkIns[0].previousValue, 100);
  assert.equal(db.checkIns[0].currentValue, 150);
});

test("plain end dates include the full last Shanghai day", async () => {
  const { prisma } = memoryPrisma();
  const service = createOkrService({ prisma });
  const result = await service.createCycle(admin, {
    name: "2026年第四季度",
    year: 2026,
    quarter: 4,
    startAt: "2026-10-01",
    endAt: "2026-12-31",
    checkInWeekday: 5,
  });
  assert.equal(result.code, 0);
  assert.equal(result.data?.endAt.toISOString(), "2026-12-31T15:59:59.999Z");
});

test("does not allow a manual check-in to overwrite an automatically sourced metric value", async () => {
  const { prisma, db } = memoryPrisma();
  db.cycles.push({
    id: "cycle-active-metric",
    status: "ACTIVE",
    startAt: new Date("2026-07-01"),
    endAt: new Date("2026-09-30"),
  });
  db.objectives.push({
    id: "objective-metric",
    cycleId: "cycle-active-metric",
    scope: "INDIVIDUAL",
    ownerId: employee.id,
    departmentId: employee.departmentId,
    status: "PUBLISHED",
  });
  db.keyResults.push({
    id: "kr-metric",
    objectiveId: "objective-metric",
    ownerId: employee.id,
    type: "NUMERIC",
    direction: "INCREASE",
    baselineValue: 0,
    targetValue: 100,
    currentValue: 40,
    progress: 40,
    weight: 100,
    source: "SYSTEM_METRIC",
  });
  const service = createOkrService({ prisma });

  const result = await service.checkIn(employee, "kr-metric", {
    currentValue: 70,
    confidence: 4,
  });

  assert.equal(result.code, 409);
  assert.equal(db.keyResults[0].currentValue, 40);
  assert.equal(db.checkIns.length, 0);
});

test("department-scoped objective list is paginated and stably excludes other departments", async () => {
  const { prisma, db } = memoryPrisma();
  const at = new Date("2026-08-13T02:00:00.000Z");
  db.objectives.push(
    {
      id: "objective-company",
      cycleId: "cycle-q3",
      scope: "COMPANY",
      ownerId: admin.id,
      departmentId: "dept-hq",
      title: "公司目标",
      status: "PUBLISHED",
      createdAt: at,
      updatedAt: at,
    },
    {
      id: "objective-sales-b",
      cycleId: "cycle-q3",
      scope: "DEPARTMENT",
      ownerId: salesManager.id,
      departmentId: "dept-sales",
      title: "销售目标B",
      status: "PUBLISHED",
      createdAt: at,
      updatedAt: at,
    },
    {
      id: "objective-sales-a",
      cycleId: "cycle-q3",
      scope: "INDIVIDUAL",
      ownerId: employee.id,
      departmentId: "dept-sales",
      title: "员工目标A",
      status: "PUBLISHED",
      createdAt: at,
      updatedAt: at,
    },
    {
      id: "objective-outsider",
      cycleId: "cycle-q3",
      scope: "DEPARTMENT",
      ownerId: "delivery-manager",
      departmentId: "dept-outsider",
      title: "交付目标",
      status: "PUBLISHED",
      createdAt: at,
      updatedAt: at,
    },
  );
  const service = createOkrService({ prisma });

  const page1 = await service.listObjectives(salesManager, {
    cycleId: "cycle-q3",
    page: 1,
    pageSize: 2,
  });
  const page2 = await service.listObjectives(salesManager, {
    cycleId: "cycle-q3",
    page: 2,
    pageSize: 2,
  });

  assert.equal(page1.code, 0);
  assert.equal(page1.data?.total, 3);
  assert.deepEqual(
    page1.data?.items.map((item: any) => item.id),
    ["objective-company", "objective-sales-a"],
  );
  assert.deepEqual(
    page2.data?.items.map((item: any) => item.id),
    ["objective-sales-b"],
  );
  assert.equal(
    [...page1.data!.items, ...page2.data!.items].some(
      (item: any) => item.id === "objective-outsider",
    ),
    false,
  );
});

test("objective filters implement health, search, mine and team semantics inside actor scope", async () => {
  const { prisma, db } = memoryPrisma();
  const at = new Date("2026-08-13T02:00:00.000Z");
  db.objectives.push(
    {
      id: "mine-risk",
      cycleId: "q3",
      scope: "INDIVIDUAL",
      ownerId: salesManager.id,
      ownerName: "销售经理",
      departmentId: "dept-sales",
      title: "回款提升计划",
      health: "AT_RISK",
      updatedAt: at,
    },
    {
      id: "team-risk",
      cycleId: "q3",
      scope: "INDIVIDUAL",
      ownerId: employee.id,
      ownerName: "员工甲",
      departmentId: "dept-sales",
      title: "回款转化专项",
      health: "AT_RISK",
      updatedAt: at,
    },
    {
      id: "team-good",
      cycleId: "q3",
      scope: "DEPARTMENT",
      ownerId: employee.id,
      ownerName: "员工甲",
      departmentId: "dept-sales",
      title: "客户增长",
      health: "ON_TRACK",
      updatedAt: at,
    },
    {
      id: "outside-risk",
      cycleId: "q3",
      scope: "DEPARTMENT",
      ownerId: "delivery",
      ownerName: "交付",
      departmentId: "dept-outsider",
      title: "回款管理",
      health: "AT_RISK",
      updatedAt: at,
    },
  );
  const service = createOkrService({ prisma });

  const mine = await service.listObjectives(salesManager, {
    owner: "mine",
    health: "AT_RISK",
    search: "回款",
    page: 1,
    pageSize: 10,
  });
  const team = await service.listObjectives(salesManager, {
    owner: "team",
    health: "AT_RISK",
    search: "回款",
    page: 1,
    pageSize: 10,
  });

  assert.deepEqual(
    mine.data?.items.map((item: any) => item.id),
    ["mine-risk"],
  );
  assert.deepEqual(
    team.data?.items.map((item: any) => item.id),
    ["team-risk"],
  );
});

test("mine objectives include a KR assigned to the actor even when another person owns the objective", async () => {
  const { prisma, db } = memoryPrisma();
  const at = new Date("2026-08-13T02:00:00.000Z");
  db.objectives.push({
    id: "shared-objective",
    cycleId: "q3",
    scope: "DEPARTMENT",
    ownerId: salesManager.id,
    ownerName: salesManager.name,
    departmentId: "dept-sales",
    title: "团队销售目标",
    health: "ON_TRACK",
    updatedAt: at,
  });
  db.keyResults.push({
    id: "employee-kr",
    objectiveId: "shared-objective",
    ownerId: employee.id,
    departmentId: "dept-sales",
    title: "员工承接KR",
  });
  const service = createOkrService({ prisma });

  const mine = await service.listObjectives(employee, {
    owner: "mine",
    page: 1,
    pageSize: 10,
  });

  assert.deepEqual(
    mine.data?.items.map((item: any) => item.id),
    ["shared-objective"],
  );
  assert.equal(mine.data?.items[0].keyResults[0].ownerId, employee.id);
  assert.equal(
    (await service.getObjective(employee, "shared-objective")).data?.id,
    "shared-objective",
  );
});

test("data scope is only an upper bound and does not grant team objective read access", async () => {
  const { prisma, db } = memoryPrisma();
  const at = new Date("2026-08-13T02:00:00.000Z");
  const scopedSelfReader: any = {
    ...employee,
    id: "scoped-self-reader",
    name: "仅本人查看",
    permissions: [permission("目标管理/查看本人目标", ["read"])],
    dataScopes: { okr: "department" },
  };
  db.objectives.push(
    {
      id: "own-objective",
      cycleId: "q3",
      scope: "INDIVIDUAL",
      ownerId: scopedSelfReader.id,
      departmentId: "dept-sales",
      title: "本人目标",
      status: "PUBLISHED",
      updatedAt: at,
    },
    {
      id: "team-objective",
      cycleId: "q3",
      scope: "INDIVIDUAL",
      ownerId: employee.id,
      departmentId: "dept-sales",
      title: "同部门他人目标",
      status: "PUBLISHED",
      updatedAt: at,
    },
    {
      id: "company-draft",
      cycleId: "q3",
      scope: "COMPANY",
      ownerId: scopedSelfReader.id,
      departmentId: "dept-sales",
      title: "公司草稿",
      status: "DRAFT",
      updatedAt: at,
    },
    {
      id: "company-published",
      cycleId: "q3",
      scope: "COMPANY",
      ownerId: admin.id,
      departmentId: "dept-hq",
      title: "已发布公司目标",
      status: "PUBLISHED",
      updatedAt: at,
    },
  );
  const service = createOkrService({ prisma });

  const listed = await service.listObjectives(scopedSelfReader, {
    cycleId: "q3",
    page: 1,
    pageSize: 10,
  });

  assert.deepEqual(
    listed.data?.items.map((item: any) => item.id),
    ["company-published", "own-objective"],
  );
  assert.equal(
    (await service.getObjective(scopedSelfReader, "team-objective")).code,
    404,
  );
  assert.equal(
    (await service.getObjective(scopedSelfReader, "company-draft")).code,
    404,
  );
  assert.equal(
    (await service.getObjective(scopedSelfReader, "company-published")).code,
    0,
  );
});

test("objective detail queries the id directly and still enforces visibility beyond any list page", async () => {
  const { prisma, db } = memoryPrisma();
  const at = new Date("2026-08-13T02:00:00.000Z");
  for (let index = 0; index < 120; index += 1)
    db.objectives.push({
      id: `sales-${String(index).padStart(3, "0")}`,
      cycleId: "q3",
      scope: "INDIVIDUAL",
      ownerId: employee.id,
      departmentId: "dept-sales",
      title: `销售${index}`,
      health: "ON_TRACK",
      updatedAt: at,
    });
  db.objectives.push({
    id: "outside-detail",
    cycleId: "q3",
    scope: "DEPARTMENT",
    ownerId: "delivery",
    departmentId: "dept-outsider",
    title: "交付目标",
    health: "ON_TRACK",
    updatedAt: at,
  });
  const service = createOkrService({ prisma });

  assert.equal(
    (await service.getObjective(salesManager, "sales-119")).data?.id,
    "sales-119",
  );
  assert.equal(
    (await service.getObjective(salesManager, "outside-detail")).code,
    404,
  );
});

test("denies an unprivileged actor and freezes every write after the cycle closes", async () => {
  const { prisma, db } = memoryPrisma();
  const service = createOkrService({ prisma });
  const stranger: any = {
    ...employee,
    id: "stranger",
    name: "无权员工",
    permissions: [],
    dataScopes: { okr: "self" },
  };
  const denied = await service.listObjectives(stranger, {
    page: 1,
    pageSize: 10,
  });
  assert.equal(denied.code, 403);

  db.cycles.push({
    id: "cycle-closed",
    name: "2026Q2",
    year: 2026,
    quarter: 2,
    status: "CLOSED",
    startAt: new Date("2026-04-01"),
    endAt: new Date("2026-06-30"),
  });
  db.objectives.push({
    id: "objective-closed",
    cycleId: "cycle-closed",
    scope: "INDIVIDUAL",
    ownerId: employee.id,
    departmentId: employee.departmentId,
    title: "已关闭目标",
    status: "COMPLETED",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  db.keyResults.push({
    id: "kr-closed",
    objectiveId: "objective-closed",
    ownerId: employee.id,
    title: "已关闭KR",
    type: "NUMERIC",
    direction: "INCREASE",
    baselineValue: 0,
    targetValue: 100,
    currentValue: 80,
    progress: 80,
    weight: 100,
    source: "MANUAL",
  });

  const checked = await service.checkIn(employee, "kr-closed", {
    currentValue: 90,
  });
  const extraKr = await service.addKeyResult(admin, "objective-closed", {
    title: "补录KR",
    ownerId: employee.id,
    type: "NUMERIC",
    direction: "INCREASE",
    baselineValue: 0,
    targetValue: 100,
    weight: 100,
  });
  assert.equal(checked.code, 409);
  assert.equal(extraKr.code, 409);
  assert.equal(db.checkIns.length, 0);
});

test("keeps published objective definitions immutable and records scoring review before close", async () => {
  const { prisma, db } = memoryPrisma();
  const service = createOkrService({
    prisma,
    now: () => new Date("2026-09-30T18:00:00+08:00"),
  });
  db.cycles.push({
    id: "cycle-scoring",
    name: "2026Q3",
    year: 2026,
    quarter: 3,
    status: "SCORING",
    startAt: new Date("2026-07-01"),
    endAt: new Date("2026-09-30"),
  });
  db.objectives.push({
    id: "objective-scoring",
    cycleId: "cycle-scoring",
    scope: "INDIVIDUAL",
    ownerId: employee.id,
    ownerName: employee.name,
    departmentId: employee.departmentId,
    title: "提升销售效能",
    description: null,
    weight: 100,
    status: "PUBLISHED",
    progress: 80,
    health: "ON_TRACK",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  db.keyResults.push({
    id: "kr-scoring",
    objectiveId: "objective-scoring",
    ownerId: employee.id,
    title: "达成目标",
    type: "NUMERIC",
    direction: "INCREASE",
    baselineValue: 0,
    targetValue: 100,
    currentValue: 80,
    progress: 80,
    weight: 100,
    source: "MANUAL",
  });

  const mutated = await service.updateObjective(admin, "objective-scoring", {
    title: "静默改名",
  });
  assert.equal(mutated.code, 409);
  assert.equal(db.objectives[0].title, "提升销售效能");

  const reviewed = await service.submitReview(employee, "objective-scoring", {
    score: 0.8,
    summary: "已达成大部分结果",
    lessons: "需要更早处理阻塞",
  });
  assert.equal(reviewed.code, 0);
  assert.equal(db.reviews.length, 1);
  assert.equal(db.reviews[0].reviewerId, employee.id);

  const closed = await service.transitionCycle(
    admin,
    "cycle-scoring",
    "CLOSED",
  );
  assert.equal(closed.code, 0);
  assert.equal(db.cycles[0].status, "CLOSED");
  assert.equal(db.objectives[0].status, "COMPLETED");
});

test("department manage permission never writes outside the actor department tree", async () => {
  const { prisma, db } = memoryPrisma();
  const service = createOkrService({ prisma });
  db.cycles.push({
    id: "cycle-draft",
    name: "2026Q4",
    year: 2026,
    quarter: 4,
    status: "DRAFT",
    startAt: new Date("2026-10-01"),
    endAt: new Date("2026-12-31"),
  });
  db.objectives.push({
    id: "objective-delivery",
    cycleId: "cycle-draft",
    scope: "DEPARTMENT",
    ownerId: "delivery-manager",
    ownerName: "交付经理",
    departmentId: "dept-outsider",
    title: "交付目标",
    status: "DRAFT",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const result = await service.addKeyResult(
    salesManager,
    "objective-delivery",
    {
      title: "越权KR",
      ownerId: employee.id,
      type: "NUMERIC",
      direction: "INCREASE",
      baselineValue: 0,
      targetValue: 100,
      weight: 100,
    },
  );

  assert.equal(result.code, 403);
  assert.equal(db.keyResults.length, 0);
});

test("write operations enforce actor scope, objective ownership and assignee scope", async () => {
  const { prisma, db } = memoryPrisma();
  const service = createOkrService({ prisma });
  db.users.push({
    id: "delivery-user",
    name: "交付员工",
    departmentId: "dept-outsider",
    positionId: "position-sales",
    positionName: "交付工程师",
  });
  db.cycles.push(
    {
      id: "draft-scope",
      name: "2026Q4",
      year: 2026,
      quarter: 4,
      status: "DRAFT",
      startAt: new Date("2026-10-01"),
      endAt: new Date("2026-12-31"),
    },
    {
      id: "active-scope",
      name: "2027Q1",
      year: 2027,
      quarter: 1,
      status: "ACTIVE",
      startAt: new Date("2027-01-01"),
      endAt: new Date("2027-03-31"),
    },
    {
      id: "scoring-scope",
      name: "2027Q2",
      year: 2027,
      quarter: 2,
      status: "SCORING",
      startAt: new Date("2027-04-01"),
      endAt: new Date("2027-06-30"),
    },
  );
  db.objectives.push(
    {
      id: "sales-draft",
      cycleId: "draft-scope",
      scope: "DEPARTMENT",
      ownerId: salesManager.id,
      departmentId: "dept-sales",
      title: "销售目标",
      status: "DRAFT",
    },
    {
      id: "delivery-active",
      cycleId: "active-scope",
      scope: "DEPARTMENT",
      ownerId: "delivery-user",
      departmentId: "dept-outsider",
      title: "交付活动目标",
      status: "PUBLISHED",
    },
    {
      id: "delivery-scoring",
      cycleId: "scoring-scope",
      scope: "DEPARTMENT",
      ownerId: "delivery-user",
      departmentId: "dept-outsider",
      title: "交付评分目标",
      status: "PUBLISHED",
    },
  );
  db.keyResults.push({
    id: "delivery-kr",
    objectiveId: "delivery-active",
    ownerId: "delivery-user",
    departmentId: "dept-outsider",
    title: "交付KR",
    type: "NUMERIC",
    direction: "INCREASE",
    baselineValue: 0,
    targetValue: 100,
    currentValue: 20,
    progress: 20,
    weight: 100,
  });

  const createdOutside = await service.createObjective(salesManager, {
    cycleId: "draft-scope",
    scope: "INDIVIDUAL",
    title: "越权目标",
    ownerId: "delivery-user",
    weight: 100,
  });
  const assignedOutside = await service.addKeyResult(
    salesManager,
    "sales-draft",
    {
      title: "越权负责人",
      ownerId: "delivery-user",
      type: "NUMERIC",
      direction: "INCREASE",
      baselineValue: 0,
      targetValue: 100,
      weight: 100,
    },
  );
  const checkedOutside = await service.checkIn(salesManager, "delivery-kr", {
    currentValue: 30,
  });
  const reviewedOutside = await service.submitReview(
    {
      ...salesManager,
      permissions: [
        ...salesManager.permissions,
        permission("目标管理/评分与关闭"),
      ],
    },
    "delivery-scoring",
    { score: 0.6, summary: "越权评分" },
  );

  assert.deepEqual(
    [
      createdOutside.code,
      assignedOutside.code,
      checkedOutside.code,
      reviewedOutside.code,
    ],
    [403, 403, 403, 403],
  );
  assert.equal(db.checkIns.length, 0);
  assert.equal(db.reviews.length, 0);
});

test("assignable user directory returns only minimal active users in actor scope", async () => {
  const { prisma, db } = memoryPrisma();
  db.users.forEach((user: any) =>
    Object.assign(user, {
      isActive: true,
      employmentStatus: "active",
      email: `${user.id}@example.com`,
      phone: "secret",
    }),
  );
  db.users.push(
    {
      id: "delivery-user",
      name: "交付员工",
      departmentId: "dept-outsider",
      positionId: "position-sales",
      positionName: "交付",
      isActive: true,
      employmentStatus: "active",
      email: "outside@example.com",
    },
    {
      id: "left-sales",
      name: "离职销售",
      departmentId: "dept-sales",
      isActive: true,
      employmentStatus: "left",
      email: "left@example.com",
    },
  );
  const service = createOkrService({ prisma });

  const self = await service.listAssignableUsers(employee);
  const team = await service.listAssignableUsers(salesManager);

  assert.deepEqual(self.data, [
    {
      id: employee.id,
      name: employee.name,
      departmentId: "dept-sales",
      departmentName: "销售部",
      positionId: "position-sales",
      positionName: "销售顾问",
    },
  ]);
  assert.deepEqual(
    team.data?.map((item: any) => item.id),
    [employee.id, salesManager.id],
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(team.data![0], "email"),
    false,
  );
  assert.equal(
    team.data?.some(
      (item: any) => item.id === "delivery-user" || item.id === "left-sales",
    ),
    false,
  );
});

test("alignment directory returns every visible higher-level target for the selected cycle", async () => {
  const { prisma, db } = memoryPrisma();
  db.cycles.push({ id: "alignment-cycle", status: "DRAFT" });
  db.objectives.push(
    {
      id: "company-parent",
      cycleId: "alignment-cycle",
      scope: "COMPANY",
      ownerId: admin.id,
      ownerName: admin.name,
      title: "公司增长",
      status: "DRAFT",
    },
    {
      id: "department-parent",
      cycleId: "alignment-cycle",
      scope: "DEPARTMENT",
      ownerId: salesManager.id,
      ownerName: salesManager.name,
      departmentId: "dept-sales",
      title: "销售增长",
      status: "DRAFT",
    },
    {
      id: "individual-sibling",
      cycleId: "alignment-cycle",
      scope: "INDIVIDUAL",
      ownerId: employee.id,
      ownerName: employee.name,
      departmentId: "dept-sales",
      title: "个人增长",
      status: "DRAFT",
    },
  );
  const service = createOkrService({ prisma });

  const result = await service.listAlignmentObjectives(admin, {
    cycleId: "alignment-cycle",
    childScope: "INDIVIDUAL",
  });

  assert.equal(result.code, 0);
  assert.deepEqual(result.data?.map((item: any) => item.id).sort(), [
    "company-parent",
    "department-parent",
  ]);
});

test("task links require a visible KR and an in-scope employee task, and reject duplicates", async () => {
  const { prisma, db } = memoryPrisma();
  const service = createOkrService({ prisma });
  db.cycles.push({ id: "active-tasks", status: "ACTIVE" });
  db.objectives.push(
    {
      id: "sales-objective",
      cycleId: "active-tasks",
      scope: "DEPARTMENT",
      ownerId: salesManager.id,
      departmentId: "dept-sales",
      title: "销售目标",
      status: "PUBLISHED",
    },
    {
      id: "outside-objective",
      cycleId: "active-tasks",
      scope: "DEPARTMENT",
      ownerId: "delivery",
      departmentId: "dept-outsider",
      title: "交付目标",
      status: "PUBLISHED",
    },
  );
  db.keyResults.push(
    {
      id: "sales-kr",
      objectiveId: "sales-objective",
      ownerId: employee.id,
      departmentId: "dept-sales",
      title: "销售KR",
    },
    {
      id: "outside-kr",
      objectiveId: "outside-objective",
      ownerId: "delivery",
      departmentId: "dept-outsider",
      title: "交付KR",
    },
  );
  db.tasks.push(
    {
      id: "sales-task",
      employeeId: employee.id,
      employeeName: employee.name,
      departmentIdSnapshot: "dept-sales",
      title: "跟进客户",
    },
    {
      id: "outside-task",
      employeeId: "delivery",
      employeeName: "交付",
      departmentIdSnapshot: "dept-outsider",
      title: "完成交付",
    },
  );

  assert.equal(
    (
      await service.linkTask(salesManager, "sales-kr", {
        taskId: "outside-task",
      })
    ).code,
    403,
  );
  assert.equal(
    (
      await service.linkTask(salesManager, "outside-kr", {
        taskId: "sales-task",
      })
    ).code,
    403,
  );
  const linked = await service.linkTask(salesManager, "sales-kr", {
    taskId: "sales-task",
  });
  assert.equal(linked.code, 0);
  assert.equal(linked.data?.taskTitle, "跟进客户");
  assert.equal(
    (await service.linkTask(salesManager, "sales-kr", { taskId: "sales-task" }))
      .code,
    409,
  );
  const listed = await service.listKeyResultTasks(salesManager, "sales-kr");
  assert.deepEqual(
    listed.data?.map((item: any) => item.taskId),
    ["sales-task"],
  );
});

test("objective owners still need write permission to edit definitions, add KRs and link tasks", async () => {
  const { prisma, db } = memoryPrisma();
  const readOnlyOwner: any = {
    ...employee,
    permissions: [permission("目标管理/查看本人目标", ["read"])],
  };
  db.cycles.push({ id: "owner-draft", status: "DRAFT" });
  db.objectives.push({
    id: "owned-objective",
    cycleId: "owner-draft",
    scope: "INDIVIDUAL",
    ownerId: readOnlyOwner.id,
    departmentId: "dept-sales",
    title: "本人目标",
    status: "DRAFT",
    weight: 100,
  });
  db.keyResults.push({
    id: "owned-kr",
    objectiveId: "owned-objective",
    ownerId: readOnlyOwner.id,
    departmentId: "dept-sales",
    title: "本人KR",
  });
  db.tasks.push({
    id: "owned-task",
    employeeId: readOnlyOwner.id,
    departmentIdSnapshot: "dept-sales",
    title: "本人任务",
  });
  const service = createOkrService({ prisma });

  const edited = await service.updateObjective(
    readOnlyOwner,
    "owned-objective",
    { title: "越权改名" },
  );
  const added = await service.addKeyResult(readOnlyOwner, "owned-objective", {
    title: "越权KR",
    ownerId: readOnlyOwner.id,
    type: "NUMERIC",
    direction: "INCREASE",
    baselineValue: 0,
    targetValue: 100,
    weight: 100,
  });
  const linked = await service.linkTask(readOnlyOwner, "owned-kr", {
    taskId: "owned-task",
  });

  assert.deepEqual([edited.code, added.code, linked.code], [403, 403, 403]);
  assert.equal(db.objectives[0].title, "本人目标");
  assert.equal(db.taskLinks.length, 0);
});

test("notification delivery failure does not reverse an activated cycle", async () => {
  const { prisma, db } = memoryPrisma();
  db.cycles.push({
    id: "notify-draft",
    status: "DRAFT",
    startAt: new Date("2026-07-01"),
    endAt: new Date("2026-09-30"),
    checkInWeekday: 5,
  });
  db.objectives.push({
    id: "notify-objective",
    cycleId: "notify-draft",
    scope: "INDIVIDUAL",
    ownerId: employee.id,
    ownerName: employee.name,
    departmentId: "dept-sales",
    title: "需通知的目标",
    status: "DRAFT",
  });
  db.keyResults.push({
    id: "notify-kr",
    objectiveId: "notify-objective",
    ownerId: employee.id,
    weight: 100,
  });
  const service = createOkrService({
    prisma,
    notifications: {
      assignOkr: async () => {
        throw new Error("notification unavailable");
      },
      riskOkr: async () => undefined,
      resolveOkr: async () => undefined,
    },
  });

  const activated = await service.transitionCycle(
    admin,
    "notify-draft",
    "ACTIVE",
  );

  assert.equal(activated.code, 0);
  assert.equal(db.cycles[0].status, "ACTIVE");
  assert.equal(db.objectives[0].status, "PUBLISHED");
});

test("notification failure does not reject a committed check-in", async () => {
  const { prisma, db } = memoryPrisma();
  db.cycles.push({ id: "notify-active", status: "ACTIVE" });
  db.objectives.push({
    id: "notify-check-objective",
    cycleId: "notify-active",
    scope: "INDIVIDUAL",
    ownerId: employee.id,
    ownerName: employee.name,
    departmentId: "dept-sales",
    title: "检视通知目标",
    status: "PUBLISHED",
  });
  db.keyResults.push({
    id: "notify-check-kr",
    objectiveId: "notify-check-objective",
    ownerId: employee.id,
    ownerName: employee.name,
    departmentId: "dept-sales",
    title: "风险KR",
    type: "NUMERIC",
    direction: "INCREASE",
    baselineValue: 0,
    targetValue: 100,
    currentValue: 10,
    progress: 10,
    health: "AT_RISK",
    weight: 100,
    source: "MANUAL",
  });
  const service = createOkrService({
    prisma,
    notifications: {
      assignOkr: async () => undefined,
      riskOkr: async () => {
        throw new Error("risk notification unavailable");
      },
      resolveOkr: async () => {
        throw new Error("resolve notification unavailable");
      },
    },
  });

  const checked = await service.checkIn(employee, "notify-check-kr", {
    currentValue: 20,
    confidence: 2,
  });

  assert.equal(checked.code, 0);
  assert.equal(db.checkIns.length, 1);
  assert.equal(db.keyResults[0].currentValue, 20);
});

test("lists only the actor own KRs not checked in during the current Shanghai weekly window", async () => {
  const { prisma, db } = memoryPrisma();
  db.cycles.push({
    id: "due-cycle",
    status: "ACTIVE",
    checkInWeekday: 5,
    startAt: new Date("2026-07-01T00:00:00+08:00"),
    endAt: new Date("2026-09-30T23:59:59+08:00"),
  });
  db.objectives.push(
    {
      id: "due-objective-a",
      cycleId: "due-cycle",
      scope: "INDIVIDUAL",
      ownerId: employee.id,
      title: "目标A",
      status: "PUBLISHED",
    },
    {
      id: "due-objective-b",
      cycleId: "due-cycle",
      scope: "DEPARTMENT",
      ownerId: salesManager.id,
      title: "目标B",
      status: "PUBLISHED",
    },
  );
  db.keyResults.push(
    {
      id: "due-kr-b",
      objectiveId: "due-objective-a",
      ownerId: employee.id,
      title: "待检视B",
      dueAt: new Date("2026-08-20T18:00:00+08:00"),
    },
    {
      id: "due-kr-a",
      objectiveId: "due-objective-b",
      ownerId: employee.id,
      title: "待检视A",
      dueAt: new Date("2026-08-18T18:00:00+08:00"),
    },
    {
      id: "checked-current-week",
      objectiveId: "due-objective-a",
      ownerId: employee.id,
      title: "本周已检视",
      dueAt: new Date("2026-08-17T18:00:00+08:00"),
    },
    {
      id: "other-owner-kr",
      objectiveId: "due-objective-b",
      ownerId: salesManager.id,
      title: "他人KR",
      dueAt: new Date("2026-08-16T18:00:00+08:00"),
    },
  );
  db.checkIns.push(
    {
      id: "old-check-in",
      keyResultId: "due-kr-a",
      createdAt: new Date("2026-08-07T18:00:00+08:00"),
    },
    {
      id: "current-check-in",
      keyResultId: "checked-current-week",
      createdAt: new Date("2026-08-12T18:00:00+08:00"),
    },
  );
  const service = createOkrService({
    prisma,
    now: () => new Date("2026-08-14T10:00:00+08:00"),
  });

  const firstPage = await service.listDueCheckIns(employee, {
    cycleId: "due-cycle",
    page: 1,
    pageSize: 1,
  });
  const secondPage = await service.listDueCheckIns(employee, {
    cycleId: "due-cycle",
    page: 2,
    pageSize: 1,
  });

  assert.equal(firstPage.code, 0);
  assert.equal(firstPage.data?.total, 2);
  assert.deepEqual(
    firstPage.data?.items.map((item: any) => item.keyResult.id),
    ["due-kr-a"],
  );
  assert.deepEqual(
    secondPage.data?.items.map((item: any) => item.keyResult.id),
    ["due-kr-b"],
  );
  assert.equal(firstPage.data?.items[0].objective.id, "due-objective-b");
});

test("refuses to close a scoring cycle until every objective owner submits a self review", async () => {
  const { prisma, db } = memoryPrisma();
  db.cycles.push({ id: "review-gate-cycle", status: "SCORING" });
  db.objectives.push(
    {
      id: "reviewed-objective",
      cycleId: "review-gate-cycle",
      scope: "INDIVIDUAL",
      ownerId: employee.id,
      status: "PUBLISHED",
    },
    {
      id: "missing-review-objective",
      cycleId: "review-gate-cycle",
      scope: "DEPARTMENT",
      ownerId: salesManager.id,
      status: "PUBLISHED",
    },
  );
  db.reviews.push({
    id: "self-review",
    objectiveId: "reviewed-objective",
    reviewerId: employee.id,
    reviewerType: "SELF",
    score: 0.8,
  });
  const service = createOkrService({ prisma });

  const closed = await service.transitionCycle(
    admin,
    "review-gate-cycle",
    "CLOSED",
  );

  assert.equal(closed.code, 409);
  assert.equal(db.cycles[0].status, "SCORING");
  assert.equal(
    db.objectives.every((objective: any) => objective.status === "PUBLISHED"),
    true,
  );
});

test("cycle transition uses the observed status as an atomic compare-and-set guard", async () => {
  const { prisma, db } = memoryPrisma();
  db.cycles.push({ id: "concurrent-cycle", status: "ACTIVE" });
  const originalUpdateMany = prisma.okrCycle.updateMany;
  prisma.okrCycle.updateMany = async ({ where, data }: any) => {
    db.cycles[0].status = "SCORING";
    return originalUpdateMany({ where, data });
  };
  const service = createOkrService({ prisma });

  const result = await service.transitionCycle(
    admin,
    "concurrent-cycle",
    "SCORING",
  );

  assert.equal(result.code, 409);
  assert.equal(db.events.length, 0);
});

test("does not create a draft objective after its cycle becomes active during validation", async () => {
  const { prisma, db } = memoryPrisma();
  db.cycles.push({ id: "objective-race-cycle", status: "DRAFT" });
  const originalQueryRaw = prisma.$queryRaw;
  prisma.$queryRaw = async (
    strings: TemplateStringsArray,
    ...values: any[]
  ) => {
    db.cycles[0].status = "ACTIVE";
    return originalQueryRaw(strings, ...values);
  };
  const service = createOkrService({ prisma });

  const result = await service.createObjective(admin, {
    cycleId: "objective-race-cycle",
    scope: "COMPANY",
    title: "并发草稿目标",
    ownerId: admin.id,
    weight: 100,
  });

  assert.equal(result.code, 409);
  assert.equal(db.objectives.length, 0);
  assert.equal(db.events.length, 0);
});

test("does not add a KR after its cycle becomes active during validation", async () => {
  const { prisma, db } = memoryPrisma();
  db.cycles.push({ id: "kr-race-cycle", status: "DRAFT" });
  db.objectives.push({
    id: "kr-race-objective",
    cycleId: "kr-race-cycle",
    scope: "INDIVIDUAL",
    ownerId: employee.id,
    departmentId: "dept-sales",
    title: "草稿目标",
    status: "DRAFT",
  });
  const originalQueryRaw = prisma.$queryRaw;
  prisma.$queryRaw = async (
    strings: TemplateStringsArray,
    ...values: any[]
  ) => {
    db.cycles[0].status = "ACTIVE";
    db.objectives[0].status = "PUBLISHED";
    return originalQueryRaw(strings, ...values);
  };
  const service = createOkrService({ prisma });

  const result = await service.addKeyResult(
    {
      ...employee,
      permissions: [...employee.permissions, permission("目标管理/创建目标")],
    },
    "kr-race-objective",
    {
      title: "并发草稿KR",
      ownerId: employee.id,
      type: "NUMERIC",
      direction: "INCREASE",
      baselineValue: 0,
      targetValue: 100,
      weight: 100,
    },
  );

  assert.equal(result.code, 409);
  assert.equal(db.keyResults.length, 0);
  assert.equal(db.events.length, 0);
});

test("does not update a draft objective when activation wins the cycle lock", async () => {
  const { prisma, db } = memoryPrisma();
  db.cycles.push({ id: "update-race-cycle", status: "DRAFT" });
  db.objectives.push({
    id: "update-race-objective",
    cycleId: "update-race-cycle",
    scope: "INDIVIDUAL",
    ownerId: employee.id,
    departmentId: "dept-sales",
    title: "原目标",
    status: "DRAFT",
    weight: 100,
  });
  const originalQueryRaw = prisma.$queryRaw;
  prisma.$queryRaw = async (
    strings: TemplateStringsArray,
    ...values: any[]
  ) => {
    db.cycles[0].status = "ACTIVE";
    db.objectives[0].status = "PUBLISHED";
    return originalQueryRaw(strings, ...values);
  };
  const service = createOkrService({ prisma });

  const result = await service.updateObjective(
    {
      ...employee,
      permissions: [...employee.permissions, permission("目标管理/创建目标")],
    },
    "update-race-objective",
    { title: "并发改名" },
  );

  assert.equal(result.code, 409);
  assert.equal(db.objectives[0].title, "原目标");
  assert.equal(db.events.length, 0);
});

test("returns a stable conflict when the same reviewer submits the same review twice", async () => {
  const { prisma, db } = memoryPrisma();
  db.cycles.push({ id: "duplicate-review-cycle", status: "SCORING" });
  db.objectives.push({
    id: "duplicate-review-objective",
    cycleId: "duplicate-review-cycle",
    scope: "INDIVIDUAL",
    ownerId: employee.id,
    departmentId: "dept-sales",
    title: "待复盘目标",
    status: "PUBLISHED",
  });
  db.reviews.push({
    id: "existing-review",
    objectiveId: "duplicate-review-objective",
    reviewerId: employee.id,
    reviewerType: "SELF",
    score: 0.8,
  });
  prisma.okrReview.findFirst = async () => null;
  const service = createOkrService({ prisma });

  const result = await service.submitReview(
    employee,
    "duplicate-review-objective",
    { score: 0.9, summary: "再次提交" },
  );

  assert.equal(result.code, 409);
  assert.equal(db.reviews.length, 1);
  assert.equal(db.events.length, 0);
});

test("activation revalidates objectives after serializing with a concurrent objective creation", async () => {
  const { prisma, db } = memoryPrisma();
  db.cycles.push({ id: "objective-activation-race", status: "DRAFT" });
  db.objectives.push({
    id: "ready-objective",
    cycleId: "objective-activation-race",
    title: "已就绪目标",
    status: "DRAFT",
  });
  db.keyResults.push({
    id: "ready-kr",
    objectiveId: "ready-objective",
    weight: 100,
  });
  const originalQueryRaw = prisma.$queryRaw;
  let injected = false;
  prisma.$queryRaw = async (
    strings: TemplateStringsArray,
    ...values: any[]
  ) => {
    if (!injected && values[0] === "objective-activation-race") {
      injected = true;
      db.objectives.push({
        id: "concurrent-objective",
        cycleId: "objective-activation-race",
        title: "并发新建目标",
        status: "DRAFT",
      });
    }
    return originalQueryRaw(strings, ...values);
  };
  const service = createOkrService({ prisma });

  const result = await service.transitionCycle(
    admin,
    "objective-activation-race",
    "ACTIVE",
  );

  assert.equal(result.code, 409);
  assert.equal(db.cycles[0].status, "DRAFT");
  assert.equal(
    db.objectives.every((objective: any) => objective.status === "DRAFT"),
    true,
  );
  assert.equal(db.events.length, 0);
});

test("activation revalidates KR weights after serializing with a concurrent KR creation", async () => {
  const { prisma, db } = memoryPrisma();
  db.cycles.push({ id: "kr-activation-race", status: "DRAFT" });
  db.objectives.push({
    id: "kr-race-ready-objective",
    cycleId: "kr-activation-race",
    title: "已就绪目标",
    status: "DRAFT",
  });
  db.keyResults.push({
    id: "kr-race-ready-kr",
    objectiveId: "kr-race-ready-objective",
    weight: 100,
  });
  const originalQueryRaw = prisma.$queryRaw;
  let injected = false;
  prisma.$queryRaw = async (
    strings: TemplateStringsArray,
    ...values: any[]
  ) => {
    if (!injected && values[0] === "kr-activation-race") {
      injected = true;
      db.keyResults.push({
        id: "concurrent-kr",
        objectiveId: "kr-race-ready-objective",
        weight: 50,
      });
    }
    return originalQueryRaw(strings, ...values);
  };
  const service = createOkrService({ prisma });

  const result = await service.transitionCycle(
    admin,
    "kr-activation-race",
    "ACTIVE",
  );

  assert.equal(result.code, 409);
  assert.equal(db.cycles[0].status, "DRAFT");
  assert.equal(db.objectives[0].status, "DRAFT");
  assert.equal(db.events.length, 0);
});

test("lifecycle transitions prevent late check-ins, reviews and task links", async () => {
  const { prisma, db } = memoryPrisma();
  db.cycles.push({ id: "late-write-cycle", status: "ACTIVE" });
  db.objectives.push({
    id: "late-write-objective",
    cycleId: "late-write-cycle",
    scope: "INDIVIDUAL",
    ownerId: employee.id,
    ownerName: employee.name,
    departmentId: "dept-sales",
    title: "生命周期目标",
    status: "PUBLISHED",
  });
  db.keyResults.push({
    id: "late-write-kr",
    objectiveId: "late-write-objective",
    ownerId: employee.id,
    ownerName: employee.name,
    type: "NUMERIC",
    direction: "INCREASE",
    baselineValue: 0,
    targetValue: 100,
    currentValue: 0,
    progress: 0,
    weight: 100,
    source: "MANUAL",
  });
  db.tasks.push({
    id: "late-write-task",
    employeeId: employee.id,
    departmentIdSnapshot: "dept-sales",
    title: "执行任务",
  });
  const originalQueryRaw = prisma.$queryRaw;
  let nextStatus = "SCORING";
  prisma.$queryRaw = async (
    strings: TemplateStringsArray,
    ...values: any[]
  ) => {
    db.cycles[0].status = nextStatus;
    return originalQueryRaw(strings, ...values);
  };
  const service = createOkrService({ prisma });

  const checkIn = await service.checkIn(employee, "late-write-kr", {
    currentValue: 20,
    confidence: 4,
  });
  db.cycles[0].status = "SCORING";
  nextStatus = "CLOSED";
  const review = await service.submitReview(employee, "late-write-objective", {
    score: 0.8,
    summary: "复盘",
  });
  db.cycles[0].status = "ACTIVE";
  const linked = await service.linkTask(
    {
      ...employee,
      permissions: [...employee.permissions, permission("目标管理/创建目标")],
    },
    "late-write-kr",
    { taskId: "late-write-task" },
  );

  assert.deepEqual([checkIn.code, review.code, linked.code], [409, 409, 409]);
  assert.equal(db.checkIns.length, 0);
  assert.equal(db.reviews.length, 0);
  assert.equal(db.taskLinks.length, 0);
  assert.equal(db.events.length, 0);
});
