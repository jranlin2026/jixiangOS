import { Prisma, type PrismaClient } from '@prisma/client';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import type { Customer } from '../../src/types/customer';
import type { CustomerTagCatalog } from '../../src/types/tag';
import type {
  CustomerBatchPrecheckItemResult,
  CustomerBatchSelection,
} from '../../src/types/customerBatch';
import { buildCustomerWhere } from './customerListService';
import {
  mapCustomerBusinessRecord,
  type CustomerBusinessRecordRow,
} from './customerBusinessRecordRepository';
import { canManageCustomer, type CustomerAccessContext } from './customerAccessPolicy';
import { BatchPrecheckValidationError, sha256Json } from './customerBatchPrecheckService';
import { validateCustomerTagFilters } from '../../src/shared/utils/customerTagPolicy';

export const CUSTOMER_BATCH_SELECTION_LIMIT = 10_000;

export type CustomerBatchSelectionRecord = {
  customer: Customer;
  businessRecordUpdatedAt: Date | string;
};

export type FrozenCustomerSelection = {
  customerIds: string[];
  selectionHash: string;
  versionManifest: Record<string, string>;
  /** Internal guard data; never send this manifest to an untrusted client. */
  customerGuards: Array<{
    customerId: string;
    ownerId: string;
    scopeEligible: boolean;
    businessRecordUpdatedAt: string;
  }>;
  itemResults: CustomerBatchPrecheckItemResult[];
};

export type FreezeSelectionInput = {
  selection: CustomerBatchSelection;
  context: CustomerAccessContext;
  /** The caller's repository boundary must return BusinessRecord top-level versions. */
  findRecords: () => Promise<CustomerBatchSelectionRecord[]>;
};

type CustomerBatchSelectionPrisma = Pick<PrismaClient, 'businessRecord' | '$queryRaw'>;

function cleanText(value: unknown): string {
  return String(value || '').trim();
}

function normalizeVersion(value: Date | string, customerId: string): string {
  const version = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(version.getTime())) throw new Error(`客户 ${customerId} 的记录版本无效`);
  return version.toISOString();
}

/**
 * Freezes only the current manageable customer set. It deliberately treats
 * filter snapshots and explicit IDs differently: filters never disclose rows
 * outside scope, while an explicitly provided ID receives a generic blocked
 * result when it is absent or no longer manageable.
 */
export async function freezeCustomerSelection(input: FreezeSelectionInput): Promise<FrozenCustomerSelection> {
  if (input.selection.mode === 'ids' && input.selection.customerIds.length > CUSTOMER_BATCH_SELECTION_LIMIT) {
    throw new Error('单次任务最多处理 10,000 个客户，请缩小筛选范围');
  }
  const records = await input.findRecords();
  const recordsById = new Map<string, CustomerBatchSelectionRecord>();
  for (const record of records) {
    const customerId = cleanText(record.customer.id);
    if (!customerId || !canManageCustomer(input.context, record.customer)) continue;
    recordsById.set(customerId, record);
  }

  const requestedIds = input.selection.mode === 'ids'
    ? Array.from(new Set(input.selection.customerIds.map(cleanText).filter(Boolean)))
    : Array.from(recordsById.keys());
  if (requestedIds.length > CUSTOMER_BATCH_SELECTION_LIMIT) {
    throw new Error('单次任务最多处理 10,000 个客户，请缩小筛选范围');
  }

  const customerIds = (input.selection.mode === 'ids'
    ? requestedIds.filter((customerId) => recordsById.has(customerId))
    : requestedIds
  ).sort();
  if (customerIds.length > CUSTOMER_BATCH_SELECTION_LIMIT) {
    throw new Error('单次任务最多处理 10,000 个客户，请缩小筛选范围');
  }

  const versionManifest: Record<string, string> = {};
  for (const customerId of customerIds) {
    const record = recordsById.get(customerId);
    if (!record) continue;
    versionManifest[customerId] = normalizeVersion(record.businessRecordUpdatedAt, customerId);
  }

  const itemResults: CustomerBatchPrecheckItemResult[] = input.selection.mode === 'ids'
    ? requestedIds.sort().map((customerId) => (
      recordsById.has(customerId)
        ? { customerId, status: 'ready' as const, reason: '可执行' }
        : { customerId, status: 'blocked' as const, reason: '客户不存在或无权管理' }
    ))
    : customerIds.map((customerId) => ({ customerId, status: 'ready' as const, reason: '可执行' }));

  return {
    customerIds,
    selectionHash: sha256Json(customerIds),
    versionManifest,
    customerGuards: customerIds.map((customerId) => {
      const record = recordsById.get(customerId)!;
      return {
        customerId,
        ownerId: cleanText(record.customer.ownerId),
        scopeEligible: true,
        businessRecordUpdatedAt: versionManifest[customerId],
      };
    }),
    itemResults,
  };
}

