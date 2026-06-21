import type { Customer, CustomerActivityRecord, CustomerCreateInput, CustomerFilters, AICustomerPortrait } from '../types/customer';
import type { Lead, LeadChangeLog } from '../types/lead';
import type { Order } from '../types/order';
import type { ApiResponse, PaginatedResponse } from './types';
import { createErrorResponse, createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { LIFECYCLE_STATUS_CODES, STORAGE_KEYS, DEFAULT_PAGE_SIZE, normalizeResourceOwnership } from '../shared/utils/constants';
import { initializeMockData } from './mock';
import { v4 as uuidv4 } from 'uuid';
import { getCurrentOperatorName, getCurrentOperatorUser, SYSTEM_OPERATOR } from '../shared/utils/currentOperator';
import { claimFromPublicPool, hydrateCustomerLifecycle, releaseToPublicPool, setLeadLifecycle } from './lifecycleSync';
import { filterVisibleCustomers } from '../shared/utils/dataVisibility';
import { applyContactEditLock } from '../shared/utils/contactEditLock';
import { isSuperAdminRoleName } from '../shared/utils/roles';

function ensureInit(): void {
  initializeMockData();
}

function isPersonalResource(value?: string): boolean {
  return normalizeResourceOwnership(value) === '个人资源';
}

function validateCustomerAttribution(data: Partial<Customer>): string | null {
  if (isPersonalResource(data.sourceType) && !data.leadContributorName && !data.leadContributorId) {
    return '个人资源必须填写线索贡献人';
  }
  return null;
}

function normalizeCustomer(customer: Customer): Customer {
  const legacySourceType = customer.sourceType;
  const normalizedSourceType = normalizeResourceOwnership(legacySourceType);
  const legacyLeadSource = legacySourceType && legacySourceType !== '公司资源' && legacySourceType !== '个人资源' && legacySourceType !== '自拓'
    ? legacySourceType
    : undefined;
  const normalized = hydrateCustomerLifecycle({
    ...customer,
    leadSource: customer.leadSource || legacyLeadSource,
    sourceType: normalizedSourceType,
  });
  const hasOrder = (customer.orderCount || 0) > 0 || (customer.totalSpent || 0) > 0;
  if (hasOrder) return normalized;

  const growthPath = (normalized.growthPath || []).filter((item) => {
    const isLegacyAutoPurchase = !item.orderId
      && !item.orderNo
      && item.title.startsWith('签约')
      && item.description.startsWith('首次购买');
    return !isLegacyAutoPurchase;
  });

  return growthPath.length === (normalized.growthPath || []).length
    ? normalized
    : { ...normalized, growthPath };
}

const CUSTOMER_CHANGE_FIELDS: Array<{ field: keyof Customer; label: string }> = [
  { field: 'name', label: '姓名' },
  { field: 'company', label: '公司' },
  { field: 'phone', label: '电话' },
  { field: 'wechat', label: '微信' },
  { field: 'customerLevel', label: '客户等级' },
  { field: 'owner', label: '销售负责人' },
  { field: 'leadInputBy', label: '线索录入人' },
  { field: 'leadContributorName', label: '线索贡献人' },
  { field: 'leadSource', label: '线索来源' },
  { field: 'industry', label: '行业' },
  { field: 'city', label: '城市' },
  { field: 'tags', label: '客户标签' },
  { field: 'remark', label: '备注' },
  { field: 'sourceType', label: '资源归属' },
  { field: 'sourceName', label: '来源名称' },
  { field: 'originalSalesTransferBy', label: '原销转人员' },
];

const CUSTOMER_TO_LEAD_FIELDS: Array<{
  customerField: keyof Customer;
  leadField: keyof Lead;
  label: string;
}> = [
  { customerField: 'phone', leadField: 'phone', label: '鎵嬫満鍙?' },
  { customerField: 'wechat', leadField: 'wechat', label: '寰俊' },
  { customerField: 'name', leadField: 'name', label: '姓名' },
  { customerField: 'company', leadField: 'company', label: '公司' },
  { customerField: 'sourceType', leadField: 'sourceType', label: '资源归属' },
  { customerField: 'leadSource', leadField: 'source', label: '线索来源' },
  { customerField: 'sourceName', leadField: 'sourceName', label: '线索来源明细' },
  { customerField: 'sourceAccount', leadField: 'sourceAccount', label: '来源账号' },
  { customerField: 'industry', leadField: 'industry', label: '行业' },
  { customerField: 'city', leadField: 'city', label: '城市' },
  { customerField: 'owner', leadField: 'assignedTo', label: '分配销售' },
  { customerField: 'leadInputBy', leadField: 'inputBy', label: '线索录入人' },
  { customerField: 'leadContributorId', leadField: 'leadContributorId', label: '线索贡献人' },
  { customerField: 'leadContributorName', leadField: 'leadContributorName', label: '线索贡献人' },
  { customerField: 'tags', leadField: 'tags', label: '标签' },
  { customerField: 'remark', leadField: 'remark', label: '备注' },
  { customerField: 'score', leadField: 'score', label: '线索评分' },
];

function formatActivityValue(value: unknown): string | number | boolean | null {
  if (Array.isArray(value)) return value.join('、');
  if (value === undefined || value === '') return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value);
}

