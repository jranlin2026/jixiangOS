import type {
  FinanceDailyRecord,
  ChannelROI,
  FinanceStats,
  FinanceFilters,
  FinanceIncome,
  FinanceExpense,
  FinanceTransaction,
  FinanceTransactionDirection,
  FinanceTransactionFilters,
} from '../types/finance';
import type { Commission } from '../types/commission';
import type { Order } from '../types/order';
import type { Product } from '../types/product';
import type { ApiResponse, PaginatedResponse } from './types';
import { createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { DEFAULT_PAGE_SIZE, STORAGE_KEYS } from '../shared/utils/constants';
import { initializeMockData } from './mock';
import { v4 as uuidv4 } from 'uuid';

function ensureInit(): void {
  initializeMockData();
}

interface FinanceStorage {
  dailyRecords: FinanceDailyRecord[];
  channelROI: ChannelROI[];
  incomes: FinanceIncome[];
  expenses: FinanceExpense[];
}

function getFinanceStorage(): FinanceStorage {
  const data = getStorageData<FinanceStorage>(STORAGE_KEYS.FINANCE);
  return {
    dailyRecords: data?.dailyRecords || [],
    channelROI: data?.channelROI || [],
    incomes: data?.incomes || [],
    expenses: data?.expenses || [],
  };
}

function getProductName(productId?: string, productLevel?: string, fallback?: string): string | undefined {
  const products = getStorageData<Product[]>(STORAGE_KEYS.PRODUCTS) || [];
  const matched = (productId ? products.find((product) => product.id === productId) : undefined)
    || (productLevel ? products.find((product) => product.level === productLevel) : undefined);
  return matched?.name || fallback || productLevel;
}

function enrichIncomeProductName(income: FinanceIncome): FinanceIncome {
  const orders = getStorageData<Order[]>(STORAGE_KEYS.ORDERS) || [];
  const order = orders.find((item) => item.id === income.orderId || item.orderNo === income.orderNo);
  return {
    ...income,
    productName: getProductName(order?.productId, order?.productLevel || income.productLevel, income.productName || order?.productName),
  };
}

function compactBusinessNo(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, '').slice(-10) || '0000000000';
}

function makeTransactionNo(date: string, direction: FinanceTransactionDirection, sourceNo: string, index = 1): string {
  const directionMark: Record<FinanceTransactionDirection, string> = {
    income: 'I',
    expense: 'E',
    reversal: 'R',
    freeze: 'F',
  };
  const datePart = (date || new Date().toISOString()).slice(0, 10).replace(/-/g, '');
  return `FT-${datePart}-${directionMark[direction]}${compactBusinessNo(sourceNo)}-${String(index).padStart(2, '0')}`;
}

function isActivePaidOrder(order: Order): boolean {
  return !order.deletedAt
    && order.status !== '已取消';
}

function isRefundExpense(expense: FinanceExpense): boolean {
  return /退款|冲减|冲销/.test(`${expense.category} ${expense.description}`);
}

