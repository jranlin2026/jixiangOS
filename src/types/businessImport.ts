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

export type BusinessImportExecutionStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export type BusinessImportMetadata = {
  importBatchId: string;
  importRowNumber: number;
  importedById: string;
  importedByName: string;
  importedAt: string;
  targetCreatorId: string;
  targetCreatorName: string;
  importWarnings?: string[];
};

export type BusinessImportJobRow = BusinessImportRowResult & {
  normalized: BusinessImportRow;
  customerId?: string;
  executionStatus?: BusinessImportExecutionStatus;
  recordId?: string;
  errorMessage?: string;
};

export type BusinessImportJobExecution = {
  id: string;
  batchId: string;
  type: BusinessImportType;
  status: BusinessImportExecutionStatus | 'partial_failed';
  actorId: string;
  actorName: string;
  totalCount: number;
  successCount: number;
  failedCount: number;
  leaseOwner?: string | null;
  leaseEpoch: number;
  leaseExpiresAt?: string | Date | null;
  startedAt?: string | Date | null;
  finishedAt?: string | Date | null;
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
  batchId: string;
  type: BusinessImportType;
  status: BusinessImportJobExecution['status'];
  totalCount: number;
  successCount?: number;
  failedCount?: number;
  rows?: BusinessImportJobRow[];
  failedRowSample?: BusinessImportJobRow[];
};

export type BusinessImportBatchResult = {
  id: string;
  type: BusinessImportType;
  status: string;
  sourceFileName?: string;
  totalCount: number;
  readyCount: number;
  warningCount: number;
  blockedCount: number;
  createdAt: string;
  jobs: BusinessImportJobResult[];
};

export type BusinessImportReviewAction = 'approve' | 'return' | 'reject';
export type BusinessImportReviewRequest = {
  module: BusinessImportType;
  action: BusinessImportReviewAction;
  ids?: string[];
  importBatchId?: string;
  reason?: string;
};
export type BusinessImportReviewItemResult = { id: string; success: boolean; code: number; message: string };
export type BusinessImportReviewResult = {
  totalCount: number;
  successCount: number;
  failedCount: number;
  results: BusinessImportReviewItemResult[];
};

export type BusinessImportTemplateOptions = {
  products: Array<{ id: string; name: string; level?: string }>;
  orderTypes: Array<{ id: string; name: string }>;
  paymentChannels: string[];
  users: Array<{ id: string; name: string }>;
  recoveryPlatforms: Array<{ id: string; name: string }>;
  recoveryShops: Array<{ id: string; platformId: string; name: string }>;
};
