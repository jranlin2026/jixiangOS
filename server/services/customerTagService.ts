import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import express, { type RequestHandler } from 'express';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { Customer } from '../../src/types/customer';
import type { CustomerTag, CustomerTagCatalog, CustomerTagGroup } from '../../src/types/tag';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { hasPermission, PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import { failure, success } from '../api/response';
import { createCustomerBusinessRecordRepository } from './customerBusinessRecordRepository';
import { customerWriteConflictResponse } from './customerWriteConflict';
import { validateManualTagSelection } from './customerTagPolicy';

type CatalogPrisma = {
  businessRecord: Prisma.TransactionClient['businessRecord'];
  leadRecord?: Prisma.TransactionClient['leadRecord'];
  $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T>;
};

type CatalogReadTx = Pick<Prisma.TransactionClient, 'businessRecord' | 'leadRecord'>;
type TagDefinitionReadTx = Pick<Prisma.TransactionClient, 'businessRecord'>;

type GroupInput = Partial<Pick<CustomerTagGroup, 'name' | 'color' | 'selectionMode' | 'scope' | 'isActive' | 'sortOrder'>>;
type TagInput = Partial<Pick<CustomerTag, 'groupId' | 'name' | 'color' | 'isActive' | 'sortOrder'>>;

const object = (value: unknown): Record<string, any> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
);
const isDeleted = (row: any) => row.status === 'deleted' || Boolean(object(row.data).deletedAt) || object(row.data).isDeleted === true;
const normalizeName = (value: unknown) => String(value || '').trim();
const normalizedKey = (value: unknown) => normalizeName(value).toLocaleLowerCase();
const now = () => new Date().toISOString();
const GROUP_FIELDS = new Set(['name', 'color', 'selectionMode', 'scope', 'isActive', 'sortOrder']);
const TAG_FIELDS = new Set(['groupId', 'name', 'color', 'isActive', 'sortOrder']);
const CATALOG_AUDIT_DOMAIN = 'aaos_customer_tag_catalog_audits';

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

const CATALOG_LOCK_DOMAIN = 'aaos_internal_locks';
const CATALOG_LOCK_RECORD_ID = 'customer-tag-catalog-writes';

class CatalogLockError extends Error {}

