import { Prisma, type PrismaClient } from '@prisma/client';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import type { BusinessRecycleBinType } from '../../src/types/businessRecycleBin';

export type BusinessRecycleBinDeletedRow = {
  type: BusinessRecycleBinType;
  data: unknown;
};

export type BusinessRecycleBinRepository = {
  listDeleted(input: {
    type?: BusinessRecycleBinType;
    search?: string;
    offset: number;
    limit: number;
  }): Promise<{ rows: BusinessRecycleBinDeletedRow[]; total: number }>;
};

type RecycleBinPrisma = Pick<PrismaClient, '$queryRaw'>;

function deletedRecordsSql() {
  return Prisma.sql`(
    SELECT 'lead' AS recordType, data
    FROM lead_records
    WHERE NULLIF(JSON_UNQUOTE(JSON_EXTRACT(data, '$.deletedAt')), 'null') IS NOT NULL
    UNION ALL
    SELECT CASE
      WHEN domain = ${STORAGE_KEYS.CUSTOMERS} THEN 'customer'
      WHEN domain = ${STORAGE_KEYS.ORDERS} THEN 'order'
    END AS recordType, data
    FROM business_records
    WHERE domain IN (${STORAGE_KEYS.CUSTOMERS}, ${STORAGE_KEYS.ORDERS})
      AND NULLIF(JSON_UNQUOTE(JSON_EXTRACT(data, '$.deletedAt')), 'null') IS NOT NULL
  ) AS deleted_records`;
}

function deletedRecordsWhere(type?: BusinessRecycleBinType, search?: string) {
  const conditions: Prisma.Sql[] = [];
  if (type) conditions.push(Prisma.sql`recordType = ${type}`);
  if (search) {
    const query = `%${search.toLowerCase()}%`;
    conditions.push(Prisma.sql`LOWER(CONCAT_WS(' ',
      JSON_UNQUOTE(JSON_EXTRACT(data, '$.name')),
      JSON_UNQUOTE(JSON_EXTRACT(data, '$.company')),
      JSON_UNQUOTE(JSON_EXTRACT(data, '$.phone')),
      JSON_UNQUOTE(JSON_EXTRACT(data, '$.orderNo')),
      JSON_UNQUOTE(JSON_EXTRACT(data, '$.customerName')),
      JSON_UNQUOTE(JSON_EXTRACT(data, '$.owner')),
      JSON_UNQUOTE(JSON_EXTRACT(data, '$.assignedTo'))
    )) LIKE ${query}`);
  }
  return conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;
}

export function createPrismaBusinessRecycleBinRepository(prisma: RecycleBinPrisma): BusinessRecycleBinRepository {
  return {
    async listDeleted(input) {
      const where = deletedRecordsWhere(input.type, input.search);
      const [countRows, rows] = await Promise.all([
        prisma.$queryRaw<Array<{ total: bigint | number }>>(Prisma.sql`
          SELECT COUNT(*) AS total FROM ${deletedRecordsSql()} ${where}
        `),
        prisma.$queryRaw<Array<{ recordType: BusinessRecycleBinType; data: unknown }>>(Prisma.sql`
          SELECT recordType, data
          FROM ${deletedRecordsSql()}
          ${where}
          ORDER BY JSON_UNQUOTE(JSON_EXTRACT(data, '$.deletedAt')) DESC,
            recordType ASC,
            JSON_UNQUOTE(JSON_EXTRACT(data, '$.id')) ASC
          LIMIT ${input.limit} OFFSET ${input.offset}
        `),
      ]);
      return {
        total: Number(countRows[0]?.total || 0),
        rows: rows.map((row) => ({ type: row.recordType, data: row.data })),
      };
    },
  };
}
