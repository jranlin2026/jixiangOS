import type { CustomerFilters } from './customer';

export const CUSTOMER_IMPORT_MAX_ROWS = 2_000;

export type CustomerImportDestination = 'assigned' | 'public_pool';

export const CUSTOMER_IMPORT_HEADERS = [
  '客户姓名*',
  '手机号',
  '微信',
  '公司名称',
  '销售负责人',
  '客户进度',
  '客户等级',
  '线索来源',
  '行业',
  '城市',
  '客户标签',
  '备注',
] as const;

export type CustomerImportRow = {
  rowNumber: number;
  name: string;
  phone: string;
  wechat: string;
  company: string;
  ownerName: string;
  lifecycleStatus: string;
  customerLevel: string;
  leadSource: string;
  industry: string;
  city: string;
  tagNames: string;
  remark: string;
};

export type CustomerImportRowResult = {
  rowNumber: number;
  name: string;
  status: 'ready' | 'blocked' | 'imported' | 'failed';
  reason: string;
  customerId?: string;
};

export type CustomerImportPrecheckResult = {
  confirmationToken: string;
  expiresAt: string;
  totalCount: number;
  readyCount: number;
  blockedCount: number;
  rows: CustomerImportRowResult[];
};

export type CustomerImportConfirmResult = {
  totalCount: number;
  successCount: number;
  failureCount: number;
  rows: CustomerImportRowResult[];
};

export type CustomerImportTemplateOptions = {
  ownerNames: string[];
  lifecycleStatuses: string[];
  customerLevels: string[];
  leadSources: string[];
  tagNames: string[];
  canOverrideAttribution: boolean;
  canImportToPublicPool: boolean;
};

export type CustomerExportSelection =
  | { mode: 'ids'; customerIds: string[] }
  | { mode: 'filter_snapshot'; filters: CustomerFilters };

export type CustomerExportRequest = {
  selection: CustomerExportSelection;
  includeSensitive: boolean;
  reason: string;
};

export type CustomerExportRow = Record<string, string | number>;

export type CustomerExportResult = {
  fileName: string;
  includeSensitive: boolean;
  rows: CustomerExportRow[];
};
