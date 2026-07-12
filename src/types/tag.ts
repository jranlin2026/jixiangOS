import type { ID, Timestamp } from './common';

/** 标签分类 */
export type TagCategory = '行业' | '属性' | '行为' | '价值' | '其他';

export type ManualTagScope = 'lead' | 'customer' | 'both';
export type ManualTagSelectionMode = 'single' | 'multiple';
export type CustomerTagFilterMode = 'grouped' | 'any' | 'all';

export interface CustomerTagGroup {
  id: ID;
  name: string;
  color: string;
  selectionMode: ManualTagSelectionMode;
  scope: ManualTagScope;
  isActive: boolean;
  sortOrder: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** 客户标签 */
export interface CustomerTag {
  id: ID;
  groupId: ID;
  name: string;
  color?: string;
  isActive: boolean;
  sortOrder: number;
  usageCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CustomerTagCatalog {
  groups: CustomerTagGroup[];
  tags: CustomerTag[];
}

export interface CustomerTagMigrationPreview {
  customerCount: number;
  leadCount: number;
  assignmentCount: number;
  missingNames: string[];
  ambiguousNameCount: number;
  ambiguousNames: Array<{
    name: string;
    tagIds: ID[];
    groupIds: ID[];
  }>;
  checksum: string;
}

/** 标签筛选参数 */
export interface TagFilters {
  search?: string;
  category?: TagCategory;
  isActive?: boolean;
}
