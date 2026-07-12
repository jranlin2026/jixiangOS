import { createHash, randomUUID } from 'node:crypto';
import express, { type RequestHandler } from 'express';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { CustomerTag, CustomerTagGroup, CustomerTagMigrationPreview } from '../../src/types/tag';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { failure, success, type ApiResponse } from '../api/response';
import { catalogWriteTransaction } from './customerTagService';
import { validateManualTagSelection } from './customerTagPolicy';

const AUDIT_DOMAIN = 'aaos_customer_tag_migrations';
const LEGACY_GROUP_NAME = '历史未归类';
const object = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
const name = (value: unknown) => String(value ?? '').trim();
const key = (value: unknown) => name(value).toLocaleLowerCase();
const isDeleted = (row: any) => row.status === 'deleted' || Boolean(object(row.data).deletedAt) || object(row.data).isDeleted === true;

type MigrationPrisma = {
  businessRecord: any;
  leadRecord: any;
  role: { findUnique(args: any): Promise<{ code: string; isActive: boolean } | null> };
  $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T>;
};

type Snapshot = CustomerTagMigrationPreview & {
  records: Array<{ kind: 'customer' | 'lead'; storage: 'customer' | 'canonicalLead' | 'legacyLead'; id: string; row: any; tags: string[] }>;
  groups: CustomerTagGroup[];
  definitions: CustomerTag[];
};
type MigrationResult = { updatedCustomers: number; updatedLeads: number; createdTags: number; checksum: string };

