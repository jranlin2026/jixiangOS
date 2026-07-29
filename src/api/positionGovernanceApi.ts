import type { ApiResponse } from './types';
import { backendRequest, shouldUseBackendApi } from './backendClient';
import { createErrorResponse } from './types';
import type { EmployeePositionHistory, PositionGovernanceReadiness, PositionGovernanceReadinessStatus, PositionMappingBatch } from '../types/positionGovernance';

function backendRequired<T>(): ApiResponse<T> {
  return createErrorResponse('历史岗位治理需要启用服务端数据库');
}

export const positionGovernanceApi = {
  getReadiness(filters: { departmentId?: string; search?: string; employmentStatus?: string; status?: PositionGovernanceReadinessStatus; warning?: 'ROLE_POSITION_SUSPECTED'; page?: number; pageSize?: number } = {}) {
    if (!shouldUseBackendApi()) return Promise.resolve(backendRequired<PositionGovernanceReadiness>());
    const query = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') query.set(key, String(value));
    });
    return backendRequest<PositionGovernanceReadiness>(`/settings/position-governance/readiness?${query.toString()}`);
  },
  createPreview(filters: { departmentId?: string; search?: string; employmentStatus?: string } = {}) {
    if (!shouldUseBackendApi()) return Promise.resolve(backendRequired<PositionMappingBatch>());
    return backendRequest<PositionMappingBatch>('/settings/position-governance/previews', {
      method: 'POST', body: JSON.stringify(filters),
    });
  },
  getBatch(id: string) {
    if (!shouldUseBackendApi()) return Promise.resolve(backendRequired<PositionMappingBatch | null>());
    return backendRequest<PositionMappingBatch | null>(`/settings/position-governance/batches/${encodeURIComponent(id)}`);
  },
  applyBatch(id: string, selections: Array<{ employeeId: string; positionId: string }>) {
    if (!shouldUseBackendApi()) return Promise.resolve(backendRequired<PositionMappingBatch>());
    return backendRequest<PositionMappingBatch>(`/settings/position-governance/batches/${encodeURIComponent(id)}/apply`, {
      method: 'POST', body: JSON.stringify({ selections }),
    });
  },
  listHistory(filters: { employeeId?: string; changeType?: string; page?: number; pageSize?: number } = {}) {
    if (!shouldUseBackendApi()) return Promise.resolve(backendRequired<{ items: EmployeePositionHistory[]; total: number; page: number; pageSize: number }>());
    const query = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') query.set(key, String(value));
    });
    return backendRequest<{ items: EmployeePositionHistory[]; total: number; page: number; pageSize: number }>(`/settings/position-history?${query.toString()}`);
  },
};
