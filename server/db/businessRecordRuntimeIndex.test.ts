import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const schema = readFileSync(join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8');
const migrationPath = join(
  process.cwd(),
  'prisma',
  'migrations',
  '20260715020000_business_record_runtime_order_index',
  'migration.sql',
);

assert.match(
  schema,
  /model BusinessRecord[\s\S]*@@index\(\[domain, eventAt, createdAt\]\)[\s\S]*@@map\("business_records"\)/,
  'runtime storage reads must use a composite index for domain-scoped chronological ordering',
);
assert.equal(existsSync(migrationPath), true, 'the runtime ordering index must have a deployable migration');

const migration = readFileSync(migrationPath, 'utf8');
assert.match(
  migration,
  /information_schema\.statistics/,
  'the production hotfix may create the index before Prisma records the migration, so the migration must be idempotent',
);
assert.match(
  migration,
  /CREATE INDEX `business_records_domain_eventAt_createdAt_idx`\s+ON `business_records`\(`domain`, `eventAt`, `createdAt`\)/,
);
