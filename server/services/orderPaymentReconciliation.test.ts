import assert from 'node:assert/strict';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import type { FinanceTransaction } from '../../src/types/finance';
import type { Order } from '../../src/types/order';
import {
  createOrderPaymentReconciliationContext,
  reconcileOrderPayments,
} from './orderPaymentReconciliation';

const makeOrder = (payments: Array<{ id: string; amount: number; paidAt?: string }>): Order => ({
  id: 'order-a',
  orderNo: 'ORD-A',
  customerId: 'customer-a',
  customerName: '客户A',
  productLevel: '代理',
  orderType: '成交订单',
  amount: payments.reduce((sum, payment) => sum + payment.amount, 0),
  actualAmount: payments.reduce((sum, payment) => sum + payment.amount, 0),
  paymentMethod: '对公转账',
  status: '已确认',
  refundStatus: '未退款',
  owner: '销售A',
  payments: payments.map((payment) => ({
    ...payment,
    paidAt: payment.paidAt ?? '2026-07-01T00:00:00.000Z',
    paymentMethod: '对公转账',
  })),
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
} as unknown as Order);

const makeFlow = (overrides: Partial<FinanceTransaction>): FinanceTransaction => ({
  id: 'original-p1',
  transactionNo: 'FT-1',
  type: '订单实收',
  direction: 'income',
  sourceType: 'order_payment',
  sourceDomain: STORAGE_KEYS.ORDERS,
  sourceId: 'order-a',
  sourceEventId: 'order-a:p1',
  sourceModule: '订单',
  amount: 100,
  status: '已确认',
  relatedBusiness: 'ORD-A',
  orderId: 'order-a',
  orderNo: 'ORD-A',
  occurredAt: '2026-07-01T00:00:00.000Z',
  createdAt: '2026-07-01T00:00:00.000Z',
  ...overrides,
});

const makeAdjustment = (overrides: Partial<FinanceTransaction> = {}): FinanceTransaction => makeFlow({
  id: 'adjustment-p1',
  transactionNo: 'FT-A1',
  type: '订单实收冲正',
  direction: 'expense',
  sourceType: 'order_payment_adjustment',
  sourceEventId: 'order-a:p1:80',
  amount: 20,
  reversalOfId: 'original-p1',
  ...overrides,
});

{
  const result = reconcileOrderPayments(makeOrder([{ id: 'p1', amount: 80 }]), [makeFlow({}), makeAdjustment()]);
  assert.equal(result.amountIssue, false);
  assert.equal(result.businessTimeIssue, false);
  assert.equal(result.evidence.ledgerNetAmount, 80);
  assert.equal(result.evidence.differenceAmount, 0);
  assert.equal(result.trustedTransactions.length, 2, '合法原实收与冲正应逐笔进入可信经营口径');
}

{
  const original = makeFlow({});
  const recordIds = new Map([[original, 'different-record-id']]);
  const context = createOrderPaymentReconciliationContext([original], [makeOrder([{ id: 'p1', amount: 100 }])], recordIds);
  const result = reconcileOrderPayments(makeOrder([{ id: 'p1', amount: 100 }]), context);
  assert.ok(result.evidence.paymentEvidence[0].issues.includes('invalid_original'));
  assert.deepEqual(result.trustedTransactions, [], 'data.id 与存储 recordId 不一致的流水不得进入经营指标');
}

{
  const invalidContainer = { ...makeOrder([]), payments: {} } as unknown as Order;
  const invalidElement = { ...makeOrder([]), payments: [null] } as unknown as Order;
  assert.equal(reconcileOrderPayments(invalidContainer, []).amountIssue, true);
  const elementResult = reconcileOrderPayments(invalidElement, []);
  assert.equal(elementResult.amountIssue, true);
  assert.ok(elementResult.evidence.paymentEvidence[0].issues.includes('invalid_payment'));
}

{
  const invalidIdOrder = {
    ...makeOrder([]),
    payments: [{ id: {}, amount: 100, paidAt: '2026-07-01T00:00:00.000Z', paymentMethod: '对公转账' }],
  } as unknown as Order;
  const result = reconcileOrderPayments(invalidIdOrder, [makeFlow({ sourceEventId: 'order-a:[object Object]' })]);
  assert.ok(result.evidence.paymentEvidence[0].issues.includes('invalid_payment'));
  assert.deepEqual(result.trustedTransactions, []);
}

{
  const result = reconcileOrderPayments(makeOrder([{ id: 'p1', amount: 80 }]), [
    makeFlow({}),
    makeAdjustment({ reversalOfId: '  original-p1  ' }),
  ]);
  assert.ok(result.evidence.paymentEvidence[0].issues.includes('invalid_adjustment'));
  assert.equal(result.trustedTransactions.length, 1, '非规范 reversalOfId 的冲正不得进入可信经营口径');
}