function buildCustomerChanges(existing: Customer, data: Partial<Customer>): CustomerActivityRecord['changes'] {
  return CUSTOMER_CHANGE_FIELDS
    .filter(({ field }) => Object.prototype.hasOwnProperty.call(data, field))
    .map(({ field, label }) => {
      const oldValue = formatActivityValue(existing[field]);
      const newValue = formatActivityValue(data[field]);
      return oldValue === newValue ? null : { field: String(field), label, oldValue, newValue };
    })
    .filter(Boolean) as CustomerActivityRecord['changes'];
}

function syncLeadsByCustomer(customer: Customer, now: string, operator = SYSTEM_OPERATOR): void {
  const leads = getStorageData<Lead[]>(STORAGE_KEYS.LEADS) || [];
  let changed = false;
  const nextLeads = leads.map((lead) => {
    const matchedById = Boolean(lead.customerId && lead.customerId === customer.id);
    const matchedByPhone = Boolean(customer.phone && lead.phone === customer.phone);
    const matchedByWechat = Boolean(customer.wechat && lead.wechat && lead.wechat === customer.wechat);
    if (!matchedById && !matchedByPhone && !matchedByWechat) return lead;

    const patch: Partial<Lead> = {
      customerId: customer.id,
      owner: customer.owner,
      sourceType: normalizeResourceOwnership(customer.sourceType),
    };
    const fieldChanges: NonNullable<LeadChangeLog['changes']> = [];

    CUSTOMER_TO_LEAD_FIELDS.forEach(({ customerField, leadField, label }) => {
      const rawValue = customer[customerField] as Lead[keyof Lead] | undefined;
      const nextValue = leadField === 'sourceType'
        ? normalizeResourceOwnership(rawValue as string | undefined)
        : rawValue;
      const oldValue = leadField === 'sourceType'
        ? normalizeResourceOwnership(lead[leadField] as string | undefined)
        : lead[leadField];
      const formattedOld = formatActivityValue(oldValue);
      const formattedNext = formatActivityValue(nextValue);
      if (formattedOld === formattedNext) return;
      (patch as Record<string, unknown>)[leadField] = nextValue;
      fieldChanges.push({
        field: String(leadField),
        label,
        oldValue: formattedOld,
        newValue: formattedNext,
      });
    });

    if (!fieldChanges.length && lead.customerId === customer.id && lead.owner === customer.owner) return lead;
    changed = true;
    return {
      ...lead,
      ...patch,
      assignedAt: fieldChanges.some((item) => item.field === 'assignedTo') ? now : lead.assignedAt,
      changeHistory: fieldChanges.length
        ? [{
          id: `hist-${uuidv4().slice(0, 8)}`,
          action: 'update',
          operator,
          changedAt: now,
          summary: `客户资料同步：${fieldChanges.map((item) => item.label).join('、')}`,
          changes: fieldChanges,
        }, ...(lead.changeHistory || [])]
        : lead.changeHistory,
      updatedAt: now,
    };
  });

  if (changed) setStorageData(STORAGE_KEYS.LEADS, nextLeads);
}

