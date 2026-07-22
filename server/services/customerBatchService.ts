import { Prisma, type PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  DEFAULT_LIFECYCLE_STATUS_CONFIGS,
  LIFECYCLE_STATUS_CODES,
  STORAGE_KEYS,
} from '../../src/shared/utils/constants';
import {
  getCustomerBatchActionPermissions,
  PERMISSION_KEYS,
} from '../../src/shared/utils/permissions';
import type {
  BatchPrecheckGuardManifest,
  CreateCustomerBatchJobRequest,
  CustomerBatchJobItemView,
  CustomerBatchJobResultView,
  CustomerBatchJobSummary,
  CustomerBatchOperation,
  CustomerBatchOperationInput,
  CustomerBatchPrecheckRequest,
  CustomerBatchPrecheckResult,
  CustomerBatchSelection,
} from '../../src/types/customerBatch';
import type { CustomerFilters } from '../../src/types/customer';
import type { CustomerTagCatalog } from '../../src/types/tag';
import type { AuthenticatedUser } from '../../src/types/auth';
import {
  buildCustomerAccessContextFromDirectory,
  canManageCustomer,
  canReadCustomer,
  loadCustomerAccessContext,
  type CustomerAccessContext,
} from './customerAccessPolicy';
import {
  createCustomerBatchSelectionService,
  type FrozenCustomerSelection,
} from './customerBatchSelectionService';
import {
  BatchPrecheckAuthorizationError,
  BatchPrecheckConflictError,
  BatchPrecheckValidationError,
  consumeBatchPrecheckToken,
  issueBatchPrecheckToken,
  sha256Json,
  type BatchPrecheckResultEnvelope,
  type BatchPrecheckStoredRow,
  type BatchPrecheckTokenStore,
} from './customerBatchPrecheckService';
import { lockCustomerAssociationScope } from './customerAssociationRegistry';
import {
  assertLifecycleTransition,
  normalizeCustomerLifecycleConfig,
  normalizeCustomerLifecycleValue,
  type CustomerLifecycleConfig,
} from './customerLifecyclePolicy';
import { mapPrismaDepartment, mapPrismaRole, mapPrismaUser } from '../db/prismaMappers';
import { toAuthenticatedUser } from '../../src/shared/utils/permissions';
import { mergeRoleWithDefaultAccess } from '../../src/shared/utils/organizationConfig';
import { mapCustomerBusinessRecord, type CustomerBusinessRecordRow } from './customerBusinessRecordRepository';
import { validateManualTagUpdateSelection } from './customerTagPolicy';

type BatchTx = any;

type LockedBatchCustomer = {
  customer: any;
  businessRecordUpdatedAt: Date | string;
};

type GuardRevisions = {
  lifecycleConfigRevision: string;
  tagCatalogRevision: string;
  lifecycleConfig?: CustomerLifecycleConfig;
  tagCatalog?: CustomerTagCatalog;
};

type StoredBatchJob = {
  id: string;
  handlerKey: string;
  operation: string;
  status: string;
  selectionMode: string;
  selectedCustomerIds: unknown;
  filterSnapshot?: unknown | null;
  input?: unknown;
  inputHash: string;
  idempotencyFingerprint: string;
  reason?: string;
  idempotencyKey: string;
  actorId: string;
  actorName?: string;
  actorDepartmentId?: string | null;
  frozenCustomerCount: number;
  totalCount: number;
  successCount?: number;
  failedCount?: number;
  skippedCount?: number;
  cancelledCount?: number;
  createdAt: Date | string;
  startedAt?: Date | string | null;
  finishedAt?: Date | string | null;
  cancelRequestedAt?: Date | string | null;
  cancelledAt?: Date | string | null;
};

type StoredBatchJobItem = {
  id: string;
  targetKey: string;
  status: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  retryable?: boolean;
  attemptCount?: number;
};

type CreateJobInput = {
  id: string;
  actorId: string;
  actorName: string;
  handlerKey: string;
  operation: CustomerBatchOperation;
  selectionMode: CustomerBatchSelection['mode'];
  customerIds: string[];
  filterSnapshot: unknown | null;
  input: CustomerBatchOperationInput;
  inputHash: string;
  reason: string;
  idempotencyKey: string;
  idempotencyFingerprint: string;
  versionManifest: Record<string, string>;
};

export type CustomerBatchJobStore<Tx = BatchTx> = {
  findExisting(tx: Tx, input: {
    actorId: string;
    handlerKey: string;
    operation: string;
    idempotencyKey: string;
  }): Promise<StoredBatchJob | null>;
  create(tx: Tx, input: CreateJobInput): Promise<BatchPrecheckResultEnvelope<'customer_batch_job', StoredBatchJob>>;
  load(tx: Tx, id: string): Promise<BatchPrecheckResultEnvelope<'customer_batch_job', StoredBatchJob> | null>;
  get(client: Tx, id: string): Promise<StoredBatchJob | null>;
  /** Lock a job before changing cancellation state. */
  lock(tx: Tx, id: string): Promise<StoredBatchJob | null>;
  /** Omit actorId only for the audit-reader list, which the service filters by current scope. */
  list(client: Tx, actorId?: string): Promise<StoredBatchJob[]>;
  listItems(client: Tx, jobId: string): Promise<StoredBatchJobItem[]>;
  /** `job` must be the row locked by `lock()` in this same transaction. */
  requestCancellation(tx: Tx, job: StoredBatchJob): Promise<StoredBatchJob | null>;
};

export type CustomerBatchServiceOptions<Tx = BatchTx> = {
  selectionService?: { freeze(selection: CustomerBatchSelection, context: CustomerAccessContext): Promise<FrozenCustomerSelection> };
  tokenStore?: BatchPrecheckTokenStore<Tx>;
  jobStore?: CustomerBatchJobStore<Tx>;
  /** Must reload server-authoritative current role/scope, never request claims. */
  loadCurrentAccess?: (client: Tx, actorId: string) => Promise<CustomerAccessContext>;
  /** Must use current/locking reads at confirmation time. */
  lockCurrentAccess?: (tx: Tx, actorId: string) => Promise<CustomerAccessContext>;
  /** Must lock frozen BusinessRecord rows in caller-provided sorted order. */
  lockCustomerRecords?: (tx: Tx, customerIds: string[]) => Promise<LockedBatchCustomer[]>;
  readGuardRevisions?: (client: Tx) => Promise<GuardRevisions>;
  lockGuardRevisions?: (tx: Tx) => Promise<GuardRevisions>;
  /** Soft-delete guard must precede customer record locks to match direct delete. */
  lockSoftDeleteScope?: (tx: Tx, customerIds: string[]) => Promise<void>;
  readJobCustomers?: (client: Tx, customerIds: string[]) => Promise<Array<{ customer: any }>>;
  /** Validates current action-specific prerequisites under the same tx locks. */
  validateOperationGuard?: (
    tx: Tx,
    operation: CustomerBatchOperation,
    input: CustomerBatchOperationInput,
    access: CustomerAccessContext,
    records: LockedBatchCustomer[],
    revisions: GuardRevisions,
  ) => Promise<void>;
  now?: () => Date;
  createId?: (prefix: string) => string;
  createToken?: () => string;
};

