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
import type { Customer, CustomerCreateInput, CustomerFilters } from '../../src/types/customer';
import type { ApiResponse, PaginatedResponse } from '../../src/api/types';
import type { AuthenticatedUser } from '../../src/types/auth';
import { buildDataVisibilityScopeForUser } from '../../src/shared/utils/dataVisibility';
import { mapPrismaRole, mapPrismaUser } from '../db/prismaMappers';
import {
  getPhoneNumberError,
  normalizePhoneForComparison,
  normalizePhoneForStorage,
} from '../../src/shared/utils/phoneNumber';
import { PERMISSION_KEYS, hasPermission } from '../../src/shared/utils/permissions';
import { loadCustomerTagCatalog } from './customerTagService';
import { validateManualTagSelection } from './customerTagPolicy';
import { groupTagIdsForFilter, normalizeManualTagIds, validateCustomerTagFilters } from '../../src/shared/utils/customerTagPolicy';
import type { CustomerTagCatalog } from '../../src/types/tag';

type CustomerListPrisma = Pick<PrismaClient, 'businessRecord' | 'leadRecord' | 'user' | 'role' | 'department' | '$queryRaw' | '$transaction'>;

type CustomerRow = {
  id?: string;
  data: unknown;
};

type CustomerActivityInput = {
  content?: string;
  operator?: string;
  type?: '联系记录' | '客户行为' | '销售活动' | '跟进记录';
  attachments?: Customer['activityRecords'] extends Array<infer T> ? T extends { attachments?: infer A } ? A : never : never;
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
  return typeof row.data === 'string' ? JSON.parse(row.data) as Customer : row.data as Customer;
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

function releaseCustomer(customer: Customer, reason: string, operator: string): Customer {
  const now = new Date().toISOString();
  return {
    ...customer,
    owner: '公海',
    lifecycleStatusCode: LIFECYCLE_STATUS_CODES.PUBLIC_POOL,
    lifecycleStatusUpdatedAt: now,
    publicPoolAt: now,
    releasedBy: operator,
    releaseReason: reason,
    activityRecords: [
      {
        id: createActivityId(),
        type: 'transfer',
        title: '释放到公海',
        content: reason || '销售放弃跟进，客户进入公海池',
        operator,
        createdAt: now,
        changes: [{
          field: 'owner',
          label: '销售负责人',
          oldValue: customer.owner,
          newValue: '公海',
        }],
      },
      ...(customer.activityRecords || []),
    ],
    updatedAt: now,
  };
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
      LOWER(COALESCE(title, '')) LIKE ${q}
      OR ${buildTextLikeCondition('$.name', q)}
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
      conditions.push(Prisma.sql`(${jsonText('$.releasedBy')} = ${filters.owner} OR owner = ${filters.owner})`);
    } else {
      conditions.push(Prisma.sql`owner = ${filters.owner}`);
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
): Promise<Prisma.Sql> {
  if (!currentUser) return Prisma.sql`1 = 0`;
  const [users, roles, departments] = await Promise.all([
    prisma.user.findMany(),
    prisma.role.findMany({ where: { isActive: true } }),
    prisma.department.findMany(),
  ]);
  const scope = buildDataVisibilityScopeForUser(
    currentUser,
    users.map(mapPrismaUser),
    roles.map(mapPrismaRole),
    departments as any,
    'customers',
  );
  if (scope.unrestricted) return Prisma.sql`1 = 1`;

  const visibilityConditions: Prisma.Sql[] = [];
  if (scope.visibleUserNames.length) {
    visibilityConditions.push(Prisma.sql`(${jsonText('$.ownerId')} IS NULL AND ${jsonText('$.ownerIdentityStatus')} IS NULL AND owner IN (${Prisma.join(scope.visibleUserNames)}))`);
    visibilityConditions.push(Prisma.sql`${jsonText('$.leadContributorName')} IN (${Prisma.join(scope.visibleUserNames)})`);
  }
  if (scope.visibleUserIds.length) {
    visibilityConditions.push(Prisma.sql`${jsonText('$.ownerId')} IN (${Prisma.join(scope.visibleUserIds)})`);
    visibilityConditions.push(Prisma.sql`${jsonText('$.leadContributorId')} IN (${Prisma.join(scope.visibleUserIds)})`);
  }
  if (scope.canViewPublicPool) {
    visibilityConditions.push(Prisma.sql`${jsonText('$.lifecycleStatusCode')} = ${LIFECYCLE_STATUS_CODES.PUBLIC_POOL}`);
  }
  if (!visibilityConditions.length) return Prisma.sql`1 = 0`;
  return Prisma.sql`(${Prisma.join(visibilityConditions, ' OR ')})`;
}

export function createCustomerListService(prisma: CustomerListPrisma) {
  const findVisibleCustomerRecord = async (customerId: string, currentUser?: AuthenticatedUser | null) => {
    const visibilityWhere = await buildVisibilityWhere(prisma, currentUser);
    const rows = await prisma.$queryRaw<CustomerRow[]>`
      SELECT id, data
      FROM business_records
      WHERE domain = ${STORAGE_KEYS.CUSTOMERS}
        AND JSON_EXTRACT(data, '$.deletedAt') IS NULL
        AND ${jsonText('$.id')} = ${customerId}
        AND ${visibilityWhere}
      LIMIT 1
    `;
    return rows[0] || null;
  };

  const syncLeadRelease = async (customer: Customer, reason: string, operator: string) => {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`${jsonText('$.customerId')} = ${customer.id}`,
    ];
    if (customer.phone) conditions.push(Prisma.sql`phone = ${customer.phone}`);
    if (customer.wechat) conditions.push(Prisma.sql`wechat = ${customer.wechat}`);

    const rows = await prisma.$queryRaw<Array<{ id: string; data: unknown }>>`
      SELECT id, data
      FROM lead_records
      WHERE ${Prisma.join(conditions, ' OR ')}
    `;
    const now = new Date();
    const nowIso = now.toISOString();
    for (const leadRow of rows) {
      const lead = typeof leadRow.data === 'string' ? JSON.parse(leadRow.data) as Record<string, any> : leadRow.data as Record<string, any>;
      const nextLead = {
        ...lead,
        owner: '公海',
        assignedTo: undefined,
        lifecycleStatusCode: LIFECYCLE_STATUS_CODES.PUBLIC_POOL,
        lifecycleStatusUpdatedAt: nowIso,
        changeHistory: [{
          id: `hist-${Math.random().toString(36).slice(2, 10)}`,
          action: 'update',
          operator,
          changedAt: nowIso,
          summary: reason || '销售放弃跟进，客户进入公海池',
          changes: [
            { field: 'owner', label: '负责人', oldValue: lead.owner, newValue: '公海' },
            { field: 'assignedTo', label: '分配销售', oldValue: lead.assignedTo, newValue: undefined },
          ],
        }, ...(Array.isArray(lead.changeHistory) ? lead.changeHistory : [])],
        updatedAt: nowIso,
      };
      await prisma.leadRecord.update({
        where: { id: leadRow.id },
        data: {
          owner: '公海',
          assignedTo: null,
          lifecycleStatusCode: LIFECYCLE_STATUS_CODES.PUBLIC_POOL,
          data: nextLead as any,
          updatedAt: now,
        },
      });
    }
  };

  return {
    async getById(customerId: string, currentUser?: AuthenticatedUser | null) {
      const row = await findVisibleCustomerRecord(customerId, currentUser);
      return row ? success(customerFromRow(row)) : failure<Customer>('客户不存在或无权访问', 404);
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

      const requestedOwnerId = cleanText(input.ownerId) || (cleanText(input.owner) === currentUser.name ? currentUser.id : '');
      const requestedOwner = cleanText(input.owner);
      const actorName = currentUser.name || currentUser.account;
      if (requestedOwnerId && requestedOwnerId !== currentUser.id && !hasPermission(currentUser, PERMISSION_KEYS.CUSTOMER_ASSIGN, 'write')) {
        return failure<Customer>('无权把客户分配给其他负责人', 403);
      }
      if (!requestedOwnerId && requestedOwner && requestedOwner !== actorName) {
        return failure<Customer>('无权把客户分配给其他负责人', 403);
      }
      const targetOwner = requestedOwnerId === currentUser.id
        ? { id: currentUser.id, name: actorName }
        : requestedOwnerId
          ? await prisma.user.findUnique({ where: { id: requestedOwnerId } })
          : null;
      if (!targetOwner) return failure<Customer>('请选择有效的销售负责人', 400);

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
        select: { data: true },
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
      const [catalog, visibilityWhere] = await Promise.all([
        needsCatalog ? loadCustomerTagCatalog(prisma as any, false) : Promise.resolve(undefined),
        buildVisibilityWhere(prisma, currentUser),
      ]);
      if (catalog) {
        const validation = validateCustomerTagFilters(catalog, filters);
        if (!validation.ok) return failure<PaginatedResponse<Customer>>(validation.message, 400);
      }
      const where = buildCustomerWhere(filters, catalog);
      const combinedWhere = Prisma.sql`${where} AND ${visibilityWhere}`;
      const countRows = await prisma.$queryRaw<Array<{ total: bigint | number }>>`
        SELECT COUNT(*) AS total
        FROM business_records
        WHERE ${combinedWhere}
      `;
      const total = Number(countRows[0]?.total || 0);
      const rows = await prisma.$queryRaw<CustomerRow[]>`
        SELECT data
        FROM business_records
        WHERE ${combinedWhere}
        ORDER BY COALESCE(eventAt, createdAt) DESC, createdAt DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `;
      const totalPages = Math.ceil(total / pageSize);
      return success<PaginatedResponse<Customer>>({
        items: rows.map(customerFromRow),
        pagination: { page, pageSize, total, totalPages },
      });
    },

    async addFollowUp(customerId: string, input: CustomerActivityInput = {}, currentUser?: AuthenticatedUser | null) {
      const content = cleanText(input.content);
      const attachments = Array.isArray(input.attachments) ? input.attachments : [];
      if (!content && !attachments.length) return failure<Customer>('跟进内容或附件不能为空', 400);

      const row = await findVisibleCustomerRecord(customerId, currentUser);
      if (!row?.id) return failure<Customer>('客户不存在或无权访问', 404);

      const customer = customerFromRow(row);
      const operator = cleanText(input.operator) || currentUser?.name || currentUser?.account || customer.owner || '系统';
      const updated = addFollowActivity(customer, input, operator);
      await prisma.businessRecord.update({
        where: { id: row.id },
        data: {
          status: updated.lifecycleStatusCode || null,
          owner: updated.owner || null,
          customerId: updated.id || null,
          amount: Number.isFinite(Number(updated.totalSpent)) ? Number(updated.totalSpent) : null,
          eventAt: new Date(updated.updatedAt),
          data: updated as any,
        },
      });
      return success(updated);
    },

    async releaseToPublicPool(customerId: string, reasonInput = '', currentUser?: AuthenticatedUser | null) {
      const row = await findVisibleCustomerRecord(customerId, currentUser);
      if (!row?.id) return failure<Customer>('客户不存在或无权访问', 404);

      const customer = customerFromRow(row);
      const reason = cleanText(reasonInput) || '销售放弃跟进，客户进入公海池';
      const operator = currentUser?.name || currentUser?.account || customer.owner || '系统';
      const updated = releaseCustomer(customer, reason, operator);
      const eventAt = new Date(updated.updatedAt);

      await prisma.businessRecord.update({
        where: { id: row.id },
        data: {
          status: updated.lifecycleStatusCode || null,
          owner: updated.owner || null,
          customerId: updated.id || null,
          amount: Number.isFinite(Number(updated.totalSpent)) ? Number(updated.totalSpent) : null,
          eventAt,
          data: updated as any,
        },
      });
      await syncLeadRelease(updated, reason, operator);
      return success(updated);
    },
  };
}
