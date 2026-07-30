import type { Commission, CommissionTier } from '../../types/commission';
import { getCommissionTierBucketKey, selectCurrentCommissionRounds } from './commissionConfiguration';

const INACTIVE_STATUSES = new Set<Commission['status']>([
  '已取消',
  '已撤回',
  '待冲销',
  '已冲销',
]);

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const periodOf = (commission: Commission) => String(commission.paymentDate || commission.createdAt || '').slice(0, 7);
const performanceOf = (commission: Commission) => Number(
  commission.performanceAmount ?? commission.orderAmount ?? 0,
);
const bucketOf = (commission: Commission) => `${periodOf(commission)}::${getCommissionTierBucketKey(commission)}`;

function normalizedTiers(commission: Commission): CommissionTier[] {
  return (commission.payoutPlanSnapshot?.tiers || commission.tierSnapshot?.tiers || [])
    .map((tier) => ({ ...tier }))
    .sort((left, right) => left.minAmount - right.minAmount);
}

/**
 * Returns the current active commission entitlements after recalculating every
 * monthly tier bucket. Paid rows intentionally participate in the calculation:
 * callers compare this expected amount with immutable payout snapshots to derive
 * supplements or recoveries.
 *
 * The input collection and its nested tier snapshots are never mutated.
 */
export function resolveCommissionEntitlements(commissions: Commission[]): Commission[] {
  const active = selectCurrentCommissionRounds(commissions)
    .filter((commission) => !INACTIVE_STATUSES.has(commission.status));
  const monthlyBaseByBucket = new Map<string, number>();

  active.forEach((commission) => {
    if (commission.ruleCalculationType !== 'tiered_percentage') return;
    const key = bucketOf(commission);
    monthlyBaseByBucket.set(key, roundMoney(
      (monthlyBaseByBucket.get(key) || 0) + performanceOf(commission),
    ));
  });

  return active.map((commission) => {
    if (commission.ruleCalculationType !== 'tiered_percentage') return { ...commission };
    const tiers = normalizedTiers(commission);
    if (!tiers.length) return { ...commission };

    const baseAmount = monthlyBaseByBucket.get(bucketOf(commission)) || 0;
    const currentTier = tiers.find((tier) => (
      baseAmount >= tier.minAmount
      && (tier.maxAmount === undefined || baseAmount < tier.maxAmount)
    ));
    const nextTier = tiers.find((tier) => tier.minAmount > baseAmount);
    if (!currentTier) {
      return {
        ...commission,
        tierSnapshot: {
          tiers,
          currentTier: undefined,
          nextTier,
          baseAmount,
          gapToNext: nextTier ? roundMoney(nextTier.minAmount - baseAmount) : 0,
        },
      };
    }

    const performanceAmount = performanceOf(commission);
    const commissionAmount = roundMoney(performanceAmount * currentTier.rate / 100);
    const tierRange = currentTier.maxAmount === undefined
      ? `${currentTier.minAmount} 元以上`
      : `${currentTier.minAmount}-${currentTier.maxAmount} 元`;
    return {
      ...commission,
      commissionRate: currentTier.rate / 100,
      commissionAmount,
      tierSnapshot: {
        tiers,
        currentTier: { ...currentTier },
        nextTier: nextTier ? { ...nextTier } : undefined,
        baseAmount,
        gapToNext: nextTier ? roundMoney(nextTier.minAmount - baseAmount) : 0,
      },
      formulaText: `${commission.role} · ${commission.payoutPlanSnapshot?.name || commission.payoutPlanName || '月度累计阶梯提成'}：本月累计业绩 ${baseAmount} 元，命中 ${tierRange} × ${currentTier.rate}%；本笔业绩 ${performanceAmount} × ${currentTier.rate}% = ${commissionAmount} 元`,
    };
  });
}
