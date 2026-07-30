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
  FinanceTransactionPage,
} from '../types/finance';
import type { Commission } from '../types/commission';
import type { Order } from '../types/order';
import type { Product } from '../types/product';
import type { ApiResponse, PaginatedResponse } from './types';
import { createSuccessResponse, delay as baseDelay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { DEFAULT_PAGE_SIZE, STORAGE_KEYS } from '../shared/utils/constants';
import { initializeMockData } from './mock';
import { v4 as uuidv4 } from 'uuid';
import { backendRequest, shouldUseBackendApi } from './backendClient';

const delay = (ms?: number) => baseDelay(ms, 'finance-flow');

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

const financeQuery = (filters: FinanceTransactionFilters = {}) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      if (value.length) params.set(key, value.join(','));
      return;
    }
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  return params.toString();
};

async function fetchFinanceTransactions(filters?: FinanceTransactionFilters): Promise<ApiResponse<FinanceTransactionPage>> {
  if (!shouldUseBackendApi()) return { code: 503, data: null as unknown as FinanceTransactionPage, message: '真实收支流水需要连接后端服务' };
  return backendRequest<FinanceTransactionPage>(`/finance-transactions?${financeQuery(filters)}`);
}

async function fetchFinanceTransactionById(id: string): Promise<ApiResponse<FinanceTransaction | null>> {
  if (!shouldUseBackendApi()) return { code: 503, data: null, message: '真实收支流水需要连接后端服务' };
  return backendRequest<FinanceTransaction | null>(`/finance-transactions/${encodeURIComponent(id)}`);
}

async function exportFinanceTransactionsCsv(filters?: FinanceTransactionFilters): Promise<ApiResponse<string>> {
  if (!shouldUseBackendApi()) return { code: 503, data: '', message: '真实收支流水需要连接后端服务' };
  return backendRequest<string>(`/finance-transactions/export?${financeQuery(filters)}`);
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
