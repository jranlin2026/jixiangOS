import type { Prisma, PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { failure, success } from '../api/response';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { mapPrismaUser } from '../db/prismaMappers';

type StorageTransaction = Pick<Prisma.TransactionClient, 'appStorage' | 'leadRecord' | 'businessRecord'>;
type StoragePrisma = StorageTransaction & Pick<PrismaClient, '$transaction' | 'user'>;

const STORAGE_KEY_PATTERN = /^aaos_[a-zA-Z0-9_:-]+$/;
const BUSINESS_RECORD_ID_MAX_LENGTH = 160;
const BUSINESS_RECORD_RECORD_ID_MAX_LENGTH = 80;
const STRUCTURED_KEYS = new Set<string>([STORAGE_KEYS.LEADS]);
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

  const setLeads = async (db: StorageTransaction, value: unknown) => {
    if (!Array.isArray(value)) return failure('aaos_leads must be an array', 400);

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

  return {
    async list() {
      const rows = await prisma.appStorage.findMany({ orderBy: { key: 'asc' } });
      const data = Object.fromEntries(rows.map((row) => [row.key, row.value])) as Record<string, unknown>;
      data[STORAGE_KEYS.LEADS] = await listLeads();
      data[STORAGE_KEYS.USERS] = await listUsers();
      for (const key of BUSINESS_RECORD_KEYS) {
        data[key] = await listBusinessRecords(key);
      }
      return success(data);
    },

    async get(key: string) {
      if (!STORAGE_KEY_PATTERN.test(key)) return failure('invalid storage key', 400);
      if (key === STORAGE_KEYS.LEADS) return success(await listLeads());
      if (key === STORAGE_KEYS.USERS) return success(await listUsers());
      if (BUSINESS_RECORD_KEYS.has(key)) return success(await listBusinessRecords(key));
      const row = await prisma.appStorage.findUnique({ where: { key } });
      return success(row?.value ?? null);
    },

    async set(key: string, value: unknown) {
      if (!STORAGE_KEY_PATTERN.test(key)) return failure('invalid storage key', 400);
      if (key === STORAGE_KEYS.LEADS) return prisma.$transaction((tx) => setLeads(tx, value));
      if (BUSINESS_RECORD_KEYS.has(key)) return prisma.$transaction((tx) => setBusinessRecords(tx, key, value));
      const row = await prisma.appStorage.upsert({
        where: { key },
        update: { value: value as Prisma.InputJsonValue },
        create: { key, value: value as Prisma.InputJsonValue },
      });
      return success(row.value);
    },

    async remove(key: string) {
      if (!STORAGE_KEY_PATTERN.test(key)) return failure('invalid storage key', 400);
      if (key === STORAGE_KEYS.LEADS) {
        await prisma.leadRecord.deleteMany();
        return success(true);
      }
      if (BUSINESS_RECORD_KEYS.has(key)) {
        await prisma.businessRecord.deleteMany({ where: { domain: key } });
        return success(true);
      }
      await prisma.appStorage.deleteMany({ where: { key } });
      return success(true);
    },

    async clearPrefix(prefix = 'aaos_') {
      await prisma.appStorage.deleteMany({ where: { key: { startsWith: prefix } } });
      if (prefix === 'aaos_' || STRUCTURED_KEYS.has(prefix)) await prisma.leadRecord.deleteMany();
      if (prefix === 'aaos_') await prisma.businessRecord.deleteMany();
      return success(true);
    },
  };
}
