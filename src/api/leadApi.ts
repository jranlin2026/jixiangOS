import type { Lead, LeadFilters, FollowUpRecord, LeadAIAnalysis } from '../types/lead';
import type { ApiResponse, PaginatedResponse } from './types';
import { createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { STORAGE_KEYS, DEFAULT_PAGE_SIZE } from '../shared/utils/constants';
import { initializeMockData } from './mock';
import { v4 as uuidv4 } from 'uuid';

/** 确保数据已初始化 */
function ensureInit(): void {
  initializeMockData();
}

function normalizeLead(lead: Lead): Lead {
  if (lead.lifecycleStatus) return lead;
  return {
    ...lead,
    lifecycleStatus: lead.status === '已流失' ? '已流失' : lead.status === '已成交' ? '已转订单' : '未转商机',
    lifecycleStatusUpdatedAt: lead.updatedAt,
  };
}

/** 获取所有线索 */
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
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.company?.toLowerCase().includes(q) ||
        l.phone.includes(q) ||
        (l.industry && l.industry.toLowerCase().includes(q)) ||
        (l.city && l.city.toLowerCase().includes(q)),
    );
  }
  if (filters?.source) {
    filtered = filtered.filter((l) => l.source === filters.source);
  }
  if (filters?.status) {
    filtered = filtered.filter((l) => l.status === filters.status);
  }
  if (filters?.owner) {
    filtered = filtered.filter((l) => l.owner === filters.owner);
  }
  if (filters?.startDate) {
    filtered = filtered.filter((l) => l.createdAt >= filters.startDate!);
  }
  if (filters?.endDate) {
    filtered = filtered.filter((l) => l.createdAt <= filters.endDate!);
  }

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

/** 获取单个线索 */
async function fetchLeadById(id: string): Promise<ApiResponse<Lead | null>> {
  ensureInit();
  await delay(150);
  const leads = getStorageData<Lead[]>(STORAGE_KEYS.LEADS) || [];
  const lead = leads.map(normalizeLead).find((l) => l.id === id) || null;
  return createSuccessResponse(lead);
}

/** 创建线索 */
async function createLead(data: Omit<Lead, 'id' | 'createdAt' | 'updatedAt' | 'followUpRecords'>): Promise<ApiResponse<Lead>> {
  ensureInit();
  await delay(200);
  const leads = getStorageData<Lead[]>(STORAGE_KEYS.LEADS) || [];
  const now = new Date().toISOString();
  const newLead: Lead = {
    ...data,
    id: `lead-${uuidv4().slice(0, 8)}`,
    lifecycleStatus: data.lifecycleStatus || '未转商机',
    lifecycleStatusUpdatedAt: now,
    followUpRecords: [],
    createdAt: now,
    updatedAt: now,
  };
  leads.unshift(newLead);
  setStorageData(STORAGE_KEYS.LEADS, leads);
  return createSuccessResponse(newLead);
}

/** 更新线索 */
async function updateLead(id: string, data: Partial<Lead>): Promise<ApiResponse<Lead | null>> {
  ensureInit();
  await delay(200);
  const leads = getStorageData<Lead[]>(STORAGE_KEYS.LEADS) || [];
  const idx = leads.findIndex((l) => l.id === id);
  if (idx === -1) return createSuccessResponse(null);
  leads[idx] = { ...leads[idx], ...data, updatedAt: new Date().toISOString() };
  setStorageData(STORAGE_KEYS.LEADS, leads);
  return createSuccessResponse(leads[idx]);
}

/** 删除线索 */
async function deleteLead(id: string): Promise<ApiResponse<boolean>> {
  ensureInit();
  await delay(150);
  const leads = getStorageData<Lead[]>(STORAGE_KEYS.LEADS) || [];
  const filtered = leads.filter((l) => l.id !== id);
  setStorageData(STORAGE_KEYS.LEADS, filtered);
  return createSuccessResponse(true);
}

/** 添加跟进记录 */
async function addFollowUpRecord(
  leadId: string,
  record: Omit<FollowUpRecord, 'id' | 'leadId' | 'createdAt'>,
): Promise<ApiResponse<FollowUpRecord | null>> {
  ensureInit();
  await delay(200);
  const leads = getStorageData<Lead[]>(STORAGE_KEYS.LEADS) || [];
  const lead = leads.find((l) => l.id === leadId);
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

/** 刷新 AI 升级概率 */
async function refreshAIAnalysis(leadId: string): Promise<ApiResponse<LeadAIAnalysis | null>> {
  ensureInit();
  await delay(500);
  const leads = getStorageData<Lead[]>(STORAGE_KEYS.LEADS) || [];
  const lead = leads.find((l) => l.id === leadId);
  if (!lead) return createSuccessResponse(null);

  const analysis: LeadAIAnalysis = {
    upgradeProbability: Math.round((0.3 + Math.random() * 0.6) * 100) / 100,
    reasons: [
      '客户互动频繁',
      '预算范围内',
      '决策链清晰',
      '行业匹配度高',
    ].slice(0, 2 + Math.floor(Math.random() * 3)),
    suggestions: [
      '安排产品演示',
      '提供行业案例',
      '推进签约流程',
      '加强跟进频次',
    ].slice(0, 2 + Math.floor(Math.random() * 3)),
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
