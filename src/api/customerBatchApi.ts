import { backendRequest } from './backendClient';
import type { ApiResponse } from './types';
import type {
  CreateCustomerBatchJobRequest,
  CustomerBatchJobItemView,
  CustomerBatchJobResultView,
  CustomerBatchJobSummary,
  CustomerBatchPrecheckRequest,
  CustomerBatchPrecheckResult,
} from '../types/customerBatch';

const ROOT = '/customer-batch-jobs';

/**
 * Browser callers deliberately have no handler/hash/count/version/guard
 * fields. Those values belong to the server-created precheck only.
 */
export type CustomerBatchBrowserPrecheckRequest = Omit<CustomerBatchPrecheckRequest, 'handlerKey'>;

function browserPrecheckPayload(input: CustomerBatchBrowserPrecheckRequest) {
  return {
    operation: input.operation,
    selection: input.selection,
    input: input.input,
    reason: input.reason,
  };
}

export const customerBatchApi = {
  precheck(input: CustomerBatchBrowserPrecheckRequest): Promise<ApiResponse<CustomerBatchPrecheckResult>> {
    return backendRequest<CustomerBatchPrecheckResult>(`${ROOT}/precheck`, {
      method: 'POST',
      body: JSON.stringify(browserPrecheckPayload(input)),
    });
  },

  createJob(input: CreateCustomerBatchJobRequest): Promise<ApiResponse<CustomerBatchJobSummary>> {
    return backendRequest<CustomerBatchJobSummary>(ROOT, {
      method: 'POST',
      body: JSON.stringify({
        precheckToken: input.precheckToken,
        idempotencyKey: input.idempotencyKey,
      }),
    });
  },

  list(): Promise<ApiResponse<CustomerBatchJobSummary[]>> {
    return backendRequest<CustomerBatchJobSummary[]>(ROOT);
  },

  get(id: string): Promise<ApiResponse<CustomerBatchJobSummary>> {
    return backendRequest<CustomerBatchJobSummary>(`${ROOT}/${encodeURIComponent(id)}`);
  },

  listItems(id: string): Promise<ApiResponse<CustomerBatchJobItemView[]>> {
    return backendRequest<CustomerBatchJobItemView[]>(`${ROOT}/${encodeURIComponent(id)}/items`);
  },

  getResult(id: string): Promise<ApiResponse<CustomerBatchJobResultView>> {
    return backendRequest<CustomerBatchJobResultView>(`${ROOT}/${encodeURIComponent(id)}/result`);
  },

  cancel(id: string): Promise<ApiResponse<CustomerBatchJobSummary>> {
    return backendRequest<CustomerBatchJobSummary>(`${ROOT}/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
  },
};
