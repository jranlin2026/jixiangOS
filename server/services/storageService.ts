import type { Prisma, PrismaClient } from '@prisma/client';
import { failure, success } from '../api/response';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { mapPrismaUser } from '../db/prismaMappers';

type StoragePrisma = Pick<PrismaClient, 'appStorage' | 'leadRecord' | 'businessRecord' | 'user'>;

const STORAGE_KEY_PATTERN = /^aaos_[a-zA-Z0-9_:-]+$/;
const STRUCTURED_KEYS = new Set<string>([STORAGE_KEYS.LEADS]);
const BUSINESS_RECORD_KEYS = new Set<string>([
  STORAGE_KEYS.CUSTOMERS,
  STORAGE_KEYS.ORDERS,
  STORAGE_KEYS.ORDER_APPLICATIONS,
  STORAGE_KEYS.DELIVERIES,
  STORAGE_KEYS.COMMISSIONS,
  STORAGE_KEYS.COMMISSION_OPERATION_LOGS,
  STORAGE_KEYS.COMMISSION_SETTLEMENT_BATCHES,
  STORAGE_KEYS.REFUNDS,
  STORAGE_KEYS.UPGRADE_POOL,
  STORAGE_KEYS.OPPORTUNITIES,
  STORAGE_KEYS.CUSTOMER_SUCCESS_TASKS,
  STORAGE_KEYS.SERVICE_TICKETS,
  STORAGE_KEYS.AI_CARDS,
  STORAGE_KEYS.AI_SESSIONS,
  STORAGE_KEYS.PRODUCTS,
  STORAGE_KEYS.TAGS,
]);

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

function normalizeLead(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function mapLeadRow(row: { data: unknown }) {
  return row.data;
}

function toRecordId(domain: string, item: Record<string, any>, index: number): string {
  return nullableText(item.id)
    || nullableText(item.orderNo)
    || nullableText(item.refundNo)
    || nullableText(item.applicationNo)
    || `${domain}-${index}`;
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
  return `${domain}:${recordId}`.slice(0, 160);
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

  const setLeads = async (value: unknown) => {
    if (!Array.isArray(value)) return failure('aaos_leads must be an array', 400);
    const ids = value
      .map((item) => normalizeLead(item).id)
      .filter((id): id is string => typeof id === 'string' && Boolean(id.trim()));

    for (const item of value) {
      const lead = normalizeLead(item);
      const id = nullableText(lead.id);
      if (!id) continue;
      const createdAt = parseDate(lead.createdAt);
      const updatedAt = parseDate(lead.updatedAt || lead.createdAt);
      await prisma.leadRecord.upsert({
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

    await prisma.leadRecord.deleteMany({ where: { id: { notIn: ids } } });
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

  const setBusinessRecords = async (domain: string, value: unknown) => {
    if (!Array.isArray(value)) return failure(`${domain} must be an array`, 400);
    const recordIds: string[] = [];

    for (let index = 0; index < value.length; index += 1) {
      const item = normalizeLead(value[index]);
      const recordId = toRecordId(domain, item, index);
      recordIds.push(recordId);
      await prisma.businessRecord.upsert({
        where: { domain_recordId: { domain, recordId } },
        update: {
          title: titleValue(domain, item),
          status: nullableText(item.status),
          owner: ownerValue(item),
          customerId: nullableText(item.customerId),
          orderId: nullableText(item.orderId),
          amount: amountValue(item),
          eventAt: eventDate(item),
          data: item as Prisma.InputJsonValue,
        },
        create: {
          id: businessRecordId(domain, recordId),
          domain,
          recordId,
          title: titleValue(domain, item),
          status: nullableText(item.status),
          owner: ownerValue(item),
          customerId: nullableText(item.customerId),
          orderId: nullableText(item.orderId),
          amount: amountValue(item),
          eventAt: eventDate(item),
          data: item as Prisma.InputJsonValue,
        },
      });
    }

    await prisma.businessRecord.deleteMany({ where: { domain, recordId: { notIn: recordIds } } });
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
      if (key === STORAGE_KEYS.LEADS) return setLeads(value);
      if (BUSINESS_RECORD_KEYS.has(key)) return setBusinessRecords(key, value);
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
