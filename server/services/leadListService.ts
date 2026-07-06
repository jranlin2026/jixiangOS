import { Prisma, type PrismaClient } from '@prisma/client';
import { success } from '../api/response';
import { DEFAULT_PAGE_SIZE } from '../../src/shared/utils/constants';
import type { PaginatedResponse } from '../../src/api/types';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { Lead, LeadFilters } from '../../src/types/lead';
import { buildDataVisibilityScopeForUser } from '../../src/shared/utils/dataVisibility';
import { mapPrismaRole, mapPrismaUser } from '../db/prismaMappers';

type LeadListPrisma = Pick<PrismaClient, 'leadRecord' | 'user' | 'role' | 'department' | '$queryRaw'>;

type LeadRow = {
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

function leadFromRow(row: LeadRow): Lead {
  return typeof row.data === 'string' ? JSON.parse(row.data) as Lead : row.data as Lead;
}

function jsonText(path: string) {
  return Prisma.raw(`JSON_UNQUOTE(JSON_EXTRACT(data, '${path}'))`);
}

function buildTextLikeCondition(path: string, value: string) {
  return Prisma.sql`LOWER(COALESCE(${jsonText(path)}, '')) LIKE ${value}`;
}

function buildLeadWhere(filters: LeadFilters): Prisma.Sql {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`JSON_EXTRACT(data, '$.deletedAt') IS NULL`,
  ];

  if (filters.search) {
    const q = `%${filters.search.trim().toLowerCase()}%`;
    conditions.push(Prisma.sql`(
      LOWER(COALESCE(name, '')) LIKE ${q}
      OR LOWER(COALESCE(company, '')) LIKE ${q}
      OR LOWER(COALESCE(phone, '')) LIKE ${q}
      OR LOWER(COALESCE(wechat, '')) LIKE ${q}
      OR ${buildTextLikeCondition('$.industry', q)}
      OR ${buildTextLikeCondition('$.city', q)}
    )`);
  }

  if (filters.source) conditions.push(Prisma.sql`source = ${filters.source}`);
  if (filters.status) conditions.push(Prisma.sql`status = ${filters.status}`);
  if (filters.lifecycleStatusCode) conditions.push(Prisma.sql`lifecycleStatusCode = ${filters.lifecycleStatusCode}`);
  if (filters.owner) conditions.push(Prisma.sql`(owner = ${filters.owner} OR assignedTo = ${filters.owner})`);
  if (filters.startDate) conditions.push(Prisma.sql`createdAt >= ${new Date(filters.startDate)}`);
  if (filters.endDate) conditions.push(Prisma.sql`createdAt <= ${new Date(filters.endDate)}`);

  return Prisma.sql`${Prisma.join(conditions, ' AND ')}`;
}

async function buildVisibilityWhere(
  prisma: LeadListPrisma,
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
    'leads',
  );
  if (scope.unrestricted) return Prisma.sql`1 = 1`;

  const visibilityConditions: Prisma.Sql[] = [];
  if (scope.visibleUserNames.length) {
    visibilityConditions.push(Prisma.sql`inputBy IN (${Prisma.join(scope.visibleUserNames)})`);
    visibilityConditions.push(Prisma.sql`assignedTo IN (${Prisma.join(scope.visibleUserNames)})`);
    visibilityConditions.push(Prisma.sql`owner IN (${Prisma.join(scope.visibleUserNames)})`);
    visibilityConditions.push(Prisma.sql`${jsonText('$.leadContributorName')} IN (${Prisma.join(scope.visibleUserNames)})`);
  }
  if (scope.visibleUserIds.length) {
    visibilityConditions.push(Prisma.sql`${jsonText('$.leadContributorId')} IN (${Prisma.join(scope.visibleUserIds)})`);
  }
  if (!visibilityConditions.length) return Prisma.sql`1 = 0`;
  return Prisma.sql`(${Prisma.join(visibilityConditions, ' OR ')})`;
}

export function createLeadListService(prisma: LeadListPrisma) {
  return {
    async list(filters: LeadFilters = {}, currentUser?: AuthenticatedUser | null) {
      const page = toPositiveInt(filters.page, 1);
      const pageSize = Math.min(toPositiveInt(filters.pageSize, DEFAULT_PAGE_SIZE), 100);
      const offset = (page - 1) * pageSize;
      const [where, visibilityWhere] = await Promise.all([
        Promise.resolve(buildLeadWhere(filters)),
        buildVisibilityWhere(prisma, currentUser),
      ]);
      const combinedWhere = Prisma.sql`${where} AND ${visibilityWhere}`;
      const countRows = await prisma.$queryRaw<Array<{ total: bigint | number }>>`
        SELECT COUNT(*) AS total
        FROM lead_records
        WHERE ${combinedWhere}
      `;
      const total = Number(countRows[0]?.total || 0);
      const rows = await prisma.$queryRaw<LeadRow[]>`
        SELECT data
        FROM lead_records
        WHERE ${combinedWhere}
        ORDER BY createdAt DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `;
      const totalPages = Math.ceil(total / pageSize);
      return success<PaginatedResponse<Lead>>({
        items: rows.map(leadFromRow),
        pagination: { page, pageSize, total, totalPages },
      });
    },
  };
}
