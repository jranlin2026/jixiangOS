import { randomUUID } from "node:crypto";
import type { AuthenticatedUser } from "../../../src/types/auth";
import {
  hasPermission,
  isSuperAdmin,
  PERMISSION_KEYS,
} from "../../../src/shared/utils/permissions";
import { buildDataVisibilityScopeForUser } from "../../../src/shared/utils/dataVisibility";
import {
  mapPrismaDepartment,
  mapPrismaRole,
  mapPrismaUser,
} from "../../db/prismaMappers";
import type {
  BusinessCockpitQuery,
  BusinessCockpitSnapshot,
  BusinessCockpitVisibility,
} from "../businessCockpitService";
import { failure, success, type ApiResponse } from "../../api/response";

type PrismaLike = any;
type MetricCode = (typeof OKR_METRIC_CATALOG)[number]["code"];

export const OKR_METRIC_CATALOG = [
  { code: "FORMAL_ORDER_PAID_AMOUNT", name: "正式订单实收金额", unit: "元" },
  { code: "FORMAL_ORDER_COUNT", name: "正式订单数", unit: "单" },
  { code: "RECOVERY_BUSINESS_AMOUNT", name: "售后回收金额", unit: "元" },
  { code: "RECOVERY_ORDER_COUNT", name: "售后回收订单数", unit: "单" },
] as const;

type MetricReadInput = {
  metricCode: MetricCode;
  startAt: Date;
  endAt: Date;
  visibility: BusinessCockpitVisibility;
};

type MetricReadResult = {
  value: number;
  sourceCount?: number;
  qualityStatus: "OK" | "WARNING" | "BLOCKED";
  detail?: unknown;
};

const SYSTEM_METRIC_ACTOR = {
  id: "system:okr-metric-worker",
  name: "OKR经营指标自动取数",
} as const;

const BLOCKED_ERROR_CODES = {
  PROVIDER_FAILED: "METRIC_PROVIDER_FAILED",
  DATA_BLOCKED: "METRIC_DATA_BLOCKED",
} as const;

export interface OkrMetricProvider {
  read(input: MetricReadInput): Promise<MetricReadResult>;
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

function healthFor(progress: number) {
  return progress >= 60 ? "ON_TRACK" : progress >= 25 ? "AT_RISK" : "OFF_TRACK";
}

function canBind(actor: AuthenticatedUser) {
  return hasPermission(actor, PERMISSION_KEYS.OKR_METRIC_BIND, "write");
}

function supportedMetric(value: unknown): MetricCode | null {
  const code = String(value || "").trim();
  return OKR_METRIC_CATALOG.some((metric) => metric.code === code)
    ? (code as MetricCode)
    : null;
}

async function departmentIds(
  prisma: PrismaLike,
  rootId: string,
): Promise<string[]> {
  const rows = await prisma.department.findMany({
    select: { id: true, parentId: true },
  });
  const result = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (row.parentId && result.has(row.parentId) && !result.has(row.id)) {
        result.add(row.id);
        changed = true;
      }
    }
  }
  return [...result];
}

async function actorScope(prisma: PrismaLike, actor: AuthenticatedUser) {
  if (isSuperAdmin(actor))
    return { level: "all" as const, departments: [] as string[] };
  const role = actor.roleId
    ? await prisma.role?.findUnique?.({ where: { id: actor.roleId } })
    : null;
  const level =
    role?.dataScopes?.okr === "all" || role?.dataScopes?.okr === "department"
      ? (role.dataScopes.okr as "all" | "department")
      : "self";
  return {
    level,
    departments:
      level === "department" && actor.departmentId
        ? await departmentIds(prisma, actor.departmentId)
        : actor.departmentId
          ? [actor.departmentId]
          : [],
  };
}

async function canManageObjective(
  prisma: PrismaLike,
  actor: AuthenticatedUser,
  objective: any,
) {
  if (
    isSuperAdmin(actor) ||
    hasPermission(actor, PERMISSION_KEYS.OKR_COMPANY_MANAGE, "write")
  )
    return true;
  if (objective.ownerId === actor.id && objective.scope === "INDIVIDUAL")
    return true;
  if (!hasPermission(actor, PERMISSION_KEYS.OKR_DEPARTMENT_MANAGE, "write"))
    return false;
  const scope = await actorScope(prisma, actor);
  return (
    scope.level === "all" ||
    (scope.level === "department" &&
      scope.departments.includes(objective.departmentId || ""))
  );
}

