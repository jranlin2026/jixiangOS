import type {
  CommissionPayoutRecord,
  CommissionPayoutWorkspace,
  IssueCommissionPayoutInput,
} from '../types/commission';
import type { ApiResponse } from './types';
import { createErrorResponse } from './types';
import {
  backendRequest,
  shouldUseBackendApi,
  syncBackendStorageScopeFromServer,
} from './backendClient';

async function requireBackend<T>(request: () => Promise<ApiResponse<T>>): Promise<ApiResponse<T>> {
  if (!shouldUseBackendApi()) return createErrorResponse('提成发放需要连接服务器后使用', 503);
  return request();
}

async function fetchPendingWorkspace(): Promise<ApiResponse<CommissionPayoutWorkspace>> {
  return requireBackend(() => backendRequest<CommissionPayoutWorkspace>('/commission-payout-workspace?scope=pending'));
}

async function fetchRecordsWorkspace(): Promise<ApiResponse<CommissionPayoutWorkspace>> {
  return requireBackend(() => backendRequest<CommissionPayoutWorkspace>('/commission-payout-workspace?scope=records'));
}

async function fetchPeriodWorkspace(period: string): Promise<ApiResponse<CommissionPayoutWorkspace>> {
  return requireBackend(() => backendRequest<CommissionPayoutWorkspace>(
    `/commission-payout-workspace?period=${encodeURIComponent(period)}`,
  ));
}

async function issue(input: IssueCommissionPayoutInput): Promise<ApiResponse<CommissionPayoutRecord>> {
  const response = await requireBackend(() => backendRequest<CommissionPayoutRecord>('/commission-payouts/issue', {
    method: 'POST',
    body: JSON.stringify(input),
  }));
  if (response.code === 0) await syncBackendStorageScopeFromServer('commissions', 0);
  return response;
}

async function reverse(id: string, reason: string): Promise<ApiResponse<CommissionPayoutRecord>> {
  const response = await requireBackend(() => backendRequest<CommissionPayoutRecord>(
    `/commission-payout-records/${encodeURIComponent(id)}/reverse`,
    { method: 'POST', body: JSON.stringify({ reason }) },
  ));
  if (response.code === 0) await syncBackendStorageScopeFromServer('commissions', 0);
  return response;
}

export const commissionPayoutApi = {
  fetchPendingWorkspace,
  fetchRecordsWorkspace,
  fetchPeriodWorkspace,
  issue,
  reverse,
};
