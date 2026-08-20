import assert from 'node:assert/strict';
import {
  fixedNavigationItems,
  navigationGroups,
  isNavigationItemActive,
  getVisibleSidebarNavigation,
} from './sidebarNavigation';
import { PERMISSION_KEYS } from '../shared/utils/permissions';

assert.deepEqual(fixedNavigationItems.map((item) => item.label), ['我的工作台', '经营驾驶舱']);

assert.deepEqual(
  navigationGroups.map((group) => ({
    label: group.label,
    children: group.children.map((item) => item.label),
  })),
  [
    { label: '客户经营', children: ['线索', '客户列表', '公海池', '订单', '交付', '售后与退款'] },
    { label: '财务结算', children: ['公司财务', '电商结算'] },
    { label: '增长运营', children: ['内容运营', 'GEO增长'] },
    { label: '组织效能', children: ['目标管理', '企业标准', '极享商学院', '改善共创'] },
    { label: '企业管理', children: ['资产管理'] },
    { label: '系统设置', children: ['组织架构', '产品设置', '客户设置', '交付设置', 'AI员工设置', '消息与提醒', '系统维护'] },
  ],
);

const allLabels = [...fixedNavigationItems, ...navigationGroups.flatMap((group) => group.children)]
  .map((item) => item.label);
assert.equal(allLabels.includes('员工任务中心'), false, '员工任务应整合进我的工作台');
assert.equal(allLabels.includes('AI岗位助手'), false, 'AI岗位助手应改为全局能力入口');
assert.equal(navigationGroups.find((group) => group.id === 'growth')?.children.find((item) => item.id === 'geo')?.badge, '试运行');
assert.equal(navigationGroups.find((group) => group.id === 'organization')?.children.find((item) => item.id === 'co-creation')?.badge, '试运行');

const settingsGroup = navigationGroups.find((group) => group.id === 'settings');
assert.ok(settingsGroup, '系统设置应恢复为独立导航分组');
assert.deepEqual(
  settingsGroup.children.map((item) => item.path),
  [
    '/settings?group=organization',
    '/settings?group=product',
    '/settings?group=leadCustomer',
    '/settings?group=delivery',
    '/settings?group=aiEmployee',
    '/settings?group=notifications',
    '/settings?group=maintenance',
  ],
);
assert.equal(isNavigationItemActive(settingsGroup.children[1], '/settings', '?group=product'), true);
assert.equal(isNavigationItemActive(settingsGroup.children[1], '/settings', '?group=organization'), false);

const afterSales = navigationGroups[0].children.find((item) => item.id === 'after-sales');
assert.ok(afterSales);
assert.equal(isNavigationItemActive(afterSales, '/refund-center', ''), true, '退款中心归入售后入口');
assert.equal(isNavigationItemActive(afterSales, '/orders', ''), false);

const customerList = navigationGroups[0].children.find((item) => item.id === 'customers');
const publicPool = navigationGroups[0].children.find((item) => item.id === 'public-pool');
assert.equal(customerList?.path, '/customers?tab=active');
assert.equal(publicPool?.path, '/customers?tab=public_pool');
assert.deepEqual(publicPool?.permissionKeys, [PERMISSION_KEYS.CUSTOMER_PUBLIC_POOL_VIEW]);
assert.equal(isNavigationItemActive(customerList!, '/customers', '?tab=public_pool'), false);
assert.equal(isNavigationItemActive(publicPool!, '/customers', '?tab=public_pool'), true);

const publicPoolOnlyNavigation = getVisibleSidebarNavigation({
  role: '公海专员',
  isActive: true,
  permissions: [{ module: PERMISSION_KEYS.CUSTOMER_PUBLIC_POOL_VIEW, actions: ['read'] }],
});
assert.deepEqual(
  publicPoolOnlyNavigation.groups.find((group) => group.id === 'customer')?.children.map((item) => item.id),
  ['public-pool'],
  '仅有公海查看权限时不得展示无权访问的客户列表',
);

const userWithOnlyContentPermission = {
  role: '内容专员',
  isActive: true,
  permissions: [{ module: PERMISSION_KEYS.MARKETING_CONTENT, actions: ['read'] }],
};
const contentNavigation = getVisibleSidebarNavigation(userWithOnlyContentPermission);
assert.deepEqual(contentNavigation.fixedItems.map((item) => item.id), ['workbench'], '所有在职用户均保留我的工作台');
assert.deepEqual(contentNavigation.groups.map((group) => group.id), ['growth']);
assert.deepEqual(contentNavigation.groups[0].children.map((item) => item.id), ['content'], '仅有子权限时应看到对应业务入口');
assert.deepEqual(getVisibleSidebarNavigation({ ...userWithOnlyContentPermission, isActive: false }).groups, [], '停用用户不能看到业务模块');

const productSettingsNavigation = getVisibleSidebarNavigation({
  role: '产品管理员',
  isActive: true,
  permissions: [{ module: PERMISSION_KEYS.SETTINGS_PRODUCTS, actions: ['read'] }],
});
assert.deepEqual(
  productSettingsNavigation.groups.find((group) => group.id === 'settings')?.children.map((item) => item.id),
  ['settings-product'],
  '普通角色只应看到有权限的系统设置分组',
);

const superAdminSettingsNavigation = getVisibleSidebarNavigation({
  role: '超级管理员',
  isActive: true,
  permissions: [{ module: PERMISSION_KEYS.SETTINGS_DATA_MAINTENANCE, actions: ['read'] }],
});
assert.deepEqual(
  superAdminSettingsNavigation.groups.find((group) => group.id === 'settings')?.children.map((item) => item.id),
  ['settings-ai-employee', 'settings-notifications', 'settings-maintenance'],
  '超级管理员应看到受限的AI员工与消息提醒分组',
);

console.log('sidebar information architecture tests passed');
