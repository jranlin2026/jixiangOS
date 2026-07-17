import { createHash, randomUUID } from 'node:crypto';
import { Prisma, type CustomerAuditEvent, type CustomerDuplicateGroup } from '@prisma/client';
import type {
  CustomerAuditAppender,
  CustomerAuditEventInput,
} from './customerCommandService';
import { pickAuditFields } from '../db/customerAuditProjection';

export {
  pickAuditFields,
  sanitizeAuditEventForViewer,
  type CustomerAuditEventView,
} from '../db/customerAuditProjection';

/** The narrow transaction capability required for an append-only audit write. */
export type CustomerAuditStore = {
  customerAuditEvent: {
    create(args: { data: Prisma.CustomerAuditEventCreateArgs['data'] }): PromiseLike<CustomerAuditEvent>;
  };
};

export type CustomerDuplicateGroupStore = {
  customerDuplicateGroup: {
    create(args: {
      data: {
        id: string;
        groupKey: string;
        rule: string;
        confidence: string;
        status: string;
        customerIds: Prisma.InputJsonValue;
        contactIdentityId: string | null;
        sourceJobId: string | null;
        createdById: string | null;
        mergeLedgerId: string | null;
      };
    }): Promise<CustomerDuplicateGroup>;
    findUnique(args: { where: { groupKey: string } }): Promise<CustomerDuplicateGroup | null>;
  };
  $queryRaw?<T = unknown>(query: Prisma.Sql): Promise<T>;
};

export type CreateCustomerDuplicateGroupInput = {
  id?: string;
  rule: string;
  confidence: string;
  status: string;
  customerIds: string[];
  contactIdentityId?: string;
  sourceJobId?: string;
  createdById?: string;
  mergeLedgerId?: string;
};

function cleanText(value: unknown): string {
  return String(value || '').trim();
}

/**
 * Produce a deterministic JSON representation before hashing command input.
 * This value is deliberately never stored: it may contain a user-supplied
 * field such as contact text, whereas the 64-character digest is safe to
 * retain in an audit row.
 */
function stableAuditJson(value: unknown): string {
  const seen = new WeakSet<object>();
  const normalize = (candidate: unknown): unknown => {
    if (candidate === null || candidate === undefined) return null;
    if (typeof candidate === 'string' || typeof candidate === 'boolean') return candidate;
    if (typeof candidate === 'number') return Number.isFinite(candidate) ? candidate : String(candidate);
    if (typeof candidate === 'bigint') return { $bigint: candidate.toString() };
    if (candidate instanceof Date) return { $date: candidate.toISOString() };
    if (Array.isArray(candidate)) return candidate.map(normalize);
    if (typeof candidate === 'object') {
      if (seen.has(candidate)) throw new Error('审计输入不能包含循环引用');
      seen.add(candidate);
      const normalized: Record<string, unknown> = {};
      for (const key of Object.keys(candidate).sort()) {
        normalized[key] = normalize((candidate as Record<string, unknown>)[key]);
      }
      seen.delete(candidate);
      return normalized;
    }
    return String(candidate);
  };
  return JSON.stringify(normalize(value));
}

/** SHA-256 for canonical command input. Never use a caller-supplied digest. */
export function hashCustomerAuditInput(canonicalInput: unknown): string {
  return createHash('sha256').update(stableAuditJson(canonicalInput), 'utf8').digest('hex');
}

function fallbackCanonicalAuditInput(input: CustomerAuditEventInput): Record<string, unknown> {
  return {
    operation: input.operation,
    customerId: input.customerId,
    batchJobId: input.batchJobId ?? null,
    actorId: input.actor.id,
    reason: input.reason,
    idempotencyKey: input.idempotencyKey ?? null,
    result: input.result || 'succeeded',
  };
}

