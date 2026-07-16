type StoredItem = Record<string, unknown>;

export interface LegacyRepairPlan {
  current: number;
  legacy: number;
  missing: number;
  merged: StoredItem[];
}

function itemRecordId(item: StoredItem, index: number): string {
  return String(item.id || item.orderNo || item.refundNo || item.applicationNo || `legacy-${index}`);
}

/**
 * Builds an additive migration plan. Current structured rows always win over
 * legacy snapshots, so applying the plan cannot overwrite newer server data.
 */
export function buildLegacyRepairPlan(
  currentRows: Array<{ recordId: string; data: unknown }>,
  legacyValue: unknown,
): LegacyRepairPlan {
  const current = currentRows
    .filter((row) => row.data && typeof row.data === 'object' && !Array.isArray(row.data))
    .map((row) => ({ recordId: row.recordId, data: row.data as StoredItem }));
  const legacy = Array.isArray(legacyValue)
    ? legacyValue.filter((item): item is StoredItem => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : [];
  const seen = new Set(current.map((row) => row.recordId));
  const missing = legacy.filter((item, index) => {
    const recordId = itemRecordId(item, index);
    if (seen.has(recordId)) return false;
    seen.add(recordId);
    return true;
  });

  return {
    current: current.length,
    legacy: legacy.length,
    missing: missing.length,
    merged: [...current.map((row) => row.data), ...missing],
  };
}
