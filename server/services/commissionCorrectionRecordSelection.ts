import type { CommissionCorrectionRecord } from '../../src/types/commission';

const sourceKey = (record: CommissionCorrectionRecord) => (
  `${record.sourceBusinessType}:${record.sourceBusinessId}`
);

const createdTime = (record: CommissionCorrectionRecord): number => {
  const value = new Date(record.createdAt).getTime();
  return Number.isFinite(value) ? value : 0;
};

/**
 * Selects the current correction caliber for each source business record.
 * Historical records remain untouched for audit callers; equal timestamps use
 * the immutable record id only as a deterministic tie-breaker.
 */
export function selectLatestCommissionCorrections(
  records: CommissionCorrectionRecord[],
): CommissionCorrectionRecord[] {
  const latestBySource = new Map<string, CommissionCorrectionRecord>();
  records.forEach((record) => {
    const key = sourceKey(record);
    const current = latestBySource.get(key);
    if (!current
      || createdTime(record) > createdTime(current)
      || createdTime(record) === createdTime(current) && record.id.localeCompare(current.id) > 0) {
      latestBySource.set(key, record);
    }
  });
  return [...latestBySource.values()];
}
