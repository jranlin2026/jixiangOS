import { Prisma, type PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { failure, success, type ApiResponse } from '../api/response';
import {
  DEFAULT_LEAD_FLOW_CONFIG,
  DEFAULT_LIFECYCLE_STATUS_CONFIGS,
  LIFECYCLE_STATUS_CODES,
  STORAGE_KEYS,
  normalizeLifecycleStatusCode,
  normalizeResourceOwnership,
} from '../../src/shared/utils/constants';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { Customer, CustomerActivityRecord } from '../../src/types/customer';
import type { FollowUpRecord, Lead, LeadChangeLog, LeadFlowConfig, LeadIntakeRecord } from '../../src/types/lead';
import type { Role } from '../../src/types/role';
import {
  buildDataVisibilityScopeForUser,
  type DataVisibilityScope,
} from '../../src/shared/utils/dataVisibility';
import {
  canReceiveLead,
  hasExplicitPermission,
  hasPermission,
  isSuperAdmin,
  PERMISSION_KEYS,
} from '../../src/shared/utils/permissions';
import {
  getPhoneNumberError,
  normalizePhoneForComparison,
  normalizePhoneForStorage,
} from '../../src/shared/utils/phoneNumber';
import { applyContactEditLock } from '../../src/shared/utils/contactEditLock';
import { mapPrismaDepartment, mapPrismaRole, mapPrismaUser } from '../db/prismaMappers';
import { loadCustomerTagCatalog } from './customerTagService';
import { validateManualTagUpdateSelection } from './customerTagPolicy';
import {
  normalizeCustomerLifecycleConfig,
  normalizeCustomerLifecycleValue,
  assertLifecycleTransition,
} from './customerLifecyclePolicy';
import { assertCustomerCanBeSoftDeleted } from './customerDeletePolicy';
import { lockCustomerAssociationScope } from './customerAssociationRegistry';
import {
  assertCanManageCustomer,
  assertCustomerActionPermission,
  assertCustomerClaimPermission,
  assertCustomerFieldPermissions,
  buildCustomerAccessContextFromDirectory,
  canReadCustomer,
  type CustomerAccessContext,
  type CustomerMutationAction,
} from './customerAccessPolicy';
import {
  createCustomerBusinessRecordRepository,
  CustomerWriteConflictError,
  type CustomerRecordSnapshot,
} from './customerBusinessRecordRepository';
import { customerWriteConflictResponse } from './customerWriteConflict';
import { appendCustomerAuditEvent } from './customerAuditService';
import {
  ContactIdentityConflictError,
  createContactIdentityCryptoFromEnv,
  endCustomerContactIdentityLinks,
  endLeadContactIdentityLinks,
  hashContactIdentity,
  linkLeadAndCustomerIdentity,
  lockContactIdentityMutationGate,
  normalizeContactIdentity,
  upsertLeadContactIdentities,
  upsertCustomerContactIdentities,
  type ContactIdentityCrypto,
} from './contactIdentityService';

type CustomerCommandPrisma = Pick<PrismaClient, '$transaction' | 'leadRecord'>;
export type CustomerCommandTx = Pick<
  Prisma.TransactionClient,
  'appStorage' | 'businessRecord' | 'leadRecord' | 'user' | 'role' | 'department' | 'customerTodo' | 'customerAuditEvent'
  | 'contactIdentity' | 'contactIdentityLink' | '$queryRaw'
>;

export type CustomerAtomicCommand =
  | { action: 'transfer'; customerId: string; targetOwnerId: string; reason: string }
  | { action: 'release_to_pool'; customerId: string; reason: string }
  | { action: 'set_progress'; customerId: string; lifecycleStatusCode: string; reason: string }
  | { action: 'update_tags'; customerId: string; mode: 'add' | 'remove'; tagIds: string[]; reason: string }
  | { action: 'add_todo'; customerId: string; title: string; content: string; dueAt: string; executionMethod: string; reason: string }
  | { action: 'soft_delete'; customerId: string; reason: string; confirmed: true };

export type CustomerAuditOperation = CustomerAtomicCommand['action']
  | 'create_customer'
  | 'update_profile'
  | 'claim_from_pool'
  | 'add_follow_up'
  | 'create_todo'
  | 'update_todo'
  | 'complete_todo'
  | 'reopen_todo'
  | 'cancel_todo'
  | 'merge_customer_main'
  | 'merge_customer_secondary'
  | 'undo_customer_merge';

export interface CustomerAuditEventInput {
  /** Optional caller-provided correlation ID; normal single commands generate one. */
  id?: string;
  operation: CustomerAuditOperation;
  customerId: string;
  batchJobId?: string;
  actor: { id: string; name: string };
  reason: string;
  beforeSnapshot?: Customer;
  afterSnapshot?: Customer;
  idempotencyKey?: string;
  /** Never persisted; used only to derive the SHA-256 audit input hash. */
  canonicalInput?: unknown;
  result?: string;
  requestId?: string;
  ip?: string;
}

/**
 * The caller owns this transaction. Task 5 supplies the persistent appender;
 * accepting a required port here prevents a batch operation from succeeding
 * without its audit event in the same transaction.
 */
export interface CustomerAuditAppender {
  append(tx: CustomerCommandTx, input: CustomerAuditEventInput): Promise<{ id: string }>;
}

export interface CustomerAtomicCommandContext {
  tx: CustomerCommandTx;
  access: CustomerAccessContext;
  actor: { id: string; name: string };
  /** The current role directory is supplied by the caller's transaction. */
  roles?: Role[];
  idempotencyKey?: string;
  requestId?: string;
  ip?: string;
  batchJobId?: string;
  /** Frozen top-level BusinessRecord.updatedAt used by background batch jobs. */
  expectedUpdatedAt?: string;
}

export interface CustomerAtomicCommandResult {
  operationId: string;
  customer: Customer;
  beforeSnapshot: Customer;
  afterSnapshot: Customer;
  cancelledTodoCount: number;
  reassignedTodoCount: number;
  createdTodoId?: string;
}

type LockedBusinessRecord = {
  id: string;
  domain: string;
  recordId: string;
  data: unknown;
};

type LockedLeadRecord = {
  id: string;
  data: unknown;
};

type LockedAppStorage = {
  key: string;
  value: unknown;
};

type CommandOptions = {
  now?: () => Date;
  createId?: () => string;
  contactIdentityCrypto?: ContactIdentityCrypto;
};

type CommandContext = {
  scope: DataVisibilityScope;
  customerAccess?: CustomerAccessContext;
  users: ReturnType<typeof mapPrismaUser>[];
  roles: ReturnType<typeof mapPrismaRole>[];
  actor?: ReturnType<typeof mapPrismaUser>;
};

function cleanText(value: unknown): string {
  return String(value || '').trim();
}

function readJson<T>(value: unknown): T {
  return (typeof value === 'string' ? JSON.parse(value) : value) as T;
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function nullableText(value: unknown): string | null {
  const text = cleanText(value);
  return text || null;
}

function commandActor(context: CommandContext, user: AuthenticatedUser): string {
  return cleanText(context.actor?.name) || cleanText(user.name) || cleanText(user.account) || '系统';
}

function hasLeadConvertPermission(user: AuthenticatedUser): boolean {
  return hasPermission(user, PERMISSION_KEYS.LEADS_CONVERT, 'write');
}

const CUSTOMER_MUTATION_PERMISSION_ACTION = new Map<string, string>([
  [PERMISSION_KEYS.CUSTOMER_EDIT_PROFILE, 'write'],
  [PERMISSION_KEYS.CUSTOMER_SET_PROGRESS, 'write'],
  [PERMISSION_KEYS.CUSTOMER_SET_TAGS, 'write'],
  [PERMISSION_KEYS.CUSTOMER_EDIT_ATTRIBUTION, 'write'],
  [PERMISSION_KEYS.CUSTOMER_TRANSFER, 'write'],
  [PERMISSION_KEYS.CUSTOMER_RELEASE_TO_POOL, 'write'],
  [PERMISSION_KEYS.CUSTOMER_PUBLIC_POOL_CLAIM, 'write'],
  [PERMISSION_KEYS.CUSTOMER_DELETE, 'delete'],
]);

function preflightCustomerAccess(user: AuthenticatedUser): CustomerAccessContext {
  const grantedPermissions = new Set<string>();
  for (const [permissionKey, action] of CUSTOMER_MUTATION_PERMISSION_ACTION) {
    if (hasExplicitPermission(user, permissionKey, action)) grantedPermissions.add(permissionKey);
  }
  return {
    actorId: user.id,
    actorName: user.name || user.account,
    readableUserIds: new Set(),
    legacyReadableNames: new Set(),
    manageableOwnerIds: new Set(),
    canReadPublicPool: false,
    canReadCustomerList: false,
    grantedPermissions,
  };
}

function permissionError(operation: () => void): string | null {
  try {
    operation();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : '无权操作客户';
  }
}

function canMutateLead(
  lead: Lead,
  context: CommandContext,
  currentUser: AuthenticatedUser,
): boolean {
  if (lead.deletedAt) return false;
  const { scope } = context;
  if (scope.unrestricted) return true;
  const actor = context.actor;
  const isUnassigned = !cleanText(lead.assignedTo)
    && ['待分配', '公海', ''].includes(cleanText(lead.owner));
  if (
    isUnassigned
    && actor?.id === currentUser.id
    && lead.inputBy === actor.name
    && canReceiveLead(actor, context.roles)
  ) {
    return true;
  }
  return Boolean(
    (lead.owner && scope.visibleUserNames.includes(lead.owner))
    || (lead.assignedTo && scope.visibleUserNames.includes(lead.assignedTo)),
  );
}

function activeUsersNamed(context: CommandContext, name: string) {
  return context.users.filter((user) => (
    user.name === name
    && user.isActive
    && (user.employmentStatus || 'active') === 'active'
  ));
}

function assignedLeadOwnerName(lead: Lead): string {
  const assignedTo = cleanText(lead.assignedTo);
  if (assignedTo && !['待分配', '公海'].includes(assignedTo)) return assignedTo;
  const owner = cleanText(lead.owner);
  return owner && !['待分配', '公海'].includes(owner) ? owner : '';
}

function phoneIdentityCandidates(value: unknown): string[] {
  const raw = cleanText(value);
  const stored = normalizePhoneForStorage(raw);
  const normalized = normalizePhoneForComparison(raw);
  const candidates = new Set([raw, stored, normalized].filter(Boolean));
  if (normalized.startsWith('+86') && normalized.length === 14) {
    candidates.add(normalized.slice(3));
  }
  return Array.from(candidates);
}

function normalizedWechat(value: unknown): string {
  return cleanText(value).toLowerCase();
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function finiteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeLeadFlowConfig(value: unknown): LeadFlowConfig {
  const input = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<LeadFlowConfig>
    : {};
  return {
    id: cleanText(input.id) || DEFAULT_LEAD_FLOW_CONFIG.id,
    uniqueKeyMode: 'phone_or_wechat',
    interceptionEnabled: booleanValue(input.interceptionEnabled, DEFAULT_LEAD_FLOW_CONFIG.interceptionEnabled),
    autoAssignEnabled: booleanValue(input.autoAssignEnabled, DEFAULT_LEAD_FLOW_CONFIG.autoAssignEnabled),
    autoClaimAfterAssignmentEnabled: booleanValue(
      input.autoClaimAfterAssignmentEnabled,
      DEFAULT_LEAD_FLOW_CONFIG.autoClaimAfterAssignmentEnabled,
    ),
    assignmentMode: 'round_robin',
    participantUserIds: Array.isArray(input.participantUserIds)
      ? input.participantUserIds.filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))
      : [...DEFAULT_LEAD_FLOW_CONFIG.participantUserIds],
    dailyLimitEnabled: booleanValue(input.dailyLimitEnabled, DEFAULT_LEAD_FLOW_CONFIG.dailyLimitEnabled),
    dailyLimit: Math.max(0, finiteNumber(input.dailyLimit, DEFAULT_LEAD_FLOW_CONFIG.dailyLimit)),
    lastAssignedIndex: finiteNumber(input.lastAssignedIndex, DEFAULT_LEAD_FLOW_CONFIG.lastAssignedIndex),
    updatedAt: cleanText(input.updatedAt) || DEFAULT_LEAD_FLOW_CONFIG.updatedAt,
  };
}

async function lockStorageValue<T>(
  tx: CustomerCommandTx,
  key: string,
  fallback: T,
): Promise<T> {
  await tx.appStorage.upsert({
    where: { key },
    update: {},
    create: { key, value: jsonValue(fallback) },
  });
  const rows = await tx.$queryRaw<LockedAppStorage[]>(Prisma.sql`
    SELECT \`key\`, value
    FROM app_storage
    WHERE \`key\` = ${key}
    FOR UPDATE
  `);
  return rows[0] ? readJson<T>(rows[0].value) : fallback;
}

async function persistStorageValue(tx: CustomerCommandTx, key: string, value: unknown): Promise<void> {
  await tx.appStorage.upsert({
    where: { key },
    update: { value: jsonValue(value) },
    create: { key, value: jsonValue(value) },
  });
}

function customerActivity(
  id: string,
  nowIso: string,
  operator: string,
  title: string,
  content: string | undefined,
  changes: CustomerActivityRecord['changes'],
): CustomerActivityRecord {
  return {
    id,
    type: 'transfer',
    title,
    content,
    operator,
    createdAt: nowIso,
    changes,
  };
}

function leadHistory(
  id: string,
  nowIso: string,
  operator: string,
  summary: string,
  changes: NonNullable<LeadChangeLog['changes']>,
): LeadChangeLog {
  return {
    id,
    action: 'update',
    operator,
    changedAt: nowIso,
    summary,
    changes,
  };
}

async function lockLead(tx: CustomerCommandTx, leadId: string): Promise<LockedLeadRecord | null> {
  const rows = await tx.$queryRaw<LockedLeadRecord[]>(Prisma.sql`
    SELECT id, data
    FROM lead_records
    WHERE id = ${leadId}
    LIMIT 1
    FOR UPDATE
  `);
  return rows[0] || null;
}

async function findCustomerContactCollision(
  tx: CustomerCommandTx,
  contact: Pick<Lead, 'phone' | 'wechat'>,
  excludeCustomerId?: string,
): Promise<LockedBusinessRecord | null> {
  const conditions: Prisma.Sql[] = [];
  const phoneCandidates = phoneIdentityCandidates(contact.phone);
  const normalizedPhone = normalizePhoneForComparison(contact.phone);
  const wechat = normalizedWechat(contact.wechat);
  if (phoneCandidates.length) {
    conditions.push(Prisma.sql`JSON_UNQUOTE(JSON_EXTRACT(data, '$.phone')) IN (${Prisma.join(phoneCandidates)})`);
  }
  if (normalizedPhone.startsWith('+86') && normalizedPhone.length === 14) {
    conditions.push(Prisma.sql`
      RIGHT(
        REGEXP_REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(data, '$.phone')), ''), '[^0-9]', ''),
        11
      ) = ${normalizedPhone.slice(3)}
    `);
  }
  if (wechat) {
    conditions.push(Prisma.sql`LOWER(TRIM(JSON_UNQUOTE(JSON_EXTRACT(data, '$.wechat')))) = ${wechat}`);
  }
  if (!conditions.length) return null;

  const rows = await tx.$queryRaw<LockedBusinessRecord[]>(Prisma.sql`
    SELECT id, domain, recordId, data
    FROM business_records
    WHERE domain = ${STORAGE_KEYS.CUSTOMERS}
      ${excludeCustomerId ? Prisma.sql`AND recordId <> ${excludeCustomerId}` : Prisma.empty}
      AND (
        JSON_EXTRACT(data, '$.deletedAt') IS NULL
        OR JSON_TYPE(JSON_EXTRACT(data, '$.deletedAt')) = 'NULL'
      )
      AND (${Prisma.join(conditions, ' OR ')})
    LIMIT 1
  `);
  return rows[0] || null;
}

function contactLockKeys(
  contact: Pick<Lead, 'phone' | 'wechat'>,
  cryptoInput?: ContactIdentityCrypto,
): string[] {
  const crypto = cryptoInput || createContactIdentityCryptoFromEnv();
  const identities = [
    ['phone', normalizeContactIdentity('phone', String(contact.phone || ''))],
    ['wechat', normalizeContactIdentity('wechat', String(contact.wechat || ''))],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
  return identities
    .map(([kind, value]) => {
      const digest = hashContactIdentity(value, crypto.hmacKey);
      return `aaos_contact_lock_v${crypto.keyVersion}_${kind}_${digest}`;
    })
    .sort();
}

async function lockCustomerContacts(
  tx: CustomerCommandTx,
  crypto: ContactIdentityCrypto | undefined,
  ...contacts: Array<Pick<Lead, 'phone' | 'wechat'>>
): Promise<void> {
  const keys = Array.from(new Set(contacts.flatMap((contact) => contactLockKeys(contact, crypto)))).sort();
  for (const key of keys) {
    await tx.appStorage.upsert({
      where: { key },
      update: { value: { kind: 'customer_contact_lock' } },
      create: { key, value: { kind: 'customer_contact_lock' } },
    });
    await tx.$queryRaw(Prisma.sql`
      SELECT \`key\`
      FROM app_storage
      WHERE \`key\` = ${key}
      FOR UPDATE
    `);
  }
}

async function commandContext(
  tx: CustomerCommandTx,
  currentUser: AuthenticatedUser,
  domain: 'customers' | 'leads',
): Promise<CommandContext> {
  const [userRows, roleRows, departmentRows] = await Promise.all([
    tx.user.findMany(),
    tx.role.findMany({ where: { isActive: true } }),
    tx.department.findMany(),
  ]);
  const users = userRows.map(mapPrismaUser);
  const roles = roleRows.map(mapPrismaRole);
  const departments = departmentRows.map(mapPrismaDepartment);
  const actor = users.find((user) => (
    user.id === currentUser.id
    && user.isActive
    && (user.employmentStatus || 'active') === 'active'
  ));
  return {
    users,
    roles,
    actor,
    scope: buildDataVisibilityScopeForUser(actor, users, roles, departments, domain),
    // Lead-to-customer writes need the customer read policy as well so any
    // identity conflict detail is filtered through the exact same scope model.
    customerAccess: buildCustomerAccessContextFromDirectory(currentUser, users, roles, departments),
  };
}

function isLinkedLead(lead: Lead, customer: Customer): boolean {
  if (lead.customerId === customer.id) return true;
  if (lead.phone && customer.phone && normalizePhoneForComparison(lead.phone) === normalizePhoneForComparison(customer.phone)) {
    return true;
  }
  return Boolean(
    lead.wechat
    && customer.wechat
    && normalizedWechat(lead.wechat) === normalizedWechat(customer.wechat),
  );
}

async function linkedLeadRows(tx: CustomerCommandTx, customer: Customer) {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`JSON_UNQUOTE(JSON_EXTRACT(data, '$.customerId')) = ${customer.id}`,
  ];
  const phoneCandidates = phoneIdentityCandidates(customer.phone);
  if (phoneCandidates.length) {
    conditions.push(Prisma.sql`phone IN (${Prisma.join(phoneCandidates)})`);
  }
  const normalizedPhone = normalizePhoneForComparison(customer.phone);
  if (normalizedPhone.startsWith('+86') && normalizedPhone.length === 14) {
    conditions.push(Prisma.sql`
      RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', ''), 11) = ${normalizedPhone.slice(3)}
    `);
  }
  const wechat = normalizedWechat(customer.wechat);
  if (wechat) conditions.push(Prisma.sql`LOWER(TRIM(wechat)) = ${wechat}`);

  const rows = await tx.$queryRaw<LockedLeadRecord[]>(Prisma.sql`
    SELECT id, data
    FROM lead_records
    WHERE ${Prisma.join(conditions, ' OR ')}
    FOR UPDATE
  `);
  return rows.filter((row) => isLinkedLead(readJson<Lead>(row.data), customer));
}

/**
 * Batch-safe association lookup: unlike the legacy compatibility helper above,
 * this deliberately follows only the stable customerId relation.
 */
async function lockedLeadRowsByStableCustomerId(tx: CustomerCommandTx, customerId: string) {
  return tx.$queryRaw<LockedLeadRecord[]>(Prisma.sql`
    SELECT id, data
    FROM lead_records
    WHERE JSON_UNQUOTE(JSON_EXTRACT(data, '$.customerId')) = ${customerId}
    FOR UPDATE
  `);
}

async function persistCustomer(
  tx: CustomerCommandTx,
  snapshot: CustomerRecordSnapshot,
  customer: Customer,
  now: Date,
) {
  return createCustomerBusinessRecordRepository(tx).compareAndSave(snapshot, customer, now);
}

async function persistLead(tx: CustomerCommandTx, rowId: string, lead: Lead, now: Date) {
  return tx.leadRecord.update({
    where: { id: rowId },
    data: {
      name: lead.name,
      company: nullableText(lead.company),
      phone: nullableText(lead.phone),
      wechat: nullableText(lead.wechat),
      source: nullableText(lead.source),
      status: nullableText(lead.status),
      lifecycleStatusCode: nullableText(lead.lifecycleStatusCode),
      owner: nullableText(lead.owner),
      assignedTo: nullableText(lead.assignedTo),
      inputBy: nullableText(lead.inputBy),
      leadContributorId: nullableText(lead.leadContributorId),
      data: jsonValue(lead),
      updatedAt: now,
    },
  });
}

const CUSTOMER_EDIT_FIELDS: Array<{ field: keyof Customer; label: string }> = [
  { field: 'name', label: '姓名' },
  { field: 'company', label: '公司' },
  { field: 'phone', label: '电话' },
  { field: 'wechat', label: '微信' },
  { field: 'customerLevel', label: '客户等级' },
  { field: 'lifecycleStatusCode', label: '客户进展' },
  { field: 'leadContributorId', label: '线索贡献人' },
  { field: 'leadContributorName', label: '线索贡献人' },
  { field: 'leadSource', label: '线索来源' },
  { field: 'industry', label: '行业' },
  { field: 'city', label: '城市' },
  { field: 'manualTagIds', label: '客户标签' },
  { field: 'remark', label: '备注' },
  { field: 'sourceType', label: '资源归属' },
  { field: 'sourceName', label: '来源名称' },
  { field: 'sourceAccount', label: '来源账号' },
  { field: 'originalSalesTransferBy', label: '原销转人员' },
  { field: 'score', label: '线索评分' },
];

function editableCustomerPatch(input: Partial<Customer>): Partial<Customer> {
  return CUSTOMER_EDIT_FIELDS.reduce<Partial<Customer>>((patch, { field }) => {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      (patch as Record<string, unknown>)[field] = input[field];
    }
    return patch;
  }, {});
}

