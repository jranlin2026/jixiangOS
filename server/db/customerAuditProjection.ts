import type { Prisma } from '@prisma/client';

export type AuditSnapshot = Record<string, Prisma.InputJsonValue>;

type CustomerAuditEventLike = {
  id: string;
  eventSequence: bigint | number | string;
  customerId: string;
  batchJobId?: string | null;
  operation: string;
  actorId: string;
  actorName: string;
  reason?: string | null;
  inputHash?: string | null;
  beforeSnapshot?: unknown;
  afterSnapshot?: unknown;
  result: string;
  requestId?: string | null;
  idempotencyKey?: string | null;
  ip?: string | null;
  createdAt: Date | string;
};

export type CustomerAuditEventView = Omit<
  CustomerAuditEventLike,
  'eventSequence' | 'beforeSnapshot' | 'afterSnapshot' | 'createdAt'
> & {
  eventSequence: string;
  beforeSnapshot?: AuditSnapshot;
  afterSnapshot?: AuditSnapshot;
  createdAt: string;
};

const AUDIT_BUSINESS_FIELDS = [
  'id',
  'name',
  'company',
  'owner',
  'ownerId',
  'ownerIdentityStatus',
  'previousOwner',
  'originalSalesTransferBy',
  'assignedBy',
  'assignedAt',
  'assignmentReason',
  'ownerSince',
  'productLevel',
  'customerLevel',
  'lifecycleStatusCode',
  'lifecycleStatusUpdatedAt',
  'publicPoolAt',
  'releasedBy',
  'releaseReason',
  'industry',
  'city',
  'leadInputBy',
  'leadContributorId',
  'leadContributorName',
  'leadSource',
  'sourceType',
  'sourceName',
  'score',
  'totalSpent',
  'orderCount',
  'deletedAt',
  'deletedBy',
  'deleteReason',
  'deletionCascadeId',
  'createdAt',
  'updatedAt',
] as const;

const AUDIT_STRING_ARRAY_FIELDS = ['manualTagIds', 'tags', 'cascadeDeletedLeadIds'] as const;

function cleanText(value: unknown): string {
  return String(value || '').trim();
}

function maskPhone(value: unknown): string | undefined {
  const text = cleanText(value);
  if (!text) return undefined;
  // Never retain a complete short/malformed contact value in audit JSON.
  // At seven characters the old first-3/last-4 form reproduced the entire
  // value around the mask. Keep any value that cannot leave at least one
  // hidden source character fully opaque instead.
  return text.length >= 8 ? `${text.slice(0, 3)}****${text.slice(-4)}` : '***';
}

function maskWechat(value: unknown): string | undefined {
  const text = cleanText(value);
  if (!text) return undefined;
  // A valid WeChat ID is 6–20 ASCII identifier characters starting with a
  // letter. Short or malformed values must remain fully opaque: adding
  // asterisks around their source characters still leaks the original value.
  if (!/^[A-Za-z][A-Za-z0-9_-]{5,19}$/.test(text)) return '***';
  return `${text.slice(0, 2)}******${text.slice(-2)}`;
}

function maskEmail(value: unknown): string | undefined {
  const text = cleanText(value);
  if (!text) return undefined;
  const parts = text.split('@');
  if (parts.length !== 2) return '***';
  const [local, domain] = parts;
  // Keep only conventional, sufficiently long email shapes maskable. This
  // avoids reproducing all source characters for values such as `a`, `ab`,
  // `a@`, or malformed multi-@ strings.
  const validDomain = domain.length >= 4
    && domain.includes('.')
    && !domain.startsWith('.')
    && !domain.endsWith('.')
    && domain.split('.').every((label) => /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label));
  if (local.length < 3 || !/^[^\s@]+$/.test(local) || !validDomain) return '***';
  return `${local.slice(0, 2)}***@${domain}`;
}

function isJsonScalar(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function isSafeStringArray(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.length <= 100
    && value.every((item) => typeof item === 'string' && item.length <= 200);
}

/**
 * The audit record is deliberately a small, non-reconstructable business
 * summary. It never copies activity content/attachments, contact values,
 * auth material, blobs, or arbitrary nested JSON from the customer payload.
 */
export function pickAuditFields(snapshot: unknown): AuditSnapshot | undefined {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return undefined;
  const source = snapshot as Record<string, unknown>;
  const picked: AuditSnapshot = {};

  for (const field of AUDIT_BUSINESS_FIELDS) {
    const value = source[field];
    if (isJsonScalar(value)) picked[field] = value;
  }
  for (const field of AUDIT_STRING_ARRAY_FIELDS) {
    if (isSafeStringArray(source[field])) picked[field] = [...source[field]];
  }

  const phone = maskPhone(source.phone);
  const wechat = maskWechat(source.wechat);
  const email = maskEmail(source.email);
  if (phone) picked.phone = phone;
  if (wechat) picked.wechat = wechat;
  if (email) picked.email = email;

  return Object.keys(picked).length ? picked : undefined;
}

/** Maps the persisted BigInt sequence before an audit record reaches JSON. */
export function sanitizeAuditEventForViewer(event: CustomerAuditEventLike): CustomerAuditEventView {
  return {
    id: event.id,
    eventSequence: String(event.eventSequence),
    customerId: event.customerId,
    batchJobId: event.batchJobId ?? null,
    operation: event.operation,
    actorId: event.actorId,
    actorName: event.actorName,
    reason: event.reason ?? null,
    inputHash: event.inputHash ?? null,
    beforeSnapshot: pickAuditFields(event.beforeSnapshot),
    afterSnapshot: pickAuditFields(event.afterSnapshot),
    result: event.result,
    requestId: event.requestId ?? null,
    idempotencyKey: event.idempotencyKey ?? null,
    ip: event.ip ?? null,
    createdAt: event.createdAt instanceof Date ? event.createdAt.toISOString() : new Date(event.createdAt).toISOString(),
  };
}
