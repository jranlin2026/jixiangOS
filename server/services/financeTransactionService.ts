import { Prisma, type PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
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

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const asObject = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const sourceRecordId = (sourceType: FinanceTransaction['sourceType'], sourceEventId: string) => {
  const readable = `${sourceType}:${sourceEventId}`;
  if (readable.length <= 80) return readable;
  return `${sourceType}:${createHash('sha256').update(sourceEventId).digest('hex')}`;
};
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

async function createOnce(tx: FinanceTransactionClient, input: Omit<FinanceTransaction, 'id' | 'transactionNo' | 'createdAt'>, createdAt: string) {
  const recordId = sourceRecordId(input.sourceType, input.sourceEventId);
  const existing = await tx.businessRecord.findUnique({
    where: { domain_recordId: { domain: STORAGE_KEYS.FINANCE_TRANSACTIONS, recordId } },
  });
  if (existing) return normalize(existing.data);
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
    const racedRow = normalize(raced?.data);
    if (!racedRow) throw error;
    return racedRow;
  }
  return row;
}

export function createFinanceTransactionService(prisma: FinancePrisma) {
  const hydrateSourceStatuses = async (items: FinanceTransaction[]) => {
    if (!items.length) return items;
    const orderIds = [...new Set(items.filter((item) => item.sourceType === 'order_payment').map((item) => item.sourceId))];
    const payoutIds = [...new Set(items.filter((item) => item.sourceType === 'commission_payout').map((item) => item.sourceId))];
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
    for (const payment of order.payments || []) {
      if (!payment.id || !payment.paidAt || !(Number(payment.amount) > 0)) throw new Error(`订单 ${order.orderNo} 存在无效付款记录`);
      const row = await createOnce(tx, {
        type: '订单实收', direction: 'income', sourceType: 'order_payment',
        sourceDomain: STORAGE_KEYS.ORDERS, sourceId: order.id, sourceEventId: `${order.id}:${payment.id}`, sourceModule: '订单',
        amount: roundMoney(Number(payment.amount)), status: '已确认', relatedBusiness: order.orderNo,
        orderId: order.id, orderNo: order.orderNo, customerId: order.customerId, customerName: order.customerName,
        productName: order.productName, productLevel: order.productLevel,
        paymentMethod: payment.paymentMethod || order.paymentMethod, paymentReference: payment.paymentOrderNo,
        operatorId: actor.id, operatorName: actor.name, occurredAt: payment.paidAt,
        reason: payment.remark || '正式订单实际收款', attachmentIds: (payment.attachments || []).map((item) => item.id),
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

  const list = async (filters: FinanceTransactionFilters = {}) => {
    const records = await prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.FINANCE_TRANSACTIONS }, orderBy: [{ eventAt: 'desc' }, { createdAt: 'desc' }] });
    const keyword = String(filters.search || '').trim().toLowerCase();
    const filtered = records.map((item) => normalize(item.data)).filter((item): item is FinanceTransaction => Boolean(item)).filter((item) => (
      (!keyword || [item.transactionNo, item.type, item.orderNo, item.customerName, item.paymentReference, item.operatorName].some((value) => String(value || '').toLowerCase().includes(keyword)))
      && (!filters.type || item.type === filters.type)
      && (!filters.direction || item.direction === filters.direction)
      && (!filters.status || item.status === filters.status)
      && (!filters.startDate || item.occurredAt >= filters.startDate)
      && (!filters.endDate || item.occurredAt <= `${filters.endDate}T23:59:59.999`)
    ));
    const page = Math.max(1, Number(filters.page) || 1);
    const pageSize = Math.max(1, Math.min(100_000, Number(filters.pageSize) || 10));
    const incomeAmount = roundMoney(filtered.filter((item) => item.direction === 'income').reduce((sum, item) => sum + item.amount, 0));
    const expenseAmount = roundMoney(filtered.filter((item) => item.direction === 'expense').reduce((sum, item) => sum + item.amount, 0));
    const pageItems = await hydrateSourceStatuses(filtered.slice((page - 1) * pageSize, page * pageSize));
    const data: FinanceTransactionPage = {
      items: pageItems,
      pagination: { page, pageSize, total: filtered.length, totalPages: Math.ceil(filtered.length / pageSize) },
      summary: { incomeAmount, expenseAmount, netAmount: roundMoney(incomeAmount - expenseAmount), transactionCount: filtered.length },
    };
    return success(data);
  };

  const getById = async (id: string) => {
    const row = await prisma.businessRecord.findUnique({ where: { domain_recordId: { domain: STORAGE_KEYS.FINANCE_TRANSACTIONS, recordId: id } } });
    const transaction = normalize(row?.data);
    if (!transaction) return failure<FinanceTransaction>('资金流水不存在', 404);
    return success((await hydrateSourceStatuses([transaction]))[0]);
  };

  const backfill = async (apply: boolean, actor: AuthenticatedUser) => {
    const [orderRecords, payoutRecords, financeRecords] = await Promise.all([
      prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.ORDERS } }),
      prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES } }),
      prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.FINANCE_TRANSACTIONS } }),
    ]);
    const seenSources = new Set<string>();
    const expectedSources = new Map<string, { direction: FinanceTransaction['direction']; amount: number }>();
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
      const order = asObject(record.data) as unknown as Order;
      for (const payment of order.payments || []) {
        if (!payment.id || !payment.paidAt || !(Number(payment.amount) > 0)) {
          errors.push(`订单 ${order.orderNo || order.id} 存在无效付款记录`);
          continue;
        }
        const sourceKey = `order_payment:${order.id}:${payment.id}`;
        if (seenSources.has(sourceKey)) {
          errors.push(`订单 ${order.orderNo || order.id} 存在重复付款来源 ${payment.id}`);
          continue;
        }
        seenSources.add(sourceKey);
        expectedSources.set(sourceKey, { direction: 'income', amount: roundMoney(Number(payment.amount)) });
        plannedCount += 1;
        incomeAmount = roundMoney(incomeAmount + Number(payment.amount));
      }
      orders.push(order);
    }
    for (const record of payoutRecords) {
      const payout = asObject(record.data) as unknown as CommissionPayoutRecord;
      if (!payout.id || !payout.issuedAt || !(Number(payout.totalAmount) > 0) || !Array.isArray(payout.byOwner) || !payout.byOwner.length || !Array.isArray(payout.commissionIds) || payout.commissionIds.length !== payout.totalCount) {
        errors.push(`提成发放单 ${payout.payoutNo || payout.id || record.recordId} 明细不完整`);
        continue;
      }
      const sourceKey = `commission_payout:${payout.id}`;
      if (seenSources.has(sourceKey)) {
        errors.push(`提成发放单 ${payout.payoutNo || payout.id} 来源ID重复`);
        continue;
      }
      seenSources.add(sourceKey);
      expectedSources.set(sourceKey, { direction: 'expense', amount: roundMoney(Number(payout.totalAmount)) });
      plannedCount += 1;
      expenseAmount = roundMoney(expenseAmount + Number(payout.totalAmount));
      payouts.push(payout);
    }
    const seenFinanceSources = new Set<string>();
    for (const record of financeRecords) {
      const row = normalize(record.data);
      if (!row) {
        errors.push(`资金流水 ${record.recordId} 数据不完整`);
        continue;
      }
      const sourceKey = `${row.sourceType}:${row.sourceEventId}`;
      if (seenFinanceSources.has(sourceKey)) {
        errors.push(`资金流水来源重复 ${sourceKey}`);
        continue;
      }
      seenFinanceSources.add(sourceKey);
      const expected = expectedSources.get(sourceKey);
      if (!expected) {
        errors.push(`资金流水 ${row.transactionNo || row.id} 找不到对应真实来源`);
        continue;
      }
      if (expected.direction !== row.direction || expected.amount !== roundMoney(Number(row.amount))) {
        errors.push(`资金流水 ${row.transactionNo || row.id} 与来源金额或方向不一致`);
        continue;
      }
      existingCount += 1;
      if (row.direction === 'income') existingIncomeAmount = roundMoney(existingIncomeAmount + row.amount);
      else existingExpenseAmount = roundMoney(existingExpenseAmount + row.amount);
    }
    if (apply && errors.length) return failure<FinanceBackfillReport>(`存在异常数据，拒绝执行资金流水回填：${errors.join('；')}`, 409);
    if (apply) {
      await prisma.$transaction(async (tx) => {
        for (const order of orders) await recordOrderPayments(tx, order, actor);
        for (const payout of payouts) await recordCommissionPayout(tx, payout);
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
    const body = rows.map((row) => [row.transactionNo, row.type, row.direction === 'income' ? '收入' : '支出', row.amount, row.customerName, row.orderNo, row.paymentMethod, row.paymentReference, row.operatorName, row.occurredAt, row.sourceStatus || row.status]);
    return success(`\uFEFF${[['流水编号', '流水类型', '方向', '金额', '客户', '订单号', '付款方式', '付款流水号', '经办人', '发生时间', '来源状态'], ...body].map((row) => row.map(escape).join(',')).join('\n')}`);
  };

  return { recordOrderPayments, recordCommissionPayout, list, getById, exportCsv, backfill };
}
