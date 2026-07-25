import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const orders = readFileSync(new URL('../pages/Orders/index.tsx', import.meta.url), 'utf8');
const orderReview = readFileSync(new URL('../pages/OrderReview/index.tsx', import.meta.url), 'utf8');
const afterSales = readFileSync(new URL('../pages/AfterSales/index.tsx', import.meta.url), 'utf8');
const recoveryReview = readFileSync(new URL('../pages/AfterSales/RecoveryOrderTab.tsx', import.meta.url), 'utf8');
const dialog = readFileSync(new URL('../shared/components/BusinessImportDialog.tsx', import.meta.url), 'utf8');
const reviewControls = readFileSync(new URL('../shared/components/BusinessImportReviewControls.tsx', import.meta.url), 'utf8');
const entryButton = readFileSync(new URL('../shared/components/BusinessImportEntryButton.tsx', import.meta.url), 'utf8');

assert.match(orders, /<BusinessImportEntryButton[\s\S]*type="orders"[\s\S]*active=\{activeTab === 'list'\}/);
assert.match(orders, /tab', 'review'/);
assert.match(orders, /importBatchId/);

assert.match(afterSales, /<BusinessImportEntryButton[\s\S]*type="recovery_orders"[\s\S]*active=\{activeTab === 'recovery-list'\}/);
assert.ok(
  afterSales.indexOf('<BusinessImportEntryButton') < afterSales.indexOf('新建售后挽回订单'),
  '导入售后挽回订单应显示在新建售后挽回订单左侧',
);
assert.match(afterSales, /tab', 'recovery-review'/);
assert.match(afterSales, /importBatchId/);

assert.match(dialog, /onQueued/);
assert.match(entryButton, /PERMISSION_KEYS\.ORDER_IMPORT/);
assert.match(entryButton, /PERMISSION_KEYS\.AFTER_SALES_RECOVERY_IMPORT/);
assert.match(entryButton, /hasPermission\(user, permission, 'write'\)/);
assert.match(entryButton, /导入订单/);
assert.match(entryButton, /导入售后挽回订单/);

for (const source of [orderReview, recoveryReview]) {
  assert.match(source, /importBatchId/);
  assert.match(source, /导入批次/);
  assert.match(source, /Excel 行号/);
  assert.match(source, /导入人/);
  assert.match(source, /导入时间/);
  assert.match(source, /导入信息/);
  assert.match(source, /BusinessImportReviewControls/);
}

assert.match(reviewControls, /选择当前导入批次全部待审记录/);
assert.match(reviewControls, /批量通过/);
assert.match(reviewControls, /批量退回/);
assert.match(reviewControls, /批量驳回/);
assert.match(reviewControls, /failedBusinessImportReviewSelection/);

assert.match(recoveryReview, /售后临时客户/);
assert.match(recoveryReview, /缺少挽回凭证/);
