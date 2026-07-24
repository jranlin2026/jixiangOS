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
  assert.match(source, /暂无待审核\/退回修改/, `${name}的默认空状态必须同时说明待审核和退回修改`);
}

assert.match(orderReviewSource, /getOrderApplicationReviewStatuses\(view\)/);
assert.match(recoveryReviewSource, /getRecoveryOrderReviewStatuses\(reviewQueueView\)/);
assert.match(orderReviewSource, /getOrderApplicationUnifiedReviewStatus\(application\.status, Boolean\(application\.sourceOrderDeleted\)\)/);
assert.match(
  orderReviewSource,
  /canCleanupApplication[^]{0,320}ORDER_APPLICATION_STATUSES\.REJECTED[^]{0,320}Boolean\(application\.sourceOrderDeleted\)/,
  '普通订单审核台必须允许超级管理员清理已驳回记录或源订单已删除的记录。',
);
assert.match(
  orderReviewSource,
  /canViewFormalOrder[^;]+!application\.sourceOrderDeleted/,
  '源订单已删除后不得继续显示无效的正式订单查看入口。',
);
assert.match(recoveryReviewSource, /mode === 'review' \? unifiedStatus/);
assert.match(
  recoveryReviewSource,
  /getRecoveryOrderUnifiedReviewStatus\(detailOrder\.status, Boolean\(detailOrder\.deletedAt\)\)/,
  '售后审核台详情必须与列表使用同一套审核状态。',
);
assert.doesNotMatch(
  orderReviewSource,
  /<Chip label=\{application\.status\}/,
  '普通订单审核台不得直接暴露已入库等业务状态。',
);
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
assert.match(
  orderReviewSource,
  /清理订单审核记录[\s\S]*cleanupDeletedSourceOrderApplication|cleanupDeletedSourceOrderApplication[\s\S]*清理订单审核记录/,
  '订单审核台必须为超级管理员提供已删除源订单的安全清理入口',
);
assert.match(
  recoveryReviewSource,
  /清理售后审核记录[\s\S]*cleanupDeletedRecoveryOrderReview|cleanupDeletedRecoveryOrderReview[\s\S]*清理售后审核记录/,
  '售后挽回审核台必须为超级管理员提供已驳回或已删除业务单的安全清理入口',
);
assert.match(
  recoveryReviewSource,
  /canCleanupReview[^]{0,220}row\.status === '审核驳回'[^]{0,220}row\.deletedAt/,
  '售后挽回审核台必须允许超级管理员清理已驳回记录或已删除业务单记录',
);
