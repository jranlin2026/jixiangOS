import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const orderApiSource = readFileSync(join(process.cwd(), 'src/api/orderApi.ts'), 'utf8');
const ordersPageSource = readFileSync(join(process.cwd(), 'src/pages/Orders/index.tsx'), 'utf8');
const financePageSource = readFileSync(join(process.cwd(), 'src/pages/Finance/index.tsx'), 'utf8');
const commissionPageSource = readFileSync(join(process.cwd(), 'src/pages/Commission/index.tsx'), 'utf8');

assert.match(orderApiSource, /precheckOrderCorrection[\s\S]*correction-precheck/);
assert.match(
  ordersPageSource,
  /mode === 'correction'[\s\S]*precheckOrderCorrection\(order\.id\)[\s\S]*!precheck\.data\.allowed[\s\S]*setCorrectionBlocker/,
  '打开订单更正表单前必须先执行服务端预检',
);
assert.match(ordersPageSource, /暂不能更正订单/);
assert.match(ordersPageSource, /前往订单分账处理/);
assert.match(ordersPageSource, /\/finance\?tab=settlement&search=/);
assert.match(financePageSource, /orderSplitInitialSearch=\{searchParams\.get\('search'\) \|\| ''\}/);
assert.match(commissionPageSource, /search: orderSplitInitialSearch/);
