import type {
  CommissionPayoutRecord,
  CommissionPayoutWorkspace,
  IssueCommissionPayoutInput,
} from '../types/commission';
import type { ApiResponse } from './types';
import { createErrorResponse } from './types';
import {
  backendRequest,
  getBackendBaseUrl,
  readBackendToken,
  shouldUseBackendApi,
  syncBackendStorageScopeFromServer,
} from './backendClient';

export interface CommissionMonthlyReportExportInput {
  period: string;
  reason: string;
  scope: 'all' | 'department' | 'employee';
  departmentId?: string;
  ownerId?: string;
  includeWithdrawn: boolean;
}

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

function downloadFilename(header: string | null, fallback: string): string {
  const encoded = header?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (!encoded) return fallback;
  try { return decodeURIComponent(encoded); } catch { return fallback; }
}

async function downloadMonthlyReport(input: CommissionMonthlyReportExportInput): Promise<void> {
  if (!shouldUseBackendApi()) throw new Error('提成月度报告需要连接服务器后导出');
  const token = readBackendToken();
  const response = await fetch(`${getBackendBaseUrl()}/commission-payout-reports/export`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(body?.message || '提成月度报告导出失败');
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = downloadFilename(response.headers.get('content-disposition'), `极享OS-员工提成月度核对表-${input.period}.xlsx`);
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const commissionPayoutApi = {
  fetchPendingWorkspace,
  fetchRecordsWorkspace,
  fetchPeriodWorkspace,
  issue,
  reverse,
  downloadMonthlyReport,
};
