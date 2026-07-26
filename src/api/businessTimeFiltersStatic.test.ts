import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const orders = read('src/pages/Orders/index.tsx');
assert.match(orders, /label="分账状态"/);
assert.match(orders, /SettlementStatusChip/);
assert.match(orders, /label="付款开始"/);
assert.match(orders, /label="付款结束"/);
assert.match(orders, /按付款时间排序/);
assert.match(orders, /handleResetFilters/);
assert.match(orders, /sortBy:\s*'createdAt'\s+as const/);
assert.match(orders, /sortDirection:\s*'desc'\s+as const/);

const orderReview = read('src/pages/OrderReview/index.tsx');
assert.match(orderReview, /label="付款开始"/);
assert.match(orderReview, /label="付款结束"/);
assert.match(orderReview, /按付款时间排序/);
assert.match(orderReview, /handleResetFilters/);
assert.match(orderReview, /sortBy:\s*'createdAt'/);
assert.match(orderReview, /sortDirection:\s*'desc'/);

const orderQueryService = read('server/services/orderQueryService.ts');
assert.match(orderQueryService, /\$\.payments\[0\]\.paidAt[\s\S]*br\.id ASC/);
assert.match(orderQueryService, /\$\.orderData\.payments\[0\]\.paidAt[\s\S]*br\.id ASC/);
assert.match(orderQueryService, /\$\.createdAt'\)\), br\.createdAt\)[^`]*br\.id ASC/);

const recoveryQueryService = read('server/services/recoveryOrderCommandService.ts');
assert.match(recoveryQueryService, /\$\.recoveryAt[\s\S]*br\.id ASC/);
assert.match(recoveryQueryService, /filters\.sortBy === 'createdAt'[\s\S]*\$\.createdAt[\s\S]*br\.id ASC/);
assert.match(recoveryQueryService, /timeDifference \|\| left\.id\.localeCompare\(right\.id\)/);
assert.match(recoveryQueryService, /sortBy: filters\.sortBy \|\| 'createdAt'/);
assert.match(recoveryQueryService, /sortDirection: filters\.sortDirection \|\| 'desc'/);

const commission = read('src/pages/Commission/index.tsx');
assert.match(commission, /SettlementStatusChip/);
assert.match(commission, /label="销售负责人"/);
assert.match(commission, /label="提成人员"/);
assert.match(commission, /label="付款开始"/);
assert.match(commission, /按付款时间排序/);
assert.match(commission, /handleResetOrderFilters/);
assert.match(commission, /sortBy:\s*'createdAt'/);
assert.match(commission, /sortDirection:\s*'desc'/);

const afterSales = read('src/pages/AfterSales/RecoveryOrderTab.tsx');
assert.match(afterSales, /label: '分账状态'/);
assert.match(afterSales, /SettlementStatusChip/);
assert.match(afterSales, /label="挽回人员"/);
assert.match(afterSales, /label="挽回成交开始"/);
assert.match(afterSales, /label="挽回成交结束"/);
assert.match(afterSales, /按挽回成交时间排序/);
assert.match(afterSales, /setSortBy\('recoveryAt'\)/);
assert.match(afterSales, /useState<'updatedAt' \| 'createdAt' \| 'recoveryAt'>\('createdAt'\)/);
assert.match(afterSales, /setSortBy\('createdAt'\)/);
assert.match(afterSales, /setSortDirection\('desc'\)/);

const recoverySettlement = read('src/pages/Finance/RecoverySettlement.tsx');
assert.match(recoverySettlement, /SettlementStatusChip/);
assert.match(recoverySettlement, /label="挽回人员"/);
assert.doesNotMatch(recoverySettlement, /<InputLabel>分账状态<\/InputLabel>/);
assert.match(recoverySettlement, /label="挽回成交开始"/);
assert.match(recoverySettlement, /label="挽回成交结束"/);
assert.match(recoverySettlement, /按挽回成交时间排序/);
assert.match(recoverySettlement, /handleResetFilters/);
assert.match(recoverySettlement, /useState<'updatedAt' \| 'createdAt' \| 'recoveryAt'>\('createdAt'\)/);
assert.match(recoverySettlement, /setSortBy\('createdAt'\)/);
assert.match(recoverySettlement, /setSortDirection\('desc'\)/);
