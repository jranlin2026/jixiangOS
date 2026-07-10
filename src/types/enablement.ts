export const KNOWLEDGE_VERSION_STATUS = {
  DRAFT: 'DRAFT',
  PENDING_REVIEW: 'PENDING_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CURRENT: 'CURRENT',
  RETIRED: 'RETIRED',
  PUBLISH_FAILED: 'PUBLISH_FAILED',
} as const;

export type KnowledgeVersionStatus = typeof KNOWLEDGE_VERSION_STATUS[keyof typeof KNOWLEDGE_VERSION_STATUS];
export type KnowledgeSensitivity = 'INTERNAL' | 'DEPARTMENT' | 'MANAGEMENT' | 'FINANCE' | 'CUSTOMER';
export type VisibilitySubjectType = 'ALL_EMPLOYEES' | 'DEPARTMENT' | 'ROLE' | 'POSITION';

export interface KnowledgeVisibilityDto {
  id: string;
  subjectType: VisibilitySubjectType;
  subjectId?: string;
}

export interface KnowledgeVersionDto {
  id: string;
  documentId: string;
  versionNumber: number;
  status: KnowledgeVersionStatus;
  sourceFileName: string;
  checksum: string;
  effectiveAt?: string;
  expiresAt?: string;
  publishedAt?: string;
  publishedById?: string;
  createdAt: string;
}

export interface KnowledgeDocumentDto {
  id: string;
  slug: string;
  title: string;
  category: string;
  summary: string;
  ownerDepartmentId: string;
  ownerUserId?: string;
  sensitivity: KnowledgeSensitivity;
  currentVersionId?: string;
  visibility: KnowledgeVisibilityDto[];
  currentVersion?: KnowledgeVersionDto;
  latestVersion?: KnowledgeVersionDto;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeDocumentDetailDto extends KnowledgeDocumentDto {
  contentText: string;
}

export interface KnowledgeWorkflowItemDto {
  document: KnowledgeDocumentDto;
  version: KnowledgeVersionDto;
  contentText: string;
}

export interface KnowledgeSearchHit {
  documentId: string;
  versionId: string;
  title: string;
  heading?: string;
  excerpt: string;
  score: number;
  versionNumber: number;
  updatedAt: string;
}

export interface CreateKnowledgeDraftInput {
  slug: string;
  title: string;
  category: string;
  summary: string;
  ownerDepartmentId?: string;
  ownerUserId?: string;
  sensitivity: KnowledgeSensitivity;
  visibility: Array<{ subjectType: VisibilitySubjectType; subjectId?: string }>;
  sourceFileName: string;
  markdown: string;
  effectiveAt?: string;
  expiresAt?: string;
}

export type CreateKnowledgeVersionInput = Omit<
  CreateKnowledgeDraftInput,
  'slug' | 'title' | 'category' | 'summary' | 'ownerDepartmentId' | 'ownerUserId' | 'sensitivity' | 'visibility'
>;
