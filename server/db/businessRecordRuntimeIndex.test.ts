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
const customerCreationOrderMigrationPath = join(
  process.cwd(),
  'prisma',
  'migrations',
  '20260813143000_customer_creation_order_index',
  'migration.sql',
);

assert.match(
  schema,
  /model BusinessRecord[\s\S]*@@index\(\[domain, eventAt, createdAt\]\)[\s\S]*@@map\("business_records"\)/,
  'runtime storage reads must use a composite index for domain-scoped chronological ordering',
);
assert.match(
  schema,
  /model BusinessRecord[\s\S]*@@index\(\[domain, createdAt, id\], map: "business_records_domain_createdAt_id_idx"\)[\s\S]*@@map\("business_records"\)/,
  'customer creation ordering must use a matching domain-scoped composite index',
);
assert.equal(existsSync(migrationPath), true, 'the runtime ordering index must have a deployable migration');
assert.equal(existsSync(customerCreationOrderMigrationPath), true, 'the customer creation ordering index must have a deployable migration');

const migration = readFileSync(migrationPath, 'utf8');
assert.match(
  migration,
  /information_schema\.statistics/,
  'the production hotfix may create the index before Prisma records the migration, so the migration must be idempotent',
);

const customerCreationOrderMigration = readFileSync(customerCreationOrderMigrationPath, 'utf8');
assert.match(customerCreationOrderMigration, /information_schema\.statistics/, 'the customer creation ordering migration must be idempotent');
assert.match(
  customerCreationOrderMigration,
  /CREATE INDEX `business_records_domain_createdAt_id_idx`\s+ON `business_records`\(`domain`, `createdAt`, `id`\)/,
);
assert.match(
  migration,
  /CREATE INDEX `business_records_domain_eventAt_createdAt_idx`\s+ON `business_records`\(`domain`, `eventAt`, `createdAt`\)/,
);
