import type { Customer, CustomerCreateInput, CustomerFilters, AICustomerPortrait } from '../types/customer';
import type { ApiResponse, PaginatedResponse } from './types';
import { createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { STORAGE_KEYS, DEFAULT_PAGE_SIZE } from '../shared/utils/constants';
import { initializeMockData } from './mock';
import { v4 as uuidv4 } from 'uuid';

function ensureInit(): void {
  initializeMockData();
}

function normalizeCustomer(customer: Customer): Customer {
  const hasOrder = (customer.orderCount || 0) > 0 || (customer.totalSpent || 0) > 0;
  if (hasOrder) return customer;

  const growthPath = (customer.growthPath || []).filter((item) => {
    const isLegacyAutoPurchase = !item.orderId
      && !item.orderNo
      && item.title.startsWith('签约')
      && item.description.startsWith('首次购买');
    return !isLegacyAutoPurchase;
  });

  return growthPath.length === (customer.growthPath || []).length
    ? customer
    : { ...customer, growthPath };
}

async function fetchCustomers(filters?: CustomerFilters): Promise<ApiResponse<PaginatedResponse<Customer>>> {
  ensureInit();
  await delay(200);
  const raw = getStorageData<Customer[]>(STORAGE_KEYS.CUSTOMERS) || [];
  const all = raw.map(normalizeCustomer);
  if (JSON.stringify(raw) !== JSON.stringify(all)) {
    setStorageData(STORAGE_KEYS.CUSTOMERS, all);
  }
  let filtered = [...all];

  if (filters?.search) {
    const q = filters.search.toLowerCase();
    filtered = filtered.filter(
      (c) => c.name.toLowerCase().includes(q)
        || c.company.toLowerCase().includes(q)
        || c.phone.includes(q)
        || (c.wechat || '').toLowerCase().includes(q),
    );
  }
  if (filters?.productLevel) {
    filtered = filtered.filter((c) => c.productLevel === filters.productLevel);
  }
  if (filters?.customerLevel) {
    filtered = filtered.filter((c) => c.customerLevel === filters.customerLevel);
  }
  if (filters?.owner) {
    filtered = filtered.filter((c) => c.owner === filters.owner);
  }

  const page = filters?.page || 1;
  const pageSize = filters?.pageSize || DEFAULT_PAGE_SIZE;
  const total = filtered.length;
  const totalPages = Math.ceil(total / pageSize);
  const items = filtered.slice((page - 1) * pageSize, page * pageSize);

  return createSuccessResponse({ items, pagination: { page, pageSize, total, totalPages } });
}

async function fetchCustomerById(id: string): Promise<ApiResponse<Customer | null>> {
  ensureInit();
  await delay(150);
  const customers = (getStorageData<Customer[]>(STORAGE_KEYS.CUSTOMERS) || []).map(normalizeCustomer);
  const customer = customers.find((c) => c.id === id) || null;
  return createSuccessResponse(customer);
}

async function createCustomer(data: CustomerCreateInput): Promise<ApiResponse<Customer>> {
  ensureInit();
  await delay(200);
  const customers = getStorageData<Customer[]>(STORAGE_KEYS.CUSTOMERS) || [];
  const now = new Date().toISOString();
  const newCustomer: Customer = {
    ...data,
    id: `cust-${uuidv4().slice(0, 8)}`,
    productLevel: data.productLevel || undefined,
    customerLevel: data.customerLevel || 'L1',
    totalSpent: 0,
    orderCount: 0,
    growthPath: [],
    growthRecords: [],
    createdAt: now,
    updatedAt: now,
  };
  customers.unshift(newCustomer);
  setStorageData(STORAGE_KEYS.CUSTOMERS, customers);
  return createSuccessResponse(newCustomer);
}

async function updateCustomer(id: string, data: Partial<Customer>): Promise<ApiResponse<Customer | null>> {
  ensureInit();
  await delay(200);
  const customers = getStorageData<Customer[]>(STORAGE_KEYS.CUSTOMERS) || [];
  const idx = customers.findIndex((c) => c.id === id);
  if (idx === -1) return createSuccessResponse(null);
  customers[idx] = { ...customers[idx], ...data, updatedAt: new Date().toISOString() };
  setStorageData(STORAGE_KEYS.CUSTOMERS, customers);
  return createSuccessResponse(customers[idx]);
}

async function deleteCustomer(id: string): Promise<ApiResponse<boolean>> {
  ensureInit();
  await delay(150);
  const customers = getStorageData<Customer[]>(STORAGE_KEYS.CUSTOMERS) || [];
  setStorageData(STORAGE_KEYS.CUSTOMERS, customers.filter((c) => c.id !== id));
  return createSuccessResponse(true);
}

async function fetchAIPortrait(customerId: string): Promise<ApiResponse<AICustomerPortrait | null>> {
  ensureInit();
  await delay(400);
  const customers = getStorageData<Customer[]>(STORAGE_KEYS.CUSTOMERS) || [];
  const customer = customers.find((c) => c.id === customerId);
  if (!customer) return createSuccessResponse(null);
  const levelText = customer.productLevel || customer.customerLevel;

  const portrait: AICustomerPortrait = {
    riskLevel: ['低', '中', '高'][Math.floor(Math.random() * 3)] as '低' | '中' | '高',
    upgradePotential: ['低', '中', '高'][Math.floor(Math.random() * 3)] as '低' | '中' | '高',
    satisfaction: Math.round(50 + Math.random() * 50),
    predictedNextPurchase: Math.random() > 0.5 ? '代理升级' : undefined,
    keyInsights: ['使用频率高', '行业资源丰富', '转介绍能力强'].slice(0, 2 + Math.floor(Math.random() * 2)),
    analyzedAt: new Date().toISOString(),
    teamSize: ['1-10人', '11-50人', '51-200人'][Math.floor(Math.random() * 3)],
    accountCount: Math.floor(5 + Math.random() * 50),
    budgetLevel: ['低', '中', '高'][Math.floor(Math.random() * 3)] as '低' | '中' | '高',
    activityLevel: ['低', '中', '高'][Math.floor(Math.random() * 3)] as '低' | '中' | '高',
    upgradeProbability: Math.round((0.3 + Math.random() * 0.6) * 100) / 100,
    aiSummary: `客户当前为${levelText}等级，使用情况${Math.random() > 0.5 ? '良好' : '一般'}，${Math.random() > 0.5 ? '有升级潜力' : '建议加强维护'}。`,
  };

  customer.aiPortrait = portrait;
  customer.updatedAt = new Date().toISOString();
  setStorageData(STORAGE_KEYS.CUSTOMERS, customers);
  return createSuccessResponse(portrait);
}

export const customerApi = {
  fetchCustomers,
  fetchCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  fetchAIPortrait,
};
