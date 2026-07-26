import type {
  Commission,
  CommissionPayoutPlan,
  CommissionPayoutPlanSnapshot,
  CommissionTier,
} from '../../types/commission';

function cloneTiers(tiers?: CommissionTier[]): CommissionTier[] | undefined {
  if (!tiers?.length) return undefined;
  return tiers.map((tier) => ({ ...tier }));
}

export function buildCommissionPayoutPlanSnapshot(
  plan: CommissionPayoutPlan,
): CommissionPayoutPlanSnapshot {
  return {
    id: plan.id,
    name: plan.name,
    version: Math.max(1, Number(plan.version) || 1),
    commissionType: plan.commissionType,
    commissionValue: Number(plan.commissionValue) || 0,
    tiers: cloneTiers(plan.tiers),
  };
}

export function getCommissionTierBucketKey(commission: Commission): string {
  const ownerKey = commission.ownerId || `name:${commission.owner}`;
  const planKey = commission.payoutPlanSnapshot?.id || commission.payoutPlanId || 'legacy-plan';
  const version = commission.payoutPlanSnapshot?.version || commission.payoutPlanVersion || 1;
  return `${ownerKey}::${commission.role}::${planKey}::v${version}`;
}

export function resolveCommissionTierSnapshotSource(
  commission: Commission,
  plans: CommissionPayoutPlan[],
): CommissionTier[] {
  const snapshotTiers = commission.payoutPlanSnapshot?.tiers || commission.tierSnapshot?.tiers;
  if (snapshotTiers?.length) return snapshotTiers.map((tier) => ({ ...tier }));
  if (!commission.payoutPlanId) return [];
  const plan = plans.find((item) => item.id === commission.payoutPlanId);
  return plan?.tiers?.map((tier) => ({ ...tier })) || [];
}
