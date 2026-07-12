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
const readOnlyAllUser = {
  ...user,
  id: 'user-read-only-all',
  permissions: [{ module: '全部', actions: ['read'] }],
};
assert.equal(canAccessLegacyStorageKey(readOnlyAllUser, STORAGE_KEYS.CUSTOMERS, 'read'), true);
assert.equal(canAccessLegacyStorageKey(readOnlyAllUser, STORAGE_KEYS.CUSTOMERS, 'write'), false);
const financeRuleEditor = {
  ...user,
  id: 'user-finance-rule-editor',
  permissions: [{ module: PERMISSION_KEYS.FINANCE_RULES, actions: ['write'] }],
};
assert.equal(isLegacyStorageKeyRegistered(STORAGE_KEYS.COMMISSION_PAYOUT_PLANS), true);
assert.equal(canAccessLegacyStorageKey(financeRuleEditor, STORAGE_KEYS.COMMISSION_PAYOUT_PLANS, 'write'), true);
const commandOnlyWriter = {
  ...user,
  id: 'user-command-only-writer',
  permissions: [
    { module: PERMISSION_KEYS.ORDER_MANAGE, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.ORDER_CREATE, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.ORDER_EDIT, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.ORDER_REVIEW, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.CUSTOMER_EDIT, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.CUSTOMER_ASSIGN, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.LEADS_CREATE, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.LEADS_FOLLOW, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.DELIVERY_MOVE_CARD, actions: ['read', 'write'] },
  ],
};
assert.equal(
  canAccessLegacyStorageKey(commandOnlyWriter, STORAGE_KEYS.ORDERS, 'write'),
  false,
  '正式订单只能通过记录级命令写入，旧 storage PUT 必须关闭',
);
assert.equal(
  canAccessLegacyStorageKey(commandOnlyWriter, STORAGE_KEYS.ORDER_APPLICATIONS, 'write'),
  false,
  '订单申请只能通过记录级命令写入，旧 storage PUT 必须关闭',
);
assert.equal(canAccessLegacyStorageKey(commandOnlyWriter, STORAGE_KEYS.ORDERS, 'read'), true);
assert.equal(canAccessLegacyStorageKey(commandOnlyWriter, STORAGE_KEYS.ORDER_APPLICATIONS, 'read'), true);
assert.equal(
  canAccessLegacyStorageKey(commandOnlyWriter, STORAGE_KEYS.CUSTOMERS, 'write'),
  false,
  '客户只能通过记录级命令写入，旧 storage PUT 必须关闭',
);
assert.equal(
  canAccessLegacyStorageKey(commandOnlyWriter, STORAGE_KEYS.LEADS, 'write'),
  false,
  '线索只能通过记录级命令写入，旧 storage PUT 必须关闭',
);
assert.equal(
  canAccessLegacyStorageKey(commandOnlyWriter, STORAGE_KEYS.DELIVERIES, 'write'),
  false,
  '交付单只能通过记录级命令写入，旧 storage PUT 必须关闭',
);
assert.equal(
  canAccessLegacyStorageKey(commandOnlyWriter, STORAGE_KEYS.ORDERS, 'runtime'),
  false,
  '正式订单不得混入 runtime 全量快照，必须使用记录级查询端点',
);
assert.equal(
  canAccessLegacyStorageKey(commandOnlyWriter, STORAGE_KEYS.ORDER_APPLICATIONS, 'runtime'),
  false,
  '订单申请不得混入 runtime 全量快照，必须使用记录级查询端点',
);
assert.equal(isLegacyStorageKeyRegistered('aaos_unknown_private_data'), false);
assert.equal(canAccessLegacyStorageKey(user, 'aaos_unknown_private_data', 'read'), false);
