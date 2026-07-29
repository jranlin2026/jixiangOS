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
]);

console.log('core permission catalog tests passed');
