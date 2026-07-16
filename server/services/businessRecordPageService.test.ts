import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { queryBusinessRecordPage } from './businessRecordPageService';

const calls: unknown[] = [];
const prisma = {
  $queryRaw: async (query: unknown) => {
    calls.push(query);
    return calls.length === 1 ? [{ total: 41n }] : [{ data: { id: 'row-21' } }];
  },
} as any;

const result = await queryBusinessRecordPage<{ id: string }>(prisma, {
  from: 'business_records br',
  selectData: 'br.data',
  conditions: [Prisma.sql`br.domain = ${'aaos_orders'}`],
  orderBy: 'br.updatedAt DESC',
  page: 2,
  pageSize: 20,
});

assert.deepEqual(result, { items: [{ id: 'row-21' }], total: 41 });
assert.equal(calls.length, 2);
const rendered = calls.map((query: any) => query.sql || '').join('\n');
assert.match(rendered, /COUNT\(\*\)/);
assert.match(rendered, /LIMIT \? OFFSET \?/);
