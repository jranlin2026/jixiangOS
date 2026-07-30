import { Prisma, type PrismaClient } from '@prisma/client';
import { failure, success } from '../api/response';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { CommissionPayoutRecord } from '../../src/types/commission';
import type {
  FinanceTransaction,
  FinanceTransactionFilters,
  FinanceTransactionPage,
} from '../../src/types/finance';
import type { Order } from '../../src/types/order';
import {
  attributeFinanceTransactionsToOrders,
  createOrderPaymentReconciliationContext,
  financeTransactionRecordId as sourceRecordId,
  reconcileOrderPayments,
} from './orderPaymentReconciliation';

type FinancePrisma = Pick<PrismaClient, 'businessRecord' | '$transaction'>;
type FinanceTransactionClient = Prisma.TransactionClient;
type FinanceBackfillReport = {
  apply: boolean;
  plannedCount: number;
  existingCount: number;
  createdCount: number;
  incomeAmount: number;
  expenseAmount: number;
  netAmount: number;
  existingIncomeAmount: number;
  existingExpenseAmount: number;
  missingCount: number;
  errors: string[];
};

type OrderPaymentAdjustmentInput = {
  order: Order;
  paymentId: string;
  actor: AuthenticatedUser;
  reason: string;
  occurredAt?: string;
  createdAt?: string;
  deferFinalReconciliation?: boolean;
};
type FinanceTransactionInput = Omit<FinanceTransaction, 'id' | 'transactionNo' | 'createdAt'>;

const roundMoney = (value: number) => Number.isFinite(value)
  ? Math.round((value + Number.EPSILON) * 100) / 100
  : 0;
