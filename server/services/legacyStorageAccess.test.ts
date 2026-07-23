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
assert.equal(canAccessLegacyStorageKey(user, STORAGE_KEYS.CUSTOMERS, 'read'), false);
assert.equal(canAccessLegacyStorageKey(user, STORAGE_KEYS.CUSTOMERS, 'write'), false);
assert.equal(canAccessLegacyStorageKey(user, STORAGE_KEYS.CUSTOMERS, 'runtime'), false);
assert.equal(canAccessLegacyStorageKey(user, STORAGE_KEYS.COMMISSIONS, 'read'), false);
const readOnlyAllUser = {
  ...user,
  id: 'user-read-only-all',
  permissions: [{ module: '全部', actions: ['read'] }],
};
assert.equal(canAccessLegacyStorageKey(readOnlyAllUser, STORAGE_KEYS.CUSTOMERS, 'read'), false);
assert.equal(canAccessLegacyStorageKey(readOnlyAllUser, STORAGE_KEYS.CUSTOMERS, 'write'), false);
const financeRuleEditor = {
  ...user,
  id: 'user-finance-rule-editor',
  permissions: [{ module: PERMISSION_KEYS.FINANCE_RULES, actions: ['write'] }],
};
assert.equal(isLegacyStorageKeyRegistered(STORAGE_KEYS.COMMISSION_PAYOUT_PLANS), true);
assert.equal(canAccessLegacyStorageKey(financeRuleEditor, STORAGE_KEYS.COMMISSION_PAYOUT_PLANS, 'write'), true);
const customerListReader = {
  ...user,
  id: 'user-customer-list-reader',
  permissions: [{ module: PERMISSION_KEYS.CUSTOMER_LIST, actions: ['read'] }],
};
assert.equal(canAccessLegacyStorageKey(customerListReader, STORAGE_KEYS.LEAD_SOURCE_CONFIGS, 'read'), true);
assert.equal(canAccessLegacyStorageKey(customerListReader, STORAGE_KEYS.LEAD_SOURCE_CONFIGS, 'runtime'), true);
assert.equal(canAccessLegacyStorageKey(customerListReader, STORAGE_KEYS.LEAD_SOURCE_CONFIGS, 'write'), false);
const publicPoolReader = {
  ...user,
  id: 'user-public-pool-reader',
  permissions: [{ module: PERMISSION_KEYS.CUSTOMER_PUBLIC_POOL_VIEW, actions: ['read'] }],
};
assert.equal(canAccessLegacyStorageKey(publicPoolReader, STORAGE_KEYS.LEAD_SOURCE_CONFIGS, 'runtime'), true);
const leadSourceEditor = {
  ...user,
  id: 'user-lead-source-editor',
  permissions: [{ module: PERMISSION_KEYS.SETTINGS_LEAD_SOURCES, actions: ['read', 'write'] }],
};
assert.equal(canAccessLegacyStorageKey(leadSourceEditor, STORAGE_KEYS.LEAD_SOURCE_CONFIGS, 'write'), true);
for (const orderCreatePermission of [
  PERMISSION_KEYS.ORDER_CREATE,
  PERMISSION_KEYS.CUSTOMER_CREATE_ORDER,
]) {
  const orderCreator = {
    ...user,
    id: `user-order-creator-${orderCreatePermission}`,
    permissions: [{ module: orderCreatePermission, actions: ['read', 'write'] }],
  };
  for (const orderCatalogKey of [
    STORAGE_KEYS.PRODUCTS,
    STORAGE_KEYS.PRODUCT_LEVELS,
    STORAGE_KEYS.ORDER_TYPE_CONFIGS,
  ]) {
    assert.equal(
      canAccessLegacyStorageKey(orderCreator, orderCatalogKey, 'read'),
      true,
      `可新增订单的销售必须能读取下单基础目录: ${orderCreatePermission} -> ${orderCatalogKey}`,
    );
    assert.equal(
      canAccessLegacyStorageKey(orderCreator, orderCatalogKey, 'runtime'),
      true,
      `可新增订单的销售必须在登录时加载下单基础目录: ${orderCreatePermission} -> ${orderCatalogKey}`,
    );
    assert.equal(
      canAccessLegacyStorageKey(orderCreator, orderCatalogKey, 'write'),
      false,
      `销售不得修改下单基础目录: ${orderCreatePermission} -> ${orderCatalogKey}`,
    );
  }
}
const commandOnlyWriter = {
  ...user,
  id: 'user-command-only-writer',
  permissions: [
    { module: PERMISSION_KEYS.ORDER_MANAGE, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.ORDER_CREATE, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.ORDER_EDIT, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.ORDER_REVIEW_LIST, actions: ['read'] },
    { module: PERMISSION_KEYS.ORDER_REVIEW, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.CUSTOMER_EDIT_PROFILE, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.CUSTOMER_TRANSFER, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.SETTINGS_CUSTOMER_TAGS, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.LEADS_CREATE, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.LEADS_FOLLOW, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.DELIVERY_MOVE_CARD, actions: ['read', 'write'] },
  ],
};
const catalogSuperAdmin = {
  ...commandOnlyWriter,
  roleId: 'role-admin',
  permissions: [{ module: '全部', actions: ['read', 'write', 'delete'] }],
};
for (const catalogKey of [STORAGE_KEYS.TAGS, STORAGE_KEYS.TAG_GROUPS]) {
  assert.equal(canAccessLegacyStorageKey(commandOnlyWriter, catalogKey, 'write'), false);
  assert.equal(canAccessLegacyStorageKey(catalogSuperAdmin, catalogKey, 'write'), false);
}
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
