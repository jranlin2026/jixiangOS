import type { Lead, LeadFilters, FollowUpRecord, LeadAIAnalysis } from '../types/lead';
import type { Customer } from '../types/customer';
import type { ApiResponse, PaginatedResponse } from './types';
import { createErrorResponse, createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { backendRequest, shouldUseBackendApi } from './backendClient';
import { LIFECYCLE_STATUS_CODES, STORAGE_KEYS, DEFAULT_PAGE_SIZE, normalizeResourceOwnership } from '../shared/utils/constants';
import { initializeMockData } from './mock';
import { v4 as uuidv4 } from 'uuid';
import { leadFlowApi } from './leadFlowApi';
import { getCurrentOperatorName, getCurrentOperatorUser } from '../shared/utils/currentOperator';
import { hydrateLeadLifecycle, setCustomerLifecycle } from './lifecycleSync';
import { filterVisibleLeads } from '../shared/utils/dataVisibility';
import { applyContactEditLock } from '../shared/utils/contactEditLock';
import { isSuperAdminRoleName } from '../shared/utils/roles';
import { getPhoneNumberError, normalizePhoneForComparison, normalizePhoneForStorage } from '../shared/utils/phoneNumber';
import type { User } from '../types/settings';

function ensureInit(): void {
  initializeMockData();
}

function isPersonalResource(value?: string): boolean {
  return normalizeResourceOwnership(value) === '个人资源';
}

function validateLeadAttribution(data: Partial<Lead>): string | null {
  if (isPersonalResource(data.sourceType) && !data.leadContributorName && !data.leadContributorId) {
    return '个人资源必须填写线索贡献人';
  }
  const phoneError = getPhoneNumberError(data.phone);
  if (phoneError) return phoneError;
  return null;
}

const LEAD_CHANGE_FIELDS: Array<{ field: keyof Lead; label: string }> = [
  { field: 'name', label: '姓名' },
  { field: 'company', label: '公司' },
  { field: 'sourceType', label: '资源归属' },
  { field: 'source', label: '线索来源' },
  { field: 'sourceName', label: '线索来源明细' },
  { field: 'industry', label: '行业' },
  { field: 'city', label: '城市' },
  { field: 'inputBy', label: '线索录入人' },
  { field: 'leadContributorName', label: '线索贡献人' },
  { field: 'assignedTo', label: '分配销售' },
  { field: 'tags', label: '标签' },
  { field: 'remark', label: '备注' },
  { field: 'intakeStatus', label: '入库状态' },
  { field: 'lifecycleStatus', label: '生命周期' },
];

function normalizeChangeValue(value: unknown): string | number | boolean | null {
  if (value === undefined || value === '') return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter(Boolean).join('、') || null;
  return JSON.stringify(value);
}

function buildLeadChanges(before: Lead, data: Partial<Lead>) {
  return LEAD_CHANGE_FIELDS
    .filter(({ field }) => Object.prototype.hasOwnProperty.call(data, field))
    .map(({ field, label }) => {
      const oldValue = field === 'sourceType'
        ? normalizeResourceOwnership(before[field] as string | undefined)
        : before[field];
      const newValue = field === 'sourceType'
        ? normalizeResourceOwnership(data[field] as string | undefined)
        : data[field];
      return {
        field: String(field),
        label,
        oldValue: normalizeChangeValue(oldValue),
        newValue: normalizeChangeValue(newValue),
      };
    })
    .filter((item) => item.oldValue !== item.newValue);
}

function findLinkedCustomer(lead: Lead): Customer | undefined {
  const customers = getStorageData<Customer[]>(STORAGE_KEYS.CUSTOMERS) || [];
  return customers.find((customer) => (
    (lead.customerId && customer.id === lead.customerId)
    || (lead.phone && customer.phone && normalizePhoneForComparison(lead.phone) === normalizePhoneForComparison(customer.phone))
    || (lead.wechat && customer.wechat && lead.wechat === customer.wechat)
  ));
}

function normalizeLead(lead: Lead): Lead {
  const linkedCustomer = findLinkedCustomer(lead);
  const customerLifecycleCode = linkedCustomer?.lifecycleStatusCode;
  const customerLifecycleUpdatedAt = linkedCustomer?.lifecycleStatusUpdatedAt;
  return hydrateLeadLifecycle({
    ...lead,
    phone: normalizePhoneForStorage(lead.phone),
    ...(customerLifecycleCode ? {
      customerId: lead.customerId || linkedCustomer?.id,
      lifecycleStatusCode: customerLifecycleCode,
      lifecycleStatusUpdatedAt: customerLifecycleUpdatedAt || lead.lifecycleStatusUpdatedAt,
    } : {}),
    intakeStatus: lead.intakeStatus || '入库成功',
    inputBy: lead.inputBy || lead.owner,
    assignedTo: lead.assignedTo || lead.owner,
    sourceType: normalizeResourceOwnership(lead.sourceType),
  });
}

function cacheBackendLead(lead: Lead): Lead {
  const leads = getStorageData<Lead[]>(STORAGE_KEYS.LEADS) || [];
  const index = leads.findIndex((item) => item.id === lead.id);
  const nextLeads = index === -1
    ? [lead, ...leads]
    : leads.map((item, itemIndex) => (itemIndex === index ? lead : item));
  setStorageData(STORAGE_KEYS.LEADS, nextLeads, { persist: false });
  return lead;
}

function getActiveAssignableUserNames(): Set<string> {
  const users = getStorageData<User[]>(STORAGE_KEYS.USERS) || [];
  return new Set(
    users
      .filter((user) => user.isActive && (user.employmentStatus || 'active') !== 'left')
      .map((user) => user.name)
      .filter(Boolean),
  );
}

function reconcileStaleLeadAssignees(leads: Lead[]): Lead[] {
  const assignableUserNames = getActiveAssignableUserNames();
  if (!assignableUserNames.size) return leads;

  return leads.map((lead) => {
    if (lead.customerId) return lead;
    const assignedTo = lead.assignedTo && assignableUserNames.has(lead.assignedTo)
      ? lead.assignedTo
      : undefined;
    const owner = lead.owner && (lead.owner === '待分配' || lead.owner === '公海' || assignableUserNames.has(lead.owner))
      ? lead.owner
      : assignedTo || '待分配';

    if (owner === lead.owner && assignedTo === lead.assignedTo) return lead;
    return {
      ...lead,
      owner,
      assignedTo,
      assignedAt: assignedTo ? lead.assignedAt : undefined,
      updatedAt: new Date().toISOString(),
    };
  });
}

async function fetchLeads(filters?: LeadFilters): Promise<ApiResponse<PaginatedResponse<Lead>>> {
  if (shouldUseBackendApi()) {
    const params = new URLSearchParams();
    Object.entries(filters || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
    });
    return backendRequest<PaginatedResponse<Lead>>(`/leads${params.size ? `?${params.toString()}` : ''}`);
  }

  ensureInit();
  await delay(200);
  const allLeads = getStorageData<Lead[]>(STORAGE_KEYS.LEADS) || [];
  const normalizedLeads = reconcileStaleLeadAssignees(allLeads.map(normalizeLead));
  if (JSON.stringify(allLeads) !== JSON.stringify(normalizedLeads)) {
    setStorageData(STORAGE_KEYS.LEADS, normalizedLeads, { persist: false });
  }
  let filtered = filterVisibleLeads(normalizedLeads.filter((lead) => !lead.deletedAt));

  if (filters?.search) {
    const q = filters.search.toLowerCase();
    filtered = filtered.filter(
      (lead) =>
        lead.name.toLowerCase().includes(q)
        || lead.company?.toLowerCase().includes(q)
        || lead.phone.includes(q)
        || (lead.wechat || '').toLowerCase().includes(q)
        || (lead.industry || '').toLowerCase().includes(q)
        || (lead.city || '').toLowerCase().includes(q),
    );
  }
  if (filters?.source) filtered = filtered.filter((lead) => lead.source === filters.source);
  if (filters?.status) filtered = filtered.filter((lead) => lead.status === filters.status);
  if (filters?.lifecycleStatusCode) filtered = filtered.filter((lead) => lead.lifecycleStatusCode === filters.lifecycleStatusCode);
  if (filters?.owner) filtered = filtered.filter((lead) => lead.owner === filters.owner || lead.assignedTo === filters.owner);
  if (filters?.startDate) filtered = filtered.filter((lead) => lead.createdAt >= filters.startDate!);
  if (filters?.endDate) filtered = filtered.filter((lead) => lead.createdAt <= filters.endDate!);

  const page = filters?.page || 1;
  const pageSize = filters?.pageSize || DEFAULT_PAGE_SIZE;
  const total = filtered.length;
  const totalPages = Math.ceil(total / pageSize);
  const items = filtered.slice((page - 1) * pageSize, page * pageSize);

  return createSuccessResponse({
    items,
    pagination: { page, pageSize, total, totalPages },
  });
}

