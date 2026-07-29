import { prisma } from '../server/db/client';
import { createFinanceTransactionService } from '../server/services/financeTransactionService';
import { STORAGE_KEYS } from '../src/shared/utils/constants';
import type { AuthenticatedUser } from '../src/types/auth';
import type { FinanceTransaction } from '../src/types/finance';
import type { Order } from '../src/types/order';

const readArg = (name: string) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const apply = process.argv.includes('--apply');
const orderId = String(readArg('order-id') || '').trim();
const paymentId = String(readArg('payment-id') || '').trim();
const reason = String(readArg('reason') || '').trim();
const expectedOriginal = Number(readArg('expected-original'));
const expectedCurrent = Number(readArg('expected-current'));
const confirmation = readArg('confirm');
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

if (!orderId || !paymentId || !reason || !(expectedOriginal > 0) || !(expectedCurrent > 0)) {
  throw new Error('REQUIRED_ARGS: --order-id --payment-id --expected-original --expected-current --reason');
}
if (apply && confirmation !== 'CREATE_ORDER_PAYMENT_ADJUSTMENT') {
  throw new Error('REFUSING_ORDER_PAYMENT_ADJUSTMENT_WITHOUT_CONFIRMATION');
}
if (apply && !/^[a-f0-9]{64}$/i.test(String(process.env.JIXIANG_VERIFIED_BACKUP_SHA256 || ''))) {
  throw new Error('REFUSING_ORDER_PAYMENT_ADJUSTMENT_WITHOUT_VERIFIED_BACKUP_SHA256');
}

const normalize = (value: unknown): FinanceTransaction | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Partial<FinanceTransaction>;
  return row.id && row.sourceEventId ? row as FinanceTransaction : null;
};

try {
  const orderRecord = await prisma.businessRecord.findUnique({
    where: { domain_recordId: { domain: STORAGE_KEYS.ORDERS, recordId: orderId } },
  });
  if (!orderRecord) throw new Error(`ORDER_NOT_FOUND:${orderId}`);
  const order = orderRecord.data as unknown as Order;
  const payment = (order.payments || []).find((item) => item.id === paymentId);
  if (!payment) throw new Error(`PAYMENT_NOT_FOUND:${paymentId}`);
  const currentAmount = roundMoney(Number(payment.amount));
  if (currentAmount !== roundMoney(expectedCurrent)) {
    throw new Error(`CURRENT_AMOUNT_MISMATCH:expected=${expectedCurrent}:actual=${currentAmount}`);
  }

  const financeRecords = await prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.FINANCE_TRANSACTIONS } });
  const rows = financeRecords.map((record) => normalize(record.data)).filter((row): row is FinanceTransaction => row !== null);
  const original = rows.find((row) => row.sourceType === 'order_payment' && row.sourceId === orderId && row.sourceEventId === `${orderId}:${paymentId}`);
  if (!original) throw new Error(`ORIGINAL_FINANCE_TRANSACTION_NOT_FOUND:${orderId}:${paymentId}`);
  const originalAmount = roundMoney(Number(original.amount));
  if (originalAmount !== roundMoney(expectedOriginal)) {
    throw new Error(`ORIGINAL_AMOUNT_MISMATCH:expected=${expectedOriginal}:actual=${originalAmount}`);
  }
  const adjustments = rows.filter((row) => row.sourceType === 'order_payment_adjustment' && row.reversalOfId === original.id);
  const priorAdjustmentAmount = roundMoney(adjustments.reduce((sum, row) => sum + Number(row.amount), 0));
  const plannedAdjustmentAmount = roundMoney(originalAmount - priorAdjustmentAmount - currentAmount);
  if (plannedAdjustmentAmount < 0) throw new Error('CURRENT_AMOUNT_EXCEEDS_IMMUTABLE_NET_AMOUNT');

  let created: FinanceTransaction | null = null;
  if (apply && plannedAdjustmentAmount > 0) {
    const service = createFinanceTransactionService(prisma);
    const actor = {
      id: 'system-finance-adjustment', name: '资金流水修正任务', role: '系统任务', permissions: [],
    } as unknown as AuthenticatedUser;
    created = await prisma.$transaction((tx) => service.recordOrderPaymentAdjustment(tx, {
      order, paymentId, actor, reason,
    }));
  }

  console.log(JSON.stringify({
    apply,
    orderId,
    orderNo: order.orderNo,
    paymentId,
    originalTransactionId: original.id,
    originalAmount,
    priorAdjustmentAmount,
    currentAmount,
    plannedAdjustmentAmount,
    createdTransactionId: created?.id || null,
    resultingNetAmount: roundMoney(originalAmount - priorAdjustmentAmount - (created?.amount || 0)),
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
