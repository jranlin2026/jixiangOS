import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import express, { type RequestHandler } from 'express';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { CustomerTag, CustomerTagCatalog, CustomerTagGroup } from '../../src/types/tag';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { failure, success } from '../api/response';

type CatalogPrisma = {
  businessRecord: Prisma.TransactionClient['businessRecord'];
  leadRecord?: Prisma.TransactionClient['leadRecord'];
  role: { findUnique(args: { where: { id: string } }): Promise<{ code: string; isActive: boolean } | null> };
  $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T>;
};

type CatalogReadTx = Pick<Prisma.TransactionClient, 'businessRecord' | 'leadRecord'>;

type GroupInput = Partial<Pick<CustomerTagGroup, 'name' | 'color' | 'selectionMode' | 'scope' | 'isActive' | 'sortOrder'>>;
type TagInput = Partial<Pick<CustomerTag, 'groupId' | 'name' | 'color' | 'isActive' | 'sortOrder'>>;

const object = (value: unknown): Record<string, any> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
);
const normalizeName = (value: unknown) => String(value || '').trim();
const normalizedKey = (value: unknown) => normalizeName(value).toLocaleLowerCase();
const now = () => new Date().toISOString();
const GROUP_FIELDS = new Set(['name', 'color', 'selectionMode', 'scope', 'isActive', 'sortOrder']);
const TAG_FIELDS = new Set(['groupId', 'name', 'color', 'isActive', 'sortOrder']);

function validateInput(input: unknown, allowed: Set<string>, create: boolean, kind: 'group' | 'tag'): string | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return '请求数据格式错误';
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some((key) => !allowed.has(key))) return '请求包含不允许的字段';
  if (create && typeof value.name !== 'string') return '名称必须为字符串';
  if (value.name !== undefined && (typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 80)) return '名称长度必须为 1-80 个字符';
  if (value.color !== undefined && (typeof value.color !== 'string' || value.color.trim().length > 32)) return '颜色必须是不超过 32 个字符的字符串';
  if (value.isActive !== undefined && typeof value.isActive !== 'boolean') return '启用状态必须为布尔值';
  if (value.sortOrder !== undefined && (!Number.isInteger(value.sortOrder) || Number(value.sortOrder) < 0 || Number(value.sortOrder) > 1_000_000)) return '排序值必须是 0-1000000 的整数';
  if (kind === 'group') {
    if (value.selectionMode !== undefined && !['single', 'multiple'].includes(String(value.selectionMode))) return '标签组选择模式无效';
    if (value.scope !== undefined && !['lead', 'customer', 'both'].includes(String(value.scope))) return '标签组范围无效';
  } else if ((create || value.groupId !== undefined) && (typeof value.groupId !== 'string' || !value.groupId.trim() || value.groupId.length > 80)) {
    return '标签组 ID 无效';
  }
  return null;
}

const CATALOG_LOCK_NAME = 'aaos:customer-tag-catalog-writes';
const CATALOG_LOCK_TIMEOUT_SECONDS = 2;

class CatalogLockError extends Error {}

async function catalogWriteTransaction<T>(prisma: CatalogPrisma, operation: (tx: Prisma.TransactionClient) => Promise<T>) {
  try {
    return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      let acquired = false;
      try {
        const rows = await tx.$queryRaw<Array<{ acquired: number | bigint | null }>>(
          Prisma.sql`SELECT GET_LOCK(${CATALOG_LOCK_NAME}, ${CATALOG_LOCK_TIMEOUT_SECONDS}) AS acquired`,
        );
        acquired = Number(rows[0]?.acquired) === 1;
      } catch {
        throw new CatalogLockError('标签目录锁获取失败');
      }
      if (!acquired) throw new CatalogLockError('标签目录正忙，请稍后重试');
      try {
        return await operation(tx);
      } finally {
        try {
          const rows = await tx.$queryRaw<Array<{ released: number | bigint | null }>>(
            Prisma.sql`SELECT RELEASE_LOCK(${CATALOG_LOCK_NAME}) AS released`,
          );
          if (Number(rows[0]?.released) !== 1) throw new CatalogLockError('标签目录锁释放失败');
        } catch (error) {
          if (error instanceof CatalogLockError) throw error;
          throw new CatalogLockError('标签目录锁释放失败');
        }
      }
    });
  } catch (error) {
    if (error instanceof CatalogLockError) return failure(error.message, 503);
    throw error;
  }
}