function intersectVisibility(
  first: BusinessCockpitVisibility,
  second: BusinessCockpitVisibility,
): BusinessCockpitVisibility {
  if (first.unrestricted) return second;
  if (second.unrestricted) return first;
  const secondIds = new Set(second.visibleUserIds);
  const secondNames = new Set(second.visibleUserNames);
  return {
    unrestricted: false,
    visibleUserIds: first.visibleUserIds.filter((id) => secondIds.has(id)),
    visibleUserNames: first.visibleUserNames.filter((name) =>
      secondNames.has(name),
    ),
  };
}

async function bindingScopeVisibility(
  prisma: PrismaLike,
  binding: any,
): Promise<BusinessCockpitVisibility> {
  if (binding.scopeType === "COMPANY")
    return { unrestricted: true, visibleUserIds: [], visibleUserNames: [] };
  const where =
    binding.scopeType === "USER"
      ? { id: binding.scopeId }
      : { departmentId: { in: await departmentIds(prisma, binding.scopeId) } };
  const users = await prisma.user.findMany({
    where: { ...where, isActive: true, employmentStatus: "active" },
    select: { id: true, name: true },
  });
  return {
    unrestricted: false,
    visibleUserIds: users.map((user: any) => user.id),
    visibleUserNames: users.map((user: any) => user.name),
  };
}

async function actorBusinessVisibility(
  prisma: PrismaLike,
  actorId: string,
  metricCode: MetricCode,
): Promise<BusinessCockpitVisibility> {
  const [actorRow, userRows, roleRows, departmentRows] = await Promise.all([
    prisma.user.findUnique({ where: { id: actorId } }),
    prisma.user.findMany(),
    prisma.role.findMany({ where: { isActive: true } }),
    prisma.department.findMany(),
  ]);
  if (!actorRow?.isActive || actorRow.employmentStatus === "left")
    return { unrestricted: false, visibleUserIds: [], visibleUserNames: [] };
  const actor = mapPrismaUser(actorRow);
  const users = userRows.map(mapPrismaUser);
  const roles = roleRows.map(mapPrismaRole);
  const departments = departmentRows.map(mapPrismaDepartment);
  const domain = metricCode.startsWith("RECOVERY_")
    ? "recoveryOrders"
    : "orders";
  const scope = buildDataVisibilityScopeForUser(
    actor,
    users,
    roles,
    departments,
    domain,
  );
  return {
    unrestricted: scope.unrestricted,
    visibleUserIds: scope.visibleUserIds,
    visibleUserNames: scope.visibleUserNames,
  };
}

async function visibilityForBinding(
  prisma: PrismaLike,
  binding: any,
  metricCode: MetricCode,
): Promise<BusinessCockpitVisibility> {
  const [okrVisibility, businessVisibility] = await Promise.all([
    bindingScopeVisibility(prisma, binding),
    actorBusinessVisibility(prisma, binding.createdById, metricCode),
  ]);
  return intersectVisibility(okrVisibility, businessVisibility);
}

