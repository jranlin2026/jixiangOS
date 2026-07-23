import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const orderReviewSource = readFileSync(join(process.cwd(), 'src/pages/OrderReview/index.tsx'), 'utf8');
const recoveryReviewSource = readFileSync(join(process.cwd(), 'src/pages/AfterSales/RecoveryOrderTab.tsx'), 'utf8');

for (const [name, source] of [
  ['订单审核台', orderReviewSource],
  ['售后挽回审核台', recoveryReviewSource],
] as const) {
  assert.match(
    source,
    /useState<ReviewQueueView>\('pending'\)/,
    `${name}必须默认进入待处理队列`,
  );
  assert.match(source, /REVIEW_QUEUE_OPTIONS/, `${name}必须提供统一的审核视图选项`);
}

assert.match(orderReviewSource, /getOrderApplicationReviewStatuses\(view\)/);
assert.match(recoveryReviewSource, /getRecoveryOrderReviewStatuses\(reviewQueueView\)/);
assert.match(
  recoveryReviewSource,
  /includeDeleted:\s*mode === 'review' && reviewQueueView === 'all'/,
  '售后挽回审核台的全部记录必须包含已删除业务单的审核留痕',
);
assert.match(
  recoveryReviewSource,
  /row\.status === '待审核'[\s\S]*?canReviewAction/,
  '已处理的售后挽回记录不能再显示审核操作',
);
assert.doesNotMatch(
  recoveryReviewSource,
  /已驳回挽回订单，可在售后挽回订单列表中查看/,
  '驳回记录应归入审核历史，不应误导用户去正式列表查看',
);
assert.doesNotMatch(
  orderReviewSource,
  /清理订单审核记录|cleanupDeletedSourceOrderApplication/,
  '订单审核申请是永久审计留痕，不能提供物理清理入口',
);
