import type { UpgradeOpportunity, UpgradeFilters, UpgradeFollowUp } from '../types/upgrade';
import type { ApiResponse, PaginatedResponse } from './types';
import { createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { STORAGE_KEYS, DEFAULT_PAGE_SIZE, PRODUCT_TO_CUSTOMER_LEVEL } from '../shared/utils/constants';
import { initializeMockData } from './mock';
import { v4 as uuidv4 } from 'uuid';

function ensureInit(): void {
  initializeMockData();
}

async function getOpportunities(filters?: UpgradeFilters): Promise<ApiResponse<PaginatedResponse<UpgradeOpportunity>>> {
  ensureInit();
  await delay(200);
  const all = getStorageData<UpgradeOpportunity[]>(STORAGE_KEYS.UPGRADE_POOL) || [];
  let filtered = [...all];

  if (filters?.search) {
    const q = filters.search.toLowerCase();
    filtered = filtered.filter((o) => o.customerName.toLowerCase().includes(q));
  }
  if (filters?.status) {
    filtered = filtered.filter((o) => o.status === filters.status);
  }
  if (filters?.currentLevel) {
    filtered = filtered.filter((o) => o.currentLevel === filters.currentLevel);
  }
  if (filters?.minProbability !== undefined) {
    filtered = filtered.filter((o) => o.probability >= filters.minProbability!);
  }
  if (filters?.ownerName) {
    filtered = filtered.filter((o) => o.ownerName === filters.ownerName);
  }

  // 按 AI 评分降序排列
  filtered.sort((a, b) => b.probability - a.probability);

  const page = filters?.page || 1;
  const pageSize = filters?.pageSize || DEFAULT_PAGE_SIZE;
  const total = filtered.length;
  const totalPages = Math.ceil(total / pageSize);
  const items = filtered.slice((page - 1) * pageSize, page * pageSize);

  return createSuccessResponse({ items, pagination: { page, pageSize, total, totalPages } });
}

async function getOpportunityById(id: string): Promise<ApiResponse<UpgradeOpportunity | null>> {
  ensureInit();
  await delay(150);
  const opportunities = getStorageData<UpgradeOpportunity[]>(STORAGE_KEYS.UPGRADE_POOL) || [];
  return createSuccessResponse(opportunities.find((o) => o.id === id) || null);
}

/** AI 评分刷新 — V1 用规则引擎模拟 */
async function refreshOpportunities(): Promise<ApiResponse<UpgradeOpportunity[]>> {
  ensureInit();
  await delay(500);
  const opportunities = getStorageData<UpgradeOpportunity[]>(STORAGE_KEYS.UPGRADE_POOL) || [];

  // 简单规则引擎：基于现有概率做微调
  for (const opp of opportunities) {
    // 模拟 AI 评分波动 ±5%
    const delta = Math.round((Math.random() - 0.5) * 10);
    opp.probability = Math.max(10, Math.min(99, opp.probability + delta));
    opp.aiAnalyzedAt = new Date().toISOString();
    opp.updatedAt = new Date().toISOString();
  }

  setStorageData(STORAGE_KEYS.UPGRADE_POOL, opportunities);
  return createSuccessResponse(opportunities);
}

async function addFollowUp(opportunityId: string, content: string, createdBy: string): Promise<ApiResponse<UpgradeFollowUp | null>> {
  ensureInit();
  await delay(200);
  const opportunities = getStorageData<UpgradeOpportunity[]>(STORAGE_KEYS.UPGRADE_POOL) || [];
  const opp = opportunities.find((o) => o.id === opportunityId);
  if (!opp) return createSuccessResponse(null);

  const record: UpgradeFollowUp = {
    id: uuidv4(),
    content,
    createdBy,
    createdAt: new Date().toISOString(),
  };
  opp.followUpRecords.unshift(record);
  opp.followUpCount += 1;
  opp.lastFollowUpAt = record.createdAt;
  opp.updatedAt = new Date().toISOString();

  setStorageData(STORAGE_KEYS.UPGRADE_POOL, opportunities);
  return createSuccessResponse(record);
}

async function convertOpportunity(id: string): Promise<ApiResponse<UpgradeOpportunity | null>> {
  ensureInit();
  await delay(300);
  const opportunities = getStorageData<UpgradeOpportunity[]>(STORAGE_KEYS.UPGRADE_POOL) || [];
  const idx = opportunities.findIndex((o) => o.id === id);
  if (idx === -1) return createSuccessResponse(null);

  opportunities[idx].status = '已转化';
  opportunities[idx].updatedAt = new Date().toISOString();
  setStorageData(STORAGE_KEYS.UPGRADE_POOL, opportunities);
  return createSuccessResponse(opportunities[idx]);
}

export const upgradeApi = {
  getOpportunities,
  getOpportunityById,
  refreshOpportunities,
  addFollowUp,
  convertOpportunity,
};
