import type { ID, Timestamp } from './common';

/** 标签分类 */
export type TagCategory = '行业' | '属性' | '行为' | '价值' | '其他';

/** 客户标签 */
export interface CustomerTag {
  id: ID;
  name: string;
  category: TagCategory;
  color: string;
  usageCount: number;
  isActive: boolean;
  createdAt: Timestamp;
}

/** 标签筛选参数 */
export interface TagFilters {
  search?: string;
  category?: TagCategory;
  isActive?: boolean;
}