{
  const result = reconcileOrderPayments(makeOrder([{ id: 'p1', amount: 80 }]), [
    makeFlow({}),
    makeAdjustment({ id: 'adjustment-a', amount: 10, sourceEventId: 'duplicate-adjustment-event' }),
    makeAdjustment({ id: 'adjustment-b', amount: 10, sourceEventId: 'duplicate-adjustment-event' }),
  ]);
  assert.equal(result.evidence.ledgerNetAmount, 80);
  assert.equal(result.evidence.differenceAmount, 0);
  assert.ok(result.evidence.paymentEvidence[0].issues.includes('invalid_adjustment'), '重复冲正来源事件必须报非法冲正');
}

{
  const result = reconcileOrderPayments(makeOrder([{ id: 'p1', amount: 100 }]), [makeFlow({ sourceId: 'wrong-order' })]);
  assert.equal(result.evidence.differenceAmount, 0);
  assert.ok(result.evidence.paymentEvidence[0].issues.includes('invalid_original'), '原实收 sourceId 错误不能假绿');
}

{
  const result = reconcileOrderPayments(makeOrder([{ id: 'p1', amount: 50 }]), [
    makeFlow({}),
    makeAdjustment({ amount: 50, sourceId: 'wrong-order', sourceEventId: 'order-a:p1:50' }),
  ]);
  assert.equal(result.evidence.paymentEvidence[0].ledgerAmount, 50, '归属字段异常的已记账冲正仍应计入原始流水净额');
  assert.equal(result.evidence.ledgerNetAmount, 50);
  assert.equal(result.evidence.differenceAmount, 0, '关联异常不能把同一冲正重复计成两次金额差');
  assert.ok(result.evidence.paymentEvidence[0].issues.includes('invalid_adjustment'));
}

{
  const result = reconcileOrderPayments(makeOrder([{ id: 'p1', amount: 50 }]), [
    makeFlow({}),
    makeAdjustment({ amount: 150, sourceEventId: 'order-a:p1:50' }),
  ]);
  assert.ok(result.evidence.paymentEvidence[0].issues.includes('invalid_adjustment'), '累计冲正超过原实收必须报非法冲正');
}

{
  const order = makeOrder([{ id: 'p1', amount: 90 }, { id: 'p2', amount: 90 }]);
  const result = reconcileOrderPayments(order, [
    makeFlow({ id: 'same-original', sourceEventId: 'order-a:p1' }),
    makeFlow({ id: 'same-original', transactionNo: 'FT-2', sourceEventId: 'order-a:p2' }),
    makeAdjustment({ amount: 10, reversalOfId: 'same-original', sourceEventId: 'order-a:p1:90' }),
  ]);
  assert.equal(result.evidence.ledgerNetAmount, 190);
  assert.ok(result.evidence.paymentEvidence.some((payment) => payment.issues.includes('invalid_original')), '重复原流水 data.id 必须报错');
  assert.ok(result.evidence.paymentEvidence.some((payment) => payment.issues.includes('invalid_adjustment')), '同一冲正不得被两条原流水重复消费');
}

{
  const result = reconcileOrderPayments(makeOrder([{ id: 'p1', amount: 100, paidAt: '' }]), [makeFlow({ occurredAt: '' })]);
  assert.equal(result.businessTimeIssue, true, '付款和流水时间同时无效不能被当成相等');
}

{
  const result = reconcileOrderPayments(makeOrder([{ id: 'p1', amount: 80 }]), [
    makeFlow({}),
    makeAdjustment({ sourceEventId: 'order-a:p2:80' }),
  ]);
  assert.ok(result.evidence.paymentEvidence[0].issues.includes('invalid_adjustment'), '冲正来源事件必须与当前付款对齐');
}

{
  const result = reconcileOrderPayments(makeOrder([{ id: 'p1', amount: 80 }]), [
    makeFlow({ occurredAt: '2026-07-10T00:00:00.000Z' }),
    makeAdjustment({ sourceEventId: 'order-a:p1:not-a-number', occurredAt: '2026-07-01T00:00:00.000Z' }),
  ]);
  assert.ok(result.evidence.paymentEvidence[0].issues.includes('invalid_adjustment'), '冲正目标金额无效或早于原收款时必须报非法冲正');
}

