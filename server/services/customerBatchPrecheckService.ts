import { createHash, randomBytes, randomUUID } from 'node:crypto';

type CanonicalJsonValue = null | boolean | number | string | CanonicalJsonValue[] | { [key: string]: CanonicalJsonValue };

function canonicalizeJson(value: unknown, stack = new Set<object>()): CanonicalJsonValue | undefined {
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') throw new Error('sha256Json 不支持 bigint');
  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') return undefined;
  if (value instanceof Date) return value.toJSON();
  if (Array.isArray(value)) {
    if (stack.has(value)) throw new Error('sha256Json 不支持循环引用');
    stack.add(value);
    const result = value.map((item) => canonicalizeJson(item, stack) ?? null);
    stack.delete(value);
    return result;
  }
  if (typeof value === 'object') {
    if (stack.has(value)) throw new Error('sha256Json 不支持循环引用');
    const toJson = (value as { toJSON?: () => unknown }).toJSON;
    if (typeof toJson === 'function') return canonicalizeJson(toJson.call(value), stack);
    stack.add(value);
    const result: Record<string, CanonicalJsonValue> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const normalized = canonicalizeJson((value as Record<string, unknown>)[key], stack);
      if (normalized !== undefined) result[key] = normalized;
    }
    stack.delete(value);
    return result;
  }
  return undefined;
}

/**
 * Stable SHA-256 over JSON semantics. Object keys are sorted recursively while
 * arrays retain their caller-provided order; callers must sort set-like arrays.
 */
export function sha256Json(value: unknown): string {
  const canonical = canonicalizeJson(value);
  const serialized = JSON.stringify(canonical === undefined ? null : canonical);
  return createHash('sha256').update(serialized, 'utf8').digest('hex');
}

export const CUSTOMER_BATCH_PRECHECK_TOKEN_TTL_MS = 10 * 60 * 1_000;
const SAFE_IDEMPOTENCY_KEY = /^[a-z0-9][a-z0-9._:-]{0,127}$/;

export type BatchPrecheckStoredRow = {
  id: string;
  actorId: string;
  handlerKey: string;
  operation: string;
  status: string;
  tokenHash: string;
  selectionHash: string;
  inputHash: string;
  guardManifest: unknown;
  customerVersionManifest: unknown;
  selectedCustomerIds: unknown;
  filterSnapshot: unknown | null;
  expiresAt: Date | string;
  consumedAt: Date | string | null;
  consumedResultType: string | null;
  consumedResultId: string | null;
  consumedIdempotencyKey: string | null;
};

export interface BatchPrecheckTokenStore<Tx = unknown> {
  transaction<T>(operation: (tx: Tx) => Promise<T>): Promise<T>;
  create(row: BatchPrecheckStoredRow): Promise<void>;
  /** Must perform a row lock (SELECT ... FOR UPDATE) in the supplied transaction. */
  lockByToken(tx: Tx, tokenHash: string): Promise<BatchPrecheckStoredRow | null>;
  update(tx: Tx, id: string, patch: Partial<BatchPrecheckStoredRow>): Promise<void>;
}

export type IssueBatchPrecheckTokenInput<Tx = unknown> = {
  store: BatchPrecheckTokenStore<Tx>;
  actorId: string;
  handlerKey: string;
  operation: string;
  selectionHash: string;
  inputHash: string;
  selectedCustomerIds: string[];
  customerVersionManifest: unknown;
  guardManifest: unknown;
  /** Immutable server-side command payload bound to inputHash. */
  canonicalInput: unknown;
  filterSnapshot?: unknown | null;
  now?: () => Date;
  createId?: () => string;
  createToken?: () => string;
};

export type IssuedBatchPrecheck = {
  id: string;
  confirmationToken: string;
  expiresAt: string;
};

export type BatchPrecheckResultEnvelope<TType extends string, TValue> = {
  type: TType;
  id: string;
  idempotencyFingerprint: string;
  value: TValue;
};