const MAX_IDEMPOTENCY_KEY_LENGTH = 128;
const SAFE_IDEMPOTENCY_KEY = /^[a-z0-9][a-z0-9._:-]{0,127}$/;
const CUSTOMER_BATCH_HANDLER_KEY = 'customer_mutation';
const TAG_CATALOG_LOCK_DOMAIN = 'aaos_internal_locks';
const TAG_CATALOG_LOCK_RECORD_ID = 'customer-tag-catalog-writes';

function cleanText(value: unknown): string {
  return String(value || '').trim();
}

function decodeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  const decoded = decodeJson(value);
  return decoded && typeof decoded === 'object' && !Array.isArray(decoded)
    ? decoded as Record<string, unknown>
    : null;
}

function asArray(value: unknown): unknown[] | null {
  const decoded = decodeJson(value);
  return Array.isArray(decoded) ? decoded : null;
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function rawRows<T = any>(client: { $queryRaw(query: Prisma.Sql): Promise<unknown> }, query: Prisma.Sql): Promise<T[]> {
  return client.$queryRaw(query) as Promise<T[]>;
}

function toIso(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function requireObject(value: unknown, message: string): Record<string, unknown> {
  const result = asRecord(value);
  if (!result) throw new BatchPrecheckValidationError(message);
  return result;
}

function assertOnlyKeys(value: Record<string, unknown>, keys: readonly string[], message: string): void {
  if (Object.keys(value).some((key) => !keys.includes(key))) throw new BatchPrecheckValidationError(message);
}

function normalizeReason(value: unknown): string {
  const reason = cleanText(value);
  if (!reason) throw new BatchPrecheckValidationError('批量操作原因不能为空');
  if (reason.length > 1_000) throw new BatchPrecheckValidationError('批量操作原因不能超过1000个字符');
  return reason;
}

function normalizeCustomerIds(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length) throw new BatchPrecheckValidationError('请选择至少一个客户');
  if (value.length > 10_000) throw new BatchPrecheckValidationError('单次任务最多处理 10,000 个客户，请缩小筛选范围');
  const ids = value.map(cleanText);
  if (ids.some((id) => !id || id.length > 80)) throw new BatchPrecheckValidationError('客户 ID 无效');
  if (new Set(ids).size !== ids.length) throw new BatchPrecheckValidationError('客户 ID 不能重复');
  return ids.sort();
}

const FILTER_KEYS = [
  'search', 'productLevel', 'customerLevel', 'lifecycleStatusCode', 'owner', 'followStatus',
  'sourceType', 'leadSource', 'industry', 'city', 'tagIds', 'tagMatch', 'withoutTags',
  'missingTagGroupId', 'tag',
] as const;

function normalizeFilters(value: unknown): CustomerFilters {
  const raw = requireObject(value, '筛选条件无效');
  assertOnlyKeys(raw, FILTER_KEYS, '筛选条件包含不允许的字段');
  const normalized: Record<string, unknown> = {};
  for (const key of FILTER_KEYS) {
    if (raw[key] === undefined) continue;
    if (key === 'tagIds') {
      if (!Array.isArray(raw[key]) || raw[key].length > 20 || raw[key].some((item) => !cleanText(item))) {
        throw new BatchPrecheckValidationError('客户标签筛选无效');
      }
      normalized[key] = Array.from(new Set(raw[key].map(cleanText))).sort();
      continue;
    }
    if (key === 'withoutTags') {
      if (typeof raw[key] !== 'boolean') throw new BatchPrecheckValidationError('withoutTags 必须为布尔值');
      normalized[key] = raw[key];
      continue;
    }
    if (key === 'tagMatch') {
      if (!['any', 'all', 'grouped'].includes(String(raw[key]))) throw new BatchPrecheckValidationError('标签匹配方式无效');
      normalized[key] = raw[key];
      continue;
    }
    if (key === 'followStatus') {
      if (!['has_follow', 'no_follow'].includes(String(raw[key]))) throw new BatchPrecheckValidationError('跟进筛选条件无效');
      normalized[key] = raw[key];
      continue;
    }
    const text = cleanText(raw[key]);
    if (text.length > 200) throw new BatchPrecheckValidationError('筛选条件长度不能超过200个字符');
    if (text) normalized[key] = text;
  }
  return normalized as CustomerFilters;
}

export function normalizeCustomerBatchSelection(value: unknown): CustomerBatchSelection {
  const raw = requireObject(value, '请选择批量处理范围');
  const mode = cleanText(raw.mode);
  if (mode === 'ids') {
    assertOnlyKeys(raw, ['mode', 'customerIds'], '客户选择包含不允许的字段');
    return { mode, customerIds: normalizeCustomerIds(raw.customerIds) };
  }
  if (mode === 'filter_snapshot') {
    assertOnlyKeys(raw, ['mode', 'filters'], '客户选择包含不允许的字段');
    return { mode, filters: normalizeFilters(raw.filters) };
  }
  throw new BatchPrecheckValidationError('客户选择方式无效');
}

function normalizeOperation(value: unknown): CustomerBatchOperation {
  const operation = cleanText(value);
  if (!['transfer', 'release_to_pool', 'set_progress', 'update_tags', 'add_todo', 'soft_delete'].includes(operation)) {
    throw new BatchPrecheckValidationError('不支持的批量操作');
  }
  return operation as CustomerBatchOperation;
}

export function normalizeCustomerBatchOperationInput(
  operation: CustomerBatchOperation,
  value: unknown,
): CustomerBatchOperationInput {
  const raw = requireObject(value, '批量操作参数无效');
  if (operation === 'transfer') {
    assertOnlyKeys(raw, ['targetOwnerId'], '转让参数包含不允许的字段');
    const targetOwnerId = cleanText(raw.targetOwnerId);
    if (!targetOwnerId || targetOwnerId.length > 64) throw new BatchPrecheckValidationError('目标负责人无效');
    return { targetOwnerId };
  }
  if (operation === 'release_to_pool') {
    assertOnlyKeys(raw, [], '释放客户参数无效');
    return {};
  }
  if (operation === 'set_progress') {
    assertOnlyKeys(raw, ['lifecycleStatusCode'], '设置进展参数包含不允许的字段');
    const lifecycleStatusCode = cleanText(raw.lifecycleStatusCode);
    if (!lifecycleStatusCode || lifecycleStatusCode.length > 80) throw new BatchPrecheckValidationError('客户进展无效');
    return { lifecycleStatusCode };
  }
  if (operation === 'update_tags') {
    assertOnlyKeys(raw, ['mode', 'tagIds'], '标签参数包含不允许的字段');
    const mode = raw.mode === 'add' || raw.mode === 'remove' ? raw.mode : null;
    const tagIds = Array.isArray(raw.tagIds) ? raw.tagIds.map(cleanText) : [];
    if (!mode || !tagIds.length || tagIds.length > 100 || tagIds.some((tagId) => !tagId || tagId.length > 80)) {
      throw new BatchPrecheckValidationError('标签参数无效');
    }
    return { mode, tagIds: Array.from(new Set(tagIds)).sort() };
  }
  if (operation === 'add_todo') {
    assertOnlyKeys(raw, ['title', 'content', 'dueAt', 'executionMethod'], '待办参数包含不允许的字段');
    const title = cleanText(raw.title);
    const content = raw.content === undefined ? undefined : cleanText(raw.content);
    const dueAt = cleanText(raw.dueAt);
    const executionMethod = cleanText(raw.executionMethod);
    if (!title || title.length > 120 || (content?.length || 0) > 2_000 || !dueAt || Number.isNaN(new Date(dueAt).getTime())) {
      throw new BatchPrecheckValidationError('待办参数无效');
    }
    if (!['none', 'phone', 'wechat', 'visit', 'sms', 'email'].includes(executionMethod)) {
      throw new BatchPrecheckValidationError('待办执行方式无效');
    }
    return { title, ...(content ? { content } : {}), dueAt: new Date(dueAt).toISOString(), executionMethod };
  }
  assertOnlyKeys(raw, ['confirmed'], '删除参数包含不允许的字段');
  if (raw.confirmed !== true) throw new BatchPrecheckValidationError('删除客户需要明确确认');
  return { confirmed: true };
}

export function normalizeCustomerBatchPrecheckRequest(value: unknown): CustomerBatchPrecheckRequest {
  const raw = requireObject(value, '批量预检请求无效');
  assertOnlyKeys(raw, ['handlerKey', 'operation', 'selection', 'input', 'reason'], '批量预检请求包含不允许的字段');
  const handlerKey = cleanText(raw.handlerKey);
  if (!handlerKey) throw new BatchPrecheckValidationError('批量处理器无效');
  const operation = normalizeOperation(raw.operation);
  return {
    handlerKey,
    operation,
    selection: normalizeCustomerBatchSelection(raw.selection),
    input: normalizeCustomerBatchOperationInput(operation, raw.input),
    reason: normalizeReason(raw.reason),
  };
}

function assertBatchOperationPermissions(context: CustomerAccessContext, operation: CustomerBatchOperation): void {
  const required = getCustomerBatchActionPermissions(operation);
  if (required.some((key) => !context.grantedPermissions.has(key))) {
    throw new BatchPrecheckAuthorizationError('无权执行批量操作');
  }
}

function assertCurrentJobReplayAuthorization(job: StoredBatchJob, context: CustomerAccessContext): void {
  if (job.handlerKey !== CUSTOMER_BATCH_HANDLER_KEY) {
    throw new BatchPrecheckConflictError('预检结果处理器不匹配');
  }
  let operation: CustomerBatchOperation;
  try {
    operation = normalizeOperation(job.operation);
  } catch {
    throw new BatchPrecheckConflictError('预检结果操作无效');
  }
  assertBatchOperationPermissions(context, operation);
}

function readManifest(value: unknown): BatchPrecheckGuardManifest {
  const manifest = asRecord(value);
  const command = asRecord(manifest?.command);
  const guards = Array.isArray(manifest?.customerGuards) ? manifest!.customerGuards : null;
  if (
    !manifest || manifest.version !== 1 || !command || !guards
    || !Array.isArray(manifest.requiredPermissionKeys)
    || typeof manifest.lifecycleConfigRevision !== 'string'
    || typeof manifest.tagCatalogRevision !== 'string'
  ) {
    throw new BatchPrecheckConflictError('预检守卫清单已损坏');
  }
  if (!['ids', 'filter_snapshot'].includes(cleanText(command.selectionMode))) {
    throw new BatchPrecheckConflictError('预检选择方式已损坏');
  }
  if (!Object.prototype.hasOwnProperty.call(command, 'input') || typeof command.reason !== 'string') {
    throw new BatchPrecheckConflictError('预检操作快照已损坏');
  }
  return manifest as unknown as BatchPrecheckGuardManifest;
}

function readVersionManifest(value: unknown): Record<string, string> {
  const raw = asRecord(value);
  if (!raw) throw new BatchPrecheckConflictError('预检版本清单已损坏');
  const result: Record<string, string> = {};
  for (const [customerId, version] of Object.entries(raw)) {
    const normalizedId = cleanText(customerId);
    const normalizedVersion = toIso(version as string);
    if (!normalizedId || !normalizedVersion) throw new BatchPrecheckConflictError('预检版本清单已损坏');
    result[normalizedId] = normalizedVersion;
  }
  return result;
}

function readSelectedIds(value: unknown): string[] {
  const raw = asArray(value);
  if (!raw) throw new BatchPrecheckConflictError('预检冻结选择已损坏');
  const ids = raw.map(cleanText);
  if (!ids.length || ids.some((id) => !id) || new Set(ids).size !== ids.length) {
    throw new BatchPrecheckConflictError('预检冻结选择已损坏');
  }
  return [...ids].sort();
}

function normalizeJobSummary(job: StoredBatchJob): CustomerBatchJobSummary {
  return {
    id: job.id,
    actorId: job.actorId,
    actorName: job.actorName || '',
    handlerKey: job.handlerKey,
    operation: job.operation as CustomerBatchOperation,
    status: job.status as CustomerBatchJobSummary['status'],
    selectionMode: job.selectionMode as CustomerBatchSelection['mode'],
    frozenCustomerCount: Number(job.frozenCustomerCount || 0),
    totalCount: Number(job.totalCount || 0),
    successCount: Number(job.successCount || 0),
    failedCount: Number(job.failedCount || 0),
    skippedCount: Number(job.skippedCount || 0),
    cancelledCount: Number(job.cancelledCount || 0),
    createdAt: toIso(job.createdAt) || new Date(0).toISOString(),
    ...(toIso(job.startedAt) ? { startedAt: toIso(job.startedAt)! } : {}),
    ...(toIso(job.finishedAt) ? { finishedAt: toIso(job.finishedAt)! } : {}),
    ...(toIso(job.cancelRequestedAt) ? { cancelRequestedAt: toIso(job.cancelRequestedAt)! } : {}),
    ...(toIso(job.cancelledAt) ? { cancelledAt: toIso(job.cancelledAt)! } : {}),
  };
}

function normalizeJobItem(item: StoredBatchJobItem): CustomerBatchJobItemView {
  return {
    id: item.id,
    targetKey: item.targetKey,
    status: item.status as CustomerBatchJobItemView['status'],
    ...(item.errorCode ? { errorCode: item.errorCode } : {}),
    ...(item.errorMessage ? { errorMessage: item.errorMessage } : {}),
    retryable: Boolean(item.retryable),
    attemptCount: Number(item.attemptCount || 0),
  };
}

function currentActor(actorId: string): AuthenticatedUser {
  return { id: actorId } as AuthenticatedUser;
}

export function createPrismaTokenStore(prisma: any): BatchPrecheckTokenStore<BatchTx> {
  return {
    transaction: (operation) => prisma.$transaction(
      (tx: BatchTx) => operation(tx),
      // Reads inside revalidation must see the current committed role/scope
      // state rather than a prior repeatable-read snapshot.
      { isolationLevel: 'ReadCommitted' },
    ),
    create: async (row) => {
      await prisma.customerBatchPrecheck.create({
        data: {
          id: row.id,
          actorId: row.actorId,
          handlerKey: row.handlerKey,
          operation: row.operation,
          status: row.status,
          tokenHash: row.tokenHash,
          selectionHash: row.selectionHash,
          inputHash: row.inputHash,
          guardManifest: asJson(row.guardManifest),
          customerVersionManifest: asJson(row.customerVersionManifest),
          selectedCustomerIds: asJson(row.selectedCustomerIds),
          filterSnapshot: row.filterSnapshot === null ? Prisma.JsonNull : asJson(row.filterSnapshot),
          expiresAt: row.expiresAt,
        },
      });
    },
    lockByToken: async (tx, tokenHash) => {
      const rows = await rawRows<any>(tx, Prisma.sql`
        SELECT id, actorId, handlerKey, operation, status, tokenHash, selectionHash, inputHash,
          guardManifest, customerVersionManifest, selectedCustomerIds, filterSnapshot, expiresAt,
          consumedAt, consumedResultType, consumedResultId, consumedIdempotencyKey
        FROM customer_batch_prechecks
        WHERE tokenHash = ${tokenHash}
        LIMIT 1
        FOR UPDATE
      `);
      return (rows[0] || null) as BatchPrecheckStoredRow | null;
    },
    update: async (tx, id, patch) => {
      const data: Record<string, unknown> = { ...patch };
      if (patch.guardManifest !== undefined) data.guardManifest = asJson(patch.guardManifest);
      if (patch.customerVersionManifest !== undefined) data.customerVersionManifest = asJson(patch.customerVersionManifest);
      if (patch.selectedCustomerIds !== undefined) data.selectedCustomerIds = asJson(patch.selectedCustomerIds);
      if (patch.filterSnapshot !== undefined) data.filterSnapshot = patch.filterSnapshot === null ? Prisma.JsonNull : asJson(patch.filterSnapshot);
      await tx.customerBatchPrecheck.update({ where: { id }, data });
    },
  };
}

export function createPrismaJobStore(prisma: any, createId: (prefix: string) => string, now: () => Date): CustomerBatchJobStore<BatchTx> {
  const load = async (tx: BatchTx, id: string) => {
    const job = await tx.customerBatchJob.findUnique({ where: { id } });
    return job
      ? { type: 'customer_batch_job' as const, id: job.id, idempotencyFingerprint: job.idempotencyFingerprint, value: job as StoredBatchJob }
      : null;
  };
  return {
    findExisting: async (tx, input) => {
      // A duplicate-key retry must read the winner in its fresh transaction,
      // under a row lock, rather than adopting a stale snapshot.
      const rows = await rawRows<any>(tx, Prisma.sql`
        SELECT *
        FROM customer_batch_jobs
        WHERE actorId = ${input.actorId}
          AND handlerKey = ${input.handlerKey}
          AND operation = ${input.operation}
          AND idempotencyKey = ${input.idempotencyKey}
        LIMIT 1
        FOR UPDATE
      `);
      return (rows[0] || null) as StoredBatchJob | null;
    },
    create: async (tx, input) => {
      const createdAt = now();
      const job = await tx.customerBatchJob.create({
        data: {
          id: input.id,
          handlerKey: input.handlerKey,
          operation: input.operation,
          status: 'queued',
          selectionMode: input.selectionMode,
          selectedCustomerIds: asJson(input.customerIds),
          filterSnapshot: input.filterSnapshot === null ? Prisma.JsonNull : asJson(input.filterSnapshot),
          input: asJson(input.input),
          inputHash: input.inputHash,
          idempotencyFingerprint: input.idempotencyFingerprint,
          reason: input.reason,
          idempotencyKey: input.idempotencyKey,
          actorId: input.actorId,
          actorName: input.actorName,
          actorDepartmentId: null,
          frozenCustomerCount: input.customerIds.length,
          totalCount: input.customerIds.length,
          createdAt,
        },
      });
      const rows = input.customerIds.map((customerId) => ({
        id: createId('batch-item'),
        jobId: job.id,
        targetKey: `customer:${customerId}`,
        status: 'queued',
        expectedUpdatedAt: new Date(input.versionManifest[customerId]),
        idempotencyKey: `${job.id}:customer:${customerId}`,
      }));
      for (let index = 0; index < rows.length; index += 500) {
        await tx.customerBatchJobItem.createMany({ data: rows.slice(index, index + 500) });
      }
      return {
        type: 'customer_batch_job' as const,
        id: job.id,
        idempotencyFingerprint: job.idempotencyFingerprint,
        value: job as StoredBatchJob,
      };
    },
    load,
    get: async (client, id) => (await client.customerBatchJob.findUnique({ where: { id } })) as StoredBatchJob | null,
    lock: async (tx, id) => {
      const rows = await rawRows<any>(tx, Prisma.sql`
        SELECT *
        FROM customer_batch_jobs
        WHERE id = ${id}
        LIMIT 1
        FOR UPDATE
      `);
      return (rows[0] || null) as StoredBatchJob | null;
    },
    list: async (client, actorId) => (
      await client.customerBatchJob.findMany({
        ...(actorId ? { where: { actorId } } : {}),
        orderBy: { createdAt: 'desc' },
        take: 100,
      }) as StoredBatchJob[]
    ),
    listItems: async (client, jobId) => (
      await client.customerBatchJobItem.findMany({ where: { jobId }, orderBy: { targetKey: 'asc' }, take: 10_000 }) as StoredBatchJobItem[]
    ),
    requestCancellation: async (tx, job) => {
      if (job.status === 'queued') {
        const timestamp = now();
        const cancelledItems = await tx.customerBatchJobItem.updateMany({
          where: { jobId: job.id, status: { in: ['queued', 'running'] } },
          data: {
            status: 'cancelled',
            retryable: false,
            errorCode: null,
            errorMessage: null,
            finishedAt: timestamp,
          },
        });
        const updated = await tx.customerBatchJob.updateMany({
          where: { id: job.id, status: 'queued' },
          data: {
            status: 'cancelled',
            cancelRequestedAt: timestamp,
            cancelledAt: timestamp,
            finishedAt: timestamp,
            cancelledCount: cancelledItems.count,
            leaseOwner: null,
            leaseExpiresAt: null,
          },
        });
        if (updated.count !== 1) return null;
        return await tx.customerBatchJob.findUnique({ where: { id: job.id } }) as StoredBatchJob | null;
      }
      if (job.status === 'running') {
        const updated = await tx.customerBatchJob.updateMany({
          where: { id: job.id, status: 'running' },
          data: { status: 'cancel_requested', cancelRequestedAt: now() },
        });
        if (updated.count !== 1) return null;
        return await tx.customerBatchJob.findUnique({ where: { id: job.id } }) as StoredBatchJob | null;
      }
      return job as StoredBatchJob;
    },
  };
}

export async function lockServerCustomerDirectory(tx: BatchTx, actorId: string) {
  // Deliberately lock the directory in one fixed order. The transaction uses
  // READ COMMITTED as a second safeguard against RR snapshot stale reads.
  const userRows = await rawRows<any>(tx, Prisma.sql`SELECT * FROM users ORDER BY id ASC FOR UPDATE`);
  const roleRows = await rawRows<any>(tx, Prisma.sql`SELECT * FROM roles WHERE isActive = true ORDER BY id ASC FOR UPDATE`);
  const departmentRows = await rawRows<any>(tx, Prisma.sql`SELECT * FROM departments ORDER BY id ASC FOR UPDATE`);
  const users = userRows.map(mapPrismaUser);
  const roles = roleRows.map((row) => mapPrismaRole({
      ...row,
      permissions: decodeJson(row.permissions),
      dataScopes: decodeJson(row.dataScopes),
    }));
  const departments = departmentRows.map(mapPrismaDepartment);
  const actor = users.find((user) => (
    user.id === actorId
    && user.isActive
    && (user.employmentStatus || 'active') === 'active'
  ));
  if (!actor) throw new BatchPrecheckAuthorizationError('当前用户不存在或已离职');
  return {
    actor: { id: actor.id, name: actor.name },
    user: toAuthenticatedUser(actor, roles.map(mergeRoleWithDefaultAccess)),
    roles,
    access: buildCustomerAccessContextFromDirectory(
      currentActor(actorId),
      users,
      roles,
      departments,
    ),
  };
}

export async function lockServerAccessContext(tx: BatchTx, actorId: string): Promise<CustomerAccessContext> {
  return (await lockServerCustomerDirectory(tx, actorId)).access;
}

function objectData(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/** A small catalog projection; do not scan customer usage counts in a precheck. */
function tagCatalogFromGuardRows(rows: Array<{ domain: string; recordId: string; data: unknown }>): CustomerTagCatalog {
  const groups = rows
    .filter((row) => row.domain === STORAGE_KEYS.TAG_GROUPS)
    .map((row) => {
      const data = objectData(row.data);
      return {
        id: cleanText(data.id) || row.recordId,
        name: cleanText(data.name),
        color: cleanText(data.color) || '#1677ff',
        selectionMode: data.selectionMode === 'single' ? 'single' as const : 'multiple' as const,
        scope: (data.scope === 'lead' || data.scope === 'both' ? data.scope : 'customer') as CustomerTagCatalog['groups'][number]['scope'],
        isActive: data.isActive !== false,
        sortOrder: Number.isFinite(Number(data.sortOrder)) ? Number(data.sortOrder) : 0,
        createdAt: cleanText(data.createdAt),
        updatedAt: cleanText(data.updatedAt),
      };
    })
    .filter((group) => Boolean(group.id))
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));
  const knownGroupIds = new Set(groups.map((group) => group.id));
  const tags = rows
    .filter((row) => row.domain === STORAGE_KEYS.TAGS)
    .map((row) => {
      const data = objectData(row.data);
      return {
        id: cleanText(data.id) || row.recordId,
        groupId: cleanText(data.groupId),
        name: cleanText(data.name),
        ...(cleanText(data.color) ? { color: cleanText(data.color) } : {}),
        isActive: data.isActive !== false,
        sortOrder: Number.isFinite(Number(data.sortOrder)) ? Number(data.sortOrder) : 0,
        usageCount: 0,
        createdAt: cleanText(data.createdAt),
        updatedAt: cleanText(data.updatedAt),
      };
    })
    .filter((tag) => Boolean(tag.id) && knownGroupIds.has(tag.groupId))
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));
  return { groups, tags };
}

