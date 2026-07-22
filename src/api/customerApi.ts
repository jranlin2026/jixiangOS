import type { Customer, CustomerActivityRecord, CustomerCreateInput, CustomerFilters, AICustomerPortrait, CustomerManageableUser } from '../types/customer';
import type { Lead, LeadChangeLog } from '../types/lead';
import type { Order } from '../types/order';
import type { ApiResponse, PaginatedResponse } from './types';
import { createErrorResponse, createSuccessResponse, delay } from './types';
import { backendRequest, shouldUseBackendApi } from './backendClient';
import { getStorageData, setStorageData } from './mock/storage';
import { LIFECYCLE_STATUS_CODES, STORAGE_KEYS, DEFAULT_PAGE_SIZE, normalizeResourceOwnership } from '../shared/utils/constants';
import { initializeMockData } from './mock';
import { v4 as uuidv4 } from 'uuid';
import { getCurrentOperatorName, getCurrentOperatorUser, SYSTEM_OPERATOR } from '../shared/utils/currentOperator';
import { claimFromPublicPool, hydrateCustomerLifecycle, releaseToPublicPool, setLeadLifecycle } from './lifecycleSync';
import { filterVisibleCustomers } from '../shared/utils/dataVisibility';
import { applyContactEditLock } from '../shared/utils/contactEditLock';
import { getPhoneNumberError, normalizePhoneForComparison, normalizePhoneForStorage } from '../shared/utils/phoneNumber';
import type { CustomerTag, CustomerTagCatalog } from '../types/tag';
import type { Role } from '../types/role';
import { groupTagIdsForFilter, normalizeManualTagIds, validateCustomerTagFilters } from '../shared/utils/customerTagPolicy';
import { PERMISSION_KEYS } from '../shared/utils/permissions';
import { getCustomerLastFollowUpOwner } from '../shared/utils/customerFollowUp';

function ensureInit(): void {
  initializeMockData();
}

function canEditLockedCustomerContact(): boolean {
  const user = getCurrentOperatorUser();
  if (!user?.isActive || !user.roleId) return false;
  const roles = getStorageData<Role[]>(STORAGE_KEYS.ROLES) || [];
  const role = roles.find((candidate) => candidate.id === user.roleId && candidate.isActive);
  return Boolean(role?.permissions.some((permission) => (
    permission.module === PERMISSION_KEYS.CUSTOMER_DELETE
    && permission.actions.includes('delete')
  )));
}

function isPersonalResource(value?: string): boolean {
  return normalizeResourceOwnership(value) === '个人资源';
}