export async function appendCustomerAuditEvent(
  tx: CustomerAuditStore,
  input: CustomerAuditEventInput,
): Promise<CustomerAuditEvent> {
  return tx.customerAuditEvent.create({
    data: {
      id: input.id || randomUUID(),
      customerId: input.customerId,
      batchJobId: input.batchJobId ?? null,
      operation: input.operation,
      actorId: input.actor.id,
      actorName: input.actor.name,
      reason: input.reason || null,
      // Do not persist input.inputHash. It can be supplied by any caller and
      // could otherwise carry raw PII or a non-canonical correlation value.
      inputHash: hashCustomerAuditInput(input.canonicalInput ?? fallbackCanonicalAuditInput(input)),
      beforeSnapshot: pickAuditFields(input.beforeSnapshot),
      afterSnapshot: pickAuditFields(input.afterSnapshot),
      result: input.result || 'succeeded',
      requestId: input.requestId || null,
      idempotencyKey: input.idempotencyKey || null,
      ip: input.ip || null,
    },
  });
}

function duplicateGroupIdentity(input: Pick<CreateCustomerDuplicateGroupInput, 'rule' | 'customerIds'>) {
  const rule = cleanText(input.rule);
  const customerIds = [...new Set(input.customerIds.map((id) => cleanText(id)).filter(Boolean))].sort();
  if (!rule) throw new Error('重复候选规则不能为空');
  if (!customerIds.length) throw new Error('重复候选客户不能为空');
  return {
    rule,
    customerIds,
    groupKey: createHash('sha256').update(JSON.stringify({ rule, customerIds }), 'utf8').digest('hex'),
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  if (typeof error !== 'object' || !error) return false;
  const code = (error as { code?: unknown }).code;
  const message = error instanceof Error ? error.message : '';
  return code === 'P2002' || /unique constraint/i.test(message);
}

async function findAndLockCustomerDuplicateGroup(
  tx: CustomerDuplicateGroupStore,
  groupKey: string,
): Promise<CustomerDuplicateGroup | null> {
  if (!tx.$queryRaw) return null;
  // A locking read is a current read in InnoDB RR. Do not replace this with a
  // second ORM findUnique after P2002: that query can retain the earlier
  // snapshot and miss the committed winner.
  const rows = await tx.$queryRaw<CustomerDuplicateGroup[]>(Prisma.sql`
    SELECT id, groupKey, rule, confidence, status, customerIds,
           contactIdentityId, sourceJobId, createdById, createdAt,
           resolvedAt, mergeLedgerId
    FROM customer_duplicate_groups
    WHERE groupKey = ${groupKey}
    LIMIT 1
    FOR UPDATE
  `);
  return rows[0] || null;
}

/**
 * The unique group key is the concurrency boundary for later identity
 * backfills. A losing concurrent create reloads the committed winner instead
 * of producing a second duplicate candidate.
 */
export async function createOrReloadCustomerDuplicateGroup(
  tx: CustomerDuplicateGroupStore,
  input: CreateCustomerDuplicateGroupInput,
): Promise<CustomerDuplicateGroup> {
  const identity = duplicateGroupIdentity(input);
  try {
    return await tx.customerDuplicateGroup.create({
      data: {
        id: input.id || randomUUID(),
        groupKey: identity.groupKey,
        rule: identity.rule,
        confidence: input.confidence,
        status: input.status,
        customerIds: identity.customerIds,
        contactIdentityId: input.contactIdentityId || null,
        sourceJobId: input.sourceJobId || null,
        createdById: input.createdById || null,
        mergeLedgerId: input.mergeLedgerId || null,
      },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const current = await findAndLockCustomerDuplicateGroup(tx, identity.groupKey);
    if (tx.$queryRaw && !current) throw error;
    const existing = current || await tx.customerDuplicateGroup.findUnique({ where: { groupKey: identity.groupKey } });
    if (!existing) throw error;
    return existing;
  }
}

/** A transaction-only adapter for the Task 4 atomic customer command port. */
export function createPrismaCustomerAuditAppender(): CustomerAuditAppender {
  return {
    append(tx, input) {
      return appendCustomerAuditEvent(tx, input);
    },
  };
}