export async function catalogWriteTransaction<T>(prisma: CatalogPrisma, operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  try {
    return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      try {
        try {
          await tx.businessRecord.upsert({
            where: { domain_recordId: { domain: CATALOG_LOCK_DOMAIN, recordId: CATALOG_LOCK_RECORD_ID } },
            create: {
              id: `${CATALOG_LOCK_DOMAIN}:${CATALOG_LOCK_RECORD_ID}`,
              domain: CATALOG_LOCK_DOMAIN,
              recordId: CATALOG_LOCK_RECORD_ID,
              title: '客户标签目录写锁',
              data: { internal: true },
            },
            update: {},
          });
        } catch (error) {
          // Two first-ever writers may race to create the sentinel. The unique winner
          // commits the row; the loser can safely continue to the authoritative row lock.
          if (object(error).code !== 'P2002') throw error;
        }
        const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT id FROM business_records
          WHERE domain = ${CATALOG_LOCK_DOMAIN} AND recordId = ${CATALOG_LOCK_RECORD_ID}
          FOR UPDATE
        `);
        if (rows.length !== 1) throw new Error('sentinel missing');
      } catch {
        throw new CatalogLockError('标签目录锁获取失败');
      }
      return operation(tx);
    });
  } catch (error) {
    if (error instanceof CatalogLockError) return failure(error.message, 503) as T;
    const conflict = customerWriteConflictResponse(error);
    if (conflict) return conflict as T;
    throw error;
  }
}

async function rowsFor(tx: Pick<Prisma.TransactionClient, 'businessRecord'>, domain: string) {
  return tx.businessRecord.findMany({ where: { domain } });
}

function buildCustomerTagCatalog(
  groupRows: Array<{ data: unknown }>,
  tagRows: Array<{ data: unknown }>,
  includeInactive: boolean,
  usage: ReadonlyMap<string, number>,
): CustomerTagCatalog {
  const groups = groupRows.map((row) => object(row.data) as CustomerTagGroup);
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

/**
 * Loads only tag definitions for assignment validation. Unlike the management
 * catalog, this deliberately avoids scanning every customer and lead merely to
 * calculate usage counts that the write path never reads.
 */
export async function loadCustomerTagValidationCatalog(
  tx: TagDefinitionReadTx,
): Promise<CustomerTagCatalog> {
  const [groupRows, tagRows] = await Promise.all([
    rowsFor(tx, STORAGE_KEYS.TAG_GROUPS),
    rowsFor(tx, STORAGE_KEYS.TAGS),
  ]);
  return buildCustomerTagCatalog(groupRows, tagRows, false, new Map());
}

export async function loadCustomerTagCatalog(
  tx: CatalogReadTx,
  includeInactive = false,
): Promise<CustomerTagCatalog> {
  const [groupRows, tagRows, customerRows, leadRows, legacyLeadRows] = await Promise.all([
    rowsFor(tx, STORAGE_KEYS.TAG_GROUPS), rowsFor(tx, STORAGE_KEYS.TAGS),
    rowsFor(tx, STORAGE_KEYS.CUSTOMERS), tx.leadRecord.findMany(), rowsFor(tx, STORAGE_KEYS.LEADS),
  ]);
  const canonicalLeadIds = new Set(leadRows.map((row: any) => String(row.id || object(row.data).id)));
  const usage = new Map<string, number>();
  const liveLegacyLeads = legacyLeadRows.filter((row: any) => !isDeleted(row) && !canonicalLeadIds.has(String(row.recordId || object(row.data).id)));
  for (const row of [...customerRows, ...leadRows, ...liveLegacyLeads]) {
    for (const id of (Array.isArray(object(row.data).manualTagIds) ? object(row.data).manualTagIds : [])) {
      usage.set(String(id), (usage.get(String(id)) || 0) + 1);
    }
  }
  return buildCustomerTagCatalog(groupRows, tagRows, includeInactive, usage);
}

function recordData(domain: string, value: { id: string; name: string; isActive: boolean }) {
  return {
    id: `${domain}:${value.id}`, domain, recordId: value.id, title: value.name,
    status: value.isActive ? 'active' : 'inactive', data: value as unknown as Prisma.InputJsonValue,
  };
}

type AssignmentRecord = { kind: 'customer' | 'lead'; id: string; manualTagIds: string[] };

async function assignmentRecords(tx: any): Promise<AssignmentRecord[]> {
  const [businessRows, leadRows] = await Promise.all([
    tx.businessRecord.findMany({ where: { domain: { in: [STORAGE_KEYS.CUSTOMERS, STORAGE_KEYS.LEADS] } } }),
    tx.leadRecord.findMany(),
  ]);
  const canonicalLeadIds = new Set(leadRows.map((row: any) => String(row.id || object(row.data).id)));
  const fromBusiness = businessRows.filter((row: any) => row.domain === STORAGE_KEYS.CUSTOMERS || (
    !isDeleted(row) && !canonicalLeadIds.has(String(row.recordId || object(row.data).id))
  )).map((row: any) => ({
    kind: row.domain === STORAGE_KEYS.CUSTOMERS ? 'customer' as const : 'lead' as const,
    id: String(row.recordId || object(row.data).id || ''),
    manualTagIds: Array.isArray(object(row.data).manualTagIds) ? object(row.data).manualTagIds.map(String) : [],
  }));
  const fromLeads = leadRows.filter((row: any) => !isDeleted(row)).map((row: any) => ({
    kind: 'lead' as const,
    id: String(row.id || object(row.data).id || ''),
    manualTagIds: Array.isArray(object(row.data).manualTagIds) ? object(row.data).manualTagIds.map(String) : [],
  }));
  return [...fromBusiness, ...fromLeads];
}

async function validateAffectedAssignments(tx: any, catalog: CustomerTagCatalog, affectedTagIds: Set<string>) {
  for (const record of await assignmentRecords(tx)) {
    if (!record.manualTagIds.some((id) => affectedTagIds.has(id))) continue;
    const validation = validateManualTagSelection(catalog, record.kind, record.manualTagIds);
    if (!validation.ok) return failure(`${record.kind === 'customer' ? '客户' : '线索'} ${record.id} 的标签分配冲突：${validation.message}`, 409);
  }
  return null;
}

export function createCustomerTagService(prisma: CatalogPrisma) {
  const canManageCatalog = (user: AuthenticatedUser) => (
    hasPermission(user, PERMISSION_KEYS.SETTINGS_CUSTOMER_TAGS, 'write')
  );

  async function createGroup(input: GroupInput, user: AuthenticatedUser) {
    if (!canManageCatalog(user)) return failure('无权管理客户标签目录', 403);
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
        scope: input.scope ?? 'customer',
        isActive: input.isActive !== false, sortOrder: input.sortOrder ?? catalog.groups.length,
        createdAt: timestamp, updatedAt: timestamp,
      };
      await tx.businessRecord.create({ data: recordData(STORAGE_KEYS.TAG_GROUPS, group) });
      return success(group);
    });
  }

  async function updateGroup(id: string, input: GroupInput, user: AuthenticatedUser) {
    if (!canManageCatalog(user)) return failure('无权管理客户标签目录', 403);
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
      if (next.scope !== current.scope || next.selectionMode !== current.selectionMode) {
        const affectedTagIds = new Set(catalog.tags.filter((tag) => tag.groupId === id).map((tag) => tag.id));
        const simulated = { ...catalog, groups: catalog.groups.map((group) => group.id === id ? next : group) };
        const conflict = await validateAffectedAssignments(tx, simulated, affectedTagIds);
        if (conflict) return conflict;
      }
      await tx.businessRecord.update({ where: { domain_recordId: { domain: STORAGE_KEYS.TAG_GROUPS, recordId: id } }, data: recordData(STORAGE_KEYS.TAG_GROUPS, next) });
      return success(next);
    });
  }

  async function createTag(input: TagInput, user: AuthenticatedUser) {
    if (!canManageCatalog(user)) return failure('无权管理客户标签目录', 403);
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
    if (!canManageCatalog(user)) return failure('无权管理客户标签目录', 403);
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
      if (next.groupId !== current.groupId) {
        const simulated = { ...catalog, tags: catalog.tags.map((tag) => tag.id === id ? next : tag) };
        const conflict = await validateAffectedAssignments(tx, simulated, new Set([id]));
        if (conflict) return conflict;
      }
      await tx.businessRecord.update({ where: { domain_recordId: { domain: STORAGE_KEYS.TAGS, recordId: id } }, data: recordData(STORAGE_KEYS.TAGS, next) });
      return success(next);
    });
  }

  async function deleteTag(id: string, user: AuthenticatedUser) {
    if (!canManageCatalog(user)) return failure('无权管理客户标签目录', 403);
    return catalogWriteTransaction(prisma, async (tx) => {
      const catalog = await loadCustomerTagCatalog(tx, true);
      const tag = catalog.tags.find((item) => item.id === id);
      if (!tag) return failure('标签不存在', 404);
      if (tag.usageCount > 0) return failure('标签已被客户或线索使用，请先合并或停用', 409);
      await tx.businessRecord.delete({ where: { domain_recordId: { domain: STORAGE_KEYS.TAGS, recordId: id } } });
      await tx.businessRecord.create({ data: recordData(CATALOG_AUDIT_DOMAIN, { id: randomUUID(), name: `删除客户标签：${tag.name}`, isActive: true }) });
      return success({ id });
    });
  }

  async function deleteGroup(id: string, user: AuthenticatedUser) {
    if (!canManageCatalog(user)) return failure('无权管理客户标签目录', 403);
    return catalogWriteTransaction(prisma, async (tx) => {
      const catalog = await loadCustomerTagCatalog(tx, true);
      const group = catalog.groups.find((item) => item.id === id);
      if (!group) return failure('标签分组不存在', 404);
      if (catalog.tags.some((tag) => tag.groupId === id)) return failure('标签分组仍包含标签，请先合并、停用或删除标签', 409);
      await tx.businessRecord.delete({ where: { domain_recordId: { domain: STORAGE_KEYS.TAG_GROUPS, recordId: id } } });
      await tx.businessRecord.create({ data: recordData(CATALOG_AUDIT_DOMAIN, { id: randomUUID(), name: `删除客户标签分组：${group.name}`, isActive: true }) });
      return success({ id });
    });
  }

  async function mergeTag(sourceId: string, targetId: string, user: AuthenticatedUser) {
    if (!canManageCatalog(user)) return failure('无权管理客户标签目录', 403);
    if (!sourceId || sourceId === targetId) return failure('合并目标无效', 409);
    return catalogWriteTransaction(prisma, async (tx) => {
      const catalog = await loadCustomerTagCatalog(tx, true);
      const source = catalog.tags.find((tag) => tag.id === sourceId);
      const target = catalog.tags.find((tag) => tag.id === targetId);
      if (!source || !target) return failure('标签不存在', 404);
      if (source.groupId !== target.groupId) return failure('只能合并同组标签', 409);
      if (!target.isActive) return failure('目标标签必须为启用状态', 409);
      const targetGroup = catalog.groups.find((group) => group.id === target.groupId);
      if (!targetGroup || !targetGroup.isActive) return failure('目标标签所属分组必须存在且为启用状态', 409);
      const audit = { id: randomUUID(), type: 'tag_merge', title: '合并客户标签', content: `${source.name} → ${target.name}`, operator: user.name, createdAt: now() };
      const customerRepository = createCustomerBusinessRecordRepository(tx);
      const businessRows = (await tx.businessRecord.findMany({ where: { domain: { in: [STORAGE_KEYS.CUSTOMERS, STORAGE_KEYS.LEADS] } } }))
        .sort((a, b) => `${a.domain}:${a.recordId}`.localeCompare(`${b.domain}:${b.recordId}`));
      for (const row of businessRows) {
        if (row.domain === STORAGE_KEYS.CUSTOMERS) {
          const snapshot = await customerRepository.lockById(String(row.recordId));
          if (!snapshot) continue;
          const customer = snapshot.customer;
          if (!Array.isArray(customer.manualTagIds) || !customer.manualTagIds.includes(sourceId)) continue;
          const manualTagIds = [...new Set(customer.manualTagIds.map((id) => id === sourceId ? targetId : id))];
          const tags = manualTagIds.map((id) => catalog.tags.find((tag) => tag.id === id)?.name)
            .filter((name): name is string => Boolean(name));
          const updatedCustomer: Customer = {
            ...customer,
            manualTagIds,
            tags,
            activityRecords: [audit as any, ...(customer.activityRecords || [])],
            updatedAt: audit.createdAt,
          };
          await customerRepository.compareAndSave(snapshot, updatedCustomer, new Date(audit.createdAt));
          continue;
        }
        const value = object(row.data);
        if (!Array.isArray(value.manualTagIds) || !value.manualTagIds.includes(sourceId)) continue;
        const manualTagIds = [...new Set(value.manualTagIds.map((id: string) => id === sourceId ? targetId : id))];
        const tags = manualTagIds.map((id) => catalog.tags.find((tag) => tag.id === id)?.name)
          .filter((name): name is string => Boolean(name));
        await tx.businessRecord.update({ where: { domain_recordId: { domain: row.domain, recordId: row.recordId } }, data: { data: { ...value, manualTagIds, tags, activityRecords: [audit, ...(Array.isArray(value.activityRecords) ? value.activityRecords : [])] } } });
      }
      if (tx.leadRecord) {
        const leads = await tx.leadRecord.findMany();
        for (const row of leads) {
          const value = object(row.data);
          if (!Array.isArray(value.manualTagIds) || !value.manualTagIds.includes(sourceId)) continue;
          const manualTagIds = [...new Set(value.manualTagIds.map((id: string) => id === sourceId ? targetId : id))];
          const tags = manualTagIds.map((id) => catalog.tags.find((tag) => tag.id === id)?.name)
            .filter((name): name is string => Boolean(name));
          await tx.leadRecord.update({ where: { id: row.id }, data: { data: { ...value, manualTagIds, tags, activityRecords: [audit, ...(Array.isArray(value.activityRecords) ? value.activityRecords : [])] } } });
        }
      }
      const nextSource = { ...source, isActive: false, updatedAt: now() };
      await tx.businessRecord.update({ where: { domain_recordId: { domain: STORAGE_KEYS.TAGS, recordId: sourceId } }, data: recordData(STORAGE_KEYS.TAGS, nextSource) });
      return success({ source: nextSource, target });
    });
  }

  async function mergeGroup(sourceId: string, targetId: string, user: AuthenticatedUser) {
    if (!canManageCatalog(user)) return failure('无权管理客户标签目录', 403);
    if (!sourceId || !targetId || sourceId === targetId) return failure('分组合并目标无效', 409);
    return catalogWriteTransaction(prisma, async (tx) => {
      const catalog = await loadCustomerTagCatalog(tx, true);
      const source = catalog.groups.find((group) => group.id === sourceId);
      const target = catalog.groups.find((group) => group.id === targetId);
      if (!source || !target) return failure('标签分组不存在', 404);
      if (!target.isActive) return failure('目标分组必须为启用状态', 409);
      const sourceTags = catalog.tags.filter((tag) => tag.groupId === sourceId);
      const targetNames = new Set(catalog.tags.filter((tag) => tag.groupId === targetId).map((tag) => normalizedKey(tag.name)));
      const conflicts = sourceTags.filter((tag) => targetNames.has(normalizedKey(tag.name))).map((tag) => tag.name);
      if (conflicts.length) return failure(`目标分组存在同名标签：${conflicts.join('、')}，请先合并标签`, 409);
      const timestamp = now();
      const movedTags = sourceTags.map((tag) => ({ ...tag, groupId: targetId, updatedAt: timestamp }));
      const nextSource = { ...source, isActive: false, updatedAt: timestamp };
      const simulated: CustomerTagCatalog = {
        groups: catalog.groups.map((group) => group.id === sourceId ? nextSource : group),
        tags: catalog.tags.map((tag) => movedTags.find((moved) => moved.id === tag.id) || tag),
      };
      const conflict = await validateAffectedAssignments(tx, simulated, new Set(sourceTags.map((tag) => tag.id)));
      if (conflict) return conflict;
      for (const tag of movedTags) {
        await tx.businessRecord.update({ where: { domain_recordId: { domain: STORAGE_KEYS.TAGS, recordId: tag.id } }, data: recordData(STORAGE_KEYS.TAGS, tag) });
      }
      await tx.businessRecord.update({ where: { domain_recordId: { domain: STORAGE_KEYS.TAG_GROUPS, recordId: sourceId } }, data: recordData(STORAGE_KEYS.TAG_GROUPS, nextSource) });
      const audit = { id: randomUUID(), name: '合并客户标签分组', isActive: true, sourceId, targetId, movedTagIds: movedTags.map((tag) => tag.id), actor: { id: user.id, name: user.name }, createdAt: timestamp };
      await tx.businessRecord.create({ data: recordData(CATALOG_AUDIT_DOMAIN, audit) });
      return success({ source: nextSource, target, movedTagIds: movedTags.map((tag) => tag.id) });
    });
  }

  async function reorderTags(groupId: string, tagIds: string[], user: AuthenticatedUser) {
    if (!canManageCatalog(user)) return failure('无权管理客户标签目录', 403);
    if (!groupId || !Array.isArray(tagIds) || tagIds.some((id) => typeof id !== 'string' || !id.trim()) || new Set(tagIds).size !== tagIds.length) {
      return failure('标签排序数据无效', 400);
    }
    return catalogWriteTransaction(prisma, async (tx) => {
      const catalog = await loadCustomerTagCatalog(tx, true);
      if (!catalog.groups.some((group) => group.id === groupId)) return failure('标签组不存在', 404);
      const groupTags = catalog.tags.filter((tag) => tag.groupId === groupId);
      const expected = new Set(groupTags.map((tag) => tag.id));
      if (tagIds.length !== groupTags.length || tagIds.some((id) => !expected.has(id))) {
        return failure('标签目录已变化，请刷新后重试', 409);
      }
      const timestamp = now();
      const reordered: CustomerTag[] = [];
      for (const [sortOrder, id] of tagIds.entries()) {
        const current = groupTags.find((tag) => tag.id === id)!;
        const next = { ...current, sortOrder, updatedAt: timestamp };
        await tx.businessRecord.update({ where: { domain_recordId: { domain: STORAGE_KEYS.TAGS, recordId: id } }, data: recordData(STORAGE_KEYS.TAGS, next) });
        reordered.push(next);
      }
      return success(reordered);
    });
  }

  return { loadCatalog: (includeInactive = false) => loadCustomerTagCatalog(prisma as any, includeInactive), createGroup, updateGroup, createTag, updateTag, deleteTag, deleteGroup, mergeTag, mergeGroup, reorderTags };
}

export function createCustomerTagRouter({
  service,
  requireCustomerRead,
  requireLeadRead,
  requireSettingsRead,
  requireManage,
}: {
  service: ReturnType<typeof createCustomerTagService>;
  requireCustomerRead: RequestHandler;
  requireLeadRead: RequestHandler;
  requireSettingsRead: RequestHandler;
  requireManage: RequestHandler;
}) {
  const router = express.Router();
  const status = (code: number, successStatus: number) => code === 0 ? successStatus : (code >= 400 && code < 600 ? code : 500);
  const requireCatalogRead: RequestHandler = (req, res, next) => {
    const rawScope = Array.isArray(req.query.scope) ? req.query.scope[0] : req.query.scope;
    const scope = typeof rawScope === 'string' ? rawScope : '';
    const includeInactive = req.query.includeInactive === 'true';
    const middleware = includeInactive || (scope !== 'customer' && scope !== 'lead')
      ? requireSettingsRead
      : scope === 'customer' ? requireCustomerRead : requireLeadRead;
    middleware(req, res, next);
  };

  router.get('/catalog', requireCatalogRead, async (req, res) => {
    const rawScope = Array.isArray(req.query.scope) ? req.query.scope[0] : req.query.scope;
    const scope = typeof rawScope === 'string' ? rawScope : '';
    if (scope && scope !== 'customer' && scope !== 'lead' && scope !== 'all') {
      res.status(400).json({ code: 400, data: null, message: '无效的标签范围' });
      return;
    }
    const catalog = await service.loadCatalog(req.query.includeInactive === 'true');
    const groups = scope && scope !== 'all' ? catalog.groups.filter((group) => group.scope === scope || group.scope === 'both') : catalog.groups;
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
  router.delete('/groups/:id', requireManage, async (req: any, res) => {
    const result = await service.deleteGroup(String(req.params.id), req.currentUser!);
    res.status(status(result.code, 200)).json(result);
  });
  router.post('/', requireManage, async (req: any, res) => {
    const result = await service.createTag(req.body || {}, req.currentUser!);
    res.status(status(result.code, 201)).json(result);
  });
  router.post('/groups/:id/reorder', requireManage, async (req: any, res) => {
    const result = await service.reorderTags(String(req.params.id), Array.isArray(req.body?.tagIds) ? req.body.tagIds : [], req.currentUser!);
    res.status(status(result.code, 200)).json(result);
  });
  router.post('/groups/:id/merge', requireManage, async (req: any, res) => {
    const result = await service.mergeGroup(String(req.params.id), String(req.body?.targetId || ''), req.currentUser!);
    res.status(status(result.code, 200)).json(result);
  });
  router.put('/:id', requireManage, async (req: any, res) => {
    const result = await service.updateTag(String(req.params.id), req.body || {}, req.currentUser!);
    res.status(status(result.code, 200)).json(result);
  });
  router.delete('/:id', requireManage, async (req: any, res) => {
    const result = await service.deleteTag(String(req.params.id), req.currentUser!);
    res.status(status(result.code, 200)).json(result);
  });
  router.post('/:id/merge', requireManage, async (req: any, res) => {
    const result = await service.mergeTag(String(req.params.id), String(req.body?.targetId || ''), req.currentUser!);
    res.status(status(result.code, 200)).json(result);
  });
  return router;
}
