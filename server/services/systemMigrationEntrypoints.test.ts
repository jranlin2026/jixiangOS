import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationsRoot = resolve(process.cwd(), 'prisma/migrations');
for (const directory of readdirSync(migrationsRoot, { withFileTypes: true })) {
  if (!directory.isDirectory()) continue;
  const migrationPath = resolve(migrationsRoot, directory.name, 'migration.sql');
  const bytes = readFileSync(migrationPath);
  assert.notDeepEqual(
    Array.from(bytes.subarray(0, 3)),
    [0xef, 0xbb, 0xbf],
    `${directory.name}/migration.sql 不得包含会破坏 MySQL 首条语句的 UTF-8 BOM`,
  );
}

console.log('system migration entrypoint tests passed');
