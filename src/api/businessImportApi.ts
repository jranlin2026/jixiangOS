import { backendRequest } from './backendClient';
import type { ApiResponse } from './types';
import type {
  BusinessImportJobResult,
  BusinessImportPrecheckResult,
  BusinessImportReviewRequest,
  BusinessImportReviewResult,
  BusinessImportRow,
  BusinessImportTemplateOptions,
  BusinessImportType,
} from '../types/businessImport';

const ROOT = '/business-imports';

function modulePath(type: BusinessImportType): string {
  return type === 'orders' ? 'orders' : 'recovery-orders';
}

export const businessImportApi = {
  templateOptions(type: BusinessImportType): Promise<ApiResponse<BusinessImportTemplateOptions>> {
    return backendRequest(`${ROOT}/${modulePath(type)}/template-options`);
  },
  precheck(type: BusinessImportType, rows: BusinessImportRow[]): Promise<ApiResponse<BusinessImportPrecheckResult>> {
    return backendRequest(`${ROOT}/${modulePath(type)}/precheck`, {
      method: 'POST', body: JSON.stringify({ rows }),
    });
  },
  confirm(
    type: BusinessImportType,
    rows: BusinessImportRow[],
    confirmationToken: string,
    fileName: string,
  ): Promise<ApiResponse<BusinessImportJobResult>> {
    return backendRequest(`${ROOT}/${modulePath(type)}/confirm`, {
      method: 'POST', body: JSON.stringify({ rows, confirmationToken, fileName }),
    });
  },
  job(id: string, signal?: AbortSignal): Promise<ApiResponse<BusinessImportJobResult>> {
    return backendRequest(`${ROOT}/jobs/${encodeURIComponent(id)}`, { signal });
  },
  review(request: BusinessImportReviewRequest): Promise<ApiResponse<BusinessImportReviewResult>> {
    return backendRequest(`${ROOT}/reviews`, {
      method: 'POST',
      body: JSON.stringify(request),
    });
  },
};
