import { Prisma, type PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { failure, success } from '../api/response';
import {
  STORAGE_KEYS,
  DEFAULT_PAGE_SIZE,
  LIFECYCLE_STATUS_CODES,
  normalizeLifecycleStatusCode,
  normalizeResourceOwnership,
} from '../../src/shared/utils/constants';
import type { Customer, CustomerActivityAttachment, CustomerCreateInput, CustomerFilters } from '../../src/types/customer';
import type { ApiResponse, PaginatedResponse } from '../../src/api/types';
import type { AuthenticatedUser } from '../../src/types/auth';
import {
  getPhoneNumberError,
  normalizePhoneForStorage,
} from '../../src/shared/utils/phoneNumber';
import { PERMISSION_KEYS, hasExplicitPermission, hasPermission } from '../../src/shared/utils/permissions';
import { NO_CUSTOMER_FOLLOW_UP_OWNER } from '../../src/shared/utils/customerFollowUp';
import { loadCustomerTagCatalog } from './customerTagService';
import { validateManualTagSelection } from './customerTagPolicy';
import { groupTagIdsForFilter, normalizeManualTagIds, validateCustomerTagFilters } from '../../src/shared/utils/customerTagPolicy';
import type { CustomerTagCatalog } from '../../src/types/tag';
import {
  assertCanManageCustomer,
  assertCustomerFieldPermissions,
  canReadCustomer,
  loadCustomerAccessContext,
  type CustomerAccessContext,
} from './customerAccessPolicy';
import {
  createCustomerBusinessRecordRepository,
  mapCustomerBusinessRecord,
  type CustomerBusinessRecordRow,
} from './customerBusinessRecordRepository';
import { customerWriteConflictResponse } from './customerWriteConflict';
import { appendCustomerAuditEvent } from './customerAuditService';
import {
  ContactIdentityConflictError,
  lockContactIdentityMutationGate,
  upsertCustomerContactIdentities,
  type ContactIdentityCrypto,
} from './contactIdentityService';

type CustomerListPrisma = Pick<PrismaClient,
  'businessRecord' | 'leadRecord' | 'user' | 'role' | 'department' | 'customerAuditEvent'
  | 'contactIdentity' | 'contactIdentityLink' | 'appStorage' | '$queryRaw' | '$transaction'
>;

type CustomerListServiceOptions = {
  contactIdentityCrypto?: ContactIdentityCrypto;
};

export type CustomerCreateExecutionContext = {
  tx?: Prisma.TransactionClient;
  batchJobId?: string;
  requestId?: string;
  idempotencyKey?: string;
  importDestination?: 'assigned' | 'public_pool';
  importedLastFollowUpRecord?: string;
};

type CustomerRow = CustomerBusinessRecordRow;

export type CustomerActivityInput = {
  content?: string;
  operator?: string;
  type?: '联系记录' | '客户行为' | '销售活动' | '跟进记录';
  attachments?: CustomerActivityAttachment[];
};

function cleanText(value: unknown): string {
  return String(value || '').trim();
}

function toPositiveInt(value: unknown, fallback: number): number {
  const next = Number(value);
  if (!Number.isFinite(next) || next < 1) return fallback;
  return Math.floor(next);
}

function customerFromRow(row: CustomerRow): Customer {
  return mapCustomerBusinessRecord(row).customer;
}

function permissionMessage(operation: () => void): string | null {
  try {
    operation();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : '无权操作客户';
  }
}

function createActivityId(): string {
  return `act-${Math.random().toString(36).slice(2, 10)}`;
}

function isRetryableCustomerCreateConflict(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  if (error instanceof ContactIdentityConflictError || code === 'P2002') return false;
  const message = error instanceof Error ? error.message : String(error || '');
  return code === 'P2034' || /deadlock|write conflict|1213|40001/i.test(message);
}

function addFollowActivity(customer: Customer, input: CustomerActivityInput, operator: string): Customer {
  const content = cleanText(input.content);
  const attachments = Array.isArray(input.attachments) ? input.attachments : [];
  const now = new Date().toISOString();
  const next: Customer = {
    ...customer,
    activityRecords: [
      {
        id: createActivityId(),
        type: 'follow',
        title: `发表了${input.type || '跟进记录'}`,
        content: content || undefined,
        attachments,
        operator,
        createdAt: now,
      },
      ...(customer.activityRecords || []),
    ],
    updatedAt: now,
  };
  if (next.lifecycleStatusCode === LIFECYCLE_STATUS_CODES.PENDING_FOLLOWUP) {
    next.lifecycleStatusCode = LIFECYCLE_STATUS_CODES.FOLLOWING;
    next.lifecycleStatusUpdatedAt = now;
  }
  return next;
}

function jsonText(path: string) {
  return Prisma.raw(`JSON_UNQUOTE(JSON_EXTRACT(data, '${path}'))`);
}

function buildTextLikeCondition(path: string, value: string) {
  return Prisma.sql`LOWER(COALESCE(${jsonText(path)}, '')) LIKE ${value}`;
}

function containsTagId(tagId: string) {
  return Prisma.sql`JSON_CONTAINS(COALESCE(JSON_EXTRACT(data, '$.manualTagIds'), JSON_ARRAY()), JSON_QUOTE(${tagId})) = 1`;
}

function publicPoolLastFollowUpOwnerSql() {
  return Prisma.sql`COALESCE(NULLIF((
    SELECT TRIM(activity.activity_operator)
    FROM JSON_TABLE(
      COALESCE(JSON_EXTRACT(data, '$.activityRecords'), JSON_ARRAY()),
      '$[*]' COLUMNS (
        activity_type VARCHAR(32) PATH '$.type',
        activity_operator VARCHAR(255) PATH '$.operator',
        activity_created_at VARCHAR(64) PATH '$.createdAt'
      )
    ) AS activity
    WHERE activity.activity_type = 'follow'
    ORDER BY activity.activity_created_at DESC
    LIMIT 1
  ), ''), NULLIF(TRIM(${jsonText('$.previousOwner')}), ''), ${NO_CUSTOMER_FOLLOW_UP_OWNER})`;
}

export function matchesCustomerTagFilters(customer: Pick<Customer, 'manualTagIds' | 'tags'>, filters: CustomerFilters, catalog: CustomerTagCatalog): boolean {
  const assigned = new Set(customer.manualTagIds || []);
  const ids = normalizeManualTagIds(filters.tagIds || []).slice(0, 20);
  if (ids.length) {
    const mode = filters.tagMatch || 'grouped';
    if (mode === 'any' && !ids.some((id) => assigned.has(id))) return false;
    if (mode === 'all' && !ids.every((id) => assigned.has(id))) return false;
    if (mode === 'grouped' && !groupTagIdsForFilter(catalog, ids).every((group) => group.some((id) => assigned.has(id)))) return false;
  }
  if (filters.withoutTags && assigned.size !== 0) return false;
  if (filters.missingTagGroupId) {
    const groupIds = catalog.tags.filter((tag) => tag.isActive && tag.groupId === filters.missingTagGroupId).map((tag) => tag.id);
    if (groupIds.some((id) => assigned.has(id))) return false;
  }
  if (filters.tag && !(customer.tags || []).some((name) => name === filters.tag!.trim())) return false;
  return true;
}

/** Shared SQL predicate for list and server-side batch filter snapshots. */
export function buildCustomerWhere(filters: CustomerFilters, catalog?: CustomerTagCatalog): Prisma.Sql {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`domain = ${STORAGE_KEYS.CUSTOMERS}`,
    Prisma.sql`mergedIntoId IS NULL`,
    Prisma.sql`JSON_EXTRACT(data, '$.deletedAt') IS NULL`,
  ];

  const lifecycleCode = cleanText(filters.lifecycleStatusCode);
  if (lifecycleCode) {
    conditions.push(Prisma.sql`${jsonText('$.lifecycleStatusCode')} = ${normalizeLifecycleStatusCode(lifecycleCode)}`);
  } else {
    conditions.push(Prisma.sql`(${jsonText('$.lifecycleStatusCode')} IS NULL OR ${jsonText('$.lifecycleStatusCode')} <> ${LIFECYCLE_STATUS_CODES.PUBLIC_POOL})`);
  }

  if (filters.search) {
    const q = `%${filters.search.trim().toLowerCase()}%`;
    conditions.push(Prisma.sql`(
      ${buildTextLikeCondition('$.name', q)}
      OR ${buildTextLikeCondition('$.company', q)}
      OR ${buildTextLikeCondition('$.phone', q)}
      OR ${buildTextLikeCondition('$.wechat', q)}
    )`);
  }

  if (filters.productLevel) {
    conditions.push(Prisma.sql`${jsonText('$.productLevel')} = ${filters.productLevel}`);
  }

  if (filters.customerLevel) {
    conditions.push(Prisma.sql`${jsonText('$.customerLevel')} = ${filters.customerLevel}`);
  }

  if (filters.owner) {
    if (normalizeLifecycleStatusCode(filters.lifecycleStatusCode) === LIFECYCLE_STATUS_CODES.PUBLIC_POOL) {
      conditions.push(Prisma.sql`${publicPoolLastFollowUpOwnerSql()} = ${filters.owner.trim()}`);
    } else {
      conditions.push(Prisma.sql`${jsonText('$.owner')} = ${filters.owner}`);
    }
  }
  if (filters.followStatus) {
    const hasFollowActivity = Prisma.sql`JSON_SEARCH(data, 'one', 'follow', NULL, '$.activityRecords[*].type') IS NOT NULL`;
    conditions.push(filters.followStatus === 'has_follow'
      ? hasFollowActivity
      : Prisma.sql`NOT (${hasFollowActivity})`);
  }
  if (filters.sourceType) {
    conditions.push(Prisma.sql`${jsonText('$.sourceType')} = ${filters.sourceType}`);
  }
  if (filters.leadSource) {
    conditions.push(buildTextLikeCondition('$.leadSource', `%${filters.leadSource.trim().toLowerCase()}%`));
  }
  if (filters.industry) {
    conditions.push(buildTextLikeCondition('$.industry', `%${filters.industry.trim().toLowerCase()}%`));
  }
  if (filters.city) {
    conditions.push(buildTextLikeCondition('$.city', `%${filters.city.trim().toLowerCase()}%`));
  }
  if (filters.tag) {
    conditions.push(Prisma.sql`JSON_CONTAINS(COALESCE(JSON_EXTRACT(data, '$.tags'), JSON_ARRAY()), JSON_QUOTE(${filters.tag.trim()})) = 1`);
  }
  const ids = normalizeManualTagIds(filters.tagIds || []).slice(0, 20);
  if (ids.length) {
    const mode = filters.tagMatch || 'grouped';
    if (mode === 'any') conditions.push(Prisma.sql`(${Prisma.join(ids.map(containsTagId), ' OR ')})`);
    if (mode === 'all') conditions.push(Prisma.sql`(${Prisma.join(ids.map(containsTagId), ' AND ')})`);
    if (mode === 'grouped') {
      const grouped = groupTagIdsForFilter(catalog || { groups: [], tags: [] }, ids);
      conditions.push(Prisma.sql`(${Prisma.join(grouped.map((group) => Prisma.sql`(${Prisma.join(group.map(containsTagId), ' OR ')})`), ' AND ')})`);
    }
  }
  if (filters.withoutTags) {
    conditions.push(Prisma.sql`JSON_LENGTH(COALESCE(JSON_EXTRACT(data, '$.manualTagIds'), JSON_ARRAY())) = 0`);
  }
  if (filters.missingTagGroupId && catalog) {
    const groupIds = catalog.tags.filter((tag) => tag.isActive && tag.groupId === filters.missingTagGroupId).map((tag) => tag.id);
    if (groupIds.length) conditions.push(Prisma.sql`NOT (${Prisma.join(groupIds.map(containsTagId), ' OR ')})`);
  }

  return Prisma.sql`${Prisma.join(conditions, ' AND ')}`;
}

