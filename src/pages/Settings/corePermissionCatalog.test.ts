import assert from 'node:assert/strict';
import {
  CORE_DATA_SCOPE_DOMAINS,
  getCoreRolePermissionTree,
} from './corePermissionCatalog';
import { PERMISSION_KEYS } from '../../shared/utils/permissions';

function collectLeafKeys(nodes: ReturnType<typeof getCoreRolePermissionTree>): string[] {
  return nodes.flatMap((node) => (
    node.key ? [node.key] : collectLeafKeys(node.children || [])
  ));
}

const coreTree = getCoreRolePermissionTree();
const coreLabels = coreTree.map((node) => node.label);
const coreLeafKeys = new Set(collectLeafKeys(coreTree));
const settingsTree = coreTree.find((node) => node.label === '系统设置');
const customerSettingsTree = settingsTree?.children?.find((node) => node.label === '客户设置');
const productSettingsTree = settingsTree?.children?.find((node) => node.label === '产品设置');
const afterSalesSettingsTree = settingsTree?.children?.find((node) => node.label === '售后设置');

assert.equal(
  collectLeafKeys(productSettingsTree ? [productSettingsTree] : []).includes(PERMISSION_KEYS.SETTINGS_AFTER_SALES_SOURCES),
  true,
  '业务平台与店铺必须归入产品设置',
);
assert.equal(
  collectLeafKeys(customerSettingsTree ? [customerSettingsTree] : []).includes(PERMISSION_KEYS.SETTINGS_AFTER_SALES_SOURCES),
  false,
  '客户设置不应继续保留重复的业务平台与店铺入口',
);
assert.equal(afterSalesSettingsTree, undefined, '来源平台与店铺迁移后不应继续保留空的售后设置分组');

assert.deepEqual(coreLabels, [
  '线索',
  '客户',
  '订单',
  '交付',
  '售后服务',
  '财务中心',
  '企业AI大脑',
  '系统设置',
]);

[
  PERMISSION_KEYS.LEADS_LIST,
  PERMISSION_KEYS.LEADS_DETAIL,
  PERMISSION_KEYS.LEADS_CREATE,
  PERMISSION_KEYS.LEADS_EDIT,
  PERMISSION_KEYS.LEADS_FOLLOW,
  PERMISSION_KEYS.LEADS_FLOW_CONFIG,
  PERMISSION_KEYS.LEADS_INTAKE_STATUS,
  PERMISSION_KEYS.SETTINGS_CUSTOMER_TAGS,
  PERMISSION_KEYS.FINANCE_PAYOUT_REPORT_EXPORT,
  PERMISSION_KEYS.FINANCE_FLOW_EXPORT,
  PERMISSION_KEYS.STANDARD_READ,
  PERMISSION_KEYS.TASK_SELF,
  PERMISSION_KEYS.AI_POSITION_ASSISTANT,
  PERMISSION_KEYS.BRAIN_DASHBOARD,
].forEach((permissionKey) => {
  assert.equal(coreLeafKeys.has(permissionKey), true, `${permissionKey} 必须出现在正式模块权限树中`);
});

assert.deepEqual(CORE_DATA_SCOPE_DOMAINS, [
  'leads',
  'customers',
  'orders',
  'orderApplications',
  'deliveries',
  'recoveryOrders',
  'recoveryOrderApplications',
  'academy',
]);

console.log('core permission catalog tests passed');
