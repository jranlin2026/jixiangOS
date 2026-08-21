import { backendRequest } from './backendClient';
import type { ApiResponse } from './types';
import type {
  AiCitation,
  DailyReview,
  EmployeeTask,
  EnterpriseAiConversation,
  EnterpriseCockpit,
  Paginated,
  PositionStandardDetail,
  TaskTemplate,
} from '../types/enterpriseBrain';

const base = '/enterprise-brain';
const query = (input: Record<string, unknown>) => {
  const params = new URLSearchParams();
  Object.entries(input).forEach(([key, value]) => { if (value !== undefined && value !== null && value !== '') params.set(key, String(value)); });
  return params.toString();
};

export const enterpriseBrainApi = {
  getMyStandard: (): Promise<ApiResponse<PositionStandardDetail>> => backendRequest(`${base}/standards/me`),
  listStandards: (): Promise<ApiResponse<PositionStandardDetail[]>> => backendRequest(`${base}/standards`),
  saveStandardDraft: (input: Record<string, unknown>): Promise<ApiResponse<PositionStandardDetail>> => backendRequest(`${base}/standards/drafts`, { method: 'POST', body: JSON.stringify(input) }),
  publishStandard: (versionId: string): Promise<ApiResponse<PositionStandardDetail>> => backendRequest(`${base}/standards/versions/${encodeURIComponent(versionId)}/publish`, { method: 'POST' }),
  listTemplates: (positionId?: string): Promise<ApiResponse<TaskTemplate[]>> => backendRequest(`${base}/task-templates?${query({ positionId })}`),
  saveTemplate: (input: Record<string, unknown>): Promise<ApiResponse<TaskTemplate>> => backendRequest(`${base}/task-templates`, { method: 'POST', body: JSON.stringify(input) }),
  generateTasks: (date: string): Promise<ApiResponse<{ date: string; candidateCount: number; createdCount: number; skippedCount: number }>> => backendRequest(`${base}/tasks/generate`, { method: 'POST', body: JSON.stringify({ date }) }),
  listMyTasks: (input: Record<string, unknown>): Promise<ApiResponse<Paginated<EmployeeTask>>> => backendRequest(`${base}/tasks/mine?${query(input)}`),
  listTeamTasks: (input: Record<string, unknown>): Promise<ApiResponse<Paginated<EmployeeTask>>> => backendRequest(`${base}/tasks/team?${query(input)}`),
  listLinkedTasks: (input: Record<string, unknown>): Promise<ApiResponse<Paginated<EmployeeTask>>> => backendRequest(`${base}/tasks/linked?${query(input)}`),
  listInterventionSupervisors: (customerId: string): Promise<ApiResponse<Array<{ id: string; name: string; positionName?: string }>>> => backendRequest(`${base}/tasks/intervention-supervisors?${query({ customerId })}`),
  assignTask: (input: Record<string, unknown>): Promise<ApiResponse<EmployeeTask>> => backendRequest(`${base}/tasks/assign`, { method: 'POST', body: JSON.stringify(input) }),
  completeTask: (id: string, input: Record<string, unknown>): Promise<ApiResponse<EmployeeTask>> => backendRequest(`${base}/tasks/${encodeURIComponent(id)}/complete`, { method: 'POST', body: JSON.stringify(input) }),
  confirmTask: (id: string, input: Record<string, unknown>): Promise<ApiResponse<EmployeeTask>> => backendRequest(`${base}/tasks/${encodeURIComponent(id)}/confirm`, { method: 'POST', body: JSON.stringify(input) }),
  submitReview: (input: Record<string, unknown>): Promise<ApiResponse<DailyReview>> => backendRequest(`${base}/reviews`, { method: 'POST', body: JSON.stringify(input) }),
  listTeamReviews: (input: Record<string, unknown>): Promise<ApiResponse<Paginated<DailyReview>>> => backendRequest(`${base}/reviews/team?${query(input)}`),
  listConversations: (): Promise<ApiResponse<EnterpriseAiConversation[]>> => backendRequest(`${base}/ai/conversations`),
  getConversation: (id: string): Promise<ApiResponse<EnterpriseAiConversation>> => backendRequest(`${base}/ai/conversations/${encodeURIComponent(id)}`),
  deleteConversation: (id: string): Promise<ApiResponse<boolean>> => backendRequest(`${base}/ai/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  ask: (input: { conversationId?: string; question: string }): Promise<ApiResponse<{ conversationId: string; answer: string; citations: AiCitation[]; outcome: 'ANSWERED' | 'NO_EVIDENCE' }>> => backendRequest(`${base}/ai/query`, { method: 'POST', body: JSON.stringify(input) }),
  getCockpit: (input: { dateFrom: string; dateTo: string }): Promise<ApiResponse<EnterpriseCockpit>> => backendRequest(`${base}/cockpit?${query(input)}`),
};
