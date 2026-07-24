import { createHash, randomUUID } from 'node:crypto';
import type { ApiResponse } from '../../src/api/types';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { Customer, CustomerCreateInput } from '../../src/types/customer';
import type { LeadSourceConfig } from '../../src/types/settings';
import type { CustomerTagCatalog } from '../../src/types/tag';
import { mapPrismaRole } from '../db/prismaMappers';
import {
  normalizeResourceOwnership,
  STORAGE_KEYS,
} from '../../src/shared/utils/constants';
import {
  getPhoneNumberError,
  normalizePhoneForStorage,
} from '../../src/shared/utils/phoneNumber';
import {
  hasExplicitPermission,
  hasPermission,
  PERMISSION_KEYS,
  roleHasPermission,
} from '../../src/shared/utils/permissions';
import {
  canReadCustomer,
  loadCustomerAccessContext,
  type CustomerAccessContext,
} from './customerAccessPolicy';
import {
  findExactCustomerContactDuplicate,
  type ContactIdentityCrypto,
} from './contactIdentityService';
import type { CustomerCreateExecutionContext } from './customerListService';
import { validateManualTagSelection } from './customerTagPolicy';
import { loadCustomerTagValidationCatalog } from './customerTagService';
import {
  issueWechatCustomerPrecheckToken,
  type WechatAutomationConfig,
  verifyWechatCustomerPrecheckToken,
  WECHAT_CUSTOMER_PRECHECK_TOKEN_TTL_MS,
} from './wechatAutomationSecurity';

export type WechatCustomerInput = {
  name?: string;
  company?: string;
  phone?: string;
  wechat?: string;
  leadSource?: string;
  sourceName?: string;
  sourceType?: string;
  ownerAccount?: string;
  ownerName?: string;
  leadContributorAccount?: string;
  industry?: string;
  city?: string;
  tagNames?: string[];
  remark?: string;
};

export type WechatNormalizedCustomer = {
  name: string;
  company: string;
  phone?: string;
  wechat?: string;
  leadSource: string;
  sourceName?: string;
  sourceType: '公司资源' | '个人资源';
  ownerAccount: string;
  ownerName: string;
  leadContributorAccount?: string;
  leadContributorName?: string;
  industry?: string;
  city?: string;
  tagNames: string[];
  remark?: string;
};

export type WechatCustomerSummary = Pick<Customer, 'id' | 'name' | 'company' | 'owner'>;

export type WechatCustomerCheckResult =
  | {
    status: 'needs_input';
    field: string;
    message: string;
    candidates?: Array<{ account: string; name: string }>;
  }
  | {
    status: 'duplicate';
    message: string;
    customer?: WechatCustomerSummary;
  }
  | {
    status: 'ready';
    normalized: WechatNormalizedCustomer;
    precheckToken: string;
    expiresAt: string;
  };

export type WechatCustomerCreateResult =
  | {
    status: 'created' | 'replayed';
    customer: WechatCustomerSummary;
    detailPath: string;
  }
  | {
    status: 'duplicate';
    message: string;
    customer?: WechatCustomerSummary;
  };

export type WechatCustomerAutomationContext = {
  actor: AuthenticatedUser;
  senderId: string;
  requestId?: string;
  idempotencyKey?: string;
};

type DirectoryUser = {
  id: string;
  roleId?: string | null;
  account?: string | null;
  name: string;
  isActive: boolean;
  employmentStatus?: string | null;
};

type WechatCustomerAutomationPrisma = {
  user: {
    findMany(args?: any): Promise<any[]>;
  };
  role: { findMany(args?: any): Promise<any[]> };
  department: { findMany(args?: any): Promise<any[]> };
  appStorage: {
    findUnique(args: any): Promise<{ value: unknown } | null>;
    create(args: any): Promise<{ value: unknown }>;
    update(args: any): Promise<{ value: unknown }>;
  };
  businessRecord: {
    findMany(args?: any): Promise<any[]>;
    findUnique(args: any): Promise<any | null>;
  };
  contactIdentity: { findUnique(args: any): Promise<any | null> };
  contactIdentityLink: { findMany(args: any): Promise<any[]> };
  customerAuditEvent?: {
    findFirst(args: any): Promise<{ customerId: string } | null>;
  };
};

