import { Prisma, type PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { failure, success } from '../api/response';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { matchExactNamesToUniqueIds } from '../../src/shared/utils/exactNameIdentity';
import { mapPrismaUser } from '../db/prismaMappers';
import { loadCustomerTagCatalog } from './customerTagService';
import { CUSTOMER_ASSOCIATION_DEFINITIONS, lockCustomerAssociationScope } from './customerAssociationRegistry';
import {
  CONTACT_IDENTITY_MUTATION_GATE_KEY,
  endLeadContactIdentityLinks,
  lockContactIdentityMutationGate,
} from './contactIdentityService';

type StorageTransaction = Pick<Prisma.TransactionClient,
  'appStorage' | 'leadRecord' | 'businessRecord' | 'user' | 'contactIdentity' | 'contactIdentityLink' | '$queryRaw'
>;
type StoragePrisma = StorageTransaction & Pick<PrismaClient, '$transaction' | 'user'>;

const STORAGE_KEY_PATTERN = /^aaos_[a-zA-Z0-9_:-]+$/;
const BUSINESS_RECORD_ID_MAX_LENGTH = 160;
const BUSINESS_RECORD_RECORD_ID_MAX_LENGTH = 80;
const CRM_MIGRATION_BATCH_SIZE = 250;
const CRM_MIGRATION_TRANSACTION_TIMEOUT_MS = 120_000;
const CRM_MISSING_OWNER_MARKERS = new Set(['', '待分配', '未分配', '未填写负责人']);
const STRUCTURED_KEYS = new Set<string>([STORAGE_KEYS.LEADS]);
const RAW_STORAGE_PROTECTED_KEYS = new Set<string>([STORAGE_KEYS.CUSTOMERS]);
const BUSINESS_RECORD_KEYS = new Set<string>([
  STORAGE_KEYS.CUSTOMERS,
  STORAGE_KEYS.ORDERS,
  STORAGE_KEYS.ORDER_APPLICATIONS,
  STORAGE_KEYS.RECOVERY_ORDERS,
  STORAGE_KEYS.DELIVERIES,
  STORAGE_KEYS.COMMISSIONS,
  STORAGE_KEYS.COMMISSION_OPERATION_LOGS,
  STORAGE_KEYS.COMMISSION_SETTLEMENT_BATCHES,
  STORAGE_KEYS.REFUNDS,
  STORAGE_KEYS.OPPORTUNITIES,
  STORAGE_KEYS.SERVICE_TICKETS,
  STORAGE_KEYS.AI_CARDS,
  STORAGE_KEYS.AI_SESSIONS,
  STORAGE_KEYS.PRODUCTS,
  STORAGE_KEYS.TAGS,
]);
const MERGE_ONLY_BUSINESS_RECORD_KEYS = new Set<string>([
  STORAGE_KEYS.CUSTOMERS,
  STORAGE_KEYS.ORDERS,
  STORAGE_KEYS.ORDER_APPLICATIONS,
]);
const ORDER_APPLICATION_APPROVED_STATUS = '已入库';

class CustomerAssociationStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CustomerAssociationStorageError';
  }
}

function parseDate(value: unknown): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return new Date();
}

function nullableText(value: unknown): string | null {
  const text = String(value || '').trim();
  return text || null;
}

function compactIdentifier(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const suffix = createHash('sha1').update(value).digest('hex').slice(0, 12);
  return `${value.slice(0, maxLength - suffix.length - 1)}-${suffix}`;
}

