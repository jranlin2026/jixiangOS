export const BUSINESS_IMPORT_MAX_ROWS = 5_000;

export type BusinessImportType = 'orders' | 'recovery_orders';
export type BusinessImportRowStatus = 'ready' | 'warning' | 'blocked';

export type OrderImportRow = {
  rowNumber: number;
  customerName: string;
  customerPhone: string;
  customerWechat: string;
  productName: string;
  orderType: string;
  paymentChannel: string;
  paymentAmount: string | number;
  paidAt: string;
  paymentOrderNo?: string;
  salesUserName: string;
  creatorName?: string;
  notes?: string;
  thirdPartyOrderNo: string;
  remark: string;
};

export type RecoveryImportRow = {
  rowNumber: number;
  customerName: string;
  customerPhone: string;
  customerWechat: string;
  originalProduct: string;
  sourcePlatform: string;
  sourceShop: string;
  paymentChannel: string;
  originalAmount: string | number;
  recoveryAmount: string | number;
  recoveryAt: string;
  paymentOrderNo?: string;
  paymentAt?: string;
  recoveryUserName: string;
  assistUserName?: string;
  creatorName?: string;
  thirdPartyOrderNo: string;
  remark: string;
};

export type BusinessImportRow = OrderImportRow | RecoveryImportRow;

export type BusinessImportRequest = {
  type: BusinessImportType;
  rows: BusinessImportRow[];
};

export type BusinessImportConfirmRequest = BusinessImportRequest & {
  confirmationToken: string;
  fileName: string;
};

export type BusinessImportRowResult = {
  rowNumber: number;
  status: BusinessImportRowStatus;
  reason: string;
};

export type BusinessImportPrecheckResult = {
  confirmationToken: string;
  expiresAt: string;
  totalCount: number;
  readyCount: number;
  warningCount: number;
  blockedCount: number;
  rows: BusinessImportRowResult[];
};

export type BusinessImportJobResult = {
  id: string;
  type: BusinessImportType;
  status: 'queued';
  totalCount: number;
  failedCount?: number;
};

export type BusinessImportTemplateOptions = {
  products: Array<{ id: string; name: string; level?: string }>;
  orderTypes: Array<{ id: string; name: string }>;
  paymentChannels: string[];
  users: Array<{ id: string; name: string }>;
  recoveryPlatforms: Array<{ id: string; name: string }>;
  recoveryShops: Array<{ id: string; platformId: string; name: string }>;
};
