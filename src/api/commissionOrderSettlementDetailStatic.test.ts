import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const commissionSource = readFileSync(new URL('../pages/Commission/index.tsx', import.meta.url), 'utf8');
const operationTimelineSource = readFileSync(new URL('../shared/components/SettlementOperationTimeline.tsx', import.meta.url), 'utf8');

for (const section of ['源业务资料', '付款资料', '财务核对', '分账明细']) {
  assert.match(commissionSource, new RegExp(section), `订单分账详情应包含“${section}”分区。`);
}
assert.match(commissionSource, /<SettlementOperationTimeline/, '订单分账详情应复用统一处理记录时间线。');
assert.match(operationTimelineSource, /处理记录/, '统一时间线应保留处理记录分区名称。');

assert.match(commissionSource, /function OrderSettlementBusinessPaymentSummary/);
assert.match(commissionSource, /<OrderSettlementBusinessPaymentSummary/);
assert.match(commissionSource, /getOrderSettlementEvidenceStatus/);
assert.match(commissionSource, /getOrderSettlementRisks/);
assert.match(commissionSource, /BusinessAttachmentLinks/);
assert.match(commissionSource, /AttachmentPreviewLink/);
assert.doesNotMatch(
  commissionSource,
  /SettlementCompactDetailItem label="正式订单号"/,
  '顶部已展示正式订单号，源业务资料不应重复展示同一字段。',
);
assert.doesNotMatch(
  commissionSource.slice(commissionSource.indexOf('<Dialog open={Boolean(summaryDetail)}'), commissionSource.indexOf('<Dialog open={orderSplitViewOpen}')),
  /label: '已撤回'/,
  '订单分账详情顶部摘要不应再以已撤回数量替代凭证状态。',
);
assert.match(
  commissionSource,
  /<Button variant="contained" startIcon=\{<EditIcon \/>\} onClick=\{beginDetailAdjust\}>处理分账<\/Button>/,
  '“处理分账”必须先初始化当前订单的可编辑分账行，不能只切换编辑态。',
);
assert.match(
  commissionSource,
  /<Button variant="outlined" startIcon=\{<EditIcon \/>\} onClick=\{beginDetailAdjust\}>调整分账<\/Button>/,
  '“调整分账”必须先初始化当前订单的可编辑分账行，不能只切换编辑态。',
);

console.log('commission order settlement detail static tests passed');
