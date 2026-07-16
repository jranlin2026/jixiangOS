import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { queryBusinessRecordPage } from './businessRecordPageService';

const calls: unknown[] = [];
const prisma = {
  $queryRaw: async (query: unknown) => {
    calls.push(query);
    if (calls.length === 1) return [{ total: 41n }];
    if (calls.length === 2) return [{ id: 'record-22' }, { id: 'record-21' }];
    return [
      { id: 'record-21', data: { id: 'row-21' } },
      { id: 'record-22', data: { id: 'row-22' } },
    ];
  },
} as any;

const result = await queryBusinessRecordPage<{ id: string }>(prisma, {
  from: 'business_records br',
  selectId: 'br.id',
  selectData: 'br.data',
  conditions: [Prisma.sql`br.domain = ${'aaos_orders'}`],
  orderBy: 'br.updatedAt DESC',
  page: 2,
  pageSize: 20,
});

assert.deepEqual(result, { items: [{ id: 'row-22' }, { id: 'row-21' }], total: 41 });
assert.equal(calls.length, 3);
const rendered = calls.map((query: any) => query.sql || '');
assert.match(rendered[0], /COUNT\(\*\)/);
assert.match(rendered[1], /SELECT .*\.id AS id/);
assert.doesNotMatch(rendered[1], /\.data/,
  'the sorted page query must not carry large JSON values into MySQL filesort');
assert.match(rendered[1], /LIMIT \? OFFSET \?/);
assert.match(rendered[2], /SELECT .*\.id AS id, .*\.data AS data/);
