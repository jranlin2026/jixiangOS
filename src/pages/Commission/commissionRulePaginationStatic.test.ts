import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'src/pages/Commission/CommissionRuleConfig.tsx'), 'utf8');

assert.match(source, /import TablePagination from '..\/..\/shared\/components\/TablePagination'/);
assert.equal((source.match(/<TablePagination/g) || []).length, 3, '三个提成配置表格都应使用统一分页组件');