function tagCatalogFromRows(groupRows: Array<{ data: unknown }>, tagRows: Array<{ data: unknown }>): CustomerTagCatalog {
  const record = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const groups = groupRows.map((row) => record(row.data) as any)
    .filter((group) => Boolean(group.id) && group.isActive !== false)
    .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0));
  const activeGroupIds = new Set(groups.map((group) => String(group.id)));
  const tags = tagRows.map((row) => record(row.data) as any)
    .filter((tag) => Boolean(tag.id) && tag.isActive !== false && activeGroupIds.has(String(tag.groupId)))
    .map((tag) => ({ ...tag, usageCount: 0 }))
    .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0));
  return { groups, tags };
}

async function loadBatchTagCatalog(prisma: CustomerBatchSelectionPrisma): Promise<CustomerTagCatalog> {
  const [groups, tags] = await Promise.all([
    prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.TAG_GROUPS }, select: { data: true } }),
    prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.TAGS }, select: { data: true } }),
  ]);
  return tagCatalogFromRows(groups as Array<{ data: unknown }>, tags as Array<{ data: unknown }>);
}

async function boundedSelectionRecords(
  prisma: CustomerBatchSelectionPrisma,
  selection: CustomerBatchSelection,
  context: CustomerAccessContext,
  tagCatalog: CustomerTagCatalog | undefined,
): Promise<CustomerBatchSelectionRecord[]> {
  const rawIds = selection.mode === 'ids' ? selection.customerIds : [];
  if (rawIds.length > CUSTOMER_BATCH_SELECTION_LIMIT) {
    throw new BatchPrecheckValidationError('单次任务最多处理 10,000 个客户，请缩小筛选范围');
  }
  const requestedIds = rawIds.map(cleanText);
  if (requestedIds.some((id) => !id || id.length > 80)) {
    throw new BatchPrecheckValidationError('客户 ID 无效');
  }
  if (selection.mode === 'ids' && !requestedIds.length) {
    // Never construct an empty IN () clause. The caller will return the
    // controlled empty-selection precheck failure without issuing a token.
    return [];
  }
  const uniqueRequestedIds = Array.from(new Set(requestedIds)).sort();
  const ownerIds = Array.from(context.manageableOwnerIds).map(cleanText).filter(Boolean).sort();
  if (!ownerIds.length) return [];
  const filters = selection.mode === 'filter_snapshot' ? selection.filters : {};
  const baseWhere = buildCustomerWhere(filters, tagCatalog);
  const idsWhere = selection.mode === 'ids'
    ? Prisma.sql`AND recordId IN (${Prisma.join(uniqueRequestedIds)})`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<CustomerBusinessRecordRow[]>(Prisma.sql`
    SELECT id, domain, recordId, data, updatedAt
    FROM business_records
    WHERE ${baseWhere}
      AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.ownerId')) IN (${Prisma.join(ownerIds)})
      AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(data, '$.ownerIdentityStatus')), '') = 'resolved'
      ${idsWhere}
    ORDER BY recordId ASC
    LIMIT ${CUSTOMER_BATCH_SELECTION_LIMIT + 1}
  `);
  // SQL restricts the candidate set; this is a defensive in-memory check for
  // malformed historical JSON and guarantees the response never widens scope.
  return rows.map(mapCustomerBusinessRecord)
    .filter((snapshot) => canManageCustomer(context, snapshot.customer))
    .map((snapshot) => ({ customer: snapshot.customer, businessRecordUpdatedAt: snapshot.businessRecordUpdatedAt }));
}

export function createCustomerBatchSelectionService(prisma: CustomerBatchSelectionPrisma) {
  return {
    async freeze(selection: CustomerBatchSelection, context: CustomerAccessContext): Promise<FrozenCustomerSelection> {
      const needsTagCatalog = Boolean(
        selection.mode === 'filter_snapshot'
        && (selection.filters.tag || selection.filters.tagIds?.length || selection.filters.withoutTags || selection.filters.missingTagGroupId),
      );
      const tagCatalog = needsTagCatalog ? await loadBatchTagCatalog(prisma) : undefined;
      if (selection.mode === 'filter_snapshot' && tagCatalog) {
        const tagValidation = validateCustomerTagFilters(tagCatalog, selection.filters);
        if (!tagValidation.ok) throw new BatchPrecheckValidationError(tagValidation.message);
      }
      return freezeCustomerSelection({
        selection,
        context,
        findRecords: () => boundedSelectionRecords(prisma, selection, context, tagCatalog),
      });
    },
  };
}