async function fetchLeadById(id: string): Promise<ApiResponse<Lead | null>> {
  ensureInit();
  await delay(150);
  const leads = getStorageData<Lead[]>(STORAGE_KEYS.LEADS) || [];
  const normalizedLeads = reconcileStaleLeadAssignees(leads.map(normalizeLead));
  if (JSON.stringify(leads) !== JSON.stringify(normalizedLeads)) {
    setStorageData(STORAGE_KEYS.LEADS, normalizedLeads, { persist: false });
  }
  const lead = filterVisibleLeads(normalizedLeads.filter((item) => !item.deletedAt)).find((item) => item.id === id) || null;
  return createSuccessResponse(lead);
}

async function createLead(data: Omit<Lead, 'id' | 'createdAt' | 'updatedAt' | 'followUpRecords'>): Promise<ApiResponse<Lead | null>> {
  if (shouldUseBackendApi()) {
    const response = await backendRequest<Lead>('/leads', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (response.code !== 0 || !response.data) return createErrorResponse(response.message, response.code || -1);
    return createSuccessResponse(cacheBackendLead(response.data));
  }

  ensureInit();
  await delay(200);
  const result = leadFlowApi.intakeLead(data);
  return {
    code: result.lead ? 0 : -1,
    data: result.lead,
    message: result.message,
  };
}

async function updateLead(id: string, data: Partial<Lead>): Promise<ApiResponse<Lead | null>> {
  if (shouldUseBackendApi()) {
    const response = await backendRequest<Lead>(`/leads/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    if (response.code !== 0 || !response.data) return createErrorResponse(response.message, response.code || -1);
    return createSuccessResponse(cacheBackendLead(response.data));
  }

  ensureInit();
  await delay(200);
  const leads = getStorageData<Lead[]>(STORAGE_KEYS.LEADS) || [];
  const idx = leads.findIndex((lead) => lead.id === id);
  if (idx === -1) return createSuccessResponse(null);
  const now = new Date().toISOString();
  const existing = normalizeLead(leads[idx]);
  const safeData = applyContactEditLock<Lead>(existing, data, {
    canEditLockedContact: isSuperAdminRoleName(getCurrentOperatorUser()?.role),
  });
  if (Object.prototype.hasOwnProperty.call(safeData, 'phone')) {
    safeData.phone = normalizePhoneForStorage(safeData.phone);
  }
  const merged = {
    ...existing,
    ...safeData,
    sourceType: normalizeResourceOwnership(safeData.sourceType || existing.sourceType),
  };
  const validationError = validateLeadAttribution(merged);
  if (validationError) return createErrorResponse(validationError);
  const changes = buildLeadChanges(existing, safeData);
  const history = existing.changeHistory || [];
  const assignedChanged = changes.some((item) => item.field === 'assignedTo');
  const operator = getCurrentOperatorName(existing.inputBy || existing.owner);
  leads[idx] = {
    ...merged,
    assignedAt: assignedChanged ? now : data.assignedAt || existing.assignedAt,
    changeHistory: changes.length > 0
      ? [{
        id: `hist-${uuidv4().slice(0, 8)}`,
        action: 'update',
        operator,
        changedAt: now,
        summary: `修改了${changes.map((item) => item.label).join('、')}`,
        changes,
      }, ...history]
      : history,
    updatedAt: now,
  };
  setStorageData(STORAGE_KEYS.LEADS, leads);
  leadFlowApi.syncCustomerByLead(leads[idx]);
  return createSuccessResponse(leads[idx]);
}

async function deleteLead(id: string, reason = ''): Promise<ApiResponse<boolean>> {
  if (shouldUseBackendApi()) {
    const response = await backendRequest<boolean>(`/leads/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason }),
    });
    if (response.code !== 0 || response.data !== true) return createErrorResponse(response.message, response.code || -1);
    const leads = getStorageData<Lead[]>(STORAGE_KEYS.LEADS) || [];
    setStorageData(STORAGE_KEYS.LEADS, leads.filter((lead) => lead.id !== id), { persist: false });
    return createSuccessResponse(true);
  }

  ensureInit();
  await delay(150);
  const leads = getStorageData<Lead[]>(STORAGE_KEYS.LEADS) || [];
  const index = leads.findIndex((lead) => lead.id === id);
  if (index === -1) return createSuccessResponse(true);
  const now = new Date().toISOString();
  leads[index] = {
    ...leads[index],
    deletedAt: now,
    deletedBy: getCurrentOperatorName(leads[index].owner),
    deleteReason: reason.trim() || '业务删除',
    updatedAt: now,
  };
  setStorageData(STORAGE_KEYS.LEADS, leads);
  return createSuccessResponse(true);
}