function guardRevisionsFromRows(
  lifecycleValue: unknown,
  tagRows: Array<{ domain: string; recordId: string; data: unknown; updatedAt: Date | string }>,
): GuardRevisions {
  const lifecycleConfig = normalizeCustomerLifecycleConfig(decodeJson(lifecycleValue) ?? DEFAULT_LIFECYCLE_STATUS_CONFIGS);
  const catalogRows = tagRows
    .filter((row) => row.domain === STORAGE_KEYS.TAG_GROUPS || row.domain === STORAGE_KEYS.TAGS)
    .map((row) => ({ ...row, data: decodeJson(row.data) }));
  return {
    lifecycleConfigRevision: sha256Json(lifecycleConfig),
    tagCatalogRevision: sha256Json(catalogRows.map((row) => ({
      domain: row.domain,
      recordId: row.recordId,
      data: row.data,
      updatedAt: toIso(row.updatedAt),
    }))),
    lifecycleConfig,
    tagCatalog: tagCatalogFromGuardRows(catalogRows),
  };
}

async function readGuardRevisions(client: BatchTx): Promise<GuardRevisions> {
  const [lifecycle, tagRows] = await Promise.all([
    client.appStorage.findUnique({ where: { key: STORAGE_KEYS.LIFECYCLE_STATUS_CONFIGS } }),
    client.businessRecord.findMany({
      where: { domain: { in: [STORAGE_KEYS.TAG_GROUPS, STORAGE_KEYS.TAGS] } },
      select: { domain: true, recordId: true, data: true, updatedAt: true },
      orderBy: [{ domain: 'asc' }, { recordId: 'asc' }],
    }),
  ]);
  return guardRevisionsFromRows(lifecycle?.value, tagRows as any[]);
}

