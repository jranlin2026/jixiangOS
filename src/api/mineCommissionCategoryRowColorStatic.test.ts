import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'src/pages/Commission/index.tsx'), 'utf8');

assert.match(source, /tiered:\s*'#[0-9A-Fa-f]{6}'/, '月度阶梯必须有独立类型色');
assert.match(source, /ordinary:\s*'#[0-9A-Fa-f]{6}'/, '普通提成必须有独立类型色');
assert.match(source, /recovery:\s*'#[0-9A-Fa-f]{6}'/, '售后挽回必须有独立类型色');
assert.match(
  source,
  /<TableRow key=\{row\.id\} hover sx=\{getMineCommissionCategoryRowSx\(row\.category\)\}>/,
  '桌面端提成明细表必须按提成类型显示行底色',
);
assert.match(
  source,
  /getMineCommissionCategoryCardSx\(row\.category\)/,
  '手机端提成明细卡片必须与桌面端使用相同的类型色',
);
