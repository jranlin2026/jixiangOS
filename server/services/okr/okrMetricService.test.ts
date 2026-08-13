import assert from "node:assert/strict";
import test from "node:test";
import {
  createBusinessCockpitOkrMetricProvider,
  createOkrMetricService,
} from "./okrMetricService";

const permission = (module: string, actions = ["read", "write"]) => ({
  module,
  actions,
});

const admin: any = {
  id: "admin",
  name: "管理员",
  role: "超级管理员",
  departmentId: "dept-hq",
  isActive: true,
  permissions: [{ module: "全部", actions: ["admin"] }],
};

const manager: any = {
  id: "manager-sales",
  name: "销售经理",
  role: "销售经理",
  roleId: "role-manager",
  departmentId: "dept-sales",
  isActive: true,
  permissions: [
    permission("目标管理/绑定经营指标"),
    permission("目标管理/管理部门目标"),
  ],
};

function memoryPrisma() {
  const db: any = {
    cycles: [
      {
        id: "cycle-q3",
        status: "DRAFT",
        startAt: new Date("2026-07-01T00:00:00+08:00"),
        endAt: new Date("2026-09-30T23:59:59+08:00"),
      },
    ],
    objectives: [
      {
        id: "objective-sales",
        cycleId: "cycle-q3",
        scope: "DEPARTMENT",
        departmentId: "dept-sales",
        ownerId: manager.id,
        progress: 0,
        health: "ON_TRACK",
      },
      {
        id: "objective-delivery",
        cycleId: "cycle-q3",
        scope: "DEPARTMENT",
        departmentId: "dept-delivery",
        ownerId: "manager-delivery",
        progress: 0,
        health: "ON_TRACK",
      },
    ],
    keyResults: [
      {
        id: "kr-sales",
        objectiveId: "objective-sales",
        type: "NUMERIC",
        direction: "INCREASE",
        baselineValue: 0,
        targetValue: 100000,
        currentValue: 0,
        weight: 100,
        progress: 0,
        health: "ON_TRACK",
        source: "MANUAL",
      },
      {
        id: "kr-delivery",
        objectiveId: "objective-delivery",
        type: "NUMERIC",
        direction: "INCREASE",
        baselineValue: 0,
        targetValue: 100,
        currentValue: 0,
        weight: 100,
        progress: 0,
        health: "ON_TRACK",
        source: "MANUAL",
      },
    ],
    bindings: [] as any[],
    snapshots: [] as any[],
    events: [] as any[],
    transactionCount: 0,
    cycleLocks: [] as any[],
    failEventAction: "" as string,
    departments: [
      { id: "dept-hq", parentId: null },
      { id: "dept-sales", parentId: "dept-hq" },
      { id: "dept-sales-east", parentId: "dept-sales" },
      { id: "dept-delivery", parentId: "dept-hq" },
    ],
    users: [
      {
        id: manager.id,
        name: manager.name,
        account: "manager-sales",
        email: "manager@example.com",
        phone: "",
        role: "销售经理",
        roleId: "role-manager",
        departmentId: "dept-sales",
        positionId: null,
        positionName: null,
        passwordHash: null,
        passwordSalt: null,
        passwordUpdatedAt: null,
        mustChangePassword: false,
        lastLoginAt: null,
        isActive: true,
        employmentStatus: "active",
        leftAt: null,
        leftBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "sales-east",
        name: "销售乙",
        account: "sales-east",
        email: "sales@example.com",
        phone: "",
        role: "销售专员",
        roleId: "role-manager",
        departmentId: "dept-sales-east",
        positionId: null,
        positionName: null,
        passwordHash: null,
        passwordSalt: null,
        passwordUpdatedAt: null,
        mustChangePassword: false,
        lastLoginAt: null,
        isActive: true,
        employmentStatus: "active",
        leftAt: null,
        leftBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "manager-delivery",
        name: "交付经理",
        account: "manager-delivery",
        email: "delivery@example.com",
        phone: "",
        role: "交付经理",
        roleId: "role-manager",
        departmentId: "dept-delivery",
        positionId: null,
        positionName: null,
        passwordHash: null,
        passwordSalt: null,
        passwordUpdatedAt: null,
        mustChangePassword: false,
        lastLoginAt: null,
        isActive: true,
        employmentStatus: "active",
        leftAt: null,
        leftBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  };
  const find = (rows: any[], id: string) =>
    rows.find((row) => row.id === id) || null;
  const prisma: any = {
    okrCycle: {
      findUnique: async ({ where }: any) => find(db.cycles, where.id),
    },
    objective: {
      findUnique: async ({ where }: any) => find(db.objectives, where.id),
      update: async ({ where, data }: any) =>
        Object.assign(find(db.objectives, where.id), data),
    },
    keyResult: {
      findUnique: async ({ where }: any) => find(db.keyResults, where.id),
      findMany: async ({ where }: any) =>
        db.keyResults.filter(
          (row: any) => row.objectiveId === where.objectiveId,
        ),
      update: async ({ where, data }: any) =>
        Object.assign(find(db.keyResults, where.id), data),
    },
    okrMetricBinding: {
      findUnique: async ({ where }: any) =>
        db.bindings.find(
          (row: any) =>
            row.keyResultId === where.keyResultId || row.id === where.id,
        ) || null,
      findFirst: async ({ where }: any) =>
        db.bindings.find((row: any) => {
          if (
            row.id !== where.id ||
            (where.leaseOwner && row.leaseOwner !== where.leaseOwner) ||
            (where.leaseEpoch !== undefined &&
              row.leaseEpoch !== where.leaseEpoch)
          )
            return false;
          if (!where.keyResult?.objective?.cycle?.status) return true;
          const keyResult = find(db.keyResults, row.keyResultId);
          const objective =
            keyResult && find(db.objectives, keyResult.objectiveId);
          const cycle = objective && find(db.cycles, objective.cycleId);
          return cycle?.status === where.keyResult.objective.cycle.status;
        }) || null,
      create: async ({ data }: any) => {
        db.bindings.push(data);
        return data;
      },
    },
    okrMetricSnapshot: {
      create: async ({ data }: any) => {
        if (
          db.snapshots.some(
            (row: any) =>
              row.bindingId === data.bindingId &&
              row.refreshSlot === data.refreshSlot,
          )
        )
          throw Object.assign(new Error("unique"), { code: "P2002" });
        db.snapshots.push(data);
        return data;
      },
    },
    okrEvent: {
      create: async ({ data }: any) => {
        if (db.failEventAction === data.action)
          throw new Error("simulated event persistence failure");
        db.events.push(data);
        return data;
      },
    },
    role: {
      findUnique: async () => ({
        id: "role-manager",
        name: "销售经理",
        code: "sales_manager",
        description: null,
        departmentId: null,
        permissions: [],
        dataScopes: {
          okr: "department",
          orders: "department",
          recoveryOrders: "self",
        },
        memberCount: 2,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      findMany: async () => [
        {
          id: "role-manager",
          name: "销售经理",
          code: "sales_manager",
          description: null,
          departmentId: null,
          permissions: [],
          dataScopes: {
            okr: "department",
            orders: "department",
            recoveryOrders: "self",
          },
          memberCount: 2,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    },
    department: {
      findMany: async () =>
        db.departments.map((row: any) => ({
          ...row,
          name: row.id,
          code: row.id,
          description: null,
          managerId: null,
          memberCount: 0,
          sortOrder: 0,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
    },
    user: {
      findUnique: async ({ where }: any) =>
        db.users.find((user: any) => user.id === where.id) || null,
      findMany: async ({ where = {} }: any = {}) =>
        db.users.filter(
          (user: any) =>
            (!where.id || user.id === where.id) &&
            (!where.departmentId?.in ||
              where.departmentId.in.includes(user.departmentId)) &&
            (!where.isActive || user.isActive) &&
            (!where.employmentStatus ||
              user.employmentStatus === where.employmentStatus),
        ),
    },
    $queryRaw: async (strings: TemplateStringsArray, ...values: any[]) => {
      const sql = Array.from(strings).join("?");
      if (!/FROM okr_cycles[\s\S]*FOR UPDATE/.test(sql))
        throw new Error(`unexpected raw query: ${sql}`);
      db.cycleLocks.push({ cycleId: values[0], sql });
      return db.cycles.filter((cycle: any) => cycle.id === values[0]);
    },
    $transaction: async (work: any) => {
      db.transactionCount += 1;
      const before = {
        bindings: structuredClone(db.bindings),
        snapshots: structuredClone(db.snapshots),
        events: structuredClone(db.events),
        keyResults: structuredClone(db.keyResults),
        objectives: structuredClone(db.objectives),
      };
      try {
        return await work(prisma);
      } catch (error) {
        db.bindings.splice(0, db.bindings.length, ...before.bindings);
        db.snapshots.splice(0, db.snapshots.length, ...before.snapshots);
        db.events.splice(0, db.events.length, ...before.events);
        db.keyResults.splice(0, db.keyResults.length, ...before.keyResults);
        db.objectives.splice(0, db.objectives.length, ...before.objectives);
        throw error;
      }
    },
  };
  return { prisma, db };
}

test("binds a trusted metric, derives its scope from the objective, and persists an auditable refresh snapshot", async () => {
  const { prisma, db } = memoryPrisma();
  const reads: any[] = [];
  const service = createOkrMetricService({
    prisma,
    now: () => new Date("2026-08-13T10:00:00+08:00"),
    provider: {
      read: async (input: any) => {
        reads.push(input);
        return {
          value: 50000,
          sourceCount: 3,
          qualityStatus: "OK",
          detail: { source: "business-cockpit-v1" },
        };
      },
    },
  });

  const bound = await service.bind(manager, "kr-sales", {
    metricCode: "FORMAL_ORDER_PAID_AMOUNT",
  });
  assert.equal(bound.code, 0);
  assert.equal(bound.data?.scopeType, "DEPARTMENT");
  assert.equal(bound.data?.scopeId, "dept-sales");
  assert.equal(
    db.transactionCount,
    1,
    "binding, KR source and audit event are committed atomically",
  );

  db.cycles[0].status = "ACTIVE";
  const refreshed = await service.refresh(manager, "kr-sales");
  assert.equal(refreshed.code, 0);
  assert.equal(reads[0].visibility.unrestricted, false);
  assert.deepEqual(reads[0].visibility.visibleUserIds.sort(), [
    "manager-sales",
    "sales-east",
  ]);
  assert.equal(db.snapshots.length, 1);
  assert.equal(db.snapshots[0].value, 50000);
  assert.equal(db.keyResults[0].source, "SYSTEM_METRIC");
  assert.equal(db.keyResults[0].currentValue, 50000);
  assert.equal(db.keyResults[0].progress, 50);
  assert.equal(db.objectives[0].progress, 50);
  assert.equal(db.events.at(-1).action, "REFRESH_METRIC");
});

test("metric binding follows objective lifecycle and department data boundary", async () => {
  const { prisma, db } = memoryPrisma();
  const service = createOkrMetricService({
    prisma,
    provider: { read: async () => ({ value: 1, qualityStatus: "OK" }) },
  });

  const outside = await service.bind(manager, "kr-delivery", {
    metricCode: "FORMAL_ORDER_COUNT",
  });
  assert.equal(outside.code, 403);

  db.cycles[0].status = "ACTIVE";
  const active = await service.bind(admin, "kr-sales", {
    metricCode: "FORMAL_ORDER_COUNT",
  });
  assert.equal(active.code, 409, "published KR definitions are frozen");

  const unknown = await service.bind(admin, "kr-sales", {
    metricCode: "LEAD_CONVERSION_RATE",
  });
  assert.equal(unknown.code, 400, "untrusted metrics must not be bindable");
});

test("metric binding does not change a KR after activation wins the cycle lock", async () => {
  const { prisma, db } = memoryPrisma();
  const originalQueryRaw = prisma.$queryRaw;
  prisma.$queryRaw = async (strings: TemplateStringsArray, ...values: any[]) => {
    db.cycles[0].status = "ACTIVE";
    return originalQueryRaw(strings, ...values);
  };
  const service = createOkrMetricService({
    prisma,
    provider: { read: async () => ({ value: 1, qualityStatus: "OK" }) },
  });

  const result = await service.bind(admin, "kr-sales", {
    metricCode: "FORMAL_ORDER_COUNT",
  });

  assert.equal(result.code, 409);
  assert.equal(db.bindings.length, 0);
  assert.equal(db.keyResults[0].source, "MANUAL");
  assert.equal(db.events.length, 0);
});

test("metric binding rolls back every write when its audit event cannot be persisted", async () => {
  const { prisma, db } = memoryPrisma();
  const service = createOkrMetricService({
    prisma,
    provider: { read: async () => ({ value: 1, qualityStatus: "OK" }) },
  });
  db.failEventAction = "BIND_METRIC";

  await assert.rejects(() =>
    service.bind(admin, "kr-sales", { metricCode: "FORMAL_ORDER_COUNT" }),
  );
  assert.equal(db.bindings.length, 0);
  assert.equal(db.keyResults[0].source, "MANUAL");
  assert.equal(db.events.length, 0);
});

test("system refresh uses a dedicated system principal and records a blocked snapshot on provider failure", async () => {
  const { prisma, db } = memoryPrisma();
  const service = createOkrMetricService({
    prisma,
    now: () => new Date("2026-08-13T10:00:00+08:00"),
    provider: {
      read: async () => {
        throw new Error("SELECT password FROM users; secret-token");
      },
    },
  });
  assert.equal(
    (
      await service.bind(admin, "kr-sales", {
        metricCode: "FORMAL_ORDER_COUNT",
      })
    ).code,
    0,
  );
  db.cycles[0].status = "ACTIVE";

  const result = await service.refreshSystem("kr-sales");

  assert.equal(result.code, 409);
  assert.equal(db.snapshots.length, 1);
  assert.equal(db.snapshots[0].qualityStatus, "BLOCKED");
  assert.deepEqual(db.snapshots[0].detail, {
    errorCode: "METRIC_PROVIDER_FAILED",
  });
  assert.doesNotMatch(
    JSON.stringify(db.snapshots[0].detail),
    /SELECT|password|secret/i,
  );
  assert.equal(
    db.keyResults[0].currentValue,
    0,
    "blocked readings must not update KR progress",
  );
  assert.equal(db.events.at(-1).action, "REFRESH_METRIC_BLOCKED");
  assert.equal(db.events.at(-1).actorId, "system:okr-metric-worker");
});

test("system refresh records data-quality blocks without treating them as successful readings", async () => {
  const { prisma, db } = memoryPrisma();
  const service = createOkrMetricService({
    prisma,
    provider: {
      read: async () => ({
        value: Number.NaN,
        qualityStatus: "BLOCKED",
        detail: { unsafe: "raw provider detail" },
      }),
    },
  });
  assert.equal(
    (
      await service.bind(admin, "kr-sales", {
        metricCode: "FORMAL_ORDER_COUNT",
      })
    ).code,
    0,
  );
  db.cycles[0].status = "ACTIVE";

  const result = await service.refreshSystem("kr-sales");

  assert.equal(result.code, 409);
  assert.equal(db.snapshots[0].qualityStatus, "BLOCKED");
  assert.deepEqual(db.snapshots[0].detail, {
    errorCode: "METRIC_DATA_BLOCKED",
  });
  assert.equal(
    db.events.some((event: any) => event.action === "REFRESH_METRIC"),
    false,
  );
});

test("business cockpit adapter exposes only the four audited v1 metrics and surfaces identity quality warnings", async () => {
  const calls: any[] = [];
  const provider = createBusinessCockpitOkrMetricProvider({
    getSnapshot: async (query: any) => {
      calls.push(query);
      return {
        code: 0,
        message: "ok",
        data: {
          business: {
            formalOrderPaidAmount: 888,
            formalOrderCount: 6,
            formalPaymentCount: 9,
            recoveryBusinessAmount: 300,
            recoveryOrderCount: 2,
          },
          dataQuality: { missingSalesIdentityPaymentCount: 1 },
        },
      } as any;
    },
  });

  const result = await provider.read({
    metricCode: "FORMAL_ORDER_PAID_AMOUNT",
    startAt: new Date("2026-07-01T00:00:00+08:00"),
    endAt: new Date("2026-08-13T10:00:00+08:00"),
    visibility: {
      unrestricted: false,
      visibleUserIds: ["sales-1"],
      visibleUserNames: ["销售甲"],
    },
  });
  assert.equal(result.value, 888);
  assert.equal(result.sourceCount, 9);
  assert.equal(result.qualityStatus, "WARNING");
  assert.deepEqual(calls[0].visibility.visibleUserIds, ["sales-1"]);
});

test("automatic metric visibility is the intersection of the OKR objective scope and creator business scope", async () => {
  const { prisma, db } = memoryPrisma();
  db.cycles[0].status = "DRAFT";
  db.objectives[0].scope = "COMPANY";
  db.objectives[0].departmentId = null;
  const reads: any[] = [];
  const service = createOkrMetricService({
    prisma,
    provider: {
      read: async (input: any) => {
        reads.push(input);
        return { value: 1, qualityStatus: "OK" };
      },
    },
  });
  const companyManager = {
    ...manager,
    permissions: [...manager.permissions, permission("目标管理/管理公司目标")],
  };
  assert.equal(
    (
      await service.bind(companyManager, "kr-sales", {
        metricCode: "FORMAL_ORDER_COUNT",
      })
    ).code,
    0,
  );
  db.cycles[0].status = "ACTIVE";

  assert.equal((await service.refreshSystem("kr-sales")).code, 0);
  assert.equal(
    reads[0].visibility.unrestricted,
    false,
    "公司目标不得绕过创建人的订单数据权限",
  );
  assert.deepEqual(reads[0].visibility.visibleUserIds.sort(), [
    "manager-sales",
    "sales-east",
  ]);
});

test("metric refresh does not write a snapshot or progress after the cycle stops being active", async () => {
  const { prisma, db } = memoryPrisma();
  const service = createOkrMetricService({
    prisma,
    provider: {
      read: async () => {
        db.cycles[0].status = "SCORING";
        return { value: 50000, qualityStatus: "OK" };
      },
    },
  });
  assert.equal(
    (
      await service.bind(admin, "kr-sales", {
        metricCode: "FORMAL_ORDER_PAID_AMOUNT",
      })
    ).code,
    0,
  );
  db.cycles[0].status = "ACTIVE";

  const refreshed = await service.refreshSystem("kr-sales");

  assert.equal(refreshed.code, 409);
  assert.equal(db.snapshots.length, 0);
  assert.equal(db.keyResults[0].currentValue, 0);
  assert.equal(
    db.events.some((event: any) => event.action === "REFRESH_METRIC"),
    false,
  );
});

test("metric refresh does not write after scoring transition wins the cycle lock", async () => {
  const { prisma, db } = memoryPrisma();
  const service = createOkrMetricService({
    prisma,
    provider: {
      read: async () => ({ value: 50000, qualityStatus: "OK" }),
    },
  });
  assert.equal(
    (
      await service.bind(admin, "kr-sales", {
        metricCode: "FORMAL_ORDER_PAID_AMOUNT",
      })
    ).code,
    0,
  );
  db.cycles[0].status = "ACTIVE";
  const originalQueryRaw = prisma.$queryRaw;
  prisma.$queryRaw = async (strings: TemplateStringsArray, ...values: any[]) => {
    db.cycles[0].status = "SCORING";
    return originalQueryRaw(strings, ...values);
  };

  const refreshed = await service.refreshSystem("kr-sales");

  assert.equal(refreshed.code, 409);
  assert.equal(db.snapshots.length, 0);
  assert.equal(db.keyResults[0].currentValue, 0);
  assert.equal(
    db.events.some((event: any) => event.action === "REFRESH_METRIC"),
    false,
  );
});