async function lockGuardRevisions(tx: BatchTx): Promise<GuardRevisions> {
  await tx.appStorage.upsert({
    where: { key: STORAGE_KEYS.LIFECYCLE_STATUS_CONFIGS },
    update: {},
    create: { key: STORAGE_KEYS.LIFECYCLE_STATUS_CONFIGS, value: asJson(DEFAULT_LIFECYCLE_STATUS_CONFIGS) },
  });
  const lifecycleRows = await rawRows<any>(tx, Prisma.sql`
    SELECT \`key\`, value, updatedAt
    FROM app_storage
    WHERE \`key\` = ${STORAGE_KEYS.LIFECYCLE_STATUS_CONFIGS}
    FOR UPDATE
  `);
  try {
    await tx.businessRecord.upsert({
      where: { domain_recordId: { domain: TAG_CATALOG_LOCK_DOMAIN, recordId: TAG_CATALOG_LOCK_RECORD_ID } },
      create: {
        id: `${TAG_CATALOG_LOCK_DOMAIN}:${TAG_CATALOG_LOCK_RECORD_ID}`,
        domain: TAG_CATALOG_LOCK_DOMAIN,
        recordId: TAG_CATALOG_LOCK_RECORD_ID,
        title: '客户标签目录批量守卫锁',
        data: asJson({ internal: true }),
      },
      update: {},
    });
  } catch (error) {
    if ((error as { code?: string })?.code !== 'P2002') throw error;
  }
  const tagRows = await rawRows<any>(tx, Prisma.sql`
    SELECT domain, recordId, data, updatedAt
    FROM business_records
    WHERE domain IN (${TAG_CATALOG_LOCK_DOMAIN}, ${STORAGE_KEYS.TAG_GROUPS}, ${STORAGE_KEYS.TAGS})
    ORDER BY domain ASC, recordId ASC
    FOR UPDATE
  `);
  return guardRevisionsFromRows(lifecycleRows[0]?.value, tagRows as any[]);
}

