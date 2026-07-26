import { backendRequest, shouldUseBackendApi } from './backendClient';
import { createErrorResponse, type ApiResponse } from './types';
import type { BusinessExportModule, BusinessExportRequest, BusinessExportResult } from '../types/businessExport';

export type BrowserBusinessExportRequest = Omit<BusinessExportRequest, 'module'>;

async function requestExport(module: BusinessExportModule, request: BrowserBusinessExportRequest): Promise<ApiResponse<BusinessExportResult>> {
  if (!shouldUseBackendApi()) return createErrorResponse('业务导出需要连接服务端', 503);
  return backendRequest<BusinessExportResult>(`/business-exports/${module}`, {
    method: 'POST', body: JSON.stringify(request),
  });
}

export const businessExportApi = {
  exportOrders: (request: BrowserBusinessExportRequest) => requestExport('orders', request),
  exportOrderSettlements: (request: BrowserBusinessExportRequest) => requestExport('order_settlements', request),
  exportRecoverySettlements: (request: BrowserBusinessExportRequest) => requestExport('recovery_settlements', request),
  exportRecoveryOrders: (request: BrowserBusinessExportRequest) => requestExport('recovery_orders', request),
};
