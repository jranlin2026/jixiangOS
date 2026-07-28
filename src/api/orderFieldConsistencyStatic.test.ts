import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const orderListSource = read('src/pages/Orders/index.tsx');
const orderDetailSource = read('src/pages/Orders/OrderDetail.tsx');
const orderReviewSource = read('src/pages/OrderReview/index.tsx');
const orderFormSource = read('src/pages/Orders/OrderForm.tsx');

for (const [label, source] of [['订单列表', orderListSource], ['订单审核台', orderReviewSource]] as const) {
  assert.match(source, /id: 'thirdPartyOrderNo', label: '第三方平台订单'/, `${label}必须提供第三方平台订单列`);
}
assert.match(orderListSource, /id: 'settlementStatus', label: '分账状态'/, '订单列表必须显示统一分账状态');
assert.match(orderListSource, /id: 'status', label: '订单状态'/, '订单列表必须显示订单业务状态');
assert.match(orderListSource, /id: 'refundStatus', label: '退款状态'/, '订单列表必须显示退款状态');
const orderListToolbarSource = orderListSource.slice(
  orderListSource.indexOf('<ModuleToolbar>'),
  orderListSource.indexOf('</ModuleToolbar>'),
);
assert.doesNotMatch(orderListToolbarSource, /label="订单状态"/, '订单列表筛选栏不应再显示订单状态');
assert.doesNotMatch(orderListToolbarSource, /label="退款状态"/, '订单列表筛选栏不应再显示退款状态');
assert.match(orderReviewSource, /id: 'status', label: /, '订单审核台必须保留审核状态');

assert.match(orderListSource, /case 'thirdPartyOrderNo':[^]*order\.thirdPartyOrderNo \|\| '-'/);
assert.match(orderReviewSource, /case 'thirdPartyOrderNo':[^]*application\.orderData\.thirdPartyOrderNo \|\| '-'/);
assert.match(orderReviewSource, /id: 'applicantName', label: '订单创建人'/);
assert.match(orderReviewSource, /id: 'reason', label: '退回\/驳回原因'/);
assert.doesNotMatch(orderReviewSource, /label="销售顾问"/, '审核资料不应再显示与销售负责人重复的销售顾问');
assert.match(orderDetailSource, /formatLeadSourceLabel\(order\.leadSource, order\.sourceName\)/);
assert.match(orderReviewSource, /formatLeadSourceLabel\(detailApplication\.orderData\.leadSource, detailApplication\.orderData\.sourceName\)/);
assert.match(orderFormSource, /PERMISSION_KEYS\.ORDER_CORRECT/, '正式订单更正必须使用独立权限');
assert.match(orderDetailSource, /订单更正/);
assert.match(orderFormSource, /orderApi\.correctOrder/);
assert.match(orderFormSource, /更正原因/);
assert.match(orderFormSource, /!form\.salesId[\s\S]*?!form\.orderType[\s\S]*?!form\.officialPaymentChannel/, '提交时必须校验销售负责人、订单类型和收款渠道');
const createFormResetSource = orderFormSource.slice(
  orderFormSource.indexOf('if (!order && !application)'),
  orderFormSource.indexOf('const sourceOrder = order || application?.orderData'),
);
for (const resetField of ['actualAmount: 0', "thirdPartyOrderNo: ''", "notes: ''", "paymentOrderNo: ''"]) {
  assert.match(createFormResetSource, new RegExp(resetField.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `新建订单必须重置 ${resetField}`);
}
assert.match(
  orderFormSource,
  /if \(correctionMode && !correctionReason\.trim\(\)\)/,
  '未填更正原因时应在点击后明确提示',
);
assert.match(
  orderFormSource,
  /disabled=\{submitting\}/,
  '提交按钮应允许触发分段校验，不应因缺少必填项无说明地变灰',
);
const correctionSubmitSource = orderFormSource.slice(
  orderFormSource.indexOf('if (order && correctionMode)'),
  orderFormSource.indexOf('} else if (order)'),
);
assert.doesNotMatch(
  correctionSubmitSource,
  /productName:|productLevel:/,
  '订单更正不应提交由后端根据产品派生的名称和等级字段',
);
assert.match(orderFormSource, /useAppFeedback\(\)/, '订单更正的提交问题应使用统一弹窗反馈');
assert.doesNotMatch(
  orderFormSource,
  /\{submitError && !correctionMode && <Alert/,
  '订单表单不应在顶部常驻显示提交错误',
);
assert.match(orderFormSource, /await alert\(message, correctionMode \?/, '订单表单提交错误应使用统一弹窗反馈');

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

for (const section of ['客户信息', '产品信息', '订单信息', '收款与凭证']) {
  assert.match(orderFormSource, new RegExp(`title="${section}"`), `订单填写页应包含“${section}”分区`);
}
assert.match(orderFormSource, /<BusinessFormSection/, '订单填写页应使用默认展开且可折叠的统一业务表单分段');
assert.match(orderFormSource, /产品总计/, '产品明细底部应展示产品总计');
const customerFormSection = orderFormSource.slice(
  orderFormSource.indexOf('title="客户信息"'),
  orderFormSource.indexOf('title="产品信息"'),
);
assert.doesNotMatch(customerFormSection, /label="资源归属"|label="线索录入人"|label="线索贡献人"/);
const paymentFormSection = orderFormSource.slice(
  orderFormSource.indexOf('title="收款与凭证"'),
  orderFormSource.indexOf('</BusinessFormSection>', orderFormSource.indexOf('title="收款与凭证"')),
);
assert.doesNotMatch(paymentFormSection, /label="产品总计"|label="优惠"/);

for (const section of ['客户信息', '产品信息', '订单信息', '收款与凭证', '审核与系统记录']) {
  assert.match(orderDetailSource, new RegExp(`title="${section}"`), `订单资料页应包含“${section}”分区`);
}
assert.doesNotMatch(orderDetailSource, /title="成交资料"/, '订单资料页不应再单独展示成交资料');
assert.match(orderDetailSource, /成交路径 \/ 聊天记录/, '付款明细必须包含成交路径和聊天记录');
assert.match(orderDetailSource, /label: '分账状态'[^]*<SettlementStatusChip/, '正式订单资料顶部必须显示统一分账状态');
const formalOrderInfoSection = orderDetailSource.slice(
  orderDetailSource.indexOf('title="订单信息"'),
  orderDetailSource.indexOf('title="收款与凭证"'),
);
assert.doesNotMatch(formalOrderInfoSection, /订单状态|退款状态/, '正式订单资料的订单信息不再重复显示订单状态和退款状态');

const orderReviewDetailSource = orderReviewSource.slice(
  orderReviewSource.indexOf('open={Boolean(detailApplication)}'),
  orderReviewSource.indexOf('{feedbackDialog}'),
);
for (const section of ['客户信息', '产品信息', '订单信息', '收款与凭证', '审核与系统记录']) {
  assert.match(orderReviewDetailSource, new RegExp(`title="${section}"`), `订单审核资料应包含“${section}”分区`);
}
assert.doesNotMatch(orderReviewDetailSource, /title="成交资料"/, '订单审核资料不应再单独展示成交资料');
assert.match(orderReviewDetailSource, /成交路径 \/ 聊天记录/, '订单审核的付款明细必须包含成交路径和聊天记录');
assert.match(orderDetailSource, /暂无付款记录[^]*dealEvidenceAttachments/, '无付款记录时订单资料仍须显示成交路径截图');
assert.match(orderReviewDetailSource, /暂无付款记录[^]*dealEvidenceAttachments/, '无付款记录时审核资料仍须显示成交路径截图');