type CustomerCreator = {
  create(
    input: CustomerCreateInput,
    actor: AuthenticatedUser,
    execution?: CustomerCreateExecutionContext,
  ): Promise<ApiResponse<Customer | null>>;
};

export type WechatCustomerAutomationDependencies = {
  prisma: WechatCustomerAutomationPrisma;
  customerService: CustomerCreator;
  automationConfig: Pick<WechatAutomationConfig, 'actorAccount' | 'signingKey'>;
  contactIdentityCrypto?: ContactIdentityCrypto;
  now?: () => Date;
  nonce?: () => string;
  idempotencyWaitTimeoutMs?: number;
};

type ResolvedCustomer = {
  normalized: WechatNormalizedCustomer;
  owner: DirectoryUser;
  contributor?: DirectoryUser;
  tagIds: string[];
  access: CustomerAccessContext;
  leadSourceId: string;
  sourceNameId?: string;
};

type Resolution =
  | { status: 'needs_input'; field: string; message: string; candidates?: Array<{ account: string; name: string }> }
  | { status: 'resolved'; value: ResolvedCustomer };

type WechatCreateIdempotencyRecord = {
  version: 1;
  inputHash: string;
  state: 'in_progress' | 'completed' | 'failed';
  resultStatus?: 'created' | 'duplicate';
  customerId?: string;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  requestId: string;
  idempotencyKey: string;
  createStartedAt?: string;
};

const WECHAT_CREATE_INTEGRATION_ID = 'jixiang-wechat-customer-automation-v1';

const cleanText = (value: unknown): string => String(value ?? '').trim();

function readStorageArray<T>(value: unknown): T[] | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed as T[] : null;
    } catch {
      return null;
    }
  }
  return Array.isArray(value) ? value as T[] : null;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function resolvedInputHash(resolved: ResolvedCustomer): string {
  return sha256(JSON.stringify({
    normalized: resolved.normalized,
    ownerId: resolved.owner.id,
    contributorId: resolved.contributor?.id || null,
    leadSourceId: resolved.leadSourceId,
    sourceNameId: resolved.sourceNameId || null,
    tagIds: resolved.tagIds,
  }));
}

function invalidPrecheckToken(): never {
  throw new Error('WeChat customer precheck token is invalid or expired.');
}

function idempotencyConflict(): never {
  throw Object.assign(new Error('WeChat customer create idempotency conflict.'), { statusCode: 409 });
}

function idempotencyPending(): never {
  throw Object.assign(new Error('WeChat customer create is still in progress.'), { statusCode: 503 });
}

function validHash(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function canonicalTimestamp(value: unknown): number | null {
  if (typeof value !== 'string' || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) || date.toISOString() !== value ? null : date.getTime();
}

function readIdempotencyRecord(value: unknown): WechatCreateIdempotencyRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const expectedKeys = [
    'attempts', 'createdAt', 'customerId', 'idempotencyKey', 'inputHash',
    'requestId', 'resultStatus', 'state', 'updatedAt', 'version', 'createStartedAt',
  ];
  if (Object.keys(record).some((key) => !expectedKeys.includes(key))) return null;
  const createdAt = canonicalTimestamp(record.createdAt);
  const updatedAt = canonicalTimestamp(record.updatedAt);
  const createStartedAt = canonicalTimestamp(record.createStartedAt);
  if (
    record.version !== 1
    || !validHash(record.inputHash)
    || !['in_progress', 'completed', 'failed'].includes(String(record.state))
    || createdAt === null
    || updatedAt === null
    || createStartedAt === null
    || createdAt > createStartedAt
    || createStartedAt > updatedAt
    || !Number.isInteger(record.attempts)
    || Number(record.attempts) < 1
    || typeof record.requestId !== 'string'
    || typeof record.idempotencyKey !== 'string'
  ) return null;
  if (record.state === 'completed' && (
    record.resultStatus !== 'created' || typeof record.customerId !== 'string' || !record.customerId
  )) return null;
  if (record.state === 'failed' && (record.resultStatus !== 'duplicate' || record.customerId !== undefined)) return null;
  if (record.state === 'in_progress' && (record.resultStatus !== undefined || record.customerId !== undefined)) return null;
  return record as WechatCreateIdempotencyRecord;
}

