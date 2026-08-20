import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { failure, success, type ApiResponse } from '../api/response';
import { assertMarketingContentReadyForPublish, nextMarketingContentStatus } from '../../src/domain/marketing/marketingContent';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { hasPermission, PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import type { AuthenticatedUser } from '../../src/types/auth';
import type {
  MarketingAccountGroup,
  MarketingAccountGroupInput,
  MarketingContent,
  MarketingContentFilters,
  MarketingContentInput,
} from '../../src/types/marketing';

type MarketingPrisma = Pick<PrismaClient, 'appStorage'>;
type Paginated<T> = { items: T[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } };

const clean = (value: unknown) => String(value || '').trim();
const cleanList = (value: unknown) => Array.from(new Set((Array.isArray(value) ? value : [])
  .map((item) => clean(item)).filter(Boolean)));
const jsonValue = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

async function readArray<T>(prisma: MarketingPrisma, key: string): Promise<T[]> {
  const row = await prisma.appStorage.findUnique({ where: { key } });
  if (!row) {
    await prisma.appStorage.create({ data: { key, value: [] } });
    return [];
  }
  return Array.isArray(row.value) ? structuredClone(row.value) as T[] : [];
}

async function writeArray<T>(prisma: MarketingPrisma, key: string, rows: T[]): Promise<void> {
  await prisma.appStorage.upsert({
    where: { key },
    create: { key, value: jsonValue(rows) },
    update: { value: jsonValue(rows) },
  });
}

function paginate<T>(rows: T[], filters: MarketingContentFilters): Paginated<T> {
  const page = Math.max(1, Number(filters.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize || 10)));
  const total = rows.length;
  return {
    items: rows.slice((page - 1) * pageSize, page * pageSize),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

export function createMarketingContentService(prisma: MarketingPrisma) {
  const canPublish = (actor: AuthenticatedUser) => hasPermission(actor, PERMISSION_KEYS.MARKETING_PUBLISH, 'read');
  const canRead = (actor: AuthenticatedUser) => hasPermission(actor, PERMISSION_KEYS.MARKETING_CONTENT, 'read') || canPublish(actor);
  const canWrite = (actor: AuthenticatedUser) => hasPermission(actor, PERMISSION_KEYS.MARKETING_CONTENT, 'write');
  const canReview = (actor: AuthenticatedUser) => hasPermission(actor, PERMISSION_KEYS.MARKETING_REVIEW, 'write');
  const canManageGroups = (actor: AuthenticatedUser) => hasPermission(actor, PERMISSION_KEYS.MARKETING_GROUPS, 'write');

  return {
    async listContents(filters: MarketingContentFilters, actor: AuthenticatedUser): Promise<ApiResponse<Paginated<MarketingContent> | null>> {
      if (!canRead(actor)) return failure('无权查看营销内容', 403);
      const keyword = clean(filters.search).toLowerCase();
      const rows = (await readArray<MarketingContent>(prisma, STORAGE_KEYS.MARKETING_CONTENTS))
        .filter((item) => !keyword || [item.title, item.theme, item.copywriting, item.owner].some((value) => clean(value).toLowerCase().includes(keyword)))
        .filter((item) => !filters.contentType || item.contentType === filters.contentType)
        .filter((item) => !filters.status || item.status === filters.status)
        .filter((item) => !filters.platform || item.platforms.includes(filters.platform))
        .filter((item) => !filters.plannedDate || clean(item.plannedAt).slice(0, 10) === filters.plannedDate)
        .filter((item) => canWrite(actor) || item.status === 'APPROVED')
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return success(paginate(rows, filters));
    },

    async createContent(input: Partial<MarketingContentInput>, actor: AuthenticatedUser): Promise<ApiResponse<MarketingContent | null>> {
      if (!canWrite(actor)) return failure('无权创建营销内容', 403);
      const title = clean(input.title);
      const platforms = cleanList(input.platforms);
      const contentType = input.contentType;
      if (!title || !contentType || !platforms.length) return failure('标题、内容类型和适用平台不能为空', 400);
      const now = new Date().toISOString();
      const created: MarketingContent = {
        id: `marketing-content-${randomUUID()}`,
        title,
        contentType,
        theme: clean(input.theme),
        platforms,
        copywriting: clean(input.copywriting),
        imageLinks: cleanList(input.imageLinks),
        videoUrl: clean(input.videoUrl) || undefined,
        coverUrl: clean(input.coverUrl) || undefined,
        ownerId: clean(input.ownerId) || actor.id,
        owner: clean(input.owner) || actor.name,
        plannedAt: clean(input.plannedAt) || undefined,
        expiresAt: clean(input.expiresAt) || undefined,
        visibility: input.visibility === 'DEPARTMENT' ? 'DEPARTMENT' : 'ALL',
        departmentId: clean(input.departmentId) || undefined,
        department: clean(input.department) || undefined,
        usageNotes: clean(input.usageNotes) || undefined,
        status: 'DRAFT',
        version: 1,
        createdBy: actor.name,
        createdAt: now,
        updatedAt: now,
      };
      const rows = await readArray<MarketingContent>(prisma, STORAGE_KEYS.MARKETING_CONTENTS);
      await writeArray(prisma, STORAGE_KEYS.MARKETING_CONTENTS, [created, ...rows]);
      return success(created);
    },

    async updateContent(id: string, input: Partial<MarketingContentInput>, actor: AuthenticatedUser): Promise<ApiResponse<MarketingContent | null>> {
      if (!canWrite(actor)) return failure('无权编辑营销内容', 403);
      const rows = await readArray<MarketingContent>(prisma, STORAGE_KEYS.MARKETING_CONTENTS);
      const index = rows.findIndex((item) => item.id === id);
      if (index < 0) return failure('营销内容不存在', 404);
      if (!['DRAFT', 'REJECTED'].includes(rows[index].status)) return failure('只有草稿或已驳回内容可以编辑', 409);
      const current = rows[index];
      const next: MarketingContent = {
        ...current,
        ...input,
        title: input.title === undefined ? current.title : clean(input.title),
        theme: input.theme === undefined ? current.theme : clean(input.theme),
        platforms: input.platforms === undefined ? current.platforms : cleanList(input.platforms),
        copywriting: input.copywriting === undefined ? current.copywriting : clean(input.copywriting),
        imageLinks: input.imageLinks === undefined ? current.imageLinks : cleanList(input.imageLinks),
        videoUrl: input.videoUrl === undefined ? current.videoUrl : clean(input.videoUrl) || undefined,
        version: current.version + 1,
        updatedAt: new Date().toISOString(),
      };
      if (!next.title || !next.platforms.length) return failure('标题和适用平台不能为空', 400);
      rows[index] = next;
      await writeArray(prisma, STORAGE_KEYS.MARKETING_CONTENTS, rows);
      return success(next);
    },

    async transitionContent(id: string, action: 'SUBMIT' | 'APPROVE' | 'REJECT' | 'RETIRE', comment: string, actor: AuthenticatedUser): Promise<ApiResponse<MarketingContent | null>> {
      const reviewAction = action === 'APPROVE' || action === 'REJECT';
      if (reviewAction ? !canReview(actor) : !canWrite(actor)) return failure(reviewAction ? '无权审核营销内容' : '无权维护营销内容', 403);
      const rows = await readArray<MarketingContent>(prisma, STORAGE_KEYS.MARKETING_CONTENTS);
      const index = rows.findIndex((item) => item.id === id);
      if (index < 0) return failure('营销内容不存在', 404);
      try {
        if (action === 'SUBMIT' || action === 'APPROVE') assertMarketingContentReadyForPublish({ ...rows[index], status: 'APPROVED' });
        if (action === 'REJECT' && !clean(comment)) return failure('驳回时必须填写审核意见', 400);
        const status = nextMarketingContentStatus(rows[index].status, action);
        const now = new Date().toISOString();
        rows[index] = {
          ...rows[index], status, reviewComment: clean(comment) || undefined,
          reviewedBy: reviewAction ? actor.name : rows[index].reviewedBy,
          reviewedAt: reviewAction ? now : rows[index].reviewedAt,
          updatedAt: now,
        };
        await writeArray(prisma, STORAGE_KEYS.MARKETING_CONTENTS, rows);
        return success(rows[index]);
      } catch (error) {
        return failure(error instanceof Error ? error.message : '内容状态更新失败', 400);
      }
    },

    async listGroups(actor: AuthenticatedUser): Promise<ApiResponse<MarketingAccountGroup[] | null>> {
      if (!hasPermission(actor, PERMISSION_KEYS.MARKETING_GROUPS, 'read') && !canPublish(actor)) return failure('无权查看账号分组', 403);
      const rows = await readArray<MarketingAccountGroup>(prisma, STORAGE_KEYS.MARKETING_ACCOUNT_GROUPS);
      return success(rows.sort((a, b) => a.platform.localeCompare(b.platform, 'zh-CN') || a.name.localeCompare(b.name, 'zh-CN')));
    },

    async saveGroup(id: string | undefined, input: Partial<MarketingAccountGroupInput>, actor: AuthenticatedUser): Promise<ApiResponse<MarketingAccountGroup | null>> {
      if (!canManageGroups(actor)) return failure('无权维护账号分组', 403);
      const name = clean(input.name);
      const platform = clean(input.platform);
      const accountIds = cleanList(input.accountIds);
      if (!name || !platform || !accountIds.length) return failure('分组名称、平台和账号不能为空', 400);
      const accounts = await readArray<{ id: string; platform?: string }>(prisma, STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS);
      const accountById = new Map(accounts.map((account) => [account.id, account]));
      const missingAccountId = accountIds.find((accountId) => !accountById.has(accountId));
      if (missingAccountId) return failure('账号组包含已删除或不存在的账号，请重新选择', 400);
      const mismatchedAccountId = accountIds.find((accountId) => clean(accountById.get(accountId)?.platform) !== platform);
      if (mismatchedAccountId) return failure('账号组只能包含与分组平台一致的账号', 400);
      const rows = await readArray<MarketingAccountGroup>(prisma, STORAGE_KEYS.MARKETING_ACCOUNT_GROUPS);
      if (rows.some((item) => item.id !== id && item.name === name)) return failure('账号组名称已存在', 409);
      const now = new Date().toISOString();
      const current = rows.find((item) => item.id === id);
      const next: MarketingAccountGroup = {
        id: current?.id || `marketing-group-${randomUUID()}`,
        name, platform, accountIds, tags: cleanList(input.tags), remark: clean(input.remark) || undefined,
        createdBy: current?.createdBy || actor.name, createdAt: current?.createdAt || now, updatedAt: now,
      };
      await writeArray(prisma, STORAGE_KEYS.MARKETING_ACCOUNT_GROUPS, current
        ? rows.map((item) => item.id === current.id ? next : item)
        : [next, ...rows]);
      return success(next);
    },

    async deleteGroup(id: string, actor: AuthenticatedUser): Promise<ApiResponse<boolean | null>> {
      if (!canManageGroups(actor)) return failure('无权删除账号分组', 403);
      const rows = await readArray<MarketingAccountGroup>(prisma, STORAGE_KEYS.MARKETING_ACCOUNT_GROUPS);
      if (!rows.some((item) => item.id === id)) return failure('账号组不存在', 404);
      await writeArray(prisma, STORAGE_KEYS.MARKETING_ACCOUNT_GROUPS, rows.filter((item) => item.id !== id));
      return success(true);
    },
  };
}
