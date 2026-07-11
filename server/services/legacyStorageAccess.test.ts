import assert from 'node:assert/strict';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import {
  canAccessLegacyStorageKey,
  isLegacyStorageKeyRegistered,
} from './legacyStorageAccess';

const user = {
  id: 'user-sales',
  name: '销售',
  account: 'sales',
  email: '',
  phone: '',
  role: '销售顾问' as any,
  isActive: true,
  permissions: [{ module: PERMISSION_KEYS.CUSTOMER_LIST, actions: ['read'] }],
};

assert.equal(isLegacyStorageKeyRegistered(STORAGE_KEYS.CUSTOMERS), true);
assert.equal(canAccessLegacyStorageKey(user, STORAGE_KEYS.CUSTOMERS, 'read'), true);
assert.equal(canAccessLegacyStorageKey(user, STORAGE_KEYS.CUSTOMERS, 'write'), false);
assert.equal(canAccessLegacyStorageKey(user, STORAGE_KEYS.COMMISSIONS, 'read'), false);
const financeRuleEditor = {
  ...user,
  id: 'user-finance-rule-editor',
  permissions: [{ module: PERMISSION_KEYS.FINANCE_RULES, actions: ['write'] }],
};
assert.equal(isLegacyStorageKeyRegistered(STORAGE_KEYS.COMMISSION_PAYOUT_PLANS), true);
assert.equal(canAccessLegacyStorageKey(financeRuleEditor, STORAGE_KEYS.COMMISSION_PAYOUT_PLANS, 'write'), true);
assert.equal(isLegacyStorageKeyRegistered('aaos_unknown_private_data'), false);
assert.equal(canAccessLegacyStorageKey(user, 'aaos_unknown_private_data', 'read'), false);
