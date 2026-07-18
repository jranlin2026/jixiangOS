export interface GuardSnapshot {
  revision: number;
  auditWatermark: string;
  updatedAt: string;
}

export interface MergeGuardManifest {
  customers: Record<string, GuardSnapshot>;
  associations: Record<string, GuardSnapshot>;
  mergedAt: string;
}

export function isUndoDeadlineOpen(now: Date, mergedAt: Date): boolean {
  return now.getTime() <= mergedAt.getTime() + 72 * 60 * 60 * 1_000;
}

export function compareGuardSnapshot(expected: GuardSnapshot, actual: GuardSnapshot): string[] {
  const conflicts: string[] = [];
  if (expected.revision !== actual.revision) conflicts.push('ROW_REVISION_CHANGED');
  if (expected.auditWatermark !== actual.auditWatermark) conflicts.push('AUDIT_WATERMARK_CHANGED');
  if (expected.updatedAt !== actual.updatedAt) conflicts.push('UPDATED_AT_CHANGED');
  return conflicts;
}
