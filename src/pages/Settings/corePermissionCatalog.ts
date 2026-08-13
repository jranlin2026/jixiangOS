import type { DataScopeDomain } from '../../types/role';
import {
  PERMISSION_KEYS,
  getCustomerPermissionTree,
  getPermissionLeafDisplayLabel,
} from '../../shared/utils/permissions';

export type RolePermissionNode = {
  label: string;
  key?: string;
  children?: RolePermissionNode[];
};

export const CORE_DATA_SCOPE_DOMAINS: DataScopeDomain[] = [
  'leads',
  'customers',
  'orders',
  'orderApplications',
  'deliveries',
  'recoveryOrders',
  'recoveryOrderApplications',
  'academy',
  'okr',
];

export type RoleDataScopeRow = {
  domain: DataScopeDomain;
  label: string;
  description: string;
  permissionKeys: string[];
};

const CORE_DATA_SCOPE_ROWS: RoleDataScopeRow[] = [
  { domain: 'leads', label: '线索数据', description: '控制线索列表、资料、入库情况和统计的数据范围', permissionKeys: [PERMISSION_KEYS.LEADS_LIST, PERMISSION_KEYS.LEADS_DETAIL, PERMISSION_KEYS.LEADS_CREATE, PERMISSION_KEYS.LEADS_EDIT, PERMISSION_KEYS.LEADS_FOLLOW, PERMISSION_KEYS.LEADS_FLOW_CONFIG, PERMISSION_KEYS.LEADS_INTAKE_STATUS] },
  { domain: 'customers', label: '客户数据', description: '控制客户列表、客户资料和客户统计的数据范围', permissionKeys: getCustomerPermissionTree().flatMap((node) => node.leafKeys) },
  { domain: 'orders', label: '订单数据', description: '控制正式订单列表、详情、分账和导出的数据范围', permissionKeys: [PERMISSION_KEYS.ORDER_MANAGE, PERMISSION_KEYS.ORDER_CREATE, PERMISSION_KEYS.ORDER_EDIT, PERMISSION_KEYS.ORDER_CORRECT, PERMISSION_KEYS.ORDER_DELETE, PERMISSION_KEYS.ORDER_HISTORY, PERMISSION_KEYS.ORDER_PAYMENT_SCREENSHOT, PERMISSION_KEYS.ORDER_EXPORT, PERMISSION_KEYS.FINANCE_SETTLEMENT, PERMISSION_KEYS.ORDER_SETTLEMENT_EXPORT] },
  { domain: 'orderApplications', label: '订单审核台数据', description: '控制订单审核台能看到哪些订单申请；审核列表权限控制入口，审核操作权限控制通过、退回和驳回', permissionKeys: [PERMISSION_KEYS.ORDER_REVIEW_LIST, PERMISSION_KEYS.ORDER_REVIEW] },
  { domain: 'deliveries', label: '交付数据', description: '控制交付中心列表、详情、统计和可操作交付卡片的数据范围', permissionKeys: [PERMISSION_KEYS.DELIVERY, PERMISSION_KEYS.DELIVERY_CENTER, PERMISSION_KEYS.DELIVERY_MOVE_CARD, PERMISSION_KEYS.DELIVERY_STAGE_CONFIG] },
  { domain: 'recoveryOrders', label: '售后挽回订单数据', description: '控制售后挽回订单列表、分账、导出和统计的数据范围', permissionKeys: [PERMISSION_KEYS.AFTER_SALES_RECOVERY, PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE, PERMISSION_KEYS.AFTER_SALES_RECOVERY_EDIT, PERMISSION_KEYS.AFTER_SALES_RECOVERY_CORRECT, PERMISSION_KEYS.AFTER_SALES_RECOVERY_DELETE, PERMISSION_KEYS.AFTER_SALES_RECOVERY_HISTORY, PERMISSION_KEYS.AFTER_SALES_RECOVERY_EXPORT, PERMISSION_KEYS.FINANCE_RECOVERY_SETTLEMENT, PERMISSION_KEYS.RECOVERY_SETTLEMENT_EXPORT] },
  { domain: 'recoveryOrderApplications', label: '售后挽回订单审核台数据', description: '控制售后挽回审核台能看到哪些挽回订单；审核列表权限控制入口，审核操作权限控制通过、退回和驳回', permissionKeys: [PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW_LIST, PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW] },
  { domain: 'academy', label: '商学院数据', description: '控制课程资产、排期、场次执行、学员邀约、转化交接和经营复盘的数据范围', permissionKeys: [PERMISSION_KEYS.ACADEMY_VIEW, PERMISSION_KEYS.ACADEMY_PLAN_MANAGE, PERMISSION_KEYS.ACADEMY_COURSE_MANAGE, PERMISSION_KEYS.ACADEMY_SESSION_MANAGE, PERMISSION_KEYS.ACADEMY_ENGAGEMENT_MANAGE, PERMISSION_KEYS.ACADEMY_REVIEW_MANAGE] },
  { domain: 'okr', label: '目标数据', description: '控制本人、团队、部门和公司目标的数据范围', permissionKeys: [PERMISSION_KEYS.OKR_SELF_READ, PERMISSION_KEYS.OKR_TEAM_READ, PERMISSION_KEYS.OKR_CREATE, PERMISSION_KEYS.OKR_CHECK_IN, PERMISSION_KEYS.OKR_DEPARTMENT_MANAGE, PERMISSION_KEYS.OKR_COMPANY_MANAGE, PERMISSION_KEYS.OKR_CYCLE_MANAGE, PERMISSION_KEYS.OKR_SCORE_CLOSE, PERMISSION_KEYS.OKR_METRIC_BIND] },
];

