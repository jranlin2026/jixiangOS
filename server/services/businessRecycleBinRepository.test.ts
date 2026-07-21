import assert from 'node:assert/strict';
import { createPrismaBusinessRecycleBinRepository } from './businessRecycleBinRepository';

const queries: any[] = [];
const prisma = {
  $queryRaw: async (query: any) => {
    queries.push(query);
    const sql = query.strings.join('?');
    return sql.includes('COUNT(*)')
      ? [{ total: 7n }]
      : [{ recordType: 'customer', data: { id: 'customer-1', deletedAt: '2026-07-21T00:00:00.000Z' } }];
  },
};

const result = await createPrismaBusinessRecycleBinRepository(prisma as any).listDeleted({
  type: 'customer',
  search: '测试',
  offset: 20,
  limit: 20,
});
assert.equal(result.total, 7);
assert.equal(result.rows[0].type, 'customer');
assert.equal(queries.length, 2);

const countSql = queries.find((query) => query.strings.join('?').includes('COUNT(*)'));
const pageSql = queries.find((query) => query.strings.join('?').includes('ORDER BY'));
assert.ok(countSql);
assert.ok(pageSql);
const countText = countSql.strings.join('?');
const pageText = pageSql.strings.join('?');
assert.match(countText, /recordType = \?/);
assert.match(countText, /LIKE \?/);
assert.match(pageText, /deletedAt.*DESC[\s\S]*recordType ASC[\s\S]*'\$\.id'.*ASC/);
assert.match(pageText, /LIMIT \? OFFSET \?/);
assert.equal(pageSql.values.includes('customer'), true);
assert.equal(pageSql.values.includes('%测试%'), true);
assert.equal(pageSql.values.includes(20), true);

console.log('business recycle bin repository tests passed');