async function lockCustomerRecords(tx: BatchTx, customerIds: string[]): Promise<LockedBatchCustomer[]> {
  const rows: LockedBatchCustomer[] = [];
  const sortedCustomerIds = Array.from(new Set(customerIds.map(cleanText).filter(Boolean))).sort();
  for (let index = 0; index < sortedCustomerIds.length; index += 500) {
    const chunk = sortedCustomerIds.slice(index, index + 500);
    const locked = await rawRows<CustomerBusinessRecordRow>(tx, Prisma.sql`
      SELECT id, domain, recordId, data, updatedAt
      FROM business_records
      WHERE domain = ${STORAGE_KEYS.CUSTOMERS}
        AND recordId IN (${Prisma.join(chunk)})
      ORDER BY recordId ASC
      FOR UPDATE
    `);
    for (const row of locked) {
      const snapshot = mapCustomerBusinessRecord(row);
      rows.push({ customer: snapshot.customer, businessRecordUpdatedAt: snapshot.businessRecordUpdatedAt });
    }
  }
  return rows;
}

async function readJobCustomers(client: BatchTx, customerIds: string[]): Promise<Array<{ customer: any }>> {
  if (!customerIds.length) return [];
  const rows = await client.businessRecord.findMany({
    where: { domain: STORAGE_KEYS.CUSTOMERS, recordId: { in: customerIds } },
    select: { id: true, domain: true, recordId: true, data: true, updatedAt: true },
  });
  return (rows as any[]).map(mapCustomerBusinessRecord).map((snapshot) => ({ customer: snapshot.customer }));
}