function activityValue(value: unknown): string | number | boolean | null {
  if (Array.isArray(value)) return value.filter(Boolean).join('、') || null;
  if (value === undefined || value === '') return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value);
}

function buildCustomerEditChanges(customer: Customer, patch: Partial<Customer>) {
  return CUSTOMER_EDIT_FIELDS
    .filter(({ field }) => Object.prototype.hasOwnProperty.call(patch, field))
    .map(({ field, label }) => ({
      field: String(field),
      label,
      oldValue: activityValue(customer[field]),
      newValue: activityValue(patch[field]),
    }))
    .filter((change) => change.oldValue !== change.newValue);
}

function isCanonicalPublicPoolCustomer(customer: Customer): boolean {
  return customer.lifecycleStatusCode === LIFECYCLE_STATUS_CODES.PUBLIC_POOL
    && customer.ownerIdentityStatus === 'public_pool'
    && !customer.ownerId;
}

function syncLeadFromCustomer(lead: Lead, customer: Customer, atIso: string, operator: string): Lead {
  const isPublicPool = isCanonicalPublicPoolCustomer(customer);
  const patch: Partial<Lead> = {
    customerId: customer.id,
    name: customer.name,
    company: customer.company,
    phone: customer.phone,
    wechat: customer.wechat,
    industry: customer.industry,
    city: customer.city,
    owner: customer.owner,
    ownerId: customer.ownerId,
    assignedTo: isPublicPool ? undefined : customer.owner,
    assignedToId: isPublicPool ? undefined : customer.ownerId,
    inputBy: customer.leadInputBy,
    leadContributorId: customer.leadContributorId,
    leadContributorName: customer.leadContributorName,
    source: customer.leadSource || lead.source,
    sourceType: normalizeResourceOwnership(customer.sourceType),
    sourceName: customer.sourceName,
    sourceAccount: customer.sourceAccount,
    tags: customer.tags,
    remark: customer.remark,
    score: customer.score,
  };
  const changes = Object.entries(patch)
    .map(([field, nextValue]) => ({
      field,
      label: field,
      oldValue: activityValue((lead as unknown as Record<string, unknown>)[field]),
      newValue: activityValue(nextValue),
    }))
    .filter((change) => change.oldValue !== change.newValue);
  if (!changes.length) return lead;
  return {
    ...lead,
    ...patch,
    assignedAt: patch.assignedTo !== lead.assignedTo ? atIso : lead.assignedAt,
    changeHistory: [
      leadHistory(newIdForSync('hist'), atIso, operator, '客户资料同步', changes),
      ...(lead.changeHistory || []),
    ],
    updatedAt: atIso,
  };
}