async function rowsFor(tx: Pick<Prisma.TransactionClient, 'businessRecord'>, domain: string) {
  return tx.businessRecord.findMany({ where: { domain } });
}

export async function loadCustomerTagCatalog(
  tx: CatalogReadTx,
  includeInactive = false,
): Promise<CustomerTagCatalog> {
  const [groupRows, tagRows, customerRows, leadRows] = await Promise.all([
    rowsFor(tx, STORAGE_KEYS.TAG_GROUPS), rowsFor(tx, STORAGE_KEYS.TAGS),
    rowsFor(tx, STORAGE_KEYS.CUSTOMERS), tx.leadRecord.findMany({ select: { data: true } }),
  ]);
  const groups = groupRows.map((row) => object(row.data) as CustomerTagGroup);
  const usage = new Map<string, number>();
  for (const row of [...customerRows, ...leadRows]) {
    for (const id of (Array.isArray(object(row.data).manualTagIds) ? object(row.data).manualTagIds : [])) {
      usage.set(String(id), (usage.get(String(id)) || 0) + 1);
    }
  }
  const tags = tagRows.map((row) => {
    const tag = object(row.data) as CustomerTag;
    return { ...tag, usageCount: usage.get(tag.id) || 0 };
  });
  const activeGroupIds = new Set(groups.filter((group) => group.isActive).map((group) => group.id));
  return {
    groups: groups.filter((group) => includeInactive || group.isActive).sort((a, b) => a.sortOrder - b.sortOrder),
    tags: tags.filter((tag) => includeInactive || (tag.isActive && activeGroupIds.has(tag.groupId)))
      .sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

function recordData(domain: string, value: { id: string; name: string; isActive: boolean }) {
  return {
    id: `${domain}:${value.id}`, domain, recordId: value.id, title: value.name,
    status: value.isActive ? 'active' : 'inactive', data: value as unknown as Prisma.InputJsonValue,
  };
}

export function createCustomerTagService(prisma: CatalogPrisma) {
  async function requireSuperAdmin(user: AuthenticatedUser) {
    if (!user.roleId) return false;
    const role = await prisma.role.findUnique({ where: { id: user.roleId } });
    return role?.isActive === true && role.code === 'super_admin';
  }

  async function createGroup(input: GroupInput, user: AuthenticatedUser) {
    if (!await requireSuperAdmin(user)) return failure('仅超级管理员可管理标签目录', 403);
    const validationError = validateInput(input, GROUP_FIELDS, true, 'group');
    if (validationError) return failure(validationError, 400);
    const name = normalizeName(input.name);
    return catalogWriteTransaction(prisma, async (tx) => {
      const catalog = await loadCustomerTagCatalog(tx, true);
      if (catalog.groups.some((group) => normalizedKey(group.name) === normalizedKey(name))) return failure('标签组名称已存在', 409);
      const timestamp = now();
      const group: CustomerTagGroup = {
        id: randomUUID(), name, color: normalizeName(input.color) || '#1677ff',
        selectionMode: input.selectionMode === 'single' ? 'single' : 'multiple',
        scope: ['lead', 'customer', 'both'].includes(String(input.scope)) ? input.scope as any : 'both',
        isActive: input.isActive !== false, sortOrder: input.sortOrder ?? catalog.groups.length,
        createdAt: timestamp, updatedAt: timestamp,
      };
      await tx.businessRecord.create({ data: recordData(STORAGE_KEYS.TAG_GROUPS, group) });
      return success(group);
    });
  }

  async function updateGroup(id: string, input: GroupInput, user: AuthenticatedUser) {
    if (!await requireSuperAdmin(user)) return failure('仅超级管理员可管理标签目录', 403);
    const validationError = validateInput(input, GROUP_FIELDS, false, 'group');
    if (validationError) return failure(validationError, 400);
    return catalogWriteTransaction(prisma, async (tx) => {
      const catalog = await loadCustomerTagCatalog(tx, true);
      const current = catalog.groups.find((group) => group.id === id);
      if (!current) return failure('标签组不存在', 404);
      const name = input.name === undefined ? current.name : normalizeName(input.name);
      if (catalog.groups.some((group) => group.id !== id && normalizedKey(group.name) === normalizedKey(name))) return failure('标签组名称已存在', 409);
      const next: CustomerTagGroup = {
        ...current, name,
        color: input.color === undefined ? current.color : input.color.trim(),
        selectionMode: input.selectionMode ?? current.selectionMode,
        scope: input.scope ?? current.scope,
        isActive: input.isActive ?? current.isActive,
        sortOrder: input.sortOrder ?? current.sortOrder,
        updatedAt: now(),
      };
      await tx.businessRecord.update({ where: { domain_recordId: { domain: STORAGE_KEYS.TAG_GROUPS, recordId: id } }, data: recordData(STORAGE_KEYS.TAG_GROUPS, next) });
      return success(next);
    });
  }

  async function createTag(input: TagInput, user: AuthenticatedUser) {
    if (!await requireSuperAdmin(user)) return failure('仅超级管理员可管理标签目录', 403);
    const validationError = validateInput(input, TAG_FIELDS, true, 'tag');
    if (validationError) return failure(validationError, 400);
    const name = normalizeName(input.name);
    const groupId = input.groupId!.trim();
    return catalogWriteTransaction(prisma, async (tx) => {
      const catalog = await loadCustomerTagCatalog(tx, true);
      if (!catalog.groups.some((group) => group.id === groupId)) return failure('标签组不存在', 404);
      if (catalog.tags.some((tag) => tag.groupId === groupId && normalizedKey(tag.name) === normalizedKey(name))) return failure('组内标签名称已存在', 409);
      const timestamp = now();
      const tag: CustomerTag = { id: randomUUID(), groupId, name, color: normalizeName(input.color) || undefined, isActive: input.isActive !== false, sortOrder: input.sortOrder ?? catalog.tags.filter((item) => item.groupId === groupId).length, usageCount: 0, createdAt: timestamp, updatedAt: timestamp };
      await tx.businessRecord.create({ data: recordData(STORAGE_KEYS.TAGS, tag) });
      return success(tag);
    });
  }

  async function updateTag(id: string, input: TagInput, user: AuthenticatedUser) {
    if (!await requireSuperAdmin(user)) return failure('仅超级管理员可管理标签目录', 403);
    const validationError = validateInput(input, TAG_FIELDS, false, 'tag');
    if (validationError) return failure(validationError, 400);
    return catalogWriteTransaction(prisma, async (tx) => {
      const catalog = await loadCustomerTagCatalog(tx, true);
      const current = catalog.tags.find((tag) => tag.id === id);
      if (!current) return failure('标签不存在', 404);
      const groupId = input.groupId?.trim() || current.groupId;
      if (!catalog.groups.some((group) => group.id === groupId)) return failure('标签组不存在', 404);
      const name = input.name === undefined ? current.name : normalizeName(input.name);
      if (catalog.tags.some((tag) => tag.id !== id && tag.groupId === groupId && normalizedKey(tag.name) === normalizedKey(name))) return failure('组内标签名称已存在', 409);
      const next: CustomerTag = {
        ...current, groupId, name,
        color: input.color === undefined ? current.color : input.color.trim() || undefined,
        isActive: input.isActive ?? current.isActive,
        sortOrder: input.sortOrder ?? current.sortOrder,
        updatedAt: now(),
      };
      await tx.businessRecord.update({ where: { domain_recordId: { domain: STORAGE_KEYS.TAGS, recordId: id } }, data: recordData(STORAGE_KEYS.TAGS, next) });
      return success(next);
    });
  }

  async function mergeTag(sourceId: string, targetId: string, user: AuthenticatedUser) {
    if (!await requireSuperAdmin(user)) return failure('仅超级管理员可管理标签目录', 403);
    if (!sourceId || sourceId === targetId) return failure('合并目标无效', 409);
    return catalogWriteTransaction(prisma, async (tx) => {
      const catalog = await loadCustomerTagCatalog(tx, true);
      const source = catalog.tags.find((tag) => tag.id === sourceId);
      const target = catalog.tags.find((tag) => tag.id === targetId);
      if (!source || !target) return failure('标签不存在', 404);
      if (source.groupId !== target.groupId) return failure('只能合并同组标签', 409);
      const audit = { id: randomUUID(), type: 'tag_merge', title: '合并客户标签', content: `${source.name} → ${target.name}`, operator: user.name, createdAt: now() };
      const businessRows = await tx.businessRecord.findMany({ where: { domain: { in: [STORAGE_KEYS.CUSTOMERS, STORAGE_KEYS.LEADS] } } });
      for (const row of businessRows) {
        const value = object(row.data);
        if (!Array.isArray(value.manualTagIds) || !value.manualTagIds.includes(sourceId)) continue;
        const manualTagIds = [...new Set(value.manualTagIds.map((id: string) => id === sourceId ? targetId : id))];
        const manualTagNames = manualTagIds.map((id) => catalog.tags.find((tag) => tag.id === id)?.name)
          .filter((name): name is string => Boolean(name));
        await tx.businessRecord.update({ where: { domain_recordId: { domain: row.domain, recordId: row.recordId } }, data: { data: { ...value, manualTagIds, manualTagNames, activityRecords: [audit, ...(Array.isArray(value.activityRecords) ? value.activityRecords : [])] } } });
      }
      if (tx.leadRecord) {
        const leads = await tx.leadRecord.findMany();
        for (const row of leads) {
          const value = object(row.data);
          if (!Array.isArray(value.manualTagIds) || !value.manualTagIds.includes(sourceId)) continue;
          const manualTagIds = [...new Set(value.manualTagIds.map((id: string) => id === sourceId ? targetId : id))];
          const manualTagNames = manualTagIds.map((id) => catalog.tags.find((tag) => tag.id === id)?.name)
            .filter((name): name is string => Boolean(name));
          await tx.leadRecord.update({ where: { id: row.id }, data: { data: { ...value, manualTagIds, manualTagNames, activityRecords: [audit, ...(Array.isArray(value.activityRecords) ? value.activityRecords : [])] } } });
        }
      }
      const nextSource = { ...source, isActive: false, updatedAt: now() };
      await tx.businessRecord.update({ where: { domain_recordId: { domain: STORAGE_KEYS.TAGS, recordId: sourceId } }, data: recordData(STORAGE_KEYS.TAGS, nextSource) });
      return success({ source: nextSource, target });
    });
  }

  return { loadCatalog: (includeInactive = false) => loadCustomerTagCatalog(prisma as any, includeInactive), createGroup, updateGroup, createTag, updateTag, mergeTag };
}

export function createCustomerTagRouter({
  service,
  requireRead,
  requireManage,
}: {
  service: ReturnType<typeof createCustomerTagService>;
  requireRead: RequestHandler;
  requireManage: RequestHandler;
}) {
  const router = express.Router();
  const status = (code: number, successStatus: number) => code === 0 ? successStatus : (code >= 400 && code < 500 ? code : 500);

  router.get('/catalog', requireRead, async (req, res) => {
    const rawScope = Array.isArray(req.query.scope) ? req.query.scope[0] : req.query.scope;
    const scope = typeof rawScope === 'string' ? rawScope : '';
    if (scope && scope !== 'customer' && scope !== 'lead') {
      res.status(400).json({ code: 400, data: null, message: '无效的标签范围' });
      return;
    }
    const catalog = await service.loadCatalog(req.query.includeInactive === 'true');
    const groups = scope ? catalog.groups.filter((group) => group.scope === scope || group.scope === 'both') : catalog.groups;
    const groupIds = new Set(groups.map((group) => group.id));
    res.status(200).json(success({ groups, tags: catalog.tags.filter((tag) => groupIds.has(tag.groupId)) }));
  });
  router.post('/groups', requireManage, async (req: any, res) => {
    const result = await service.createGroup(req.body || {}, req.currentUser!);
    res.status(status(result.code, 201)).json(result);
  });
  router.put('/groups/:id', requireManage, async (req: any, res) => {
    const result = await service.updateGroup(String(req.params.id), req.body || {}, req.currentUser!);
    res.status(status(result.code, 200)).json(result);
  });
  router.post('/', requireManage, async (req: any, res) => {
    const result = await service.createTag(req.body || {}, req.currentUser!);
    res.status(status(result.code, 201)).json(result);
  });
  router.put('/:id', requireManage, async (req: any, res) => {
    const result = await service.updateTag(String(req.params.id), req.body || {}, req.currentUser!);
    res.status(status(result.code, 200)).json(result);
  });
  router.post('/:id/merge', requireManage, async (req: any, res) => {
    const result = await service.mergeTag(String(req.params.id), String(req.body?.targetId || ''), req.currentUser!);
    res.status(status(result.code, 200)).json(result);
  });
  return router;
}