async function snapshot(prisma: Pick<MigrationPrisma, 'businessRecord' | 'leadRecord'>): Promise<Snapshot> {
  const [customers, leads, legacyLeads, groupRows, tagRows] = await Promise.all([
    prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.CUSTOMERS } }),
    prisma.leadRecord.findMany(),
    prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.LEADS } }),
    prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.TAG_GROUPS } }),
    prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.TAGS } }),
  ]);
  const groups: CustomerTagGroup[] = groupRows.map((row: any) => object(row.data) as CustomerTagGroup).sort((a: CustomerTagGroup, b: CustomerTagGroup) => a.id.localeCompare(b.id));
  const definitions: CustomerTag[] = tagRows.map((row: any) => object(row.data) as CustomerTag).sort((a: CustomerTag, b: CustomerTag) => a.id.localeCompare(b.id));
  const canonicalLeadIds = new Set(leads.filter((row: any) => !isDeleted(row)).map((row: any) => String(row.id || object(row.data).id)));
  const records: Snapshot['records'] = [
    ...customers.filter((row: any) => !isDeleted(row)).map((row: any) => ({ kind: 'customer' as const, storage: 'customer' as const, id: String(row.recordId || object(row.data).id), row, tags: Array.isArray(object(row.data).tags) ? object(row.data).tags.map(name).filter(Boolean) : [] })),
    ...leads.filter((row: any) => !isDeleted(row)).map((row: any) => ({ kind: 'lead' as const, storage: 'canonicalLead' as const, id: String(row.id || object(row.data).id), row, tags: Array.isArray(object(row.data).tags) ? object(row.data).tags.map(name).filter(Boolean) : [] })),
    ...legacyLeads.filter((row: any) => !isDeleted(row) && !canonicalLeadIds.has(String(row.recordId || object(row.data).id))).map((row: any) => ({ kind: 'lead' as const, storage: 'legacyLead' as const, id: String(row.recordId || object(row.data).id), row, tags: Array.isArray(object(row.data).tags) ? object(row.data).tags.map(name).filter(Boolean) : [] })),
  ].sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
  const known = new Set(definitions.map((tag) => key(tag.name)));
  const missingByKey = new Map<string, string>();
  const referencedByKey = new Map<string, string>();
  records.flatMap((record) => record.tags).forEach((tagName) => {
    if (!referencedByKey.has(key(tagName))) referencedByKey.set(key(tagName), tagName);
    if (!known.has(key(tagName)) && !missingByKey.has(key(tagName))) missingByKey.set(key(tagName), tagName);
  });
  const ambiguousNames = [...referencedByKey.entries()].flatMap(([normalizedName, displayName]) => {
    const matches = definitions.filter((tag) => key(tag.name) === normalizedName);
    const groupIds = [...new Set(matches.map((tag) => tag.groupId))].sort();
    return matches.length > 1 && groupIds.length > 1
      ? [{ name: displayName, tagIds: matches.map((tag) => tag.id).sort(), groupIds }]
      : [];
  }).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  const timestamp = 'migration-preview';
  const virtualLegacyGroup: CustomerTagGroup = groups.find((item) => key(item.name) === key(LEGACY_GROUP_NAME)) || {
    id: 'migration-preview-legacy-group', name: LEGACY_GROUP_NAME, color: '#8c8c8c', selectionMode: 'multiple', scope: 'both', isActive: true, sortOrder: groups.length, createdAt: timestamp, updatedAt: timestamp,
  };
  const virtualGroups = groups.map((group) => group.id === virtualLegacyGroup.id ? { ...group, isActive: true, selectionMode: 'multiple' as const, scope: 'both' as const } : group);
  if (!virtualGroups.some((group) => group.id === virtualLegacyGroup.id)) virtualGroups.push(virtualLegacyGroup);
  const virtualDefinitions = [...definitions];
  for (const missingName of missingByKey.values()) {
    virtualDefinitions.push({ id: `migration-preview-tag-${key(missingName)}`, groupId: virtualLegacyGroup.id, name: missingName, isActive: true, sortOrder: virtualDefinitions.length, usageCount: 0, createdAt: timestamp, updatedAt: timestamp });
  }
  const idsByName = new Map<string, string>();
  for (const tag of virtualDefinitions) if (!idsByName.has(key(tag.name))) idsByName.set(key(tag.name), tag.id);
  const assignmentConflicts = records.flatMap((record) => {
    const value = object(record.row.data);
    const mapped = record.tags.map((tagName) => idsByName.get(key(tagName))).filter((id): id is string => Boolean(id));
    const manualTagIds = [...new Set([...(Array.isArray(value.manualTagIds) ? value.manualTagIds.map(String) : []), ...mapped])];
    const validation = validateManualTagSelection({ groups: virtualGroups, tags: virtualDefinitions }, record.kind, manualTagIds);
    return validation.ok ? [] : [{ recordType: record.kind, recordId: record.id, reason: validation.message }];
  });
  const checksumInput = records.map((record) => ({ kind: record.kind, storage: record.storage, id: record.id, tags: object(record.row.data).tags ?? [], manualTagIds: object(record.row.data).manualTagIds ?? [] }))
    .sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
  const catalogInput = definitions.map((tag) => ({ id: tag.id, groupId: tag.groupId, name: tag.name, isActive: tag.isActive }));
  const checksum = createHash('sha256').update(JSON.stringify({ records: checksumInput, tags: catalogInput, ambiguousNames, assignmentConflicts })).digest('hex');
  return {
    customerCount: records.filter((record) => record.kind === 'customer').length,
    leadCount: records.filter((record) => record.kind === 'lead').length,
    assignmentCount: records.reduce((count, record) => count + record.tags.length, 0),
    missingNames: [...missingByKey.values()].sort((a, b) => a.localeCompare(b, 'zh-CN')),
    ambiguousNameCount: ambiguousNames.length,
    ambiguousNames,
    assignmentConflicts,
    checksum, records, groups, definitions,
  };
}

function storedRecord(domain: string, value: any) {
  return { id: `${domain}:${value.id}`, domain, recordId: value.id, title: value.name || '客户标签历史迁移', status: value.isActive === false ? 'inactive' : 'active', data: value };
}