function createActivity(data: Omit<CustomerActivityRecord, 'id' | 'createdAt'> & { createdAt?: string }): CustomerActivityRecord {
  return {
    ...data,
    id: `act-${uuidv4().slice(0, 8)}`,
    createdAt: data.createdAt || new Date().toISOString(),
  };
}

function prependActivity(customer: Customer, activity: CustomerActivityRecord): Customer {
  return {
    ...customer,
    activityRecords: [activity, ...(customer.activityRecords || [])],
  };
}

function isRelatedOrder(customer: Customer, order: Order): boolean {
  return Boolean(
    order.customerId === customer.id
      || order.customerName === customer.company
      || order.customerName === customer.name,
  );
}

function reconcileCustomerOrderStats(customers: Customer[]): Customer[] {
  const orders = getStorageData<Order[]>(STORAGE_KEYS.ORDERS) || [];
  let changed = false;

  const nextCustomers = customers.map((customer) => {
    const relatedOrders = orders.filter((order) => isRelatedOrder(customer, order));
    if (!relatedOrders.length) return customer;
    const orderCount = relatedOrders.length;
    const totalSpent = relatedOrders.reduce((sum, order) => sum + (Number(order.actualAmount) || 0), 0);
    const latestOrder = relatedOrders
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    const growthPath = [...(customer.growthPath || [])];
    const activityRecords = [...(customer.activityRecords || [])];

    relatedOrders.forEach((order) => {
      const hasMilestone = growthPath.some((item) => item.orderId === order.id || item.orderNo === order.orderNo);
      if (!hasMilestone) {
        growthPath.push({
          id: `milestone-${uuidv4().slice(0, 8)}`,
          date: (order.payments?.[0]?.paidAt || order.createdAt).slice(0, 10),
          title: `签约${order.productLevel}产品`,
          description: `订单${order.orderNo}，实付${Number(order.actualAmount || order.amount).toLocaleString('zh-CN')}元`,
          productLevel: order.productLevel,
          orderId: order.id,
          orderNo: order.orderNo,
        });
      }

      const hasActivity = activityRecords.some((item) => item.relatedType === 'order' && item.relatedId === order.id && item.type === 'order');
      if (!hasActivity) {
        activityRecords.unshift({
          id: `act-${uuidv4().slice(0, 8)}`,
          type: 'order',
          title: `创建了订单 ${order.orderNo}`,
          content: `签约${order.productLevel}，实付${Number(order.actualAmount || order.amount).toLocaleString('zh-CN')}元`,
          operator: SYSTEM_OPERATOR,
          relatedId: order.id,
          relatedType: 'order',
          createdAt: order.createdAt,
        });
      }
    });

    const nextCustomer = {
      ...customer,
      productLevel: latestOrder?.productLevel || customer.productLevel,
      orderCount,
      totalSpent,
      growthPath,
      activityRecords,
    };
    if (JSON.stringify(nextCustomer) !== JSON.stringify(customer)) changed = true;
    return nextCustomer;
  });

  if (changed) setStorageData(STORAGE_KEYS.CUSTOMERS, nextCustomers);
  return nextCustomers;
}

