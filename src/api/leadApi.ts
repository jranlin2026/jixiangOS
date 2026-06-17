import type { Lead, LeadFilters, FollowUpRecord, LeadAIAnalysis } from '../types/lead';
import type { ApiResponse, PaginatedResponse } from './types';
import { createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { STORAGE_KEYS, DEFAULT_PAGE_SIZE } from '../shared/utils/constants';
import { initializeMockData } from './mock';
import { v4 as uuidv4 } from 'uuid';
import { leadFlowApi } from './leadFlowApi';

function ensureInit(): void {
  initializeMockData();
}

function normalizeLead(lead: Lead): Lead {
  return {
    ...lead,
    lifecycleStatus: lead.lifecycleStatus || (lead.status === '已流失' ? '已流失' : lead.status === '已成交' ? '已转订单' : '未转商机'),
    lifecycleStatusUpdatedAt: lead.lifecycleStatusUpdatedAt || lead.updatedAt,
    intakeStatus: lead.intakeStatus || '入库成功',
    inputBy: lead.inputBy || lead.owner,
    assignedTo: lead.assignedTo || lead.owner,
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
  leads[idx] = { ...leads[idx], ...data, updatedAt: new Date().toISOString() };
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