function failedDuplicateRecord(record: WechatCreateIdempotencyRecord, updatedAt: string): WechatCreateIdempotencyRecord {
  return { ...record, state: 'failed', resultStatus: 'duplicate', updatedAt };
}

function createIdentity(senderId: string, nonce: string) {
  const idempotencyDigest = sha256(`${WECHAT_CREATE_INTEGRATION_ID}\u0000${sha256(senderId)}\u0000${nonce}`);
  return {
    storageKey: `wechat:customer-create:v1:${idempotencyDigest}`,
    idempotencyKey: `wechat-create:${idempotencyDigest}`,
    requestId: `wechat-request:${idempotencyDigest}`,
  };
}

async function revalidateReplayCustomer(
  deps: WechatCustomerAutomationDependencies,
  resolved: ResolvedCustomer,
  customerId: string,
): Promise<WechatCustomerSummary> {
  const conflict = await findExactCustomerContactDuplicate(deps.prisma as any, {
    phone: resolved.normalized.phone,
    wechat: resolved.normalized.wechat,
    crypto: deps.contactIdentityCrypto,
    conflictViewer: {
      canReadCustomerList: resolved.access.canReadCustomerList,
      canReadCustomer: (customer) => canReadCustomer(resolved.access, customer),
    },
  });
  if (!conflict?.customer || conflict.customer.id !== customerId) idempotencyConflict();
  return summary(conflict.customer as Customer);
}

function needsInput(field: string, message: string): Resolution {
  return { status: 'needs_input', field, message };
}

function activeUser(user: DirectoryUser | undefined): user is DirectoryUser {
  return Boolean(user?.isActive && (user.employmentStatus || 'active') === 'active');
}

function resolveExactCustomerTags(
  catalog: CustomerTagCatalog,
  labels: string[],
): { ok: true; tagIds: string[]; tagNames: string[] } | { ok: false; message: string } {
  const groupById = new Map(catalog.groups.map((group) => [group.id, group]));
  const tagIds: string[] = [];
  const tagNames: string[] = [];
  for (const rawLabel of labels) {
    const label = cleanText(rawLabel);
    const matches = catalog.tags.filter((tag) => cleanText(tag.name) === label);
    const eligible = matches.filter((tag) => {
      const group = groupById.get(tag.groupId);
      return tag.isActive
        && group?.isActive
        && (group.scope === 'customer' || group.scope === 'both');
    });
    if (eligible.length !== 1) {
      return { ok: false, message: `标签“${label}”未在系统设置中预设或已停用` };
    }
    if (!tagIds.includes(eligible[0].id)) {
      tagIds.push(eligible[0].id);
      tagNames.push(eligible[0].name);
    }
  }
  const validation = validateManualTagSelection(catalog, 'customer', tagIds);
  return validation.ok
    ? { ok: true, tagIds: validation.tagIds, tagNames }
    : { ok: false, message: validation.message };
}

