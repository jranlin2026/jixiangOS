import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { applyRecoveryCommissionBusinessTimes } from '../../src/shared/utils/commissionConfiguration';
import type { Commission } from '../../src/types/commission';
import type { RecoveryOrder } from '../../src/types/recoveryOrder';

export function enrichCommissionStorageScope(
  data: Record<string, unknown>,
  recoveryOrders: RecoveryOrder[],
): Record<string, unknown> {
  const commissions = data[STORAGE_KEYS.COMMISSIONS];
  if (!Array.isArray(commissions)) return data;
  return {
    ...data,
    [STORAGE_KEYS.COMMISSIONS]: applyRecoveryCommissionBusinessTimes(
      commissions as Commission[],
      recoveryOrders,
    ),
  };
}
