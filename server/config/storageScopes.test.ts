import assert from 'node:assert/strict';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { getScopedStorageKeys } from './storageScopes';

const commissionKeys = getScopedStorageKeys('commissions');
assert.deepEqual(commissionKeys, [
  STORAGE_KEYS.COMMISSIONS,
  STORAGE_KEYS.COMMISSION_OPERATION_LOGS,
  STORAGE_KEYS.COMMISSION_SETTLEMENT_BATCHES,
]);
assert.equal(
  commissionKeys?.some((key: string) => key === STORAGE_KEYS.RECOVERY_ORDERS),
  false,
  'commission pages must not hydrate the large recovery-order payload',
);

const financeFlowKeys = getScopedStorageKeys('finance-flow');
assert.deepEqual(financeFlowKeys, [
  STORAGE_KEYS.ORDERS,
  STORAGE_KEYS.COMMISSIONS,
  STORAGE_KEYS.REFUNDS,
  STORAGE_KEYS.FINANCE,
]);
assert.equal(
  financeFlowKeys?.some((key: string) => key === STORAGE_KEYS.RECOVERY_ORDERS),
  false,
  'finance-flow pages must not hydrate recovery evidence',
);

assert.equal(getScopedStorageKeys('unknown'), undefined);
