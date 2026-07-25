import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const commissionSource = readFileSync(new URL('../pages/Commission/index.tsx', import.meta.url), 'utf8');

for (const section of ['源业务资料', '付款资料', '财务核对', '分账明细', '处理记录']) {
  assert.match(commissionSource, new RegExp(section), `订单分账详情应包含“${section}”分区。`);
}

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

console.log('commission order settlement detail static tests passed');