async function resolveInput(
  deps: WechatCustomerAutomationDependencies,
  input: WechatCustomerInput,
  context: WechatCustomerAutomationContext,
): Promise<Resolution> {
  const actor = context.actor;
  if (
    !actor?.isActive
    || cleanText(actor.account) !== cleanText(deps.automationConfig.actorAccount)
    || !cleanText(context.senderId)
  ) {
    throw new Error('WeChat customer automation context is invalid.');
  }
  if (!hasPermission(actor, PERMISSION_KEYS.CUSTOMER_CREATE, 'write')) {
    throw new Error('无权新建客户');
  }

  const name = cleanText(input.name);
  if (!name) return needsInput('name', '请提供客户姓名');
  if (name.length > 100) return needsInput('name', '客户姓名不能超过100个字符');

  const phone = normalizePhoneForStorage(input.phone);
  const wechat = cleanText(input.wechat);
  if (!phone && !wechat) return needsInput('phoneOrWechat', '请提供客户手机号或微信号');
  const phoneError = phone ? getPhoneNumberError(phone) : '';
  if (phoneError) return needsInput('phone', phoneError);

  const requestedLeadSource = cleanText(input.leadSource);
  if (!requestedLeadSource) return needsInput('leadSource', '请提供系统中已启用的线索来源');
  const sourceRow = await deps.prisma.appStorage.findUnique({
    where: { key: STORAGE_KEYS.LEAD_SOURCE_CONFIGS },
  });
  const leadSources = readStorageArray<LeadSourceConfig>(sourceRow?.value);
  if (!leadSources) return needsInput('leadSource', '系统线索来源配置不可用');
  const activeSources = leadSources.filter((source) => (
    source
    && typeof source === 'object'
    && source.isActive === true
    && cleanText(source.id)
    && cleanText(source.name)
  ));
  const leadSourceMatches = activeSources.filter((source) => (
    !source.parentId && cleanText(source.name) === requestedLeadSource
  ));
  if (leadSourceMatches.length !== 1) {
    return needsInput('leadSource', '请提供系统中唯一且已启用的线索来源');
  }
  const leadSource = leadSourceMatches[0];

  const requestedSourceName = cleanText(input.sourceName);
  let sourceName = '';
  let sourceNameId = '';
  if (requestedSourceName) {
    const children = activeSources.filter((source) => (
      source.parentId === leadSource.id && cleanText(source.name) === requestedSourceName
    ));
    if (children.length !== 1) {
      return needsInput('sourceName', '请提供该线索来源下唯一且已启用的二级来源');
    }
    const child = children[0];
    sourceName = cleanText(child.name);
    sourceNameId = child.id;
  }

  const [access, users, roles, tagCatalog] = await Promise.all([
    loadCustomerAccessContext(deps.prisma, actor),
    deps.prisma.user.findMany({
      select: {
        id: true,
        account: true,
        name: true,
        roleId: true,
        isActive: true,
        employmentStatus: true,
      },
    }),
    deps.prisma.role.findMany({ where: { isActive: true } }),
    loadCustomerTagValidationCatalog(deps.prisma as any),
  ]);
  const tagResolution = resolveExactCustomerTags(
    tagCatalog,
    Array.isArray(input.tagNames) ? input.tagNames : [],
  );
  if (!tagResolution.ok) return needsInput('tagNames', tagResolution.message);
  const actorDirectoryUser = users.find((candidate) => candidate.id === actor.id) as DirectoryUser | undefined;
  if (
    !activeUser(actorDirectoryUser)
    || cleanText(actorDirectoryUser.account) !== cleanText(deps.automationConfig.actorAccount)
    || !access.manageableOwnerIds.has(actorDirectoryUser.id)
  ) {
    throw new Error('WeChat automation actor is inactive or outside the current customer scope.');
  }
  const currentRoleRow = roles.find((candidate) => (
    candidate.id === actorDirectoryUser.roleId && candidate.isActive
  ));
  if (
    !currentRoleRow
    || !roleHasPermission(mapPrismaRole(currentRoleRow), PERMISSION_KEYS.CUSTOMER_CREATE, 'write')
  ) {
    throw new Error('无权新建客户');
  }
  const sourceType = normalizeResourceOwnership(input.sourceType);
  const requestedContributorAccount = cleanText(input.leadContributorAccount);
  let contributor: DirectoryUser | undefined;
  if (sourceType === '个人资源') {
    if (!requestedContributorAccount) {
      return needsInput('leadContributorAccount', '个人资源必须提供线索贡献人账号');
    }
    const matchedContributor = users.find((candidate) => (
      cleanText(candidate.account) === requestedContributorAccount
    )) as DirectoryUser | undefined;
    if (!activeUser(matchedContributor)) {
      return needsInput('leadContributorAccount', '请提供在职的线索贡献人账号');
    }
    contributor = matchedContributor;
  } else if (requestedContributorAccount) {
    return needsInput('leadContributorAccount', '公司资源无需填写线索贡献人');
  }
  const requestedOwnerAccount = cleanText(input.ownerAccount);
  let owner = actorDirectoryUser;
  if (requestedOwnerAccount) {
    const matched = users.find((candidate) => (
      cleanText(candidate.account) === requestedOwnerAccount
    )) as DirectoryUser | undefined;
    if (!activeUser(matched) || !access.manageableOwnerIds.has(matched.id)) {
      return needsInput('ownerAccount', '请提供可分配的负责人账号');
    }
    if (
      matched.id !== actor.id
      && (
        !hasExplicitPermission(actor, PERMISSION_KEYS.CUSTOMER_TRANSFER, 'write')
        || !access.grantedPermissions.has(PERMISSION_KEYS.CUSTOMER_TRANSFER)
      )
    ) {
      return needsInput('ownerAccount', '当前账号无权把客户分配给其他负责人');
    }
    owner = matched;
  } else if (cleanText(input.ownerName)) {
    const requestedOwnerName = cleanText(input.ownerName);
    const matches = users.filter((candidate) => (
      cleanText(candidate.name) === requestedOwnerName
      && Boolean(cleanText(candidate.account))
      && activeUser(candidate)
      && access.manageableOwnerIds.has(candidate.id)
    )) as DirectoryUser[];
    if (matches.length > 1) {
      return {
        status: 'needs_input',
        field: 'ownerAccount',
        message: '负责人姓名存在重名，请提供负责人账号',
        candidates: matches
          .map((candidate) => ({
            account: cleanText(candidate.account),
            name: cleanText(candidate.name),
          }))
          .filter((candidate) => candidate.account)
          .sort((left, right) => left.account.localeCompare(right.account)),
      };
    }
    if (matches.length !== 1) return needsInput('ownerAccount', '请提供可分配的负责人账号');
    if (
      matches[0].id !== actor.id
      && (
        !hasExplicitPermission(actor, PERMISSION_KEYS.CUSTOMER_TRANSFER, 'write')
        || !access.grantedPermissions.has(PERMISSION_KEYS.CUSTOMER_TRANSFER)
      )
    ) {
      return needsInput('ownerAccount', '当前账号无权把客户分配给其他负责人');
    }
    owner = matches[0];
  }

  const normalized: WechatNormalizedCustomer = {
    name,
    company: cleanText(input.company),
    ...(phone ? { phone } : {}),
    ...(wechat ? { wechat } : {}),
    leadSource: cleanText(leadSource.name),
    ...(sourceName ? { sourceName } : {}),
    sourceType,
    ownerAccount: cleanText(owner.account),
    ownerName: cleanText(owner.name),
    ...(contributor ? {
      leadContributorAccount: cleanText(contributor.account),
      leadContributorName: cleanText(contributor.name),
    } : {}),
    ...(cleanText(input.industry) ? { industry: cleanText(input.industry) } : {}),
    ...(cleanText(input.city) ? { city: cleanText(input.city) } : {}),
    tagNames: tagResolution.tagNames,
    ...(cleanText(input.remark) ? { remark: cleanText(input.remark) } : {}),
  };
  return {
    status: 'resolved',
    value: {
      normalized,
      owner,
      contributor,
      tagIds: tagResolution.tagIds,
      access,
      leadSourceId: leadSource.id,
      ...(sourceNameId ? { sourceNameId } : {}),
    },
  };
}