export interface BatchPrecheckResultConsumer<TTx, TType extends string, TValue> {
  readonly resultType: TType;
  /** Must re-authorize current visibility before exposing a persisted result. */
  loadResult(tx: TTx, resultId: string): Promise<BatchPrecheckResultEnvelope<TType, TValue> | null>;
  /** Must re-authorize current visibility before adopting an existing result. */
  findExistingResult(
    tx: TTx,
    input: {
      actorId: string;
      handlerKey: string;
      operation: string;
      idempotencyKey: string;
      idempotencyFingerprint: string;
    },
  ): Promise<BatchPrecheckResultEnvelope<TType, TValue> | null>;
  /** Locks and revalidates handler-specific scope, versions and guard manifest. */
  lockAndRevalidate(tx: TTx, precheck: BatchPrecheckStoredRow): Promise<void>;
  createResult(
    tx: TTx,
    precheck: BatchPrecheckStoredRow,
    input: { idempotencyKey: string; idempotencyFingerprint: string },
  ): Promise<BatchPrecheckResultEnvelope<TType, TValue>>;
}

export type ConsumeBatchPrecheckTokenInput<Tx = unknown> = {
  store: BatchPrecheckTokenStore<Tx>;
  token: string;
  actorId: string;
  handlerKey: string;
  /** Optional caller assertion; token-only HTTP confirmation omits this. */
  operation?: string;
  /** Optional caller assertion; token-only HTTP confirmation omits this. */
  selectionHash?: string;
  /** Optional caller assertion; token-only HTTP confirmation omits this. */
  inputHash?: string;
  idempotencyKey: string;
  now?: () => Date;
};

export class BatchPrecheckConflictError extends Error {
  readonly statusCode = 409;

  constructor(message: string) {
    super(message);
    this.name = 'BatchPrecheckConflictError';
  }
}

export class BatchPrecheckValidationError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = 'BatchPrecheckValidationError';
  }
}

/** Authorization is distinct from a stale/consumed precheck conflict. */
export class BatchPrecheckAuthorizationError extends Error {
  readonly statusCode = 403;

  constructor(message = '无权执行此操作') {
    super(message);
    this.name = 'BatchPrecheckAuthorizationError';
  }
}

class BatchPrecheckRetryableConflictError extends Error {
  constructor() {
    super('batch precheck idempotency winner pending');
    this.name = 'BatchPrecheckRetryableConflictError';
  }
}

function cleanText(value: unknown): string {
  return String(value || '').trim();
}

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function assertHash(value: string, label: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new BatchPrecheckValidationError(`${label}无效`);
}

function readExpiresAt(value: Date | string): Date {
  const expiresAt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(expiresAt.getTime())) throw new BatchPrecheckConflictError('预检确认已失效');
  return expiresAt;
}

function isUniqueConstraint(error: unknown): boolean {
  const candidate = error as { code?: unknown } | null;
  return candidate?.code === 'P2002' || /unique constraint|duplicate entry/i.test(String((error as Error)?.message || ''));
}

function isRetryableTransactionConflict(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === 'P2034') return true;
  return /deadlock|serialization failure|write conflict|1213|40001/i.test(String((error as Error)?.message || ''));
}

function assertEnvelope<TType extends string, TValue>(
  result: BatchPrecheckResultEnvelope<TType, TValue> | null,
  expectedType: TType,
  expectedFingerprint: string,
): asserts result is BatchPrecheckResultEnvelope<TType, TValue> {
  if (!result || result.type !== expectedType) throw new BatchPrecheckConflictError('预检结果类型不匹配');
  if (result.idempotencyFingerprint !== expectedFingerprint) {
    throw new BatchPrecheckConflictError('幂等键已用于不同请求');
  }
}

function assertTokenIdentityAndHashes(
  precheck: BatchPrecheckStoredRow,
  input: Pick<ConsumeBatchPrecheckTokenInput, 'actorId' | 'handlerKey' | 'operation' | 'selectionHash' | 'inputHash'>,
): void {
  if (
    precheck.actorId !== input.actorId
    || precheck.handlerKey !== input.handlerKey
    || (input.operation !== undefined && precheck.operation !== input.operation)
    || (input.selectionHash !== undefined && precheck.selectionHash !== input.selectionHash)
    || (input.inputHash !== undefined && precheck.inputHash !== input.inputHash)
  ) {
    throw new BatchPrecheckConflictError('预检确认与当前请求不匹配');
  }
}

function consumeFingerprint(input: { handlerKey: string; operation: string; selectionHash: string; inputHash: string }): string {
  return sha256Json({
    handlerKey: input.handlerKey,
    operation: input.operation,
    selectionHash: input.selectionHash,
    inputHash: input.inputHash,
  });
}

function decodedJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function record(value: unknown): Record<string, unknown> | null {
  const decoded = decodedJson(value);
  return decoded && typeof decoded === 'object' && !Array.isArray(decoded)
    ? decoded as Record<string, unknown>
    : null;
}

function array(value: unknown): unknown[] | null {
  const decoded = decodedJson(value);
  return Array.isArray(decoded) ? decoded : null;
}

function canonicalInputFromManifest(value: unknown): unknown {
  const manifest = record(value);
  const command = record(manifest?.command);
  if (!command || !Object.prototype.hasOwnProperty.call(command, 'input') || !Object.prototype.hasOwnProperty.call(command, 'reason')) {
    throw new BatchPrecheckConflictError('预检确认内容已损坏');
  }
  return { input: command.input, reason: command.reason };
}

function assertPersistedBinding(precheck: BatchPrecheckStoredRow): void {
  const selectedIds = array(precheck.selectedCustomerIds);
  const ids = selectedIds
    ? selectedIds.map(cleanText).filter(Boolean)
    : [];
  const sortedIds = Array.from(new Set(ids)).sort();
  if (ids.length !== sortedIds.length || sha256Json(sortedIds) !== precheck.selectionHash) {
    throw new BatchPrecheckConflictError('预检冻结选择已损坏');
  }
  if (sha256Json(canonicalInputFromManifest(precheck.guardManifest)) !== precheck.inputHash) {
    throw new BatchPrecheckConflictError('预检操作参数已损坏');
  }
}

/** Issues an opaque, database-backed token. Only its SHA-256 is persisted. */
export async function issueBatchPrecheckToken<Tx = unknown>(
  input: IssueBatchPrecheckTokenInput<Tx>,
): Promise<IssuedBatchPrecheck> {
  const actorId = cleanText(input.actorId);
  const handlerKey = cleanText(input.handlerKey);
  const operation = cleanText(input.operation);
  if (!actorId || !handlerKey || !operation) throw new BatchPrecheckValidationError('预检确认参数无效');
  assertHash(input.selectionHash, '冻结选择哈希');
  assertHash(input.inputHash, '操作参数哈希');
  if (sha256Json(input.canonicalInput) !== input.inputHash) {
    throw new BatchPrecheckValidationError('预检操作参数哈希不匹配');
  }
  if (sha256Json(canonicalInputFromManifest(input.guardManifest)) !== input.inputHash) {
    throw new BatchPrecheckValidationError('预检操作快照无效');
  }
  const now = input.now?.() || new Date();
  const token = cleanText(input.createToken?.() || randomBytes(32).toString('base64url'));
  if (!token) throw new BatchPrecheckValidationError('预检确认令牌无效');
  const selectedCustomerIds = [...new Set(input.selectedCustomerIds.map(cleanText).filter(Boolean))].sort();
  if (!selectedCustomerIds.length) {
    throw new BatchPrecheckValidationError('没有可执行的客户，无法创建批量预检确认');
  }
  const row: BatchPrecheckStoredRow = {
    id: cleanText(input.createId?.() || `precheck-${randomUUID()}`),
    actorId,
    handlerKey,
    operation,
    status: 'issued',
    tokenHash: hashToken(token),
    selectionHash: input.selectionHash,
    inputHash: input.inputHash,
    guardManifest: input.guardManifest,
    customerVersionManifest: input.customerVersionManifest,
    selectedCustomerIds,
    filterSnapshot: input.filterSnapshot ?? null,
    expiresAt: new Date(now.getTime() + CUSTOMER_BATCH_PRECHECK_TOKEN_TTL_MS),
    consumedAt: null,
    consumedResultType: null,
    consumedResultId: null,
    consumedIdempotencyKey: null,
  };
  if (!row.id) throw new BatchPrecheckValidationError('预检确认 ID 无效');
  await input.store.create(row);
  return { id: row.id, confirmationToken: token, expiresAt: readExpiresAt(row.expiresAt).toISOString() };
}

/**
 * The sole transaction owner for a typed precheck consumption. Consumers must
 * never wrap this call in another transaction or substitute a different tx.
 */
