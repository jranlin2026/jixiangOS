import type {
  Commission,
  CommissionPayoutPlan,
  CommissionPayoutPlanSnapshot,
  CommissionTier,
} from '../../types/commission';
import type { RecoveryOrder } from '../../types/recoveryOrder';

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

const INACTIVE_COMMISSION_STATUSES = new Set<Commission['status']>([
  '已撤回',
  '已取消',
  '待冲销',
  '已冲销',
]);

export function isRecoveryCommission(commission: Commission): boolean {
  return commission.sourceBusinessType === 'after_sales_recovery'
    || commission.sourceBusinessType === 'refund_recovery'
    || Boolean(commission.sourceRecoveryOrderId)
    || String(commission.orderNo || '').startsWith('RCV-');
}

/**
 * 售后挽回提成按业务实际发生的挽回成交时间归月。
 * 历史记录可能曾把分账创建时间写入 paymentDate，因此读取时以源挽回单快照纠正；
 * 正式订单及无法关联源挽回单的记录保持不变。
 */
export function applyRecoveryCommissionBusinessTimes(
  commissions: Commission[],
  recoveryOrders: RecoveryOrder[],
): Commission[] {
  const recoveryAtById = new Map(recoveryOrders
    .filter((order) => Boolean(order.id && order.recoveryAt))
    .map((order) => [order.id, order.recoveryAt]));

  return commissions.map((commission) => {
    if (!isRecoveryCommission(commission)) return commission;
    const recoveryId = commission.sourceRecoveryOrderId || commission.orderId;
    const recoveryAt = recoveryAtById.get(recoveryId);
    return recoveryAt && recoveryAt !== commission.paymentDate
      ? { ...commission, paymentDate: recoveryAt }
      : commission;
  });
}

/**
 * 正式订单和售后挽回重新分账都会保留旧轮次用于审计，当前月报和发放工作台只读取最新轮次。
 * 同一轮次既有活动明细又有历史撤回明细时，以活动明细为准。
 */
export function selectCurrentCommissionRounds(commissions: Commission[]): Commission[] {
  const businessGroups = new Map<string, Commission[]>();
  commissions.forEach((commission) => {
    const businessType = isRecoveryCommission(commission) ? 'recovery' : 'formal';
    const businessId = commission.sourceRecoveryOrderId || commission.orderId || commission.orderNo;
    const key = `${businessType}:${businessId}`;
    businessGroups.set(key, [...(businessGroups.get(key) || []), commission]);
  });

  const selectedIds = new Set<string>();
  businessGroups.forEach((rows) => {
    const latestVersion = Math.max(...rows.map((row) => Math.max(1, Number(row.settlementVersion || 1))));
    const recovery = rows.some(isRecoveryCommission);
    if (!recovery && latestVersion === 1) {
      rows.forEach((row) => selectedIds.add(row.id));
      return;
    }
    const latest = rows.filter((row) => Math.max(1, Number(row.settlementVersion || 1)) === latestVersion);
    const active = latest.filter((row) => !INACTIVE_COMMISSION_STATUSES.has(row.status));
    (active.length ? active : latest).forEach((row) => selectedIds.add(row.id));
  });

  return commissions.filter((commission) => selectedIds.has(commission.id));
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
