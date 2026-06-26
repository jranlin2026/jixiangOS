import type { FinanceDailyRecord, ChannelROI, FinanceStats, FinanceFilters, FinanceIncome, FinanceExpense } from '../types/finance';
import type { Order } from '../types/order';
import type { Product } from '../types/product';
import type { ApiResponse } from './types';
import { createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { STORAGE_KEYS } from '../shared/utils/constants';
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
  createIncome,
  createExpense,
};
