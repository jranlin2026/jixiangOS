import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');
const preview = read('src/shared/components/AttachmentPreview.tsx');
const orderReview = read('src/pages/OrderReview/index.tsx');
const orderDetail = read('src/pages/Orders/OrderDetail.tsx');
const recovery = read('src/pages/AfterSales/RecoveryOrderTab.tsx');

assert.match(preview, /AttachmentPreviewLink/);
assert.match(preview, /AttachmentPreviewDialog/);
assert.match(preview, /role="img"/);

for (const source of [orderReview, orderDetail]) {
  assert.match(source, /payment\.voucherPreview/);
  assert.match(source, /dealEvidencePreview/);
  assert.match(source, /AttachmentPreviewLink/);
  assert.doesNotMatch(source, /<Typography variant="subtitle2"[^>]*>成交路径截图<\/Typography>/);
}

assert.match(recovery, /detailOrder\.paymentVoucherPreview/);
assert.match(recovery, /detailOrder\.chatEvidencePreview/);
assert.match(recovery, /AttachmentPreviewLink/);

console.log('attachment preview static tests passed');
