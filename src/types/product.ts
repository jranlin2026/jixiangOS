import type { ID, Timestamp, ProductLevel } from './common';

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