function newIdForSync(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

const LEAD_EDIT_FIELDS: Array<{ field: keyof Lead; label: string }> = [
  { field: 'name', label: '姓名' },
  { field: 'company', label: '公司' },
  { field: 'phone', label: '手机号' },
  { field: 'wechat', label: '微信' },
  { field: 'source', label: '线索来源' },
  { field: 'sourceName', label: '来源明细' },
  { field: 'sourceType', label: '资源归属' },
  { field: 'industry', label: '行业' },
  { field: 'city', label: '城市' },
  { field: 'leadContributorId', label: '线索贡献人' },
  { field: 'leadContributorName', label: '线索贡献人' },
  { field: 'remark', label: '备注' },
  { field: 'email', label: '邮箱' },
  { field: 'estimatedAmount', label: '预估金额' },
  { field: 'estimatedProductId', label: '预估产品' },
];

function stripLeadTags<T extends object>(input: T): T {
  const cleaned = { ...input } as Record<string, unknown>;
  delete cleaned.manualTagIds;
  delete cleaned.tags;
  return cleaned as T;
}

function editableLeadPatch(input: Partial<Lead>): Partial<Lead> {
  return LEAD_EDIT_FIELDS.reduce<Partial<Lead>>((patch, { field }) => {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      (patch as Record<string, unknown>)[field] = input[field];
    }
    return patch;
  }, {});
}

function buildLeadEditChanges(lead: Lead, patch: Partial<Lead>) {
  return LEAD_EDIT_FIELDS
    .filter(({ field }) => Object.prototype.hasOwnProperty.call(patch, field))
    .map(({ field, label }) => ({
      field: String(field),
      label,
      oldValue: activityValue(lead[field]),
      newValue: activityValue(patch[field]),
    }))
    .filter((change) => change.oldValue !== change.newValue);
}

async function findLeadContactCollision(
  tx: CustomerCommandTx,
  contact: Pick<Lead, 'phone' | 'wechat'>,
  excludeLeadId: string,
): Promise<LockedLeadRecord | null> {
  const conditions: Prisma.Sql[] = [];
  const phoneCandidates = phoneIdentityCandidates(contact.phone);
  const normalizedPhone = normalizePhoneForComparison(contact.phone);
  const wechat = normalizedWechat(contact.wechat);
  if (phoneCandidates.length) conditions.push(Prisma.sql`phone IN (${Prisma.join(phoneCandidates)})`);
  if (normalizedPhone.startsWith('+86') && normalizedPhone.length === 14) {
    conditions.push(Prisma.sql`
      RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', ''), 11) = ${normalizedPhone.slice(3)}
    `);
  }
  if (wechat) conditions.push(Prisma.sql`LOWER(TRIM(wechat)) = ${wechat}`);
  if (!conditions.length) return null;
  const rows = await tx.$queryRaw<LockedLeadRecord[]>(Prisma.sql`
    SELECT id, data
    FROM lead_records
    WHERE id <> ${excludeLeadId}
      AND (
        JSON_EXTRACT(data, '$.deletedAt') IS NULL
        OR JSON_TYPE(JSON_EXTRACT(data, '$.deletedAt')) = 'NULL'
      )
      AND (${Prisma.join(conditions, ' OR ')})
    LIMIT 1
  `);
  return rows[0] || null;
}

function canEditLeadProfileOnServer(lead: Lead): boolean {
  return !lead.customerId
    && normalizeLifecycleStatusCode(lead.lifecycleStatusCode || lead.lifecycleStatus || lead.status)
      === LIFECYCLE_STATUS_CODES.PENDING_FOLLOWUP;
}

function requireAtomicReason(reason: string): string {
  const normalized = cleanText(reason);
  if (!normalized) throw new Error('操作原因不能为空');
  return normalized;
}

function atomicActivity(
  command: CustomerAtomicCommand,
  actor: { name: string },
  at: Date,
): CustomerActivityRecord {
  const labels: Record<CustomerAtomicCommand['action'], string> = {
    transfer: '转让了客户',
    release_to_pool: '释放客户至公海',
    set_progress: '更新了客户进展',
    update_tags: '更新了客户标签',
    add_todo: '新建了客户待办',
    soft_delete: '删除了客户',
  };
  return {
    id: `activity-${randomUUID()}`,
    type: command.action === 'add_todo' ? 'todo' : command.action === 'set_progress' || command.action === 'update_tags' ? 'update' : 'transfer',
    title: labels[command.action],
    content: command.reason,
    operator: actor.name,
    createdAt: at.toISOString(),
  };
}

/**
 * Executes one phase-one batch-able customer mutation inside a transaction
 * supplied by the caller. It intentionally never starts a transaction itself:
 * the batch worker owns the job-item/customer/audit atomic boundary.
 */
export function createCustomerAtomicCommandService(options: {
  auditAppender: CustomerAuditAppender;
  now?: () => Date;
  createId?: () => string;
}) {
  if (!options.auditAppender || typeof options.auditAppender.append !== 'function') {
    throw new Error('CustomerAuditAppender 为必填依赖');
  }
  const now = () => options.now?.() || new Date();
  const createId = (prefix: string) => `${prefix}-${options.createId?.() || randomUUID()}`;

  return {
    async execute(
      command: CustomerAtomicCommand,
      context: CustomerAtomicCommandContext,
    ): Promise<CustomerAtomicCommandResult> {
      const reason = requireAtomicReason(command.reason);
      const tx = context.tx;
      if (command.action === 'soft_delete') await lockContactIdentityMutationGate(tx);
      await lockCustomerAssociationScope(tx, [command.customerId]);
      const repository = createCustomerBusinessRecordRepository(tx);
      const snapshot = await repository.lockById(command.customerId);
      if (!snapshot || snapshot.customer.deletedAt) throw new Error('客户不存在');
      if (context.expectedUpdatedAt) {
        const expected = new Date(context.expectedUpdatedAt);
        if (
          Number.isNaN(expected.getTime())
          || expected.getTime() !== snapshot.businessRecordUpdatedAt.getTime()
        ) {
          throw new CustomerWriteConflictError();
        }
      }
      const liveActor = await (tx as any).user.findUnique({ where: { id: context.actor.id } });
      if (!liveActor || !liveActor.isActive || (liveActor.employmentStatus || 'active') !== 'active') {
        throw new Error('当前用户不存在或已离职');
      }
      const actor = { id: liveActor.id, name: liveActor.name };
      const beforeSnapshot = structuredClone(snapshot.customer);
      const customer = snapshot.customer;
      const permissionAction: CustomerMutationAction = command.action;
      assertCustomerActionPermission(context.access, permissionAction);
      assertCanManageCustomer(context.access, customer);

      const canonicalInput = canonicalAtomicCommandInput(command);
      const appendAudit = (afterSnapshot: Customer, result = 'succeeded') => options.auditAppender.append(tx, {
        operation: command.action,
        customerId: customer.id,
        batchJobId: context.batchJobId,
        actor,
        reason,
        beforeSnapshot,
        afterSnapshot,
        idempotencyKey: context.idempotencyKey,
        canonicalInput,
        result,
        requestId: context.requestId,
        ip: context.ip,
      });
      const noOpResult = async (): Promise<CustomerAtomicCommandResult> => {
        const audit = await appendAudit(beforeSnapshot, 'noop');
        return {
          operationId: audit.id,
          customer,
          beforeSnapshot,
          afterSnapshot: beforeSnapshot,
          cancelledTodoCount: 0,
          reassignedTodoCount: 0,
        };
      };

      // Releasing an already-public customer has historically been an
      // idempotent no-op. Authorization intentionally happened first, then
      // the request remains write-free while retaining its audit record.
      if (command.action === 'release_to_pool' && isCanonicalPublicPoolCustomer(customer)) {
        return noOpResult();
      }

      const at = now();
      const atIso = at.toISOString();
      let next: Customer = { ...customer };
      let cancelledTodoCount = 0;
      let reassignedTodoCount = 0;
      let createdTodoId: string | undefined;
      const todos = (tx as any).customerTodo;

      if (command.action === 'transfer') {
        const target = await (tx as any).user.findUnique({ where: { id: command.targetOwnerId } });
        if (!target || !target.isActive || (target.employmentStatus || 'active') !== 'active') {
          throw new Error('目标销售不存在或已离职');
        }
        if (!context.roles || !canReceiveLead(target, context.roles)) {
          throw new Error('目标员工不可接收转让客户');
        }
        if (!context.access.manageableOwnerIds.has(target.id)) throw new Error('无权跨数据范围转让客户');
        if (customer.ownerId === target.id && customer.lifecycleStatusCode !== LIFECYCLE_STATUS_CODES.PUBLIC_POOL) {
          // Preserve legacy same-owner idempotency while recording the request
          // in the same transaction: do not add activity or touch todos.
          return noOpResult();
        }
        const fromPool = isCanonicalPublicPoolCustomer(customer);
        next = {
          ...next,
          owner: target.name, ownerId: target.id, ownerIdentityStatus: 'resolved', previousOwner: customer.owner,
          assignedBy: actor.name, assignedAt: atIso, assignmentReason: reason, ownerSince: atIso,
          ...(fromPool ? { lifecycleStatusCode: LIFECYCLE_STATUS_CODES.PENDING_FOLLOWUP, lifecycleStatusUpdatedAt: atIso } : {}),
        };
        const result = await todos.updateMany({
          where: { customerId: customer.id, status: 'PENDING' },
          data: { assigneeId: target.id, assigneeName: target.name },
        });
        reassignedTodoCount = result.count;
      } else if (command.action === 'release_to_pool') {
        next = {
          ...next,
          owner: '公海', ownerId: undefined, ownerIdentityStatus: 'public_pool',
          previousOwner: customer.owner === '公海' ? customer.previousOwner : customer.owner,
          lifecycleStatusCode: LIFECYCLE_STATUS_CODES.PUBLIC_POOL,
          lifecycleStatusUpdatedAt: atIso, publicPoolAt: atIso, releasedBy: actor.name, releaseReason: reason,
        };
        const result = await todos.updateMany({
          where: { customerId: customer.id, status: 'PENDING' },
          data: { status: 'CANCELED', canceledAt: at, canceledById: actor.id, canceledByName: actor.name, cancelReason: reason },
        });
        cancelledTodoCount = result.count;
      } else if (command.action === 'set_progress') {
        const stored = await lockStorageValue(tx, STORAGE_KEYS.LIFECYCLE_STATUS_CONFIGS, DEFAULT_LIFECYCLE_STATUS_CONFIGS);
        const lifecycleConfig = normalizeCustomerLifecycleConfig(stored);
        const currentLifecycleCode = normalizeCustomerLifecycleValue(customer.lifecycleStatusCode)
          || LIFECYCLE_STATUS_CODES.PENDING_FOLLOWUP;
        const targetLifecycleCode = normalizeCustomerLifecycleValue(command.lifecycleStatusCode);
        if (!targetLifecycleCode) throw new Error('客户进展不能为空');
        assertLifecycleTransition({
          from: currentLifecycleCode,
          to: targetLifecycleCode,
          config: lifecycleConfig,
        });
        next = {
          ...next,
          lifecycleStatusCode: targetLifecycleCode as Customer['lifecycleStatusCode'],
          lifecycleStatusUpdatedAt: atIso,
        };
      } else if (command.action === 'update_tags') {
        const catalog = await loadCustomerTagCatalog(tx, true);
        const targetIds = new Set(customer.manualTagIds || []);
        command.tagIds.forEach((tagId) => command.mode === 'add' ? targetIds.add(tagId) : targetIds.delete(tagId));
        const validation = validateManualTagUpdateSelection(catalog, 'customer', [...targetIds], customer.manualTagIds || []);
        if (!validation.ok) throw new Error(validation.message);
        next = {
          ...next,
          manualTagIds: validation.tagIds,
          tags: validation.tagIds.map((tagId) => catalog.tags.find((tag) => tag.id === tagId)!.name),
        };
      } else if (command.action === 'add_todo') {
        const title = cleanText(command.title);
        const content = cleanText(command.content);
        if (!title || title.length > 120) throw new Error('待办标题不能为空或超过120个字符');
        if (content.length > 2000) throw new Error('待办内容不能超过2000个字符');
        if (!command.dueAt || Number.isNaN(new Date(command.dueAt).getTime())) throw new Error('请选择有效的提醒时间');
        if (!new Set(['none', 'phone', 'wechat', 'visit', 'sms', 'email']).has(command.executionMethod || 'none')) throw new Error('执行方式无效');
        const todo = await todos.create({
          data: {
            id: createId('todo'), customerId: customer.id, customerName: customer.name,
            title, content: content || null,
            dueAt: new Date(command.dueAt), executionMethod: command.executionMethod || 'none',
            assigneeId: actor.id, assigneeName: actor.name,
            createdById: actor.id, createdByName: actor.name,
          },
        });
        createdTodoId = todo.id;
      } else if (command.action === 'soft_delete') {
        if (command.confirmed !== true) throw new Error('删除客户需要明确确认');
        await assertCustomerCanBeSoftDeleted(tx, customer.id);
        next = { ...next, deletedAt: atIso, deletedBy: actor.name, deleteReason: reason };
      }

      next = {
        ...next,
        activityRecords: [atomicActivity(command, actor, at), ...(next.activityRecords || [])],
        updatedAt: atIso,
      };
      await repository.compareAndSave(snapshot, next, at);
      if (command.action === 'soft_delete') {
        await endCustomerContactIdentityLinks(tx, customer.id);
      }
      if (command.action === 'transfer' || command.action === 'release_to_pool') {
        const relatedLeads = await lockedLeadRowsByStableCustomerId(tx, customer.id);
        for (const row of relatedLeads) {
          const lead = readJson<Lead>(row.data);
          const nextLead: Lead = command.action === 'transfer'
            ? {
              ...lead,
              owner: next.owner,
              ownerId: next.ownerId,
              assignedTo: next.owner,
              assignedToId: next.ownerId,
              assignedAt: atIso,
              updatedAt: atIso,
            }
            : {
              ...lead,
              owner: '公海',
              ownerId: undefined,
              assignedTo: undefined,
              assignedToId: undefined,
              assignedAt: undefined,
              lifecycleStatusCode: LIFECYCLE_STATUS_CODES.PUBLIC_POOL,
              lifecycleStatus: '流失公海',
              lifecycleStatusUpdatedAt: atIso,
              updatedAt: atIso,
            };
          await persistLead(tx, row.id, nextLead, at);
        }
      }
      const audit = await appendAudit(next);
      return {
        operationId: audit.id,
        customer: next,
        beforeSnapshot,
        afterSnapshot: next,
        cancelledTodoCount,
        reassignedTodoCount,
        ...(createdTodoId ? { createdTodoId } : {}),
      };
    },
  };
}

