import {
  DEFAULT_CUSTOMER_LIFECYCLE_TRANSITIONS,
  DEFAULT_LIFECYCLE_STATUS_CONFIGS,
  LIFECYCLE_STATUS_CODES,
} from '../../src/shared/utils/constants';
import type {
  CustomerLifecycleConfig,
  CustomerLifecycleStatus,
} from '../../src/types/customer';

export type { CustomerLifecycleConfig, CustomerLifecycleStatus } from '../../src/types/customer';

const SYSTEM_ONLY_LIFECYCLE_CODES = new Set<string>([
  LIFECYCLE_STATUS_CODES.PUBLIC_POOL,
  LIFECYCLE_STATUS_CODES.ORDERED,
  LIFECYCLE_STATUS_CODES.REFUNDED,
  'deal_closed',
]);

export interface LifecycleTransitionInput {
  from: string;
  to: string;
  config: CustomerLifecycleConfig;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeStatuses(value: unknown): CustomerLifecycleStatus[] {
  const rows = Array.isArray(value) ? value : DEFAULT_LIFECYCLE_STATUS_CONFIGS;
  return rows
    .filter(isRecord)
    .map((row, index) => ({
      id: String(row.id || `lifecycle-${index + 1}`),
      code: String(row.code || '').trim(),
      name: String(row.name || row.code || '').trim(),
      description: row.description == null ? undefined : String(row.description),
      color: String(row.color || '#9E9E9E'),
      isActive: row.isActive !== false,
      sortOrder: Number.isFinite(Number(row.sortOrder)) ? Number(row.sortOrder) : index + 1,
      isSystem: row.isSystem === true,
      allowedManualTargetCodes: Array.isArray(row.allowedManualTargetCodes)
        ? Array.from(new Set(row.allowedManualTargetCodes.map((target) => String(target).trim()).filter(Boolean)))
        : undefined,
      createdAt: String(row.createdAt || ''),
      updatedAt: String(row.updatedAt || ''),
    }))
    .filter((row) => Boolean(row.code));
}

function normalizeTransitions(
  value: unknown,
  statuses: CustomerLifecycleStatus[],
): Record<string, string[]> {
  if (!isRecord(value)) {
    const configuredManualCodes = statuses
      .filter((status) => status.isActive && !SYSTEM_ONLY_LIFECYCLE_CODES.has(status.code))
      .map((status) => status.code);
    const hasCustomOrLegacyStatuses = statuses.some((status) => (
      !Object.prototype.hasOwnProperty.call(DEFAULT_CUSTOMER_LIFECYCLE_TRANSITIONS, status.code)
    ));
    const hasExplicitPerStatusTransitions = statuses.some((status) => (
      Array.isArray(status.allowedManualTargetCodes)
    ));

    // Historical arrays had no graph, but their active custom states were
    // manually editable. Keep those states usable while still rejecting global
    // system terminal codes in assertLifecycleTransition below.
    if (hasCustomOrLegacyStatuses || !hasExplicitPerStatusTransitions) {
      return Object.fromEntries(statuses.map((status) => [
        status.code,
        Array.isArray(status.allowedManualTargetCodes)
          ? Array.from(new Set(status.allowedManualTargetCodes.map((target) => String(target).trim()).filter(Boolean)))
          : configuredManualCodes.filter((target) => target !== status.code),
      ]));
    }

    return Object.fromEntries(statuses.map((status) => [
      status.code,
      Array.from(new Set(
        (status.allowedManualTargetCodes || []).map((target) => String(target).trim()).filter(Boolean),
      )),
    ]));
  }
  return Object.fromEntries(
    Object.entries(value).map(([from, targets]) => [
      from,
      Array.isArray(targets)
        ? Array.from(new Set(targets.map((target) => String(target).trim()).filter(Boolean)))
        : [],
    ]),
  );
}

/**
 * Accept both the legacy stored status array and the phase-one policy object.
 * Missing transition metadata receives the conservative default graph.
 */
export function normalizeCustomerLifecycleConfig(input: unknown): CustomerLifecycleConfig {
  const source = isRecord(input) ? input : {};
  const statuses = normalizeStatuses(Array.isArray(input) ? input : source.statuses);
  const enabledStatusCodes = Array.isArray(source.enabledStatusCodes)
    ? Array.from(new Set(source.enabledStatusCodes.map((code) => String(code).trim()).filter(Boolean)))
    : statuses.filter((status) => status.isActive).map((status) => status.code);
  return {
    statuses,
    enabledStatusCodes,
    transitions: normalizeTransitions(source.transitions, statuses),
  };
}

export function getManualLifecycleTargets(config: CustomerLifecycleConfig): CustomerLifecycleStatus[] {
  const enabled = new Set(config.enabledStatusCodes);
  return config.statuses
    .filter((status) => enabled.has(status.code) && !SYSTEM_ONLY_LIFECYCLE_CODES.has(status.code))
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

export function assertLifecycleTransition(input: LifecycleTransitionInput): void {
  if (SYSTEM_ONLY_LIFECYCLE_CODES.has(input.to)) {
    throw new Error('该状态为系统状态，由归属或业务命令驱动，不能手工设置');
  }
  if (!input.config.enabledStatusCodes.includes(input.to)) {
    throw new Error('目标进展已停用');
  }
  if (!input.config.transitions[input.from]?.includes(input.to)) {
    throw new Error('当前进展不允许转入目标进展');
  }
}
