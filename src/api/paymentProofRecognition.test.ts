import assert from 'node:assert/strict';
import { recognizePaymentProof } from '../shared/utils/paymentProofRecognition';

const fallbackDate = new Date(2026, 5, 23, 18, 11, 12);

const wechatBillDetail = `
账单详情
福建极享信息科技有限公司
-13,000.00
交易成功
支付时间 2026-05-28 16:01:33
付款方式 浙江农商联合银行储蓄卡(2778)
商品说明 收钱码收款
收款方全称 福建极享信息科技有限公司
订单号 2026052822001414451433679725
商家订单号 47799552788822899114457
`;

const wechatShopOrderDetail = `
订单详情
商品总价 ¥899.00
实付款 ¥899.00
订单编号 3737140054069494528 复制
商品快照 可作为核对订单细节的判断依据
下单时间 2026/06/17 11:48:04
支付方式 微信支付
支付时间 2026/06/17 11:49:11
`;

const wechatPendingShipmentCollapsed = `
待发货
最晚6月14日发货
预留电话 15213180046
极享智能体
实付款 ¥899.00
订单备注 试用体验，7天随时退款
订单编号 3737024527869831424 复制
展开
`;

const alipayBillDetail = `
极享科技
-899.00
当前状态 支付成功
支付时间 2026年6月1日 19:00:30
商品 极享科技
商户全称 福建极享信息科技有限公司
收单机构 财付通支付科技有限公司
支付方式 华夏银行信用卡(6199)
交易单号 4200003129202606018798179055
商户单号 可在支持的商户扫码退款
`;

const result1 = recognizePaymentProof(wechatBillDetail, 0, fallbackDate);
assert.equal(result1.amount, 13000);
assert.equal(result1.paidDate, '2026-05-28T16:01');
assert.equal(result1.paymentOrderNo, '2026052822001414451433679725');

const result2 = recognizePaymentProof(wechatShopOrderDetail, 0, fallbackDate);
assert.equal(result2.amount, 899);
assert.equal(result2.paidDate, '2026-06-17T11:49');
assert.equal(result2.paymentOrderNo, '3737140054069494528');

const result3 = recognizePaymentProof(wechatPendingShipmentCollapsed, 899, fallbackDate);
assert.equal(result3.amount, 899);
assert.equal(result3.paidDate, '2026-06-23T18:11');
assert.equal(result3.paymentOrderNo, '3737024527869831424');

const result4 = recognizePaymentProof(alipayBillDetail, 0, fallbackDate);
assert.equal(result4.amount, 899);
assert.equal(result4.paidDate, '2026-06-01T19:00');
assert.equal(result4.paymentOrderNo, '4200003129202606018798179055');

const actualCollapsedWechatOcr = `
实 付款 899.00
订单 备注 试用 体验 ，7 天 随时 退 款
订单 编号 373570245278698351424 复制
THES 3737024527869831424 E4l
`;
const result5 = recognizePaymentProof(actualCollapsedWechatOcr, 899, fallbackDate);
assert.equal(result5.amount, 899);
assert.equal(result5.paymentOrderNo, '3737024527869831424');

const actualAlipayOcrMissingTopAmount = `
当前 状态 支付 成 功
支付 时 间 2026 年 6 月 1 日 19:00:30
商品 极 享 科技
交易 单 号 4200003129202606018798179055
商户 单 号 可 在 支持 的 商户 扫 码 退 款
`;
const result6 = recognizePaymentProof(actualAlipayOcrMissingTopAmount, 899, fallbackDate);
assert.equal(result6.amount, 899);
assert.equal(result6.paidDate, '2026-06-01T19:00');
assert.equal(result6.paymentOrderNo, '4200003129202606018798179055');
