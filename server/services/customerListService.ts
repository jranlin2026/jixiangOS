import { Prisma, type PrismaClient } from '@prisma/client';
import { failure, success } from '../api/response';
import { STORAGE_KEYS, DEFAULT_PAGE_SIZE, LIFECYCLE_STATUS_CODES, normalizeLifecycleStatusCode } from '../../src/shared/utils/constants';
import type { Customer, CustomerFilters } from '../../src/types/customer';
import type { PaginatedResponse } from '../../src/api/types';
import type { AuthenticatedUser } from '../../src/types/auth';
import { buildDataVisibilityScopeForUser } from '../../src/shared/utils/dataVisibility';
import { mapPrismaRole, mapPrismaUser } from '../db/prismaMappers';

type CustomerListPrisma = Pick<PrismaClient, 'businessRecord' | 'leadRecord' | 'user' | 'role' | 'department' | '$queryRaw'>;

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

function buildJsonArraySearchCondition(path: string, value: string) {
  return Prisma.sql`JSON_SEARCH(data, 'one', ${value}, NULL, ${Prisma.raw(`'${path}'`)}) IS NOT NULL`;
}

function buildCustomerWhere(filters: CustomerFilters, currentUser?: AuthenticatedUser | null): Prisma.Sql {
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
    conditions.push(buildJsonArraySearchCondition('$.tags[*]', `%${filters.tag.trim()}%`));
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
    visibilityConditions.push(Prisma.sql`owner IN (${Prisma.join(scope.visibleUserNames)})`);
    visibilityConditions.push(Prisma.sql`${jsonText('$.leadContributorName')} IN (${Prisma.join(scope.visibleUserNames)})`);
  }
  if (scope.visibleUserIds.length) {
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
    async list(filters: CustomerFilters = {}, currentUser?: AuthenticatedUser | null) {
      const page = toPositiveInt(filters.page, 1);
      const pageSize = Math.min(toPositiveInt(filters.pageSize, DEFAULT_PAGE_SIZE), 100);
      const offset = (page - 1) * pageSize;
      const [where, visibilityWhere] = await Promise.all([
        Promise.resolve(buildCustomerWhere(filters, currentUser)),
        buildVisibilityWhere(prisma, currentUser),
      ]);
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