const finiteMoney = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? roundMoney(parsed) : 0;
};
const shanghaiDayStart = (value: string | undefined) => {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00+08:00`).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};
const displayText = (value: unknown, fallback = '') => {
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  return fallback;
};
const displayTimestamp = (value: unknown) => {
  if (typeof value === 'string') return value.trim();
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : '';
  }
  return '';
};

function toDisplayTransaction(raw: FinanceTransaction, transportId: string, forceAnomaly = false): FinanceTransaction {
  const direction = raw.direction === 'income' || raw.direction === 'expense' ? raw.direction : '';
  const sourceType = ['order_payment', 'order_payment_adjustment', 'commission_payout'].includes(String(raw.sourceType))
    ? raw.sourceType : '';
  return {
    ...raw,
    id: transportId,
    transactionNo: displayText(raw.transactionNo, '异常资金流水'),
    type: displayText(raw.type, '异常资金流水'),
    direction: direction as FinanceTransaction['direction'],
    sourceType: sourceType as FinanceTransaction['sourceType'],
    sourceDomain: displayText(raw.sourceDomain),
    sourceId: displayText(raw.sourceId),
    sourceEventId: displayText(raw.sourceEventId),
    sourceModule: displayText(raw.sourceModule, '未知来源'),
    amount: finiteMoney(raw.amount),
    status: forceAnomaly ? '异常' : displayText(raw.status, '异常'),
    relatedBusiness: displayText(raw.relatedBusiness, '-'),
    orderId: displayText(raw.orderId) || undefined,
    orderNo: displayText(raw.orderNo) || undefined,
    customerId: displayText(raw.customerId) || undefined,
    customerName: displayText(raw.customerName) || undefined,
    productName: displayText(raw.productName) || undefined,
    productLevel: (displayText(raw.productLevel) || undefined) as FinanceTransaction['productLevel'],
    paymentMethod: (displayText(raw.paymentMethod) || undefined) as FinanceTransaction['paymentMethod'],
    paymentReference: displayText(raw.paymentReference) || undefined,
    operatorId: displayText(raw.operatorId) || undefined,
    operatorName: displayText(raw.operatorName) || undefined,
    occurredAt: displayTimestamp(raw.occurredAt),
    reason: displayText(raw.reason) || undefined,
    attachmentIds: Array.isArray(raw.attachmentIds)
      ? raw.attachmentIds.map((value) => displayText(value)).filter(Boolean)
      : [],
    reversalOfId: displayText(raw.reversalOfId) || undefined,
    sourceStatus: displayText(raw.sourceStatus) || undefined,
    createdAt: displayTimestamp(raw.createdAt),
  };
}
const asObject = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const isOrderPaymentRecord = (value: unknown): value is NonNullable<Order['payments']>[number] => Boolean(
  value && typeof value === 'object' && !Array.isArray(value),
);
const orderPaymentRecords = (order: Pick<Order, 'payments'> | undefined) => (
  Array.isArray(order?.payments) ? order.payments.filter(isOrderPaymentRecord) : []
);
const invalidOrderPaymentStructure = (order: Pick<Order, 'payments'>) => (
  order.payments !== undefined
  && (!Array.isArray(order.payments) || order.payments.some((payment) => !isOrderPaymentRecord(payment)))
);
const transactionNo = (row: Pick<FinanceTransaction, 'direction' | 'occurredAt' | 'sourceEventId'>) => {
  const date = row.occurredAt.slice(0, 10).replace(/-/g, '');
  const mark = row.direction === 'income' ? 'I' : 'E';
  const suffix = row.sourceEventId.replace(/[^a-zA-Z0-9]/g, '').slice(-12).toUpperCase();
  return `FT-${date}-${mark}-${suffix}`;
};

function normalize(value: unknown): FinanceTransaction | null {
  const data = asObject(value);
  if (!data.id || !data.sourceEventId) return null;
  return data as unknown as FinanceTransaction;
}

function normalizeForEvidence(value: unknown): FinanceTransaction | null {
  const data = asObject(value);
  if (!Object.keys(data).length) return null;
  return data as unknown as FinanceTransaction;
}

function assertIdempotentTransaction(
  value: unknown,
  recordId: string,
  input: FinanceTransactionInput,
): FinanceTransaction {
  const row = normalizeForEvidence(value);
  const rowTime = new Date(String(row?.occurredAt || '')).getTime();
  const inputTime = new Date(String(input.occurredAt || '')).getTime();
  const matches = Boolean(
    row
    && typeof row.id === 'string'
    && row.id === recordId
    && row.sourceType === input.sourceType
    && row.direction === input.direction
    && row.sourceDomain === input.sourceDomain
    && row.sourceId === input.sourceId
    && row.sourceEventId === input.sourceEventId
    && row.orderId === input.orderId
    && row.status === input.status
    && row.reversalOfId === input.reversalOfId
    && Number.isFinite(Number(row.amount))
    && roundMoney(Number(row.amount)) === roundMoney(Number(input.amount))
    && Number.isFinite(rowTime)
    && Number.isFinite(inputTime)
    && rowTime === inputTime
  );
  if (!matches) {
    throw new Error(`资金流水来源事件 ${input.sourceEventId} 已存在冲突记录，请先修复异常流水`);
  }
  if (!row) throw new Error(`资金流水来源事件 ${input.sourceEventId} 数据不完整`);
  return row;
}

async function createOnce(tx: FinanceTransactionClient, input: FinanceTransactionInput, createdAt: string) {
  const recordId = sourceRecordId(input.sourceType, input.sourceEventId);
  const existing = await tx.businessRecord.findUnique({
    where: { domain_recordId: { domain: STORAGE_KEYS.FINANCE_TRANSACTIONS, recordId } },
  });
  if (existing) return assertIdempotentTransaction(existing.data, recordId, input);
  const row: FinanceTransaction = { ...input, id: recordId, transactionNo: transactionNo(input), createdAt };
  try {
    await tx.businessRecord.create({
      data: {
        id: `${STORAGE_KEYS.FINANCE_TRANSACTIONS}:${recordId}`,
        domain: STORAGE_KEYS.FINANCE_TRANSACTIONS,
        recordId,
        title: row.transactionNo,
        status: row.status,
        owner: row.operatorName || null,
        customerId: row.customerId || null,
        orderId: row.orderId || null,
        amount: new Prisma.Decimal(row.amount),
        eventAt: new Date(row.occurredAt),
        data: row as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    if (String((error as { code?: unknown } | null)?.code || '') !== 'P2002') throw error;
    const raced = await tx.businessRecord.findUnique({
      where: { domain_recordId: { domain: STORAGE_KEYS.FINANCE_TRANSACTIONS, recordId } },
    });
    if (!raced) throw error;
    return assertIdempotentTransaction(raced.data, recordId, input);
  }
  return row;
}

export function createFinanceTransactionService(prisma: FinancePrisma) {
  const hydrateSourceStatuses = async (items: FinanceTransaction[]) => {
    if (!items.length) return items;
    const orderIds = [...new Set(items
      .filter((item) => item.sourceType === 'order_payment' || item.sourceType === 'order_payment_adjustment')
      .map((item) => String(item.sourceId || '').trim())
      .filter(Boolean))];
    const payoutIds = [...new Set(items
      .filter((item) => item.sourceType === 'commission_payout')
      .map((item) => String(item.sourceId || '').trim())
      .filter(Boolean))];
    const clauses: Prisma.BusinessRecordWhereInput[] = [];
    if (orderIds.length) clauses.push({ domain: STORAGE_KEYS.ORDERS, recordId: { in: orderIds } });
    if (payoutIds.length) clauses.push({ domain: STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES, recordId: { in: payoutIds } });
    const sources = clauses.length ? await prisma.businessRecord.findMany({ where: { OR: clauses } }) : [];
    const statuses = new Map(sources.map((source) => [
      `${source.domain}:${source.recordId}`,
      String(asObject(source.data).status || source.status || '-'),
    ]));
    return items.map((item) => ({
      ...item,
      sourceStatus: statuses.get(`${item.sourceDomain}:${item.sourceId}`) || item.sourceStatus || '-',
    }));
  };

  const recordOrderPayments = async (tx: FinanceTransactionClient, order: Order, actor: AuthenticatedUser, createdAt = new Date().toISOString()) => {
    const rows: FinanceTransaction[] = [];
    if (invalidOrderPaymentStructure(order)) throw new Error(`订单 ${order.orderNo} 存在无效付款记录`);
    const paymentIds = new Set<string>();
    for (const payment of orderPaymentRecords(order)) {
      if (typeof payment.id !== 'string') throw new Error(`订单 ${order.orderNo} 存在无效付款记录`);
      const paymentId = payment.id.trim();
      if (!paymentId
        || payment.id !== paymentId
        || paymentIds.has(paymentId)
        || typeof payment.paidAt !== 'string'
        || !payment.paidAt.trim()
        || payment.paidAt !== payment.paidAt.trim()
        || !Number.isFinite(new Date(payment.paidAt).getTime())
        || !Number.isFinite(Number(payment.amount))
        || !(roundMoney(Number(payment.amount)) > 0)) throw new Error(`订单 ${order.orderNo} 存在无效付款记录`);
      paymentIds.add(paymentId);
      const row = await createOnce(tx, {
        type: '订单实收', direction: 'income', sourceType: 'order_payment',
        sourceDomain: STORAGE_KEYS.ORDERS, sourceId: order.id, sourceEventId: `${order.id}:${paymentId}`, sourceModule: '订单',
        amount: roundMoney(Number(payment.amount)), status: '已确认', relatedBusiness: order.orderNo,
        orderId: order.id, orderNo: order.orderNo, customerId: order.customerId, customerName: order.customerName,
        productName: order.productName, productLevel: order.productLevel,
        paymentMethod: payment.paymentMethod || order.paymentMethod, paymentReference: payment.paymentOrderNo,
        operatorId: actor.id, operatorName: actor.name, occurredAt: payment.paidAt,
        reason: payment.remark || '正式订单实际收款', attachmentIds: Array.isArray(payment.attachments)
          ? payment.attachments.map((item) => String(item?.id || '').trim()).filter(Boolean)
          : [],
      }, createdAt);
      if (row) rows.push(row);
    }
    return rows;
  };

  const recordCommissionPayout = async (tx: FinanceTransactionClient, payout: CommissionPayoutRecord) => createOnce(tx, {
    type: '提成发放', direction: 'expense', sourceType: 'commission_payout',
    sourceDomain: STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES, sourceId: payout.id, sourceEventId: payout.id, sourceModule: '提成发放',
    amount: roundMoney(Number(payout.totalAmount)), status: '已确认', relatedBusiness: payout.payoutNo,
    paymentMethod: payout.paymentMethod as FinanceTransaction['paymentMethod'], paymentReference: payout.paymentReference,
    operatorId: payout.issuedById, operatorName: payout.issuedByName, occurredAt: payout.issuedAt,
    reason: `向 ${payout.byOwner.length} 名员工发放 ${payout.totalCount} 笔提成`, attachmentIds: [],
  }, payout.createdAt);

  const recordOrderPaymentAdjustment = async (tx: FinanceTransactionClient, input: OrderPaymentAdjustmentInput) => {
    if (invalidOrderPaymentStructure(input.order)) throw new Error(`订单 ${input.order.orderNo} 存在无效付款记录`);
    const payment = orderPaymentRecords(input.order).find((item) => (
      typeof item.id === 'string' && item.id === input.paymentId
    ));
    if (!payment
      || typeof payment.id !== 'string'
      || !payment.id.trim()
      || !Number.isFinite(Number(payment.amount))
      || !(Number(payment.amount) > 0)
      || typeof payment.paidAt !== 'string'
      || !Number.isFinite(new Date(payment.paidAt).getTime())) {
      throw new Error(`订单 ${input.order.orderNo} 找不到有效付款 ${input.paymentId}`);
    }
    const originalRecordId = sourceRecordId('order_payment', `${input.order.id}:${input.paymentId}`);
    const records = await tx.businessRecord.findMany({ where: { domain: STORAGE_KEYS.FINANCE_TRANSACTIONS } });
    const recordIdByTransaction = new Map<FinanceTransaction, string>();
    const transactions = records.flatMap((record) => {
      const transaction = normalizeForEvidence(record.data);
      if (!transaction) return [];
      recordIdByTransaction.set(transaction, record.recordId);
      return [transaction];
    });
    const original = transactions.find((transaction) => recordIdByTransaction.get(transaction) === originalRecordId);
    if (!original) throw new Error(`订单 ${input.order.orderNo} 的原实收流水不存在`);
    const priorAdjustments = transactions.filter((row) => (
      row.sourceType === 'order_payment_adjustment' && row.reversalOfId === original.id
    ));
    const reconciliation = reconcileOrderPayments(input.order, createOrderPaymentReconciliationContext(
      transactions,
      [input.order],
      recordIdByTransaction,
    ));
    const trustedRows = new Set(reconciliation.trustedTransactions);
    const targetPaymentEvidence = reconciliation.evidence.paymentEvidence.find((item) => item.paymentId === input.paymentId);
    const unrelatedEvidenceIssue = reconciliation.evidence.paymentEvidence.some((item) => (
      item.paymentId !== input.paymentId
      && item.issues.some((issue) => issue !== 'amount_mismatch')
    ));
    const invalidTargetIssue = !targetPaymentEvidence || targetPaymentEvidence.issues.some((issue) => issue !== 'amount_mismatch');
    if (reconciliation.evidence.orderIssues.length > 0
      || unrelatedEvidenceIssue
      || invalidTargetIssue
      || !trustedRows.has(original)
      || priorAdjustments.some((row) => !trustedRows.has(row))) {
      throw new Error(`订单 ${input.order.orderNo} 存在无效实收冲正流水`);
    }
    const adjustedAmount = roundMoney(priorAdjustments.reduce((sum, row) => sum + Number(row.amount), 0));
    const currentNetAmount = roundMoney(Number(original.amount) - adjustedAmount);
    const targetAmount = roundMoney(Number(payment.amount));
    const adjustmentAmount = roundMoney(currentNetAmount - targetAmount);
    if (adjustmentAmount < 0) throw new Error(`订单 ${input.order.orderNo} 当前实收高于不可变流水净额，不能用冲正支出修复`);
    if (adjustmentAmount === 0) return null;
    const occurredAt = input.occurredAt || new Date().toISOString();
    const occurredAtTime = new Date(occurredAt).getTime();
    const latestChainTime = Math.max(
      new Date(original.occurredAt).getTime(),
      ...priorAdjustments.map((row) => new Date(row.occurredAt).getTime()),
    );
    if (!Number.isFinite(occurredAtTime) || !Number.isFinite(latestChainTime) || occurredAtTime < latestChainTime) {
      throw new Error(`订单 ${input.order.orderNo} 的冲正时间不能早于现有实收链`);
    }
    const created = await createOnce(tx, {
      type: '订单实收冲正', direction: 'expense', sourceType: 'order_payment_adjustment',
      sourceDomain: STORAGE_KEYS.ORDERS, sourceId: input.order.id,
      sourceEventId: `${input.order.id}:${input.paymentId}:${targetAmount}`,
      sourceModule: '订单', amount: adjustmentAmount, status: '已确认', relatedBusiness: input.order.orderNo,
      orderId: input.order.id, orderNo: input.order.orderNo, customerId: input.order.customerId, customerName: input.order.customerName,
      productName: input.order.productName, productLevel: input.order.productLevel,
      paymentMethod: payment.paymentMethod || input.order.paymentMethod, paymentReference: payment.paymentOrderNo,
      operatorId: input.actor.id, operatorName: input.actor.name, occurredAt,
      reason: input.reason, attachmentIds: [], reversalOfId: original.id,
    }, input.createdAt || occurredAt);
    if (input.deferFinalReconciliation) return created;
    const updatedRecords = await tx.businessRecord.findMany({ where: { domain: STORAGE_KEYS.FINANCE_TRANSACTIONS } });
    const updatedRecordIds = new Map<FinanceTransaction, string>();
    const updatedTransactions = updatedRecords.flatMap((record) => {
      const transaction = normalizeForEvidence(record.data);
      if (!transaction) return [];
      updatedRecordIds.set(transaction, record.recordId);
      return [transaction];
    });
    const updatedReconciliation = reconcileOrderPayments(input.order, createOrderPaymentReconciliationContext(
      updatedTransactions,
      [input.order],
      updatedRecordIds,
    ));
    if (updatedReconciliation.amountIssue || updatedReconciliation.businessTimeIssue) {
      throw new Error(`订单 ${input.order.orderNo} 的实收冲正未能形成完整可信资金链`);
    }
    return created;
  };

  const list = async (
    filters: FinanceTransactionFilters = {},
    options: { includeOrderDetails?: boolean } = {},
  ) => {
    const records = await prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.FINANCE_TRANSACTIONS }, orderBy: [{ eventAt: 'desc' }, { createdAt: 'desc' }] });
    const keyword = String(filters.search || '').trim().toLowerCase();
    const startAt = shanghaiDayStart(filters.startDate);
    const endExclusiveAt = filters.endDate === undefined
      ? null
      : (() => {
          const endAt = shanghaiDayStart(filters.endDate);
          return endAt === null ? null : endAt + 24 * 60 * 60 * 1000;
        })();
    const orderIds = new Set((filters.orderIds || []).map((value) => String(value).trim()).filter(Boolean));
    const evidenceRecordIdByTransaction = new Map<FinanceTransaction, string>();
    const evidenceTransactions = records.flatMap((record) => {
      const transaction = normalizeForEvidence(record.data);
      if (!transaction) return [];
      evidenceRecordIdByTransaction.set(transaction, record.recordId);
      return [transaction];
    });
    const requestedOrderRecords = orderIds.size
      ? await prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.ORDERS, recordId: { in: [...orderIds] } } })
      : [];
    const requestedOrderById = new Map<string, Order>();
    const requestedOrderIdentityIssues = new Set<string>();
    requestedOrderRecords.filter((record) => orderIds.has(record.recordId)).forEach((record) => {
      const rawOrder = asObject(record.data) as unknown as Order;
      if (String(rawOrder.id || '').trim() !== record.recordId) requestedOrderIdentityIssues.add(record.recordId);
      requestedOrderById.set(record.recordId, { ...rawOrder, id: record.recordId });
    });
    const attributionOrders: Array<Pick<Order, 'id' | 'payments'>> = [...orderIds].map((orderId) => (
      requestedOrderById.get(orderId) || { id: orderId, payments: [] }
    ));
    const transactionOrderAttribution = attributeFinanceTransactionsToOrders(
      evidenceTransactions,
      attributionOrders,
    );
    const attributedRequestedOrderIds = (transaction: FinanceTransaction) => [
      ...(transactionOrderAttribution.get(transaction) || new Set<string>()),
    ].filter((orderId) => orderIds.has(orderId));
    const allTransactions = evidenceTransactions
      .map((item, index) => {
        const transportId = evidenceRecordIdByTransaction.get(item) || `malformed-finance-row-${index + 1}`;
        const canonicalIdentity = Boolean(
          normalize(item)
          && typeof item.id === 'string'
          && item.id === transportId
          && typeof item.sourceEventId === 'string'
          && transportId === sourceRecordId(item.sourceType, item.sourceEventId)
        );
        const displayItem = toDisplayTransaction(
          item,
          transportId,
          !canonicalIdentity,
        );
        transactionOrderAttribution.set(displayItem, new Set(transactionOrderAttribution.get(item) || []));
        return displayItem;
      });
    const filtered = allTransactions.filter((item) => (
      (!keyword || [item.transactionNo, item.type, item.orderNo, item.customerName, item.paymentReference, item.operatorName].some((value) => String(value || '').toLowerCase().includes(keyword)))
      && (!orderIds.size || attributedRequestedOrderIds(item).length > 0)
      && (!filters.type || item.type === filters.type)
      && (!filters.direction || item.direction === filters.direction)
      && (!filters.status || item.status === filters.status)
      && (startAt === null || new Date(item.occurredAt).getTime() >= startAt)
      && (endExclusiveAt === null || new Date(item.occurredAt).getTime() < endExclusiveAt)
    ));
    const page = Math.max(1, Number(filters.page) || 1);
    const pageSize = Math.max(1, Math.min(100_000, Number(filters.pageSize) || 10));
    const incomeAmount = roundMoney(filtered.filter((item) => item.direction === 'income').reduce((sum, item) => sum + finiteMoney(item.amount), 0));
    const expenseAmount = roundMoney(filtered.filter((item) => item.direction === 'expense').reduce((sum, item) => sum + finiteMoney(item.amount), 0));
    const pageItems = await hydrateSourceStatuses(filtered.slice((page - 1) * pageSize, page * pageSize));
    const orderTransactions = evidenceTransactions.filter((item) => attributedRequestedOrderIds(item).length > 0);
    const matchedOrderIds = [...new Set(orderTransactions.flatMap(attributedRequestedOrderIds))];
    const missingOrderIds = [...orderIds].filter((orderId) => !matchedOrderIds.includes(orderId));
    const reconciliationContext = createOrderPaymentReconciliationContext(
      evidenceTransactions,
      attributionOrders,
      evidenceRecordIdByTransaction,
    );
    const evidenceIssueOrders = [...orderIds].flatMap((orderId) => {
      const order = requestedOrderById.get(orderId);
      if (!order) {
        const ledgerRows = orderTransactions.filter((transaction) => (
          attributedRequestedOrderIds(transaction).includes(orderId)
        ));
        const ledgerNetAmount = roundMoney(ledgerRows.reduce((sum, transaction) => (
          sum + (transaction.direction === 'income' ? 1 : -1) * finiteMoney(transaction.amount)
        ), 0));
        return [{
          orderId,
          orderNo: orderId,
          customerName: '-',
          paymentCount: 0,
          expectedPaymentAmount: 0,
          ledgerNetAmount,
          differenceAmount: Math.abs(ledgerNetAmount),
          issueCount: 1,
          orderIssues: ['订单资料不存在，无法核对付款证据'],
          paymentEvidence: [],
        }];
      }
      const reconciliation = reconcileOrderPayments(order, reconciliationContext);
      if (requestedOrderIdentityIssues.has(orderId)) {
        reconciliation.evidence.orderIssues.unshift('订单资料稳定ID与存储记录不一致');
        reconciliation.evidence.issueCount += 1;
      }
      return reconciliation.amountIssue
        || reconciliation.businessTimeIssue
        || requestedOrderIdentityIssues.has(orderId)
        ? [reconciliation.evidence]
        : [];
    });
    const data: FinanceTransactionPage = {
      items: pageItems,
      pagination: { page, pageSize, total: filtered.length, totalPages: Math.ceil(filtered.length / pageSize) },
      summary: { incomeAmount, expenseAmount, netAmount: roundMoney(incomeAmount - expenseAmount), transactionCount: filtered.length },
      ...(orderIds.size ? {
        filterCoverage: {
          requestedOrderCount: orderIds.size,
          matchedOrderIds,
          missingOrderCount: missingOrderIds.length,
          orderDetailsRestricted: Boolean(evidenceIssueOrders.length && !options.includeOrderDetails),
          missingOrders: (options.includeOrderDetails ? missingOrderIds : []).map((orderId) => {
            const order = requestedOrderById.get(orderId);
            const payments = orderPaymentRecords(order);
            return {
              orderId,
              orderNo: String(order?.orderNo || orderId),
              customerName: String(order?.customerName || '-'),
              paymentCount: payments.length,
              paymentAmount: roundMoney(payments.reduce((sum, payment) => sum + finiteMoney(payment.amount), 0)),
            };
          }),
          evidenceIssueOrderCount: evidenceIssueOrders.length,
          evidenceIssuePaymentCount: options.includeOrderDetails
            ? evidenceIssueOrders.reduce((sum, order) => (
              sum + order.paymentEvidence.filter((payment) => payment.issues.length > 0).length
            ), 0)
            : 0,
          evidenceDetailsRestricted: Boolean(evidenceIssueOrders.length && !options.includeOrderDetails),
          evidenceIssueOrders: options.includeOrderDetails ? evidenceIssueOrders : [],
        },
      } : {}),
    };
    return success(data);
  };

  const getById = async (id: string) => {
    const row = await prisma.businessRecord.findUnique({ where: { domain_recordId: { domain: STORAGE_KEYS.FINANCE_TRANSACTIONS, recordId: id } } });
    const transaction = normalizeForEvidence(row?.data);
    if (!transaction) return failure<FinanceTransaction>('资金流水不存在', 404);
    const transportId = row?.recordId || id;
    const canonicalIdentity = Boolean(
      normalize(transaction)
      && typeof transaction.id === 'string'
      && transaction.id === transportId
      && typeof transaction.sourceEventId === 'string'
      && transportId === sourceRecordId(transaction.sourceType, transaction.sourceEventId)
    );
    const displayTransaction = toDisplayTransaction(transaction, transportId, !canonicalIdentity);
    return success((await hydrateSourceStatuses([displayTransaction]))[0]);
  };

  const backfill = async (apply: boolean, actor: AuthenticatedUser) => {
    const [orderRecords, payoutRecords, financeRecords] = await Promise.all([
      prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.ORDERS } }),
      prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES } }),
      prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.FINANCE_TRANSACTIONS } }),
    ]);
    const seenSources = new Set<string>();
    type ExpectedFinanceSource = {
      direction: FinanceTransaction['direction'];
      amount: number;
      sourceType: FinanceTransaction['sourceType'];
      sourceDomain: string;
      sourceId: string;
      sourceEventId: string;
      orderId?: string;
      occurredAt: string;
      status: string;
    };
    const expectedSources = new Map<string, ExpectedFinanceSource>();
    const errors: string[] = [];
    const orders: Order[] = [];
    const payouts: CommissionPayoutRecord[] = [];
    let incomeAmount = 0;
    let expenseAmount = 0;
    let plannedCount = 0;
    let existingCount = 0;
    let existingIncomeAmount = 0;
    let existingExpenseAmount = 0;
    for (const record of orderRecords) {
      const rawOrder = asObject(record.data) as unknown as Order;
      if (typeof rawOrder.id !== 'string' || rawOrder.id.trim() !== record.recordId) {
        errors.push(`订单 ${rawOrder.orderNo || record.recordId} 稳定ID与存储记录不一致`);
        continue;
      }
      const order = { ...rawOrder, id: record.recordId };
      if (invalidOrderPaymentStructure(order)) {
        errors.push(`订单 ${order.orderNo || order.id} 存在无效付款记录`);
      }
      const requiresCompletePaymentEvidence = !order.deletedAt
        && !['待确认', '已取消'].includes(String(order.status || ''))
        && Number(order.actualAmount) > 0;
      if (requiresCompletePaymentEvidence && orderPaymentRecords(order).length === 0) {
        errors.push(`订单 ${order.orderNo || order.id} 没有有效付款记录`);
      }
      for (const payment of orderPaymentRecords(order)) {
        if (typeof payment.id !== 'string'
          || !payment.id.trim()
          || payment.id !== payment.id.trim()
          || typeof payment.paidAt !== 'string'
          || payment.paidAt !== payment.paidAt.trim()
          || !Number.isFinite(new Date(payment.paidAt).getTime())
          || !Number.isFinite(Number(payment.amount))
          || !(roundMoney(Number(payment.amount)) > 0)) {
          errors.push(`订单 ${order.orderNo || order.id} 存在无效付款记录`);
          continue;
        }
        const paymentId = payment.id.trim();
        const sourceEventId = `${order.id}:${paymentId}`;
        const sourceKey = `order_payment:${sourceEventId}`;
        if (seenSources.has(sourceKey)) {
          errors.push(`订单 ${order.orderNo || order.id} 存在重复付款来源 ${paymentId}`);
          continue;
        }
        seenSources.add(sourceKey);
        expectedSources.set(sourceKey, {
          direction: 'income',
          amount: roundMoney(Number(payment.amount)),
          sourceType: 'order_payment',
          sourceDomain: STORAGE_KEYS.ORDERS,
          sourceId: order.id,
          sourceEventId,
          orderId: order.id,
          occurredAt: payment.paidAt,
          status: '已确认',
        });
        plannedCount += 1;
        incomeAmount = roundMoney(incomeAmount + Number(payment.amount));
      }
      if (orderPaymentRecords(order).length > 0 || requiresCompletePaymentEvidence) orders.push(order);
    }
    for (const record of payoutRecords) {
      const payout = asObject(record.data) as unknown as CommissionPayoutRecord;
      if (typeof payout.id !== 'string'
        || payout.id.trim() !== record.recordId
        || typeof payout.issuedAt !== 'string'
        || !Number.isFinite(new Date(payout.issuedAt).getTime())
        || !Number.isFinite(Number(payout.totalAmount))
        || !(Number(payout.totalAmount) > 0)
        || !Array.isArray(payout.byOwner)
        || !payout.byOwner.length
        || !Array.isArray(payout.commissionIds)
        || payout.commissionIds.length !== payout.totalCount) {
        errors.push(`提成发放单 ${payout.payoutNo || payout.id || record.recordId} 明细不完整`);
        continue;
      }
      const sourceKey = `commission_payout:${payout.id}`;
      if (seenSources.has(sourceKey)) {
        errors.push(`提成发放单 ${payout.payoutNo || payout.id} 来源ID重复`);
        continue;
      }
      seenSources.add(sourceKey);
      expectedSources.set(sourceKey, {
        direction: 'expense',
        amount: roundMoney(Number(payout.totalAmount)),
        sourceType: 'commission_payout',
        sourceDomain: STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES,
        sourceId: payout.id,
        sourceEventId: payout.id,
        occurredAt: payout.issuedAt,
        status: '已确认',
      });
      plannedCount += 1;
      expenseAmount = roundMoney(expenseAmount + Number(payout.totalAmount));
      payouts.push(payout);
    }
    const seenFinanceSources = new Set<string>();
    const financeBySource = new Map<string, FinanceTransaction>();
    const adjustmentsByOriginalId = new Map<string, FinanceTransaction[]>();
    const evidenceTransactions: FinanceTransaction[] = [];
    const evidenceRecordIdByTransaction = new Map<FinanceTransaction, string>();
    for (const record of financeRecords) {
      const row = normalizeForEvidence(record.data);
      if (!row) {
        errors.push(`资金流水 ${record.recordId} 数据不完整`);
        continue;
      }
      evidenceTransactions.push(row);
      evidenceRecordIdByTransaction.set(row, record.recordId);
      if (typeof row.id !== 'string'
        || row.id !== record.recordId
        || typeof row.sourceType !== 'string'
        || typeof row.sourceEventId !== 'string'
        || record.recordId !== sourceRecordId(row.sourceType, row.sourceEventId)) {
        errors.push(`资金流水 ${record.recordId} 稳定ID或来源事件不一致`);
        continue;
      }
      const sourceKey = `${row.sourceType}:${row.sourceEventId}`;
      if (seenFinanceSources.has(sourceKey)) {
        errors.push(`资金流水来源重复 ${sourceKey}`);
        continue;
      }
      seenFinanceSources.add(sourceKey);
      if (row.sourceType === 'order_payment_adjustment') {
        if (!row.reversalOfId) {
          errors.push(`资金流水 ${row.transactionNo || row.id} 缺少原流水关联`);
          continue;
        }
        const linked = adjustmentsByOriginalId.get(row.reversalOfId) || [];
        linked.push(row);
        adjustmentsByOriginalId.set(row.reversalOfId, linked);
        continue;
      }
      if (!expectedSources.has(sourceKey)) {
        errors.push(`资金流水 ${row.transactionNo || row.id} 找不到对应真实来源`);
        continue;
      }
      financeBySource.set(sourceKey, row);
    }
    const usedAdjustmentIds = new Set<string>();
    for (const [sourceKey, expected] of expectedSources) {
      const row = financeBySource.get(sourceKey);
      if (!row) continue;
      if (sourceKey.startsWith('commission_payout:')) {
        const rowTime = new Date(String(row.occurredAt || '')).getTime();
        const expectedTime = new Date(expected.occurredAt).getTime();
        if (expected.direction !== row.direction
          || expected.amount !== roundMoney(Number(row.amount))
          || !Number.isFinite(Number(row.amount))
          || row.sourceType !== expected.sourceType
          || row.sourceDomain !== expected.sourceDomain
          || row.sourceId !== expected.sourceId
          || row.sourceEventId !== expected.sourceEventId
          || row.orderId !== expected.orderId
          || row.status !== expected.status
          || !Number.isFinite(rowTime)
          || rowTime !== expectedTime) {
          errors.push(`资金流水 ${row.transactionNo || row.id} 与来源金额或方向不一致`);
          continue;
        }
        existingCount += 1;
        existingExpenseAmount = roundMoney(existingExpenseAmount + Number(row.amount));
        continue;
      }
      const originalTime = new Date(String(row.occurredAt || '')).getTime();
      const expectedTime = new Date(expected.occurredAt).getTime();
      const originalCanonical = Boolean(
        expected.direction === row.direction
        && Number.isFinite(Number(row.amount))
        && Number(row.amount) > 0
        && row.sourceType === expected.sourceType
        && row.sourceDomain === expected.sourceDomain
        && row.sourceId === expected.sourceId
        && row.sourceEventId === expected.sourceEventId
        && row.orderId === expected.orderId
        && row.status === expected.status
        && Number.isFinite(originalTime)
        && originalTime === expectedTime
      );
      const adjustments = adjustmentsByOriginalId.get(row.id) || [];
      adjustments.sort((left, right) => {
        const timeDifference = new Date(String(left.occurredAt || '')).getTime()
          - new Date(String(right.occurredAt || '')).getTime();
        if (Number.isFinite(timeDifference) && timeDifference) return timeDifference;
        const eventPrefix = `${expected.sourceEventId}:`;
        const leftTarget = String(left.sourceEventId || '').startsWith(eventPrefix)
          ? Number(String(left.sourceEventId).slice(eventPrefix.length))
          : Number.NEGATIVE_INFINITY;
        const rightTarget = String(right.sourceEventId || '').startsWith(eventPrefix)
          ? Number(String(right.sourceEventId).slice(eventPrefix.length))
          : Number.NEGATIVE_INFINITY;
        if (Number.isFinite(leftTarget) && Number.isFinite(rightTarget) && leftTarget !== rightTarget) {
          return rightTarget - leftTarget;
        }
        return String(left.id || '').localeCompare(String(right.id || ''));
      });
      let adjustmentAmount = 0;
      let adjustmentInvalid = false;
      for (const adjustment of adjustments) {
        usedAdjustmentIds.add(adjustment.id);
        const adjustmentValue = roundMoney(Number(adjustment.amount));
        const adjustmentTime = new Date(String(adjustment.occurredAt || '')).getTime();
        const targetAmount = roundMoney(Number(row.amount) - adjustmentAmount - adjustmentValue);
        const canonicalEventId = `${expected.sourceEventId}:${String(targetAmount)}`;
        if (adjustment.direction !== 'expense'
          || adjustment.sourceType !== 'order_payment_adjustment'
          || adjustment.sourceDomain !== STORAGE_KEYS.ORDERS
          || adjustment.sourceId !== expected.sourceId
          || adjustment.orderId !== expected.orderId
          || adjustment.status !== '已确认'
          || adjustment.sourceEventId !== canonicalEventId
          || !Number.isFinite(adjustmentTime)
          || adjustmentTime < originalTime
          || !Number.isFinite(Number(adjustment.amount))
          || !(adjustmentValue > 0)
          || adjustmentAmount + adjustmentValue - Number(row.amount) >= 0.01) {
          errors.push(`资金流水 ${adjustment.transactionNo || adjustment.id} 不是有效的订单实收冲正`);
          adjustmentInvalid = true;
          continue;
        }
        adjustmentAmount = roundMoney(adjustmentAmount + adjustmentValue);
      }
      const originalAmount = roundMoney(Number(row.amount));
      const netAmount = roundMoney(originalAmount - adjustmentAmount);
      if (!originalCanonical || adjustmentInvalid || adjustmentAmount > originalAmount || netAmount !== expected.amount) {
        errors.push(`资金流水 ${row.transactionNo || row.id} 与来源金额或方向不一致`);
        continue;
      }
      existingCount += 1;
      existingIncomeAmount = roundMoney(existingIncomeAmount + originalAmount);
      existingExpenseAmount = roundMoney(existingExpenseAmount + adjustmentAmount);
    }
    for (const adjustments of adjustmentsByOriginalId.values()) {
      for (const adjustment of adjustments) {
        if (!usedAdjustmentIds.has(adjustment.id)) errors.push(`资金流水 ${adjustment.transactionNo || adjustment.id} 找不到对应原实收流水`);
      }
    }
    const reconciliationContext = createOrderPaymentReconciliationContext(
      evidenceTransactions,
      orders,
      evidenceRecordIdByTransaction,
    );
    for (const order of orders) {
      const reconciliation = reconcileOrderPayments(order, reconciliationContext);
      const hasUnrecoverablePaymentIssue = reconciliation.evidence.paymentEvidence.some((payment) => {
        if (!payment.issues.length) return false;
        return !(
          payment.ledgerAmount === 0
          && payment.issues.includes('missing_original')
          && payment.issues.every((issue) => ['missing_original', 'amount_mismatch'].includes(issue))
        );
      });
      if (reconciliation.evidence.orderIssues.length > 0
        || hasUnrecoverablePaymentIssue
        || reconciliation.businessTimeIssue) {
        const message = `订单 ${order.orderNo || order.id} 的资金流水证据不完整或不规范`;
        if (!errors.includes(message)) errors.push(message);
      }
    }
    if (apply && errors.length) return failure<FinanceBackfillReport>(`存在异常数据，拒绝执行资金流水回填：${errors.join('；')}`, 409);
    if (apply) {
      await prisma.$transaction(async (tx) => {
        for (const order of orders) {
          const missingPayments = orderPaymentRecords(order).filter((payment) => (
            typeof payment.id === 'string'
            && !financeBySource.has(`order_payment:${order.id}:${payment.id.trim()}`)
          ));
          if (missingPayments.length) {
            await recordOrderPayments(tx, { ...order, payments: missingPayments }, actor);
          }
        }
        for (const payout of payouts) {
          if (!financeBySource.has(`commission_payout:${payout.id}`)) await recordCommissionPayout(tx, payout);
        }
      });
    }
    return success<FinanceBackfillReport>({
      apply,
      plannedCount,
      existingCount,
      createdCount: apply ? plannedCount - existingCount : 0,
      incomeAmount,
      expenseAmount,
      netAmount: roundMoney(incomeAmount - expenseAmount),
      existingIncomeAmount,
      existingExpenseAmount,
      missingCount: plannedCount - existingCount,
      errors,
    });
  };

  const exportCsv = async (filters: FinanceTransactionFilters = {}) => {
    const result = await list({ ...filters, page: 1, pageSize: 100_000 });
    const rows = result.data?.items || [];
    const escape = (value: unknown) => {
      const text = String(value ?? '');
      return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const body = rows.map((row) => [
      row.transactionNo,
      row.type,
      row.direction === 'income' ? '收入' : row.direction === 'expense' ? '支出' : '异常',
      row.amount,
      row.customerName,
      row.orderNo,
      row.paymentMethod,
      row.paymentReference,
      row.operatorName,
      row.occurredAt,
      row.status,
      row.sourceStatus || '-',
    ]);
    return success(`\uFEFF${[['流水编号', '流水类型', '方向', '金额', '客户', '订单号', '付款方式', '付款流水号', '经办人', '发生时间', '流水状态', '来源状态'], ...body].map((row) => row.map(escape).join(',')).join('\n')}`);
  };

  return { recordOrderPayments, recordOrderPaymentAdjustment, recordCommissionPayout, list, getById, exportCsv, backfill };
}