async function buildVisibilityWhere(
  prisma: CustomerListPrisma,
  currentUser?: AuthenticatedUser | null,
): Promise<{ where: Prisma.Sql; context: CustomerAccessContext | null }> {
  if (!currentUser) return { where: Prisma.sql`1 = 0`, context: null };
  const context = await loadCustomerAccessContext(prisma, currentUser);

  const scopedVisibilityConditions: Prisma.Sql[] = [];
  const readableNames = [...context.legacyReadableNames];
  const readableIds = [...context.readableUserIds];
  if (context.canReadCustomerList && readableNames.length) {
    scopedVisibilityConditions.push(Prisma.sql`(
      ${jsonText('$.ownerId')} IS NULL
      AND COALESCE(${jsonText('$.ownerIdentityStatus')}, '') <> 'resolved'
      AND ${jsonText('$.owner')} IN (${Prisma.join(readableNames)})
    )`);
    scopedVisibilityConditions.push(Prisma.sql`(
      ${jsonText('$.leadContributorId')} IS NULL
      AND ${jsonText('$.leadContributorName')} IN (${Prisma.join(readableNames)})
    )`);
  }
  if (context.canReadCustomerList && readableIds.length) {
    scopedVisibilityConditions.push(Prisma.sql`${jsonText('$.ownerId')} IN (${Prisma.join(readableIds)})`);
    scopedVisibilityConditions.push(Prisma.sql`${jsonText('$.leadContributorId')} IN (${Prisma.join(readableIds)})`);
  }
  const visibilityConditions: Prisma.Sql[] = [];
  if (scopedVisibilityConditions.length) {
    visibilityConditions.push(Prisma.sql`(
      COALESCE(${jsonText('$.lifecycleStatusCode')}, '') <> ${LIFECYCLE_STATUS_CODES.PUBLIC_POOL}
      AND (${Prisma.join(scopedVisibilityConditions, ' OR ')})
    )`);
  }
  if (context.canReadPublicPool) {
    visibilityConditions.push(Prisma.sql`${jsonText('$.lifecycleStatusCode')} = ${LIFECYCLE_STATUS_CODES.PUBLIC_POOL}`);
  }
  return {
    where: visibilityConditions.length
      ? Prisma.sql`(${Prisma.join(visibilityConditions, ' OR ')})`
      : Prisma.sql`1 = 0`,
    context,
  };
}

