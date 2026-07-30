import { createHash } from 'node:crypto';
import { getCommissionTierBucketKey, isRecoveryCommission, selectCurrentCommissionRounds } from '../../src/shared/utils/commissionConfiguration';
import { resolveCommissionEntitlements } from '../../src/shared/utils/commissionEntitlement';
import type {
  Commission,
  CommissionCorrectionImpact,
  CommissionCorrectionLeg,
  CommissionCorrectionPreview,
  CommissionCorrectionRecord,
  CommissionCorrectionSourceType,
  CommissionPayoutRecord,
} from '../../src/types/commission';

const INACTIVE_STATUSES = new Set<Commission['status']>(['已撤回', '已取消', '待冲销', '已冲销']);
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const periodOf = (commission: Commission | undefined) => String(commission?.paymentDate || commission?.createdAt || '').slice(0, 7);
const ownerKey = (commission: Commission | undefined) => commission?.ownerId || `name:${commission?.owner || ''}`;
const bucketKey = (commission: Commission | undefined) => commission
  ? `${periodOf(commission)}::${getCommissionTierBucketKey(commission)}`
  : '';
const sourceMatches = (commission: Commission, sourceType: CommissionCorrectionSourceType, sourceId: string) => (
  sourceType === 'after_sales_recovery'
    ? (commission.sourceRecoveryOrderId || commission.orderId) === sourceId || isRecoveryCommission(commission) && commission.orderId === sourceId
    : !isRecoveryCommission(commission) && commission.orderId === sourceId
);
const snapshot = (value: Record<string, unknown>) => JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export interface BuildCommissionCorrectionImpactInput {
  sourceBusinessType: CommissionCorrectionSourceType;
  sourceBusinessId: string;
  sourceBusinessNo: string;
  sourceRevision: string;
  beforeBusinessSnapshot: Record<string, unknown>;
  afterBusinessSnapshot: Record<string, unknown>;
  beforeCommissions: Commission[];
  afterCommissions: Commission[];
  payoutRecords: CommissionPayoutRecord[];
}

/**
 * The current engine derives every financial delta from the immutable original
 * payout snapshot. Until prior deltas are netted into a durable balance, a new
 * correction touching the same paid commission must be blocked even when it
 * was triggered by another order in the same monthly tier bucket.
 */
export function findOverlappingFinancialCorrection(
  preview: CommissionCorrectionPreview,
  previous: CommissionCorrectionRecord[],
): CommissionCorrectionRecord | undefined {
  const financialImpactIds = new Set(preview.legs.map((item) => item.impactId));
  if (!financialImpactIds.size) return undefined;
  const affectedCommissionIds = new Set(preview.impacts
    .filter((impact) => financialImpactIds.has(impact.id))
    .map((impact) => impact.sourceCommissionId)
    .filter((id): id is string => Boolean(id)));
  preview.legs.forEach((item) => item.sourceCommissionIds.forEach((id) => affectedCommissionIds.add(id)));
  if (!affectedCommissionIds.size) return undefined;

  return previous.find((record) => {
    if (!record.legs?.length) return false;
    const priorFinancialImpactIds = new Set(record.legs.map((item) => item.impactId));
    return record.impacts.some((impact) => (
      priorFinancialImpactIds.has(impact.id)
      && Boolean(impact.sourceCommissionId)
      && affectedCommissionIds.has(impact.sourceCommissionId!)
    )) || record.legs.some((item) => item.sourceCommissionIds.some((id) => affectedCommissionIds.has(id)));
  });
}

function payoutSnapshotMap(records: CommissionPayoutRecord[]) {
  const snapshots = new Map<string, { commission: Commission; payoutRecordId: string }>();
  records.filter((record) => record.status === '已发放').forEach((record) => {
    (record.commissionSnapshots || []).forEach((commission) => {
      if (snapshots.has(commission.id)) {
        throw new Error(`提成 ${commission.id} 同时出现在多个有效发放单，请先清理重复发放记录`);
      }
      snapshots.set(commission.id, { commission, payoutRecordId: record.id });
    });
  });
  return snapshots;
}