async function fetchCustomers(filters?: CustomerFilters): Promise<ApiResponse<PaginatedResponse<Customer>>> {
  ensureInit();
  await delay(200);
  const raw = getStorageData<Customer[]>(STORAGE_KEYS.CUSTOMERS) || [];
  const all = reconcileCustomerOrderStats(raw.map(normalizeCustomer));
  if (JSON.stringify(raw) !== JSON.stringify(all)) {
    setStorageData(STORAGE_KEYS.CUSTOMERS, all);
  }
  let filtered = filterVisibleCustomers(all);

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
  if (filters?.lifecycleStatusCode) {
    filtered = filtered.filter((c) => c.lifecycleStatusCode === filters.lifecycleStatusCode);
  } else {
    filtered = filtered.filter((c) => c.lifecycleStatusCode !== 'public_pool');
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
  const customers = reconcileCustomerOrderStats((getStorageData<Customer[]>(STORAGE_KEYS.CUSTOMERS) || []).map(normalizeCustomer));
  const customer = filterVisibleCustomers(customers).find((c) => c.id === id) || null;
  return createSuccessResponse(customer);
}

async function createCustomer(data: CustomerCreateInput): Promise<ApiResponse<Customer>> {
  ensureInit();
  await delay(200);
  const validationError = validateCustomerAttribution(data);
  if (validationError) return createErrorResponse(validationError);
  const customers = getStorageData<Customer[]>(STORAGE_KEYS.CUSTOMERS) || [];
  const now = new Date().toISOString();
  const newCustomer: Customer = {
    ...data,
    id: `cust-${uuidv4().slice(0, 8)}`,
    productLevel: data.productLevel || undefined,
    customerLevel: data.customerLevel || 'L1',
    lifecycleStatusCode: data.lifecycleStatusCode || 'pending_followup',
    lifecycleStatusUpdatedAt: now,
    totalSpent: 0,
    orderCount: 0,
    growthPath: [],
    growthRecords: [],
    activityRecords: [createActivity({
      type: 'create',
      title: '创建了客户',
      operator: getCurrentOperatorName(data.owner || data.leadInputBy),
      content: data.remark,
      createdAt: now,
    })],
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
  const existing = customers[idx];
  const now = new Date().toISOString();
  const safeData = applyContactEditLock<Customer>(existing, data, {
    canEditLockedContact: isSuperAdminRoleName(getCurrentOperatorUser()?.role),
  });
  const merged = { ...existing, ...safeData, sourceType: normalizeResourceOwnership(safeData.sourceType || existing.sourceType) };
  const validationError = validateCustomerAttribution(merged);
  if (validationError) return createErrorResponse(validationError);
  const changes = buildCustomerChanges(existing, safeData);
  const operator = getCurrentOperatorName(existing.owner);
  const activityType = safeData.owner && safeData.owner !== existing.owner ? 'transfer' : 'update';
  customers[idx] = {
    ...merged,
    activityRecords: changes?.length
      ? [createActivity({
        type: activityType,
        title: activityType === 'transfer' ? `转交客户给 ${data.owner}` : `更新了 ${changes.map((item) => item.label).join('、')}`,
        operator,
        changes,
        createdAt: now,
      }), ...(existing.activityRecords || [])]
      : existing.activityRecords,
    updatedAt: now,
  };
  setStorageData(STORAGE_KEYS.CUSTOMERS, customers);
  syncLeadsByCustomer(customers[idx], now, operator);
  return createSuccessResponse(customers[idx]);
}

async function addCustomerFollowUp(
  id: string,
  data: { content: string; operator?: string; type?: '联系记录' | '客户行为' | '销售活动' | '跟进记录' },
): Promise<ApiResponse<Customer | null>> {
  ensureInit();
  await delay(150);
  const customers = getStorageData<Customer[]>(STORAGE_KEYS.CUSTOMERS) || [];
  const idx = customers.findIndex((c) => c.id === id);
  if (idx === -1) return createSuccessResponse(null);
  const content = data.content.trim();
  if (!content) return createSuccessResponse(customers[idx]);
  const now = new Date().toISOString();
  customers[idx] = prependActivity(customers[idx], createActivity({
    type: 'follow',
    title: `发表了${data.type || '跟进记录'}`,
    content,
    operator: getCurrentOperatorName(data.operator || customers[idx].owner),
    createdAt: now,
  }));
  if (customers[idx].lifecycleStatusCode === 'pending_followup') {
    customers[idx].lifecycleStatusCode = LIFECYCLE_STATUS_CODES.FOLLOWING;
    customers[idx].lifecycleStatusUpdatedAt = now;
  }
  customers[idx].updatedAt = now;
  setStorageData(STORAGE_KEYS.CUSTOMERS, customers);
  setLeadLifecycle(findLeadIdByCustomer(customers[idx]), LIFECYCLE_STATUS_CODES.FOLLOWING, {
    reason: content,
    operator: getCurrentOperatorName(data.operator || customers[idx].owner),
  });
  return createSuccessResponse(customers[idx]);
}

function appendCustomerActivity(
  customerId: string,
  activity: Omit<CustomerActivityRecord, 'id' | 'createdAt'> & { createdAt?: string },
): Customer | null {
  const customers = getStorageData<Customer[]>(STORAGE_KEYS.CUSTOMERS) || [];
  const idx = customers.findIndex((customer) => customer.id === customerId);
  if (idx === -1) return null;
  customers[idx] = prependActivity(customers[idx], createActivity(activity));
  customers[idx].updatedAt = activity.createdAt || new Date().toISOString();
  setStorageData(STORAGE_KEYS.CUSTOMERS, customers);
  return customers[idx];
}

function findLeadIdByCustomer(customer: Customer): string | undefined {
  const leads = getStorageData<Lead[]>(STORAGE_KEYS.LEADS) || [];
  return leads.find((lead) => (
    lead.customerId === customer.id
    || (lead.phone && customer.phone && lead.phone === customer.phone)
    || (lead.wechat && customer.wechat && lead.wechat === customer.wechat)
  ))?.id;
}

async function releaseCustomerToPublicPool(id: string, reason: string): Promise<ApiResponse<Customer | null>> {
  ensureInit();
  await delay(150);
  const customers = getStorageData<Customer[]>(STORAGE_KEYS.CUSTOMERS) || [];
  const customer = customers.find((item) => item.id === id);
  if (!customer) return createSuccessResponse(null);
  const operator = getCurrentOperatorName(customer.owner);
  releaseToPublicPool({ customerId: id }, reason, operator);
  setLeadLifecycle(findLeadIdByCustomer(customer), LIFECYCLE_STATUS_CODES.PUBLIC_POOL, { reason, operator });
  const updated = appendCustomerActivity(id, {
    type: 'transfer',
    title: '释放到公海',
    content: reason || '销售放弃跟进，客户进入公海池',
    operator,
  });
  return createSuccessResponse(updated ? hydrateCustomerLifecycle(updated) : null);
}

async function claimCustomerFromPublicPool(id: string, userName: string): Promise<ApiResponse<Customer | null>> {
  ensureInit();
  await delay(150);
  const customers = getStorageData<Customer[]>(STORAGE_KEYS.CUSTOMERS) || [];
  const customer = customers.find((item) => item.id === id);
  if (!customer) return createSuccessResponse(null);
  const operator = getCurrentOperatorName(userName);
  claimFromPublicPool({ customerId: id }, userName);
  setLeadLifecycle(findLeadIdByCustomer(customer), LIFECYCLE_STATUS_CODES.PENDING_FOLLOWUP, {
    reason: 'claim_from_public_pool',
    operator,
  });
  const updated = appendCustomerActivity(id, {
    type: 'transfer',
    title: '重新领取公海客户',
    content: `${userName} 领取客户继续跟进`,
    operator,
  });
  return createSuccessResponse(updated ? hydrateCustomerLifecycle(updated) : null);
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
  customer.activityRecords = [
    createActivity({
      type: 'ai',
      title: '生成了 AI 客户画像',
      content: portrait.aiSummary,
      operator: getCurrentOperatorName(customer.owner),
    }),
    ...(customer.activityRecords || []),
  ];
  customer.updatedAt = new Date().toISOString();
  setStorageData(STORAGE_KEYS.CUSTOMERS, customers);
  return createSuccessResponse(portrait);
}

export const customerApi = {
  fetchCustomers,
  fetchCustomerById,
  createCustomer,
  updateCustomer,
  addCustomerFollowUp,
  appendCustomerActivity,
  releaseCustomerToPublicPool,
  claimCustomerFromPublicPool,
  deleteCustomer,
  fetchAIPortrait,
};