export function createCustomerListService(
  prisma: CustomerListPrisma,
  options: CustomerListServiceOptions = {},
) {
  const findVisibleCustomerRecord = async (customerId: string, currentUser?: AuthenticatedUser | null) => {
    if (!currentUser) return null;
    const [context, snapshot] = await Promise.all([
      loadCustomerAccessContext(prisma, currentUser),
      createCustomerBusinessRecordRepository(prisma).findById(customerId),
    ]);
    return snapshot && canReadCustomer(context, snapshot.customer) ? snapshot : null;
  };

  return {
    async getById(customerId: string, currentUser?: AuthenticatedUser | null) {
      const snapshot = await findVisibleCustomerRecord(customerId, currentUser);
      return snapshot ? success(snapshot.customer) : failure<Customer>('客户不存在或无权访问', 404);
    },

    async create(
      input: CustomerCreateInput,
      currentUser: AuthenticatedUser,
      execution: CustomerCreateExecutionContext = {},
    ): Promise<ApiResponse<Customer | null>> {
      const database = (execution.tx || prisma) as CustomerListPrisma;
      if (!hasPermission(currentUser, PERMISSION_KEYS.CUSTOMER_CREATE, 'write')) {
        return failure<Customer>('无权新建客户', 403);
      }
      const name = cleanText(input.name);
      if (!name) return failure<Customer>('客户姓名不能为空', 400);
      if (name.length > 100) return failure<Customer>('客户姓名不能超过100个字符', 400);
      const phone = normalizePhoneForStorage(input.phone);
      const wechat = cleanText(input.wechat);
      if (!phone && !wechat) return failure<Customer>('客户手机号或微信至少填写一项', 400);
      const sourceType = normalizeResourceOwnership(input.sourceType);
      const importedLastFollowUpRecord = execution.importDestination
        ? cleanText(execution.importedLastFollowUpRecord)
        : '';
      if (sourceType === '个人资源' && !input.leadContributorId && !input.leadContributorName) {
        return failure<Customer>('个人资源必须填写线索贡献人', 400);
      }

      const importToPublicPool = execution.importDestination === 'public_pool';
      if (importToPublicPool && !hasPermission(currentUser, PERMISSION_KEYS.CUSTOMER_IMPORT, 'write')) {
        return failure<Customer>('无权导入客户', 403);
      }
      if (importToPublicPool && !hasPermission(currentUser, PERMISSION_KEYS.CUSTOMER_RELEASE_TO_POOL, 'write')) {
        return failure<Customer>('无权直接导入公海池', 403);
      }

      // Missing stable identity always means self-assignment. The display name
      // supplied by a client is never used to choose a write target.
      const requestedOwnerId = importToPublicPool ? '' : cleanText(input.ownerId) || currentUser.id;
      const actorName = currentUser.name || currentUser.account;
      let assignmentAccess: CustomerAccessContext | null = null;
      if (requestedOwnerId && requestedOwnerId !== currentUser.id) {
        if (!hasExplicitPermission(currentUser, PERMISSION_KEYS.CUSTOMER_TRANSFER, 'write')) {
          return failure<Customer>('无权把客户转让给其他负责人', 403);
        }
        assignmentAccess = await loadCustomerAccessContext(database, currentUser);
        if (!assignmentAccess.manageableOwnerIds.has(requestedOwnerId)) {
          return failure<Customer>('无权跨数据范围转让客户', 403);
        }
      }
      const targetOwner = importToPublicPool ? null : requestedOwnerId === currentUser.id
        ? { id: currentUser.id, name: actorName, isActive: true, employmentStatus: 'active' }
        : requestedOwnerId
          ? await database.user.findUnique({ where: { id: requestedOwnerId } })
          : null;
      if (!importToPublicPool && (
        !targetOwner
        || !targetOwner.isActive
        || (targetOwner.employmentStatus || 'active') !== 'active'
      )) return failure<Customer>('请选择有效的销售负责人', 400);

      const phoneError = phone ? getPhoneNumberError(phone) : '';
      if (phoneError) return failure<Customer>(phoneError, 400);

      const operation = async (tx: Pick<Prisma.TransactionClient,
        'businessRecord' | 'leadRecord' | 'customerAuditEvent' | 'contactIdentity' | 'contactIdentityLink'
        | 'user' | 'role' | 'department' | 'appStorage' | '$queryRaw'
      >): Promise<ApiResponse<Customer | null>> => {
      await lockContactIdentityMutationGate(tx);
      const catalog = await loadCustomerTagCatalog(tx, false);
      const tagValidation = validateManualTagSelection(catalog, 'customer', input.manualTagIds || []);
      if (!tagValidation.ok) return failure<Customer>(tagValidation.message, 400);
      const tagNames = tagValidation.tagIds.map((id) => catalog.tags.find((tag) => tag.id === id)!.name);

      const now = new Date().toISOString();
      const id = `cust-${randomUUID()}`;
      const customer: Customer = {
        ...input,
        manualTagIds: tagValidation.tagIds,
        tags: tagNames,
        name,
        id,
        phone,
        wechat: wechat || undefined,
        sourceType,
        owner: importToPublicPool ? '公海' : targetOwner!.name,
        ownerId: importToPublicPool ? undefined : targetOwner!.id,
        ownerIdentityStatus: importToPublicPool ? 'public_pool' : 'resolved',
        customerLevel: input.customerLevel || 'L1',
        lifecycleStatusCode: importToPublicPool
          ? LIFECYCLE_STATUS_CODES.PUBLIC_POOL
          : input.lifecycleStatusCode || LIFECYCLE_STATUS_CODES.PENDING_FOLLOWUP,
        lifecycleStatusUpdatedAt: now,
        ...(importToPublicPool ? {
          publicPoolAt: now,
          releasedBy: actorName,
          releaseReason: '批量导入至公海',
        } : {}),
        totalSpent: 0,
        orderCount: 0,
        growthPath: [],
        growthRecords: [],
        activityRecords: [
          ...(importedLastFollowUpRecord ? [{
            id: 'act-' + randomUUID().slice(0, 8),
            type: 'follow' as const,
            title: '历史最后跟进记录',
            content: importedLastFollowUpRecord,
            operator: '跟进人未知',
            createdAt: now,
          }] : []),
          {
            id: 'act-' + randomUUID().slice(0, 8),
            type: 'create',
            title: importToPublicPool ? '导入至公海池' : '创建了客户',
            operator: actorName,
            content: input.remark,
            createdAt: now,
          },
        ],
        createdAt: now,
        updatedAt: now,
      };

      // Create (and therefore lock) the private business record before
      // touching shared contact identities. Customer edit/delete paths take
      // the same business-record -> identity order. A contact conflict aborts
      // this transaction, so the tentative record is never committed.
      await tx.businessRecord.create({
        data: {
          id: STORAGE_KEYS.CUSTOMERS + ':' + id,
          domain: STORAGE_KEYS.CUSTOMERS,
          recordId: id,
          title: customer.name || customer.company || id,
          status: customer.lifecycleStatusCode || null,
          owner: customer.owner || null,
          customerId: id,
          amount: 0,
          eventAt: new Date(now),
          data: customer as any,
        },
      });
      // Resolve disclosure scope from the same transaction as the identity
      // write, so a safe conflict summary never relies on an earlier role
      // directory snapshot.
      const identityConflictAccess = await loadCustomerAccessContext(tx, currentUser);
      await upsertCustomerContactIdentities(tx, {
        customerId: customer.id,
        phone: customer.phone,
        wechat: customer.wechat,
        source: 'customer_create',
        crypto: options.contactIdentityCrypto,
        conflictViewer: {
          canReadCustomerList: identityConflictAccess.canReadCustomerList,
          canReadCustomer: (candidate) => canReadCustomer(identityConflictAccess, candidate),
        },
      });
      await appendCustomerAuditEvent(tx, {
        operation: importToPublicPool ? 'import_customer_to_public_pool' : 'create_customer',
        customerId: customer.id,
        batchJobId: execution.batchJobId,
        requestId: execution.requestId,
        idempotencyKey: execution.idempotencyKey,
        actor: { id: currentUser.id, name: actorName },
        reason: importToPublicPool ? '批量导入至公海' : '创建客户',
        afterSnapshot: customer,
        canonicalInput: {
          operation: importToPublicPool ? 'import_customer_to_public_pool' : 'create_customer',
          name,
          company: cleanText(input.company),
          phone,
          wechat: wechat || null,
          ownerId: targetOwner?.id || null,
          previousOwner: cleanText(input.previousOwner) || null,
          originalSalesTransferBy: cleanText(input.originalSalesTransferBy) || null,
          importDestination: execution.importDestination || 'assigned',
          sourceType,
          manualTagIds: tagValidation.tagIds,
        },
      });
      return success(customer);
      };
      let lastError: unknown;
      const attempts = execution.tx ? 1 : 3;
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
          return execution.tx
            ? await operation(execution.tx as any)
            : await (prisma.$transaction as any)(operation);
        } catch (error) {
          if (error instanceof ContactIdentityConflictError) {
            if (execution.tx) throw error;
            return {
              code: 409,
              data: error.safePayload.customer || null,
              message: error.safePayload.message,
            } as ApiResponse<Customer | null>;
          }
          const conflict = customerWriteConflictResponse<Customer>(error);
          if (conflict) {
            if (execution.tx) throw error;
            return conflict;
          }
          lastError = error;
          if (!isRetryableCustomerCreateConflict(error)) throw error;
          if (attempt === attempts) return failure<Customer>('客户创建发生并发冲突，请稍后重试', 409);
        }
      }
      throw lastError;
    },

    async list(filters: CustomerFilters = {}, currentUser?: AuthenticatedUser | null) {
      const page = toPositiveInt(filters.page, 1);
      const pageSize = Math.min(toPositiveInt(filters.pageSize, DEFAULT_PAGE_SIZE), 100);
      const offset = (page - 1) * pageSize;
      const needsCatalog = Boolean(filters.missingTagGroupId || filters.tagIds?.length);
      const [catalog, visibility] = await Promise.all([
        needsCatalog ? loadCustomerTagCatalog(prisma as any, false) : Promise.resolve(undefined),
        buildVisibilityWhere(prisma, currentUser),
      ]);
      if (catalog) {
        const validation = validateCustomerTagFilters(catalog, filters);
        if (!validation.ok) return failure<PaginatedResponse<Customer>>(validation.message, 400);
      }
      const where = buildCustomerWhere(filters, catalog);
      const combinedWhere = Prisma.sql`${where} AND ${visibility.where}`;
      const countRows = await prisma.$queryRaw<Array<{ total: bigint | number }>>`
        SELECT COUNT(*) AS total
        FROM business_records
        WHERE ${combinedWhere}
      `;
      const total = Number(countRows[0]?.total || 0);
      const rows = await prisma.$queryRaw<CustomerRow[]>`
        SELECT id, domain, recordId, data, updatedAt
        FROM business_records
        WHERE ${combinedWhere}
        ORDER BY COALESCE(eventAt, createdAt) DESC, createdAt DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `;
      const totalPages = Math.ceil(total / pageSize);
      return success<PaginatedResponse<Customer>>({
        items: rows.map(customerFromRow).filter((customer) => (
          visibility.context ? canReadCustomer(visibility.context, customer) : false
        )),
        pagination: { page, pageSize, total, totalPages },
      });
    },

    async listPublicPoolFollowUpOperators(currentUser?: AuthenticatedUser | null) {
      const visibility = await buildVisibilityWhere(prisma, currentUser);
      const where = buildCustomerWhere({ lifecycleStatusCode: LIFECYCLE_STATUS_CODES.PUBLIC_POOL });
      const lastFollowUpOwner = publicPoolLastFollowUpOwnerSql();
      const rows = await prisma.$queryRaw<Array<{ name: string }>>(Prisma.sql`
        SELECT DISTINCT last_follow_up_owner AS name
        FROM (
          SELECT ${lastFollowUpOwner} AS last_follow_up_owner
          FROM business_records
          WHERE ${where} AND ${visibility.where}
        ) AS public_pool_follow_ups
        WHERE last_follow_up_owner <> ''
        ORDER BY last_follow_up_owner
      `);
      return success(rows.map((row) => cleanText(row.name)).filter(Boolean));
    },

    async addFollowUp(customerId: string, input: CustomerActivityInput = {}, currentUser?: AuthenticatedUser | null) {
      const content = cleanText(input.content);
      const attachments = Array.isArray(input.attachments) ? input.attachments : [];
      if (!content && !attachments.length) return failure<Customer>('跟进内容或附件不能为空', 400);

      if (!currentUser) return failure<Customer>('客户不存在或无权访问', 404);
      if (!hasExplicitPermission(currentUser, PERMISSION_KEYS.CUSTOMER_EDIT_PROFILE, 'write')) {
        return failure<Customer>('无权编辑客户资料', 403);
      }
      try {
        return await prisma.$transaction(async (tx) => {
          const repository = createCustomerBusinessRecordRepository(tx as any);
          const snapshot = await repository.lockById(customerId);
          if (!snapshot || snapshot.customer.deletedAt) return failure<Customer>('客户不存在或无权访问', 404);
          const access = await loadCustomerAccessContext(tx as any, currentUser);
          const accessError = permissionMessage(() => {
            assertCustomerFieldPermissions(access, { remark: input.content });
            assertCanManageCustomer(access, snapshot.customer);
          });
          if (accessError) return failure<Customer>(accessError, 403);
          const operator = currentUser.name || currentUser.account || snapshot.customer.owner || '系统';
          const updated = addFollowActivity(snapshot.customer, input, operator);
          await repository.compareAndSave(snapshot, updated, new Date(updated.updatedAt));
          await appendCustomerAuditEvent(tx as any, {
            operation: 'add_follow_up',
            customerId: snapshot.customer.id,
            actor: { id: currentUser.id, name: operator },
            reason: '新增客户跟进',
            beforeSnapshot: snapshot.customer,
            afterSnapshot: updated,
            canonicalInput: {
              operation: 'add_follow_up',
              customerId: snapshot.customer.id,
              type: input.type || '跟进记录',
              content,
              attachmentCount: attachments.length,
            },
          });
          return success(updated);
        });
      } catch (error) {
        const conflict = customerWriteConflictResponse<Customer>(error);
        if (conflict) return conflict;
        throw error;
      }
    },
  };
}
