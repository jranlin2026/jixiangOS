export const POSITION_DEPARTMENT_SCOPES = ['DEPARTMENT_ONLY', 'DEPARTMENT_TREE'] as const;

export type PositionDepartmentScope = typeof POSITION_DEPARTMENT_SCOPES[number];

type DepartmentNode = {
  id: string;
  parentId?: string | null;
};

type PositionScope = {
  departmentId?: string | null;
  departmentScope?: string | null;
};

export function normalizePositionDepartmentScope(value: unknown): PositionDepartmentScope {
  return value === 'DEPARTMENT_TREE' ? 'DEPARTMENT_TREE' : 'DEPARTMENT_ONLY';
}

export function isPositionApplicableToDepartment(
  position: PositionScope,
  employeeDepartmentId: string | null | undefined,
  departments: DepartmentNode[],
): boolean {
  const ownerDepartmentId = position.departmentId || null;
  if (!ownerDepartmentId) return true;
  if (!employeeDepartmentId) return false;
  if (ownerDepartmentId === employeeDepartmentId) return true;
  if (normalizePositionDepartmentScope(position.departmentScope) !== 'DEPARTMENT_TREE') return false;

  const parentByDepartmentId = new Map(departments.map((department) => [department.id, department.parentId || null]));
  const visited = new Set<string>();
  let currentDepartmentId: string | null = employeeDepartmentId;
  while (currentDepartmentId && !visited.has(currentDepartmentId)) {
    visited.add(currentDepartmentId);
    const parentId: string | null = parentByDepartmentId.get(currentDepartmentId) || null;
    if (parentId === ownerDepartmentId) return true;
    currentDepartmentId = parentId;
  }
  return false;
}
