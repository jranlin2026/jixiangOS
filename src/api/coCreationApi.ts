import { backendRequest } from './backendClient';
import type { ApiResponse } from './types';
import type { CoCreationRequestDto, InterviewTurnDto } from '../types/coCreation';

const base = '/co-creation/requests';

export const coCreationApi = {
  list(): Promise<ApiResponse<CoCreationRequestDto[]>> { return backendRequest(base); },
  get(id: string): Promise<ApiResponse<CoCreationRequestDto>> { return backendRequest(`${base}/${encodeURIComponent(id)}`); },
  create(title: string): Promise<ApiResponse<CoCreationRequestDto>> {
    return backendRequest(base, { method: 'POST', body: JSON.stringify({ title }) });
  },
  interview(id: string, answer: string): Promise<ApiResponse<InterviewTurnDto>> {
    return backendRequest(`${base}/${encodeURIComponent(id)}/interview`, { method: 'POST', body: JSON.stringify({ answer }) });
  },
  confirmBrief(id: string): Promise<ApiResponse<boolean>> {
    return backendRequest(`${base}/${encodeURIComponent(id)}/employee-confirmation`, { method: 'POST' });
  },
  confirmFacts(id: string, confirmed: boolean, comment: string): Promise<ApiResponse<boolean>> {
    return backendRequest(`${base}/${encodeURIComponent(id)}/fact-confirmation`, { method: 'POST', body: JSON.stringify({ confirmed, comment }) });
  },
  decideValidation(id: string, decision: 'APPROVE_VALIDATION' | 'DEFER' | 'MERGE' | 'REJECT', reason: string): Promise<ApiResponse<boolean>> {
    return backendRequest(`${base}/${encodeURIComponent(id)}/validation-decision`, { method: 'POST', body: JSON.stringify({ decision, reason }) });
  },
  saveValidation(id: string, input: Record<string, unknown>): Promise<ApiResponse<boolean>> {
    return backendRequest(`${base}/${encodeURIComponent(id)}/validation`, { method: 'PUT', body: JSON.stringify(input) });
  },
};