function buildFinanceTransactions(): FinanceTransaction[] {
  const storage = getFinanceStorage();
  const orders = (getStorageData<Order[]>(STORAGE_KEYS.ORDERS) || []).filter(isActivePaidOrder);
  const activeOrdersById = new Map(orders.map((order) => [order.id, order]));
  const activeOrdersByNo = new Map(orders.map((order) => [order.orderNo, order]));
  const rows: FinanceTransaction[] = [];

  orders.forEach((order) => {
    (order.payments || []).forEach((payment, index) => {
      rows.push({
        id: `txn-order-${order.id}-${payment.id || index}`,
        transactionNo: makeTransactionNo(payment.paidAt || order.createdAt, 'income', order.orderNo, index + 1),
        type: '订单收款',
        direction: 'income',
        sourceType: 'order_payment',
        sourceId: payment.id || order.id,
        sourceModule: '订单',
        amount: payment.amount,
        status: '已确认',
        relatedBusiness: order.orderNo,
        orderId: order.id,
        orderNo: order.orderNo,
        customerId: order.customerId,
        customerName: order.customerName,
        productName: getProductName(order.productId, order.productLevel, order.productName),
        productLevel: order.productLevel,
        paymentMethod: payment.paymentMethod || order.paymentMethod,
        operatorName: order.salesName || order.owner,
        occurredAt: payment.paidAt || order.createdAt,
        reason: payment.remark || '订单付款入账',
      });
    });
  });

  storage.incomes.map(enrichIncomeProductName).forEach((income) => {
    if (activeOrdersById.has(income.orderId) || activeOrdersByNo.has(income.orderNo)) return;
    rows.push({
      id: `txn-income-${income.id}`,
      transactionNo: makeTransactionNo(income.receivedAt, 'income', income.orderNo || income.id),
      type: '其他收入',
      direction: 'income',
      sourceType: 'manual_income',
      sourceId: income.id,
      sourceModule: '财务',
      amount: income.amount,
      status: '已确认',
      relatedBusiness: income.orderNo || income.id,
      orderId: income.orderId,
      orderNo: income.orderNo,
      customerName: income.customerName,
      productName: income.productName || income.productLevel,
      productLevel: income.productLevel,
      paymentMethod: income.paymentMethod,
      operatorName: '系统',
      occurredAt: income.receivedAt,
      reason: '历史收入记录',
    });
  });

  storage.expenses.forEach((expense, index) => {
    const direction: FinanceTransactionDirection = isRefundExpense(expense) ? 'reversal' : 'expense';
    rows.push({
      id: `txn-expense-${expense.id}`,
      transactionNo: makeTransactionNo(expense.paidAt || new Date(0).toISOString(), direction, expense.id, index + 1),
      type: direction === 'reversal' ? '退款冲减' : (expense.category || '业务支出'),
      direction,
      sourceType: direction === 'reversal' ? 'refund_expense' : 'manual_expense',
      sourceId: expense.id,
      sourceModule: direction === 'reversal' ? '退款' : '支出',
      amount: expense.amount,
      status: expense.paidAt ? '已确认' : '待确认',
      relatedBusiness: expense.description,
      customerName: '-',
      productName: '-',
      operatorName: expense.approvedBy || '待确认',
      occurredAt: expense.paidAt || '',
      reason: expense.description,
    });
  });

  (getStorageData<Commission[]>(STORAGE_KEYS.COMMISSIONS) || [])
    .filter((commission) => commission.status === '已发放')
    .forEach((commission, index) => {
      rows.push({
        id: `txn-commission-${commission.id}`,
        transactionNo: makeTransactionNo(commission.paidAt || commission.updatedAt, 'expense', commission.orderNo || commission.id, index + 1),
        type: '提成发放',
        direction: 'expense',
        sourceType: 'commission_payout',
        sourceId: commission.id,
        sourceModule: '提成',
        amount: commission.commissionAmount,
        status: '已确认',
        relatedBusiness: commission.orderNo,
        orderId: commission.orderId,
        orderNo: commission.orderNo,
        customerName: commission.customerName,
        productLevel: commission.productLevel,
        operatorName: commission.owner,
        occurredAt: commission.paidAt || commission.updatedAt,
        reason: `${commission.role}提成发放`,
      });
    });

  return rows.sort((a, b) => new Date(b.occurredAt || 0).getTime() - new Date(a.occurredAt || 0).getTime());
}

function filterFinanceTransactions(rows: FinanceTransaction[], filters?: FinanceTransactionFilters): FinanceTransaction[] {
  const keyword = filters?.search?.trim().toLowerCase();
  return rows.filter((row) => {
    const matchesKeyword = !keyword || [
      row.transactionNo,
      row.type,
      row.relatedBusiness,
      row.orderNo,
      row.customerName,
      row.productName,
      row.productLevel,
      row.operatorName,
      row.status,
      row.sourceModule,
      row.reason,
    ].some((value) => String(value || '').toLowerCase().includes(keyword));
    const matchesType = !filters?.type || row.type === filters.type;
    const matchesDirection = !filters?.direction || row.direction === filters.direction;
    const matchesStatus = !filters?.status || row.status === filters.status;
    const matchesStart = !filters?.startDate || row.occurredAt >= filters.startDate;
    const matchesEnd = !filters?.endDate || row.occurredAt <= filters.endDate;
    return matchesKeyword && matchesType && matchesDirection && matchesStatus && matchesStart && matchesEnd;
  });
}