export function createOkrMetricService({
  prisma,
  provider,
  now = () => new Date(),
}: {
  prisma: PrismaLike;
  provider: OkrMetricProvider;
  now?: () => Date;
}) {
  const lockCycle = async (tx: PrismaLike, cycleId: string) => {
    const rows =
      await tx.$queryRaw`SELECT id, status FROM okr_cycles WHERE id = ${cycleId} FOR UPDATE`;
    return Array.isArray(rows) ? rows[0] || null : null;
  };
  const context = async (keyResultId: string) => {
    const keyResult = await prisma.keyResult.findUnique({
      where: { id: keyResultId },
    });
    if (!keyResult) return null;
    const objective = await prisma.objective.findUnique({
      where: { id: keyResult.objectiveId },
    });
    if (!objective) return null;
    const cycle = await prisma.okrCycle.findUnique({
      where: { id: objective.cycleId },
    });
    return cycle ? { keyResult, objective, cycle } : null;
  };

  return {
    listCatalog(actor: AuthenticatedUser) {
      if (!canBind(actor))
        return Promise.resolve(failure<never>("无权查看经营指标目录", 403));
      return Promise.resolve(success([...OKR_METRIC_CATALOG]));
    },

    async bind(actor: AuthenticatedUser, keyResultId: string, raw: any) {
      if (!canBind(actor)) return failure<never>("无权绑定经营指标", 403);
      const metricCode = supportedMetric(raw?.metricCode);
      if (!metricCode)
        return failure<never>("该经营指标尚未通过自动取数审计", 400);
      const loaded = await context(keyResultId);
      if (!loaded) return failure<never>("KR不存在", 404);
      if (loaded.cycle.status !== "DRAFT")
        return failure<never>("只能在草稿周期绑定经营指标", 409);
      if (!(await canManageObjective(prisma, actor, loaded.objective)))
        return failure<never>("目标不在授权数据范围内", 403);
      const existing = await prisma.okrMetricBinding.findUnique({
        where: { keyResultId },
      });
      if (existing) return failure<never>("该KR已经绑定经营指标", 409);
      const scopeType =
        loaded.objective.scope === "INDIVIDUAL"
          ? "USER"
          : loaded.objective.scope;
      const scopeId =
        scopeType === "COMPANY"
          ? null
          : scopeType === "USER"
            ? loaded.objective.ownerId
            : loaded.objective.departmentId;
      if (!scopeId && scopeType !== "COMPANY")
        return failure<never>("目标缺少可审计的数据范围", 409);
      const committedAt = now();
      const row = await prisma.$transaction(async (tx: PrismaLike) => {
        const lockedCycle = await lockCycle(tx, loaded.cycle.id);
        if (lockedCycle?.status !== "DRAFT") return null;
        const currentKr = await tx.keyResult.findUnique({
          where: { id: keyResultId },
        });
        if (!currentKr || currentKr.objectiveId !== loaded.objective.id)
          return null;
        const duplicate = await tx.okrMetricBinding.findUnique({
          where: { keyResultId },
        });
        if (duplicate) return null;
        const binding = await tx.okrMetricBinding.create({
          data: {
            id: randomUUID(),
            keyResultId,
            metricCode,
            metricVersion: 1,
            scopeType,
            scopeId,
            createdById: actor.id,
            createdByName: actor.name,
            nextRefreshAt: committedAt,
            createdAt: committedAt,
            updatedAt: committedAt,
          },
        });
        await tx.keyResult.update({
          where: { id: keyResultId },
          data: { source: "SYSTEM_METRIC", updatedAt: committedAt },
        });
        await tx.okrEvent.create({
          data: {
            id: randomUUID(),
            cycleId: loaded.cycle.id,
            objectiveId: loaded.objective.id,
            keyResultId,
            actorId: actor.id,
            actorName: actor.name,
            action: "BIND_METRIC",
            detail: { metricCode, metricVersion: 1, scopeType, scopeId },
            createdAt: committedAt,
          },
        });
        return binding;
      });
      if (!row)
        return failure<never>("周期状态已变化或该KR已经绑定经营指标", 409);
      return success(row, "经营指标已绑定");
    },

    async refresh(actor: AuthenticatedUser, keyResultId: string) {
      if (!canBind(actor)) return failure<never>("无权刷新经营指标", 403);
      const loaded = await context(keyResultId);
      if (!loaded) return failure<never>("KR不存在", 404);
      if (!(await canManageObjective(prisma, actor, loaded.objective)))
        return failure<never>("目标不在授权数据范围内", 403);
      return refreshSystemMetric(keyResultId, actor);
    },

    refreshSystem(
      keyResultId: string,
      options?: {
        refreshSlot?: string;
        leaseOwner?: string;
        leaseEpoch?: number;
      },
    ) {
      return refreshSystemMetric(keyResultId, SYSTEM_METRIC_ACTOR, options);
    },
  };

  async function refreshSystemMetric(
    keyResultId: string,
    actor: { id: string; name: string },
    options: {
      refreshSlot?: string;
      leaseOwner?: string;
      leaseEpoch?: number;
    } = {},
  ) {
    const loaded = await context(keyResultId);
    if (!loaded) return failure<never>("KR不存在", 404);
    if (loaded.cycle.status !== "ACTIVE")
      return failure<never>("只能刷新进行中周期的经营指标", 409);
    const binding = await prisma.okrMetricBinding.findUnique({
      where: { keyResultId },
    });
    if (!binding) return failure<never>("该KR尚未绑定经营指标", 404);
    const metricCode = supportedMetric(binding.metricCode);
    if (!metricCode) return failure<never>("指标版本已停用，请重新配置", 409);
    const measuredAt = now();
    const refreshSlot = options.refreshSlot || measuredAt.toISOString();
    const endAt =
      measuredAt < loaded.cycle.endAt ? measuredAt : loaded.cycle.endAt;
    let reading: MetricReadResult;
    let blockedErrorCode:
      (typeof BLOCKED_ERROR_CODES)[keyof typeof BLOCKED_ERROR_CODES] | null =
      null;
    try {
      const visibility = await visibilityForBinding(
        prisma,
        binding,
        metricCode,
      );
      reading = await provider.read({
        metricCode,
        startAt: loaded.cycle.startAt,
        endAt,
        visibility,
      });
      if (
        !Number.isFinite(reading.value) ||
        reading.qualityStatus === "BLOCKED"
      ) {
        blockedErrorCode = BLOCKED_ERROR_CODES.DATA_BLOCKED;
      }
    } catch {
      reading = {
        value: Number(loaded.keyResult.currentValue || 0),
        qualityStatus: "BLOCKED",
      };
      blockedErrorCode = BLOCKED_ERROR_CODES.PROVIDER_FAILED;
    }
    if (blockedErrorCode) {
      const blockedSnapshot = await prisma.$transaction(
        async (tx: PrismaLike) => {
          const lockedCycle = await lockCycle(tx, loaded.cycle.id);
          if (lockedCycle?.status !== "ACTIVE") return null;
          const activeBinding = await tx.okrMetricBinding.findFirst({
            where: {
              id: binding.id,
              ...(options.leaseOwner
                ? {
                    leaseOwner: options.leaseOwner,
                    leaseEpoch: options.leaseEpoch,
                    leaseExpiresAt: { gt: measuredAt },
                  }
                : {}),
              keyResult: { objective: { cycle: { status: "ACTIVE" } } },
            },
          });
          if (!activeBinding) return null;
          const snapshot = await tx.okrMetricSnapshot.create({
            data: {
              id: randomUUID(),
              bindingId: binding.id,
              refreshSlot,
              value: Number(loaded.keyResult.currentValue || 0),
              sourceCount: null,
              qualityStatus: "BLOCKED",
              detail: { errorCode: blockedErrorCode },
              rangeStartAt: loaded.cycle.startAt,
              rangeEndAt: endAt,
              measuredAt,
              createdAt: measuredAt,
            },
          });
          await tx.okrEvent.create({
            data: {
              id: randomUUID(),
              cycleId: loaded.cycle.id,
              objectiveId: loaded.objective.id,
              keyResultId,
              actorId: actor.id,
              actorName: actor.name,
              action: "REFRESH_METRIC_BLOCKED",
              detail: {
                metricCode,
                errorCode: blockedErrorCode,
                snapshotId: snapshot.id,
              },
              createdAt: measuredAt,
            },
          });
          return snapshot;
        },
      );
      if (!blockedSnapshot)
        return failure<never>("周期状态已变化或经营指标刷新租约已失效", 409);
      return failure<never>(
        "经营指标数据质量阻断，已记录失败快照且未更新KR进度",
        409,
      );
    }
    const progress = progressFor(loaded.keyResult, reading.value);
    const health = healthFor(progress);
    const result = await prisma.$transaction(async (tx: PrismaLike) => {
      const lockedCycle = await lockCycle(tx, loaded.cycle.id);
      if (lockedCycle?.status !== "ACTIVE") return null;
      const activeBinding = await tx.okrMetricBinding.findFirst({
        where: {
          id: binding.id,
          ...(options.leaseOwner
            ? {
                leaseOwner: options.leaseOwner,
                leaseEpoch: options.leaseEpoch,
                leaseExpiresAt: { gt: measuredAt },
              }
            : {}),
          keyResult: { objective: { cycle: { status: "ACTIVE" } } },
        },
      });
      if (!activeBinding) return null;
      const snapshot = await tx.okrMetricSnapshot.create({
        data: {
          id: randomUUID(),
          bindingId: binding.id,
          refreshSlot,
          value: reading.value,
          sourceCount: reading.sourceCount ?? null,
          qualityStatus: reading.qualityStatus,
          detail: reading.detail ?? undefined,
          rangeStartAt: loaded.cycle.startAt,
          rangeEndAt: endAt,
          measuredAt,
          createdAt: measuredAt,
        },
      });
      const keyResult = await tx.keyResult.update({
        where: { id: keyResultId },
        data: {
          currentValue: reading.value,
          progress,
          health,
          source: "SYSTEM_METRIC",
          lastCheckInAt: measuredAt,
          updatedAt: measuredAt,
        },
      });
      const keyResults = await tx.keyResult.findMany({
        where: { objectiveId: loaded.objective.id },
      });
      const totalWeight =
        keyResults.reduce(
          (sum: number, row: any) => sum + Number(row.weight),
          0,
        ) || 1;
      const objectiveProgress =
        Math.round(
          (keyResults.reduce(
            (sum: number, row: any) =>
              sum + Number(row.progress) * Number(row.weight),
            0,
          ) /
            totalWeight) *
            100,
        ) / 100;
      const objectiveHealth = keyResults.some(
        (row: any) => row.health === "OFF_TRACK",
      )
        ? "OFF_TRACK"
        : keyResults.some((row: any) => row.health === "AT_RISK")
          ? "AT_RISK"
          : "ON_TRACK";
      await tx.objective.update({
        where: { id: loaded.objective.id },
        data: {
          progress: objectiveProgress,
          health: objectiveHealth,
          updatedAt: measuredAt,
        },
      });
      await tx.okrEvent.create({
        data: {
          id: randomUUID(),
          cycleId: loaded.cycle.id,
          objectiveId: loaded.objective.id,
          keyResultId,
          actorId: actor.id,
          actorName: actor.name,
          action: "REFRESH_METRIC",
          detail: {
            metricCode,
            value: reading.value,
            progress,
            qualityStatus: reading.qualityStatus,
            snapshotId: snapshot.id,
          },
          createdAt: measuredAt,
        },
      });
      return { binding, snapshot, keyResult, objectiveProgress };
    });
    if (!result)
      return failure<never>("周期状态已变化或经营指标刷新租约已失效", 409);
    return success(result, "经营指标已刷新");
  }
}

