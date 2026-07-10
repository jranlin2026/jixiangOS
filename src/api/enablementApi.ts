import { backendRequest } from './backendClient';
import type { ApiResponse } from './types';
import type {
  CreateKnowledgeDraftInput,
  CreateKnowledgeVersionInput,
  KnowledgeDocumentDetailDto,
  KnowledgeDocumentDto,
  KnowledgeSearchHit,
  KnowledgeWorkflowItemDto,
} from '../types/enablement';

const base = '/enablement/knowledge';

export const enablementApi = {
  listKnowledge(): Promise<ApiResponse<KnowledgeDocumentDto[]>> {
    return backendRequest(base);
  },
  searchKnowledge(query: string): Promise<ApiResponse<KnowledgeSearchHit[]>> {
    return backendRequest(`${base}/search?query=${encodeURIComponent(query)}`);
  },
  getKnowledge(id: string): Promise<ApiResponse<KnowledgeDocumentDetailDto>> {
    return backendRequest(`${base}/${encodeURIComponent(id)}`);
  },
  createDraft(input: CreateKnowledgeDraftInput): Promise<ApiResponse<KnowledgeWorkflowItemDto>> {
    return backendRequest(`${base}/drafts`, { method: 'POST', body: JSON.stringify(input) });
  },
  createVersion(documentId: string, input: CreateKnowledgeVersionInput): Promise<ApiResponse<KnowledgeWorkflowItemDto>> {
    return backendRequest(`${base}/${encodeURIComponent(documentId)}/versions`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  submitForReview(versionId: string): Promise<ApiResponse<boolean>> {
    return backendRequest(`${base}/versions/${encodeURIComponent(versionId)}/submit-review`, { method: 'POST' });
  },
  reviewVersion(
    versionId: string,
    input: { decision: 'APPROVE' | 'REJECT'; comment?: string },
  ): Promise<ApiResponse<boolean>> {
    return backendRequest(`${base}/versions/${encodeURIComponent(versionId)}/review`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  publishVersion(versionId: string): Promise<ApiResponse<KnowledgeDocumentDto>> {
    return backendRequest(`${base}/versions/${encodeURIComponent(versionId)}/publish`, { method: 'POST' });
  },
  retireDocument(documentId: string): Promise<ApiResponse<boolean>> {
    return backendRequest(`${base}/${encodeURIComponent(documentId)}/retire`, { method: 'POST' });
  },
  listReviewQueue(): Promise<ApiResponse<KnowledgeWorkflowItemDto[]>> {
    return backendRequest(`${base}/review-queue`);
  },
  listPublicationQueue(): Promise<ApiResponse<KnowledgeWorkflowItemDto[]>> {
    return backendRequest(`${base}/publication-queue`);
  },
};
