import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const orders = read('src/pages/Orders/index.tsx');
assert.match(orders, /label="分账进度"/);
assert.match(orders, /label="付款开始"/);
assert.match(orders, /label="付款结束"/);
assert.match(orders, /按付款时间排序/);
assert.match(orders, /handleResetFilters/);

const commission = read('src/pages/Commission/index.tsx');
assert.match(commission, /label="销售负责人"/);
assert.match(commission, /label="提成人员"/);
assert.match(commission, /label="付款开始"/);
assert.match(commission, /按付款时间排序/);
assert.match(commission, /handleResetOrderFilters/);

const afterSales = read('src/pages/AfterSales/RecoveryOrderTab.tsx');
assert.match(afterSales, /label: '分账进度'/);
assert.match(afterSales, /label="挽回人员"/);
assert.match(afterSales, /label="挽回成交开始"/);
assert.match(afterSales, /label="挽回成交结束"/);
assert.match(afterSales, /按挽回成交时间排序/);
assert.match(afterSales, /setSortBy\('recoveryAt'\)/);

const recoverySettlement = read('src/pages/Finance/RecoverySettlement.tsx');
assert.match(recoverySettlement, /label="挽回人员"/);
assert.doesNotMatch(recoverySettlement, /<InputLabel>分账状态<\/InputLabel>/);
assert.match(recoverySettlement, /label="挽回成交开始"/);
assert.match(recoverySettlement, /label="挽回成交结束"/);
assert.match(recoverySettlement, /按挽回成交时间排序/);
assert.match(recoverySettlement, /handleResetFilters/);
