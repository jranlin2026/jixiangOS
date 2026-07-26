import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildBusinessExportBrowserRequest, unwrapBusinessExportResponse } from '../shared/utils/businessExportPageRequest';

const root = process.cwd();
const ordersSource = readFileSync(join(root, 'src/pages/Orders/index.tsx'), 'utf8');
const financeSource = readFileSync(join(root, 'src/pages/Finance/index.tsx'), 'utf8');
const commissionSource = readFileSync(join(root, 'src/pages/Commission/index.tsx'), 'utf8');
const recoverySource = readFileSync(join(root, 'src/pages/Finance/RecoverySettlement.tsx'), 'utf8');
const afterSalesSource = readFileSync(join(root, 'src/pages/AfterSales/index.tsx'), 'utf8');
const recoveryOrderSource = readFileSync(join(root, 'src/pages/AfterSales/RecoveryOrderTab.tsx'), 'utf8');

const request = buildBusinessExportBrowserRequest(
  { search: '关键', status: '已完成', sortBy: 'paymentDate', sortDirection: 'asc', page: 3, pageSize: 50 },
  { columnMode: 'current_view', reason: '核账', columnIds: ['status', 'orderNo'] },
);
assert.deepEqual(request, {
  filters: { search: '关键', status: '已完成', sortBy: 'paymentDate', sortDirection: 'asc' },
  columnMode: 'current_view',
  reason: '核账',
  columnIds: ['status', 'orderNo'],
});
assert.deepEqual(
  buildBusinessExportBrowserRequest(
    { search: '关键', page: 2, pageSize: 20 },
    { columnMode: 'all', reason: '备份', columnIds: ['orderNo'] },
  ),
  { filters: { search: '关键' }, columnMode: 'all', reason: '备份' },
  '全部字段模式不应向后端传递当前视图字段。',
);
assert.throws(
  () => unwrapBusinessExportResponse({ code: 403, data: null as never, message: '无权导出' }),
  /无权导出/,
);

assert.match(ordersSource, /PERMISSION_KEYS\.ORDER_EXPORT/);
assert.match(ordersSource, />\s*导出订单\s*</);
assert.match(ordersSource, /businessExportApi\.exportOrders/);
assert.match(ordersSource, /columnIds:\s*visibleColumns\.map\(\(column\) => column\.id\)/);
assert.match(ordersSource, /expectedCount=\{pagination\.total\}/);

assert.match(financeSource, /PERMISSION_KEYS\.ORDER_SETTLEMENT_EXPORT/);
assert.match(financeSource, /PERMISSION_KEYS\.RECOVERY_SETTLEMENT_EXPORT/);
assert.match(financeSource, />\s*导出订单分账\s*</);
assert.match(financeSource, />\s*导出售后挽回分账\s*</);
assert.match(financeSource, /orderSplitExportTrigger=\{settlementExportTrigger\}/);
assert.match(financeSource, /exportTrigger=\{recoverySettlementExportTrigger\}/);

assert.match(commissionSource, /businessExportApi\.exportOrderSettlements/);
assert.match(commissionSource, /columnIds:\s*visibleOrderSplitColumns\.map\(\(column\) => column\.id\)/);
assert.match(commissionSource, /expectedCount=\{orderPagination\.total\}/);

assert.match(recoverySource, /businessExportApi\.exportRecoverySettlements/);
assert.match(recoverySource, /columnIds:\s*visibleColumns\.map\(\(column\) => column\.id\)/);
assert.match(recoverySource, /expectedCount=\{total\}/);

assert.match(afterSalesSource, /PERMISSION_KEYS\.AFTER_SALES_RECOVERY_EXPORT/);
assert.match(afterSalesSource, />\s*导出售后挽回订单\s*</);
assert.match(afterSalesSource, /exportSignal=\{exportSignal\}/);
assert.match(recoveryOrderSource, /businessExportApi\.exportRecoveryOrders/);
assert.match(recoveryOrderSource, /columnIds:\s*visibleColumns\.map\(\(column\) => column\.id\)/);
assert.match(recoveryOrderSource, /expectedCount=\{total\}/);

console.log('business export page integration tests passed');