export type CustomerAtomicCommandMetadata = Pick<
  CustomerAtomicCommandContext,
  'idempotencyKey' | 'requestId' | 'ip' | 'batchJobId' | 'expectedUpdatedAt'
>;

/**
 * Canonical correlation input for a single command. The append layer hashes
 * this value itself, so callers cannot inject arbitrary material into a
 * persisted audit hash column.
 */
function canonicalAtomicCommandInput(command: CustomerAtomicCommand): Record<string, unknown> {
  return (() => {
    switch (command.action) {
      case 'transfer':
        return {
          action: command.action,
          customerId: cleanText(command.customerId),
          targetOwnerId: cleanText(command.targetOwnerId),
          reason: cleanText(command.reason),
        };
      case 'release_to_pool':
        return {
          action: command.action,
          customerId: cleanText(command.customerId),
          reason: cleanText(command.reason),
        };
      case 'set_progress':
        return {
          action: command.action,
          customerId: cleanText(command.customerId),
          lifecycleStatusCode: cleanText(command.lifecycleStatusCode),
          reason: cleanText(command.reason),
        };
      case 'update_tags':
        return {
          action: command.action,
          customerId: cleanText(command.customerId),
          mode: command.mode,
          tagIds: [...new Set(command.tagIds.map(cleanText).filter(Boolean))].sort(),
          reason: cleanText(command.reason),
        };
      case 'add_todo':
        return {
          action: command.action,
          customerId: cleanText(command.customerId),
          title: cleanText(command.title),
          content: cleanText(command.content),
          dueAt: cleanText(command.dueAt),
          executionMethod: cleanText(command.executionMethod),
          reason: cleanText(command.reason),
        };
      case 'soft_delete':
        return {
          action: command.action,
          customerId: cleanText(command.customerId),
          confirmed: command.confirmed === true,
          reason: cleanText(command.reason),
        };
    }
  })();
}

function toAtomicCommandFailure(error: unknown): ApiResponse<CustomerAtomicCommandResult | null> {
  const conflict = customerWriteConflictResponse<CustomerAtomicCommandResult>(error);
  if (conflict) return conflict;
  const message = error instanceof Error ? error.message : '客户操作失败';
  if (/客户不存在/.test(message)) return failure<CustomerAtomicCommandResult>(message, 404);
  if (/无权|当前用户不存在或已离职|当前用户不是/.test(message)) {
    return failure<CustomerAtomicCommandResult>(message, 403);
  }
  if (/存在关联|已被其他人领取|冲突|重复/.test(message)) {
    return failure<CustomerAtomicCommandResult>(message, 409);
  }
  if (/audit write failed|审计/.test(message)) return failure<CustomerAtomicCommandResult>('客户操作审计失败', 500);
  return failure<CustomerAtomicCommandResult>(message, 400);
}

/**
 * Production facade for the Task 4 engine. It owns exactly one Prisma
 * transaction, reloads the transaction-local access context, and gives that
 * same transaction to the audit adapter. A failed append therefore aborts all
 * customer, todo, lead, activity, and audit writes together.
 */
export function createAuditedCustomerAtomicCommandService(
  prisma: Pick<PrismaClient, '$transaction'>,
  options: {
    auditAppender: CustomerAuditAppender;
    now?: () => Date;
    createId?: () => string;
  },
) {
  const atomic = createCustomerAtomicCommandService(options);

  return {
    async execute(
      command: CustomerAtomicCommand,
      currentUser: AuthenticatedUser,
      metadata: CustomerAtomicCommandMetadata = {},
    ): Promise<ApiResponse<CustomerAtomicCommandResult | null>> {
      let lastError: unknown;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          const result = await prisma.$transaction(async (rawTx) => {
            const tx = rawTx as CustomerCommandTx;
            const context = await commandContext(tx, currentUser, 'customers');
            if (!context.actor || !context.customerAccess) throw new Error('当前用户不存在或已离职');
            return atomic.execute(command, {
              tx,
              access: context.customerAccess,
              actor: { id: context.actor.id, name: context.actor.name },
              roles: context.roles,
              ...metadata,
            });
          });
          return success(result);
        } catch (error) {
          lastError = error;
          const code = (error as { code?: string }).code;
          const message = error instanceof Error ? error.message : String(error || '');
          const retryable = code === 'P2034' || /deadlock|write conflict|1213|40001/i.test(message);
          if (!retryable || attempt === 3) return toAtomicCommandFailure(error);
        }
      }
      return toAtomicCommandFailure(lastError);
    },
  };
}

