import { ROUTES } from '../shared/utils/constants';
import { ACADEMY_ACCESS_PERMISSION_KEYS } from '../shared/utils/academyAccess';
import { OKR_ACCESS_PERMISSION_KEYS } from '../shared/utils/okrAccess';
import type { AuthenticatedUser } from '../types/auth';
import { hasPermission, PERMISSION_KEYS } from '../shared/utils/permissions';
import { isSuperAdminRoleName } from '../shared/utils/roles';

export type SidebarNavigationItem = {
  id: string;
  label: string;
  path: string;
  permissionKeys: string[];
  badge?: '试运行';
  relatedPaths?: string[];
  superAdminOnly?: boolean;
};

export type SidebarNavigationGroup = {
  id: string;
  label: string;
  children: SidebarNavigationItem[];
};

export const fixedNavigationItems: SidebarNavigationItem[] = [
  { id: 'workbench', label: '我的工作台', path: ROUTES.HOME, permissionKeys: [PERMISSION_KEYS.HOME] },
  {
    id: 'cockpit',
    label: '经营驾驶舱',
    path: ROUTES.DASHBOARD,
    permissionKeys: [PERMISSION_KEYS.DASHBOARD, PERMISSION_KEYS.BRAIN_DASHBOARD],
  },
];

export const navigationGroups: SidebarNavigationGroup[] = [
  {
    id: 'customer',
    label: '客户经营',
    children: [
      { id: 'leads', label: '线索', path: ROUTES.LEADS, permissionKeys: [PERMISSION_KEYS.LEADS] },
      {
        id: 'customers', label: '客户列表', path: `${ROUTES.CUSTOMERS}?tab=active`,
        permissionKeys: [PERMISSION_KEYS.CUSTOMER_LIST],
      },
      {
        id: 'public-pool', label: '公海池', path: `${ROUTES.CUSTOMERS}?tab=public_pool`,
        permissionKeys: [PERMISSION_KEYS.CUSTOMER_PUBLIC_POOL_VIEW],
      },
      {
        id: 'orders', label: '订单', path: ROUTES.ORDERS,
        permissionKeys: [PERMISSION_KEYS.ORDERS, PERMISSION_KEYS.ORDER_MANAGE, PERMISSION_KEYS.ORDER_REVIEW_LIST, PERMISSION_KEYS.ORDER_CREATE],
      },
      { id: 'delivery', label: '交付', path: ROUTES.DELIVERY, permissionKeys: [PERMISSION_KEYS.DELIVERY] },
      {
        id: 'after-sales', label: '售后与退款', path: ROUTES.AFTER_SALES,
        relatedPaths: [ROUTES.REFUND_CENTER],
        permissionKeys: [
          PERMISSION_KEYS.AFTER_SALES,
          PERMISSION_KEYS.AFTER_SALES_RECOVERY,
          PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE,
          PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW_LIST,
        ],
      },
    ],
  },
  {
    id: 'finance',
    label: '财务结算',
    children: [
      {
        id: 'finance-center', label: '公司财务', path: ROUTES.FINANCE,
        permissionKeys: [
          PERMISSION_KEYS.FINANCE,
          PERMISSION_KEYS.FINANCE_MY_COMMISSION,
          PERMISSION_KEYS.FINANCE_SETTLEMENT,
          PERMISSION_KEYS.FINANCE_RECOVERY_SETTLEMENT,
          PERMISSION_KEYS.FINANCE_PAYOUT,
          PERMISSION_KEYS.FINANCE_FLOW,
          PERMISSION_KEYS.FINANCE_RULES,
        ],
      },
      {
        id: 'ecommerce', label: '电商结算', path: ROUTES.ECOMMERCE_SETTLEMENT,
        permissionKeys: [
          PERMISSION_KEYS.ECOMMERCE_SETTLEMENT,
          PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_WORKBENCH,
          PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_HISTORY,
          PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_EXCEPTIONS,
          PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_TALENTS,
          PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_SETTINGS,
          PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_RULES,
        ],
      },
    ],
  },
  {
    id: 'growth',
    label: '增长运营',
    children: [
      {
        id: 'content', label: '内容运营', path: ROUTES.MARKETING,
        permissionKeys: [PERMISSION_KEYS.MARKETING, PERMISSION_KEYS.MARKETING_CONTENT, PERMISSION_KEYS.MARKETING_REVIEW, PERMISSION_KEYS.MARKETING_PUBLISH, PERMISSION_KEYS.MARKETING_GROUPS, PERMISSION_KEYS.ASSETS_MATRIX_PUBLISH],
      },
      {
        id: 'geo', label: 'GEO增长', path: ROUTES.GEO, badge: '试运行',
        permissionKeys: [PERMISSION_KEYS.GEO, PERMISSION_KEYS.GEO_OVERVIEW, PERMISSION_KEYS.GEO_CONTENT, PERMISSION_KEYS.GEO_ANALYTICS],
      },
    ],
  },
  {
    id: 'organization',
    label: '组织效能',
    children: [
      { id: 'okr', label: '目标管理', path: ROUTES.OKR, permissionKeys: [...OKR_ACCESS_PERMISSION_KEYS] },
      {
        id: 'standards', label: '企业标准', path: ROUTES.ENABLEMENT,
        permissionKeys: [PERMISSION_KEYS.ENABLEMENT_KNOWLEDGE, PERMISSION_KEYS.ENABLEMENT_REVIEW, PERMISSION_KEYS.ENABLEMENT_PUBLISH, PERMISSION_KEYS.STANDARD_READ, PERMISSION_KEYS.STANDARD_MAINTAIN, PERMISSION_KEYS.STANDARD_PUBLISH, PERMISSION_KEYS.TASK_ASSIGN],
      },
      { id: 'academy', label: '极享商学院', path: ROUTES.ACADEMY, permissionKeys: [...ACADEMY_ACCESS_PERMISSION_KEYS] },
      {
        id: 'co-creation', label: '改善共创', path: ROUTES.CO_CREATION, badge: '试运行',
        permissionKeys: [PERMISSION_KEYS.CO_CREATION_SUBMIT, PERMISSION_KEYS.CO_CREATION_SUPERVISE, PERMISSION_KEYS.CO_CREATION_DECIDE, PERMISSION_KEYS.CO_CREATION_VALIDATE],
      },
    ],
  },
  {
    id: 'management',
    label: '企业管理',
    children: [
      {
        id: 'assets', label: '资产管理', path: ROUTES.ASSETS,
        permissionKeys: [PERMISSION_KEYS.ASSETS, PERMISSION_KEYS.ASSETS_OVERVIEW, PERMISSION_KEYS.ASSETS_DEVICES, PERMISSION_KEYS.ASSETS_PHONES, PERMISSION_KEYS.ASSETS_ACCOUNTS, PERMISSION_KEYS.ASSETS_RISKS, PERMISSION_KEYS.ASSETS_LOGS, PERMISSION_KEYS.ASSETS_OFFBOARDING],
      },
    ],
  },
  {
    id: 'settings',
    label: '系统设置',
    children: [
      {
        id: 'settings-organization', label: '组织架构', path: `${ROUTES.SETTINGS}?group=organization`,
        permissionKeys: [
          PERMISSION_KEYS.SETTINGS_EMPLOYEES_DEPARTMENTS,
          PERMISSION_KEYS.SETTINGS_ROLES,
          PERMISSION_KEYS.SETTINGS_ACCOUNT_RECYCLE,
        ],
      },
      {
        id: 'settings-product', label: '产品设置', path: `${ROUTES.SETTINGS}?group=product`,
        permissionKeys: [
          PERMISSION_KEYS.SETTINGS_PRODUCTS,
          PERMISSION_KEYS.SETTINGS_AFTER_SALES_SOURCES,
          PERMISSION_KEYS.SETTINGS_ORDER_TYPES,
        ],
      },
      {
        id: 'settings-customer', label: '客户设置', path: `${ROUTES.SETTINGS}?group=leadCustomer`,
        permissionKeys: [
          PERMISSION_KEYS.SETTINGS_CUSTOMER_LEVELS,
          PERMISSION_KEYS.SETTINGS_CUSTOMER_TAGS,
          PERMISSION_KEYS.SETTINGS_LIFECYCLE,
          PERMISSION_KEYS.SETTINGS_LEAD_SOURCES,
          PERMISSION_KEYS.SETTINGS_LEAD_FLOW,
        ],
      },
      {
        id: 'settings-delivery', label: '交付设置', path: `${ROUTES.SETTINGS}?group=delivery`,
        permissionKeys: [
          PERMISSION_KEYS.SETTINGS_DELIVERY_ASSIGNMENT,
        ],
      },
      {
        id: 'settings-ai-employee', label: 'AI员工设置', path: `${ROUTES.SETTINGS}?group=aiEmployee`,
        permissionKeys: [PERMISSION_KEYS.SETTINGS_DATA_MAINTENANCE],
        superAdminOnly: true,
      },
      {
        id: 'settings-notifications', label: '消息与提醒', path: `${ROUTES.SETTINGS}?group=notifications`,
        permissionKeys: [PERMISSION_KEYS.SETTINGS_DATA_MAINTENANCE],
        superAdminOnly: true,
      },
      {
        id: 'settings-maintenance', label: '系统维护', path: `${ROUTES.SETTINGS}?group=maintenance`,
        permissionKeys: [
          PERMISSION_KEYS.SETTINGS_AI_CONFIG,
          PERMISSION_KEYS.SETTINGS_DATA_MAINTENANCE,
        ],
      },
    ],
  },
];

export const isNavigationItemActive = (
  item: SidebarNavigationItem,
  pathname: string,
  search: string,
) => {
  if (item.relatedPaths?.includes(pathname)) return true;
  const [itemPath, itemQuery = ''] = item.path.split('?');
  if (pathname !== itemPath) return false;
  if (!itemQuery) return true;
  const expectedParams = new URLSearchParams(itemQuery);
  const currentParams = new URLSearchParams(search);
  return Array.from(expectedParams.entries()).every(([key, value]) => (
    currentParams.get(key) === value || (key === 'tab' && value === 'active' && !currentParams.has(key))
  ));
};

export const getVisibleSidebarNavigation = (
  user: Pick<AuthenticatedUser, 'role' | 'roleId' | 'permissions' | 'isActive'> | null | undefined,
) => {
  const canSee = (item: SidebarNavigationItem) => (
    (!item.superAdminOnly || isSuperAdminRoleName(user?.role))
    && item.permissionKeys.some((key) => hasPermission(user, key))
  );
  return {
    fixedItems: fixedNavigationItems.filter(canSee),
    groups: navigationGroups
      .map((group) => ({ ...group, children: group.children.filter(canSee) }))
      .filter((group) => group.children.length > 0),
  };
};
