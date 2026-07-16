import { STORAGE_KEYS } from '../../src/shared/utils/constants';

const scopedStorageKeys: Readonly<Record<string, readonly string[]>> = {
  assets: [
    STORAGE_KEYS.ASSET_DEVICES,
    STORAGE_KEYS.ASSET_PHONE_NUMBERS,
    STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS,
    STORAGE_KEYS.ASSET_RISKS,
    STORAGE_KEYS.ASSET_OPERATION_LOGS,
    STORAGE_KEYS.ASSET_OFFBOARDING_TASKS,
    STORAGE_KEYS.ASSET_MATRIX_PUBLISH_TASKS,
  ],
  commissions: [
    STORAGE_KEYS.COMMISSIONS,
    STORAGE_KEYS.COMMISSION_OPERATION_LOGS,
    STORAGE_KEYS.COMMISSION_SETTLEMENT_BATCHES,
  ],
  'finance-flow': [
    STORAGE_KEYS.ORDERS,
    STORAGE_KEYS.COMMISSIONS,
    STORAGE_KEYS.REFUNDS,
    STORAGE_KEYS.FINANCE,
  ],
};

export function getScopedStorageKeys(scope: string): readonly string[] | undefined {
  return scopedStorageKeys[scope];
}
