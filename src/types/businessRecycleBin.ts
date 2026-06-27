import type { ID, Timestamp } from './common';

export type BusinessRecycleBinType = 'lead' | 'customer' | 'order';

export interface BusinessRecycleBinItem {
  id: ID;
  type: BusinessRecycleBinType;
  title: string;
  subtitle?: string;
  owner?: string;
  deletedAt: Timestamp;
  deletedBy?: string;
  deleteReason?: string;
  relationStatus: string;
}

export interface BusinessRecycleBinFilters {
  type?: BusinessRecycleBinType | 'all';
  search?: string;
  page?: number;
  pageSize?: number;
}

