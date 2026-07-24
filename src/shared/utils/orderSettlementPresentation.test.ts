import assert from 'node:assert/strict';
import type { CommissionOrderSummary } from '../../types/commission';
import type { Order } from '../../types/order';
import { getOrderSettlementEvidenceStatus, getOrderSettlementRisks } from './orderSettlementPresentation';

const summary = {
  orderId: 'order-1',
  orderNo: 'ORD-1',
  customerName: '测试客户',
  productLevel: '课程',
  orderType: '新成交',
  paymentDate: '2026-07-24T08:00:00.000Z',
  orderAmount: 2980,
  totalCommissionAmount: 300,
  performanceAmount: 2980,
  pendingAssignCount: 0,
  exceptionCount: 0,
  status: '待确认',
  splitSummary: [],
  commissions: [{
    id: 'commission-1',
    orderId: 'order-1',
    orderNo: 'ORD-1',
    customerName: '测试客户',
    productLevel: '课程',
    orderAmount: 2980,
    commissionRate: 0.1,
    commissionAmount: 298,
    performanceAmount: 2980,
    role: '销售',
    owner: '销售甲',
    department: '销售部',
    status: '待确认',
    payoutPlanName: '课程销售方案',
    evidenceRequired: true,
    evidenceStatus: '已齐全',
    createdAt: '2026-07-24T08:00:00.000Z',
    updatedAt: '2026-07-24T08:00:00.000Z',
  }],
} as CommissionOrderSummary;

const order = {
  id: 'order-1',
  orderNo: 'ORD-1',
  customerId: 'customer-1',
  customerName: '测试客户',
  productLevel: '课程',
  orderType: '新成交',
  amount: 2980,
  actualAmount: 2980,
  paymentMethod: '对公转账',
  status: '已确认',
  refundStatus: '无',
  owner: '销售甲',
  proofStatus: '已上传',
  payments: [{
    id: 'payment-1',
    amount: 2980,
    paymentMethod: '对公转账',
    paidAt: '2026-07-24T08:00:00.000Z',
    attachments: [{ id: 'attachment-1', name: '付款截图.png', category: 'order-payment-proof', size: 100, mimeType: 'image/png', uploadedById: 'user-1', uploadedByName: '测试员工', uploadedAt: '2026-07-24T08:00:00.000Z' }],
  }],
  dealEvidenceAttachments: [{ id: 'attachment-2', name: '成交路径.png', category: 'order-deal-evidence', size: 100, mimeType: 'image/png', uploadedById: 'user-1', uploadedByName: '测试员工', uploadedAt: '2026-07-24T08:00:00.000Z' }],
  createdAt: '2026-07-24T08:00:00.000Z',
  updatedAt: '2026-07-24T08:00:00.000Z',
} as Order;

assert.equal(getOrderSettlementEvidenceStatus(summary, order), '已齐全');
assert.deepEqual(getOrderSettlementRisks(summary, order), []);
assert.ok(getOrderSettlementRisks(summary, null).some((item) => item.message.includes('未能加载源订单资料')));

const amountMismatchOrder = {
  ...order,
  payments: [{ ...order.payments[0], amount: 2000 }],
};
assert.match(getOrderSettlementRisks(summary, amountMismatchOrder)[0]?.message || '', /付款合计.*实付金额.*不一致/);

const missingEvidenceSummary = {
  ...summary,
  commissions: summary.commissions.map((item) => ({ ...item, evidenceStatus: '缺成交路径截图' as const })),
};
const missingEvidenceOrder = {
  ...order,
  dealEvidenceAttachments: [],
};
assert.equal(getOrderSettlementEvidenceStatus(missingEvidenceSummary, missingEvidenceOrder), '缺成交路径截图');
assert.ok(getOrderSettlementRisks(missingEvidenceSummary, missingEvidenceOrder).some((item) => item.message.includes('缺成交路径截图')));

const refundOrder = { ...order, refundStatus: '退款申请中' as const, refundAmount: 500 };
assert.ok(getOrderSettlementRisks(summary, refundOrder).some((item) => item.message.includes('退款申请中')));

const noRuleSummary = {
  ...summary,
  commissions: summary.commissions.map((item) => ({ ...item, payoutPlanName: undefined, commissionRuleId: undefined })),
};
assert.ok(getOrderSettlementRisks(noRuleSummary, order).some((item) => item.message.includes('未匹配提成方案')));

console.log('order settlement presentation tests passed');
