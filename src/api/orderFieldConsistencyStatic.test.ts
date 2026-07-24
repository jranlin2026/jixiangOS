import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const orderListSource = read('src/pages/Orders/index.tsx');
const orderDetailSource = read('src/pages/Orders/OrderDetail.tsx');
const orderReviewSource = read('src/pages/OrderReview/index.tsx');
const orderFormSource = read('src/pages/Orders/OrderForm.tsx');

for (const [label, source] of [
  ['订单列表', orderListSource],
  ['订单审核台', orderReviewSource],
] as const) {
  assert.match(source, /id: 'thirdPartyOrderNo', label: '第三方平台订单'/, `${label}必须提供第三方平台订单列`);
  assert.match(source, /id: 'status', label: /, `${label}必须提供状态列`);
}

assert.match(orderListSource, /case 'thirdPartyOrderNo':[^]*order\.thirdPartyOrderNo \|\| '-'/);
assert.match(orderReviewSource, /case 'thirdPartyOrderNo':[^]*application\.orderData\.thirdPartyOrderNo \|\| '-'/);
assert.match(orderReviewSource, /id: 'applicantName', label: '订单创建人'/);
assert.match(orderReviewSource, /id: 'reason', label: '退回\/驳回原因'/);
assert.doesNotMatch(orderReviewSource, /label="销售顾问"/, '审核资料不应再显示与销售负责人重复的销售顾问');
assert.match(orderDetailSource, /formatLeadSourceLabel\(order\.leadSource, order\.sourceName\)/);
assert.match(orderReviewSource, /formatLeadSourceLabel\(detailApplication\.orderData\.leadSource, detailApplication\.orderData\.sourceName\)/);
assert.match(orderFormSource, /isSuperAdmin\(currentUser\)/, '正式订单更正入口必须只向超级管理员开放');
assert.match(orderFormSource, /进入订单更正/);
assert.match(orderFormSource, /orderApi\.correctOrder/);
assert.match(orderFormSource, /更正原因/);

for (const [label, source] of [
  ['订单资料', orderDetailSource],
  ['审核资料', orderReviewSource],
] as const) {
  assert.match(source, /资源归属/, `${label}必须显示资源归属`);
  assert.match(source, /线索来源/, `${label}必须显示线索来源`);
  assert.match(source, /第三方平台订单/, `${label}必须显示第三方平台订单`);
  assert.match(source, /订单创建人/, `${label}必须显示订单创建人`);
}

assert.match(
  orderReviewSource,
  /正式订单当前第三方平台订单/,
  '审核资料必须在正式订单修改后提示当前值',
);