export function createCustomerCommandService(
  prisma: CustomerCommandPrisma,
  options: CommandOptions = {},
) {
  const now = () => options.now?.() || new Date();
  const newId = (prefix: string) => `${prefix}-${options.createId?.() || randomUUID().slice(0, 8)}`;
  const runTransaction = async <T>(operation: (tx: CustomerCommandTx) => Promise<T>): Promise<T> => {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await prisma.$transaction(async (rawTx) => operation(rawTx as CustomerCommandTx));
      } catch (error) {
        if (error instanceof ContactIdentityConflictError) {
          return {
            code: 409,
            data: error.safePayload.customer || null,
            message: error.safePayload.message,
          } as T;
        }
        const conflict = customerWriteConflictResponse(error);
        if (conflict) return conflict as T;
        lastError = error;
        const code = (error as { code?: string }).code;
        const message = error instanceof Error ? error.message : String(error || '');
        const retryable = code === 'P2034' || /deadlock|write conflict|1213|40001/i.test(message);
        if (!retryable || attempt === 3) throw error;
      }
    }
    throw lastError;
  };

  const transitionCustomer = async (
    customerId: string,
    currentUser: AuthenticatedUser,
    authorization: CustomerMutationAction | 'claim_from_pool',
    transition: (
      customer: Customer,
      context: CommandContext,
      at: Date,
    ) => { customer?: Customer; lead?: (lead: Lead) => Lead; error?: { code: number; message: string } },
  ) => runTransaction(async (tx) => {
    // Transfers and releases write customer-linked records.  Acquire the same
    // deterministic association lock used by deletion and batch commands so a
    // concurrent order/association writer cannot interleave with the change.
    await lockCustomerAssociationScope(tx, [customerId]);
    const snapshot = await createCustomerBusinessRecordRepository(tx).lockById(customerId);
    if (!snapshot) return failure<Customer>('客户不存在', 404);
    const customer = snapshot.customer;
    if (customer.deletedAt) return failure<Customer>('客户不存在', 404);

    const context = await commandContext(tx, currentUser, 'customers');
    if (!context.actor || !context.customerAccess) return failure<Customer>('当前用户不存在或已离职', 403);
    const authorizationError = permissionError(() => {
      if (authorization === 'claim_from_pool') {
        assertCustomerClaimPermission(context.customerAccess!);
      } else {
        assertCustomerActionPermission(context.customerAccess!, authorization);
        assertCanManageCustomer(context.customerAccess!, customer);
      }
    });
    if (authorizationError) return failure<Customer>(authorizationError, 403);

    const at = now();
    const result = transition(customer, context, at);
    if (result.error) return failure<Customer>(result.error.message, result.error.code);
    if (!result.customer || !result.lead) return success(customer);

    await persistCustomer(tx, snapshot, result.customer, at);
    if (authorization === 'transfer') {
      await tx.customerTodo.updateMany({
        where: { customerId: customer.id, status: 'PENDING' },
        data: { assigneeId: result.customer.ownerId, assigneeName: result.customer.owner },
      });
    } else if (authorization === 'release_to_pool') {
      await tx.customerTodo.updateMany({
        where: { customerId: customer.id, status: 'PENDING' },
        data: {
          status: 'CANCELED',
          canceledAt: at,
          canceledById: context.actor.id,
          canceledByName: context.actor.name,
          cancelReason: result.customer.releaseReason || '客户释放至公海',
        },
      });
    }
    const leadRows = authorization === 'transfer' || authorization === 'release_to_pool'
      ? await lockedLeadRowsByStableCustomerId(tx, customer.id)
      : await linkedLeadRows(tx, customer);
    for (const leadRow of leadRows) {
      await persistLead(tx, leadRow.id, result.lead(readJson<Lead>(leadRow.data)), at);
    }
    const operation: CustomerAuditOperation = authorization === 'claim_from_pool'
      ? 'claim_from_pool'
      : authorization;
    const reason = operation === 'claim_from_pool'
      ? result.customer.assignmentReason || '从公海领取'
      : operation === 'release_to_pool'
        ? result.customer.releaseReason || '释放客户至公海'
        : result.customer.assignmentReason || '调整客户负责人';
    await appendCustomerAuditEvent(tx, {
      operation,
      customerId: customer.id,
      actor: { id: context.actor.id, name: context.actor.name },
      reason,
      beforeSnapshot: customer,
      afterSnapshot: result.customer,
      canonicalInput: {
        operation,
        customerId: customer.id,
        nextOwnerId: result.customer.ownerId || null,
        reason,
      },
    });
    return success(result.customer);
  });

  return {
    async updateCustomer(customerId: string, input: Partial<Customer>, currentUser: AuthenticatedUser) {
      const submittedPatch = editableCustomerPatch(input);
      const preflightError = permissionError(() => (
        assertCustomerFieldPermissions(
          preflightCustomerAccess(currentUser),
          submittedPatch as Record<string, unknown>,
        )
      ));
      if (preflightError) return failure<Customer>(preflightError, 403);
      return runTransaction(async (tx) => {
        await lockContactIdentityMutationGate(tx);
        // Serialize every association writer/checker before observing whether a
        // delete is safe; otherwise a new order could slip in after the check.
        await lockCustomerAssociationScope(tx, [customerId]);
        const snapshot = await createCustomerBusinessRecordRepository(tx).lockById(customerId);
        if (!snapshot) return failure<Customer>('客户不存在', 404);
        const customer = snapshot.customer;
        if (customer.deletedAt) return failure<Customer>('客户不存在', 404);
        const context = await commandContext(tx, currentUser, 'customers');
        if (!context.actor || !context.customerAccess) return failure<Customer>('当前用户不存在或已离职', 403);
        const accessError = permissionError(() => {
          assertCustomerFieldPermissions(context.customerAccess!, submittedPatch as Record<string, unknown>);
          assertCanManageCustomer(context.customerAccess!, customer);
        });
        if (accessError) return failure<Customer>(accessError, 403);

        let patch = submittedPatch;
        const hasSubmittedLifecycleCode = Object.prototype.hasOwnProperty.call(patch, 'lifecycleStatusCode');
        const submittedLifecycleInput = hasSubmittedLifecycleCode
          ? cleanText(patch.lifecycleStatusCode)
          : undefined;
        const submittedLifecycleCode = submittedLifecycleInput
          ? normalizeCustomerLifecycleValue(submittedLifecycleInput)
          : undefined;
        if (hasSubmittedLifecycleCode && !submittedLifecycleInput) {
          return failure<Customer>('客户进展不能为空', 400);
        }
        const currentLifecycleCode = normalizeCustomerLifecycleValue(customer.lifecycleStatusCode)
          || LIFECYCLE_STATUS_CODES.PENDING_FOLLOWUP;
        const lifecycleChanged = submittedLifecycleCode !== undefined
          && submittedLifecycleCode !== currentLifecycleCode;
        if (lifecycleChanged) {
          try {
            const stored = await lockStorageValue(
              tx,
              STORAGE_KEYS.LIFECYCLE_STATUS_CONFIGS,
              DEFAULT_LIFECYCLE_STATUS_CONFIGS,
            );
            assertLifecycleTransition({
              from: currentLifecycleCode,
              to: submittedLifecycleCode,
              config: normalizeCustomerLifecycleConfig(stored),
            });
          } catch (error) {
            return failure<Customer>(error instanceof Error ? error.message : '客户进展更新失败', 400);
          }
        }
        if (submittedLifecycleCode !== undefined) {
          // Even a semantically unchanged legacy display alias is persisted as
          // the stable code, so each successful user edit gradually migrates
          // historical customer snapshots.
          patch = {
            ...patch,
            lifecycleStatusCode: submittedLifecycleCode as Customer['lifecycleStatusCode'],
          };
        }
        let tagNameById: Map<string, string> | null = null;
        if (Object.prototype.hasOwnProperty.call(input, 'manualTagIds')) {
          const catalog = await loadCustomerTagCatalog(tx, true);
          tagNameById = new Map(catalog.tags.map((tag) => [tag.id, tag.name]));
          const validation = validateManualTagUpdateSelection(catalog, 'customer', input.manualTagIds || [], customer.manualTagIds || []);
          if (!validation.ok) return failure<Customer>(validation.message, 400);
          patch.manualTagIds = validation.tagIds;
          patch.tags = validation.tagIds.map((id) => catalog.tags.find((tag) => tag.id === id)!.name);
        }
        patch = applyContactEditLock(customer, patch, {
          canEditLockedContact: context.customerAccess.grantedPermissions.has(PERMISSION_KEYS.CUSTOMER_DELETE),
        });
        if (Object.prototype.hasOwnProperty.call(patch, 'phone')) {
          patch.phone = normalizePhoneForStorage(patch.phone);
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'wechat')) {
          patch.wechat = normalizedWechat(patch.wechat) || undefined;
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'sourceType')) {
          patch.sourceType = normalizeResourceOwnership(patch.sourceType);
        }

        const merged: Customer = {
          ...customer,
          ...patch,
          sourceType: normalizeResourceOwnership(patch.sourceType || customer.sourceType),
        };
        if (
          merged.sourceType === '个人资源'
          && !cleanText(merged.leadContributorId)
          && !cleanText(merged.leadContributorName)
        ) {
          return failure<Customer>('个人资源必须填写线索贡献人', 400);
        }
        const phoneError = getPhoneNumberError(merged.phone);
        if (phoneError) return failure<Customer>(phoneError, 400);

        const changes = buildCustomerEditChanges(customer, patch);
        const tagChange = changes.find((change) => change.field === 'manualTagIds');
        if (tagChange && tagNameById) {
          tagChange.oldValue = activityValue((customer.manualTagIds || []).map((id) => tagNameById!.get(id) || '历史标签'));
          tagChange.newValue = activityValue((patch.manualTagIds || []).map((id) => tagNameById!.get(id) || '历史标签'));
        }
        if (!changes.length) return success(customer);
        const at = now();
        const atIso = at.toISOString();
        const operator = commandActor(context, currentUser);
        const updated: Customer = {
          ...merged,
          ...(lifecycleChanged ? { lifecycleStatusUpdatedAt: atIso } : {}),
          activityRecords: [{
            id: newId('act'),
            type: 'update',
            title: changes.length === 1 && tagChange ? '更新了客户标签' : `更新了 ${changes.map((change) => change.label).join('、')}`,
            operator,
            createdAt: atIso,
            changes,
          }, ...(customer.activityRecords || [])],
          updatedAt: atIso,
        };

        await lockCustomerContacts(tx, options.contactIdentityCrypto, customer, updated);
        await upsertCustomerContactIdentities(tx, {
          customerId: customer.id,
          phone: updated.phone,
          wechat: updated.wechat,
          source: 'customer_profile_update',
          crypto: options.contactIdentityCrypto,
          conflictViewer: {
            canReadCustomerList: context.customerAccess!.canReadCustomerList,
            canReadCustomer: (candidate) => canReadCustomer(context.customerAccess!, candidate),
          },
        });
        await persistCustomer(tx, snapshot, updated, at);
        const leadRows = await linkedLeadRows(tx, customer);
        for (const leadRow of leadRows) {
          const lead = readJson<Lead>(leadRow.data);
          const nextLead = syncLeadFromCustomer(lead, updated, atIso, operator);
          if (nextLead !== lead) {
            await linkLeadAndCustomerIdentity(tx, {
              leadId: leadRow.id,
              customerId: customer.id,
              phone: nextLead.phone,
              wechat: nextLead.wechat,
              source: 'customer_profile_sync',
              crypto: options.contactIdentityCrypto,
              conflictViewer: {
                canReadCustomerList: context.customerAccess!.canReadCustomerList,
                canReadCustomer: (candidate) => canReadCustomer(context.customerAccess!, candidate),
              },
            });
            await persistLead(tx, leadRow.id, nextLead, at);
          }
        }
        await appendCustomerAuditEvent(tx, {
          operation: 'update_profile',
          customerId: customer.id,
          actor: { id: context.actor.id, name: context.actor.name },
          reason: '更新客户资料',
          beforeSnapshot: customer,
          afterSnapshot: updated,
          canonicalInput: {
            operation: 'update_profile',
            customerId: customer.id,
            patch: submittedPatch,
          },
        });
        return success(updated);
      });
    },

    async deleteCustomer(customerId: string, reasonInput: string, currentUser: AuthenticatedUser) {
      const preflightError = permissionError(() => (
        assertCustomerActionPermission(preflightCustomerAccess(currentUser), 'soft_delete')
      ));
      if (preflightError) return failure<boolean>(preflightError, 403);
      return runTransaction(async (tx) => {
        await lockContactIdentityMutationGate(tx);
        // Deletion must serialize against every stable customer association
        // writer before it checks the registry and marks the customer deleted.
        await lockCustomerAssociationScope(tx, [customerId]);
        const snapshot = await createCustomerBusinessRecordRepository(tx).lockById(customerId);
        if (!snapshot) return success(true);
        const customer = snapshot.customer;
        if (customer.deletedAt) return success(true);
        const context = await commandContext(tx, currentUser, 'customers');
        if (!context.actor || !context.customerAccess) return failure<boolean>('无权删除该客户', 403);
        const accessError = permissionError(() => {
          assertCustomerActionPermission(context.customerAccess!, 'soft_delete');
          assertCanManageCustomer(context.customerAccess!, customer);
        });
        if (accessError) return failure<boolean>(accessError, 403);
        try {
          await assertCustomerCanBeSoftDeleted(tx, customer.id);
        } catch (error) {
          return failure<boolean>(error instanceof Error ? error.message : '客户存在关联业务，不能删除', 409);
        }
        const at = now();
        const atIso = at.toISOString();
        const operator = commandActor(context, currentUser);
        const reason = cleanText(reasonInput) || '业务删除';
        const deleted: Customer = {
          ...customer,
          deletedAt: atIso,
          deletedBy: operator,
          deleteReason: reason,
          updatedAt: atIso,
        };
        await persistCustomer(tx, snapshot, deleted, at);
        await endCustomerContactIdentityLinks(tx, customer.id);
        await appendCustomerAuditEvent(tx, {
          operation: 'soft_delete',
          customerId: customer.id,
          actor: { id: context.actor.id, name: context.actor.name },
          reason,
          beforeSnapshot: customer,
          afterSnapshot: deleted,
          canonicalInput: { operation: 'soft_delete', customerId: customer.id, reason },
        });
        return success(true);
      });
    },

    async createLead(
      input: Omit<Lead, 'id' | 'createdAt' | 'updatedAt' | 'followUpRecords'>,
      currentUser: AuthenticatedUser,
    ) {
      if (!hasPermission(currentUser, PERMISSION_KEYS.LEADS_CREATE, 'write')) {
        return failure<Lead>('无权新建线索', 403);
      }
      return runTransaction(async (tx) => {
        await lockContactIdentityMutationGate(tx);
        const context = await commandContext(tx, currentUser, 'leads');
        if (!context.actor) return failure<Lead>('当前用户不存在或已离职', 403);
        const cleanInput = stripLeadTags(input);
        const flowConfig = normalizeLeadFlowConfig(await lockStorageValue(
          tx,
          STORAGE_KEYS.LEAD_FLOW_CONFIG,
          DEFAULT_LEAD_FLOW_CONFIG,
        ));
        const storedIntakeRecords = await lockStorageValue<LeadIntakeRecord[]>(
          tx,
          STORAGE_KEYS.LEAD_INTAKE_RECORDS,
          [],
        );
        const intakeRecords = Array.isArray(storedIntakeRecords) ? storedIntakeRecords : [];
        const name = cleanText(input.name);
        const source = cleanText(input.source);
        const phone = normalizePhoneForStorage(input.phone);
        const wechat = normalizedWechat(input.wechat) || undefined;
        const sourceType = normalizeResourceOwnership(input.sourceType);
        const at = now();
        const atIso = at.toISOString();
        const inputBy = context.actor.name;
        const intakeBase = {
          name: name || cleanText(input.name),
          company: cleanText(input.company) || undefined,
          phone: phone || undefined,
          wechat,
          source: [source, cleanText(input.sourceName)].filter(Boolean).join('-') || undefined,
          inputBy,
          createdAt: atIso,
        };
        const recordIntake = async (record: LeadIntakeRecord) => {
          intakeRecords.unshift(record);
          await persistStorageValue(tx, STORAGE_KEYS.LEAD_INTAKE_RECORDS, intakeRecords);
        };
        const rejectIntake = async (message: string, code = 400) => {
          await recordIntake({
            id: newId('intake'),
            ...intakeBase,
            status: '入库失败',
            matchedRule: '手机号和微信二选一',
            failureReason: message,
          });
          return failure<Lead>(message, code);
        };

        if (!name) return rejectIntake('线索姓名不能为空');
        if (!source) return rejectIntake('请选择线索来源');
        if (!phone && !wechat) return rejectIntake('手机号和微信至少填写一项');
        const phoneError = getPhoneNumberError(phone);
        if (phoneError) return rejectIntake(phoneError);
        if (
          sourceType === '个人资源'
          && !cleanText(input.leadContributorId)
          && !cleanText(input.leadContributorName)
        ) {
          return rejectIntake('个人资源必须填写线索贡献人');
        }

        const requestedOwner = cleanText(input.assignedTo || input.owner);
        let owner = '待分配';
        let assignedTo: string | undefined;
        let assignedToId: string | undefined;
        let assignedAt: string | undefined;
        let assignmentRuleId: string | undefined;
        let assignmentReason = '线索自动分配未开启';
        let nextAssignedIndex = flowConfig.lastAssignedIndex;
        if (requestedOwner && requestedOwner !== '待分配') {
          if (!hasPermission(currentUser, PERMISSION_KEYS.LEADS_FLOW_CONFIG, 'write')) {
            return failure<Lead>('新建线索时指定销售需要线索分配权限', 403);
          }
          const targets = activeUsersNamed(context, requestedOwner);
          if (!targets.length || !canReceiveLead(targets[0], context.roles)) {
            return failure<Lead>('目标销售不存在、已离职或不可接收线索', 400);
          }
          if (targets.length > 1) return failure<Lead>('存在同名员工，无法确定线索归属', 409);
          if (!context.scope.unrestricted && !context.scope.visibleUserIds.includes(targets[0].id)) {
            return failure<Lead>('无权跨数据范围分配线索', 403);
          }
          owner = targets[0].name;
          assignedTo = targets[0].name;
          assignedToId = targets[0].id;
          assignedAt = atIso;
          assignmentReason = '手动指定销售';
        } else if (flowConfig.autoAssignEnabled) {
          const eligibleUsers = context.users.filter((user) => canReceiveLead(user, context.roles));
          const configuredIds = flowConfig.participantUserIds;
          const participants = configuredIds.includes('__lead_flow_no_participants__')
            ? []
            : configuredIds.length
              ? configuredIds
                .map((id) => eligibleUsers.find((user) => user.id === id))
                .filter((user): user is NonNullable<typeof user> => Boolean(user))
              : eligibleUsers;
          if (!participants.length) {
            assignmentReason = '暂无可分配销售成员';
          } else {
            const today = atIso.slice(0, 10);
            for (let step = 1; step <= participants.length; step += 1) {
              const index = ((Math.trunc(flowConfig.lastAssignedIndex) + step) % participants.length + participants.length)
                % participants.length;
              const participant = participants[index];
              const assignedToday = intakeRecords.filter((record) => (
                record.createdAt.slice(0, 10) === today && record.assignedTo === participant.name
              )).length;
              if (flowConfig.dailyLimitEnabled && assignedToday >= flowConfig.dailyLimit) continue;
              owner = participant.name;
              assignedTo = participant.name;
              assignedToId = participant.id;
              assignedAt = atIso;
              assignmentRuleId = flowConfig.id;
              assignmentReason = '顺序平均分配';
              nextAssignedIndex = index;
              break;
            }
            if (!assignedTo) assignmentReason = '今日分配上限已达';
          }
        }

        const id = newId('lead');
        let lead: Lead = {
          ...cleanInput,
          id,
          name,
          source,
          phone,
          wechat,
          sourceType,
          status: input.status || '新线索',
          owner,
          assignedTo,
          assignedToId,
          assignedAt,
          assignmentRuleId,
          inputBy,
          intakeStatus: assignedTo ? '入库成功' : '待分配',
          lifecycleStatusCode: LIFECYCLE_STATUS_CODES.PENDING_FOLLOWUP,
          lifecycleStatus: '待跟进',
          lifecycleStatusUpdatedAt: atIso,
          followUpRecords: [],
          changeHistory: [{
            id: newId('hist'),
            action: 'create',
            operator: context.actor.name,
            changedAt: atIso,
            summary: '新建线索入库',
          }],
          createdAt: atIso,
          updatedAt: atIso,
        };
        await lockCustomerContacts(tx, options.contactIdentityCrypto, lead);
        const [customerCollision, leadCollision] = flowConfig.interceptionEnabled
          ? await Promise.all([
              findCustomerContactCollision(tx, lead),
              findLeadContactCollision(tx, lead, id),
            ])
          : [null, null];
        if (customerCollision || leadCollision) {
          // Intake history is durable and may be viewed by a wider audience
          // later, so collision identity/name/id never belongs in that record.
          const message = '系统中已存在相同联系方式';
          await recordIntake({
            id: newId('intake'),
            ...intakeBase,
            status: '入库失败',
            matchedRule: '手机号和微信二选一',
            failureReason: message,
          });
          return failure<Lead>(message, 409);
        }

        if (flowConfig.autoClaimAfterAssignmentEnabled && assignedTo) {
          const customerId = newId('cust');
          const customer: Customer = {
            id: customerId,
            name: lead.name,
            company: lead.company || lead.name,
            phone: lead.phone,
            email: lead.email,
            wechat: lead.wechat,
            industry: lead.industry,
            city: lead.city,
            owner: assignedTo,
            ownerId: assignedToId,
            ownerIdentityStatus: 'resolved',
            customerLevel: 'L1',
            lifecycleStatusCode: LIFECYCLE_STATUS_CODES.FOLLOWING,
            lifecycleStatusUpdatedAt: atIso,
            totalSpent: 0,
            orderCount: 0,
            growthPath: [],
            growthRecords: [],
            activityRecords: [{
              id: newId('act'),
              type: 'create',
              title: '线索自动领取创建客户',
              content: lead.remark,
              operator: inputBy,
              relatedId: id,
              relatedType: 'lead',
              createdAt: atIso,
            }],
            manualTagIds: [],
            tags: [],
            leadInputBy: inputBy,
            leadContributorId: lead.leadContributorId,
            leadContributorName: lead.leadContributorName,
            leadSource: lead.source,
            remark: lead.remark,
            sourceType: lead.sourceType,
            sourceName: lead.sourceName,
            sourceAccount: lead.sourceAccount,
            score: lead.score,
            createdAt: atIso,
            updatedAt: atIso,
          };
          await linkLeadAndCustomerIdentity(tx, {
            // `id` is the server-generated LeadRecord primary key; no JSON
            // payload field is used for contact-identity link ownership.
            leadId: id,
            customerId,
            phone: customer.phone,
            wechat: customer.wechat,
            source: 'lead_auto_claim',
            crypto: options.contactIdentityCrypto,
            conflictViewer: {
              canReadCustomerList: Boolean(context.customerAccess?.canReadCustomerList),
              canReadCustomer: (candidate) => Boolean(
                context.customerAccess && canReadCustomer(context.customerAccess, candidate)
              ),
            },
          });
          await tx.businessRecord.create({
            data: {
              id: `${STORAGE_KEYS.CUSTOMERS}:${customerId}`,
              domain: STORAGE_KEYS.CUSTOMERS,
              recordId: customerId,
              title: customer.name || customer.company || customerId,
              status: customer.lifecycleStatusCode,
              owner: customer.owner,
              customerId,
              amount: 0,
              eventAt: at,
              data: jsonValue(customer),
            },
          });
          await appendCustomerAuditEvent(tx, {
            operation: 'create_customer',
            customerId,
            actor: { id: context.actor.id, name: context.actor.name },
            reason: '线索自动领取创建客户',
            afterSnapshot: customer,
            canonicalInput: {
              operation: 'create_customer', customerId, sourceLeadId: id,
              assignedToId: assignedToId || null, source: 'lead_auto_claim',
            },
          });
          lead = {
            ...lead,
            customerId,
            lifecycleStatusCode: LIFECYCLE_STATUS_CODES.FOLLOWING,
            lifecycleStatus: '跟进中',
            lifecycleStatusUpdatedAt: atIso,
            changeHistory: [
              leadHistory(newId('hist'), atIso, inputBy, '线索自动领取到客户库', [
                { field: 'customerId', label: '客户', oldValue: null, newValue: customerId },
                { field: 'lifecycleStatus', label: '生命周期', oldValue: '待跟进', newValue: '跟进中' },
              ]),
              ...(lead.changeHistory || []),
            ],
          };
        }
        await tx.leadRecord.create({
          data: {
            id,
            name: lead.name,
            company: nullableText(lead.company),
            phone: nullableText(lead.phone),
            wechat: nullableText(lead.wechat),
            source: nullableText(lead.source),
            status: nullableText(lead.status),
            lifecycleStatusCode: nullableText(lead.lifecycleStatusCode),
            owner: nullableText(lead.owner),
            assignedTo: nullableText(lead.assignedTo),
            inputBy: nullableText(lead.inputBy),
            leadContributorId: nullableText(lead.leadContributorId),
            data: jsonValue(lead),
            createdAt: at,
            updatedAt: at,
          },
        });
        await persistStorageValue(tx, STORAGE_KEYS.LEAD_FLOW_CONFIG, {
          ...flowConfig,
          lastAssignedIndex: nextAssignedIndex,
          updatedAt: atIso,
        });
        await recordIntake({
          id: newId('intake'),
          leadId: id,
          customerId: lead.customerId,
          ...intakeBase,
          assignedTo: lead.assignedTo,
          status: lead.intakeStatus || '待分配',
          matchedRule: assignmentReason,
        });
        return success(lead);
      });
    },

    async updateLead(leadId: string, input: Partial<Lead>, currentUser: AuthenticatedUser) {
      const canEdit = hasPermission(currentUser, PERMISSION_KEYS.LEADS_CREATE, 'write')
        || hasPermission(currentUser, PERMISSION_KEYS.LEADS_DETAIL, 'write');
      if (!canEdit) return failure<Lead>('无权编辑线索', 403);
      return runTransaction(async (tx) => {
        await lockContactIdentityMutationGate(tx);
        const row = await lockLead(tx, leadId);
        if (!row) return failure<Lead>('线索不存在', 404);
        const lead = stripLeadTags(readJson<Lead>(row.data));
        if (lead.deletedAt) return failure<Lead>('线索不存在', 404);
        const context = await commandContext(tx, currentUser, 'leads');
        if (!context.actor) return failure<Lead>('当前用户不存在或已离职', 403);
        const existingOwner = assignedLeadOwnerName(lead);
        if (existingOwner && activeUsersNamed(context, existingOwner).length > 1) {
          return failure<Lead>('线索归属姓名不唯一，请先完成归属身份清理', 409);
        }
        if (!canMutateLead(lead, context, currentUser)) return failure<Lead>('无权操作该线索', 403);
        if (!canEditLeadProfileOnServer(lead)) return failure<Lead>('仅待跟进且未转客户的线索可编辑', 409);

        let patch = editableLeadPatch(stripLeadTags(input));
        patch = applyContactEditLock(lead, patch, {
          canEditLockedContact: isSuperAdmin(currentUser),
        });
        if (Object.prototype.hasOwnProperty.call(patch, 'phone')) patch.phone = normalizePhoneForStorage(patch.phone);
        if (Object.prototype.hasOwnProperty.call(patch, 'wechat')) patch.wechat = normalizedWechat(patch.wechat) || undefined;
        if (Object.prototype.hasOwnProperty.call(patch, 'sourceType')) {
          patch.sourceType = normalizeResourceOwnership(patch.sourceType);
        }

        const merged: Lead = {
          ...lead,
          ...patch,
          sourceType: normalizeResourceOwnership(patch.sourceType || lead.sourceType),
        };
        if (
          merged.sourceType === '个人资源'
          && !cleanText(merged.leadContributorId)
          && !cleanText(merged.leadContributorName)
        ) {
          return failure<Lead>('个人资源必须填写线索贡献人', 400);
        }
        const phoneError = getPhoneNumberError(merged.phone);
        if (phoneError) return failure<Lead>(phoneError, 400);
        const changes = buildLeadEditChanges(lead, patch);
        if (!changes.length) return success(lead);

        const at = now();
        const atIso = at.toISOString();
        const operator = commandActor(context, currentUser);
        const updated: Lead = {
          ...merged,
          changeHistory: [
            leadHistory(newId('hist'), atIso, operator, `修改了${changes.map((change) => change.label).join('、')}`, changes),
            ...(lead.changeHistory || []),
          ],
          updatedAt: atIso,
        };
        await lockCustomerContacts(tx, options.contactIdentityCrypto, lead, updated);
        const [customerCollision, leadCollision] = await Promise.all([
          findCustomerContactCollision(tx, updated),
          findLeadContactCollision(tx, updated, row.id),
        ]);
        if (customerCollision || leadCollision) return failure<Lead>('手机号或微信已存在于其他客户或线索', 409);
        await upsertLeadContactIdentities(tx, {
          // The relational record id is authoritative. A stale/legacy id
          // embedded in JSON must never create an orphaned identity link.
          leadId: row.id,
          phone: updated.phone,
          wechat: updated.wechat,
          source: 'lead_profile_update',
          crypto: options.contactIdentityCrypto,
        });
        await persistLead(tx, row.id, updated, at);
        return success(updated);
      });
    },

    async addLeadFollowUp(
      leadId: string,
      input: Pick<FollowUpRecord, 'type' | 'content' | 'nextFollowUpDate'> & { createdBy?: string },
      currentUser: AuthenticatedUser,
    ) {
      if (!hasPermission(currentUser, PERMISSION_KEYS.LEADS_FOLLOW, 'write')) {
        return failure<FollowUpRecord>('无权跟进线索', 403);
      }
      const content = cleanText(input.content);
      if (!content) return failure<FollowUpRecord>('跟进内容不能为空', 400);
      const hint = await prisma.leadRecord.findUnique({ where: { id: leadId }, select: { data: true } });
      const hintedCustomerId = hint ? readJson<Lead>(hint.data).customerId : undefined;
      return runTransaction(async (tx) => {
        const customerSnapshot = hintedCustomerId
          ? await createCustomerBusinessRecordRepository(tx).lockById(hintedCustomerId)
          : null;
        const row = await lockLead(tx, leadId);
        if (!row) return failure<FollowUpRecord>('线索不存在', 404);
        const lead = readJson<Lead>(row.data);
        if (lead.deletedAt) return failure<FollowUpRecord>('线索不存在', 404);
        if (lead.customerId !== hintedCustomerId) {
          return failure<FollowUpRecord>('线索关联客户已变更，请刷新后重试', 409);
        }
        const context = await commandContext(tx, currentUser, 'leads');
        if (!context.actor || !canMutateLead(lead, context, currentUser)) {
          return failure<FollowUpRecord>('无权操作该线索', 403);
        }
        const at = now();
        const atIso = at.toISOString();
        const record: FollowUpRecord = {
          id: newId('follow'),
          leadId,
          type: input.type,
          content,
          nextFollowUpDate: cleanText(input.nextFollowUpDate) || undefined,
          createdBy: commandActor(context, currentUser),
          createdAt: atIso,
        };
        const shouldStartFollowing = !lead.lifecycleStatusCode
          || normalizeLifecycleStatusCode(lead.lifecycleStatusCode) === LIFECYCLE_STATUS_CODES.PENDING_FOLLOWUP;
        const updated: Lead = {
          ...lead,
          followUpRecords: [record, ...(lead.followUpRecords || [])],
          lifecycleStatusCode: shouldStartFollowing ? LIFECYCLE_STATUS_CODES.FOLLOWING : lead.lifecycleStatusCode,
          lifecycleStatus: shouldStartFollowing ? '跟进中' : lead.lifecycleStatus,
          lifecycleStatusUpdatedAt: shouldStartFollowing ? atIso : lead.lifecycleStatusUpdatedAt,
          updatedAt: atIso,
        };
        await persistLead(tx, row.id, updated, at);
        if (shouldStartFollowing && customerSnapshot) {
          const customer = customerSnapshot.customer;
          const updatedCustomer: Customer = {
            ...customer,
            lifecycleStatusCode: LIFECYCLE_STATUS_CODES.FOLLOWING,
            lifecycleStatusUpdatedAt: atIso,
            updatedAt: atIso,
          };
          await persistCustomer(tx, customerSnapshot, updatedCustomer, at);
          await appendCustomerAuditEvent(tx, {
            operation: 'add_follow_up',
            customerId: customer.id,
            actor: { id: context.actor.id, name: context.actor.name },
            reason: '线索跟进推进客户进展',
            beforeSnapshot: customer,
            afterSnapshot: updatedCustomer,
            canonicalInput: {
              operation: 'add_follow_up', customerId: customer.id, leadId,
              followUpType: input.type, content,
            },
          });
        }
        return success(record);
      });
    },

    async assignLead(leadId: string, ownerInput: string, currentUser: AuthenticatedUser) {
      if (!hasPermission(currentUser, PERMISSION_KEYS.LEADS_FLOW_CONFIG, 'write')) {
        return failure<Lead>('无权分配线索', 403);
      }
      const owner = cleanText(ownerInput);
      if (!owner) return failure<Lead>('请选择分配销售', 400);
      return runTransaction(async (tx) => {
        const row = await lockLead(tx, leadId);
        if (!row) return failure<Lead>('线索不存在', 404);
        const lead = readJson<Lead>(row.data);
        if (lead.deletedAt) return failure<Lead>('线索不存在', 404);
        if (lead.customerId) return failure<Lead>('已转客户的线索不可重新分配', 409);
        const context = await commandContext(tx, currentUser, 'leads');
        if (!context.actor) return failure<Lead>('当前用户不存在或已离职', 403);
        const canAccess = context.scope.unrestricted || [lead.inputBy, lead.owner, lead.assignedTo]
          .some((name) => Boolean(name && context.scope.visibleUserNames.includes(name)));
        if (!canAccess) return failure<Lead>('无权操作该线索', 403);
        const targets = activeUsersNamed(context, owner);
        if (!targets.length || !canReceiveLead(targets[0], context.roles)) {
          return failure<Lead>('目标销售不存在、已离职或不可接收线索', 400);
        }
        if (targets.length > 1) return failure<Lead>('存在同名员工，无法确定线索归属', 409);
        if (!context.scope.unrestricted && !context.scope.visibleUserIds.includes(targets[0].id)) {
          return failure<Lead>('无权跨数据范围分配线索', 403);
        }
        if (lead.owner === owner && lead.assignedTo === owner) return success(lead);
        const at = now();
        const atIso = at.toISOString();
        const operator = commandActor(context, currentUser);
        const updated: Lead = {
          ...lead,
          owner,
          assignedTo: owner,
          assignedAt: atIso,
          intakeStatus: '入库成功',
          lifecycleStatusCode: lead.lifecycleStatusCode || LIFECYCLE_STATUS_CODES.PENDING_FOLLOWUP,
          lifecycleStatus: lead.lifecycleStatus || '待跟进',
          lifecycleStatusUpdatedAt: atIso,
          changeHistory: [
            leadHistory(newId('hist'), atIso, operator, '修改了分配销售', [{
              field: 'assignedTo',
              label: '分配销售',
              oldValue: activityValue(lead.assignedTo || lead.owner),
              newValue: owner,
            }]),
            ...(lead.changeHistory || []),
          ],
          updatedAt: atIso,
        };
        await persistLead(tx, row.id, updated, at);
        return success(updated);
      });
    },

    async deleteLead(leadId: string, reasonInput: string, currentUser: AuthenticatedUser) {
      if (!isSuperAdmin(currentUser)) return failure<boolean>('仅超级管理员可以删除线索', 403);
      return runTransaction(async (tx) => {
        await lockContactIdentityMutationGate(tx);
        const row = await lockLead(tx, leadId);
        if (!row) return success(true);
        const lead = readJson<Lead>(row.data);
        if (lead.deletedAt) return success(true);
        if (lead.customerId) return failure<boolean>('线索已转为客户，不能单独删除', 409);
        const context = await commandContext(tx, currentUser, 'leads');
        if (!context.actor || !context.scope.unrestricted) return failure<boolean>('无权删除该线索', 403);
        const at = now();
        const atIso = at.toISOString();
        const deleted: Lead = {
          ...lead,
          deletedAt: atIso,
          deletedBy: commandActor(context, currentUser),
          deleteReason: cleanText(reasonInput) || '业务删除',
          updatedAt: atIso,
        };
        await persistLead(tx, row.id, deleted, at);
        await endLeadContactIdentityLinks(tx, row.id);
        return success(true);
      });
    },

    async releaseToPublicPool(customerId: string, reasonInput: string, currentUser: AuthenticatedUser) {
      const preflightError = permissionError(() => (
        assertCustomerActionPermission(preflightCustomerAccess(currentUser), 'release_to_pool')
      ));
      if (preflightError) return failure<Customer>(preflightError, 403);
      return transitionCustomer(customerId, currentUser, 'release_to_pool', (customer, _context, at) => {
        if (isCanonicalPublicPoolCustomer(customer)) {
          return {};
        }
        const atIso = at.toISOString();
        const operator = commandActor(_context, currentUser);
        const reason = cleanText(reasonInput) || '销售放弃跟进，客户进入公海池';
        const previousOwner = customer.owner;
        const updatedCustomer: Customer = {
          ...customer,
          owner: '公海',
          ownerId: undefined,
          ownerIdentityStatus: 'public_pool',
          previousOwner: previousOwner && previousOwner !== '公海' ? previousOwner : customer.previousOwner,
          lifecycleStatusCode: LIFECYCLE_STATUS_CODES.PUBLIC_POOL,
          lifecycleStatusUpdatedAt: atIso,
          publicPoolAt: atIso,
          releasedBy: operator,
          releaseReason: reason,
          activityRecords: [
            customerActivity(
              newId('act'),
              atIso,
              operator,
              '释放到公海',
              reason,
              [
                { field: 'owner', label: '销售负责人', oldValue: previousOwner || null, newValue: '公海' },
                {
                  field: 'lifecycleStatusCode',
                  label: '客户生命周期',
                  oldValue: customer.lifecycleStatusCode || null,
                  newValue: LIFECYCLE_STATUS_CODES.PUBLIC_POOL,
                },
              ],
            ),
            ...(customer.activityRecords || []),
          ],
          updatedAt: atIso,
        };
        return {
          customer: updatedCustomer,
          lead: (lead) => ({
            ...lead,
            owner: '公海',
            ownerId: undefined,
            assignedTo: undefined,
            assignedToId: undefined,
            assignedAt: undefined,
            lifecycleStatusCode: LIFECYCLE_STATUS_CODES.PUBLIC_POOL,
            lifecycleStatus: '流失公海',
            lifecycleStatusUpdatedAt: atIso,
            changeHistory: [
              leadHistory(newId('hist'), atIso, operator, reason, [
                { field: 'owner', label: '负责人', oldValue: lead.owner || null, newValue: '公海' },
                { field: 'assignedTo', label: '分配销售', oldValue: lead.assignedTo || null, newValue: null },
              ]),
              ...(lead.changeHistory || []),
            ],
            updatedAt: atIso,
          }),
        };
      });
    },

    async claimFromPublicPool(customerId: string, currentUser: AuthenticatedUser) {
      const preflightError = permissionError(() => (
        assertCustomerClaimPermission(preflightCustomerAccess(currentUser))
      ));
      if (preflightError) return failure<Customer>(preflightError, 403);
      return transitionCustomer(customerId, currentUser, 'claim_from_pool', (customer, context, at) => {
        const actor = context.actor;
        if (!actor || !canReceiveLead(actor, context.roles)) {
          return { error: { code: 403, message: '当前员工不是可领取客户的在职销售' } };
        }
        const operator = actor.name;
        const isPublicPool = isCanonicalPublicPoolCustomer(customer);
        if (!isPublicPool) {
          if (customer.ownerIdentityStatus === 'resolved' && customer.ownerId === actor.id) return {};
          return { error: { code: 409, message: '客户已被其他人领取' } };
        }
        const atIso = at.toISOString();
        const updatedCustomer: Customer = {
          ...customer,
          owner: operator,
          ownerId: actor.id,
          ownerIdentityStatus: 'resolved',
          previousOwner: customer.owner,
          assignedBy: operator,
          assignedAt: atIso,
          assignmentReason: '从公海领取',
          ownerSince: atIso,
          lifecycleStatusCode: LIFECYCLE_STATUS_CODES.PENDING_FOLLOWUP,
          lifecycleStatusUpdatedAt: atIso,
          activityRecords: [
            customerActivity(
              newId('act'),
              atIso,
              operator,
              '重新领取公海客户',
              `${operator} 领取客户继续跟进`,
              [
                { field: 'owner', label: '销售负责人', oldValue: customer.owner || null, newValue: operator },
                {
                  field: 'lifecycleStatusCode',
                  label: '客户生命周期',
                  oldValue: customer.lifecycleStatusCode || null,
                  newValue: LIFECYCLE_STATUS_CODES.PENDING_FOLLOWUP,
                },
              ],
            ),
            ...(customer.activityRecords || []),
          ],
          updatedAt: atIso,
        };
        return {
          customer: updatedCustomer,
          lead: (lead) => ({
            ...lead,
            owner: operator,
            ownerId: actor.id,
            assignedTo: operator,
            assignedToId: actor.id,
            assignedAt: atIso,
            intakeStatus: '入库成功',
            lifecycleStatusCode: LIFECYCLE_STATUS_CODES.PENDING_FOLLOWUP,
            lifecycleStatus: '待跟进',
            lifecycleStatusUpdatedAt: atIso,
            changeHistory: [
              leadHistory(newId('hist'), atIso, operator, '从公海领取客户', [
                { field: 'owner', label: '负责人', oldValue: lead.owner || null, newValue: operator },
                { field: 'assignedTo', label: '分配销售', oldValue: lead.assignedTo || null, newValue: operator },
              ]),
              ...(lead.changeHistory || []),
            ],
            updatedAt: atIso,
          }),
        };
      });
    },

    async assignOwner(
      customerId: string,
      ownerIdInput: string,
      reasonInput: string,
      currentUser: AuthenticatedUser,
    ) {
      const preflightError = permissionError(() => (
        assertCustomerActionPermission(preflightCustomerAccess(currentUser), 'transfer')
      ));
      if (preflightError) return failure<Customer>(preflightError, 403);
      const ownerId = cleanText(ownerIdInput);
      if (!ownerId) return failure<Customer>('请选择新的销售负责人', 400);
      return transitionCustomer(customerId, currentUser, 'transfer', (customer, context, at) => {
        const target = context.users.find((user) => (
          user.id === ownerId
          && user.isActive
          && (user.employmentStatus || 'active') === 'active'
        ));
        if (!target) return { error: { code: 400, message: '目标销售不存在或已离职' } };
        const owner = target.name;
        if (!canReceiveLead(target, context.roles)) {
          return { error: { code: 400, message: '目标员工不可接收转让客户' } };
        }
        if (!context.customerAccess?.manageableOwnerIds.has(target.id)) {
          return { error: { code: 403, message: '无权跨数据范围转让客户' } };
        }
        if (customer.ownerId === ownerId && customer.lifecycleStatusCode !== LIFECYCLE_STATUS_CODES.PUBLIC_POOL) return {};

        const atIso = at.toISOString();
        const operator = commandActor(context, currentUser);
        const reason = cleanText(reasonInput);
        const wasPublicPool = isCanonicalPublicPoolCustomer(customer);
        const nextLifecycle = wasPublicPool
          ? LIFECYCLE_STATUS_CODES.PENDING_FOLLOWUP
          : customer.lifecycleStatusCode;
        const updatedCustomer: Customer = {
          ...customer,
          owner,
          ownerId: target.id,
          ownerIdentityStatus: 'resolved',
          previousOwner: customer.owner,
          assignedBy: operator,
          assignedAt: atIso,
          assignmentReason: reason || customer.assignmentReason,
          ownerSince: atIso,
          lifecycleStatusCode: nextLifecycle,
          lifecycleStatusUpdatedAt: wasPublicPool ? atIso : customer.lifecycleStatusUpdatedAt,
          activityRecords: [
            customerActivity(
              newId('act'),
              atIso,
              operator,
              `转让客户给 ${owner}`,
              reason || undefined,
              [{ field: 'owner', label: '销售负责人', oldValue: customer.owner || null, newValue: owner }],
            ),
            ...(customer.activityRecords || []),
          ],
          updatedAt: atIso,
        };
        return {
          customer: updatedCustomer,
          lead: (lead) => ({
            ...lead,
            owner,
            ownerId: target.id,
            assignedTo: owner,
            assignedToId: target.id,
            assignedAt: atIso,
            intakeStatus: '入库成功',
            lifecycleStatusCode: wasPublicPool ? LIFECYCLE_STATUS_CODES.PENDING_FOLLOWUP : lead.lifecycleStatusCode,
            lifecycleStatus: wasPublicPool ? '待跟进' : lead.lifecycleStatus,
            lifecycleStatusUpdatedAt: wasPublicPool ? atIso : lead.lifecycleStatusUpdatedAt,
            changeHistory: [
              leadHistory(newId('hist'), atIso, operator, reason || `转让客户给 ${owner}`, [
                { field: 'owner', label: '负责人', oldValue: lead.owner || null, newValue: owner },
                { field: 'assignedTo', label: '分配销售', oldValue: lead.assignedTo || null, newValue: owner },
              ]),
              ...(lead.changeHistory || []),
            ],
            updatedAt: atIso,
          }),
        };
      });
    },

    async convertLeadToCustomer(leadId: string, currentUser: AuthenticatedUser) {
      if (!hasLeadConvertPermission(currentUser)) return failure<Lead>('无权将线索转为客户', 403);
      return runTransaction(async (tx) => {
        await lockContactIdentityMutationGate(tx);
        const leadRow = await lockLead(tx, leadId);
        if (!leadRow) return failure<Lead>('线索不存在', 404);
        const lead = stripLeadTags(readJson<Lead>(leadRow.data));
        if (lead.deletedAt) return failure<Lead>('线索不存在', 404);

        const context = await commandContext(tx, currentUser, 'leads');
        if (!context.actor) return failure<Lead>('当前用户不存在或已离职', 403);
        const existingOwnerName = assignedLeadOwnerName(lead);
        if (existingOwnerName && activeUsersNamed(context, existingOwnerName).length > 1) {
          return failure<Lead>('线索归属姓名不唯一，请先完成归属身份清理', 409);
        }
        if (!canMutateLead(lead, context, currentUser)) return failure<Lead>('无权操作该线索', 403);

        if (lead.customerId) {
          const existingCustomer = await tx.businessRecord.findUnique({
            where: {
              domain_recordId: {
                domain: STORAGE_KEYS.CUSTOMERS,
                recordId: lead.customerId,
              },
            },
            select: { id: true },
          });
          if (existingCustomer) return success(lead);
        }

        await lockCustomerContacts(tx, options.contactIdentityCrypto, lead);
        const at = now();
        const atIso = at.toISOString();
        const operator = commandActor(context, currentUser);
        let conversionOwner = operator;
        let conversionOwnerId = context.actor.id;
        if (existingOwnerName) {
          const existingOwner = activeUsersNamed(context, existingOwnerName)[0];
          if (!existingOwner || !canReceiveLead(existingOwner, context.roles)) {
            return failure<Lead>('线索已分配的销售不存在、已离职或不可接收线索', 409);
          }
          conversionOwner = existingOwner.name;
          conversionOwnerId = existingOwner.id;
        } else {
          if (!canReceiveLead(context.actor, context.roles)) {
            return failure<Lead>('当前员工不是可领取线索的在职销售', 403);
          }
          if (activeUsersNamed(context, context.actor.name).length > 1) {
            return failure<Lead>('当前员工姓名不唯一，无法安全记录线索归属', 409);
          }
        }
        const customerId = lead.customerId || newId('cust');
        const customer: Customer = {
          id: customerId,
          name: lead.name,
          company: lead.company || lead.name,
          phone: normalizePhoneForStorage(lead.phone),
          email: lead.email,
          wechat: normalizedWechat(lead.wechat) || undefined,
          industry: lead.industry,
          city: lead.city,
          owner: conversionOwner,
          ownerId: conversionOwnerId,
          ownerIdentityStatus: 'resolved',
          customerLevel: 'L1',
          lifecycleStatusCode: LIFECYCLE_STATUS_CODES.FOLLOWING,
          lifecycleStatusUpdatedAt: atIso,
          totalSpent: 0,
          orderCount: 0,
          growthPath: [],
          growthRecords: [],
          activityRecords: [{
            id: newId('act'),
            type: 'create',
            title: '线索转为客户',
            content: lead.remark,
            operator,
            relatedId: leadRow.id,
            relatedType: 'lead',
            createdAt: atIso,
          }],
          manualTagIds: [],
          tags: [],
          leadInputBy: lead.inputBy,
          leadContributorId: lead.leadContributorId,
          leadContributorName: lead.leadContributorName,
          leadSource: lead.source,
          remark: lead.remark,
          sourceType: normalizeResourceOwnership(lead.sourceType),
          sourceName: lead.sourceName,
          sourceAccount: lead.sourceAccount,
          score: lead.score,
          createdAt: atIso,
          updatedAt: atIso,
        };

        await linkLeadAndCustomerIdentity(tx, {
          leadId: leadRow.id,
          customerId,
          phone: customer.phone,
          wechat: customer.wechat,
          source: 'lead_conversion',
          crypto: options.contactIdentityCrypto,
          conflictViewer: {
            canReadCustomerList: Boolean(context.customerAccess?.canReadCustomerList),
            canReadCustomer: (candidate) => Boolean(
              context.customerAccess && canReadCustomer(context.customerAccess, candidate)
            ),
          },
        });

        await tx.businessRecord.create({
          data: {
            id: `${STORAGE_KEYS.CUSTOMERS}:${customerId}`,
            domain: STORAGE_KEYS.CUSTOMERS,
            recordId: customerId,
            title: customer.name || customer.company || customerId,
            status: customer.lifecycleStatusCode,
            owner: customer.owner,
            customerId,
            amount: 0,
            eventAt: at,
            data: jsonValue(customer),
          },
        });
        await appendCustomerAuditEvent(tx, {
          operation: 'create_customer',
          customerId,
          actor: { id: context.actor.id, name: context.actor.name },
          reason: '线索转为客户',
          afterSnapshot: customer,
          canonicalInput: {
            operation: 'create_customer', customerId, sourceLeadId: leadRow.id,
            conversionOwnerId, source: 'lead_conversion',
          },
        });

        const updatedLead: Lead = {
          ...lead,
          customerId,
          phone: normalizePhoneForStorage(lead.phone),
          wechat: normalizedWechat(lead.wechat) || undefined,
          owner: conversionOwner,
          assignedTo: conversionOwner,
          assignedAt: lead.assignedTo === conversionOwner && lead.assignedAt ? lead.assignedAt : atIso,
          intakeStatus: '入库成功',
          lifecycleStatusCode: LIFECYCLE_STATUS_CODES.FOLLOWING,
          lifecycleStatus: '跟进中',
          lifecycleStatusUpdatedAt: atIso,
          changeHistory: [
            leadHistory(newId('hist'), atIso, operator, '领取线索并转为客户', [
              { field: 'customerId', label: '客户', oldValue: lead.customerId || null, newValue: customerId },
              { field: 'owner', label: '负责人', oldValue: lead.owner || null, newValue: conversionOwner },
            ]),
            ...(lead.changeHistory || []),
          ],
          updatedAt: atIso,
        };
        await persistLead(tx, leadRow.id, updatedLead, at);
        return success(updatedLead);
      });
    },
  };
}
