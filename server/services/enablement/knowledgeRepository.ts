import type {
  KnowledgeDocumentDetailDto,
  KnowledgeDocumentDto,
  KnowledgeWorkflowItemDto,
} from '../../../src/types/enablement';
import type { DraftKnowledgeChunk, SearchableKnowledgeChunk } from './knowledgeSearchProvider';

export type KnowledgeVersionRecord = {
  id: string;
  documentId: string;
  versionNumber: number;
  status: string;
  sourceFileName: string;
  sourceReference?: string;
  checksum: string;
  contentText: string;
  effectiveAt?: Date | null;
  expiresAt?: Date | null;
};

/**
 * Persistence boundary for knowledge lifecycle operations. Implementations must
 * make transition, review, and publication methods atomic compare-and-set work.
 */
export interface KnowledgeRepository {
  createDraft(input: Record<string, unknown>): Promise<{ document: KnowledgeDocumentDto; version: KnowledgeVersionRecord }>;
  createVersion(documentId: string, input: Record<string, unknown>): Promise<{ document: KnowledgeDocumentDto; version: KnowledgeVersionRecord } | null>;
  findVersion(id: string): Promise<KnowledgeVersionRecord | null>;
  findDocument(id: string): Promise<KnowledgeDocumentDto | null>;
  findCurrentDetail(id: string, now: Date): Promise<KnowledgeDocumentDetailDto | null>;
  findDepartment(id: string): Promise<{ id: string; managerId?: string | null } | null>;
  transitionVersion(versionId: string, allowedFrom: string[], nextStatus: string): Promise<boolean>;
  reviewAtomic(input: {
    versionId: string;
    expectedStatus: 'PENDING_REVIEW';
    reviewerUserId: string;
    decision: 'APPROVE' | 'REJECT';
    comment?: string;
    nextStatus: 'APPROVED' | 'REJECTED';
  }): Promise<boolean>;
  publishAtomic(input: {
    version: KnowledgeVersionRecord;
    publisherUserId: string;
    chunks: DraftKnowledgeChunk[];
    now: Date;
  }): Promise<KnowledgeDocumentDto | null>;
  retireAtomic(documentId: string, actorUserId: string, now: Date): Promise<boolean>;
  listVisibleCurrent(now: Date): Promise<KnowledgeDocumentDto[]>;
  listReviewQueue(): Promise<KnowledgeWorkflowItemDto[]>;
  listPublicationQueue(): Promise<KnowledgeWorkflowItemDto[]>;
  listSearchableChunks(now: Date): Promise<SearchableKnowledgeChunk[]>;
}