async function addFollowUpRecord(
  leadId: string,
  record: Omit<FollowUpRecord, 'id' | 'leadId' | 'createdAt'>,
): Promise<ApiResponse<FollowUpRecord | null>> {
  if (shouldUseBackendApi()) {
    const response = await backendRequest<FollowUpRecord>(`/leads/${encodeURIComponent(leadId)}/follow-ups`, {
      method: 'POST',
      body: JSON.stringify(record),
    });
    if (response.code !== 0 || !response.data) return createErrorResponse(response.message, response.code || -1);
    const leads = getStorageData<Lead[]>(STORAGE_KEYS.LEADS) || [];
    const index = leads.findIndex((lead) => lead.id === leadId);
    if (index !== -1) {
      const lead = leads[index];
      const shouldStartFollowing = !lead.lifecycleStatusCode || lead.lifecycleStatusCode === LIFECYCLE_STATUS_CODES.PENDING_FOLLOWUP;
      leads[index] = {
        ...lead,
        followUpRecords: [response.data, ...(lead.followUpRecords || [])],
        lifecycleStatusCode: shouldStartFollowing ? LIFECYCLE_STATUS_CODES.FOLLOWING : lead.lifecycleStatusCode,
        lifecycleStatus: shouldStartFollowing ? '跟进中' : lead.lifecycleStatus,
        lifecycleStatusUpdatedAt: shouldStartFollowing ? response.data.createdAt : lead.lifecycleStatusUpdatedAt,
        updatedAt: response.data.createdAt,
      };
      setStorageData(STORAGE_KEYS.LEADS, leads, { persist: false });
    }
    return createSuccessResponse(response.data);
  }

  ensureInit();
  await delay(200);
  const leads = getStorageData<Lead[]>(STORAGE_KEYS.LEADS) || [];
  const lead = leads.find((item) => item.id === leadId);
  if (!lead) return createSuccessResponse(null);
  const newRecord: FollowUpRecord = {
    ...record,
    createdBy: getCurrentOperatorName(record.createdBy),
    id: uuidv4(),
    leadId,
    createdAt: new Date().toISOString(),
  };
  lead.followUpRecords.unshift(newRecord);
  if (lead.lifecycleStatusCode === 'pending_followup' || !lead.lifecycleStatusCode) {
    lead.lifecycleStatusCode = 'following';
    lead.lifecycleStatus = '跟进中';
    lead.lifecycleStatusUpdatedAt = newRecord.createdAt;
    if (lead.customerId) setCustomerLifecycle(lead.customerId, 'following');
  }
  lead.updatedAt = new Date().toISOString();
  setStorageData(STORAGE_KEYS.LEADS, leads);
  return createSuccessResponse(newRecord);
}

