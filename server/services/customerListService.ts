import { Prisma, type PrismaClient } from '@prisma/client';
import { success } from '../api/response';
import { STORAGE_KEYS, DEFAULT_PAGE_SIZE, LIFECYCLE_STATUS_CODES, normalizeLifecycleStatusCode } from '../../src/shared/utils/constants';
import type { Customer, CustomerFilters } from '../../src/types/customer';
import type { PaginatedResponse } from '../../src/api/types';
import type { AuthenticatedUser } from '../../src/types/auth';
import { buildDataVisibilityScopeForUser } from '../../src/shared/utils/dataVisibility';
import { mapPrismaRole, mapPrismaUser } from '../db/prismaMappers';

type CustomerListPrisma = Pick<PrismaClient, 'businessRecord' | 'user' | 'role' | 'department' | '$queryRaw'>;

type CustomerRow = {
  data: unknown;
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

function jsonText(path: string) {
  return Prisma.raw(`JSON_UNQUOTE(JSON_EXTRACT(data, '${path}'))`);
}

function buildTextLikeCondition(path: string, value: string) {
  return Prisma.sql`LOWER(COALESCE(${jsonText(path)}, '')) LIKE ${value}`;
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
  };
}
