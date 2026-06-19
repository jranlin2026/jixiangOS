import type { Lead, LeadFilters, FollowUpRecord, LeadAIAnalysis } from '../types/lead';
import type { ApiResponse, PaginatedResponse } from './types';
import { createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { STORAGE_KEYS, DEFAULT_PAGE_SIZE, normalizeResourceOwnership } from '../shared/utils/constants';
import { initializeMockData } from './mock';
import { v4 as uuidv4 } from 'uuid';
import { leadFlowApi } from './leadFlowApi';

function ensureInit(): void {
  initializeMockData();
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

function normalizeLead(lead: Lead): Lead {
  return {
    ...lead,
    lifecycleStatus: lead.lifecycleStatus || (lead.status === '已流失' ? '已流失' : lead.status === '已成交' ? '已转订单' : '未转商机'),
    lifecycleStatusUpdatedAt: lead.lifecycleStatusUpdatedAt || lead.updatedAt,
    intakeStatus: lead.intakeStatus || '入库成功',
    inputBy: lead.inputBy || lead.owner,
    assignedTo: lead.assignedTo || lead.owner,
    sourceType: normalizeResourceOwnership(lead.sourceType),
  };
}

async function fetchLeads(filters?: LeadFilters): Promise<ApiResponse<PaginatedResponse<Lead>>> {
  ensureInit();
  await delay(200);
  const allLeads = getStorageData<Lead[]>(STORAGE_KEYS.LEADS) || [];
  const normalizedLeads = allLeads.map(normalizeLead);
  if (JSON.stringify(allLeads) !== JSON.stringify(normalizedLeads)) {
    setStorageData(STORAGE_KEYS.LEADS, normalizedLeads);
  }
  let filtered = [...normalizedLeads];

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
  const lead = leads.map(normalizeLead).find((item) => item.id === id) || null;
  return createSuccessResponse(lead);
}

async function createLead(data: Omit<Lead, 'id' | 'createdAt' | 'updatedAt' | 'followUpRecords'>): Promise<ApiResponse<Lead | null>> {
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
  ensureInit();
  await delay(200);
  const leads = getStorageData<Lead[]>(STORAGE_KEYS.LEADS) || [];
  const idx = leads.findIndex((lead) => lead.id === id);
  if (idx === -1) return createSuccessResponse(null);
  const now = new Date().toISOString();
  const existing = normalizeLead(leads[idx]);
  const changes = buildLeadChanges(existing, data);
  const history = existing.changeHistory || [];
  const assignedChanged = changes.some((item) => item.field === 'assignedTo');
  leads[idx] = {
    ...existing,
    ...data,
    sourceType: normalizeResourceOwnership(data.sourceType || existing.sourceType),
    assignedAt: assignedChanged ? now : data.assignedAt || existing.assignedAt,
    changeHistory: changes.length > 0
      ? [{
        id: `hist-${uuidv4().slice(0, 8)}`,
        action: 'update',
        operator: data.assignedTo || data.owner || existing.assignedTo || existing.owner || existing.inputBy || '系统',
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

async function deleteLead(id: string): Promise<ApiResponse<boolean>> {
  ensureInit();
  await delay(150);
  const leads = getStorageData<Lead[]>(STORAGE_KEYS.LEADS) || [];
  setStorageData(STORAGE_KEYS.LEADS, leads.filter((lead) => lead.id !== id));
  return createSuccessResponse(true);
}

async function addFollowUpRecord(
  leadId: string,
  record: Omit<FollowUpRecord, 'id' | 'leadId' | 'createdAt'>,
): Promise<ApiResponse<FollowUpRecord | null>> {
  ensureInit();
  await delay(200);
  const leads = getStorageData<Lead[]>(STORAGE_KEYS.LEADS) || [];
  const lead = leads.find((item) => item.id === leadId);
  if (!lead) return createSuccessResponse(null);
  const newRecord: FollowUpRecord = {
    ...record,
    id: uuidv4(),
    leadId,
    createdAt: new Date().toISOString(),
  };
  lead.followUpRecords.unshift(newRecord);
  lead.updatedAt = new Date().toISOString();
  setStorageData(STORAGE_KEYS.LEADS, leads);
  return createSuccessResponse(newRecord);
}

async function refreshAIAnalysis(leadId: string): Promise<ApiResponse<LeadAIAnalysis | null>> {
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
