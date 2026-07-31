import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../../prisma/migrations/20260729023000_sales_director_position/migration.sql', import.meta.url),
  'utf8',
);

assert.match(migration, /EXISTS\s*\(\s*SELECT 1 FROM `departments`/i, '仅推荐销售部存在时创建销售总监');
assert.match(migration, /NOT EXISTS\s*\(\s*SELECT 1 FROM `positions`/i, '已有同ID或同编码岗位时必须保持管理员配置');
assert.doesNotMatch(migration, /ON DUPLICATE KEY UPDATE/i, '数据迁移不得覆盖或重新启用已有岗位');