function normalizeLead(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function uniqueCustomerIds(values: unknown[]): string[] {
  return Array.from(new Set(values
    .map((value) => nullableText(value))
    .filter((value): value is string => Boolean(value))));
}

function stableBlockingAssociationPaths(storageDomain: string): Set<string> {
  return new Set(CUSTOMER_ASSOCIATION_DEFINITIONS
    .filter((definition) => (
      definition.storageDomain === storageDomain
      && definition.blocksSoftDelete
      && definition.mergeAdapterKind === 'stable_id'
    ))
    .map((definition) => definition.pathKey));
}

function stableCustomerIdsForBusinessItem(domain: string, item: Record<string, any>): string[] {
  const paths = stableBlockingAssociationPaths(domain);
  if (!paths.size) return [];
  const data = normalizeLead(item.data);
  const orderData = normalizeLead(item.orderData || data.orderData);
  const ids: unknown[] = [];
  if (paths.has('customerId')) ids.push(item.customerId);
  // Storage writes receive business payloads, while the registry scans persisted
  // JSON. Accept both shapes for registered `data.*` paths only.
  if (paths.has('data.customerId')) ids.push(item.customerId, data.customerId);
  if (paths.has('data.orderData.customerId')) ids.push(orderData.customerId, normalizeLead(data.orderData).customerId);
  const subjectType = nullableText(item.subjectType) || nullableText(data.subjectType);
  if (paths.has('data.subjectId|data.subjectType=customer') && subjectType === 'customer') {
    ids.push(item.subjectId, data.subjectId);
  }
  return uniqueCustomerIds(ids);
}

function stableCustomerIdsForRows(domain: string, value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueCustomerIds(value.flatMap((entry) => stableCustomerIdsForBusinessItem(domain, normalizeLead(entry))));
}

function stableCustomerIdsForFinance(value: unknown): string[] {
  const finance = normalizeLead(value);
  const paths = stableBlockingAssociationPaths(STORAGE_KEYS.FINANCE);
  return uniqueCustomerIds(['incomes', 'expenses', 'transactions'].flatMap((collection) => {
    if (!paths.has(`value.${collection}[].customerId`)) return [];
    const rows = Array.isArray(finance[collection]) ? finance[collection] : [];
    return rows.map((row) => normalizeLead(row).customerId);
  }));
}

async function lockAndValidateCustomerAssociations(
  db: StorageTransaction,
  customerIds: string[],
): Promise<void> {
  if (!customerIds.length) return;
  await lockCustomerAssociationScope(db, customerIds);
  for (const customerId of customerIds) {
    const row = await db.businessRecord.findUnique({
      where: { domain_recordId: { domain: STORAGE_KEYS.CUSTOMERS, recordId: customerId } },
    });
    const customer = normalizeLead(row?.data);
    if (!row || nullableText(customer.id) !== customerId || customer.deletedAt || customer.isDeleted === true) {
      throw new CustomerAssociationStorageError('关联客户不存在或已删除，不能写入客户关联业务');
    }
  }
}

function normalizeCustomerPhone(value: unknown): string {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length > 11 && digits.startsWith('86') ? digits.slice(-11) : digits;
}

function normalizeCustomerWechat(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

/**
 * This is a current, locking read in production. The selected physical row IDs
 * are the sole authority for both identity-link cleanup and deletion; Lead JSON
 * payload IDs may be stale after a legacy import.
 */
async function lockLeadIdsForMaintenancePurge(db: StorageTransaction): Promise<string[]> {
  if (db.$queryRaw) {
    const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id
      FROM lead_records
      ORDER BY id ASC
      FOR UPDATE
    `);
    return rows.map((row) => String(row.id)).filter(Boolean);
  }
  // Adapter/test fallback only. Production Prisma always takes the locking
  // SQL path above.
  const rows = await db.leadRecord.findMany({
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  return rows.map((row) => String(row.id)).filter(Boolean);
}

/**
 * A full lead-domain purge also retires any historical orphan link. Those
 * links have no source row for a future backfill to discover, so leaving them
 * active would preserve the very dangling state this maintenance path removes.
 */
async function lockActiveLeadLinkEntityIdsForMaintenancePurge(db: StorageTransaction): Promise<string[]> {
  if (db.$queryRaw) {
    const rows = await db.$queryRaw<Array<{ entityId: string }>>(Prisma.sql`
      SELECT entityId
      FROM contact_identity_links
      WHERE entityType = 'lead'
        AND linkStatus = 'active'
      ORDER BY entityId ASC
      FOR UPDATE
    `);
    return [...new Set(rows.map((row) => String(row.entityId)).filter(Boolean))];
  }
  // Adapter/test fallback only. Production Prisma always takes the locking
  // SQL path above.
  const rows = await db.contactIdentityLink.findMany({
    where: { entityType: 'lead', linkStatus: 'active' },
    select: { entityId: true },
    orderBy: { entityId: 'asc' },
  });
  return [...new Set(rows.map((row) => String(row.entityId)).filter(Boolean))];
}

function normalizeExactName(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function exactNameKey(value: unknown): string {
  return normalizeExactName(value).toLowerCase();
}

function importedTagNames(value: unknown): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.map(normalizeExactName).filter(Boolean);
}

function mapLeadRow(row: { data: unknown }) {
  return row.data;
}

function toRecordId(domain: string, item: Record<string, any>, index: number): string {
  const rawId = nullableText(item.id)
    || nullableText(item.orderNo)
    || nullableText(item.refundNo)
    || nullableText(item.applicationNo)
    || `${domain}-${index}`;
  return compactIdentifier(rawId, BUSINESS_RECORD_RECORD_ID_MAX_LENGTH);
}

function amountValue(item: Record<string, any>): number | null {
  const value = item.actualAmount ?? item.amount ?? item.totalSpent ?? item.refundAmount ?? item.commissionAmount ?? item.estimatedAmount ?? item.price;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function eventDate(item: Record<string, any>): Date | null {
  const value = item.updatedAt || item.createdAt || item.paidAt || item.completedAt || item.submittedAt || item.generatedAt;
  if (!value) return null;
  const date = parseDate(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function titleValue(domain: string, item: Record<string, any>): string | null {
  return nullableText(item.name)
    || nullableText(item.customerName)
    || nullableText(item.orderNo)
    || nullableText(item.refundNo)
    || nullableText(item.applicationNo)
    || nullableText(item.title)
    || nullableText(item.subjectName)
    || nullableText(item.level)
    || nullableText(domain);
}

function ownerValue(item: Record<string, any>): string | null {
  return nullableText(item.owner)
    || nullableText(item.ownerName)
    || nullableText(item.salesName)
    || nullableText(item.applicantName)
    || nullableText(item.createdBy)
    || nullableText(item.operator);
}

function businessRecordId(domain: string, recordId: string): string {
  return compactIdentifier(`${domain}:${recordId}`, BUSINESS_RECORD_ID_MAX_LENGTH);
}

function businessRecordUpdate(domain: string, item: Record<string, any>) {
  return {
    title: titleValue(domain, item),
    status: nullableText(item.status),
    owner: ownerValue(item),
    customerId: nullableText(item.customerId),
    orderId: nullableText(item.orderId),
    amount: amountValue(item),
    eventAt: eventDate(item),
    data: item as Prisma.InputJsonValue,
  };
}

function businessRecordCreate(domain: string, recordId: string, item: Record<string, any>) {
  return {
    id: businessRecordId(domain, recordId),
    domain,
    recordId,
    ...businessRecordUpdate(domain, item),
  };
}

export function createStorageService(prisma: StoragePrisma) {
  const runStorageTransaction = async (callback: (tx: StorageTransaction) => Promise<any>) => {
    try {
      return await prisma.$transaction((tx) => callback(tx as StorageTransaction));
    } catch (error) {
      if (error instanceof CustomerAssociationStorageError) return failure(error.message, 409);
      throw error;
    }
  };

  const listLeads = async () => {
    const rows = await prisma.leadRecord.findMany({ orderBy: { createdAt: 'desc' } });
    return rows
      .sort((a, b) => parseDate((b as any).createdAt).getTime() - parseDate((a as any).createdAt).getTime())
      .map(mapLeadRow);
  };

  const listUsers = async () => {
    const rows = await prisma.user.findMany({ orderBy: { updatedAt: 'desc' } });
    return rows.map(mapPrismaUser);
  };

  const purgeLeadRecordsWithIdentityLinks = async (tx: StorageTransaction) => {
    // The identity gate must come before any lead source lock. It serializes
    // maintenance deletion with lead writes, conversion, profile sync, and
    // contact backfill so a link cannot be recreated after this cleanup.
    await lockContactIdentityMutationGate(tx);
    const leadIds = await lockLeadIdsForMaintenancePurge(tx);
    const activeLinkedLeadIds = await lockActiveLeadLinkEntityIdsForMaintenancePurge(tx);
    for (const leadId of [...new Set([...leadIds, ...activeLinkedLeadIds])].sort()) {
      await endLeadContactIdentityLinks(tx, leadId);
    }
    // Delete exactly the rows selected under lock. An unqualified delete could
    // remove a concurrently inserted source whose identity link was not ended.
    await tx.leadRecord.deleteMany({ where: { id: { in: leadIds } } });
  };

  const setLeads = async (db: StorageTransaction, value: unknown) => {
    if (!Array.isArray(value)) return failure('aaos_leads must be an array', 400);
    await lockAndValidateCustomerAssociations(db, stableCustomerIdsForRows('lead_records', value));

    for (const item of value) {
      const lead = normalizeLead(item);
      const id = nullableText(lead.id);
      if (!id) continue;
      const createdAt = parseDate(lead.createdAt);
      const updatedAt = parseDate(lead.updatedAt || lead.createdAt);
      await db.leadRecord.upsert({
        where: { id },
        update: {
          name: String(lead.name || ''),
          company: nullableText(lead.company),
          phone: nullableText(lead.phone),
          wechat: nullableText(lead.wechat),
          source: nullableText(lead.source),
          status: nullableText(lead.status),
          lifecycleStatusCode: nullableText(lead.lifecycleStatusCode),
          owner: nullableText(lead.owner),
          assignedTo: nullableText(lead.assignedTo),
          inputBy: nullableText(lead.inputBy),
          leadContributorId: nullableText(lead.leadContributorId),
          data: lead as Prisma.InputJsonValue,
          createdAt,
          updatedAt,
        },
        create: {
          id,
          name: String(lead.name || ''),
          company: nullableText(lead.company),
          phone: nullableText(lead.phone),
          wechat: nullableText(lead.wechat),
          source: nullableText(lead.source),
          status: nullableText(lead.status),
          lifecycleStatusCode: nullableText(lead.lifecycleStatusCode),
          owner: nullableText(lead.owner),
          assignedTo: nullableText(lead.assignedTo),
          inputBy: nullableText(lead.inputBy),
          leadContributorId: nullableText(lead.leadContributorId),
          data: lead as Prisma.InputJsonValue,
          createdAt,
          updatedAt,
        },
      });
    }

    // Leads are fetched with pagination and data-scope filtering. The client array is
    // therefore never proof of a complete domain snapshot; omitted rows must survive.
    return success(value);
  };

  const listBusinessRecords = async (domain: string) => {
    const rows = await prisma.businessRecord.findMany({
      where: { domain },
      orderBy: [
        { eventAt: 'desc' },
        { createdAt: 'desc' },
      ],
    });
    return rows.map((row) => row.data);
  };

  const setOrderApplications = async (db: StorageTransaction, value: unknown) => {
    if (!Array.isArray(value)) return failure(`${STORAGE_KEYS.ORDER_APPLICATIONS} must be an array`, 400);
    await lockAndValidateCustomerAssociations(db, stableCustomerIdsForRows(STORAGE_KEYS.ORDER_APPLICATIONS, value));

    const applications = value.map((entry, index) => {
      const item = normalizeLead(entry);
      return { item, recordId: toRecordId(STORAGE_KEYS.ORDER_APPLICATIONS, item, index) };
    });

    // Approval is a server-owned state transition. Validate the complete payload
    // before applying legacy edits so a forged approval cannot partially commit.
    for (const { item, recordId } of applications) {
      if (nullableText(item.status) !== ORDER_APPLICATION_APPROVED_STATUS) continue;
      const existing = await db.businessRecord.findUnique({
        where: { domain_recordId: { domain: STORAGE_KEYS.ORDER_APPLICATIONS, recordId } },
      });
      if (existing?.status !== ORDER_APPLICATION_APPROVED_STATUS) {
        return failure('订单审批通过必须使用服务端审批接口', 409);
      }
    }

    for (const { item, recordId } of applications) {
      if (nullableText(item.status) === ORDER_APPLICATION_APPROVED_STATUS) continue;
      const update = businessRecordUpdate(STORAGE_KEYS.ORDER_APPLICATIONS, item);
      const updated = await db.businessRecord.updateMany({
        where: {
          domain: STORAGE_KEYS.ORDER_APPLICATIONS,
          recordId,
          status: { not: ORDER_APPLICATION_APPROVED_STATUS },
        },
        data: update,
      });
      if (updated.count > 0) continue;

      const existing = await db.businessRecord.findUnique({
        where: { domain_recordId: { domain: STORAGE_KEYS.ORDER_APPLICATIONS, recordId } },
      });
      if (existing?.status === ORDER_APPLICATION_APPROVED_STATUS) continue;
      if (existing) {
        throw new Error(`Order application ${recordId} could not be safely updated`);
      }

      try {
        await db.businessRecord.create({
          data: businessRecordCreate(STORAGE_KEYS.ORDER_APPLICATIONS, recordId, item),
        });
      } catch (error) {
        if ((error as { code?: string }).code !== 'P2002') throw error;
        const retried = await db.businessRecord.updateMany({
          where: {
            domain: STORAGE_KEYS.ORDER_APPLICATIONS,
            recordId,
            status: { not: ORDER_APPLICATION_APPROVED_STATUS },
          },
          data: update,
        });
        if (retried.count > 0) continue;
        const concurrent = await db.businessRecord.findUnique({
          where: { domain_recordId: { domain: STORAGE_KEYS.ORDER_APPLICATIONS, recordId } },
        });
        if (concurrent?.status === ORDER_APPLICATION_APPROVED_STATUS) continue;
        throw error;
      }
    }

    return success(value);
  };

  const setBusinessRecords = async (db: StorageTransaction, domain: string, value: unknown) => {
    if (!Array.isArray(value)) return failure(`${domain} must be an array`, 400);
    if (domain === STORAGE_KEYS.ORDER_APPLICATIONS) return setOrderApplications(db, value);
    await lockAndValidateCustomerAssociations(db, stableCustomerIdsForRows(domain, value));
    const recordIds: string[] = [];

    for (let index = 0; index < value.length; index += 1) {
      const item = normalizeLead(value[index]);
      const recordId = toRecordId(domain, item, index);
      recordIds.push(recordId);
      await db.businessRecord.upsert({
        where: { domain_recordId: { domain, recordId } },
        update: businessRecordUpdate(domain, item),
        create: businessRecordCreate(domain, recordId, item),
      });
    }

    // Customers are also fetched as paginated, scope-filtered projections. Keep
    // legacy replacement semantics only for domains that still receive full snapshots.
    if (!MERGE_ONLY_BUSINESS_RECORD_KEYS.has(domain)) {
      await db.businessRecord.deleteMany({ where: { domain, recordId: { notIn: recordIds } } });
    }
    return success(value);
  };

  const importCrmMigration = async (customers: unknown) => {
    if (!Array.isArray(customers)) return failure(`${STORAGE_KEYS.CUSTOMERS} must be an array`, 400);

    return prisma.$transaction(async (tx) => {
      const rawCustomers = customers.map(normalizeLead);
      const hasMissingOwner = rawCustomers.some((item) => CRM_MISSING_OWNER_MARKERS.has(normalizeExactName(item.owner)));
      const ownerNames = rawCustomers
        .map((item) => normalizeExactName(item.owner))
        .filter((name) => !CRM_MISSING_OWNER_MARKERS.has(name) && name !== '公海');
      const tagNames = rawCustomers.flatMap((item) => importedTagNames(item.tags));
      const [directoryUsers, catalog] = await Promise.all([
        ownerNames.length > 0 ? tx.user.findMany() : Promise.resolve([]),
        tagNames.length > 0 ? loadCustomerTagCatalog(tx, false) : Promise.resolve({ groups: [], tags: [] }),
      ]);
      const activeUsers = directoryUsers
        .filter((user) => user.isActive && (user.employmentStatus || 'active') === 'active')
        .map((user) => ({ id: user.id, name: user.name }));
      const activeGroupIds = new Set(catalog.groups
        .filter((group) => group.isActive && (group.scope === 'customer' || group.scope === 'both'))
        .map((group) => group.id));
      const activeTags = catalog.tags
        .filter((tag) => tag.isActive && activeGroupIds.has(tag.groupId))
        .map((tag) => ({ id: tag.id, name: tag.name }));
      const ownerMatch = matchExactNamesToUniqueIds(ownerNames, activeUsers);
      const tagMatch = matchExactNamesToUniqueIds(tagNames, activeTags);
      const blockers = [
        hasMissingOwner ? '以下负责人尚未创建员工：未填写负责人' : '',
        ownerMatch.missing.length ? `以下负责人尚未创建员工：${ownerMatch.missing.join('、')}` : '',
        ownerMatch.ambiguous.length ? `以下负责人存在多个同名员工，无法确定归属：${ownerMatch.ambiguous.join('、')}` : '',
        tagMatch.missing.length ? `以下标签尚未同步：${tagMatch.missing.join('、')}` : '',
        tagMatch.ambiguous.length ? `以下标签在多个分组中重名，无法确定标签：${tagMatch.ambiguous.join('、')}` : '',
      ].filter(Boolean);
      if (blockers.length > 0) return failure(`${blockers.join('；')}，请重新预检`, 409);

      const ownerIdsByKey = new Map(ownerMatch.matched.map((name) => [
        exactNameKey(name), ownerMatch.idsByName[name],
      ]));
      const tagIdsByKey = new Map(tagMatch.matched.map((name) => [
        exactNameKey(name), tagMatch.idsByName[name],
      ]));
      const activeTagsById = new Map(activeTags.map((tag) => [tag.id, tag]));

      const existingRows = await tx.businessRecord.findMany({ where: { domain: STORAGE_KEYS.CUSTOMERS } });
      const phones = new Set<string>();
      const wechats = new Set<string>();
      existingRows.forEach((row) => {
        const customer = normalizeLead((row as { data: unknown }).data);
        const phone = normalizeCustomerPhone(customer.phone);
        const wechat = normalizeCustomerWechat(customer.wechat);
        if (phone) phones.add(phone);
        if (wechat) wechats.add(wechat);
      });

      const accepted: Array<{ item: Record<string, any>; recordId: string }> = [];
      let skippedDuplicates = 0;
      rawCustomers.forEach((rawItem, index) => {
        const ownerName = normalizeExactName(rawItem.owner);
        const publicPool = ownerName === '公海';
        const resolvedTagIds = importedTagNames(rawItem.tags).map((name) => tagIdsByKey.get(exactNameKey(name)) as string);
        const item: Record<string, any> = {
          ...rawItem,
          ownerId: publicPool ? undefined : ownerIdsByKey.get(exactNameKey(ownerName)),
          ownerIdentityStatus: publicPool ? 'public_pool' : 'resolved',
          tags: resolvedTagIds.map((id) => activeTagsById.get(id)?.name as string),
          manualTagIds: resolvedTagIds,
        };
        const phone = normalizeCustomerPhone(item.phone);
        const wechat = normalizeCustomerWechat(item.wechat);
        if ((phone && phones.has(phone)) || (wechat && wechats.has(wechat))) {
          skippedDuplicates += 1;
          return;
        }
        if (phone) phones.add(phone);
        if (wechat) wechats.add(wechat);
        accepted.push({ item, recordId: toRecordId(STORAGE_KEYS.CUSTOMERS, item, index) });
      });

      for (let batchStart = 0; batchStart < accepted.length; batchStart += CRM_MIGRATION_BATCH_SIZE) {
        const batch = accepted.slice(batchStart, batchStart + CRM_MIGRATION_BATCH_SIZE);
        await tx.businessRecord.createMany({
          data: batch.map(({ item, recordId }) => {
            return businessRecordCreate(STORAGE_KEYS.CUSTOMERS, recordId, item);
          }),
          skipDuplicates: true,
        });
      }

      return success({
        createdIds: accepted.map(({ item }) => String(item.id || '')).filter(Boolean),
        skippedDuplicates,
        ownerResolution: accepted.reduce((counts, { item }) => {
          const status = String(item.ownerIdentityStatus || 'unresolved') as 'resolved' | 'unresolved' | 'ambiguous' | 'public_pool';
          counts[status] += 1;
          return counts;
        }, { resolved: 0, unresolved: 0, ambiguous: 0, public_pool: 0 }),
      });
    }, { timeout: CRM_MIGRATION_TRANSACTION_TIMEOUT_MS });
  };

  return {
    async list() {
      const rows = await prisma.appStorage.findMany({ orderBy: { key: 'asc' } });
      const data = Object.fromEntries(rows
        .filter((row) => !RAW_STORAGE_PROTECTED_KEYS.has(row.key))
        .map((row) => [row.key, row.value])) as Record<string, unknown>;
      data[STORAGE_KEYS.LEADS] = await listLeads();
      data[STORAGE_KEYS.USERS] = await listUsers();
      for (const key of BUSINESS_RECORD_KEYS) {
        if (RAW_STORAGE_PROTECTED_KEYS.has(key)) continue;
        data[key] = await listBusinessRecords(key);
      }
      return success(data);
    },

    async get(key: string) {
      if (!STORAGE_KEY_PATTERN.test(key)) return failure('invalid storage key', 400);
      if (RAW_STORAGE_PROTECTED_KEYS.has(key)) return failure('客户资产禁止通过原始存储读取', 403);
      if (key === STORAGE_KEYS.LEADS) return success(await listLeads());
      if (key === STORAGE_KEYS.USERS) return success(await listUsers());
      if (BUSINESS_RECORD_KEYS.has(key)) return success(await listBusinessRecords(key));
      const row = await prisma.appStorage.findUnique({ where: { key } });
      return success(row?.value ?? null);
    },

    async set(key: string, value: unknown) {
      if (!STORAGE_KEY_PATTERN.test(key)) return failure('invalid storage key', 400);
      if (RAW_STORAGE_PROTECTED_KEYS.has(key)) return failure('客户资产禁止通过原始存储写入', 403);
      if (key === STORAGE_KEYS.LEADS) return runStorageTransaction((tx) => setLeads(tx, value));
      if (BUSINESS_RECORD_KEYS.has(key)) return runStorageTransaction((tx) => setBusinessRecords(tx, key, value));
      if (key === STORAGE_KEYS.FINANCE) {
        return runStorageTransaction(async (tx) => {
          await lockAndValidateCustomerAssociations(tx, stableCustomerIdsForFinance(value));
          const row = await tx.appStorage.upsert({
            where: { key },
            update: { value: value as Prisma.InputJsonValue },
            create: { key, value: value as Prisma.InputJsonValue },
          });
          return success(row.value);
        });
      }
      const row = await prisma.appStorage.upsert({
        where: { key },
        update: { value: value as Prisma.InputJsonValue },
        create: { key, value: value as Prisma.InputJsonValue },
      });
      return success(row.value);
    },

    importCrmMigration,

    async remove(key: string) {
      if (!STORAGE_KEY_PATTERN.test(key)) return failure('invalid storage key', 400);
      if (RAW_STORAGE_PROTECTED_KEYS.has(key)) return failure('客户资产禁止通过原始存储删除', 403);
      if (key === STORAGE_KEYS.LEADS) {
        return runStorageTransaction(async (tx) => {
          await purgeLeadRecordsWithIdentityLinks(tx);
          return success(true);
        });
      }
      if (BUSINESS_RECORD_KEYS.has(key)) {
        await prisma.businessRecord.deleteMany({ where: { domain: key } });
        return success(true);
      }
      await prisma.appStorage.deleteMany({ where: { key } });
      return success(true);
    },

    async clearPrefix(prefix = 'aaos_') {
      // Keep the contact gate durable while it serializes this destructive
      // maintenance action; it is infrastructure rather than clearable data.
      const preservedKeys = Array.from(new Set([
        ...Array.from(RAW_STORAGE_PROTECTED_KEYS).filter((key) => key.startsWith(prefix)),
        ...(CONTACT_IDENTITY_MUTATION_GATE_KEY.startsWith(prefix) ? [CONTACT_IDENTITY_MUTATION_GATE_KEY] : []),
      ])).sort();
      return runStorageTransaction(async (tx) => {
        if (prefix === 'aaos_' || STRUCTURED_KEYS.has(prefix)) {
          await purgeLeadRecordsWithIdentityLinks(tx);
        }
        await tx.appStorage.deleteMany({
          where: {
            key: {
              startsWith: prefix,
              ...(preservedKeys.length ? { notIn: preservedKeys } : {}),
            },
          },
        });
        if (prefix === 'aaos_') {
          await tx.businessRecord.deleteMany({
            where: { domain: { not: STORAGE_KEYS.CUSTOMERS } },
          });
        }
        return success({ clearedPrefix: prefix, preservedKeys });
      });
    },
  };
}
