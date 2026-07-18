import { backendRequest } from './backendClient';
import type { ApiResponse } from './types';
import type {
  CustomerMergeExecutionInput,
  CustomerMergeLedgerView,
  CustomerMergePrecheckInput,
  CustomerMergePrecheckResult,
  CustomerMergeUndoPrecheckResult,
} from '../types/customerMerge';

export interface CustomerDuplicateGroupView {
  id: string;
  rule: string;
  confidence: string;
  status: string;
  customerIds: string[];
  createdAt: string;
}

export function buildMergeExecutionRequest(input: CustomerMergeExecutionInput): CustomerMergeExecutionInput {
  return {
    mainCustomerId: input.mainCustomerId,
    secondaryCustomerIds: input.secondaryCustomerIds,
    fieldDecisions: input.fieldDecisions,
    tagDecision: input.tagDecision,
    reason: input.reason,
    precheckToken: input.precheckToken,
    idempotencyKey: input.idempotencyKey,
  };
}

export const customerMergeApi = {
  listCandidates(): Promise<ApiResponse<CustomerDuplicateGroupView[]>> {
    return backendRequest('/customer-duplicates');
  },
  createManualCandidate(customerIds: string[]): Promise<ApiResponse<CustomerDuplicateGroupView>> {
    return backendRequest('/customer-duplicates/manual', { method: 'POST', body: JSON.stringify({ customerIds }) });
  },
  precheck(input: CustomerMergePrecheckInput): Promise<ApiResponse<CustomerMergePrecheckResult>> {
    return backendRequest('/customer-merges/precheck', { method: 'POST', body: JSON.stringify(input) });
  },
  execute(input: CustomerMergeExecutionInput): Promise<ApiResponse<CustomerMergeLedgerView>> {
    return backendRequest('/customer-merges', { method: 'POST', body: JSON.stringify(buildMergeExecutionRequest(input)) });
  },
  listHistory(): Promise<ApiResponse<CustomerMergeLedgerView[]>> {
    return backendRequest('/customer-merges');
  },
  getHistory(id: string): Promise<ApiResponse<CustomerMergeLedgerView>> {
    return backendRequest(`/customer-merges/${encodeURIComponent(id)}`);
  },
  undoPrecheck(id: string): Promise<ApiResponse<CustomerMergeUndoPrecheckResult>> {
    return backendRequest(`/customer-merges/${encodeURIComponent(id)}/undo-precheck`, { method: 'POST', body: '{}' });
  },
  undo(id: string, precheckToken: string, idempotencyKey: string): Promise<ApiResponse<CustomerMergeLedgerView>> {
    return backendRequest(`/customer-merges/${encodeURIComponent(id)}/undo`, {
      method: 'POST', body: JSON.stringify({ precheckToken, idempotencyKey }),
    });
  },
};
