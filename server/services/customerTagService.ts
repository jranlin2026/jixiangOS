import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
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

type GroupInput = Partial<Pick<CustomerTagGroup, 'name' | 'color' | 'selectionMode' | 'scope' | 'isActive' | 'sortOrder'>>;
type TagInput = Partial<Pick<CustomerTag, 'groupId' | 'name' | 'color' | 'isActive' | 'sortOrder'>>;

const object = (value: unknown): Record<string, any> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
);
const normalizeName = (value: unknown) => String(value || '').trim();
const normalizedKey = (value: unknown) => normalizeName(value).toLocaleLowerCase();
const now = () => new Date().toISOString();

async function rowsFor(tx: Pick<Prisma.TransactionClient, 'businessRecord'>, domain: string) {
  return tx.businessRecord.findMany({ where: { domain } });
}

export async function loadCustomerTagCatalog(
  tx: Pick<Prisma.TransactionClient, 'businessRecord'>,
  includeInactive = false,
): Promise<CustomerTagCatalog> {
  const [groupRows, tagRows, customerRows, leadRows] = await Promise.all([
    rowsFor(tx, STORAGE_KEYS.TAG_GROUPS), rowsFor(tx, STORAGE_KEYS.TAGS),
    rowsFor(tx, STORAGE_KEYS.CUSTOMERS), rowsFor(tx, STORAGE_KEYS.LEADS),
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
    const name = normalizeName(input.name);
    if (!name) return failure('标签组名称不能为空', 400);
    return prisma.$transaction(async (tx) => {
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
    return prisma.$transaction(async (tx) => {
      const catalog = await loadCustomerTagCatalog(tx, true);
      const current = catalog.groups.find((group) => group.id === id);
      if (!current) return failure('标签组不存在', 404);
      const name = input.name === undefined ? current.name : normalizeName(input.name);
      if (!name) return failure('标签组名称不能为空', 400);
      if (catalog.groups.some((group) => group.id !== id && normalizedKey(group.name) === normalizedKey(name))) return failure('标签组名称已存在', 409);
      const next = { ...current, ...input, name, updatedAt: now() };
      await tx.businessRecord.update({ where: { domain_recordId: { domain: STORAGE_KEYS.TAG_GROUPS, recordId: id } }, data: recordData(STORAGE_KEYS.TAG_GROUPS, next) });
      return success(next);
    });
  }

  async function createTag(input: TagInput, user: AuthenticatedUser) {
    if (!await requireSuperAdmin(user)) return failure('仅超级管理员可管理标签目录', 403);
    const name = normalizeName(input.name);
    if (!name || !input.groupId) return failure('标签组和标签名称不能为空', 400);
    const groupId = input.groupId;
    return prisma.$transaction(async (tx) => {
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
    return prisma.$transaction(async (tx) => {
      const catalog = await loadCustomerTagCatalog(tx, true);
      const current = catalog.tags.find((tag) => tag.id === id);
      if (!current) return failure('标签不存在', 404);
      const groupId = input.groupId || current.groupId;
      if (!catalog.groups.some((group) => group.id === groupId)) return failure('标签组不存在', 404);
      const name = input.name === undefined ? current.name : normalizeName(input.name);
      if (!name) return failure('标签名称不能为空', 400);
      if (catalog.tags.some((tag) => tag.id !== id && tag.groupId === groupId && normalizedKey(tag.name) === normalizedKey(name))) return failure('组内标签名称已存在', 409);
      const next = { ...current, ...input, groupId, name, updatedAt: now() };
      await tx.businessRecord.update({ where: { domain_recordId: { domain: STORAGE_KEYS.TAGS, recordId: id } }, data: recordData(STORAGE_KEYS.TAGS, next) });
      return success(next);
    });
  }

  async function mergeTag(sourceId: string, targetId: string, user: AuthenticatedUser) {
    if (!await requireSuperAdmin(user)) return failure('仅超级管理员可管理标签目录', 403);
    if (!sourceId || sourceId === targetId) return failure('合并目标无效', 409);
    return prisma.$transaction(async (tx) => {
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
        const manualTagNames = manualTagIds.map((id) => catalog.tags.find((tag) => tag.id === id)?.name).filter(Boolean);
        await tx.businessRecord.update({ where: { domain_recordId: { domain: row.domain, recordId: row.recordId } }, data: { data: { ...value, manualTagIds, manualTagNames, activityRecords: [audit, ...(Array.isArray(value.activityRecords) ? value.activityRecords : [])] } } });
      }
      if (tx.leadRecord) {
        const leads = await tx.leadRecord.findMany();
        for (const row of leads) {
          const value = object(row.data);
          if (!Array.isArray(value.manualTagIds) || !value.manualTagIds.includes(sourceId)) continue;
          const manualTagIds = [...new Set(value.manualTagIds.map((id: string) => id === sourceId ? targetId : id))];
          const manualTagNames = manualTagIds.map((id) => catalog.tags.find((tag) => tag.id === id)?.name).filter(Boolean);
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
