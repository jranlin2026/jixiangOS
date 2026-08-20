export type MarketingContentType = 'MOMENTS' | 'SHORT_VIDEO' | 'GRAPHIC';
export type MarketingContentStatus = 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'RETIRED';
export type MarketingContentAction = 'SUBMIT' | 'APPROVE' | 'REJECT' | 'RETIRE';

export interface MarketingContent {
  id: string;
  title: string;
  contentType: MarketingContentType;
  theme: string;
  platforms: string[];
  copywriting: string;
  imageLinks: string[];
  videoUrl?: string;
  coverUrl?: string;
  ownerId?: string;
  owner: string;
  plannedAt?: string;
  expiresAt?: string;
  visibility: 'ALL' | 'DEPARTMENT';
  departmentId?: string;
  department?: string;
  usageNotes?: string;
  status: MarketingContentStatus;
  version: number;
  reviewComment?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface MarketingContentInput {
  title: string;
  contentType: MarketingContentType;
  theme?: string;
  platforms: string[];
  copywriting?: string;
  imageLinks?: string[];
  videoUrl?: string;
  coverUrl?: string;
  ownerId?: string;
  owner?: string;
  plannedAt?: string;
  expiresAt?: string;
  visibility?: 'ALL' | 'DEPARTMENT';
  departmentId?: string;
  department?: string;
  usageNotes?: string;
}

export interface MarketingAccountGroup {
  id: string;
  name: string;
  platform: string;
  tags: string[];
  accountIds: string[];
  remark?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface MarketingAccountGroupInput {
  name: string;
  platform: string;
  tags?: string[];
  accountIds: string[];
  remark?: string;
}

export interface MarketingContentFilters {
  search?: string;
  contentType?: string;
  status?: string;
  platform?: string;
  plannedDate?: string;
  page?: number;
  pageSize?: number;
}

export interface MarketingPublishInput {
  contentId: string;
  title: string;
  dueAt: string;
  plannedAt?: string;
  groupIds: string[];
  accountIds: string[];
  remark?: string;
}
