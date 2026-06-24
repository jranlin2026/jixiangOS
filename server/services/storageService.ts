import type { Prisma, PrismaClient } from '@prisma/client';
import { failure, success } from '../api/response';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';

type StoragePrisma = Pick<PrismaClient, 'appStorage' | 'leadRecord'>;

const STORAGE_KEY_PATTERN = /^aaos_[a-zA-Z0-9_:-]+$/;
const STRUCTURED_KEYS = new Set<string>([STORAGE_KEYS.LEADS]);

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

export function createStorageService(prisma: StoragePrisma) {
  const listLeads = async () => {
    const rows = await prisma.leadRecord.findMany({ orderBy: { createdAt: 'desc' } });
    return rows
      .sort((a, b) => parseDate((b as any).createdAt).getTime() - parseDate((a as any).createdAt).getTime())
      .map(mapLeadRow);
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

  return {
    async list() {
      const rows = await prisma.appStorage.findMany({ orderBy: { key: 'asc' } });
      const data = Object.fromEntries(rows.map((row) => [row.key, row.value])) as Record<string, unknown>;
      data[STORAGE_KEYS.LEADS] = await listLeads();
      return success(data);
    },

    async get(key: string) {
      if (!STORAGE_KEY_PATTERN.test(key)) return failure('invalid storage key', 400);
      if (key === STORAGE_KEYS.LEADS) return success(await listLeads());
      const row = await prisma.appStorage.findUnique({ where: { key } });
      return success(row?.value ?? null);
    },

    async set(key: string, value: unknown) {
      if (!STORAGE_KEY_PATTERN.test(key)) return failure('invalid storage key', 400);
      if (key === STORAGE_KEYS.LEADS) return setLeads(value);
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
      await prisma.appStorage.deleteMany({ where: { key } });
      return success(true);
    },

    async clearPrefix(prefix = 'aaos_') {
      await prisma.appStorage.deleteMany({ where: { key: { startsWith: prefix } } });
      if (prefix === 'aaos_' || STRUCTURED_KEYS.has(prefix)) await prisma.leadRecord.deleteMany();
      return success(true);
    },
  };
}
