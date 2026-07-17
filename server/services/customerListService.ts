import { Prisma, type PrismaClient } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
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
  normalizePhoneForComparison,
  normalizePhoneForStorage,
} from '../../src/shared/utils/phoneNumber';
import { PERMISSION_KEYS, hasExplicitPermission, hasPermission } from '../../src/shared/utils/permissions';
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

type CustomerListPrisma = Pick<PrismaClient, 'businessRecord' | 'leadRecord' | 'user' | 'role' | 'department' | '$queryRaw' | '$transaction'>;

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

function buildCustomerWhere(filters: CustomerFilters, catalog?: CustomerTagCatalog): Prisma.Sql {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`domain = ${STORAGE_KEYS.CUSTOMERS}`,
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
      conditions.push(Prisma.sql`(${jsonText('$.releasedBy')} = ${filters.owner} OR ${jsonText('$.owner')} = ${filters.owner})`);
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

  const visibilityConditions: Prisma.Sql[] = [];
  const readableNames = [...context.legacyReadableNames];
  const readableIds = [...context.readableUserIds];
  if (readableNames.length) {
    visibilityConditions.push(Prisma.sql`(
      ${jsonText('$.ownerId')} IS NULL
      AND COALESCE(${jsonText('$.ownerIdentityStatus')}, '') <> 'resolved'
      AND ${jsonText('$.owner')} IN (${Prisma.join(readableNames)})
    )`);
    visibilityConditions.push(Prisma.sql`(
      ${jsonText('$.leadContributorId')} IS NULL
      AND ${jsonText('$.leadContributorName')} IN (${Prisma.join(readableNames)})
    )`);
  }
  if (readableIds.length) {
    visibilityConditions.push(Prisma.sql`${jsonText('$.ownerId')} IN (${Prisma.join(readableIds)})`);
    visibilityConditions.push(Prisma.sql`${jsonText('$.leadContributorId')} IN (${Prisma.join(readableIds)})`);
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

export function createCustomerListService(prisma: CustomerListPrisma) {
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

    async create(input: CustomerCreateInput, currentUser: AuthenticatedUser): Promise<ApiResponse<Customer | null>> {
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
      if (sourceType === '个人资源' && !input.leadContributorId && !input.leadContributorName) {
        return failure<Customer>('个人资源必须填写线索贡献人', 400);
      }

      // Missing stable identity always means self-assignment. The display name
      // supplied by a client is never used to choose a write target.
      const requestedOwnerId = cleanText(input.ownerId) || currentUser.id;
      const actorName = currentUser.name || currentUser.account;
      let assignmentAccess: CustomerAccessContext | null = null;
      if (requestedOwnerId && requestedOwnerId !== currentUser.id) {
        if (!hasExplicitPermission(currentUser, PERMISSION_KEYS.CUSTOMER_TRANSFER, 'write')) {
          return failure<Customer>('无权把客户分配给其他负责人', 403);
        }
        assignmentAccess = await loadCustomerAccessContext(prisma, currentUser);
        if (!assignmentAccess.manageableOwnerIds.has(requestedOwnerId)) {
          return failure<Customer>('无权跨数据范围分配客户', 403);
        }
      }
      const targetOwner = requestedOwnerId === currentUser.id
        ? { id: currentUser.id, name: actorName, isActive: true, employmentStatus: 'active' }
        : requestedOwnerId
          ? await prisma.user.findUnique({ where: { id: requestedOwnerId } })
          : null;
      if (
        !targetOwner
        || !targetOwner.isActive
        || (targetOwner.employmentStatus || 'active') !== 'active'
      ) return failure<Customer>('请选择有效的销售负责人', 400);

      const phoneError = phone ? getPhoneNumberError(phone) : '';
      if (phoneError) return failure<Customer>(phoneError, 400);

      const comparablePhone = phone ? normalizePhoneForComparison(phone) : '';
      const comparableWechat = wechat.toLowerCase();
      const operation = async (tx: Pick<Prisma.TransactionClient, 'businessRecord' | 'leadRecord'>): Promise<ApiResponse<Customer | null>> => {
      const catalog = await loadCustomerTagCatalog(tx, false);
      const tagValidation = validateManualTagSelection(catalog, 'customer', input.manualTagIds || []);
      if (!tagValidation.ok) return failure<Customer>(tagValidation.message, 400);
      const tagNames = tagValidation.tagIds.map((id) => catalog.tags.find((tag) => tag.id === id)!.name);
      const existingCustomerRows = await tx.businessRecord.findMany({
        where: { domain: STORAGE_KEYS.CUSTOMERS },
        select: { id: true, domain: true, recordId: true, data: true, updatedAt: true },
      });
      const phoneExists = existingCustomerRows.some((row) => {
        const existing = customerFromRow(row);
        if (existing.deletedAt) return false;
        if (comparablePhone && normalizePhoneForComparison(existing.phone) === comparablePhone) return true;
        return Boolean(comparableWechat && cleanText(existing.wechat).toLowerCase() === comparableWechat);
      });
      if (phoneExists) return failure<Customer>(comparablePhone ? '该手机号已存在客户' : '该微信号已存在客户', 409);

      const now = new Date().toISOString();
      const identity = comparablePhone ? `phone:${comparablePhone}` : `wechat:${comparableWechat}`;
      const id = `cust-${createHash('sha256').update(identity).digest('hex').slice(0, 16)}`;
      const customer: Customer = {
        ...input,
        manualTagIds: tagValidation.tagIds,
        tags: tagNames,
        name,
        id,
        phone,
        wechat: wechat || undefined,
        sourceType,
        owner: targetOwner.name,
        ownerId: targetOwner.id,
        ownerIdentityStatus: 'resolved',
        customerLevel: input.customerLevel || 'L1',
        lifecycleStatusCode: input.lifecycleStatusCode || LIFECYCLE_STATUS_CODES.PENDING_FOLLOWUP,
        lifecycleStatusUpdatedAt: now,
        totalSpent: 0,
        orderCount: 0,
        growthPath: [],
        growthRecords: [],
        activityRecords: [{
          id: 'act-' + randomUUID().slice(0, 8),
          type: 'create',
          title: '创建了客户',
          operator: actorName,
          content: input.remark,
          createdAt: now,
        }],
        createdAt: now,
        updatedAt: now,
      };

      try {
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
      } catch (error) {
        if ((error as { code?: unknown } | null)?.code === 'P2002') {
          return failure<Customer>(comparablePhone ? '该手机号已存在客户' : '该微信号已存在客户', 409);
        }
        throw error;
      }
      return success(customer);
      };
      return prisma.$transaction ? (prisma.$transaction as any)(operation) : operation(prisma as any);
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