async function refreshAIAnalysis(leadId: string): Promise<ApiResponse<LeadAIAnalysis | null>> {
  if (shouldUseBackendApi()) {
    return createErrorResponse(
      'AI 线索分析的记录级服务器保存尚未完成，为避免旧快照覆盖线索数据，当前已安全暂停',
      409,
    );
  }
  ensureInit();
  await delay(500);
  const leads = getStorageData<Lead[]>(STORAGE_KEYS.LEADS) || [];
  const lead = leads.find((item) => item.id === leadId);
  if (!lead) return createSuccessResponse(null);

  const analysis: LeadAIAnalysis = {
    upgradeProbability: Math.round((0.3 + Math.random() * 0.6) * 100) / 100,
    reasons: ['客户互动频繁', '预算范围明确', '决策链清晰', '行业匹配度高'].slice(0, 2 + Math.floor(Math.random() * 3)),
    suggestions: ['安排产品演示', '提供行业案例', '推进签约流程', '加强跟进频次'].slice(0, 2 + Math.floor(Math.random() * 3)),
    analyzedAt: new Date().toISOString(),
  };

  lead.aiAnalysis = analysis;
  lead.updatedAt = new Date().toISOString();
  setStorageData(STORAGE_KEYS.LEADS, leads);
  return createSuccessResponse(analysis);
}

export const leadApi = {
  fetchLeads,
  fetchLeadById,
  createLead,
  updateLead,
  deleteLead,
  addFollowUpRecord,
  refreshAIAnalysis,
};
