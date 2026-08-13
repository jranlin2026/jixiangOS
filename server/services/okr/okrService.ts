import { randomUUID } from "node:crypto";
import type { AuthenticatedUser } from "../../../src/types/auth";
import {
  hasPermission,
  isSuperAdmin,
  PERMISSION_KEYS,
} from "../../../src/shared/utils/permissions";
import { failure, success } from "../../api/response";

type PrismaLike = any;
type OkrActor = AuthenticatedUser & {
  dataScopes?: { okr?: "self" | "department" | "all" };
};
type CycleStatus = "DRAFT" | "ACTIVE" | "SCORING" | "CLOSED";

type OkrNotifications = {
  assignOkr(
    client: any,
    input: {
      cycleId: string;
      objectiveId: string;
      title: string;
      publishedAt: Date;
      checkInAt?: Date;
      assignee: { id: string; name: string };
      manager?: { id: string; name: string } | null;
    },
  ): Promise<unknown>;
  riskOkr(
    client: any,
    input: {
      cycleId: string;
      objectiveId: string;
      title: string;
      riskAt: Date;
      assignee: { id: string; name: string };
      manager?: { id: string; name: string } | null;
    },
  ): Promise<unknown>;
  resolveOkr(
    client: any,
    objectiveId: string,
    reason: string,
  ): Promise<unknown>;
  scheduleOkrCheckIn?(
    client: any,
    input: {
      cycleId: string;
      objectiveId: string;
      title: string;
      scheduledFrom: Date;
      checkInAt?: Date;
      assignee: { id: string; name: string };
    },
  ): Promise<unknown>;
};

const KEYS = {
  SELF_READ: PERMISSION_KEYS.OKR_SELF_READ,
  TEAM_READ: PERMISSION_KEYS.OKR_TEAM_READ,
  CREATE: PERMISSION_KEYS.OKR_CREATE,
  CHECK_IN: PERMISSION_KEYS.OKR_CHECK_IN,
  DEPARTMENT_MANAGE: PERMISSION_KEYS.OKR_DEPARTMENT_MANAGE,
  COMPANY_MANAGE: PERMISSION_KEYS.OKR_COMPANY_MANAGE,
  CYCLE_MANAGE: PERMISSION_KEYS.OKR_CYCLE_MANAGE,
  SCORE_CLOSE: PERMISSION_KEYS.OKR_SCORE_CLOSE,
} as const;

function allowed(
  actor: OkrActor,
  key: string,
  action: "read" | "write" = "read",
) {
  return hasPermission(actor, key, action);
}

function text(value: unknown, max: number) {
  return String(value || "")
    .trim()
    .slice(0, max);
}

