import type { ID, Timestamp, ProductLevel } from './common';

/** 产品等级/业务分类配置 */
export interface ProductLevelConfig {
  id: ID;
  name: ProductLevel;
  color: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** 产品 */
export interface Product {
  id: ID;
  name: string;
  level: ProductLevel;
  price: number;
  originalPrice?: number;
  description: string;
  features: string[];
  deliveryStages: string[];
  isActive: boolean;
  sortOrder: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