function manifestFromFrozen(
  operation: CustomerBatchOperation,
  frozen: FrozenCustomerSelection,
  revisions: GuardRevisions,
  input: CustomerBatchOperationInput,
  reason: string,
  selectionMode: CustomerBatchSelection['mode'],
): BatchPrecheckGuardManifest {
  return {
    version: 1,
    requiredPermissionKeys: getCustomerBatchActionPermissions(operation).sort(),
    customerGuards: frozen.customerGuards.map((guard) => ({ ...guard })).sort((left, right) => left.customerId.localeCompare(right.customerId)),
    lifecycleConfigRevision: revisions.lifecycleConfigRevision,
    tagCatalogRevision: revisions.tagCatalogRevision,
    command: { selectionMode, input, reason },
  };
}

function assertRevalidatedGuard(
  precheck: BatchPrecheckStoredRow,
  manifest: BatchPrecheckGuardManifest,
  records: LockedBatchCustomer[],
  access: CustomerAccessContext,
  revisions: GuardRevisions,
): void {
  const operation = precheck.operation as CustomerBatchOperation;
  const required = getCustomerBatchActionPermissions(operation).sort();
  if (
    sha256Json(manifest.requiredPermissionKeys) !== sha256Json(required)
  ) {
    throw new BatchPrecheckConflictError('预检权限清单已变化，请重新预检');
  }
  if (required.some((key) => !access.grantedPermissions.has(key))) {
    throw new BatchPrecheckAuthorizationError('无权执行批量操作');
  }
  if (
    manifest.lifecycleConfigRevision !== revisions.lifecycleConfigRevision
    || manifest.tagCatalogRevision !== revisions.tagCatalogRevision
  ) {
    throw new BatchPrecheckConflictError('客户配置已变化，请重新预检');
  }
  const expectedVersions = readVersionManifest(precheck.customerVersionManifest);
  const expectedGuards = new Map(manifest.customerGuards.map((guard) => [guard.customerId, guard]));
  const selectedIds = readSelectedIds(precheck.selectedCustomerIds);
  const recordsByCustomerId = new Map(records.map((record) => [cleanText(record.customer.id), record]));
  if (records.length !== selectedIds.length || expectedGuards.size !== selectedIds.length) {
    throw new BatchPrecheckConflictError('客户范围已变化，请重新预检');
  }
  for (const customerId of selectedIds) {
    const record = recordsByCustomerId.get(customerId);
    const guard = expectedGuards.get(customerId);
    const version = record ? toIso(record.businessRecordUpdatedAt) : undefined;
    if (
      !record || !guard || guard.scopeEligible !== true || !canManageCustomer(access, record.customer)
      || cleanText(record.customer.ownerId) !== cleanText(guard.ownerId)
      || version !== expectedVersions[customerId]
      || version !== guard.businessRecordUpdatedAt
    ) {
      if (record && version !== expectedVersions[customerId]) {
        throw new BatchPrecheckConflictError('客户记录已变化，请重新预检');
      }
      throw new BatchPrecheckConflictError('客户范围已变化，请重新预检');
    }
  }
}

async function assertCurrentOperationGuard(
  tx: BatchTx,
  operation: CustomerBatchOperation,
  input: CustomerBatchOperationInput,
  access: CustomerAccessContext,
  records: LockedBatchCustomer[],
  revisions: GuardRevisions,
): Promise<void> {
  if (operation === 'transfer') {
    const targetOwnerId = cleanText((input as { targetOwnerId?: unknown }).targetOwnerId);
    if (!targetOwnerId || !access.manageableOwnerIds.has(targetOwnerId)) {
      throw new BatchPrecheckConflictError('目标负责人不在当前可管理范围内');
    }
    // The access context lock has already serialized the directory. Lock the
    // target row too so a concurrent departure/role change cannot slip between
    // precheck confirmation and job creation.
    const targetRows = await rawRows<any>(tx, Prisma.sql`SELECT * FROM users WHERE id = ${targetOwnerId} LIMIT 1 FOR UPDATE`);
    const target = targetRows[0] ? mapPrismaUser(targetRows[0]) : null;
    if (!target || !target.isActive || (target.employmentStatus || 'active') !== 'active') {
      throw new BatchPrecheckConflictError('目标负责人已离职或停用');
    }
    if (records.length > 0 && records.every((record) => cleanText(record.customer.ownerId) === targetOwnerId)) {
      throw new BatchPrecheckConflictError('所选客户当前均由目标负责人跟进，无需转让');
    }
    return;
  }

  if (operation === 'set_progress') {
    const lifecycleConfig = revisions.lifecycleConfig;
    const targetStatus = normalizeCustomerLifecycleValue((input as { lifecycleStatusCode?: unknown }).lifecycleStatusCode);
    if (!lifecycleConfig || !targetStatus) throw new BatchPrecheckConflictError('客户进展配置已变化，请重新预检');
    for (const record of records) {
      const from = normalizeCustomerLifecycleValue(record.customer.lifecycleStatusCode)
        || LIFECYCLE_STATUS_CODES.PENDING_FOLLOWUP;
      try {
        assertLifecycleTransition({ from, to: targetStatus, config: lifecycleConfig });
      } catch (error) {
        throw new BatchPrecheckConflictError(error instanceof Error ? error.message : '客户进展不允许变更');
      }
    }
    return;
  }

  if (operation === 'update_tags') {
    const tagCatalog = revisions.tagCatalog;
    const tagInput = input as { mode?: unknown; tagIds?: unknown };
    const mode = tagInput.mode === 'add' || tagInput.mode === 'remove' ? tagInput.mode : null;
    const requestedTagIds = Array.isArray(tagInput.tagIds) ? tagInput.tagIds.map(cleanText).filter(Boolean) : [];
    if (!tagCatalog || !mode || !requestedTagIds.length) {
      throw new BatchPrecheckConflictError('客户标签配置已变化，请重新预检');
    }
    for (const record of records) {
      const previous: string[] = Array.isArray(record.customer.manualTagIds)
        ? record.customer.manualTagIds.map(cleanText).filter(Boolean)
        : [];
      const next = mode === 'add'
        ? Array.from(new Set([...previous, ...requestedTagIds]))
        : previous.filter((tagId) => !requestedTagIds.includes(tagId));
      const validation = validateManualTagUpdateSelection(tagCatalog, 'customer', next, previous);
      if (!validation.ok) throw new BatchPrecheckConflictError(validation.message);
    }
  }
}