function date(value: unknown, endOfDay = false): Date | null {
  const source = String(value || "").trim();
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(source)
    ? new Date(`${source}T${endOfDay ? "23:59:59.999" : "00:00:00"}+08:00`)
    : new Date(source);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function finite(value: unknown): number | null {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function progressFor(kr: any, value: number): number {
  if (kr.type === "MILESTONE") return Math.max(0, Math.min(100, value));
  const baseline = Number(kr.baselineValue || 0);
  const target = Number(kr.targetValue);
  const distance =
    kr.direction === "DECREASE" ? baseline - target : target - baseline;
  if (distance === 0) return value === target ? 100 : 0;
  const completed =
    kr.direction === "DECREASE" ? baseline - value : value - baseline;
  return (
    Math.round(Math.max(0, Math.min(100, (completed / distance) * 100)) * 100) /
    100
  );
}

function evenlyDistributedWeights(count: number) {
  const totalCents = 10_000;
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;
  return Array.from({ length: count }, (_, index) =>
    (base + (index < remainder ? 1 : 0)) / 100,
  );
}

function healthFor(
  progress: number,
  confidence: number | null,
  explicit?: string,
) {
  if (["ON_TRACK", "AT_RISK", "OFF_TRACK"].includes(String(explicit)))
    return explicit;
  if (confidence !== null && confidence <= 2) return "OFF_TRACK";
  if ((confidence !== null && confidence === 3) || progress < 25)
    return "AT_RISK";
  return "ON_TRACK";
}

async function directorySnapshot(prisma: PrismaLike, ownerId: string) {
  const user = await prisma.user.findUnique({ where: { id: ownerId } });
  if (!user || user.isActive === false || user.employmentStatus === "left")
    return null;
  const [department, position] = await Promise.all([
    user.departmentId
      ? prisma.department.findUnique({ where: { id: user.departmentId } })
      : null,
    user.positionId
      ? prisma.position.findUnique({ where: { id: user.positionId } })
      : null,
  ]);
  return {
    ownerId: user.id,
    ownerName: user.name,
    departmentId: user.departmentId || null,
    departmentNameSnapshot: department?.name || null,
    positionId: user.positionId || null,
    positionNameSnapshot: position?.name || user.positionName || null,
  };
}

export function createOkrService({
  prisma,
  now = () => new Date(),
  notifications,
}: {
  prisma: PrismaLike;
  now?: () => Date;
  notifications?: OkrNotifications;
}) {
  const event = async (
    tx: PrismaLike,
    input: {
      cycleId: string;
      objectiveId?: string;
      keyResultId?: string;
      actor: OkrActor;
      action: string;
      fromState?: string;
      toState?: string;
      detail?: unknown;
    },
  ) =>
    tx.okrEvent.create({
      data: {
        id: randomUUID(),
        cycleId: input.cycleId,
        objectiveId: input.objectiveId || null,
        keyResultId: input.keyResultId || null,
        actorId: input.actor.id,
        actorName: input.actor.name,
        action: input.action,
        fromState: input.fromState || null,
        toState: input.toState || null,
        detail: input.detail ?? undefined,
        createdAt: now(),
      },
    });
  const lockCycle = async (tx: PrismaLike, cycleId: string) => {
    const rows =
      await tx.$queryRaw`SELECT id, status FROM okr_cycles WHERE id = ${cycleId} FOR UPDATE`;
    return Array.isArray(rows) ? rows[0] || null : null;
  };

  const keyResultInclude = {
    checkIns: { orderBy: { createdAt: "desc" }, take: 1 },
    taskLinks: { orderBy: [{ createdAt: "desc" }, { id: "asc" }] },
    metricBinding: true,
  };
  const objectiveInclude = {
    parent: { select: { id: true, title: true, scope: true } },
    keyResults: {
      include: keyResultInclude,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    },
    reviews: { orderBy: [{ createdAt: "desc" }, { id: "asc" }] },
  };
  const loadObjective = (id: string) =>
    prisma.objective.findUnique({ where: { id }, include: objectiveInclude });

  async function departmentTree(rootId: string): Promise<string[]> {
    const departments = await prisma.department.findMany({
      select: { id: true, parentId: true },
    });
    const ids = new Set([rootId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const department of departments) {
        if (
          department.parentId &&
          ids.has(department.parentId) &&
          !ids.has(department.id)
        ) {
          ids.add(department.id);
          changed = true;
        }
      }
    }
    return [...ids];
  }

  async function managerForDepartment(departmentId?: string | null) {
    if (!departmentId) return null;
    const department = await prisma.department.findUnique({
      where: { id: departmentId },
    });
    if (!department?.managerId) return null;
    const manager = await prisma.user.findUnique({
      where: { id: department.managerId },
    });
    return manager ? { id: manager.id, name: manager.name } : null;
  }

  function nextWeeklyCheckIn(cycle: any, from: Date) {
    const local = new Date(from.getTime() + 8 * 60 * 60_000);
    const currentWeekday = local.getUTCDay();
    let days = (Number(cycle.checkInWeekday ?? 5) - currentWeekday + 7) % 7;
    if (days === 0) days = 7;
    const at = new Date(
      Date.UTC(
        local.getUTCFullYear(),
        local.getUTCMonth(),
        local.getUTCDate() + days,
        1,
        0,
        0,
      ),
    );
    return at <= cycle.endAt ? at : undefined;
  }

  function shanghaiCheckInWindow(cycle: any, at: Date) {
    const shanghaiOffset = 8 * 60 * 60_000;
    const local = new Date(at.getTime() + shanghaiOffset);
    const weekday = local.getUTCDay();
    const checkInWeekday = Number(cycle.checkInWeekday ?? 5);
    const daysUntilCutoff = (checkInWeekday - weekday + 7) % 7;
    const cutoff =
      Date.UTC(
        local.getUTCFullYear(),
        local.getUTCMonth(),
        local.getUTCDate() + daysUntilCutoff,
        23,
        59,
        59,
        999,
      ) - shanghaiOffset;
    const endAt = new Date(cutoff);
    const startAt = new Date(cutoff - 7 * 24 * 60 * 60_000 + 1);
    return {
      startAt: startAt < cycle.startAt ? cycle.startAt : startAt,
      endAt: endAt > cycle.endAt ? cycle.endAt : endAt,
    };
  }

  async function scopeFor(actor: OkrActor): Promise<{
    scope: "self" | "department" | "all";
    departmentIds: string[];
  }> {
    if (isSuperAdmin(actor)) return { scope: "all", departmentIds: [] };
    const role = actor.roleId
      ? await prisma.role?.findUnique?.({ where: { id: actor.roleId } })
      : null;
    const raw = actor.dataScopes?.okr || role?.dataScopes?.okr;
    const scope = raw === "all" || raw === "department" ? raw : "self";
    if (scope !== "department" || !actor.departmentId)
      return {
        scope,
        departmentIds: actor.departmentId ? [actor.departmentId] : [],
      };
    return { scope, departmentIds: await departmentTree(actor.departmentId) };
  }

  async function canManageObjective(
    actor: OkrActor,
    objective: any,
  ): Promise<boolean> {
    if (isSuperAdmin(actor)) return true;
    if (allowed(actor, KEYS.COMPANY_MANAGE, "write")) return true;
    if (objective.scope === "COMPANY")
      return allowed(actor, KEYS.COMPANY_MANAGE, "write");
    if (objective.scope === "INDIVIDUAL" && objective.ownerId === actor.id)
      return allowed(actor, KEYS.CREATE, "write");
    if (!allowed(actor, KEYS.DEPARTMENT_MANAGE, "write")) return false;
    const access = await scopeFor(actor);
    return (
      access.scope === "all" ||
      (access.scope === "department" &&
        access.departmentIds.includes(objective.departmentId || ""))
    );
  }

  function canReadOkr(actor: OkrActor) {
    return [
      KEYS.SELF_READ,
      KEYS.TEAM_READ,
      KEYS.CREATE,
      KEYS.CHECK_IN,
      KEYS.DEPARTMENT_MANAGE,
      KEYS.COMPANY_MANAGE,
      KEYS.CYCLE_MANAGE,
      KEYS.SCORE_CLOSE,
      PERMISSION_KEYS.OKR_METRIC_BIND,
    ].some((key) => allowed(actor, key));
  }

  async function canViewObjective(
    actor: OkrActor,
    objective: any,
  ): Promise<boolean> {
    if (isSuperAdmin(actor)) return true;
    if (objective.scope === "COMPANY") {
      return (
        objective.status !== "DRAFT" ||
        allowed(actor, KEYS.COMPANY_MANAGE, "write")
      );
    }
    if (objective.ownerId === actor.id) return true;
    if (
      objective.keyResults?.some(
        (keyResult: any) => keyResult.ownerId === actor.id,
      )
    )
      return true;
    const hasTeamAccess =
      allowed(actor, KEYS.TEAM_READ) ||
      allowed(actor, KEYS.DEPARTMENT_MANAGE, "write") ||
      allowed(actor, KEYS.COMPANY_MANAGE, "write") ||
      allowed(actor, KEYS.SCORE_CLOSE, "write");
    if (!hasTeamAccess) return false;
    const access = await scopeFor(actor);
    return (
      access.scope === "all" ||
      (access.scope === "department" &&
        access.departmentIds.includes(objective.departmentId || ""))
    );
  }

  function visibilityConditions(
    actor: OkrActor,
    access: { scope: "self" | "department" | "all"; departmentIds: string[] },
  ) {
    const conditions: any[] = [
      { ownerId: actor.id, scope: { in: ["DEPARTMENT", "INDIVIDUAL"] } },
      {
        keyResults: { some: { ownerId: actor.id } },
        scope: { in: ["DEPARTMENT", "INDIVIDUAL"] },
      },
      { scope: "COMPANY", status: { in: ["PUBLISHED", "COMPLETED"] } },
    ];
    const hasTeamAccess =
      allowed(actor, KEYS.TEAM_READ) ||
      allowed(actor, KEYS.DEPARTMENT_MANAGE, "write") ||
      allowed(actor, KEYS.COMPANY_MANAGE, "write") ||
      allowed(actor, KEYS.SCORE_CLOSE, "write");
    if (hasTeamAccess && access.scope === "all")
      conditions.push({ scope: { in: ["DEPARTMENT", "INDIVIDUAL"] } });
    if (hasTeamAccess && access.scope === "department")
      conditions.push({
        scope: { in: ["DEPARTMENT", "INDIVIDUAL"] },
        departmentId: { in: access.departmentIds },
      });
    if (allowed(actor, KEYS.COMPANY_MANAGE, "write"))
      conditions.push({ scope: "COMPANY" });
    return conditions;
  }

  async function canUseAssignee(
    actor: OkrActor,
    owner: { ownerId: string; departmentId: string | null },
  ): Promise<boolean> {
    if (isSuperAdmin(actor)) return true;
    const access = await scopeFor(actor);
    if (access.scope === "all") return true;
    if (access.scope === "self") return owner.ownerId === actor.id;
    return access.departmentIds.includes(owner.departmentId || "");
  }

  async function loadAccessibleKeyResult(
    actor: OkrActor,
    keyResultId: string,
  ): Promise<{ keyResult: any; objective: any } | null> {
    const keyResult = await prisma.keyResult.findUnique({
      where: { id: keyResultId },
    });
    if (!keyResult) return null;
    const objective = await loadObjective(keyResult.objectiveId);
    if (!objective || !(await canViewObjective(actor, objective))) return null;
    return { keyResult, objective };
  }

  return {
    async listDueCheckIns(actor: OkrActor, raw: any = {}) {
      if (!allowed(actor, KEYS.CHECK_IN, "write"))
        return failure<never>("无权查看待检视KR", 403);
      const page = Math.max(1, Number(raw?.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(raw?.pageSize) || 20));
      const cycleId = text(raw?.cycleId, 64);
      const cycle = cycleId
        ? await prisma.okrCycle.findUnique({ where: { id: cycleId } })
        : null;
      if (!cycle) return failure<never>("OKR周期不存在", 404);
      if (cycle.status !== "ACTIVE")
        return success({ items: [], total: 0, page, pageSize });
      const window = shanghaiCheckInWindow(cycle, now());
      const where = {
        ownerId: actor.id,
        objective: { is: { cycleId: cycle.id, status: "PUBLISHED" } },
        checkIns: {
          none: { createdAt: { gte: window.startAt, lte: window.endAt } },
        },
      };
      const [rows, total] = await Promise.all([
        prisma.keyResult.findMany({
          where,
          include: { objective: true, ...keyResultInclude },
          orderBy: [{ dueAt: "asc" }, { id: "asc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.keyResult.count({ where }),
      ]);
      const items = rows.map((row: any) => {
        const { objective, ...keyResult } = row;
        return { objective, keyResult };
      });
      return success({ items, total, page, pageSize });
    },

    async listKeyResultTasks(actor: OkrActor, keyResultId: string) {
      if (!canReadOkr(actor)) return failure<never>("无权查看KR任务关联", 403);
      if (!(await loadAccessibleKeyResult(actor, keyResultId)))
        return failure<never>("KR不存在或无权查看", 404);
      const links = await prisma.okrTaskLink.findMany({
        where: { keyResultId },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      });
      return success(links);
    },

    async linkTask(actor: OkrActor, keyResultId: string, raw: any) {
      const access = await loadAccessibleKeyResult(actor, keyResultId);
      if (!access) return failure<never>("KR不存在或无权操作", 403);
      if (!(await canManageObjective(actor, access.objective)))
        return failure<never>("无权管理该KR的关联任务", 403);
      const cycle = await prisma.okrCycle.findUnique({
        where: { id: access.objective.cycleId },
      });
      if (cycle?.status === "CLOSED")
        return failure<never>("周期已关闭，不能关联任务", 409);
      const taskId = text(raw?.taskId, 64);
      const task = taskId
        ? await prisma.employeeTask.findUnique({ where: { id: taskId } })
        : null;
      if (!task) return failure<never>("员工任务不存在", 404);
      if (
        !(await canUseAssignee(actor, {
          ownerId: task.employeeId,
          departmentId: task.departmentIdSnapshot || null,
        }))
      )
        return failure<never>("任务不在授权数据范围内", 403);
      if (
        await prisma.okrTaskLink.findFirst({ where: { keyResultId, taskId } })
      )
        return failure<never>("该任务已关联当前KR", 409);
      const link = await prisma.$transaction(async (tx: PrismaLike) => {
        const lockedCycle = await lockCycle(tx, access.objective.cycleId);
        if (!lockedCycle || lockedCycle.status === "CLOSED") return null;
        if (await tx.okrTaskLink.findFirst({ where: { keyResultId, taskId } }))
          return null;
        const row = await tx.okrTaskLink.create({
          data: {
            id: randomUUID(),
            keyResultId,
            taskId,
            taskTitle: task.title,
            linkedById: actor.id,
            linkedByName: actor.name,
            createdAt: now(),
          },
        });
        await event(tx, {
          cycleId: access.objective.cycleId,
          objectiveId: access.objective.id,
          keyResultId,
          actor,
          action: "LINK_TASK",
          detail: { taskId, taskTitle: task.title },
        });
        return row;
      });
      if (!link) return failure<never>("周期已关闭或该任务已关联当前KR", 409);
      return success(link, "任务已关联KR");
    },

    async listAssignableUsers(actor: OkrActor, raw: any = {}) {
      if (!canReadOkr(actor))
        return failure<never>("无权读取OKR负责人目录", 403);
      const access = await scopeFor(actor);
      const where: any = { isActive: true, employmentStatus: "active" };
      if (access.scope === "self") where.id = actor.id;
      if (access.scope === "department")
        where.departmentId = { in: access.departmentIds };
      const search = text(raw?.search, 100);
      if (search) where.name = { contains: search };
      const page = Math.max(1, Number(raw?.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(raw?.pageSize) || 20));
      const total = await prisma.user.count({ where });
      const users = await prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          departmentId: true,
          positionId: true,
          positionName: true,
        },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      });
      const departmentIds = [
        ...new Set(users.map((user: any) => user.departmentId).filter(Boolean)),
      ] as string[];
      const departments = departmentIds.length
        ? await prisma.department.findMany({
            where: { id: { in: departmentIds } },
            select: { id: true, name: true },
          })
        : [];
      const departmentNames = new Map(
        departments.map((department: any) => [department.id, department.name]),
      );
      return success({
        items: users.map((user: any) => ({
          id: user.id,
          name: user.name,
          departmentId: user.departmentId || undefined,
          departmentName: user.departmentId
            ? departmentNames.get(user.departmentId)
            : undefined,
          positionId: user.positionId || undefined,
          positionName: user.positionName || undefined,
        })),
        total,
        page,
        pageSize,
      });
    },

    async listAlignmentObjectives(actor: OkrActor, raw: any = {}) {
      if (!canReadOkr(actor))
        return failure<never>("无权读取目标对齐目录", 403);
      const cycleId = text(raw?.cycleId, 64);
      const childScope = text(raw?.childScope, 24);
      if (!cycleId || !["DEPARTMENT", "INDIVIDUAL"].includes(childScope))
        return failure<never>("周期或目标层级不正确", 400);
      const access = await scopeFor(actor);
      const where: any = {
        cycleId,
        scope: {
          in:
            childScope === "INDIVIDUAL"
              ? ["COMPANY", "DEPARTMENT"]
              : ["COMPANY"],
        },
        AND: [{ OR: visibilityConditions(actor, access) }],
      };
      const items = await prisma.objective.findMany({
        where,
        select: {
          id: true,
          title: true,
          scope: true,
          ownerName: true,
          departmentNameSnapshot: true,
        },
        orderBy: [{ scope: "asc" }, { title: "asc" }, { id: "asc" }],
        take: 100,
      });
      return success(items);
    },

    async listCycles(actor: OkrActor, raw: any = {}) {
      if (!canReadOkr(actor)) return failure<never>("无权查看OKR周期", 403);
      const page = Math.max(1, Number(raw?.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(raw?.pageSize) || 20));
      const where: any = {};
      if (raw?.status) where.status = text(raw.status, 24);
      const [items, total] = await Promise.all([
        prisma.okrCycle.findMany({
          where,
          orderBy: [{ startAt: "desc" }, { id: "asc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.okrCycle.count({ where }),
      ]);
      return success({ items, total, page, pageSize });
    },

    async listObjectives(actor: OkrActor, raw: any = {}) {
      if (!canReadOkr(actor)) return failure<never>("无权查看OKR目标", 403);
      const page = Math.max(1, Number(raw?.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(raw?.pageSize) || 20));
      const access = await scopeFor(actor);
      const where: any = {};
      if (raw?.cycleId) where.cycleId = text(raw.cycleId, 64);
      if (raw?.scope) where.scope = text(raw.scope, 24);
      if (raw?.status) where.status = text(raw.status, 24);
      if (raw?.health) where.health = text(raw.health, 24);
      const search = text(raw?.search, 200);
      if (search)
        where.AND = [
          ...(where.AND || []),
          {
            OR: [
              { title: { contains: search } },
              { ownerName: { contains: search } },
              { departmentNameSnapshot: { contains: search } },
            ],
          },
        ];
      where.AND = [
        ...(where.AND || []),
        { OR: visibilityConditions(actor, access) },
      ];
      const owner = text(raw?.owner, 24);
      if (owner === "mine")
        where.AND = [
          ...(where.AND || []),
          {
            OR: [
              { ownerId: actor.id },
              { keyResults: { some: { ownerId: actor.id } } },
            ],
          },
        ];
      else if (owner === "team") {
        if (access.scope === "self")
          return success({ items: [], total: 0, page, pageSize });
        const teamWhere =
          access.scope === "department"
            ? { departmentId: { in: access.departmentIds } }
            : {};
        where.AND = [
          ...(where.AND || []),
          teamWhere,
          { ownerId: { not: actor.id } },
        ];
      }
      const ownerId = text(raw?.ownerId, 64);
      if (ownerId) {
        const visibleOwner = await prisma.user.findUnique({
          where: { id: ownerId },
        });
        if (
          !visibleOwner ||
          !(await canUseAssignee(actor, {
            ownerId: visibleOwner.id,
            departmentId: visibleOwner.departmentId || null,
          }))
        )
          return success({ items: [], total: 0, page, pageSize });
        where.AND = [
          ...(where.AND || []),
          {
            OR: [
              { ownerId },
              { keyResults: { some: { ownerId } } },
            ],
          },
        ];
      }
      const [items, total] = await Promise.all([
        prisma.objective.findMany({
          where,
          include: objectiveInclude,
          orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.objective.count({ where }),
      ]);
      const itemsWithCapabilities = await Promise.all(
        items.map(async (item: any) => ({
          ...item,
          capabilities: { canManage: await canManageObjective(actor, item) },
        })),
      );
      return success({ items: itemsWithCapabilities, total, page, pageSize });
    },

    async getObjective(actor: OkrActor, objectiveId: string) {
      if (!canReadOkr(actor)) return failure<never>("无权查看OKR目标", 403);
      const row = await loadObjective(objectiveId);
      return row && (await canViewObjective(actor, row))
        ? success(row)
        : failure<never>("目标不存在或无权查看", 404);
    },

    async updateObjective(actor: OkrActor, objectiveId: string, raw: any) {
      const objective = await prisma.objective.findUnique({
        where: { id: objectiveId },
      });
      if (!objective) return failure<never>("目标不存在", 404);
      const cycle = await prisma.okrCycle.findUnique({
        where: { id: objective.cycleId },
      });
      if (cycle?.status !== "DRAFT" || objective.status !== "DRAFT")
        return failure<never>("目标已发布，关键定义不能静默修改", 409);
      if (!(await canManageObjective(actor, objective)))
        return failure<never>("无权修改该目标", 403);
      const data: any = {};
      if (raw?.title !== undefined) data.title = text(raw.title, 200);
      if (raw?.description !== undefined)
        data.description = text(raw.description, 10000) || null;
      if (raw?.weight !== undefined) data.weight = finite(raw.weight);
      if (
        (!data.title && raw?.title !== undefined) ||
        (data.weight !== undefined &&
          (data.weight === null || data.weight <= 0 || data.weight > 100))
      )
        return failure<never>("目标名称或权重不正确", 400);
      const updated = await prisma.$transaction(async (tx: PrismaLike) => {
        const lockedCycle = await lockCycle(tx, objective.cycleId);
        const draftObjective = await tx.objective.findFirst({
          where: { id: objectiveId, status: "DRAFT" },
        });
        if (lockedCycle?.status !== "DRAFT" || !draftObjective) return null;
        const row = await tx.objective.update({
          where: { id: objectiveId },
          data: { ...data, updatedAt: now() },
        });
        await event(tx, {
          cycleId: objective.cycleId,
          objectiveId,
          actor,
          action: "UPDATE_OBJECTIVE",
          detail: data,
        });
        return row;
      });
      if (!updated)
        return failure<never>("周期或目标状态已变化，不能再修改目标", 409);
      return success(updated, "目标已更新");
    },

    async createCycle(actor: OkrActor, raw: any) {
      if (!allowed(actor, KEYS.CYCLE_MANAGE, "write"))
        return failure<never>("无权管理OKR周期", 403);
      const name = text(raw?.name, 120);
      const year = Number(raw?.year);
      const cycleType = text(raw?.cycleType || "QUARTER", 24);
      const quarter = raw?.quarter == null ? null : Number(raw.quarter);
      const month = raw?.month == null ? null : Number(raw.month);
      let startSource = text(raw?.startAt, 40);
      let endSource = text(raw?.endAt, 40);
      if (cycleType === "MONTH" && Number.isInteger(month) && month! >= 1 && month! <= 12) {
        const endDay = new Date(Date.UTC(year, month!, 0)).getUTCDate();
        startSource = `${year}-${String(month).padStart(2, "0")}-01`;
        endSource = `${year}-${String(month).padStart(2, "0")}-${endDay}`;
      }
      if (cycleType === "QUARTER" && Number.isInteger(quarter) && [1, 2, 3, 4].includes(quarter!)) {
        const startMonth = (quarter! - 1) * 3 + 1;
        const endMonth = startMonth + 2;
        const endDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate();
        startSource = `${year}-${String(startMonth).padStart(2, "0")}-01`;
        endSource = `${year}-${String(endMonth).padStart(2, "0")}-${endDay}`;
      }
      const startAt = date(startSource);
      const endAt = date(endSource, true);
      const checkInWeekday = Number(raw?.checkInWeekday ?? 5);
      if (
        !name ||
        !Number.isInteger(year) ||
        year < 2000 ||
        year > 2200 ||
        !["MONTH", "QUARTER", "CUSTOM"].includes(cycleType) ||
        (cycleType === "MONTH" &&
          (!Number.isInteger(month) || month! < 1 || month! > 12)) ||
        (cycleType === "QUARTER" &&
          (!Number.isInteger(quarter) || ![1, 2, 3, 4].includes(quarter!))) ||
        !startAt ||
        !endAt ||
        startAt >= endAt ||
        !Number.isInteger(checkInWeekday) ||
        checkInWeekday < 0 ||
        checkInWeekday > 6
      ) {
        return failure<never>("请填写有效的OKR周期", 400);
      }
      const periodKey =
        cycleType === "MONTH"
          ? `${year}-${String(month).padStart(2, "0")}`
          : cycleType === "QUARTER"
            ? `${year}-Q${quarter}`
            : `${startSource.slice(0, 10)}_${endSource.slice(0, 10)}`;
      if (await prisma.okrCycle.findFirst({ where: { cycleType, periodKey } }))
        return failure<never>("该OKR周期已存在", 409);
      const row = await prisma.okrCycle.create({
        data: {
          id: randomUUID(),
          name,
          year,
          quarter: cycleType === "QUARTER" ? quarter : null,
          cycleType,
          periodKey,
          startAt,
          endAt,
          checkInWeekday,
          status: "DRAFT",
          createdById: actor.id,
          createdByName: actor.name,
          createdAt: now(),
          updatedAt: now(),
        },
      });
      await event(prisma, {
        cycleId: row.id,
        actor,
        action: "CREATE_CYCLE",
        toState: "DRAFT",
      });
      return success(row, "OKR周期已创建");
    },

    async createObjective(actor: OkrActor, raw: any) {
      if (
        !allowed(actor, KEYS.CREATE, "write") &&
        !allowed(actor, KEYS.COMPANY_MANAGE, "write") &&
        !allowed(actor, KEYS.DEPARTMENT_MANAGE, "write")
      )
        return failure<never>("无权创建目标", 403);
      const cycle = await prisma.okrCycle.findUnique({
        where: { id: text(raw?.cycleId, 64) },
      });
      if (!cycle) return failure<never>("OKR周期不存在", 404);
      if (cycle.status !== "DRAFT")
        return failure<never>("只能在草稿周期创建目标", 409);
      const scope = text(raw?.scope, 24);
      if (!["COMPANY", "DEPARTMENT", "INDIVIDUAL"].includes(scope))
        return failure<never>("目标范围不正确", 400);
      if (scope === "COMPANY" && !allowed(actor, KEYS.COMPANY_MANAGE, "write"))
        return failure<never>("无权管理公司目标", 403);
      const owner = await directorySnapshot(prisma, text(raw?.ownerId, 64));
      const title = text(raw?.title, 200);
      const weight = finite(raw?.weight);
      if (!owner || !title || weight === null || weight <= 0 || weight > 100)
        return failure<never>("负责人、目标名称和权重必须有效", 400);
      if (!(await canUseAssignee(actor, owner)))
        return failure<never>("目标负责人不在授权数据范围内", 403);
      if (
        scope === "INDIVIDUAL" &&
        owner.ownerId !== actor.id &&
        !allowed(actor, KEYS.DEPARTMENT_MANAGE, "write")
      )
        return failure<never>("只能为本人或授权团队创建目标", 403);
      if (
        scope === "DEPARTMENT" &&
        !allowed(actor, KEYS.DEPARTMENT_MANAGE, "write")
      )
        return failure<never>("无权管理部门目标", 403);
      let parent: any = null;
      const parentObjectiveId = text(raw?.parentObjectiveId, 64) || null;
      if (parentObjectiveId) {
        parent = await prisma.objective.findUnique({
          where: { id: parentObjectiveId },
        });
        if (!parent || parent.cycleId !== cycle.id)
          return failure<never>("父目标必须属于同一周期", 400);
        if (!(await canViewObjective(actor, parent)))
          return failure<never>("父目标不在授权数据范围内", 403);
        const rank: Record<string, number> = {
          COMPANY: 0,
          DEPARTMENT: 1,
          INDIVIDUAL: 2,
        };
        if (rank[parent.scope] >= rank[scope])
          return failure<never>("目标只能向上对齐更高层级目标", 400);
      }
      const row = await prisma.$transaction(async (tx: PrismaLike) => {
        const lockedCycle = await lockCycle(tx, cycle.id);
        if (lockedCycle?.status !== "DRAFT") return null;
        const created = await tx.objective.create({
          data: {
            id: randomUUID(),
            cycleId: cycle.id,
            scope,
            title,
            description: text(raw?.description, 10000) || null,
            parentObjectiveId,
            weight,
            status: "DRAFT",
            health: "ON_TRACK",
            progress: 0,
            ...owner,
            createdById: actor.id,
            createdByName: actor.name,
            createdAt: now(),
            updatedAt: now(),
          },
        });
        if (raw?.autoDistributeWeight) {
          const siblings = await tx.objective.findMany({
            where: { cycleId: cycle.id, ownerId: owner.ownerId, status: "DRAFT" },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          });
          const weights = evenlyDistributedWeights(siblings.length);
          for (const [index, sibling] of siblings.entries()) {
            await tx.objective.update({
              where: { id: sibling.id },
              data: { weight: weights[index], updatedAt: now() },
            });
          }
          created.weight = weights[siblings.findIndex((item: any) => item.id === created.id)];
        }
        await event(tx, {
          cycleId: cycle.id,
          objectiveId: created.id,
          actor,
          action: "CREATE_OBJECTIVE",
          toState: "DRAFT",
        });
        return created;
      });
      if (!row) return failure<never>("周期状态已变化，不能再创建目标", 409);
      return success(row, "目标已创建");
    },

    async importObjective(actor: OkrActor, raw: any) {
      if (
        !allowed(actor, KEYS.CREATE, "write") &&
        !allowed(actor, KEYS.COMPANY_MANAGE, "write") &&
        !allowed(actor, KEYS.DEPARTMENT_MANAGE, "write")
      )
        return failure<never>("无权导入目标", 403);
      const source = await loadObjective(text(raw?.sourceObjectiveId, 64));
      if (!source || !(await canViewObjective(actor, source)))
        return failure<never>("源目标不存在或无权查看", 404);
      const targetCycleId = text(raw?.targetCycleId, 64);
      const targetCycle = await prisma.okrCycle.findUnique({
        where: { id: targetCycleId },
      });
      if (!targetCycle) return failure<never>("目标周期不存在", 404);
      if (targetCycle.status !== "DRAFT")
        return failure<never>("只能导入到草稿周期", 409);
      if (source.cycleId === targetCycleId)
        return failure<never>("请选择其他周期的目标", 400);
      if (!(await canManageObjective(actor, source)))
        return failure<never>("无权复用该目标", 403);
      const objectiveOwner = await directorySnapshot(prisma, source.ownerId);
      if (!objectiveOwner || !(await canUseAssignee(actor, objectiveOwner)))
        return failure<never>("目标负责人已离职或不在当前授权范围", 409);
      const keyResultOwners = new Map<string, any>();
      for (const keyResult of source.keyResults || []) {
        const owner = await directorySnapshot(prisma, keyResult.ownerId);
        if (!owner || !(await canUseAssignee(actor, owner)))
          return failure<never>(`KR负责人已离职或不在当前授权范围：${keyResult.title}`, 409);
        keyResultOwners.set(keyResult.id, owner);
      }
      const imported = await prisma.$transaction(async (tx: PrismaLike) => {
        const lockedCycle = await lockCycle(tx, targetCycleId);
        if (lockedCycle?.status !== "DRAFT") return null;
        const objectiveId = randomUUID();
        const objective = await tx.objective.create({
          data: {
            id: objectiveId,
            cycleId: targetCycleId,
            scope: source.scope,
            title: source.title,
            description: source.description || null,
            parentObjectiveId: null,
            weight: source.weight,
            status: "DRAFT",
            health: "ON_TRACK",
            progress: 0,
            ...objectiveOwner,
            createdById: actor.id,
            createdByName: actor.name,
            createdAt: now(),
            updatedAt: now(),
          },
        });
        for (const keyResult of source.keyResults || []) {
          const owner = keyResultOwners.get(keyResult.id);
          await tx.keyResult.create({
            data: {
              id: randomUUID(),
              objectiveId,
              title: keyResult.title,
              description: keyResult.description || null,
              ...owner,
              type: keyResult.type,
              direction: keyResult.direction,
              baselineValue: keyResult.baselineValue,
              targetValue: keyResult.targetValue,
              currentValue: keyResult.baselineValue,
              unit: keyResult.unit || null,
              weight: keyResult.weight,
              source: "MANUAL",
              health: "ON_TRACK",
              progress: 0,
              dueAt: null,
              lastCheckInAt: null,
              createdById: actor.id,
              createdByName: actor.name,
              createdAt: now(),
              updatedAt: now(),
            },
          });
        }
        await event(tx, {
          cycleId: targetCycleId,
          objectiveId,
          actor,
          action: "IMPORT_OBJECTIVE",
          toState: "DRAFT",
          detail: { sourceObjectiveId: source.id, sourceCycleId: source.cycleId },
        });
        return objective;
      });
      if (!imported)
        return failure<never>("周期状态已变化，不能再导入目标", 409);
      return success(imported, "目标及KR定义已导入");
    },

    async addKeyResult(actor: OkrActor, objectiveId: string, raw: any) {
      const objective = await loadObjective(objectiveId);
      if (!objective) return failure<never>("目标不存在", 404);
      const cycle = await prisma.okrCycle.findUnique({
        where: { id: objective.cycleId },
      });
      if (cycle?.status !== "DRAFT" || objective.status !== "DRAFT")
        return failure<never>("目标已发布，不能静默修改KR定义", 409);
      if (
        !allowed(actor, KEYS.CREATE, "write") &&
        !(await canManageObjective(actor, objective))
      )
        return failure<never>("无权创建KR", 403);
      if (!(await canManageObjective(actor, objective)))
        return failure<never>("目标不在授权数据范围内", 403);
      const type = text(raw?.type, 24);
      const direction = text(raw?.direction, 24);
      const title = text(raw?.title, 200);
      const baselineValue = finite(raw?.baselineValue);
      const targetValue = finite(raw?.targetValue);
      const currentValue = finite(raw?.currentValue) ?? baselineValue;
      const weight = finite(raw?.weight);
      const owner = await directorySnapshot(prisma, text(raw?.ownerId, 64));
      if (
        !["NUMERIC", "PERCENTAGE", "MILESTONE"].includes(type) ||
        !["INCREASE", "DECREASE"].includes(direction) ||
        !title ||
        !owner ||
        baselineValue === null ||
        targetValue === null ||
        currentValue === null ||
        targetValue === baselineValue ||
        weight === null ||
        weight <= 0 ||
        weight > 100
      )
        return failure<never>("KR指标定义不正确", 400);
      if (!(await canUseAssignee(actor, owner)))
        return failure<never>("KR负责人不在授权数据范围内", 403);
      if (
        (direction === "INCREASE" && targetValue < baselineValue) ||
        (direction === "DECREASE" && targetValue > baselineValue)
      )
        return failure<never>("KR目标值与变化方向冲突", 400);
      const progress = progressFor(
        { type, direction, baselineValue, targetValue },
        currentValue,
      );
      const row = await prisma.$transaction(async (tx: PrismaLike) => {
        const lockedCycle = await lockCycle(tx, objective.cycleId);
        if (lockedCycle?.status !== "DRAFT") return null;
        const draftObjective = await tx.objective.findFirst({
          where: {
            id: objectiveId,
            status: "DRAFT",
            cycle: { status: "DRAFT" },
          },
        });
        if (!draftObjective) return null;
        const created = await tx.keyResult.create({
          data: {
            id: randomUUID(),
            objectiveId,
            title,
            description: text(raw?.description, 10000) || null,
            type,
            direction,
            baselineValue,
            targetValue,
            currentValue,
            unit: text(raw?.unit, 40) || null,
            weight,
            progress,
            health: "ON_TRACK",
            source: "MANUAL",
            dueAt: raw?.dueAt ? date(raw.dueAt, true) : null,
            ...owner,
            createdById: actor.id,
            createdByName: actor.name,
            createdAt: now(),
            updatedAt: now(),
          },
        });
        if (raw?.autoDistributeWeight) {
          const siblings = await tx.keyResult.findMany({
            where: { objectiveId },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          });
          const weights = evenlyDistributedWeights(siblings.length);
          for (const [index, sibling] of siblings.entries()) {
            await tx.keyResult.update({
              where: { id: sibling.id },
              data: { weight: weights[index], updatedAt: now() },
            });
          }
          created.weight = weights[siblings.findIndex((item: any) => item.id === created.id)];
        }
        await event(tx, {
          cycleId: objective.cycleId,
          objectiveId,
          keyResultId: created.id,
          actor,
          action: "CREATE_KEY_RESULT",
        });
        return created;
      });
      if (!row)
        return failure<never>("目标或周期状态已变化，不能再创建KR", 409);
      return success(row, "KR已创建");
    },

    async updateKeyResult(actor: OkrActor, keyResultId: string, raw: any) {
      const access = await loadAccessibleKeyResult(actor, keyResultId);
      if (!access) return failure<never>("KR不存在或无权操作", 404);
      if (!(await canManageObjective(actor, access.objective)))
        return failure<never>("无权修改该KR", 403);
      const cycle = await prisma.okrCycle.findUnique({
        where: { id: access.objective.cycleId },
      });
      if (cycle?.status !== "DRAFT" || access.objective.status !== "DRAFT")
        return failure<never>("目标已发布，不能修改KR定义", 409);
      const data: any = {};
      if (raw?.title !== undefined) data.title = text(raw.title, 200);
      if (raw?.description !== undefined)
        data.description = text(raw.description, 10000) || null;
      if (raw?.baselineValue !== undefined)
        data.baselineValue = finite(raw.baselineValue);
      if (raw?.targetValue !== undefined)
        data.targetValue = finite(raw.targetValue);
      if (raw?.unit !== undefined) data.unit = text(raw.unit, 40) || null;
      if (raw?.weight !== undefined) data.weight = finite(raw.weight);
      if (raw?.dueAt !== undefined)
        data.dueAt = raw.dueAt ? date(raw.dueAt, true) : null;
      const baselineValue = data.baselineValue ?? access.keyResult.baselineValue;
      const targetValue = data.targetValue ?? access.keyResult.targetValue;
      if (
        (!data.title && raw?.title !== undefined) ||
        baselineValue === null ||
        targetValue === null ||
        targetValue === baselineValue ||
        (data.weight !== undefined &&
          (data.weight === null || data.weight <= 0 || data.weight > 100)) ||
        (access.keyResult.direction === "INCREASE" && targetValue < baselineValue) ||
        (access.keyResult.direction === "DECREASE" && targetValue > baselineValue)
      )
        return failure<never>("KR定义不正确", 400);
      if (data.baselineValue !== undefined) data.currentValue = data.baselineValue;
      data.progress = progressFor(
        { ...access.keyResult, baselineValue, targetValue },
        data.currentValue ?? access.keyResult.currentValue,
      );
      const updated = await prisma.$transaction(async (tx: PrismaLike) => {
        const lockedCycle = await lockCycle(tx, access.objective.cycleId);
        const draftObjective = await tx.objective.findFirst({
          where: { id: access.objective.id, status: "DRAFT" },
        });
        if (lockedCycle?.status !== "DRAFT" || !draftObjective) return null;
        const row = await tx.keyResult.update({
          where: { id: keyResultId },
          data: { ...data, updatedAt: now() },
        });
        await event(tx, {
          cycleId: access.objective.cycleId,
          objectiveId: access.objective.id,
          keyResultId,
          actor,
          action: "UPDATE_KEY_RESULT",
          detail: data,
        });
        return row;
      });
      if (!updated)
        return failure<never>("周期状态已变化，不能再修改KR", 409);
      return success(updated, "KR已更新");
    },

    async transitionCycle(
      actor: OkrActor,
      cycleId: string,
      toStatus: CycleStatus,
    ) {
      const cycle = await prisma.okrCycle.findUnique({
        where: { id: cycleId },
      });
      if (!cycle) return failure<never>("OKR周期不存在", 404);
      const transitions: Record<CycleStatus, CycleStatus[]> = {
        DRAFT: ["ACTIVE"],
        ACTIVE: ["SCORING"],
        SCORING: ["CLOSED"],
        CLOSED: [],
      };
      if (!transitions[cycle.status as CycleStatus]?.includes(toStatus))
        return failure<never>("不允许的周期状态变更", 409);
      const permissionKey =
        toStatus === "ACTIVE" ? KEYS.CYCLE_MANAGE : KEYS.SCORE_CLOSE;
      if (!allowed(actor, permissionKey, "write"))
        return failure<never>("无权变更OKR周期状态", 403);
      const objectives = await prisma.objective.findMany({
        where: { cycleId },
      });
      if (toStatus === "ACTIVE") {
        if (!objectives.length)
          return failure<never>("周期至少需要一个目标", 409);
        for (const objective of objectives) {
          const keyResults = await prisma.keyResult.findMany({
            where: { objectiveId: objective.id },
          });
          if (
            !keyResults.length ||
            Math.round(
              keyResults.reduce(
                (sum: number, kr: any) => sum + Number(kr.weight),
                0,
              ) * 100,
            ) /
              100 !==
              100
          )
            return failure<never>(
              "每个目标至少需要一个KR，且KR权重合计必须为100",
              409,
            );
        }
      }
      if (toStatus === "CLOSED") {
        for (const objective of objectives) {
          const selfReview = await prisma.okrReview.findFirst({
            where: {
              objectiveId: objective.id,
              reviewerId: objective.ownerId,
              reviewerType: "SELF",
            },
          });
          if (!selfReview)
            return failure<never>(
              `目标“${objective.title || objective.id}”尚未完成负责人复盘`,
              409,
            );
        }
      }
      const updated = await prisma.$transaction(async (tx: PrismaLike) => {
        const lockedCycle = await lockCycle(tx, cycleId);
        if (lockedCycle?.status !== cycle.status) return null;
        if (toStatus === "ACTIVE") {
          const lockedObjectives = await tx.objective.findMany({
            where: { cycleId },
          });
          if (!lockedObjectives.length) return null;
          for (const objective of lockedObjectives) {
            const keyResults = await tx.keyResult.findMany({
              where: { objectiveId: objective.id },
            });
            const weight =
              Math.round(
                keyResults.reduce(
                  (sum: number, kr: any) => sum + Number(kr.weight),
                  0,
                ) * 100,
              ) / 100;
            if (!keyResults.length || weight !== 100) return null;
          }
        }
        const claimed = await tx.okrCycle.updateMany({
          where: { id: cycleId, status: cycle.status },
          data: {
            status: toStatus,
            activatedAt: toStatus === "ACTIVE" ? now() : cycle.activatedAt,
            closedAt: toStatus === "CLOSED" ? now() : cycle.closedAt,
            updatedAt: now(),
          },
        });
        if (claimed.count !== 1) return null;
        if (toStatus === "ACTIVE")
          await tx.objective.updateMany({
            where: { cycleId, status: "DRAFT" },
            data: {
              status: "PUBLISHED",
              publishedAt: now(),
              publishedById: actor.id,
              publishedByName: actor.name,
            },
          });
        if (toStatus === "CLOSED")
          await tx.objective.updateMany({
            where: { cycleId, status: "PUBLISHED" },
            data: { status: "COMPLETED", completedAt: now() },
          });
        await event(tx, {
          cycleId,
          actor,
          action: `TRANSITION_CYCLE_${toStatus}`,
          fromState: cycle.status,
          toState: toStatus,
        });
        return tx.okrCycle.findUnique({ where: { id: cycleId } });
      });
      if (!updated) return failure<never>("周期状态已变化，请刷新后重试", 409);
      if (toStatus === "ACTIVE" && notifications) {
        const publishedAt = now();
        for (const objective of objectives) {
          await notifications
            .assignOkr(prisma, {
              cycleId,
              objectiveId: objective.id,
              title: objective.title,
              publishedAt,
              checkInAt: nextWeeklyCheckIn(cycle, publishedAt),
              assignee: { id: objective.ownerId, name: objective.ownerName },
              manager: await managerForDepartment(objective.departmentId),
            })
            .catch(() => undefined);
        }
      }
      if (toStatus === "CLOSED" && notifications) {
        for (const objective of objectives)
          await notifications
            .resolveOkr(prisma, objective.id, "OKR周期已关闭")
            .catch(() => undefined);
      }
      return success(updated, `OKR周期已进入${toStatus}`);
    },

    async checkIn(actor: OkrActor, keyResultId: string, raw: any) {
      if (!allowed(actor, KEYS.CHECK_IN, "write"))
        return failure<never>("无权提交KR检视", 403);
      const kr = await prisma.keyResult.findUnique({
        where: { id: keyResultId },
      });
      if (!kr) return failure<never>("KR不存在", 404);
      const objective = await loadObjective(kr.objectiveId);
      const cycle =
        objective &&
        (await prisma.okrCycle.findUnique({
          where: { id: objective.cycleId },
        }));
      if (!objective || !cycle) return failure<never>("KR所属目标不存在", 404);
      if (cycle.status !== "ACTIVE")
        return failure<never>("只能在进行中的OKR周期提交检视", 409);
      if (
        kr.ownerId !== actor.id &&
        (!(await canManageObjective(actor, objective)) ||
          !(await canUseAssignee(actor, {
            ownerId: kr.ownerId,
            departmentId: kr.departmentId || objective.departmentId || null,
          })))
      )
        return failure<never>("只能检视本人或授权团队的KR", 403);
      const currentValue = finite(raw?.currentValue);
      const confidence =
        raw?.confidence === undefined ||
        raw?.confidence === null ||
        raw?.confidence === ""
          ? null
          : Number(raw.confidence);
      if (
        currentValue === null ||
        (confidence !== null &&
          (!Number.isInteger(confidence) || confidence < 1 || confidence > 5))
      )
        return failure<never>("当前值或信心度不正确", 400);
      if (
        kr.source === "SYSTEM_METRIC" &&
        currentValue !== Number(kr.currentValue)
      )
        return failure<never>("系统指标数值只能通过经营数据自动刷新", 409);
      const progress = progressFor(kr, currentValue);
      const health = healthFor(progress, confidence, raw?.health);
      const evidence = Array.isArray(raw?.evidence)
        ? raw.evidence
            .map((item: any) => ({
              type: text(item?.type || "TEXT", 32),
              referenceId: text(item?.referenceId, 160) || undefined,
              content: text(item?.content, 10000) || undefined,
            }))
            .filter((item: any) => item.referenceId || item.content)
        : [];
      const result = await prisma.$transaction(async (tx: PrismaLike) => {
        const lockedCycle = await lockCycle(tx, cycle.id);
        if (lockedCycle?.status !== "ACTIVE") return null;
        const currentKr = await tx.keyResult.findUnique({
          where: { id: keyResultId },
        });
        if (!currentKr) return null;
        const checkIn = await tx.okrCheckIn.create({
          data: {
            id: randomUUID(),
            keyResultId,
            actorId: actor.id,
            actorName: actor.name,
            previousValue: Number(currentKr.currentValue),
            currentValue,
            progress,
            confidence,
            health,
            blocker: text(raw?.blocker, 10000) || null,
            nextAction: text(raw?.nextAction, 10000) || null,
            evidence,
            createdAt: now(),
          },
        });
        const updatedKr = await tx.keyResult.update({
          where: { id: keyResultId },
          data: {
            currentValue,
            progress,
            health,
            lastCheckInAt: now(),
            updatedAt: now(),
          },
        });
        const keyResults = await tx.keyResult.findMany({
          where: { objectiveId: objective.id },
        });
        const totalWeight =
          keyResults.reduce(
            (sum: number, item: any) => sum + Number(item.weight),
            0,
          ) || 1;
        const objectiveProgress =
          Math.round(
            (keyResults.reduce(
              (sum: number, item: any) =>
                sum + Number(item.progress) * Number(item.weight),
              0,
            ) /
              totalWeight) *
              100,
          ) / 100;
        await tx.objective.update({
          where: { id: objective.id },
          data: {
            progress: objectiveProgress,
            health: keyResults.some((item: any) => item.health === "OFF_TRACK")
              ? "OFF_TRACK"
              : keyResults.some((item: any) => item.health === "AT_RISK")
                ? "AT_RISK"
                : "ON_TRACK",
            updatedAt: now(),
          },
        });
        await event(tx, {
          cycleId: cycle.id,
          objectiveId: objective.id,
          keyResultId,
          actor,
          action: "CHECK_IN",
          detail: {
            previousValue: kr.currentValue,
            currentValue,
            progress,
            health,
          },
        });
        return { checkIn, keyResult: updatedKr, objectiveProgress };
      });
      if (!result) return failure<never>("周期状态已变化，不能再提交检视", 409);
      if (notifications) {
        await notifications
          .resolveOkr(prisma, objective.id, "本周OKR检视已提交")
          .catch(() => undefined);
        await notifications
          .scheduleOkrCheckIn?.(prisma, {
            cycleId: cycle.id,
            objectiveId: objective.id,
            title: objective.title,
            scheduledFrom: now(),
            checkInAt: nextWeeklyCheckIn(cycle, now()),
            assignee: { id: kr.ownerId, name: kr.ownerName },
          })
          .catch(() => undefined);
        if (health !== "ON_TRACK") {
          await notifications
            .riskOkr(prisma, {
              cycleId: cycle.id,
              objectiveId: objective.id,
              title: kr.title,
              riskAt: now(),
              assignee: { id: kr.ownerId, name: kr.ownerName },
              manager: await managerForDepartment(
                kr.departmentId || objective.departmentId,
              ),
            })
            .catch(() => undefined);
        }
      }
      return success(result, "KR检视已提交");
    },

    async submitReview(actor: OkrActor, objectiveId: string, raw: any) {
      const objective = await prisma.objective.findUnique({
        where: { id: objectiveId },
      });
      if (!objective) return failure<never>("目标不存在", 404);
      const cycle = await prisma.okrCycle.findUnique({
        where: { id: objective.cycleId },
      });
      if (cycle?.status !== "SCORING")
        return failure<never>("只能在评分期提交复盘", 409);
      if (
        objective.ownerId !== actor.id &&
        (!allowed(actor, KEYS.SCORE_CLOSE, "write") ||
          !(await canManageObjective(actor, objective)))
      )
        return failure<never>("无权评分该目标", 403);
      const score = finite(raw?.score);
      const summary = text(raw?.summary, 20000);
      if (score === null || score < 0 || score > 1 || !summary)
        return failure<never>("评分必须介于0到1，且必须填写复盘总结", 400);
      const reviewerType = objective.ownerId === actor.id ? "SELF" : "MANAGER";
      let review: any;
      try {
        review = await prisma.$transaction(async (tx: PrismaLike) => {
          const lockedCycle = await lockCycle(tx, objective.cycleId);
          if (lockedCycle?.status !== "SCORING") return null;
          const row = await tx.okrReview.create({
            data: {
              id: randomUUID(),
              objectiveId,
              reviewerId: actor.id,
              reviewerName: actor.name,
              reviewerType,
              score,
              summary,
              lessons: text(raw?.lessons, 20000) || null,
              createdAt: now(),
            },
          });
          await event(tx, {
            cycleId: objective.cycleId,
            objectiveId,
            actor,
            action: "SUBMIT_REVIEW",
            detail: { score, reviewerType },
          });
          return row;
        });
      } catch (error: any) {
        if (error?.code === "P2002")
          return failure<never>("该角色已提交过本目标复盘", 409);
        throw error;
      }
      if (!review) return failure<never>("周期状态已变化，不能再提交复盘", 409);
      return success(review, "目标复盘已提交");
    },
  };
}

export type OkrService = ReturnType<typeof createOkrService>;
