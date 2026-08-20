import { backendRequest, shouldUseBackendApi } from './backendClient';
import { createErrorResponse, createSuccessResponse, type ApiResponse, type PaginatedResponse } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { STORAGE_KEYS } from '../shared/utils/constants';
import type {
  MarketingAccountGroup,
  MarketingAccountGroupInput,
  MarketingContent,
  MarketingContentAction,
  MarketingContentFilters,
  MarketingContentInput,
} from '../types/marketing';
import { assertMarketingContentReadyForPublish, nextMarketingContentStatus } from '../domain/marketing/marketingContent';

const now = () => new Date().toISOString();
const localContents = () => getStorageData<MarketingContent[]>(STORAGE_KEYS.MARKETING_CONTENTS) || [];
const localGroups = () => getStorageData<MarketingAccountGroup[]>(STORAGE_KEYS.MARKETING_ACCOUNT_GROUPS) || [];

function queryString(filters: MarketingContentFilters): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  return params.toString();
}

async function listContents(filters: MarketingContentFilters = {}): Promise<ApiResponse<PaginatedResponse<MarketingContent>>> {
  if (shouldUseBackendApi()) return backendRequest(`/marketing/contents?${queryString(filters)}`);
  const keyword = String(filters.search || '').trim().toLowerCase();
  const rows = localContents()
    .filter((item) => !keyword || [item.title, item.theme, item.copywriting, item.owner].some((value) => String(value || '').toLowerCase().includes(keyword)))
    .filter((item) => !filters.contentType || item.contentType === filters.contentType)
    .filter((item) => !filters.status || item.status === filters.status)
    .filter((item) => !filters.platform || item.platforms.includes(filters.platform))
    .filter((item) => !filters.plannedDate || item.plannedAt?.slice(0, 10) === filters.plannedDate)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const page = Math.max(1, Number(filters.page || 1));
  const pageSize = Math.max(1, Number(filters.pageSize || 10));
  return createSuccessResponse({
    items: rows.slice((page - 1) * pageSize, page * pageSize),
    pagination: { page, pageSize, total: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / pageSize)) },
  });
}

async function createContent(input: MarketingContentInput): Promise<ApiResponse<MarketingContent>> {
  if (shouldUseBackendApi()) return backendRequest('/marketing/contents', { method: 'POST', body: JSON.stringify(input) });
  const timestamp = now();
  const created: MarketingContent = {
    ...input,
    id: `marketing-content-${Date.now()}`,
    theme: input.theme || '', copywriting: input.copywriting || '', imageLinks: input.imageLinks || [],
    owner: input.owner || '当前用户', visibility: input.visibility || 'ALL', status: 'DRAFT', version: 1,
    createdBy: '当前用户', createdAt: timestamp, updatedAt: timestamp,
  };
  setStorageData(STORAGE_KEYS.MARKETING_CONTENTS, [created, ...localContents()]);
  return createSuccessResponse(created);
}

async function updateContent(id: string, input: Partial<MarketingContentInput>): Promise<ApiResponse<MarketingContent>> {
  if (shouldUseBackendApi()) return backendRequest(`/marketing/contents/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) });
  const rows = localContents();
  const current = rows.find((item) => item.id === id);
  if (!current) return createErrorResponse('营销内容不存在', 404);
  const updated = { ...current, ...input, version: current.version + 1, updatedAt: now() };
  setStorageData(STORAGE_KEYS.MARKETING_CONTENTS, rows.map((item) => item.id === id ? updated : item));
  return createSuccessResponse(updated);
}

async function transitionContent(id: string, action: MarketingContentAction, comment = ''): Promise<ApiResponse<MarketingContent>> {
  if (shouldUseBackendApi()) return backendRequest(`/marketing/contents/${encodeURIComponent(id)}/transition`, { method: 'POST', body: JSON.stringify({ action, comment }) });
  const rows = localContents();
  const current = rows.find((item) => item.id === id);
  if (!current) return createErrorResponse('营销内容不存在', 404);
  try {
    if (action === 'SUBMIT' || action === 'APPROVE') assertMarketingContentReadyForPublish({ ...current, status: 'APPROVED' });
    const updated: MarketingContent = { ...current, status: nextMarketingContentStatus(current.status, action), reviewComment: comment || undefined, updatedAt: now() };
    setStorageData(STORAGE_KEYS.MARKETING_CONTENTS, rows.map((item) => item.id === id ? updated : item));
    return createSuccessResponse(updated);
  } catch (error) {
    return createErrorResponse(error instanceof Error ? error.message : '状态更新失败', 400);
  }
}

async function listGroups(): Promise<ApiResponse<MarketingAccountGroup[]>> {
  return shouldUseBackendApi() ? backendRequest('/marketing/account-groups') : createSuccessResponse(localGroups());
}

async function saveGroup(id: string | undefined, input: MarketingAccountGroupInput): Promise<ApiResponse<MarketingAccountGroup>> {
  if (shouldUseBackendApi()) return backendRequest(id ? `/marketing/account-groups/${encodeURIComponent(id)}` : '/marketing/account-groups', { method: id ? 'PUT' : 'POST', body: JSON.stringify(input) });
  const rows = localGroups();
  const current = rows.find((item) => item.id === id);
  const timestamp = now();
  const saved: MarketingAccountGroup = { ...input, tags: input.tags || [], id: current?.id || `marketing-group-${Date.now()}`, createdBy: current?.createdBy || '当前用户', createdAt: current?.createdAt || timestamp, updatedAt: timestamp };
  setStorageData(STORAGE_KEYS.MARKETING_ACCOUNT_GROUPS, current ? rows.map((item) => item.id === current.id ? saved : item) : [saved, ...rows]);
  return createSuccessResponse(saved);
}

async function deleteGroup(id: string): Promise<ApiResponse<boolean>> {
  if (shouldUseBackendApi()) return backendRequest(`/marketing/account-groups/${encodeURIComponent(id)}`, { method: 'DELETE' });
  setStorageData(STORAGE_KEYS.MARKETING_ACCOUNT_GROUPS, localGroups().filter((item) => item.id !== id));
  return createSuccessResponse(true);
}

export const marketingApi = { listContents, createContent, updateContent, transitionContent, listGroups, saveGroup, deleteGroup };