function requiresAuditRead(context: CustomerAccessContext): boolean {
  return context.grantedPermissions.has(PERMISSION_KEYS.CUSTOMER_BATCH_AUDIT_READ);
}

function assertCanReadJob(
  job: StoredBatchJob,
  context: CustomerAccessContext,
  customerRows: Array<{ customer: any }>,
): void {
  const customerIds = jobCustomerIds(job);
  const actorIsCreator = job.actorId === context.actorId;
  // Summaries deliberately contain no frozen IDs, command input, or guard
  // payload. A creator may always inspect their own summary; an audit reader
  // may inspect a mixed-scope summary when at least one target remains in their
  // current read scope. Item rows are filtered separately below.
  if (actorIsCreator) return;
  if (!requiresAuditRead(context) || !customerIds.length || !customerRows.some(({ customer }) => canReadCustomer(context, customer))) {
    throw new BatchPrecheckAuthorizationError('无权查看批量任务');
  }
}

function jobCustomerIds(job: StoredBatchJob): string[] {
  const raw = asArray(job.selectedCustomerIds);
  return raw
    ? Array.from(new Set(raw.map(cleanText).filter(Boolean))).sort()
    : [];
}

function assertCanCancelOtherUsersJob(
  job: StoredBatchJob,
  context: CustomerAccessContext,
  records: LockedBatchCustomer[],
): void {
  if (job.actorId === context.actorId) return;
  if (!context.grantedPermissions.has(PERMISSION_KEYS.CUSTOMER_BATCH_CANCEL)) {
    throw new BatchPrecheckAuthorizationError('无权取消其他人的批量任务');
  }
  const customerIds = jobCustomerIds(job);
  if (
    !customerIds.length
    || records.length !== customerIds.length
    || records.some((record) => !canManageCustomer(context, record.customer))
  ) {
    throw new BatchPrecheckAuthorizationError('当前无权管理该批量任务中的全部客户');
  }
}

