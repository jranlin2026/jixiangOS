export type PositionMappingMatchStatus = 'UNIQUE_MATCH' | 'MULTIPLE_MATCHES' | 'DEPARTMENT_CONFLICT' | 'NO_MATCH';
export type PositionMappingApplyStatus = 'PENDING' | 'APPLIED' | 'FAILED';
export type PositionGovernanceReadinessStatus = 'BOUND_VALID' | 'INVALID_BINDING' | PositionMappingMatchStatus;

export interface PositionGovernanceReadinessItem {
  employeeId: string;
  employeeName: string;
  departmentId?: string;
  departmentName?: string;
  employmentStatus: string;
  roleId?: string;
  roleName: string;
  originalPositionName: string;
  boundPositionId?: string;
  boundPositionName?: string;
  suggestedPositionId?: string;
  candidatePositionIds: string[];
  status: PositionGovernanceReadinessStatus;
  warnings: Array<'ROLE_POSITION_SUSPECTED'>;
  reason: string;
}

export interface PositionGovernanceReadiness {
  items: PositionGovernanceReadinessItem[];
  total: number;
  page: number;
  pageSize: number;
  summary: {
    total: number;
    boundValid: number;
    invalidBinding: number;
    uniqueMatch: number;
    multipleMatches: number;
    departmentConflict: number;
    noMatch: number;
    rolePositionSuspected: number;
  };
}

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

export interface PositionGovernanceReconciliationItem {
  employeeId: string;
  employeeName: string;
  departmentId?: string;
  originalPositionName: string;
  currentPositionId?: string;
  currentPositionName?: string;
  applyStatus: PositionMappingApplyStatus;
  reason: string;
}

export interface PositionGovernanceReconciliation {
  batchId: string;
  batchStatus: PositionMappingBatch['status'];
  summary: {
    totalCount: number;
    migrationTargetCount: number;
    baselineAvailable: boolean;
    existingEmployeeCountBefore: number;
    existingEmployeeCount: number;
    activeEmployeeCountBefore: number;
    activeEmployeeCount: number;
    coveredCount: number;
    unresolvedCount: number;
    historyCount: number;
    departmentCountBefore: number;
    departmentCountAfter: number;
    employmentStatusChangedCount: number;
    departmentChangedCount: number;
    roleChangedCount: number;
    rolePositionSuspectedCountBefore: number;
    rolePositionSuspectedCount: number;
    coverageRate: number;
    passed: boolean;
  };
  items: PositionGovernanceReconciliationItem[];
  total: number;
  page: number;
  pageSize: number;
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