{
  const result = reconcileOrderPayments(makeOrder([{ id: 'p1', amount: 100 }, { id: 'p2', amount: 200 }]), [makeFlow({})]);
  assert.equal(result.evidence.paymentEvidence.length, 2, '异常订单必须返回正常和异常在内的每笔付款证据');
  assert.deepEqual(result.evidence.paymentEvidence[0].issues, []);
  assert.deepEqual(result.evidence.paymentEvidence[1].issues, ['missing_original', 'amount_mismatch']);
  assert.equal(result.evidence.differenceAmount, 200);
}

{
  const result = reconcileOrderPayments(makeOrder([{ id: 'p1', amount: 100 }]), [
    makeFlow({}),
    makeFlow({ id: 'commission', sourceType: 'commission_payout', type: '提成发放', amount: 999, orderId: 'order-a' }),
  ]);
  assert.equal(result.evidence.ledgerNetAmount, 100, '其他资金类型即使误带 orderId 也不能进入订单付款净额');
}

{
  const result = reconcileOrderPayments(makeOrder([{ id: 'p1', amount: 80 }]), [
    makeFlow({}),
    makeAdjustment({
      id: 'z-first-adjustment', amount: 10, sourceEventId: 'order-a:p1:90',
      occurredAt: '2026-07-02T00:00:00.000Z', createdAt: '2026-07-02T00:00:00.000Z',
    }),
    makeAdjustment({
      id: 'a-second-adjustment', amount: 10, sourceEventId: 'order-a:p1:80',
      occurredAt: '2026-07-02T00:00:00.000Z', createdAt: '2026-07-02T00:00:00.000Z',
    }),
  ]);
  assert.equal(result.amountIssue, false, '同一时刻的连续冲正必须按目标余额恢复顺序，不能依赖随机 ID');
  assert.equal(result.evidence.ledgerNetAmount, 80);
}

{
  const result = reconcileOrderPayments(makeOrder([{ id: 'p1', amount: 100 }]), [
    makeFlow({ sourceId: 'wrong-order', orderId: 'wrong-order' }),
  ]);
  assert.equal(result.evidence.ledgerNetAmount, 100);
  assert.equal(result.evidence.differenceAmount, 0, '错归属原流水仍应作为当前付款证据核对，不能重复计算差额');
  assert.ok(result.evidence.paymentEvidence[0].issues.includes('invalid_original'));
}

{
  const result = reconcileOrderPayments(makeOrder([{ id: 'p1', amount: 100 }]), [
    makeFlow({ amount: Number.NaN }),
  ]);
  assert.ok(result.evidence.paymentEvidence[0].issues.includes('invalid_original'));
  assert.equal(result.evidence.ledgerNetAmount, 0);
  assert.equal(result.evidence.differenceAmount, 100);
  assert.ok([
    result.evidence.expectedPaymentAmount,
    result.evidence.ledgerNetAmount,
    result.evidence.differenceAmount,
  ].every(Number.isFinite), '损坏金额不得向 API 传播 NaN 或 Infinity');
}

{
  const result = reconcileOrderPayments(makeOrder([{ id: 'bad-payment', amount: 0 }]), []);
  assert.equal(result.amountIssue, true);
  assert.equal(result.evidence.paymentCount, 1, '损坏付款也必须保留逐笔证据，不能静默跳过');
  assert.ok(result.evidence.paymentEvidence[0].issues.includes('invalid_payment'));
  assert.ok(result.evidence.paymentEvidence[0].issues.includes('missing_original'));
}

{
  const unconfirmedOriginal = reconcileOrderPayments(makeOrder([{ id: 'p1', amount: 100 }]), [
    makeFlow({ status: '待确认' }),
  ]);
  assert.ok(unconfirmedOriginal.evidence.paymentEvidence[0].issues.includes('invalid_original'),
    '非已确认原实收不得作为有效付款凭证');
  const unconfirmedAdjustment = reconcileOrderPayments(makeOrder([{ id: 'p1', amount: 80 }]), [
    makeFlow({}),
    makeAdjustment({ status: '待确认' }),
  ]);
  assert.ok(unconfirmedAdjustment.evidence.paymentEvidence[0].issues.includes('invalid_adjustment'),
    '非已确认冲正不得被当作有效冲正凭证');
}

{
  const nonCanonicalEvent = reconcileOrderPayments(makeOrder([{ id: 'p1', amount: 80 }]), [
    makeFlow({}),
    makeAdjustment({ sourceEventId: 'order-a:p1:0x50' }),
  ]);
  assert.ok(nonCanonicalEvent.evidence.paymentEvidence[0].issues.includes('invalid_adjustment'),
    '冲正事件目标金额必须使用写入端生成的规范十进制格式');
}

console.log('order payment reconciliation tests passed');
