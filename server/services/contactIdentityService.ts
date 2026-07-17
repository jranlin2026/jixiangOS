import { Prisma } from '@prisma/client';
import {
  createCipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import type { Customer } from '../../src/types/customer';
import { getPhoneNumberError, normalizePhoneForComparison } from '../../src/shared/utils/phoneNumber';
import { createOrReloadCustomerDuplicateGroup } from './customerAuditService';

export type ContactIdentityType = 'phone' | 'wechat';

export interface ContactIdentityCrypto {
  hmacKey: Buffer;
  /** Pinned to v1 until a rehash migration is shipped. */
  keyVersion: 1;
  encryptionKey: Buffer;
  encryptionKeyVersion: 1;
}

export interface ContactIdentityRecord {
  id: string;
  type: string;
  normalizedHash: string;
  hashKeyVersion: number;
  status: string;
  encryptedNormalizedValue: string;
  canonicalCustomerId: string | null;
  conflictReason: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface SafeContactIdentityConflictPayload {
  message: '系统中已存在相同联系方式';
  customer?: Pick<Customer, 'id' | 'name' | 'company' | 'owner'>;
}

export class ContactIdentityConflictError extends Error {
  readonly code = 'CONTACT_IDENTITY_CONFLICT';
  readonly safePayload: SafeContactIdentityConflictPayload;

  constructor(safePayload: SafeContactIdentityConflictPayload = { message: '系统中已存在相同联系方式' }) {
    super(safePayload.message);
    this.name = 'ContactIdentityConflictError';
    this.safePayload = safePayload;
  }
}

type ContactIdentityStore = {
  contactIdentity: {
    findUnique(args: any): Promise<ContactIdentityRecord | null>;
    create(args: any): Promise<ContactIdentityRecord>;
    update(args: any): Promise<ContactIdentityRecord>;
  };
  contactIdentityLink: {
    findMany(args: any): Promise<any[]>;
    upsert(args: any): Promise<any>;
    updateMany(args: any): Promise<{ count: number }>;
  };
  businessRecord?: {
    findUnique(args: any): Promise<any>;
    findMany?(args: any): Promise<any[]>;
  };
  leadRecord?: { findMany(args?: any): Promise<any[]> };
  customerDuplicateGroup?: {
    findUnique(args: any): Promise<any>;
    create(args: any): Promise<any>;
  };
  appStorage?: {
    findMany(args?: any): Promise<Array<{ key: string }>>;
    deleteMany(args: any): Promise<{ count: number }>;
    upsert?(args: any): Promise<any>;
  };
  $queryRaw?<T = unknown>(query: Prisma.Sql): Promise<T>;
  $executeRaw?(query: Prisma.Sql): Promise<number>;
};

type ConflictViewer = {
  /** Server-derived list-read capability; data scope alone must not disclose. */
  canReadCustomerList: boolean;
  canReadCustomer(customer: Customer): boolean;
};

type ContactInput = {
  phone?: string | null;
  wechat?: string | null;
  crypto?: ContactIdentityCrypto;
};

export type CustomerIdentityInput = ContactInput & {
  customerId: string;
  source?: string;
  conflictViewer?: ConflictViewer;
};

export type LeadCustomerIdentityInput = CustomerIdentityInput & {
  leadId: string;
};

/**
 * A standalone lead participates in the identity index, but never claims or
 * changes customer canonical ownership. Callers must already hold the shared
 * identity mutation gate before invoking this lifecycle helper.
 */
export type LeadIdentityInput = ContactInput & {
  leadId: string;
  source?: string;
};

export interface ContactIdentityBackfillOptions {
  apply: boolean;
  crypto?: ContactIdentityCrypto;
}

export interface ContactIdentityBackfillSummary {
  canonicalCustomers: number;
  conflicts: number;
  invalidValues: number;
  duplicateGroups: number;
  /** Count of obsolete SHA-256 contact-lock rows removed by an explicit apply. */
  legacyContactLockKeysCleared: number;
}

type IdentityCandidate = {
  type: ContactIdentityType;
  normalized: string;
  normalizedHash: string;
};

const GENERIC_CONFLICT_MESSAGE = '系统中已存在相同联系方式' as const;
const CONTACT_IDENTITY_ENCRYPTION_INFO = Buffer.from('jixiangos/contact-identity/encryption/v1', 'utf8');
// Task 5 used this exactly-shaped SHA-256 key. Keep the matcher narrow so the
// maintenance operation never deletes a current versioned HMAC lock or any
// unrelated AppStorage entry.
const LEGACY_CONTACT_LOCK_KEY_PATTERN = /^aaos_contact_lock_[a-f0-9]{64}$/;
const LEGACY_CONTACT_LOCK_KEY_SQL_PATTERN = '^aaos_contact_lock_[a-f0-9]{64}$';
/** Serializes only identity/link lifecycle mutations; its value contains no contact data. */
export const CONTACT_IDENTITY_MUTATION_GATE_KEY = 'aaos_contact_identity_mutation_gate_v1';

function requireKeyBuffer(key: Buffer, label: string): Buffer {
  if (!Buffer.isBuffer(key) || key.length < 32) throw new Error(`${label} must contain at least 32 bytes.`);
  return key;
}

function decodeBase64Key(value: unknown, label: string): Buffer {
  const encoded = String(value || '').trim();
  if (!encoded) throw new Error(`${label}_REQUIRED`);
  const decoded = Buffer.from(encoded, 'base64');
  if (!decoded.length || decoded.toString('base64').replace(/=+$/u, '') !== encoded.replace(/=+$/u, '')) {
    throw new Error(`${label} must be valid base64.`);
  }
  return requireKeyBuffer(decoded, label);
}

function pinnedVersion(value: unknown, label: string): 1 {
  if (String(value || '').trim() !== '1') {
    throw new Error(`${label} must be pinned to 1 until a contact identity rotation migration is available.`);
  }
  return 1;
}

export function createContactIdentityCryptoFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ContactIdentityCrypto {
  return {
    hmacKey: decodeBase64Key(env.CONTACT_IDENTITY_HMAC_KEY, 'CONTACT_IDENTITY_HMAC_KEY'),
    keyVersion: pinnedVersion(env.CONTACT_IDENTITY_HMAC_KEY_VERSION, 'CONTACT_IDENTITY_HMAC_KEY_VERSION'),
    encryptionKey: decodeBase64Key(env.CONTACT_IDENTITY_ENCRYPTION_KEY, 'CONTACT_IDENTITY_ENCRYPTION_KEY'),
    encryptionKeyVersion: pinnedVersion(
      env.CONTACT_IDENTITY_ENCRYPTION_KEY_VERSION,
      'CONTACT_IDENTITY_ENCRYPTION_KEY_VERSION',
    ),
  };
}

function requireCrypto(input?: ContactIdentityCrypto): ContactIdentityCrypto {
  const crypto = input || createContactIdentityCryptoFromEnv();
  requireKeyBuffer(crypto.hmacKey, 'CONTACT_IDENTITY_HMAC_KEY');
  requireKeyBuffer(crypto.encryptionKey, 'CONTACT_IDENTITY_ENCRYPTION_KEY');
  if (crypto.keyVersion !== 1 || crypto.encryptionKeyVersion !== 1) {
    throw new Error('Contact identity key versions must remain pinned to 1 until a rotation migration is available.');
  }
  return crypto;
}

/**
 * Take the fixed, non-PII identity mutation gate before any source, link, or
 * identity lock. Different workflows otherwise need opposing customer/lead
 * source orders (for example profile sync versus lead conversion). The gate
 * deliberately scopes serialization to contact lifecycle writes and backfill.
 */
export async function lockContactIdentityMutationGate(tx: ContactIdentityStore): Promise<void> {
  if (!tx.appStorage?.upsert) {
    throw new Error('Contact identity mutation gate store is unavailable.');
  }
  await tx.appStorage.upsert({
    where: { key: CONTACT_IDENTITY_MUTATION_GATE_KEY },
    update: { value: { kind: 'contact_identity_mutation_gate' } },
    create: { key: CONTACT_IDENTITY_MUTATION_GATE_KEY, value: { kind: 'contact_identity_mutation_gate' } },
  });
  if (!tx.$queryRaw) return;
  await tx.$queryRaw(Prisma.sql`
    SELECT \`key\`
    FROM app_storage
    WHERE \`key\` = ${CONTACT_IDENTITY_MUTATION_GATE_KEY}
    FOR UPDATE
  `);
}

export function normalizeContactIdentity(type: ContactIdentityType, value: string): string {
  if (type === 'wechat') return String(value || '').trim().toLocaleLowerCase('en-US');
  const normalized = normalizePhoneForComparison(value);
  // Domestic numbers historically appear both with and without +86. The
  // identity representation deliberately removes exactly that prefix.
  return normalized.startsWith('+86') && normalized.length === 14 ? normalized.slice(3) : normalized;
}

export function hashContactIdentity(value: string, key: Buffer): string {
  return createHmac('sha256', key).update(value, 'utf8').digest('hex');
}

function deriveDomainKey(key: Buffer, info: Buffer): Buffer {
  return Buffer.from(hkdfSync('sha256', key, Buffer.alloc(0), info, 32));
}

function encryptNormalizedValue(
  candidate: IdentityCandidate,
  crypto: ContactIdentityCrypto,
): string {
  const nonce = randomBytes(12);
  const key = deriveDomainKey(crypto.encryptionKey, CONTACT_IDENTITY_ENCRYPTION_INFO);
  try {
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(Buffer.from(
      `jixiangos/contact-identity/${candidate.type}/${candidate.normalizedHash}/h${crypto.keyVersion}/e${crypto.encryptionKeyVersion}`,
      'utf8',
    ));
    const ciphertext = Buffer.concat([cipher.update(candidate.normalized, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      'ci',
      `v${crypto.encryptionKeyVersion}`,
      'aes-256-gcm',
      nonce.toString('base64'),
      ciphertext.toString('base64'),
      tag.toString('base64'),
    ].join(':');
  } finally {
    key.fill(0);
  }
}

function candidatesFromContact(input: ContactInput, crypto: ContactIdentityCrypto): IdentityCandidate[] {
  const values: Array<[ContactIdentityType, string]> = [
    ['phone', String(input.phone || '')],
    ['wechat', String(input.wechat || '')],
  ];
  return values
    .map(([type, value]) => ({ type, normalized: normalizeContactIdentity(type, value) }))
    .filter((candidate) => Boolean(candidate.normalized))
    .map((candidate) => ({
      ...candidate,
      normalizedHash: hashContactIdentity(candidate.normalized, crypto.hmacKey),
    }))
    .sort((left, right) => (
      left.type.localeCompare(right.type) || left.normalizedHash.localeCompare(right.normalizedHash)
    ));
}

async function lockIdentity(tx: ContactIdentityStore, identityId: string): Promise<void> {
  if (!tx.$queryRaw) return;
  await tx.$queryRaw(Prisma.sql`
    SELECT id
    FROM contact_identities
    WHERE id = ${identityId}
    FOR UPDATE
  `);
}

function contactIdentityId(candidate: IdentityCandidate): string {
  // The database uniqueness boundary includes type. Including it in the
  // deterministic primary key prevents an otherwise valid phone/WeChat pair
  // with the same normalized string from colliding on ContactIdentity.id.
  return `ci_${candidate.type}_${candidate.normalizedHash.slice(0, 32)}`;
}

function isP2002(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 'P2002';
}

async function findAndLockIdentityByHash(
  tx: ContactIdentityStore,
  candidate: IdentityCandidate,
): Promise<ContactIdentityRecord | null> {
  if (!tx.$queryRaw) return null;
  // InnoDB's locking read is a current read under REPEATABLE READ. This must
  // be used after a unique-key race instead of another snapshot findUnique.
  const rows = await tx.$queryRaw<ContactIdentityRecord[]>(Prisma.sql`
    SELECT id, type, normalizedHash, hashKeyVersion, status,
           encryptedNormalizedValue, canonicalCustomerId, conflictReason,
           createdAt, updatedAt
    FROM contact_identities
    WHERE type = ${candidate.type}
      AND normalizedHash = ${candidate.normalizedHash}
    LIMIT 1
    FOR UPDATE
  `);
  return rows[0] || null;
}

function assertIdentityKeyVersion(identity: ContactIdentityRecord, crypto: ContactIdentityCrypto): ContactIdentityRecord {
  if (identity.hashKeyVersion !== crypto.keyVersion) {
    throw new Error('Contact identity HMAC version mismatch; run an explicit rotation migration.');
  }
  return identity;
}

async function lockOrCreateIdentity(
  tx: ContactIdentityStore,
  candidate: IdentityCandidate,
  crypto: ContactIdentityCrypto,
): Promise<ContactIdentityRecord> {
  const where = { type_normalizedHash: { type: candidate.type, normalizedHash: candidate.normalizedHash } };
  let identity = await tx.contactIdentity.findUnique({ where });
  if (!identity) {
    try {
      identity = await tx.contactIdentity.create({
        data: {
          id: contactIdentityId(candidate),
          type: candidate.type,
          normalizedHash: candidate.normalizedHash,
          hashKeyVersion: crypto.keyVersion,
          status: 'active',
          encryptedNormalizedValue: encryptNormalizedValue(candidate, crypto),
          canonicalCustomerId: null,
          conflictReason: null,
        },
      });
    } catch (error) {
      if (!isP2002(error)) throw error;
      const currentWinner = await findAndLockIdentityByHash(tx, candidate);
      if (currentWinner) return assertIdentityKeyVersion(currentWinner, crypto);
      // Never fall back to a repeatable-read ORM snapshot after a real
      // locking read misses: that would hide an unrelated P2002 or revive the
      // stale-winner bug. Adapters without raw capability retain the fallback.
      if (tx.$queryRaw) throw error;
      identity = await tx.contactIdentity.findUnique({ where });
      if (!identity) throw error;
    }
  }
  const current = await findAndLockIdentityByHash(tx, candidate);
  if (current) return assertIdentityKeyVersion(current, crypto);
  if (tx.$queryRaw) throw new Error('Contact identity disappeared during current locking read.');
  await lockIdentity(tx, identity.id);
  const locked = await tx.contactIdentity.findUnique({ where });
  if (!locked) throw new Error('Contact identity disappeared after locking.');
  return assertIdentityKeyVersion(locked, crypto);
}

function parseCustomer(row: any): Customer | null {
  if (!row) return null;
  const value = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Customer;
}

async function safeConflictPayload(
  tx: ContactIdentityStore,
  customerIds: string[],
  viewer?: ConflictViewer,
): Promise<SafeContactIdentityConflictPayload> {
  if (!viewer?.canReadCustomerList || !tx.businessRecord?.findUnique) {
    return { message: GENERIC_CONFLICT_MESSAGE };
  }
  for (const customerId of [...new Set(customerIds)].sort()) {
    const row = await tx.businessRecord.findUnique({
      where: { domain_recordId: { domain: STORAGE_KEYS.CUSTOMERS, recordId: customerId } },
      select: { data: true },
    });
    const customer = parseCustomer(row);
    if (!customer || !viewer.canReadCustomer(customer)) continue;
    return {
      message: GENERIC_CONFLICT_MESSAGE,
      customer: {
        id: customer.id,
        name: customer.name,
        company: customer.company,
        owner: customer.owner,
      },
    };
  }
  return { message: GENERIC_CONFLICT_MESSAGE };
}

async function assertIdentityCanAcceptCustomer(
  tx: ContactIdentityStore,
  identity: ContactIdentityRecord,
  customerId: string,
  viewer?: ConflictViewer,
): Promise<void> {
  const activeCustomerLinks = await activeCustomerLinksForUpdate(tx, identity.id);
  const otherCustomerIds = activeCustomerLinks
    .map((link) => String(link.entityId))
    .filter((entityId) => entityId !== customerId);
  if (identity.status !== 'conflict' && otherCustomerIds.length === 0) return;
  const payload = await safeConflictPayload(
    tx,
    otherCustomerIds.length ? otherCustomerIds : activeCustomerLinks.map((link) => String(link.entityId)),
    viewer,
  );
  throw new ContactIdentityConflictError(payload);
}

async function activeCustomerLinksForUpdate(
  tx: ContactIdentityStore,
  identityId: string,
): Promise<Array<{ entityId: string }>> {
  if (tx.$queryRaw) {
    // This is deliberately a locking/current read: after a P2002 winner
    // reload, a normal ORM read could still see the old RR snapshot and admit
    // a second customer link for the same identity.
    const rows = await tx.$queryRaw<Array<{ entityId: string }>>(Prisma.sql`
      SELECT entityId
      FROM contact_identity_links
      WHERE identityId = ${identityId}
        AND entityType = 'customer'
        AND linkStatus = 'active'
      FOR UPDATE
    `);
    return rows;
  }
  return tx.contactIdentityLink.findMany({
    where: { identityId, entityType: 'customer', linkStatus: 'active' },
    select: { entityId: true },
  });
}

async function upsertActiveLink(
  tx: ContactIdentityStore,
  identityId: string,
  entityType: 'customer' | 'lead',
  entityId: string,
  source: string,
): Promise<void> {
  await tx.contactIdentityLink.upsert({
    where: { identityId_entityType_entityId: { identityId, entityType, entityId } },
    update: { linkStatus: 'active', source, endedAt: null },
    create: {
      id: `cil-${randomUUID()}`,
      identityId,
      entityType,
      entityId,
      linkStatus: 'active',
      source,
      endedAt: null,
    },
  });
}

async function reconcileIdentityAfterCustomerLinkEnd(
  tx: ContactIdentityStore,
  identityId: string,
): Promise<ContactIdentityRecord> {
  const active = await activeCustomerLinksForUpdate(tx, identityId);
  const customerIds = [...new Set(active.map((link) => String(link.entityId)))].sort();
  return tx.contactIdentity.update({
    where: { id: identityId },
    data: customerIds.length > 1
      ? { status: 'conflict', canonicalCustomerId: null, conflictReason: 'multiple_active_customers' }
      : {
        status: 'active',
        canonicalCustomerId: customerIds[0] || null,
        conflictReason: null,
      },
  });
}

async function endObsoleteEntityLinks(
  tx: ContactIdentityStore,
  entityType: 'customer' | 'lead',
  entityId: string,
  retainedIdentityIds: Set<string>,
): Promise<string[]> {
  const activeLinks = await activeEntityLinksForUpdate(tx, entityType, entityId);
  const obsoleteIds = [...new Set(
    activeLinks
      .map((link) => String(link.identityId))
      .filter((identityId) => !retainedIdentityIds.has(identityId)),
  )].sort();
  const endedAt = new Date();
  for (const identityId of obsoleteIds) {
    // The active entity-link read locks only the link row. Lock its identity
    // before recomputing canonical state so a concurrent claimant cannot have
    // its newer canonical pointer overwritten by this cleanup.
    await lockIdentity(tx, identityId);
    await tx.contactIdentityLink.updateMany({
      where: { identityId, entityType, entityId, linkStatus: 'active' },
      data: { linkStatus: 'ended', endedAt },
    });
    if (entityType === 'customer') await reconcileIdentityAfterCustomerLinkEnd(tx, identityId);
  }
  return obsoleteIds;
}

async function activeEntityLinksForUpdate(
  tx: ContactIdentityStore,
  entityType: 'customer' | 'lead',
  entityId: string,
): Promise<Array<{ identityId: string }>> {
  if (tx.$queryRaw) {
    return tx.$queryRaw<Array<{ identityId: string }>>(Prisma.sql`
      SELECT identityId
      FROM contact_identity_links
      WHERE entityType = ${entityType}
        AND entityId = ${entityId}
        AND linkStatus = 'active'
      FOR UPDATE
    `);
  }
  return tx.contactIdentityLink.findMany({
    where: { entityType, entityId, linkStatus: 'active' },
    select: { identityId: true },
  });
}

function customerMatchesCandidate(customer: Customer, candidate: IdentityCandidate): boolean {
  if (customer.deletedAt) return false;
  return normalizeContactIdentity(candidate.type, String(customer[candidate.type] || '')) === candidate.normalized;
}

function legacyCustomerCondition(candidate: IdentityCandidate): Prisma.Sql {
  if (candidate.type === 'wechat') {
    return Prisma.sql`
      LOWER(TRIM(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(data, '$.wechat')), ''))) = ${candidate.normalized}
    `;
  }
  const digits = candidate.normalized.replace(/\D/g, '');
  if (/^1[3-9]\d{9}$/.test(candidate.normalized)) {
    return Prisma.sql`
      RIGHT(
        REGEXP_REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(data, '$.phone')), ''), '[^0-9]', ''),
        11
      ) = ${candidate.normalized}
    `;
  }
  return Prisma.sql`
    REGEXP_REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(data, '$.phone')), ''), '[^0-9]', '') = ${digits}
  `;
}

async function lockMatchingLegacyCustomerRows(
  tx: ContactIdentityStore,
  candidate: IdentityCandidate,
): Promise<any[]> {
  let rows: any[];
  if (tx.$queryRaw) {
    rows = await tx.$queryRaw<any[]>(Prisma.sql`
      SELECT id, domain, recordId, data
      FROM business_records
      WHERE domain = ${STORAGE_KEYS.CUSTOMERS}
        AND (
          JSON_EXTRACT(data, '$.deletedAt') IS NULL
          OR JSON_TYPE(JSON_EXTRACT(data, '$.deletedAt')) = 'NULL'
        )
        AND (${legacyCustomerCondition(candidate)})
      ORDER BY recordId ASC
      FOR UPDATE
    `);
  } else if (tx.businessRecord?.findMany) {
    // Test/adapter fallback only. Production takes the lock-bearing SQL path.
    rows = await tx.businessRecord.findMany({
      where: { domain: STORAGE_KEYS.CUSTOMERS },
      orderBy: { recordId: 'asc' },
    });
  } else {
    return [];
  }
  return rows.filter((row) => {
    const customer = parseCustomer(row);
    return Boolean(customer && customerMatchesCandidate(customer, candidate));
  });
}

async function reconcileMatchingLegacyCustomers(
  tx: ContactIdentityStore,
  identity: ContactIdentityRecord,
  rows: any[],
): Promise<ContactIdentityRecord> {
  const legacyCustomerIds = [...new Set(rows
    .map((row) => String(row.recordId || parseCustomer(row)?.id || '').trim())
    .filter(Boolean))].sort();
  if (!legacyCustomerIds.length) return identity;
  const active = await activeCustomerLinksForUpdate(tx, identity.id);
  const activeIds = new Set(active.map((link) => String(link.entityId)));
  for (const customerId of legacyCustomerIds) {
    if (!activeIds.has(customerId)) {
      await upsertActiveLink(tx, identity.id, 'customer', customerId, 'legacy_transition');
    }
  }
  return reconcileIdentityAfterCustomerLinkEnd(tx, identity.id);
}

export async function endCustomerContactIdentityLinks(
  tx: ContactIdentityStore,
  customerId: string,
): Promise<void> {
  await endObsoleteEntityLinks(tx, 'customer', customerId, new Set());
}

export async function endLeadContactIdentityLinks(
  tx: ContactIdentityStore,
  leadId: string,
): Promise<void> {
  await endObsoleteEntityLinks(tx, 'lead', leadId, new Set());
}

/**
 * Converges a standalone lead's active links to its current valid contacts.
 * It deliberately leaves identity customer status/canonical fields unchanged:
 * standalone leads are observers of a contact identity, not customer owners.
 */
export async function upsertLeadContactIdentities(
  tx: ContactIdentityStore,
  input: LeadIdentityInput,
): Promise<ContactIdentityRecord[]> {
  const crypto = requireCrypto(input.crypto);
  const source = String(input.source || 'lead_write').trim() || 'lead_write';
  const identities: ContactIdentityRecord[] = [];
  for (const candidate of candidatesFromContact(input, crypto)) {
    const identity = await lockOrCreateIdentity(tx, candidate, crypto);
    await upsertActiveLink(tx, identity.id, 'lead', input.leadId, source);
    identities.push(identity);
  }
  await endObsoleteEntityLinks(tx, 'lead', input.leadId, new Set(identities.map((identity) => identity.id)));
  return identities;
}

export async function upsertCustomerContactIdentities(
  tx: ContactIdentityStore,
  input: CustomerIdentityInput,
): Promise<ContactIdentityRecord[]> {
  const crypto = requireCrypto(input.crypto);
  const candidates = candidatesFromContact(input, crypto);
  const prepared: Array<{ candidate: IdentityCandidate; identity: ContactIdentityRecord }> = [];
  for (const candidate of candidates) {
    // Customer source rows are locked before the shared identity. Deletes and
    // edits already lock their business record before ending identity links;
    // keeping this order removes the create-vs-delete lock cycle.
    const legacyRows = await lockMatchingLegacyCustomerRows(tx, candidate);
    const identity = await reconcileMatchingLegacyCustomers(
      tx,
      await lockOrCreateIdentity(tx, candidate, crypto),
      legacyRows,
    );
    await assertIdentityCanAcceptCustomer(tx, identity, input.customerId, input.conflictViewer);
    prepared.push({ candidate, identity });
  }

  const source = String(input.source || 'customer_write').trim() || 'customer_write';
  const identities: ContactIdentityRecord[] = [];
  for (const { identity } of prepared) {
    await upsertActiveLink(tx, identity.id, 'customer', input.customerId, source);
    identities.push(await tx.contactIdentity.update({
      where: { id: identity.id },
      data: { canonicalCustomerId: input.customerId, status: 'active', conflictReason: null },
    }));
  }

  // New identities are fully established before an edit ends old links. A
  // conflict therefore aborts without detaching the customer's prior contact.
  const retained = new Set(identities.map((identity) => identity.id));
  await endObsoleteEntityLinks(tx, 'customer', input.customerId, retained);
  return identities;
}

export async function linkLeadAndCustomerIdentity(
  tx: ContactIdentityStore,
  input: LeadCustomerIdentityInput,
): Promise<ContactIdentityRecord[]> {
  const crypto = requireCrypto(input.crypto);
  const candidates = candidatesFromContact(input, crypto);
  const prepared: ContactIdentityRecord[] = [];
  for (const candidate of candidates) {
    const legacyRows = await lockMatchingLegacyCustomerRows(tx, candidate);
    const identity = await reconcileMatchingLegacyCustomers(
      tx,
      await lockOrCreateIdentity(tx, candidate, crypto),
      legacyRows,
    );
    await assertIdentityCanAcceptCustomer(tx, identity, input.customerId, input.conflictViewer);
    prepared.push(identity);
  }
  const source = String(input.source || 'lead_conversion').trim() || 'lead_conversion';
  const identities: ContactIdentityRecord[] = [];
  for (const identity of prepared) {
    await upsertActiveLink(tx, identity.id, 'lead', input.leadId, source);
    await upsertActiveLink(tx, identity.id, 'customer', input.customerId, source);
    identities.push(await tx.contactIdentity.update({
      where: { id: identity.id },
      data: { canonicalCustomerId: input.customerId, status: 'active', conflictReason: null },
    }));
  }
  const retained = new Set(identities.map((identity) => identity.id));
  await endObsoleteEntityLinks(tx, 'lead', input.leadId, retained);
  await endObsoleteEntityLinks(tx, 'customer', input.customerId, retained);
  return identities;
}

type PlannedIdentity = IdentityCandidate & {
  customers: string[];
  leads: string[];
};

function dataObject(row: any): any {
  const value = typeof row?.data === 'string' ? JSON.parse(row.data) : row?.data;
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function addPlannedReference(
  plans: Map<string, PlannedIdentity>,
  candidate: IdentityCandidate,
  entityType: 'customer' | 'lead',
  entityId: string,
): void {
  const key = `${candidate.type}:${candidate.normalizedHash}`;
  const plan = plans.get(key) || { ...candidate, customers: [], leads: [] };
  const target = entityType === 'customer' ? plan.customers : plan.leads;
  if (!target.includes(entityId)) target.push(entityId);
  target.sort();
  plans.set(key, plan);
}

async function createOrReloadDuplicateGroup(
  tx: ContactIdentityStore,
  identityId: string,
  type: ContactIdentityType,
  customerIds: string[],
): Promise<void> {
  if (!tx.customerDuplicateGroup) throw new Error('Customer duplicate group store is unavailable.');
  const rule = `contact_identity:${type}`;
  const sortedCustomerIds = [...new Set(customerIds)].sort();
  await createOrReloadCustomerDuplicateGroup(tx as any, {
    rule,
    confidence: 'high',
    status: 'open',
    customerIds: sortedCustomerIds,
    contactIdentityId: identityId,
  });
}

async function cleanupLegacyContactLockKeys(tx: ContactIdentityStore): Promise<number> {
  if (tx.$executeRaw) {
    // Only the unversioned, exactly-64-lowercase-hex Task 5 key shape is
    // eligible. Current HMAC locks include "_v1_" and do not match.
    return tx.$executeRaw(Prisma.sql`
      DELETE FROM app_storage
      WHERE REGEXP_LIKE(\`key\`, ${LEGACY_CONTACT_LOCK_KEY_SQL_PATTERN}, 'c')
    `);
  }
  if (!tx.appStorage?.findMany || !tx.appStorage.deleteMany) return 0;
  const rows = await tx.appStorage.findMany({
    where: { key: { startsWith: 'aaos_contact_lock_' } },
    select: { key: true },
  });
  const legacyKeys = rows
    .map((row) => String(row.key || ''))
    .filter((key) => LEGACY_CONTACT_LOCK_KEY_PATTERN.test(key));
  if (!legacyKeys.length) return 0;
  return (await tx.appStorage.deleteMany({ where: { key: { in: legacyKeys } } })).count;
}

type BackfillPlan = {
  orderedPlans: PlannedIdentity[];
  customerIds: string[];
  leadIds: string[];
  invalidValues: number;
};

/**
 * Turns a point-in-time source snapshot into the links that should be active.
 * All source ids are retained even when their record is deleted or has no
 * usable contact so apply can end old links for those records.
 */
function buildBackfillPlan(
  customerRows: any[],
  leadRows: any[],
  crypto: ContactIdentityCrypto,
): BackfillPlan {
  const plans = new Map<string, PlannedIdentity>();
  const customerIds = new Set<string>();
  const leadIds = new Set<string>();
  let invalidValues = 0;

  for (const row of [...customerRows].sort((left, right) => String(left.recordId).localeCompare(String(right.recordId)))) {
    const customer = dataObject(row);
    const customerId = String(row.recordId || customer?.id || '').trim();
    if (!customerId) continue;
    customerIds.add(customerId);
    if (!customer || customer.deletedAt) continue;
    const phone = String(customer.phone || '').trim();
    if (phone && getPhoneNumberError(phone)) invalidValues += 1;
    const validContact = { phone: phone && !getPhoneNumberError(phone) ? phone : '', wechat: customer.wechat };
    for (const candidate of candidatesFromContact(validContact, crypto)) {
      addPlannedReference(plans, candidate, 'customer', customerId);
    }
  }

  for (const row of [...leadRows].sort((left, right) => String(left.id).localeCompare(String(right.id)))) {
    const lead = dataObject(row);
    const leadId = String(row.id || lead?.id || '').trim();
    if (!leadId) continue;
    leadIds.add(leadId);
    if (!lead || lead.deletedAt) continue;
    const phone = String(lead.phone ?? row.phone ?? '').trim();
    if (phone && getPhoneNumberError(phone)) invalidValues += 1;
    const validContact = {
      phone: phone && !getPhoneNumberError(phone) ? phone : '',
      wechat: lead.wechat ?? row.wechat,
    };
    for (const candidate of candidatesFromContact(validContact, crypto)) {
      addPlannedReference(plans, candidate, 'lead', leadId);
    }
  }

  return {
    orderedPlans: [...plans.values()].sort((left, right) => (
      left.type.localeCompare(right.type) || left.normalizedHash.localeCompare(right.normalizedHash)
    )),
    customerIds: [...customerIds].sort(),
    leadIds: [...leadIds].sort(),
    invalidValues,
  };
}

function backfillSummaryFromPlan(plan: BackfillPlan): ContactIdentityBackfillSummary {
  return {
    canonicalCustomers: plan.orderedPlans.filter((identity) => identity.customers.length === 1).length,
    conflicts: plan.orderedPlans.filter((identity) => identity.customers.length > 1).length,
    invalidValues: plan.invalidValues,
    duplicateGroups: plan.orderedPlans.filter((identity) => identity.customers.length > 1).length,
    legacyContactLockKeysCleared: 0,
  };
}

/**
 * The source locks intentionally use one fixed order. InnoDB locking reads
 * are current reads under RR, which prevents an apply from reviving a link
 * planned from an older source snapshot.
 */
async function lockCurrentBackfillSources(
  tx: ContactIdentityStore,
): Promise<{ customerRows: any[]; leadRows: any[] }> {
  if (tx.$queryRaw) {
    const customerRows = await tx.$queryRaw<any[]>(Prisma.sql`
      SELECT id, domain, recordId, data
      FROM business_records
      WHERE domain = ${STORAGE_KEYS.CUSTOMERS}
      ORDER BY recordId ASC
      FOR UPDATE
    `);
    const leadRows = await tx.$queryRaw<any[]>(Prisma.sql`
      SELECT id, phone, wechat, data
      FROM lead_records
      ORDER BY id ASC
      FOR UPDATE
    `);
    return { customerRows, leadRows };
  }
  if (!tx.businessRecord?.findMany || !tx.leadRecord?.findMany) {
    throw new Error('Contact identity backfill requires businessRecord and leadRecord readers.');
  }
  // Adapter/test fallback only. Production Prisma has $queryRaw and therefore
  // takes the current lock-bearing path above.
  const customerRows = await tx.businessRecord.findMany({
    where: { domain: STORAGE_KEYS.CUSTOMERS },
    orderBy: { recordId: 'asc' },
  });
  const leadRows = await tx.leadRecord.findMany({ orderBy: { id: 'asc' } });
  return { customerRows, leadRows };
}

async function applyBackfillPlan(
  tx: ContactIdentityStore,
  plan: BackfillPlan,
  crypto: ContactIdentityCrypto,
): Promise<void> {
  const retainedCustomerIdentityIds = new Map<string, Set<string>>();
  const retainedLeadIdentityIds = new Map<string, Set<string>>();
  const affectedIdentityIds = new Set<string>();

  for (const plannedIdentity of plan.orderedPlans) {
    const identity = await lockOrCreateIdentity(tx, plannedIdentity, crypto);
    affectedIdentityIds.add(identity.id);
    for (const customerId of plannedIdentity.customers) {
      const retained = retainedCustomerIdentityIds.get(customerId) || new Set<string>();
      retained.add(identity.id);
      retainedCustomerIdentityIds.set(customerId, retained);
      await upsertActiveLink(tx, identity.id, 'customer', customerId, 'historical_backfill');
    }
    for (const leadId of plannedIdentity.leads) {
      const retained = retainedLeadIdentityIds.get(leadId) || new Set<string>();
      retained.add(identity.id);
      retainedLeadIdentityIds.set(leadId, retained);
      await upsertActiveLink(tx, identity.id, 'lead', leadId, 'historical_backfill');
    }
  }

  // Reconcile every current source entity, not only the identities in the
  // plan. This is what ends a link after a source was edited, deleted, or
  // changed to an invalid/empty contact between preview and apply.
  for (const customerId of plan.customerIds) {
    for (const identityId of await endObsoleteEntityLinks(
      tx,
      'customer',
      customerId,
      retainedCustomerIdentityIds.get(customerId) || new Set<string>(),
    )) {
      affectedIdentityIds.add(identityId);
    }
  }
  for (const leadId of plan.leadIds) {
    for (const identityId of await endObsoleteEntityLinks(
      tx,
      'lead',
      leadId,
      retainedLeadIdentityIds.get(leadId) || new Set<string>(),
    )) {
      affectedIdentityIds.add(identityId);
    }
  }

  // Plan cardinalities cannot decide state here: an identity might have had a
  // stale link ended above. Recompute from the current locked link set, then
  // build candidate groups only from that converged state.
  for (const identityId of [...affectedIdentityIds].sort()) {
    const identity = await reconcileIdentityAfterCustomerLinkEnd(tx, identityId);
    const activeCustomerIds = [...new Set((await activeCustomerLinksForUpdate(tx, identity.id))
      .map((link) => String(link.entityId)))].sort();
    if (
      activeCustomerIds.length > 1
      && (identity.type === 'phone' || identity.type === 'wechat')
    ) {
      await createOrReloadDuplicateGroup(tx, identity.id, identity.type, activeCustomerIds);
    }
  }
}

function isRetryableContactIdentityTransactionConflict(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === 'P2002') return false;
  const message = error instanceof Error ? error.message : String(error || '');
  return code === 'P2034' || /deadlock|write conflict|1213|40001/i.test(message);
}

export async function backfillContactIdentities(
  prisma: ContactIdentityStore & { $transaction?(operation: (tx: ContactIdentityStore) => Promise<void>): Promise<void> },
  options: ContactIdentityBackfillOptions,
): Promise<ContactIdentityBackfillSummary> {
  const crypto = requireCrypto(options.crypto);
  if (!options.apply) {
    if (!prisma.businessRecord?.findMany || !prisma.leadRecord?.findMany) {
      throw new Error('Contact identity backfill requires businessRecord and leadRecord readers.');
    }
    const [customerRows, leadRows] = await Promise.all([
      prisma.businessRecord.findMany({
        where: { domain: STORAGE_KEYS.CUSTOMERS },
        orderBy: { recordId: 'asc' },
      }),
      prisma.leadRecord.findMany({ orderBy: { id: 'asc' } }),
    ]);
    return backfillSummaryFromPlan(buildBackfillPlan(customerRows, leadRows, crypto));
  }

  if (!prisma.$transaction) {
    throw new Error('Contact identity backfill apply requires a transaction-capable store.');
  }
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    let summary: ContactIdentityBackfillSummary | null = null;
    try {
      await prisma.$transaction(async (tx) => {
        await lockContactIdentityMutationGate(tx);
        const { customerRows, leadRows } = await lockCurrentBackfillSources(tx);
        const plan = buildBackfillPlan(customerRows, leadRows, crypto);
        await applyBackfillPlan(tx, plan, crypto);
        // This controlled maintenance action is intentionally coupled to a
        // successful contact backfill apply. It allows a post-rollout operator
        // to clear exactly the obsolete SHA-256 locks, even when no contact
        // rows need to be written on a later rerun.
        summary = {
          ...backfillSummaryFromPlan(plan),
          legacyContactLockKeysCleared: await cleanupLegacyContactLockKeys(tx),
        };
      });
      if (!summary) throw new Error('Contact identity backfill transaction returned no summary.');
      return summary;
    } catch (error) {
      lastError = error;
      if (!isRetryableContactIdentityTransactionConflict(error) || attempt === 3) throw error;
    }
  }
  throw lastError;
}