function leg(
  impactId: string,
  kind: CommissionCorrectionLeg['kind'],
  commission: Commission,
  period: string,
  amount: number,
): CommissionCorrectionLeg {
  return {
    id: `leg-${hash([impactId, kind, ownerKey(commission), period]).slice(0, 16)}`,
    impactId,
    kind,
    ownerId: commission.ownerId,
    owner: commission.owner,
    departmentId: commission.departmentId,
    department: commission.department,
    role: commission.role,
    period,
    amount: roundMoney(Math.abs(amount)),
    sourceCommissionIds: [commission.id],
    status: kind === '补发' ? '待发放' : '待处理',
  };
}

export function buildCommissionCorrectionImpact(
  input: BuildCommissionCorrectionImpactInput,
): CommissionCorrectionPreview {
  const beforeRows = resolveCommissionEntitlements(selectCurrentCommissionRounds(input.beforeCommissions));
  const afterRows = resolveCommissionEntitlements(selectCurrentCommissionRounds(input.afterCommissions));
  const beforeById = new Map(beforeRows.map((commission) => [commission.id, commission]));
  const afterById = new Map(afterRows.map((commission) => [commission.id, commission]));
  const payoutSnapshots = payoutSnapshotMap(input.payoutRecords);
  const targetBefore = beforeRows.filter((commission) => sourceMatches(commission, input.sourceBusinessType, input.sourceBusinessId));
  const targetAfter = afterRows.filter((commission) => sourceMatches(commission, input.sourceBusinessType, input.sourceBusinessId));
  const pairedAfterByBeforeId = new Map<string, Commission>();
  const claimedAfterIds = new Set<string>();
  targetBefore
    .filter((commission) => (payoutSnapshots.has(commission.id) || commission.status === '已发放') && !afterById.has(commission.id))
    .sort((left, right) => left.id.localeCompare(right.id))
    .forEach((before) => {
      const candidates = targetAfter
        .filter((after) => !beforeById.has(after.id) && !claimedAfterIds.has(after.id) && after.role === before.role)
        .sort((left, right) => {
          const score = (after: Commission) => (
            (ownerKey(after) === ownerKey(before) ? 8 : 0)
            + (after.commissionRuleId && after.commissionRuleId === before.commissionRuleId ? 4 : 0)
            + (after.productLevel === before.productLevel ? 2 : 0)
            + (after.payoutPlanId && after.payoutPlanId === before.payoutPlanId ? 1 : 0)
          );
          return score(right) - score(left) || left.id.localeCompare(right.id);
        });
      const paired = candidates[0];
      if (!paired) return;
      pairedAfterByBeforeId.set(before.id, paired);
      claimedAfterIds.add(paired.id);
    });
  const affectedBuckets = new Set([...targetBefore, ...targetAfter].map(bucketKey).filter(Boolean));
  const candidateIds = new Set<string>();
  const shouldComparePaidSnapshot = (commissionId: string) => (
    payoutSnapshots.has(commissionId) || beforeById.get(commissionId)?.status === '已发放'
  );
  [...targetBefore, ...targetAfter].forEach((commission) => {
    if (!claimedAfterIds.has(commission.id) && shouldComparePaidSnapshot(commission.id)) candidateIds.add(commission.id);
  });
  beforeRows.forEach((commission) => {
    if (affectedBuckets.has(bucketKey(commission)) && shouldComparePaidSnapshot(commission.id)) candidateIds.add(commission.id);
  });
  afterRows.forEach((commission) => {
    if (!claimedAfterIds.has(commission.id) && affectedBuckets.has(bucketKey(commission)) && shouldComparePaidSnapshot(commission.id)) candidateIds.add(commission.id);
  });

  const impacts: CommissionCorrectionImpact[] = [];
  const legs: CommissionCorrectionLeg[] = [];
  [...candidateIds].sort().forEach((commissionId) => {
    const before = beforeById.get(commissionId);
    const after = afterById.get(commissionId) || pairedAfterByBeforeId.get(commissionId);
    const paid = payoutSnapshots.get(commissionId);
    const targetCommission = after || before;
    if (!targetCommission) return;
    const isTarget = Boolean(
      before && sourceMatches(before, input.sourceBusinessType, input.sourceBusinessId)
      || after && sourceMatches(after, input.sourceBusinessType, input.sourceBusinessId),
    );
    if (before?.status === '已发放' && !paid) {
      if (isTarget || affectedBuckets.has(bucketKey(before))) {
        throw new Error(`已发放提成 ${before.id} 缺少逐笔发放快照，无法安全计算更正差额`);
      }
      return;
    }
    const original = paid?.commission || before;
    const originalPaidAmount = paid ? Number(paid.commission.commissionAmount || 0) : 0;
    const correctedEntitlementAmount = after && !INACTIVE_STATUSES.has(after.status)
      ? Number(after.commissionAmount || 0)
      : 0;
    const ownerChanged = Boolean(paid && after && ownerKey(original) !== ownerKey(after));
    const originalPeriod = periodOf(original);
    const correctedPeriod = periodOf(after || original);
    const deltaAmount = roundMoney(correctedEntitlementAmount - originalPaidAmount);
    const changed = ownerChanged
      || Math.abs(deltaAmount) >= 0.01
      || originalPeriod !== correctedPeriod
      || isTarget;
    if (!changed) return;
    const impactId = `impact-${hash([input.sourceBusinessId, commissionId, originalPeriod, correctedPeriod]).slice(0, 16)}`;
    const action: CommissionCorrectionImpact['action'] = ownerChanged
      ? '人员调整'
      : deltaAmount > 0.009
        ? '补发'
        : deltaAmount < -0.009
          ? '追回'
          : '无需差额';
    const impact: CommissionCorrectionImpact = {
      id: impactId,
      sourceCommissionId: commissionId,
      role: targetCommission.role,
      originalOwnerId: original?.ownerId,
      originalOwner: original?.owner || '-',
      originalDepartmentId: original?.departmentId,
      originalDepartment: original?.department,
      correctedOwnerId: after?.ownerId,
      correctedOwner: after?.owner || '-',
      correctedDepartmentId: after?.departmentId,
      correctedDepartment: after?.department,
      originalPeriod,
      correctedPeriod,
      originalPaidAmount: roundMoney(originalPaidAmount),
      correctedEntitlementAmount: roundMoney(correctedEntitlementAmount),
      deltaAmount,
      action,
      payoutRecordIds: paid ? [paid.payoutRecordId] : [],
      tierAffected: before?.ruleCalculationType === 'tiered_percentage' || after?.ruleCalculationType === 'tiered_percentage',
    };
    impacts.push(impact);
    if (ownerChanged && original && after) {
      if (originalPaidAmount > 0) legs.push(leg(impactId, '追回', original, originalPeriod, originalPaidAmount));
      if (correctedEntitlementAmount > 0) legs.push(leg(impactId, '补发', after, correctedPeriod, correctedEntitlementAmount));
    } else if (deltaAmount > 0.009 && after) {
      legs.push(leg(impactId, '补发', after, correctedPeriod, deltaAmount));
    } else if (deltaAmount < -0.009 && original) {
      legs.push(leg(impactId, '追回', original, originalPeriod, -deltaAmount));
    }
  });

  const affectedPeriods = [...new Set(impacts.flatMap((impact) => [impact.originalPeriod, impact.correctedPeriod]).filter(Boolean))].sort();
  const originalPaidAmount = roundMoney(impacts.reduce((sum, impact) => sum + impact.originalPaidAmount, 0));
  const correctedEntitlementAmount = roundMoney(impacts.reduce((sum, impact) => sum + impact.correctedEntitlementAmount, 0));
  const supplementAmount = roundMoney(legs.filter((item) => item.kind === '补发').reduce((sum, item) => sum + item.amount, 0));
  const recoverAmount = roundMoney(legs.filter((item) => item.kind === '追回').reduce((sum, item) => sum + item.amount, 0));
  const previewCore = {
    sourceBusinessType: input.sourceBusinessType,
    sourceBusinessId: input.sourceBusinessId,
    sourceBusinessNo: input.sourceBusinessNo,
    sourceRevision: input.sourceRevision,
    beforeBusinessSnapshot: snapshot(input.beforeBusinessSnapshot),
    afterBusinessSnapshot: snapshot(input.afterBusinessSnapshot),
    affectedPeriods,
    impacts,
    legs,
  };
  return {
    ...previewCore,
    affectedEmployeeCount: new Set(impacts.flatMap((impact) => [impact.originalOwnerId || impact.originalOwner, impact.correctedOwnerId || impact.correctedOwner])).size,
    affectedCommissionCount: impacts.length,
    originalPaidAmount,
    correctedEntitlementAmount,
    supplementAmount,
    recoverAmount,
    impactHash: hash(previewCore),
  };
}