function summary(customer: Pick<Customer, 'id' | 'name' | 'company' | 'owner'>): WechatCustomerSummary {
  return {
    id: customer.id,
    name: customer.name,
    company: customer.company,
    owner: customer.owner,
  };
}

/**
 * Deep external module: callers only choose between check and create while
 * configuration, directory, scope, tags, identities, signing, and customer
 * execution stay behind this interface.
 */
export function createWechatCustomerAutomationService(
  deps: WechatCustomerAutomationDependencies,
) {
  return {
    async check(
      input: WechatCustomerInput,
      context: WechatCustomerAutomationContext,
    ): Promise<WechatCustomerCheckResult> {
      const resolution = await resolveInput(deps, input, context);
      if (resolution.status === 'needs_input') return resolution;
      const conflict = await findExactCustomerContactDuplicate(deps.prisma as any, {
        phone: resolution.value.normalized.phone,
        wechat: resolution.value.normalized.wechat,
        crypto: deps.contactIdentityCrypto,
        conflictViewer: {
          canReadCustomerList: resolution.value.access.canReadCustomerList,
          canReadCustomer: (customer) => canReadCustomer(resolution.value.access, customer),
        },
      });
      if (conflict) {
        return {
          status: 'duplicate',
          message: conflict.message,
          ...(conflict.customer ? { customer: summary(conflict.customer as Customer) } : {}),
        };
      }
      const now = deps.now?.() || new Date();
      const precheckToken = issueWechatCustomerPrecheckToken({
        actorId: context.actor.id,
        senderIdHash: sha256(context.senderId),
        inputHash: resolvedInputHash(resolution.value),
        nonce: deps.nonce?.() || randomUUID(),
      }, deps.automationConfig.signingKey, now);
      const expiresAt = new Date(
        now.getTime() + WECHAT_CUSTOMER_PRECHECK_TOKEN_TTL_MS,
      ).toISOString();
      return {
        status: 'ready',
        normalized: resolution.value.normalized,
        precheckToken,
        expiresAt,
      };
    },

    async create(
      input: WechatCustomerInput,
      token: string,
      context: WechatCustomerAutomationContext,
    ): Promise<WechatCustomerCreateResult> {
      const now = deps.now?.() || new Date();
      const payload = verifyWechatCustomerPrecheckToken(
        token,
        deps.automationConfig.signingKey,
        now,
      );
      if (
        payload.actorId !== context.actor.id
        || payload.senderIdHash !== sha256(context.senderId)
      ) invalidPrecheckToken();

      const resolution = await resolveInput(deps, input, context);
      if (resolution.status === 'needs_input') {
        throw new Error(`WeChat customer precheck is stale: ${resolution.message}`);
      }
      const identity = createIdentity(context.senderId, payload.nonce);
      const inputHash = resolvedInputHash(resolution.value);
      const priorRow = await deps.prisma.appStorage.findUnique({ where: { key: identity.storageKey } });
      if (priorRow) {
        const prior = readIdempotencyRecord(priorRow.value);
        if (!prior || prior.inputHash !== inputHash) idempotencyConflict();
      }
      if (payload.inputHash !== inputHash) invalidPrecheckToken();
      const nowIso = now.toISOString();
      const pending: WechatCreateIdempotencyRecord = {
        version: 1,
        inputHash,
        state: 'in_progress',
        createdAt: nowIso,
        updatedAt: nowIso,
        attempts: 1,
        requestId: identity.requestId,
        idempotencyKey: identity.idempotencyKey,
        createStartedAt: nowIso,
      };
      let record = pending;
      let ownsReservation = true;
      try {
        await deps.prisma.appStorage.create({
          data: { key: identity.storageKey, value: pending },
        });
      } catch (error) {
        ownsReservation = false;
        const existingRow = await deps.prisma.appStorage.findUnique({ where: { key: identity.storageKey } });
        if (!existingRow) throw error;
        const existing = readIdempotencyRecord(existingRow?.value);
        if (!existing || existing.inputHash !== inputHash
          || existing.idempotencyKey !== identity.idempotencyKey
          || existing.requestId !== identity.requestId) idempotencyConflict();
        record = existing;
      }

      if (!ownsReservation && record.state === 'completed') {
        const customer = await revalidateReplayCustomer(deps, resolution.value, record.customerId!);
        return {
          status: 'replayed',
          customer,
          detailPath: `/customers/${encodeURIComponent(customer.id)}`,
        };
      }

      if (!ownsReservation && record.state === 'failed') idempotencyConflict();

      if (!ownsReservation && record.createStartedAt) {
        let customer: WechatCustomerSummary | null = null;
        const waitDeadline = Date.now() + Math.max(100, deps.idempotencyWaitTimeoutMs ?? 5_000);
        while (!customer && Date.now() <= waitDeadline) {
          const latestRow = await deps.prisma.appStorage.findUnique({ where: { key: identity.storageKey } });
          const latest = readIdempotencyRecord(latestRow?.value);
          if (!latest || latest.inputHash !== inputHash) idempotencyConflict();
          record = latest;
          if (latest.state === 'completed') {
            customer = await revalidateReplayCustomer(deps, resolution.value, latest.customerId!);
            break;
          }
          if (latest.state === 'failed') idempotencyConflict();
          const audit = await deps.prisma.customerAuditEvent?.findFirst({
            where: {
              idempotencyKey: identity.idempotencyKey,
              operation: 'create_customer_from_wechat',
              result: 'succeeded',
            },
            orderBy: { createdAt: 'desc' },
            select: { customerId: true },
          });
          customer = audit ? await revalidateReplayCustomer(deps, resolution.value, audit.customerId) : null;
          if (!customer) await new Promise((resolve) => setTimeout(resolve, 25));
        }
        if (!customer) idempotencyPending();
        if (record.state === 'completed') return {
          status: 'replayed', customer, detailPath: `/customers/${encodeURIComponent(customer.id)}`,
        };
        const completed: WechatCreateIdempotencyRecord = {
          ...record,
          state: 'completed',
          resultStatus: 'created',
          customerId: customer.id,
          updatedAt: (deps.now?.() || new Date()).toISOString(),
        };
        await deps.prisma.appStorage.update({
          where: { key: identity.storageKey },
          data: { value: completed },
        });
        return {
          status: 'replayed',
          customer,
          detailPath: `/customers/${encodeURIComponent(customer.id)}`,
        };
      }

      const conflict = await findExactCustomerContactDuplicate(deps.prisma as any, {
        phone: resolution.value.normalized.phone,
        wechat: resolution.value.normalized.wechat,
        crypto: deps.contactIdentityCrypto,
        conflictViewer: {
          canReadCustomerList: resolution.value.access.canReadCustomerList,
          canReadCustomer: (customer) => canReadCustomer(resolution.value.access, customer),
        },
      });
      if (conflict) {
        await deps.prisma.appStorage.update({
          where: { key: identity.storageKey },
          data: { value: failedDuplicateRecord(record, (deps.now?.() || new Date()).toISOString()) },
        });
        return {
          status: 'duplicate',
          message: conflict.message,
          ...(conflict.customer ? { customer: summary(conflict.customer as Customer) } : {}),
        };
      }

      const normalized = resolution.value.normalized;
      const created = await deps.customerService.create({
        name: normalized.name,
        company: normalized.company,
        phone: normalized.phone || '',
        wechat: normalized.wechat,
        customerLevel: 'L1',
        owner: resolution.value.owner.name,
        ownerId: resolution.value.owner.id,
        leadSource: normalized.leadSource,
        sourceName: normalized.sourceName,
        sourceType: normalized.sourceType,
        leadContributorId: resolution.value.contributor?.id,
        leadContributorName: resolution.value.contributor?.name,
        industry: normalized.industry,
        city: normalized.city,
        manualTagIds: resolution.value.tagIds,
        remark: normalized.remark,
      }, context.actor, {
        requestId: identity.requestId,
        idempotencyKey: identity.idempotencyKey,
        auditOperation: 'create_customer_from_wechat',
        auditReason: '微信自动化创建客户',
      });

      if (created.code === 409 && created.message === '系统中已存在相同联系方式') {
        await deps.prisma.appStorage.update({
          where: { key: identity.storageKey },
          data: { value: failedDuplicateRecord(record, (deps.now?.() || new Date()).toISOString()) },
        });
        return {
          status: 'duplicate',
          message: created.message || '系统中已存在相同联系方式',
          ...(created.data ? { customer: summary(created.data) } : {}),
        };
      }
      if (created.code !== 0 || !created.data) {
        throw new Error(created.message || '客户创建失败');
      }
      const customer = summary(created.data);
      const completed: WechatCreateIdempotencyRecord = {
        ...record,
        state: 'completed',
        resultStatus: 'created',
        customerId: customer.id,
        updatedAt: (deps.now?.() || new Date()).toISOString(),
      };
      await deps.prisma.appStorage.update({
        where: { key: identity.storageKey },
        data: { value: completed },
      });
      return {
        status: 'created',
        customer,
        detailPath: `/customers/${encodeURIComponent(customer.id)}`,
      };
    },
  };
}
