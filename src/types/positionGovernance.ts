export type PositionMappingMatchStatus = 'UNIQUE_MATCH' | 'MULTIPLE_MATCHES' | 'DEPARTMENT_CONFLICT' | 'NO_MATCH';
export type PositionMappingApplyStatus = 'PENDING' | 'APPLIED' | 'FAILED';

export interface PositionMappingItem {
  id: string;
  employeeId: string;
  employeeName: string;
  departmentId?: string;
  departmentName?: string;
  originalPositionName: string;
  suggestedPositionId?: string;
  candidatePositionIds: string[];
  confirmedPositionId?: string;
  matchStatus: PositionMappingMatchStatus;
  applyStatus: PositionMappingApplyStatus;
  failureReason?: string;
}

export interface PositionMappingBatch {
  id: string;
  status: 'PREVIEW' | 'PARTIAL' | 'APPLIED';
  totalCount: number;
  matchedCount: number;
  conflictCount: number;
  appliedCount: number;
  failedCount: number;
  createdAt: string;
  confirmedAt?: string;
  items: PositionMappingItem[];
}

export interface EmployeePositionHistory {
  id: string;
  employeeId: string;
  employeeName: string;
  changeType: string;
  oldDepartmentName?: string;
  newDepartmentName?: string;
  oldPositionName?: string;
  newPositionName?: string;
  reason?: string;
  source: string;
  changedByName: string;
  changedAt: string;
}