function escapeCsvValue(value: unknown): string {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function fetchFinanceDailyRecords(filters?: FinanceFilters): Promise<ApiResponse<FinanceDailyRecord[]>> {
  ensureInit();
  await delay(200);
  const storage = getFinanceStorage();
  let records = storage.dailyRecords;

  if (filters?.startDate) {
    records = records.filter((r) => r.date >= filters.startDate!);
  }
  if (filters?.endDate) {
    records = records.filter((r) => r.date <= filters.endDate!);
  }

  return createSuccessResponse(records);
}

async function fetchChannelROI(): Promise<ApiResponse<ChannelROI[]>> {
  ensureInit();
  await delay(200);
  const storage = getFinanceStorage();
  return createSuccessResponse(storage.channelROI);
}

async function fetchFinanceStats(filters?: FinanceFilters): Promise<ApiResponse<FinanceStats>> {
  ensureInit();
  await delay(200);
  const storage = getFinanceStorage();
  let records = storage.dailyRecords;

  if (filters?.startDate) {
    records = records.filter((r) => r.date >= filters.startDate!);
  }
  if (filters?.endDate) {
    records = records.filter((r) => r.date <= filters.endDate!);
  }

  const totalRevenue = records.reduce((s, r) => s + r.revenue, 0);
  const totalCost = records.reduce((s, r) => s + r.cost, 0);
  const totalRefund = records.reduce((s, r) => s + r.refundAmount, 0);
  const totalOrders = records.reduce((s, r) => s + r.orderCount, 0);

  const stats: FinanceStats = {
    totalRevenue,
    totalCost,
    totalProfit: totalRevenue - totalCost - totalRefund,
    totalOrders,
    totalRefund,
    avgOrderValue: totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0,
  };

  return createSuccessResponse(stats);
}

async function fetchRevenueTrend(granularity: 'day' | 'week' | 'month' = 'day'): Promise<ApiResponse<FinanceDailyRecord[]>> {
  return fetchFinanceDailyRecords({ granularity });
}

/** 获取收入明细列表 */
async function fetchIncomes(filters?: FinanceFilters): Promise<ApiResponse<FinanceIncome[]>> {
  ensureInit();
  await delay(200);
  const storage = getFinanceStorage();
  let incomes = storage.incomes.map(enrichIncomeProductName);

  if (filters?.startDate) {
    incomes = incomes.filter((i) => i.receivedAt >= filters.startDate!);
  }
  if (filters?.endDate) {
    incomes = incomes.filter((i) => i.receivedAt <= filters.endDate!);
  }

  return createSuccessResponse(incomes);
}

/** 获取支出明细列表 */
async function fetchExpenses(filters?: FinanceFilters): Promise<ApiResponse<FinanceExpense[]>> {
  ensureInit();
  await delay(200);
  const storage = getFinanceStorage();
  let expenses = [...storage.expenses];

  if (filters?.startDate) {
    expenses = expenses.filter((e) => e.paidAt && e.paidAt >= filters.startDate!);
  }
  if (filters?.endDate) {
    expenses = expenses.filter((e) => e.paidAt && e.paidAt <= filters.endDate!);
  }

  return createSuccessResponse(expenses);
}

async function fetchFinanceTransactions(filters?: FinanceTransactionFilters): Promise<ApiResponse<PaginatedResponse<FinanceTransaction>>> {
  ensureInit();
  await delay(150);
  const filtered = filterFinanceTransactions(buildFinanceTransactions(), filters);
  const page = filters?.page || 1;
  const pageSize = filters?.pageSize || DEFAULT_PAGE_SIZE;
  const total = filtered.length;
  const totalPages = Math.ceil(total / pageSize);
  const items = filtered.slice((page - 1) * pageSize, page * pageSize);

  return createSuccessResponse({
    items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
    },
  });
}

async function fetchFinanceTransactionById(id: string): Promise<ApiResponse<FinanceTransaction | null>> {
  ensureInit();
  await delay(100);
  return createSuccessResponse(buildFinanceTransactions().find((row) => row.id === id) || null);
}

async function exportFinanceTransactionsCsv(filters?: FinanceTransactionFilters): Promise<ApiResponse<string>> {
  ensureInit();
  await delay(100);
  const rows = filterFinanceTransactions(buildFinanceTransactions(), filters);
  const headers = ['流水编号', '流水类型', '方向', '金额', '关联业务', '客户/对象', '产品名称', '经办人', '状态', '发生时间', '来源模块', '原因'];
  const directionLabels: Record<FinanceTransactionDirection, string> = {
    income: '收入',
    expense: '支出',
    reversal: '冲减',
    freeze: '冻结',
  };
  const body = rows.map((row) => [
    row.transactionNo,
    row.type,
    directionLabels[row.direction],
    row.amount,
    row.relatedBusiness,
    row.customerName || '',
    row.productName || '',
    row.operatorName || '',
    row.status,
    row.occurredAt,
    row.sourceModule,
    row.reason || '',
  ]);
  const csv = [headers, ...body].map((row) => row.map(escapeCsvValue).join(',')).join('\n');
  return createSuccessResponse(`\uFEFF${csv}`);
}

/** 新增收入记录 */
async function createIncome(data: Omit<FinanceIncome, 'id'>): Promise<ApiResponse<FinanceIncome>> {
  ensureInit();
  await delay(200);
  const storage = getFinanceStorage();
  const income: FinanceIncome = enrichIncomeProductName({ ...data, id: `fi-${uuidv4().slice(0, 8)}` });
  storage.incomes.unshift(income);
  setStorageData(STORAGE_KEYS.FINANCE, storage);
  return createSuccessResponse(income);
}

/** 新增支出记录 */
async function createExpense(data: Omit<FinanceExpense, 'id'>): Promise<ApiResponse<FinanceExpense>> {
  ensureInit();
  await delay(200);
  const storage = getFinanceStorage();
  const expense: FinanceExpense = { ...data, id: `fe-${uuidv4().slice(0, 8)}` };
  storage.expenses.unshift(expense);
  setStorageData(STORAGE_KEYS.FINANCE, storage);
  return createSuccessResponse(expense);
}

export const financeApi = {
  fetchFinanceDailyRecords,
  fetchChannelROI,
  fetchFinanceStats,
  fetchRevenueTrend,
  fetchIncomes,
  fetchExpenses,
  fetchFinanceTransactions,
  fetchFinanceTransactionById,
  exportFinanceTransactionsCsv,
  createIncome,
  createExpense,
};
