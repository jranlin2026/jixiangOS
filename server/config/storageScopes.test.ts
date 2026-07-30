import assert from 'node:assert/strict';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import type { Commission } from '../../src/types/commission';
import type { RecoveryOrder } from '../../src/types/recoveryOrder';
import { enrichCommissionStorageScope } from '../services/commissionBusinessTimeService';
import { getScopedStorageKeys } from './storageScopes';

const commissionKeys = getScopedStorageKeys('commissions');
assert.deepEqual(commissionKeys, [
  STORAGE_KEYS.COMMISSIONS,
  STORAGE_KEYS.COMMISSION_OPERATION_LOGS,
  STORAGE_KEYS.COMMISSION_SETTLEMENT_BATCHES,
  STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES,
  STORAGE_KEYS.COMMISSION_CORRECTIONS,
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

const formalCommission = {
  id: 'formal-commission', orderId: 'formal-order', orderNo: 'ORD-1',
  paymentDate: '2026-07-20T08:00:00.000Z', createdAt: '2026-07-20T08:00:00.000Z',
} as Commission;
const recoveryCommission = {
  id: 'recovery-commission', orderId: 'recovery-order', orderNo: 'RCV-1',
  sourceRecoveryOrderId: 'recovery-order', sourceBusinessType: 'after_sales_recovery',
  paymentDate: '2026-07-25T12:36:40.000Z', createdAt: '2026-07-25T12:36:40.000Z',
} as Commission;
const enriched = enrichCommissionStorageScope({
  [STORAGE_KEYS.COMMISSIONS]: [formalCommission, recoveryCommission],
  [STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES]: [],
}, [{ id: 'recovery-order', recoveryAt: '2026-06-15T08:00:00.000Z' } as RecoveryOrder]);
const enrichedCommissions = enriched[STORAGE_KEYS.COMMISSIONS] as Commission[];
assert.equal(enrichedCommissions[0].paymentDate, formalCommission.paymentDate, '正式订单付款时间不得被售后规则修改');
assert.equal(enrichedCommissions[1].paymentDate, '2026-06-15T08:00:00.000Z', '历史售后提成必须按挽回成交时间纠正归月');
assert.equal(
  Object.prototype.hasOwnProperty.call(enriched, STORAGE_KEYS.RECOVERY_ORDERS),
  false,
  '提成作用域只返回纠正后的提成，不能把售后订单证据载荷下发到浏览器',
);
