import { Prisma, type PrismaClient } from '@prisma/client';

export type RawPagePrisma = Pick<PrismaClient, '$queryRaw'>;

export async function queryBusinessRecordPage<T>(
  prisma: RawPagePrisma,
  options: {
    from: string;
    selectData: string;
    conditions: Prisma.Sql[];
    orderBy: string;
    page: number;
    pageSize: number;
  },
): Promise<{ items: T[]; total: number }> {
  const where = options.conditions.length
    ? Prisma.sql`WHERE ${Prisma.join(options.conditions, ' AND ')}`
    : Prisma.empty;
  const from = Prisma.raw(options.from);
  const selectData = Prisma.raw(options.selectData);
  const orderBy = Prisma.raw(options.orderBy);
  const offset = (options.page - 1) * options.pageSize;
  const [counts, rows] = await Promise.all([
    prisma.$queryRaw<Array<{ total: bigint | number }>>(
      Prisma.sql`SELECT COUNT(*) AS total FROM ${from} ${where}`,
    ),
    prisma.$queryRaw<Array<{ data: unknown }>>(
      Prisma.sql`SELECT ${selectData} AS data FROM ${from} ${where} ORDER BY ${orderBy} LIMIT ${options.pageSize} OFFSET ${offset}`,
    ),
  ]);
  return {
    items: rows.map((row) => row.data as T),
    total: Number(counts[0]?.total || 0),
  };
}

export function jsonText(alias: string, path: string): Prisma.Sql {
  return Prisma.sql`JSON_UNQUOTE(JSON_EXTRACT(${Prisma.raw(alias)}.data, ${path}))`;
}

export function visibleJsonCondition(
  alias: string,
  idPaths: string[],
  namePaths: string[],
  visibleIds: string[],
  visibleNames: string[],
): Prisma.Sql {
  const idConditions: Prisma.Sql[] = [];
  for (const path of idPaths) {
    if (visibleIds.length) idConditions.push(Prisma.sql`${jsonText(alias, path)} IN (${Prisma.join(visibleIds)})`);
  }
  const nameConditions: Prisma.Sql[] = [];
  for (const path of namePaths) {
    if (visibleNames.length) nameConditions.push(Prisma.sql`${jsonText(alias, path)} IN (${Prisma.join(visibleNames)})`);
  }
  const missingIds = idPaths.map((path) => Prisma.sql`COALESCE(${jsonText(alias, path)}, '') = ''`);
  const conditions = [...idConditions];
  if (nameConditions.length) {
    conditions.push(missingIds.length
      ? Prisma.sql`((${Prisma.join(missingIds, ' AND ')}) AND (${Prisma.join(nameConditions, ' OR ')}))`
      : Prisma.sql`(${Prisma.join(nameConditions, ' OR ')})`);
  }
  return conditions.length ? Prisma.sql`(${Prisma.join(conditions, ' OR ')})` : Prisma.sql`FALSE`;
}
