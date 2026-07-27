import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const orderReview = read('src/pages/OrderReview/index.tsx');
const orderToolbar = orderReview.slice(
  orderReview.indexOf('placeholder="搜索申请号、订单号、客户或提交人"'),
  orderReview.indexOf('{reviewer ? (', orderReview.indexOf('placeholder="搜索申请号、订单号、客户或提交人"')),
);

assert.doesNotMatch(orderToolbar, /label="导入批次"/, '订单审核台筛选栏不应显示导入批次输入框');
const orderOwnerIndex = orderToolbar.indexOf('label="销售负责人"');
const orderReviewViewIndex = orderToolbar.indexOf('label="审核视图"');
assert.notEqual(orderOwnerIndex, -1, '订单审核台应提供销售负责人筛选');
assert.notEqual(orderReviewViewIndex, -1, '订单审核台应保留审核视图筛选');
assert.ok(orderOwnerIndex < orderReviewViewIndex, '订单审核台的销售负责人筛选应位于审核视图左侧');
assert.match(orderReview, /\{ id: 'importBatchId', label: '导入批次' \}/, '订单审核台应保留导入批次列表列');
assert.match(orderReview, /<SnapshotField label="导入批次">/, '订单审核台详情应保留导入批次信息');
assert.match(orderReview, /<BusinessImportReviewControls[\s\S]*module="orders"/, '订单审核台应保留批量审核能力');

const recoveryReview = read('src/pages/AfterSales/RecoveryOrderTab.tsx');
const recoveryToolbarStart = recoveryReview.indexOf('placeholder="搜索挽回单号/客户/手机/微信/第三方订单"');
const recoveryToolbar = recoveryReview.slice(
  recoveryToolbarStart,
  recoveryReview.indexOf("{mode === 'review' && canReviewAction ? (", recoveryToolbarStart),
);

assert.doesNotMatch(recoveryToolbar, /label="导入批次"/, '售后挽回订单审核台筛选栏不应显示导入批次输入框');
const recoveryReviewViewIndex = recoveryToolbar.indexOf('label="审核视图"');
const recoveryStartDateIndex = recoveryToolbar.indexOf('label="挽回成交开始"');
assert.notEqual(recoveryReviewViewIndex, -1, '售后挽回订单审核台应保留审核视图筛选');
assert.notEqual(recoveryStartDateIndex, -1, '售后挽回订单审核台应保留挽回成交开始筛选');
assert.ok(
  recoveryReviewViewIndex < recoveryStartDateIndex,
  '售后挽回订单审核台的审核视图应位于挽回成交开始左侧',
);
const recoveryReviewColumns = recoveryReview.slice(
  recoveryReview.indexOf('const RECOVERY_ORDER_REVIEW_COLUMNS'),
  recoveryReview.indexOf('const DEFAULT_LIST_VISIBLE_COLUMNS'),
);
assert.match(recoveryReviewColumns, /\{ id: 'importBatchId', label: '导入批次' \}/, '售后挽回订单审核台应保留导入批次列表列');
assert.match(recoveryReview, /<DetailField label="导入批次">/, '售后挽回订单审核台详情应保留导入批次信息');
assert.match(recoveryReview, /<BusinessImportReviewControls[\s\S]*module="recovery_orders"/, '售后挽回订单审核台应保留批量审核能力');

const recoveryResetHandler = recoveryReview.slice(
  recoveryReview.indexOf('const handleResetFilters = () => {'),
  recoveryReview.indexOf('const load = useCallback', recoveryReview.indexOf('const handleResetFilters = () => {')),
);
assert.match(recoveryResetHandler, /setReviewImportBatchId\(''\)/, '售后审核台重置时应清除隐藏的导入批次条件');
assert.match(recoveryResetHandler, /onImportBatchClear\?\.\(\)/, '售后审核台重置时应同步清除父页面批次参数');