export function createCustomerBatchService(
  prisma: PrismaClient | any,
  options: CustomerBatchServiceOptions = {},
) {
  const now = () => options.now?.() || new Date();
  const createId = (prefix: string) => options.createId?.(prefix) || `${prefix}-${randomUUID()}`;
  const selectionService = options.selectionService || createCustomerBatchSelectionService(prisma);
  const tokenStore = options.tokenStore || createPrismaTokenStore(prisma);
  const jobStore = options.jobStore || createPrismaJobStore(prisma, createId, now);
  const loadAccess = options.loadCurrentAccess || ((client: BatchTx, actorId: string) => loadCustomerAccessContext(client, currentActor(actorId)));
  const lockAccess = options.lockCurrentAccess || lockServerAccessContext;
  const lockRecords = options.lockCustomerRecords || lockCustomerRecords;
  const currentRevisions = options.readGuardRevisions || readGuardRevisions;
  const lockedRevisions = options.lockGuardRevisions || lockGuardRevisions;
  const lockDeleteScope = options.lockSoftDeleteScope || ((tx: BatchTx, customerIds: string[]) => lockCustomerAssociationScope(tx, customerIds));
  const jobCustomers = options.readJobCustomers || readJobCustomers;
  const validateOperationGuard = options.validateOperationGuard || assertCurrentOperationGuard;

  const assertVisible = async (client: BatchTx, job: StoredBatchJob, context: CustomerAccessContext) => {
    const customerIds = jobCustomerIds(job);
    const rows = await jobCustomers(client, customerIds);
    assertCanReadJob(job, context, rows);
  };

  const visibleItems = async (
    client: BatchTx,
    job: StoredBatchJob,
    context: CustomerAccessContext,
  ): Promise<CustomerBatchJobItemView[]> => {
    const actorIsCreator = job.actorId === context.actorId;
    if (!actorIsCreator && !requiresAuditRead(context)) {
      throw new BatchPrecheckAuthorizationError('无权查看批量任务');
    }
    if (actorIsCreator && job.handlerKey === 'customer_import') {
      return (await jobStore.listItems(client, job.id)).map(normalizeJobItem);
    }
    const readableIds = new Set(
      (await jobCustomers(client, jobCustomerIds(job)))
        .filter(({ customer }) => canReadCustomer(context, customer))
        .map(({ customer }) => cleanText(customer.id)),
    );
    if (!actorIsCreator && !readableIds.size) {
      throw new BatchPrecheckAuthorizationError('无权查看批量任务');
    }
    return (await jobStore.listItems(client, job.id))
      .filter((item) => {
        const match = /^customer:(.+)$/.exec(item.targetKey);
        return Boolean(match && readableIds.has(match[1]));
      })
      .map(normalizeJobItem);
  };

  return {
    async precheckCustomerBatch(input: CustomerBatchPrecheckRequest, context: CustomerAccessContext): Promise<CustomerBatchPrecheckResult> {
      const request = normalizeCustomerBatchPrecheckRequest(input);
      if (request.handlerKey !== CUSTOMER_BATCH_HANDLER_KEY) throw new BatchPrecheckConflictError('不支持的批量处理器');
      assertBatchOperationPermissions(context, request.operation);
      const frozen = await selectionService.freeze(request.selection, context);
      if (!frozen.customerIds.length) {
        throw new BatchPrecheckValidationError('没有可执行的客户，请调整选择范围后重试');
      }
      const revisions = await currentRevisions(prisma);
      const guardManifest = manifestFromFrozen(
        request.operation,
        frozen,
        revisions,
        request.input,
        request.reason,
        request.selection.mode,
      );
      const inputHash = sha256Json({ input: request.input, reason: request.reason });
      const issued = await issueBatchPrecheckToken({
        store: tokenStore,
        actorId: context.actorId,
        handlerKey: request.handlerKey,
        operation: request.operation,
        selectionHash: frozen.selectionHash,
        inputHash,
        selectedCustomerIds: frozen.customerIds,
        customerVersionManifest: frozen.versionManifest,
        guardManifest,
        canonicalInput: { input: request.input, reason: request.reason },
        filterSnapshot: request.selection.mode === 'filter_snapshot' ? request.selection.filters : null,
        now,
        createId: () => createId('batch-precheck'),
        createToken: options.createToken,
      });
      return {
        confirmationToken: issued.confirmationToken,
        expiresAt: issued.expiresAt,
        totalCount: frozen.customerIds.length,
        executionMode: 'background',
        selectionHash: frozen.selectionHash,
        inputHash,
        itemResults: frozen.itemResults,
      };
    },

    async createCustomerBatchJob(input: CreateCustomerBatchJobRequest, context: CustomerAccessContext): Promise<CustomerBatchJobSummary> {
      const request = requireObject(input, '批量任务创建请求无效');
      assertOnlyKeys(request, ['precheckToken', 'idempotencyKey'], '批量任务创建请求包含不允许的字段');
      const precheckToken = cleanText(request.precheckToken);
      const idempotencyKey = cleanText(request.idempotencyKey);
      if (
        !precheckToken
        || !idempotencyKey
        || idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH
        || !SAFE_IDEMPOTENCY_KEY.test(idempotencyKey)
      ) {
        throw new BatchPrecheckValidationError('批量任务确认参数无效');
      }
      let revalidatedAccess: CustomerAccessContext | null = null;
      let revalidatedCommand: {
        selectionMode: CustomerBatchSelection['mode'];
        input: CustomerBatchOperationInput;
        reason: string;
      } | null = null;
      return consumeBatchPrecheckToken({
        store: tokenStore,
        token: precheckToken,
        actorId: context.actorId,
        handlerKey: CUSTOMER_BATCH_HANDLER_KEY,
        idempotencyKey,
        now,
      }, {
        resultType: 'customer_batch_job' as const,
        loadResult: async (tx, resultId) => {
          const current = await lockAccess(tx, context.actorId);
          const envelope = await jobStore.load(tx, resultId);
          if (!envelope) return null;
          assertCurrentJobReplayAuthorization(envelope.value, current);
          await assertVisible(tx, envelope.value, current);
          return envelope;
        },
        findExistingResult: async (tx, requestInput) => {
          const job = await jobStore.findExisting(tx, requestInput);
          if (!job) return null;
          // Avoid taking directory locks on the normal no-existing-job path:
          // a soft delete must first take its association scope in
          // lockAndRevalidate. Existing-result adoption has no customer write.
          const current = await lockAccess(tx, requestInput.actorId);
          assertCurrentJobReplayAuthorization(job, current);
          await assertVisible(tx, job, current);
          return {
            type: 'customer_batch_job' as const,
            id: job.id,
            idempotencyFingerprint: job.idempotencyFingerprint,
            value: job,
          };
        },
        lockAndRevalidate: async (tx, precheck) => {
          const manifest = readManifest(precheck.guardManifest);
          const selectedIds = readSelectedIds(precheck.selectedCustomerIds);
          const operation = precheck.operation as CustomerBatchOperation;
          // Direct delete takes the association scope before its customer row;
          // preserve that order for a future soft-delete batch job as well.
          if (operation === 'soft_delete') await lockDeleteScope(tx, selectedIds);
          const current = await lockAccess(tx, precheck.actorId);
          const records = await lockRecords(tx, selectedIds);
          const revisions = await lockedRevisions(tx);
          assertRevalidatedGuard(precheck, manifest, records, current, revisions);
          // The persisted normalized command is the authority. Revalidate its
          // shape here so malformed storage cannot create a task.
          const normalizedInput = normalizeCustomerBatchOperationInput(operation, manifest.command.input);
          const normalizedReason = normalizeReason(manifest.command.reason);
          await validateOperationGuard(tx, operation, normalizedInput, current, records, revisions);
          revalidatedAccess = current;
          revalidatedCommand = {
            selectionMode: manifest.command.selectionMode,
            input: normalizedInput,
            reason: normalizedReason,
          };
        },
        createResult: async (tx, precheck, createInput) => {
          const manifest = readManifest(precheck.guardManifest);
          const customerIds = readSelectedIds(precheck.selectedCustomerIds);
          const versionManifest = readVersionManifest(precheck.customerVersionManifest);
          if (!revalidatedAccess || !revalidatedCommand) throw new BatchPrecheckConflictError('预检确认未完成重验');
          const envelope = await jobStore.create(tx, {
            id: createId('batch-job'),
            actorId: precheck.actorId,
            actorName: revalidatedAccess.actorName,
            handlerKey: precheck.handlerKey,
            operation: precheck.operation as CustomerBatchOperation,
            selectionMode: revalidatedCommand.selectionMode,
            customerIds,
            filterSnapshot: precheck.filterSnapshot === null ? null : decodeJson(precheck.filterSnapshot),
            input: revalidatedCommand.input,
            inputHash: precheck.inputHash,
            reason: revalidatedCommand.reason,
            idempotencyKey: createInput.idempotencyKey,
            idempotencyFingerprint: createInput.idempotencyFingerprint,
            versionManifest,
          });
          return envelope;
        },
      }).then(normalizeJobSummary);
    },

    async getCustomerBatchJob(id: string, context: CustomerAccessContext): Promise<CustomerBatchJobSummary | null> {
      const job = await jobStore.get(prisma, cleanText(id));
      if (!job) return null;
      const current = await loadAccess(prisma, context.actorId);
      await assertVisible(prisma, job, current);
      return normalizeJobSummary(job);
    },

    async listCustomerBatchJobs(context: CustomerAccessContext): Promise<CustomerBatchJobSummary[]> {
      const current = await loadAccess(prisma, context.actorId);
      const own = await jobStore.list(prisma, requiresAuditRead(current) ? undefined : context.actorId);
      const visible: StoredBatchJob[] = [];
      for (const job of own) {
        try {
          await assertVisible(prisma, job, current);
          visible.push(job);
        } catch {
          // Batch list is intentionally silent for currently-out-of-scope jobs.
        }
      }
      return visible.map(normalizeJobSummary);
    },

    async listCustomerBatchJobItems(id: string, context: CustomerAccessContext): Promise<CustomerBatchJobItemView[]> {
      const job = await jobStore.get(prisma, cleanText(id));
      if (!job) throw new BatchPrecheckConflictError('批量任务不存在');
      const current = await loadAccess(prisma, context.actorId);
      return visibleItems(prisma, job, current);
    },

    async getCustomerBatchJobResult(id: string, context: CustomerAccessContext): Promise<CustomerBatchJobResultView | null> {
      const job = await jobStore.get(prisma, cleanText(id));
      if (!job) return null;
      const current = await loadAccess(prisma, context.actorId);
      await assertVisible(prisma, job, current);
      return {
        job: normalizeJobSummary(job),
        items: await visibleItems(prisma, job, current),
      };
    },

    async requestCustomerBatchCancellation(id: string, context: CustomerAccessContext): Promise<CustomerBatchJobSummary> {
      const jobId = cleanText(id);
      if (!jobId) throw new BatchPrecheckValidationError('批量任务 ID 无效');
      return tokenStore.transaction(async (tx) => {
        const job = await jobStore.lock(tx, jobId);
        if (!job) throw new BatchPrecheckConflictError('批量任务不存在');
        // The worker also locks job → directory → customer. Keep cancellation
        // in the same global order so a live item commit and a cancel request
        // cannot deadlock each other by taking the first two locks backwards.
        const current = await lockAccess(tx, context.actorId);
        const records = job.actorId === current.actorId
          ? []
          : await lockRecords(tx, jobCustomerIds(job));
        assertCanCancelOtherUsersJob(job, current, records);
        const updated = await jobStore.requestCancellation(tx, job);
        if (!updated) throw new BatchPrecheckConflictError('批量任务不存在');
        return normalizeJobSummary(updated);
      });
    },
  };
}

export { CUSTOMER_BATCH_HANDLER_KEY };