export function getCoreDataScopeRows(): RoleDataScopeRow[] {
  return CORE_DATA_SCOPE_ROWS.map((row) => ({ ...row, permissionKeys: [...row.permissionKeys] }));
}

const CORE_ROLE_PERMISSION_TREE: RolePermissionNode[] = [
  {
    label: '线索',
    children: [
      {
        label: '线索列表',
        children: [
          { label: '查看线索列表', key: PERMISSION_KEYS.LEADS_LIST },
          { label: '查看线索资料', key: PERMISSION_KEYS.LEADS_DETAIL },
          { label: '新增及批量入库', key: PERMISSION_KEYS.LEADS_CREATE },
          { label: '编辑线索', key: PERMISSION_KEYS.LEADS_EDIT },
          { label: '开始跟进并加入客户', key: PERMISSION_KEYS.LEADS_FOLLOW },
          { label: '分配销售', key: PERMISSION_KEYS.LEADS_FLOW_CONFIG },
        ],
      },
      { label: '查看入库情况', key: PERMISSION_KEYS.LEADS_INTAKE_STATUS },
    ],
  },
  {
    label: '客户',
    children: getCustomerPermissionTree().map((group) => ({
      label: group.label,
      children: group.leafKeys.map((key) => ({
        label: getPermissionLeafDisplayLabel(key),
        key,
      })),
    })),
  },
  {
    label: '订单',
    children: [
      { label: '查看订单列表', key: PERMISSION_KEYS.ORDER_MANAGE },
      { label: '新增订单', key: PERMISSION_KEYS.ORDER_CREATE },
      { label: '编辑订单', key: PERMISSION_KEYS.ORDER_EDIT },
      { label: '订单更正', key: PERMISSION_KEYS.ORDER_CORRECT },
      { label: '删除订单', key: PERMISSION_KEYS.ORDER_DELETE },
      { label: '查看订单修改记录', key: PERMISSION_KEYS.ORDER_HISTORY },
      { label: '导出订单', key: PERMISSION_KEYS.ORDER_EXPORT },
      { label: '导入订单', key: PERMISSION_KEYS.ORDER_IMPORT },
      { label: '付款截图识别', key: PERMISSION_KEYS.ORDER_PAYMENT_SCREENSHOT },
      { label: '查看订单审核列表', key: PERMISSION_KEYS.ORDER_REVIEW_LIST },
      { label: '执行订单审核', key: PERMISSION_KEYS.ORDER_REVIEW },
    ],
  },
  {
    label: '交付',
    children: [
      { label: '查看交付中心', key: PERMISSION_KEYS.DELIVERY_CENTER },
      { label: '移动交付卡片', key: PERMISSION_KEYS.DELIVERY_MOVE_CARD },
      { label: '配置交付阶段', key: PERMISSION_KEYS.DELIVERY_STAGE_CONFIG },
    ],
  },
  {
    label: '售后服务',
    children: [
      { label: '查看售后挽回订单列表', key: PERMISSION_KEYS.AFTER_SALES_RECOVERY },
      { label: '新增售后挽回订单', key: PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE },
      { label: '编辑售后挽回订单', key: PERMISSION_KEYS.AFTER_SALES_RECOVERY_EDIT },
      { label: '更正售后挽回订单', key: PERMISSION_KEYS.AFTER_SALES_RECOVERY_CORRECT },
      { label: '删除售后挽回订单', key: PERMISSION_KEYS.AFTER_SALES_RECOVERY_DELETE },
      { label: '查看售后挽回订单修改记录', key: PERMISSION_KEYS.AFTER_SALES_RECOVERY_HISTORY },
      { label: '导出售后挽回订单', key: PERMISSION_KEYS.AFTER_SALES_RECOVERY_EXPORT },
      { label: '导入售后挽回订单', key: PERMISSION_KEYS.AFTER_SALES_RECOVERY_IMPORT },
      { label: '查看售后挽回审核列表', key: PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW_LIST },
      { label: '执行售后挽回审核', key: PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW },
    ],
  },
  {
    label: '财务中心',
    children: [
      { label: '我的提成', key: PERMISSION_KEYS.FINANCE_MY_COMMISSION },
      { label: '订单分账', key: PERMISSION_KEYS.FINANCE_SETTLEMENT },
      { label: '导出订单分账', key: PERMISSION_KEYS.ORDER_SETTLEMENT_EXPORT },
      { label: '售后挽回分账', key: PERMISSION_KEYS.FINANCE_RECOVERY_SETTLEMENT },
      { label: '导出售后挽回分账', key: PERMISSION_KEYS.RECOVERY_SETTLEMENT_EXPORT },
      { label: '提成发放', key: PERMISSION_KEYS.FINANCE_PAYOUT },
      { label: '导出提成月度报告', key: PERMISSION_KEYS.FINANCE_PAYOUT_REPORT_EXPORT },
      { label: '收支流水', key: PERMISSION_KEYS.FINANCE_FLOW },
      { label: '导出收支流水', key: PERMISSION_KEYS.FINANCE_FLOW_EXPORT },
      { label: '提成规则', key: PERMISSION_KEYS.FINANCE_RULES },
    ],
  },
  {
    label: '企业AI大脑',
    children: [
      {
        label: '标准中心',
        children: [
          { label: '读取岗位标准', key: PERMISSION_KEYS.STANDARD_READ },
          { label: '维护岗位标准', key: PERMISSION_KEYS.STANDARD_MAINTAIN },
          { label: '发布岗位标准', key: PERMISSION_KEYS.STANDARD_PUBLISH },
        ],
      },
      {
        label: '任务中心',
        children: [
          { label: '本人任务', key: PERMISSION_KEYS.TASK_SELF },
          { label: '团队任务', key: PERMISSION_KEYS.TASK_TEAM },
          { label: '指派任务', key: PERMISSION_KEYS.TASK_ASSIGN },
          { label: '确认任务', key: PERMISSION_KEYS.TASK_CONFIRM },
        ],
      },
      {
        label: '复盘中心',
        children: [
          { label: '本人复盘', key: PERMISSION_KEYS.REVIEW_SELF },
          { label: '团队复盘', key: PERMISSION_KEYS.REVIEW_TEAM },
        ],
      },
      {
        label: 'AI助手与驾驶舱',
        children: [
          { label: '岗位AI问答', key: PERMISSION_KEYS.AI_POSITION_ASSISTANT },
          { label: '查看AI问答审计', key: PERMISSION_KEYS.AI_AUDIT },
          { label: '老板驾驶舱', key: PERMISSION_KEYS.BRAIN_DASHBOARD },
        ],
      },
    ],
  },
  {
    label: '目标管理',
    children: [
      { label: '查看本人目标', key: PERMISSION_KEYS.OKR_SELF_READ },
      { label: '查看团队目标', key: PERMISSION_KEYS.OKR_TEAM_READ },
      { label: '创建目标', key: PERMISSION_KEYS.OKR_CREATE },
      { label: '提交检视', key: PERMISSION_KEYS.OKR_CHECK_IN },
      { label: '管理部门目标', key: PERMISSION_KEYS.OKR_DEPARTMENT_MANAGE },
      { label: '管理公司目标', key: PERMISSION_KEYS.OKR_COMPANY_MANAGE },
      { label: '管理周期', key: PERMISSION_KEYS.OKR_CYCLE_MANAGE },
      { label: '评分与关闭', key: PERMISSION_KEYS.OKR_SCORE_CLOSE },
      { label: '绑定经营指标', key: PERMISSION_KEYS.OKR_METRIC_BIND },
    ],
  },
  {
    label: '系统设置',
    children: [
      {
        label: '组织架构',
        children: [
          { label: '员工&部门', key: PERMISSION_KEYS.SETTINGS_EMPLOYEES_DEPARTMENTS },
          { label: '角色权限', key: PERMISSION_KEYS.SETTINGS_ROLES },
          { label: '账号回收站', key: PERMISSION_KEYS.SETTINGS_ACCOUNT_RECYCLE },
        ],
      },
      {
        label: '产品设置',
        children: [
          { label: '产品配置', key: PERMISSION_KEYS.SETTINGS_PRODUCTS },
          { label: '业务平台与店铺', key: PERMISSION_KEYS.SETTINGS_AFTER_SALES_SOURCES },
          { label: '订单类型', key: PERMISSION_KEYS.SETTINGS_ORDER_TYPES },
        ],
      },
      {
        label: '客户设置',
        children: [
          { label: '客户等级', key: PERMISSION_KEYS.SETTINGS_CUSTOMER_LEVELS },
          { label: '客户生命周期', key: PERMISSION_KEYS.SETTINGS_LIFECYCLE },
          { label: '客户标签', key: PERMISSION_KEYS.SETTINGS_CUSTOMER_TAGS },
          { label: '线索来源', key: PERMISSION_KEYS.SETTINGS_LEAD_SOURCES },
          { label: '线索流转', key: PERMISSION_KEYS.SETTINGS_LEAD_FLOW },
        ],
      },
      {
        label: '交付设置',
        children: [
          { label: '客户成功分配', key: PERMISSION_KEYS.SETTINGS_DELIVERY_ASSIGNMENT },
        ],
      },
      {
        label: '系统维护',
        children: [
          { label: 'AI大脑', key: PERMISSION_KEYS.SETTINGS_AI_CONFIG },
          { label: '业务回收与CRM迁移', key: PERMISSION_KEYS.SETTINGS_DATA_MAINTENANCE },
        ],
      },
    ],
  },
];

export function getCoreRolePermissionTree(): RolePermissionNode[] {
  return CORE_ROLE_PERMISSION_TREE.map(cloneNode);
}

function cloneNode(node: RolePermissionNode): RolePermissionNode {
  return {
    ...node,
    children: node.children?.map(cloneNode),
  };
}