export async function consumeBatchPrecheckToken<Tx, TType extends string, TValue>(
  input: ConsumeBatchPrecheckTokenInput<Tx>,
  consumer: BatchPrecheckResultConsumer<Tx, TType, TValue>,
): Promise<TValue> {
  const token = cleanText(input.token);
  const actorId = cleanText(input.actorId);
  const handlerKey = cleanText(input.handlerKey);
  const operation = input.operation === undefined ? undefined : cleanText(input.operation);
  const idempotencyKey = cleanText(input.idempotencyKey);
  if (!token || !actorId || !handlerKey || (input.operation !== undefined && !operation) || !idempotencyKey) {
    throw new BatchPrecheckValidationError('预检确认参数无效');
  }
  if (!SAFE_IDEMPOTENCY_KEY.test(idempotencyKey)) {
    throw new BatchPrecheckValidationError('幂等键只能使用小写字母、数字、点、冒号、下划线或连字符，且不超过 128 个字符');
  }
  if (input.selectionHash !== undefined) assertHash(input.selectionHash, '冻结选择哈希');
  if (input.inputHash !== undefined) assertHash(input.inputHash, '操作参数哈希');

  const consumeOnce = () => input.store.transaction(async (tx) => {
    const precheck = await input.store.lockByToken(tx, hashToken(token));
    if (!precheck) throw new BatchPrecheckConflictError('预检确认不存在或已失效');
    assertPersistedBinding(precheck);
    assertTokenIdentityAndHashes(precheck, { actorId, handlerKey, operation, selectionHash: input.selectionHash, inputHash: input.inputHash });
    const fingerprint = consumeFingerprint({
      handlerKey,
      operation: precheck.operation,
      selectionHash: precheck.selectionHash,
      inputHash: precheck.inputHash,
    });

    if (precheck.status === 'consumed') {
      if (precheck.consumedResultType !== consumer.resultType || !precheck.consumedResultId) {
        throw new BatchPrecheckConflictError('预检结果类型不匹配');
      }
      const result = await consumer.loadResult(tx, precheck.consumedResultId);
      assertEnvelope(result, consumer.resultType, fingerprint);
      if (precheck.consumedIdempotencyKey !== idempotencyKey) {
        throw new BatchPrecheckConflictError('预检确认已使用');
      }
      return result.value;
    }

    const now = input.now?.() || new Date();
    if (precheck.status !== 'issued') {
      throw new BatchPrecheckConflictError(precheck.status === 'expired' ? '预检确认已过期' : '预检确认已失效');
    }
    if (readExpiresAt(precheck.expiresAt).getTime() <= now.getTime()) {
      await input.store.update(tx, precheck.id, { status: 'expired' });
      throw new BatchPrecheckConflictError('预检确认已过期');
    }

    const existingInput = { actorId, handlerKey, operation: precheck.operation, idempotencyKey, idempotencyFingerprint: fingerprint };
    const existing = await consumer.findExistingResult(tx, existingInput);
    if (existing) {
      assertEnvelope(existing, consumer.resultType, fingerprint);
      await input.store.update(tx, precheck.id, {
        status: 'consumed',
        consumedAt: now,
        consumedResultType: existing.type,
        consumedResultId: existing.id,
        consumedIdempotencyKey: idempotencyKey,
      });
      return existing.value;
    }

    await consumer.lockAndRevalidate(tx, precheck);
    let result: BatchPrecheckResultEnvelope<TType, TValue>;
    try {
      result = await consumer.createResult(tx, precheck, { idempotencyKey, idempotencyFingerprint: fingerprint });
    } catch (error) {
      if (!isUniqueConstraint(error)) throw error;
      // A duplicate may be the concurrent transaction's uncommitted winner.
      // Do not inspect it from this potentially repeatable-read transaction;
      // roll back and retry in a fresh transaction with a bounded attempt count.
      throw new BatchPrecheckRetryableConflictError();
    }
    assertEnvelope(result, consumer.resultType, fingerprint);
    await input.store.update(tx, precheck.id, {
      status: 'consumed',
      consumedAt: now,
      consumedResultType: result.type,
      consumedResultId: result.id,
      consumedIdempotencyKey: idempotencyKey,
    });
    return result.value;
  });

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await consumeOnce();
    } catch (error) {
      if (!(error instanceof BatchPrecheckRetryableConflictError) && !isRetryableTransactionConflict(error)) throw error;
      if (attempt === 2) throw error;
      lastError = error;
    }
  }
  throw lastError;
}
