import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { createHash } from 'node:crypto';
import type {
  FinanceOrderEvidenceIssue,
  FinancePaymentEvidence,
  FinancePaymentEvidenceIssueCode,
  FinanceTransaction,
} from '../../src/types/finance';
import type { Order } from '../../src/types/order';

const roundMoney = (value: number) => Number.isFinite(value)
  ? Math.round((value + Number.EPSILON) * 100) / 100
  : 0;
const clean = (value: unknown) => String(value || '').trim();
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(
  value && typeof value === 'object' && !Array.isArray(value),
);
const rawPayments = (order: Pick<Order, 'payments'>): unknown[] => (
  Array.isArray(order.payments) ? order.payments : []
);
const money = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? roundMoney(parsed) : 0;
};
const timestamp = (value: unknown) => {
  const parsed = new Date(String(value || '')).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

export const financeTransactionOrderId = (transaction: FinanceTransaction) => clean(
  transaction.orderId
  || (transaction.sourceType === 'order_payment' || transaction.sourceType === 'order_payment_adjustment'
    ? transaction.sourceId
    : ''),
);

const signedAmount = (transaction: FinanceTransaction) => roundMoney(
  (transaction.direction === 'income' ? 1 : -1) * money(transaction.amount),
);

const pushIssue = (issues: FinancePaymentEvidenceIssueCode[], issue: FinancePaymentEvidenceIssueCode) => {
  if (!issues.includes(issue)) issues.push(issue);
};

export function financeTransactionRecordId(
  sourceType: FinanceTransaction['sourceType'],
  sourceEventId: string,
): string {
  const readable = `${sourceType}:${sourceEventId}`;
  if (readable.length <= 80) return readable;
  return `${sourceType}:${createHash('sha256').update(sourceEventId).digest('hex')}`;
}

export interface OrderPaymentReconciliationResult {
  amountIssue: boolean;
  businessTimeIssue: boolean;
  trustedTransactions: FinanceTransaction[];
  evidence: FinanceOrderEvidenceIssue;
}

export interface OrderPaymentReconciliationContext {
  ledgerRowsByOrderId: Map<string, FinanceTransaction[]>;
  originalsByEventId: Map<string, FinanceTransaction[]>;
  adjustmentsByOriginalId: Map<string, FinanceTransaction[]>;
  originalIdCount: Map<string, number>;
  adjustmentIdCount: Map<string, number>;
  adjustmentEventCount: Map<string, number>;
  recordIdentityIssueRows: Set<FinanceTransaction>;
}

/**
 * Resolve every finance row to the business orders it may belong to. Direct metadata is not
 * trusted on its own: malformed legacy rows can still be recovered from the payment event or
 * from an adjustment's reversal link. The map is built once so callers never scan all orders
 * for every transaction.
 */
export function attributeFinanceTransactionsToOrders(
  allTransactions: FinanceTransaction[],
  orders: Array<Pick<Order, 'id' | 'payments'>>,
): Map<FinanceTransaction, Set<string>> {
  const knownOrderIds = new Set(orders.map((order) => clean(order.id)).filter(Boolean));
  const orderIdsByPaymentEvent = new Map<string, Set<string>>();
  orders.forEach((order) => {
    const orderId = clean(order.id);
    if (!orderId) return;
    rawPayments(order).forEach((rawPayment) => {
      if (!isRecord(rawPayment)) return;
      if (typeof rawPayment.id !== 'string') return;
      const paymentId = clean(rawPayment.id);
      if (!paymentId) return;
      const eventId = `${orderId}:${paymentId}`;
      const eventOrderIds = orderIdsByPaymentEvent.get(eventId) || new Set<string>();
      eventOrderIds.add(orderId);
      orderIdsByPaymentEvent.set(eventId, eventOrderIds);
    });
  });

  const attribution = new Map<FinanceTransaction, Set<string>>();
  const originalOrderIdsById = new Map<string, Set<string>>();
  const directAndEventOrderIds = (transaction: FinanceTransaction) => {
    const orderIds = new Set<string>();
    [clean(transaction.orderId), clean(transaction.sourceId)].forEach((directOrderId) => {
      if (knownOrderIds.has(directOrderId)) orderIds.add(directOrderId);
    });
    const sourceEventId = clean(transaction.sourceEventId);
    const paymentEventIds = transaction.sourceType === 'order_payment_adjustment'
      ? [sourceEventId, sourceEventId.slice(0, Math.max(0, sourceEventId.lastIndexOf(':')))]
      : [sourceEventId];
    paymentEventIds.forEach((paymentEventId) => {
      (orderIdsByPaymentEvent.get(paymentEventId) || new Set<string>())
        .forEach((orderId) => orderIds.add(orderId));
    });
    return orderIds;
  };

  allTransactions.filter((transaction) => transaction.sourceType === 'order_payment').forEach((transaction) => {
    const orderIds = directAndEventOrderIds(transaction);
    attribution.set(transaction, orderIds);
    const originalId = clean(transaction.id);
    if (!originalId) return;
    const linkedOrderIds = originalOrderIdsById.get(originalId) || new Set<string>();
    orderIds.forEach((orderId) => linkedOrderIds.add(orderId));
    originalOrderIdsById.set(originalId, linkedOrderIds);
  });

  allTransactions.filter((transaction) => transaction.sourceType === 'order_payment_adjustment').forEach((transaction) => {
    const orderIds = directAndEventOrderIds(transaction);
    (originalOrderIdsById.get(clean(transaction.reversalOfId)) || new Set<string>())
      .forEach((orderId) => orderIds.add(orderId));
    attribution.set(transaction, orderIds);
  });
  return attribution;
}

export function createOrderPaymentReconciliationContext(
  allTransactions: FinanceTransaction[],
  orders: Array<Pick<Order, 'id' | 'payments'>> = [],
  recordIdByTransaction: Map<FinanceTransaction, string> = new Map(),
): OrderPaymentReconciliationContext {
  const orderTransactions = allTransactions.filter((transaction) => (
    transaction.sourceType === 'order_payment' || transaction.sourceType === 'order_payment_adjustment'
  ));
  const ledgerRowsByOrderId = new Map<string, FinanceTransaction[]>();
  const originalsByEventId = new Map<string, FinanceTransaction[]>();
  const adjustmentsByOriginalId = new Map<string, FinanceTransaction[]>();
  const originalIdCount = new Map<string, number>();
  const adjustmentIdCount = new Map<string, number>();
  const adjustmentEventCount = new Map<string, number>();
  const recordIdentityIssueRows = new Set<FinanceTransaction>();
  const attribution = orders.length
    ? attributeFinanceTransactionsToOrders(orderTransactions, orders)
    : null;

  orderTransactions.forEach((transaction) => {
    const recordId = recordIdByTransaction.get(transaction);
    if (recordId !== undefined && (
      typeof transaction.id !== 'string'
      || transaction.id !== recordId
      || typeof transaction.sourceEventId !== 'string'
      || recordId !== financeTransactionRecordId(transaction.sourceType, transaction.sourceEventId)
    )) {
      recordIdentityIssueRows.add(transaction);
    }
    const attributedOrderIds = attribution?.get(transaction) || new Set([financeTransactionOrderId(transaction)]);
    attributedOrderIds.forEach((orderId) => {
      if (orderId) ledgerRowsByOrderId.set(orderId, [...(ledgerRowsByOrderId.get(orderId) || []), transaction]);
    });
    if (transaction.sourceType === 'order_payment') {
      const eventId = clean(transaction.sourceEventId);
      if (eventId) originalsByEventId.set(eventId, [...(originalsByEventId.get(eventId) || []), transaction]);
      const id = clean(transaction.id);
      if (id) originalIdCount.set(id, (originalIdCount.get(id) || 0) + 1);
      return;
    }
    const originalId = clean(transaction.reversalOfId);
    if (originalId) adjustmentsByOriginalId.set(originalId, [...(adjustmentsByOriginalId.get(originalId) || []), transaction]);
    const id = clean(transaction.id);
    if (id) adjustmentIdCount.set(id, (adjustmentIdCount.get(id) || 0) + 1);
    const eventId = clean(transaction.sourceEventId);
    if (eventId) adjustmentEventCount.set(eventId, (adjustmentEventCount.get(eventId) || 0) + 1);
  });
  return {
    ledgerRowsByOrderId,
    originalsByEventId,
    adjustmentsByOriginalId,
    originalIdCount,
    adjustmentIdCount,
    adjustmentEventCount,
    recordIdentityIssueRows,
  };
}

export function reconcileOrderPayments(
  order: Order,
  transactionsOrContext: FinanceTransaction[] | OrderPaymentReconciliationContext,
): OrderPaymentReconciliationResult {
  const orderId = clean(order.id);
  const context = Array.isArray(transactionsOrContext)
    ? createOrderPaymentReconciliationContext(transactionsOrContext, [order])
    : transactionsOrContext;
  const {
    originalsByEventId,
    adjustmentsByOriginalId,
    originalIdCount,
    adjustmentIdCount,
    adjustmentEventCount,
    recordIdentityIssueRows,
  } = context;
  const ledgerRows = context.ledgerRowsByOrderId.get(orderId) || [];
  const ledgerRowSet = new Set(ledgerRows);

  const processedOriginals = new Set<FinanceTransaction>();
  const processedAdjustments = new Set<FinanceTransaction>();
  const trustedTransactions = new Set<FinanceTransaction>();
  const paymentEvidence: FinancePaymentEvidence[] = [];
  const orderIssues: string[] = [];
  if (order.payments !== undefined && !Array.isArray(order.payments)) {
    orderIssues.push('订单付款记录结构无效');
  }
  const paymentIdCount = new Map<string, number>();
  rawPayments(order).forEach((rawPayment) => {
    if (!isRecord(rawPayment) || typeof rawPayment.id !== 'string') return;
    const paymentId = clean(rawPayment.id);
    if (paymentId) paymentIdCount.set(paymentId, (paymentIdCount.get(paymentId) || 0) + 1);
  });
  let differenceAmount = 0;

  const applyOriginal = (
    original: FinanceTransaction,
    issues?: FinancePaymentEvidenceIssueCode[],
    paymentId?: string,
    trustEligible = false,
  ) => {
    processedOriginals.add(original);
    let netAmount = signedAmount(original);
    const originalAmount = money(original.amount);
    const originalId = clean(original.id);
    const originalValid = Boolean(
      trustEligible
      && typeof original.id === 'string'
      && originalId
      && (originalIdCount.get(originalId) || 0) === 1
      && !recordIdentityIssueRows.has(original)
      && typeof original.sourceDomain === 'string'
      && typeof original.sourceId === 'string'
      && typeof original.orderId === 'string'
      && typeof original.sourceEventId === 'string'
      && typeof original.occurredAt === 'string'
      && original.sourceDomain === STORAGE_KEYS.ORDERS
      && original.sourceId === orderId
      && original.orderId === orderId
      && paymentId
      && original.sourceEventId === `${orderId}:${paymentId}`
      && original.direction === 'income'
      && original.status === '已确认'
      && Number.isFinite(Number(original.amount))
      && originalAmount > 0
    );
    if (issues && !originalValid) pushIssue(issues, 'invalid_original');
    if (originalValid) trustedTransactions.add(original);
    let validAdjustmentAmount = 0;
    let trustedChain = originalValid;
    const linkedAdjustments = [...(originalId ? adjustmentsByOriginalId.get(originalId) || [] : [])]
      .sort((left, right) => {
        const occurredAtDifference = (timestamp(left.occurredAt) ?? Number.MAX_SAFE_INTEGER)
          - (timestamp(right.occurredAt) ?? Number.MAX_SAFE_INTEGER);
        if (occurredAtDifference) return occurredAtDifference;
        const createdAtDifference = (timestamp(left.createdAt) ?? Number.MAX_SAFE_INTEGER)
          - (timestamp(right.createdAt) ?? Number.MAX_SAFE_INTEGER);
        if (createdAtDifference) return createdAtDifference;
        const eventPrefix = `${orderId}:${paymentId}:`;
        const leftTarget = clean(left.sourceEventId).startsWith(eventPrefix)
          ? Number(clean(left.sourceEventId).slice(eventPrefix.length))
          : Number.NEGATIVE_INFINITY;
        const rightTarget = clean(right.sourceEventId).startsWith(eventPrefix)
          ? Number(clean(right.sourceEventId).slice(eventPrefix.length))
          : Number.NEGATIVE_INFINITY;
        if (Number.isFinite(leftTarget) && Number.isFinite(rightTarget) && leftTarget !== rightTarget) {
          return rightTarget - leftTarget;
        }
        return clean(left.id).localeCompare(clean(right.id));
      });
    linkedAdjustments.forEach((adjustment) => {
      if (processedAdjustments.has(adjustment)) {
        if (issues) pushIssue(issues, 'invalid_adjustment');
        return;
      }
      processedAdjustments.add(adjustment);
      const adjustmentId = clean(adjustment.id);
      const adjustmentEventId = clean(adjustment.sourceEventId);
      const adjustmentEventPrefix = `${orderId}:${paymentId}:`;
      const adjustmentEventTarget = adjustmentEventId.startsWith(adjustmentEventPrefix)
        ? Number(adjustmentEventId.slice(adjustmentEventPrefix.length))
        : Number.NaN;
      const originalTime = timestamp(original.occurredAt);
      const adjustmentTime = timestamp(adjustment.occurredAt);
      const adjustmentAmount = money(adjustment.amount);
      const structurallyValid = adjustment.direction === 'expense'
        && Number.isFinite(Number(adjustment.amount))
        && adjustmentAmount > 0;
      if (structurallyValid) validAdjustmentAmount = roundMoney(validAdjustmentAmount + adjustmentAmount);
      const expectedTargetAmount = roundMoney(originalAmount - validAdjustmentAmount);
      const adjustmentValid = Boolean(
        trustedChain
        && typeof adjustment.id === 'string'
        && typeof adjustment.sourceDomain === 'string'
        && typeof adjustment.sourceId === 'string'
        && typeof adjustment.orderId === 'string'
        && typeof adjustment.sourceEventId === 'string'
        && typeof adjustment.occurredAt === 'string'
        && adjustment.sourceDomain === STORAGE_KEYS.ORDERS
        && adjustment.sourceId === orderId
        && adjustment.orderId === orderId
        && adjustmentId
        && (adjustmentIdCount.get(adjustmentId) || 0) === 1
        && !recordIdentityIssueRows.has(adjustment)
        && typeof adjustment.reversalOfId === 'string'
        && adjustment.reversalOfId === originalId
        && adjustmentEventId
        && (adjustmentEventCount.get(adjustmentEventId) || 0) === 1
        && paymentId
        && adjustmentEventId.startsWith(`${orderId}:${paymentId}:`)
        && Number.isFinite(adjustmentEventTarget)
        && roundMoney(adjustmentEventTarget) === expectedTargetAmount
        && adjustmentEventId === `${orderId}:${paymentId}:${String(expectedTargetAmount)}`
        && originalTime !== null
        && adjustmentTime !== null
        && adjustmentTime >= originalTime
        && structurallyValid
        && validAdjustmentAmount - originalAmount < 0.01
        && adjustment.status === '已确认'
      );
      if (issues && !adjustmentValid) pushIssue(issues, 'invalid_adjustment');
      if (adjustmentValid) trustedTransactions.add(adjustment);
      else trustedChain = false;
      /* Keep every linked row in the immutable ledger total even when its evidence is invalid. */
      netAmount = roundMoney(netAmount + signedAmount(adjustment));
    });
    if (issues && validAdjustmentAmount - originalAmount >= 0.01) {
      pushIssue(issues, 'invalid_adjustment');
    }
    return netAmount;
  };

  rawPayments(order).forEach((rawPayment, paymentIndex) => {
    const paymentShapeValid = isRecord(rawPayment);
    const payment = paymentShapeValid ? rawPayment : {};
    const issues: FinancePaymentEvidenceIssueCode[] = [];
    const paymentId = typeof payment.id === 'string' ? clean(payment.id) : '';
    const paymentAmount = money(payment.amount);
    const validPayment = Boolean(
      paymentId
      && paymentShapeValid
      && typeof payment.id === 'string'
      && payment.id === paymentId
      && (paymentIdCount.get(paymentId) || 0) === 1
      && Number.isFinite(Number(payment.amount))
      && paymentAmount > 0
      && typeof payment.paidAt === 'string'
      && payment.paidAt === payment.paidAt.trim()
      && timestamp(payment.paidAt) !== null
    );
    if (!validPayment) pushIssue(issues, 'invalid_payment');
    const eventId = `${orderId}:${paymentId}`;
    const eventOriginals = originalsByEventId.get(eventId) || [];
    const currentOrderOriginals = eventOriginals.filter((transaction) => ledgerRowSet.has(transaction));
    const availableOriginals = currentOrderOriginals.filter((original) => !processedOriginals.has(original));
    if (!eventOriginals.length) pushIssue(issues, 'missing_original');
    if (eventOriginals.length > 1
      || currentOrderOriginals.length > 1
      || (currentOrderOriginals.length > 0 && availableOriginals.length !== 1)) {
      pushIssue(issues, 'duplicate_original');
    }
    if (eventOriginals.length > 0 && currentOrderOriginals.length === 0) pushIssue(issues, 'invalid_original');

    let ledgerAmount = 0;
    availableOriginals.forEach((original) => {
      const paymentTime = timestamp(payment.paidAt);
      const ledgerTime = timestamp(original.occurredAt);
      if (paymentTime === null || ledgerTime === null || paymentTime !== ledgerTime) {
        pushIssue(issues, 'business_time_mismatch');
      }
      ledgerAmount = roundMoney(ledgerAmount + applyOriginal(
        original,
        issues,
        paymentId,
        validPayment
          && eventOriginals.length === 1
          && currentOrderOriginals.length === 1
          && availableOriginals.length === 1,
      ));
    });
    const paymentDifference = roundMoney(Math.abs(ledgerAmount - paymentAmount));
    if (paymentDifference >= 0.01) pushIssue(issues, 'amount_mismatch');
    differenceAmount = roundMoney(differenceAmount + paymentDifference);
    paymentEvidence.push({
      paymentId: paymentId || `invalid-payment-${paymentIndex + 1}`,
      paymentReference: clean(payment.paymentOrderNo) || undefined,
      paidAt: (typeof payment.paidAt === 'string' ? payment.paidAt : '') as FinancePaymentEvidence['paidAt'],
      expectedAmount: paymentAmount,
      ledgerAmount,
      differenceAmount: paymentDifference,
      issues,
    });
  });

  ledgerRows.filter((transaction) => transaction.sourceType === 'order_payment').forEach((original) => {
    if (processedOriginals.has(original)) return;
    differenceAmount = roundMoney(differenceAmount + Math.abs(applyOriginal(original)));
    if (!orderIssues.includes('存在未关联订单付款的实收流水')) orderIssues.push('存在未关联订单付款的实收流水');
  });
  ledgerRows.filter((transaction) => transaction.sourceType === 'order_payment_adjustment').forEach((adjustment) => {
    if (processedAdjustments.has(adjustment)) return;
    processedAdjustments.add(adjustment);
    differenceAmount = roundMoney(differenceAmount + Math.abs(signedAmount(adjustment)));
    if (!orderIssues.includes('存在未关联原实收的冲正流水')) orderIssues.push('存在未关联原实收的冲正流水');
  });
  if (!paymentEvidence.length && !ledgerRows.length) orderIssues.push('订单没有可核对的有效付款记录');

  const issuePaymentCount = paymentEvidence.filter((payment) => payment.issues.length > 0).length;
  const amountIssue = orderIssues.length > 0 || paymentEvidence.some((payment) => (
    payment.issues.some((issue) => issue !== 'business_time_mismatch')
  ));
  const businessTimeIssue = paymentEvidence.some((payment) => payment.issues.includes('business_time_mismatch'));
  const ledgerNetAmount = roundMoney(ledgerRows.reduce((sum, transaction) => sum + signedAmount(transaction), 0));
  const expectedPaymentAmount = roundMoney(paymentEvidence.reduce((sum, payment) => sum + payment.expectedAmount, 0));

  return {
    amountIssue,
    businessTimeIssue,
    trustedTransactions: [...trustedTransactions],
    evidence: {
      orderId,
      orderNo: clean(order.orderNo) || orderId,
      customerName: clean(order.customerName) || '-',
      paymentCount: paymentEvidence.length,
      expectedPaymentAmount,
      ledgerNetAmount,
      differenceAmount,
      issueCount: issuePaymentCount + orderIssues.length,
      orderIssues,
      paymentEvidence,
    },
  };
}