function validateCustomerAttribution(data: Partial<Customer>): string | null {
  if (isPersonalResource(data.sourceType) && !data.leadContributorName && !data.leadContributorId) {
    return '个人资源必须填写线索贡献人';
  }
  const phoneError = getPhoneNumberError(data.phone);
  if (phoneError) return phoneError;
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
    phone: normalizePhoneForStorage(customer.phone),
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

function cacheBackendCustomer(customer: Customer): Customer {
  const normalized = normalizeCustomer(customer);
  const customers = getStorageData<Customer[]>(STORAGE_KEYS.CUSTOMERS) || [];
  const index = customers.findIndex((item) => item.id === normalized.id);
  const nextCustomers = index === -1
    ? [normalized, ...customers]
    : customers.map((item, itemIndex) => (itemIndex === index ? normalized : item));
  setStorageData(STORAGE_KEYS.CUSTOMERS, nextCustomers, { persist: false });
  return normalized;
}

function cacheBackendCustomerReleaseInLeads(customer: Customer): void {
  const leads = getStorageData<Lead[]>(STORAGE_KEYS.LEADS) || [];
  const updatedAt = customer.updatedAt || new Date().toISOString();
  let changed = false;
  const nextLeads = leads.map((lead) => {
    const matches = lead.customerId === customer.id
      || Boolean(lead.phone && customer.phone && normalizePhoneForComparison(lead.phone) === normalizePhoneForComparison(customer.phone))
      || Boolean(lead.wechat && customer.wechat && lead.wechat === customer.wechat);
    if (!matches) return lead;
    changed = true;
    return {
      ...lead,
      owner: '公海',
      assignedTo: undefined,
      lifecycleStatusCode: LIFECYCLE_STATUS_CODES.PUBLIC_POOL,
      lifecycleStatus: '流失公海',
      lifecycleStatusUpdatedAt: updatedAt,
      updatedAt,
    };
  });
  if (changed) setStorageData(STORAGE_KEYS.LEADS, nextLeads, { persist: false });
}

function cacheBackendCustomerOwnerInLeads(customer: Customer): void {
  const leads = getStorageData<Lead[]>(STORAGE_KEYS.LEADS) || [];
  const updatedAt = customer.updatedAt || new Date().toISOString();
  let changed = false;
  const nextLeads = leads.map((lead) => {
    const matches = lead.customerId === customer.id
      || Boolean(lead.phone && customer.phone && normalizePhoneForComparison(lead.phone) === normalizePhoneForComparison(customer.phone))
      || Boolean(lead.wechat && customer.wechat && lead.wechat === customer.wechat);
    if (!matches) return lead;
    changed = true;
    return {
      ...lead,
      customerId: customer.id,
      name: customer.name,
      company: customer.company,
      phone: customer.phone,
      wechat: customer.wechat,
      industry: customer.industry,
      city: customer.city,
      owner: customer.owner,
      assignedTo: customer.owner === '公海' ? undefined : customer.owner,
      inputBy: customer.leadInputBy,
      leadContributorId: customer.leadContributorId,
      leadContributorName: customer.leadContributorName,
      source: customer.leadSource || lead.source,
      sourceType: customer.sourceType,
      sourceName: customer.sourceName,
      sourceAccount: customer.sourceAccount,
      tags: customer.tags,
      remark: customer.remark,
      score: customer.score,
      lifecycleStatusCode: customer.lifecycleStatusCode,
      lifecycleStatusUpdatedAt: customer.lifecycleStatusUpdatedAt || updatedAt,
      updatedAt,
    };
  });
  if (changed) setStorageData(STORAGE_KEYS.LEADS, nextLeads, { persist: false });
}

function hasFollowActivity(customer: Customer): boolean {
  return (customer.activityRecords || []).some((record) => record.type === 'follow');
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
  { field: 'manualTagIds', label: '客户标签' },
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
    const matchedByPhone = Boolean(customer.phone && lead.phone && normalizePhoneForComparison(lead.phone) === normalizePhoneForComparison(customer.phone));
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
  const orders = (getStorageData<Order[]>(STORAGE_KEYS.ORDERS) || []).filter((order) => !order.deletedAt);
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

  if (changed) setStorageData(STORAGE_KEYS.CUSTOMERS, nextCustomers, { persist: false });
  return nextCustomers;
}

async function fetchManageableUsers(): Promise<ApiResponse<CustomerManageableUser[]>> {
  if (shouldUseBackendApi()) {
    return backendRequest<CustomerManageableUser[]>('/customers/manageable-users');
  }
  const currentUser = getCurrentOperatorUser();
  if (!currentUser) return createSuccessResponse([]);
  return createSuccessResponse([{
    id: currentUser.id,
    name: currentUser.name,
    ...(currentUser.positionName ? { positionName: currentUser.positionName } : {}),
  }]);
}

async function fetchPublicPoolFollowUpUsers(): Promise<ApiResponse<CustomerManageableUser[]>> {
  if (shouldUseBackendApi()) {
    const response = await backendRequest<string[]>('/customers/public-pool-follow-up-operators');
    if (response.code !== 0) return createErrorResponse(response.message, response.code);
    return createSuccessResponse((response.data || []).map((name) => ({ id: `last-follow-up:${name}`, name })));
  }
  const names = filterVisibleCustomers(getStorageData<Customer[]>(STORAGE_KEYS.CUSTOMERS) || [])
    .filter((customer) => customer.lifecycleStatusCode === LIFECYCLE_STATUS_CODES.PUBLIC_POOL)
    .map(getCustomerLastFollowUpOwner)
    .filter(Boolean);
  return createSuccessResponse(Array.from(new Set(names)).map((name) => ({ id: `last-follow-up:${name}`, name })));
}

async function fetchCustomers(filters?: CustomerFilters): Promise<ApiResponse<PaginatedResponse<Customer>>> {
  if (shouldUseBackendApi()) {
    const params = new URLSearchParams();
    Object.entries(filters || {}).forEach(([key, value]) => {
      if (key === 'tagIds' && Array.isArray(value)) {
        normalizeManualTagIds(value).slice(0, 20).forEach((id) => params.append('tagId', id));
      } else if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
    });
    return backendRequest<PaginatedResponse<Customer>>(`/customers${params.size ? `?${params.toString()}` : ''}`);
  }

  ensureInit();
  await delay(200);
  const raw = getStorageData<Customer[]>(STORAGE_KEYS.CUSTOMERS) || [];
  const all = reconcileCustomerOrderStats(raw.map(normalizeCustomer));
  if (JSON.stringify(raw) !== JSON.stringify(all)) {
    setStorageData(STORAGE_KEYS.CUSTOMERS, all, { persist: false });
  }
  let filtered = filterVisibleCustomers(all.filter((customer) => !customer.deletedAt));

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
  if (filters?.lifecycleStatusCode) {
    filtered = filtered.filter((c) => c.lifecycleStatusCode === filters.lifecycleStatusCode);
  } else {
    filtered = filtered.filter((c) => c.lifecycleStatusCode !== 'public_pool');
  }
  if (filters?.owner) {
    const owner = filters.owner.trim();
    filtered = filtered.filter((c) => (
      filters.lifecycleStatusCode === 'public_pool'
        ? getCustomerLastFollowUpOwner(c) === owner
        : c.owner === owner
    ));
  }
  if (filters?.followStatus) {
    filtered = filtered.filter((c) => (
      filters.followStatus === 'has_follow'
        ? hasFollowActivity(c)
        : !hasFollowActivity(c)
    ));
  }
  if (filters?.sourceType) {
    filtered = filtered.filter((c) => normalizeResourceOwnership(c.sourceType) === normalizeResourceOwnership(filters.sourceType));
  }
  if (filters?.leadSource) {
    const q = filters.leadSource.toLowerCase();
    filtered = filtered.filter((c) => (c.leadSource || '').toLowerCase().includes(q));
  }
  if (filters?.industry) {
    const q = filters.industry.toLowerCase();
    filtered = filtered.filter((c) => (c.industry || '').toLowerCase().includes(q));
  }
  if (filters?.city) {
    const q = filters.city.toLowerCase();
    filtered = filtered.filter((c) => (c.city || '').toLowerCase().includes(q));
  }
  const catalog: CustomerTagCatalog = {
    groups: getStorageData(STORAGE_KEYS.TAG_GROUPS) || [],
    tags: getStorageData(STORAGE_KEYS.TAGS) || [],
  };
  const tagFilterValidation = validateCustomerTagFilters(catalog, filters || {});
  if (!tagFilterValidation.ok) return createErrorResponse(tagFilterValidation.message, 400) as ApiResponse<PaginatedResponse<Customer>>;
  const selectedTagIds = normalizeManualTagIds(filters?.tagIds || []).slice(0, 20);
  if (selectedTagIds.length) {
    const mode = filters?.tagMatch || 'grouped';
    const groups = mode === 'grouped' ? groupTagIdsForFilter(catalog, selectedTagIds) : [selectedTagIds];
    filtered = filtered.filter((customer) => {
      const assigned = new Set(customer.manualTagIds || []);
      if (mode === 'all') return selectedTagIds.every((id) => assigned.has(id));
      if (mode === 'any') return selectedTagIds.some((id) => assigned.has(id));
      return groups.length > 0 && groups.every((ids) => ids.some((id) => assigned.has(id)));
    });
  }
  if (filters?.withoutTags) filtered = filtered.filter((customer) => !(customer.manualTagIds || []).length);
  if (filters?.missingTagGroupId) {
    const groupTagIds = catalog.tags.filter((tag) => tag.groupId === filters.missingTagGroupId && tag.isActive).map((tag) => tag.id);
    filtered = filtered.filter((customer) => !(customer.manualTagIds || []).some((id) => groupTagIds.includes(id)));
  }
  if (filters?.tag) {
    const q = filters.tag.toLowerCase();
    filtered = filtered.filter((c) => (c.tags || []).some((tag) => tag.toLowerCase() === q));
  }

  const page = filters?.page || 1;
  const pageSize = filters?.pageSize || DEFAULT_PAGE_SIZE;
  const total = filtered.length;
  const totalPages = Math.ceil(total / pageSize);
  const items = filtered.slice((page - 1) * pageSize, page * pageSize);

  return createSuccessResponse({ items, pagination: { page, pageSize, total, totalPages } });
}

async function fetchCustomerById(id: string): Promise<ApiResponse<Customer | null>> {
  if (shouldUseBackendApi()) {
    const response = await backendRequest<Customer>(`/customers/${encodeURIComponent(id)}`);
    if (response.code !== 0 || !response.data) return createErrorResponse(response.message, response.code || -1);
    return createSuccessResponse(cacheBackendCustomer(response.data));
  }
  ensureInit();
  await delay(150);
  const customers = reconcileCustomerOrderStats((getStorageData<Customer[]>(STORAGE_KEYS.CUSTOMERS) || []).map(normalizeCustomer));
  const customer = filterVisibleCustomers(customers.filter((item) => !item.deletedAt)).find((c) => c.id === id) || null;
  return createSuccessResponse(customer);
}

async function createCustomer(data: CustomerCreateInput): Promise<ApiResponse<Customer>> {
  if (shouldUseBackendApi()) {
    const response = await backendRequest<Customer>('/customers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return response.code === 0 && response.data
      ? createSuccessResponse(cacheBackendCustomer(response.data))
      : createErrorResponse(response.message, response.code);
  }

  ensureInit();
  await delay(200);
  const normalizedData = { ...data, phone: normalizePhoneForStorage(data.phone) };
  const validationError = validateCustomerAttribution(normalizedData);
  if (validationError) return createErrorResponse(validationError);
  const customers = getStorageData<Customer[]>(STORAGE_KEYS.CUSTOMERS) || [];
  const now = new Date().toISOString();
  const newCustomer: Customer = {
    ...normalizedData,
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
  if (shouldUseBackendApi()) {
    const response = await backendRequest<Customer>(`/customers/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    if (response.code !== 0 || !response.data) return createErrorResponse(response.message, response.code || -1);
    const customer = cacheBackendCustomer(response.data);
    cacheBackendCustomerOwnerInLeads(customer);
    return createSuccessResponse(customer);
  }

  ensureInit();
  await delay(200);
  const customers = getStorageData<Customer[]>(STORAGE_KEYS.CUSTOMERS) || [];
  const idx = customers.findIndex((c) => c.id === id);
  if (idx === -1) return createSuccessResponse(null);
  const existing = customers[idx];
  const now = new Date().toISOString();
  const safeData = applyContactEditLock<Customer>(existing, data, {
    // Mock mode still requires a stable role ID and the explicit high-risk leaf.
    canEditLockedContact: canEditLockedCustomerContact(),
  });
  if (Object.prototype.hasOwnProperty.call(safeData, 'phone')) {
    safeData.phone = normalizePhoneForStorage(safeData.phone);
  }
  let tagNamesById: Map<string, string> | null = null;
  if (Object.prototype.hasOwnProperty.call(safeData, 'manualTagIds')) {
    const tags = getStorageData<CustomerTag[]>(STORAGE_KEYS.TAGS) || [];
    tagNamesById = new Map(tags.map((tag) => [tag.id, tag.name]));
    safeData.manualTagIds = normalizeManualTagIds(safeData.manualTagIds || []);
    safeData.tags = safeData.manualTagIds.map((id) => tagNamesById!.get(id) || '历史标签');
  }
  const merged = { ...existing, ...safeData, sourceType: normalizeResourceOwnership(safeData.sourceType || existing.sourceType) };
  const validationError = validateCustomerAttribution(merged);
  if (validationError) return createErrorResponse(validationError);
  const changes = buildCustomerChanges(existing, safeData);
  const tagChange = changes?.find((change) => change.field === 'manualTagIds');
  if (tagChange && tagNamesById) {
    tagChange.oldValue = formatActivityValue((existing.manualTagIds || []).map((id) => tagNamesById!.get(id) || '历史标签'));
    tagChange.newValue = formatActivityValue((safeData.manualTagIds || []).map((id) => tagNamesById!.get(id) || '历史标签'));
  }
  const operator = getCurrentOperatorName(existing.owner);
  const activityType = safeData.owner && safeData.owner !== existing.owner ? 'transfer' : 'update';
  customers[idx] = {
    ...merged,
    activityRecords: changes?.length
      ? [createActivity({
        type: activityType,
        title: activityType === 'transfer' ? `转交客户给 ${data.owner}` : changes.length === 1 && tagChange ? '更新了客户标签' : `更新了 ${changes.map((item) => item.label).join('、')}`,
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
  data: {
    content?: string;
    operator?: string;
    type?: '联系记录' | '客户行为' | '销售活动' | '跟进记录';
    attachments?: CustomerActivityRecord['attachments'];
  },
): Promise<ApiResponse<Customer | null>> {
  if (shouldUseBackendApi()) {
    const response = await backendRequest<Customer>(`/customers/${encodeURIComponent(id)}/follow-ups`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (response.code !== 0 || !response.data) return createErrorResponse(response.message, response.code || -1);
    return createSuccessResponse(cacheBackendCustomer(response.data));
  }

  ensureInit();
  await delay(150);
  const customers = getStorageData<Customer[]>(STORAGE_KEYS.CUSTOMERS) || [];
  const idx = customers.findIndex((c) => c.id === id);
  if (idx === -1) return createSuccessResponse(null);
  const content = (data.content || '').trim();
  const attachments = Array.isArray(data.attachments) ? data.attachments : [];
  if (!content && !attachments.length) return createSuccessResponse(customers[idx]);
  const now = new Date().toISOString();
  customers[idx] = prependActivity(customers[idx], createActivity({
    type: 'follow',
    title: `发表了${data.type || '跟进记录'}`,
    content: content || undefined,
    attachments,
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
    || (lead.phone && customer.phone && normalizePhoneForComparison(lead.phone) === normalizePhoneForComparison(customer.phone))
    || (lead.wechat && customer.wechat && lead.wechat === customer.wechat)
  ))?.id;
}

async function releaseCustomerToPublicPool(id: string, reason: string): Promise<ApiResponse<Customer | null>> {
  if (shouldUseBackendApi()) {
    const response = await backendRequest<Customer>(`/customers/${encodeURIComponent(id)}/release`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    if (response.code !== 0 || !response.data) return createErrorResponse(response.message, response.code || -1);
    const customer = cacheBackendCustomer(response.data);
    cacheBackendCustomerReleaseInLeads(customer);
    return createSuccessResponse(customer);
  }

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
  if (shouldUseBackendApi()) {
    const response = await backendRequest<Customer>(`/customers/${encodeURIComponent(id)}/claim`, { method: 'POST' });
    if (response.code !== 0 || !response.data) return createErrorResponse(response.message, response.code || -1);
    const customer = cacheBackendCustomer(response.data);
    cacheBackendCustomerOwnerInLeads(customer);
    return createSuccessResponse(customer);
  }

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

async function assignCustomerOwner(id: string, ownerId: string, reason = ''): Promise<ApiResponse<Customer | null>> {
  if (shouldUseBackendApi()) {
    const response = await backendRequest<Customer>(`/customers/${encodeURIComponent(id)}/assign`, {
      method: 'POST',
      body: JSON.stringify({ ownerId, reason }),
    });
    if (response.code !== 0 || !response.data) return createErrorResponse(response.message, response.code || -1);
    const customer = cacheBackendCustomer(response.data);
    cacheBackendCustomerOwnerInLeads(customer);
    return createSuccessResponse(customer);
  }

  ensureInit();
  await delay(150);
  const targetUser = (getStorageData<Array<{ id: string; name: string }>>(STORAGE_KEYS.USERS) || [])
    .find((user) => user.id === ownerId);
  const nextOwner = String(targetUser?.name || '').trim();
  if (!nextOwner) return createErrorResponse('请选择新的销售负责人');
  const customers = getStorageData<Customer[]>(STORAGE_KEYS.CUSTOMERS) || [];
  const idx = customers.findIndex((item) => item.id === id);
  if (idx === -1) return createSuccessResponse(null);
  const existing = customers[idx];
  const now = new Date().toISOString();
  const previousOwner = existing.owner || '';
  const previousSalesOwner = existing.lifecycleStatusCode === LIFECYCLE_STATUS_CODES.PUBLIC_POOL
    ? existing.previousOwner
    : previousOwner;
  const changed = previousOwner !== nextOwner;
  const operator = getCurrentOperatorName(previousOwner || nextOwner);
  const cleanReason = reason.trim();
  const changes = changed
    ? [{
        field: 'owner',
        label: '销售负责人',
        oldValue: previousOwner || null,
        newValue: nextOwner,
      }]
    : undefined;

  customers[idx] = {
    ...existing,
    owner: nextOwner,
    ownerId,
    ownerIdentityStatus: 'resolved',
    previousOwner: changed ? previousSalesOwner : existing.previousOwner,
    assignedBy: operator,
    assignedAt: changed ? now : existing.assignedAt || now,
    assignmentReason: cleanReason || existing.assignmentReason,
    ownerSince: changed ? now : existing.ownerSince,
    activityRecords: [
      createActivity({
        type: 'transfer',
        title: changed ? `转让客户给 ${nextOwner}` : `确认客户仍由 ${nextOwner} 跟进`,
        content: cleanReason || undefined,
        operator,
        changes,
        createdAt: now,
      }),
      ...(existing.activityRecords || []),
    ],
    updatedAt: now,
  };
  setStorageData(STORAGE_KEYS.CUSTOMERS, customers);
  syncLeadsByCustomer(customers[idx], now, operator);
  return createSuccessResponse(customers[idx]);
}

async function deleteCustomer(id: string, reason = ''): Promise<ApiResponse<boolean>> {
  if (shouldUseBackendApi()) {
    const customers = getStorageData<Customer[]>(STORAGE_KEYS.CUSTOMERS) || [];
    const customer = customers.find((item) => item.id === id);
    const response = await backendRequest<boolean>(`/customers/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason }),
    });
    if (response.code !== 0 || response.data !== true) return createErrorResponse(response.message, response.code || -1);
    setStorageData(STORAGE_KEYS.CUSTOMERS, customers.filter((item) => item.id !== id), { persist: false });
    if (customer) {
      const leads = getStorageData<Lead[]>(STORAGE_KEYS.LEADS) || [];
      const nextLeads = leads.filter((lead) => lead.customerId !== customer.id);
      setStorageData(STORAGE_KEYS.LEADS, nextLeads, { persist: false });
    }
    return createSuccessResponse(true);
  }

  ensureInit();
  await delay(150);
  const customers = getStorageData<Customer[]>(STORAGE_KEYS.CUSTOMERS) || [];
  const index = customers.findIndex((c) => c.id === id);
  if (index === -1) return createSuccessResponse(true);
  const customer = customers[index];
  const relatedOrders = (getStorageData<Order[]>(STORAGE_KEYS.ORDERS) || []).filter((order) => (
    !order.deletedAt
    && (order.customerId === customer.id || order.customerName === customer.company || order.customerName === customer.name)
  ));
  if (relatedOrders.length) {
    return createErrorResponse('客户存在关联订单，不能删除；请先处理订单后再操作。');
  }
  const now = new Date().toISOString();
  const deletionCascadeId = `delete-cascade-${uuidv4()}`;
  const leads = getStorageData<Lead[]>(STORAGE_KEYS.LEADS) || [];
  const cascadeDeletedLeadIds = leads
    .filter((lead) => lead.customerId === customer.id && !lead.deletedAt)
    .map((lead) => lead.id);
  customers[index] = {
    ...customer,
    deletedAt: now,
    deletedBy: getCurrentOperatorName(customer.owner),
    deleteReason: reason.trim() || '业务删除',
    deletionCascadeId,
    cascadeDeletedLeadIds,
    updatedAt: now,
  };
  const nextLeads = leads.map((lead) => (
    lead.customerId === customer.id && !lead.deletedAt
      ? {
        ...lead,
        deletedAt: now,
        deletedBy: getCurrentOperatorName(customer.owner),
        deleteReason: reason.trim() || '业务删除',
        deletionCascadeId,
        updatedAt: now,
      }
      : lead
  ));
  setStorageData(STORAGE_KEYS.CUSTOMERS, customers);
  setStorageData(STORAGE_KEYS.LEADS, nextLeads);
  return createSuccessResponse(true);
}

async function fetchAIPortrait(customerId: string): Promise<ApiResponse<AICustomerPortrait | null>> {
  if (shouldUseBackendApi()) {
    return createErrorResponse(
      'AI 客户画像的记录级服务器保存尚未完成，为避免旧快照覆盖客户数据，当前已安全暂停',
      409,
    );
  }
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
  fetchManageableUsers,
  fetchPublicPoolFollowUpUsers,
  fetchCustomers,
  fetchCustomerById,
  createCustomer,
  updateCustomer,
  addCustomerFollowUp,
  appendCustomerActivity,
  releaseCustomerToPublicPool,
  claimCustomerFromPublicPool,
  assignCustomerOwner,
  deleteCustomer,
  fetchAIPortrait,
};
