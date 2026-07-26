import type {
  Commission,
  CommissionPayoutPlan,
  CommissionTier,
  CommissionTierSnapshot,
} from '../../types/commission';

const EXCLUDED_TIER_STATUSES = new Set<Commission['status']>(['已撤回', '待冲销', '已冲销']);

export function countsTowardMineTierBase(commission: Commission): boolean {
  return commission.ruleCalculationType === 'tiered_percentage'
    && !EXCLUDED_TIER_STATUSES.has(commission.status);
}

function findLiveTierPlan(
  commissions: Commission[],
  payoutPlans: CommissionPayoutPlan[],
): CommissionPayoutPlan | undefined {
  const planIds = new Set(commissions.map((commission) => commission.payoutPlanId).filter(Boolean));
  const planNames = new Set(commissions.map((commission) => commission.payoutPlanName).filter(Boolean));
  return payoutPlans.find((plan) => (
    plan.isActive
    && plan.commissionType === 'tiered_percentage'
    && (planIds.has(plan.id) || planNames.has(plan.name))
    && Boolean(plan.tiers?.length)
  ));
}

function normalizeTiers(tiers: CommissionTier[]): CommissionTier[] {
  return tiers.slice().sort((left, right) => left.minAmount - right.minAmount);
}

export function resolveMineTierSnapshot(
  commissions: Commission[],
  payoutPlans: CommissionPayoutPlan[],
  useLivePlan: boolean,
): CommissionTierSnapshot | undefined {
  const tierSource = commissions.find((commission) => commission.tierSnapshot?.tiers?.length);
  const snapshotSource = commissions.find((commission) => commission.payoutPlanSnapshot?.tiers?.length);
  const candidateLivePlan = useLivePlan && commissions.every((commission) => commission.status !== '已发放')
    ? findLiveTierPlan(commissions, payoutPlans)
    : undefined;
  const recordedVersion = snapshotSource?.payoutPlanSnapshot?.version || snapshotSource?.payoutPlanVersion;
  const livePlan = candidateLivePlan && (!recordedVersion || Number(candidateLivePlan.version || 1) === recordedVersion)
    ? candidateLivePlan
    : undefined;
  const tiers = normalizeTiers(livePlan?.tiers || snapshotSource?.payoutPlanSnapshot?.tiers || tierSource?.tierSnapshot?.tiers || []);
  const monthlyBase = commissions
    .filter(countsTowardMineTierBase)
    .reduce((sum, commission) => sum + Number(commission.performanceAmount || commission.orderAmount || 0), 0);

  if (!tiers.length) return tierSource?.tierSnapshot;

  const currentTier = tiers.find((tier) => (
    monthlyBase >= tier.minAmount
    && (tier.maxAmount === undefined || monthlyBase < tier.maxAmount)
  ));
  const nextTier = tiers.find((tier) => tier.minAmount > monthlyBase);

  return {
    tiers,
    currentTier,
    nextTier,
    baseAmount: monthlyBase,
    gapToNext: nextTier ? Math.round((nextTier.minAmount - monthlyBase) * 100) / 100 : 0,
  };
}

type MineCommissionIdentityInput =
  | { kind: 'individual'; customerName?: string; orderNo?: string }
  | { kind: 'tiered'; orderCount: number };

export function buildMineCommissionIdentity(
  input: MineCommissionIdentityInput,
): { primary: string; secondary: string } {
  if (input.kind === 'tiered') {
    return {
      primary: '多订单汇总',
      secondary: `${input.orderCount} 个订单参与月度累计`,
    };
  }
  return {
    primary: input.customerName?.trim() || '未命名客户',
    secondary: input.orderNo?.trim() || '-',
  };
}

export function buildMineTieredCommissionItems(commissions: Commission[]): Array<{
  commission: Commission;
  identity: { primary: string; secondary: string };
}> {
  return commissions.map((commission) => ({
    commission,
    identity: buildMineCommissionIdentity({
      kind: 'individual',
      customerName: commission.customerName,
      orderNo: commission.orderNo,
    }),
  }));
}

export function getMineCommissionBusinessTime(
  commission: Pick<Commission, 'paymentDate' | 'createdAt'>,
): string {
  return commission.paymentDate || commission.createdAt || '';
}

export function compareMineCommissionBusinessTime(
  left: Pick<Commission, 'paymentDate' | 'createdAt'>,
  right: Pick<Commission, 'paymentDate' | 'createdAt'>,
): number {
  return new Date(getMineCommissionBusinessTime(right)).getTime()
    - new Date(getMineCommissionBusinessTime(left)).getTime();
}