type SnapshotReader = {
  getSnapshot(
    query: BusinessCockpitQuery,
  ): Promise<ApiResponse<BusinessCockpitSnapshot>>;
};

export function createBusinessCockpitOkrMetricProvider(
  reader: SnapshotReader,
): OkrMetricProvider {
  return {
    async read(input) {
      const response = await reader.getSnapshot({
        startAt: input.startAt.toISOString(),
        endAt: input.endAt.toISOString(),
        visibility: input.visibility,
      });
      if (response.code !== 0 || !response.data)
        throw new Error(response.message || "经营指标读取失败");
      const snapshot = response.data;
      const values: Record<MetricCode, { value: number; sourceCount: number }> =
        {
          FORMAL_ORDER_PAID_AMOUNT: {
            value: snapshot.business.formalOrderPaidAmount,
            sourceCount: snapshot.business.formalPaymentCount,
          },
          FORMAL_ORDER_COUNT: {
            value: snapshot.business.formalOrderCount,
            sourceCount: snapshot.business.formalOrderCount,
          },
          RECOVERY_BUSINESS_AMOUNT: {
            value: snapshot.business.recoveryBusinessAmount,
            sourceCount: snapshot.business.recoveryOrderCount,
          },
          RECOVERY_ORDER_COUNT: {
            value: snapshot.business.recoveryOrderCount,
            sourceCount: snapshot.business.recoveryOrderCount,
          },
        };
      const selected = values[input.metricCode];
      const identityWarnings = Number(
        snapshot.dataQuality?.missingSalesIdentityPaymentCount || 0,
      );
      return {
        ...selected,
        qualityStatus: identityWarnings > 0 ? "WARNING" : "OK",
        detail: {
          source: "business-cockpit-v1",
          metricCode: input.metricCode,
          missingSalesIdentityPaymentCount: identityWarnings,
        },
      };
    },
  };
}

export type OkrMetricService = ReturnType<typeof createOkrMetricService>;