export function createCustomerTagMigrationService(prisma: MigrationPrisma) {
  async function requireSuperAdmin(actor: AuthenticatedUser) {
    const role = actor.roleId ? await prisma.role.findUnique({ where: { id: actor.roleId } }) : null;
    return role?.isActive === true && role.code === 'super_admin';
  }

  async function previewLegacyTagMigration(actor: AuthenticatedUser): Promise<ApiResponse<CustomerTagMigrationPreview | null>> {
    if (!await requireSuperAdmin(actor)) return failure('仅超级管理员可预览标签迁移', 403);
    const current = await snapshot(prisma);
    const { records: _records, groups: _groups, definitions: _definitions, ...preview } = current;
    return success(preview);
  }

  async function applyLegacyTagMigration(checksum: string, actor: AuthenticatedUser): Promise<ApiResponse<MigrationResult | null>> {
    if (!await requireSuperAdmin(actor)) return failure('仅超级管理员可执行标签迁移', 403);
    return catalogWriteTransaction(prisma as any, async (tx) => {
      const current = await snapshot(tx);
      if (current.checksum !== checksum) return failure('迁移预览已过期，请重新预览', 409);
      if (current.ambiguousNameCount > 0) {
        return failure('存在跨分组同名标签，请先在客户标签设置中合并或重命名后重新预览', 409);
      }
      if (current.assignmentConflicts.length > 0) {
        return failure('历史标签会导致客户或线索分配冲突，请先处理后重新预览', 409);
      }
      const timestamp = new Date().toISOString();
      let group = current.groups.find((item) => key(item.name) === key(LEGACY_GROUP_NAME));
      if (!group && current.missingNames.length) {
        group = { id: randomUUID(), name: LEGACY_GROUP_NAME, color: '#8c8c8c', selectionMode: 'multiple', scope: 'both', isActive: true, sortOrder: current.groups.length, createdAt: timestamp, updatedAt: timestamp };
        await tx.businessRecord.create({ data: storedRecord(STORAGE_KEYS.TAG_GROUPS, group) });
      } else if (group && (!group.isActive || group.selectionMode !== 'multiple' || group.scope !== 'both')) {
        group = { ...group, isActive: true, selectionMode: 'multiple', scope: 'both', updatedAt: timestamp };
        await tx.businessRecord.update({ where: { domain_recordId: { domain: STORAGE_KEYS.TAG_GROUPS, recordId: group.id } }, data: storedRecord(STORAGE_KEYS.TAG_GROUPS, group) });
      }
      const definitions = [...current.definitions];
      for (const missingName of current.missingNames) {
        if (definitions.some((tag) => key(tag.name) === key(missingName))) continue;
        const tag: CustomerTag = { id: randomUUID(), groupId: group!.id, name: missingName, isActive: true, sortOrder: definitions.filter((item) => item.groupId === group!.id).length, usageCount: 0, createdAt: timestamp, updatedAt: timestamp };
        definitions.push(tag);
        await tx.businessRecord.create({ data: storedRecord(STORAGE_KEYS.TAGS, tag) });
      }
      const idsByName = new Map(definitions.map((tag) => [key(tag.name), tag.id]));
      let updatedCustomers = 0; let updatedLeads = 0;
      for (const record of current.records) {
        const value = object(record.row.data);
        const mapped = record.tags.map((tagName) => idsByName.get(key(tagName))).filter((id): id is string => Boolean(id));
        const manualTagIds = [...new Set([...(Array.isArray(value.manualTagIds) ? value.manualTagIds.map(String) : []), ...mapped])];
        if (JSON.stringify(manualTagIds) === JSON.stringify(value.manualTagIds ?? [])) continue;
        if (record.storage === 'customer') {
          await tx.businessRecord.update({ where: { domain_recordId: { domain: STORAGE_KEYS.CUSTOMERS, recordId: record.id } }, data: { data: { ...value, manualTagIds } } }); updatedCustomers += 1;
        } else if (record.storage === 'canonicalLead') {
          await tx.leadRecord.update({ where: { id: record.id }, data: { data: { ...value, manualTagIds } } }); updatedLeads += 1;
        } else {
          await tx.businessRecord.update({ where: { domain_recordId: { domain: STORAGE_KEYS.LEADS, recordId: record.id } }, data: { data: { ...value, manualTagIds } } }); updatedLeads += 1;
        }
      }
      if (updatedCustomers || updatedLeads || current.missingNames.length) {
        const audit = { id: randomUUID(), actor: { id: actor.id, name: actor.name }, checksum, customerCount: current.customerCount, leadCount: current.leadCount, assignmentCount: current.assignmentCount, missingNames: current.missingNames, updatedCustomers, updatedLeads, createdAt: timestamp };
        await tx.businessRecord.create({ data: storedRecord(AUDIT_DOMAIN, audit) });
      }
      return success({ updatedCustomers, updatedLeads, createdTags: current.missingNames.length, checksum });
    });
  }
  return { previewLegacyTagMigration, applyLegacyTagMigration };
}

export function createCustomerTagMigrationRouter({ service, requireAuth }: { service: ReturnType<typeof createCustomerTagMigrationService>; requireAuth: RequestHandler }) {
  const router = express.Router();
  router.get('/migration/preview', requireAuth, async (req: any, res) => {
    const result = await service.previewLegacyTagMigration(req.currentUser!);
    res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 600 ? result.code : 500).json(result);
  });
  router.post('/migration/apply', requireAuth, async (req: any, res) => {
    const result = await service.applyLegacyTagMigration(String(req.body?.checksum || ''), req.currentUser!);
    res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 600 ? result.code : 500).json(result);
  });
  return router;
}
