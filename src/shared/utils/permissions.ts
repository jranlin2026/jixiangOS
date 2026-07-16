import type { Permission, Role } from '../../types/role';
import type { AuthenticatedUser } from '../../types/auth';
import type { User } from '../../types/settings';
import { STORAGE_KEYS } from './constants';
import { normalizeUserRoleName } from './roles';

export const CAPABILITY_KEYS = {
  LEADS_RECEIVE: 'leads.receive',
  LEADS_ASSIGN: 'leads.assign',
} as const;

export const PERMISSION_KEYS = {
  HOME: '首页',
  DASHBOARD: '驾驶舱',

  LEADS: '线索',
  LEADS_LIST: '线索/线索列表',
  LEADS_DETAIL: '线索/线索列表/查看线索资料',
  LEADS_CREATE: '线索/线索列表/新建线索',
  LEADS_FOLLOW: '线索/线索列表/开始跟进并加入客户',
  LEADS_FLOW_CONFIG: '线索/线索列表/分配销售',
  LEADS_INTAKE_STATUS: '线索/入库情况',
  LEADS_CONVERT: '线索/线索转客户',

  CUSTOMERS: '客户',
  CUSTOMER_LIST: '客户/客户列表',
  CUSTOMER_CREATE: '客户/新建客户',
  CUSTOMER_DETAIL: '客户/查看客户资料',
  CUSTOMER_EDIT: '客户/编辑客户',
  CUSTOMER_ASSIGN: '客户/分配客户',
  CUSTOMER_PUBLIC_POOL_CLAIM: '客户/领取公海客户',
  CUSTOMER_PROFILE: '客户/客户画像',
  CUSTOMER_AI_CARD: '客户/AI名片',
  CUSTOMER_CREATE_ORDER: '客户/新建客户订单',
  CUSTOMER_VIEW_ORDERS: '客户/查看客户订单',

  ORDERS: '订单',
  ORDER_MANAGE: '订单/订单列表',
  ORDER_REVIEW_LIST: '订单/订单审核列表',
  ORDER_REVIEW: '订单/订单审核操作',
  ORDER_CREATE: '订单/新增订单',
  ORDER_EDIT: '订单/编辑订单',
  ORDER_DELETE: '订单/删除订单',
  ORDER_HISTORY: '订单/订单修改记录',
  ORDER_PAYMENT_SCREENSHOT: '订单/付款截图识别',

  DELIVERY: '交付',
  DELIVERY_CENTER: '交付/交付中心',
  DELIVERY_MOVE_CARD: '交付/移动交付卡片',
  DELIVERY_STAGE_CONFIG: '交付/交付阶段配置',

  AFTER_SALES: '售后服务',
  AFTER_SALES_REFUND: '售后服务/售后挽回订单列表',
  AFTER_SALES_TICKETS: '售后服务/售后工单',
  AFTER_SALES_RECOVERY: '售后服务/售后挽回订单列表',
  AFTER_SALES_RECOVERY_REVIEW_LIST: '售后服务/售后挽回订单审核列表',
  AFTER_SALES_RECOVERY_REVIEW: '售后服务/售后挽回订单审核操作',
  AFTER_SALES_RECOVERY_CREATE: '售后服务/新增售后挽回订单',
  AFTER_SALES_RECOVERY_EDIT: '售后服务/编辑售后挽回订单',
  AFTER_SALES_RECOVERY_DELETE: '售后服务/删除售后挽回订单',
  AFTER_SALES_RECOVERY_HISTORY: '售后服务/售后挽回订单修改记录',

  FINANCE: '财务中心',
  FINANCE_MY_COMMISSION: '财务中心/我的提成',
  FINANCE_OVERVIEW: '财务中心/财务总览',
  FINANCE_SETTLEMENT: '财务中心/订单分账',
  FINANCE_RECOVERY_SETTLEMENT: '财务中心/售后挽回分账',
  FINANCE_PAYOUT: '财务中心/月度发放',
  FINANCE_REFUND: '财务中心/售后挽回分账',
  FINANCE_FLOW: '财务中心/收支流水',
  FINANCE_RULES: '财务中心/规则配置',

  ECOMMERCE_SETTLEMENT: '电商结算中心',
  ECOMMERCE_SETTLEMENT_WORKBENCH: '电商结算中心/结算工作台',
  ECOMMERCE_SETTLEMENT_HISTORY: '电商结算中心/结算历史',
  ECOMMERCE_SETTLEMENT_EXCEPTIONS: '电商结算中心/异常核对',
  ECOMMERCE_SETTLEMENT_TALENTS: '电商结算中心/达人结算汇总',
  ECOMMERCE_SETTLEMENT_SETTINGS: '电商结算中心/店铺与参数',
  ECOMMERCE_SETTLEMENT_RULES: '电商结算中心/结算规则',

  ASSETS: '资产管理',
  ASSETS_OVERVIEW: '资产管理/资产总览',
  ASSETS_DEVICES: '资产管理/设备资产',
  ASSETS_PHONES: '资产管理/手机号资产',
  ASSETS_ACCOUNTS: '资产管理/互联网账号',
  ASSETS_MATRIX_PUBLISH: '资产管理/矩阵发布',
  ASSETS_RISKS: '资产管理/风险提醒',
  ASSETS_LOGS: '资产管理/操作日志',
  ASSETS_OFFBOARDING: '资产管理/离职回收',
  ASSETS_SENSITIVE_VIEW: '资产管理/查看敏感字段',
  ASSETS_IMPORT_EXPORT: '资产管理/导入导出',

  GEO: 'GEO',
  GEO_OVERVIEW: 'GEO/总览',
  GEO_CONTENT: 'GEO/内容矩阵',
  GEO_ANALYTICS: 'GEO/效果分析',

  AI_ASSISTANT: 'AI助手',
  AI_CHAT: 'AI助手/AI对话',
  AI_SUGGESTIONS: 'AI助手/运营建议',
  AI_ANALYTICS: 'AI助手/数据分析',

  ENABLEMENT: '赋能中台',
  ENABLEMENT_KNOWLEDGE: '赋能中台/企业知识',
  ENABLEMENT_REVIEW: '赋能中台/知识审核',
  ENABLEMENT_PUBLISH: '赋能中台/发布管理',
  ENABLEMENT_SENSITIVE: '赋能中台/查看敏感知识',

  CO_CREATION: 'AI共创中心',
  CO_CREATION_SUBMIT: 'AI共创中心/提交需求',
  CO_CREATION_SUPERVISE: 'AI共创中心/主管确认',
  CO_CREATION_DECIDE: 'AI共创中心/管理决策',
  CO_CREATION_VALIDATE: 'AI共创中心/需求验证',

  SETTINGS: '系统设置',
  SETTINGS_EMPLOYEES_DEPARTMENTS: '系统设置/组织架构/员工&部门',
  SETTINGS_USERS: '系统设置/组织架构/员工&部门',
  SETTINGS_DEPARTMENTS: '系统设置/组织架构/员工&部门',
  SETTINGS_ROLES: '系统设置/组织架构/角色权限',
  SETTINGS_ACCOUNT_RECYCLE: '系统设置/组织架构/账号回收站',
  SETTINGS_PRODUCTS: '系统设置/产品设置/产品配置',
  SETTINGS_ORDER_TYPES: '系统设置/产品设置/订单类型',
  SETTINGS_CUSTOMER_LEVELS: '系统设置/客户设置/客户等级',
  SETTINGS_CUSTOMER_TAGS: '系统设置/客户设置/客户标签',
  SETTINGS_LIFECYCLE: '系统设置/客户设置/客户生命周期',
  SETTINGS_LEAD_SOURCES: '系统设置/客户设置/线索来源',
  SETTINGS_LEAD_FLOW: '系统设置/客户设置/线索流转',
  SETTINGS_DELIVERY_ASSIGNMENT: '系统设置/交付设置/客户成功分配',
  SETTINGS_AFTER_SALES_SOURCES: '系统设置/售后设置/来源平台与店铺',
  SETTINGS_AI_CONFIG: '系统设置/系统维护/AI大脑',
  SETTINGS_DATA_MAINTENANCE: '系统设置/系统维护/业务回收与CRM迁移',

  // Deprecated: kept only so older imports fail closed instead of crashing.
  COMMISSION: '提成',
  REFUND_CENTER: '退款中心',
} as const;

const ALL_PERMISSION_KEY = '全部';

const PERMISSION_GRANT_TREE: Record<string, string[]> = {
  [PERMISSION_KEYS.HOME]: [PERMISSION_KEYS.HOME],
  [PERMISSION_KEYS.DASHBOARD]: [PERMISSION_KEYS.DASHBOARD],

  [PERMISSION_KEYS.LEADS]: [
    PERMISSION_KEYS.LEADS_LIST,
    PERMISSION_KEYS.LEADS_DETAIL,
    PERMISSION_KEYS.LEADS_CREATE,
    PERMISSION_KEYS.LEADS_FOLLOW,
    PERMISSION_KEYS.LEADS_FLOW_CONFIG,
    PERMISSION_KEYS.LEADS_INTAKE_STATUS,
    CAPABILITY_KEYS.LEADS_RECEIVE,
    CAPABILITY_KEYS.LEADS_ASSIGN,
    PERMISSION_KEYS.LEADS_CONVERT,
  ],
  [PERMISSION_KEYS.LEADS_LIST]: [
    PERMISSION_KEYS.LEADS_DETAIL,
    PERMISSION_KEYS.LEADS_CREATE,
    PERMISSION_KEYS.LEADS_FOLLOW,
    PERMISSION_KEYS.LEADS_FLOW_CONFIG,
  ],
  [PERMISSION_KEYS.LEADS_DETAIL]: [PERMISSION_KEYS.LEADS_DETAIL],
  [PERMISSION_KEYS.LEADS_CREATE]: [PERMISSION_KEYS.LEADS_CREATE],
  [PERMISSION_KEYS.LEADS_FOLLOW]: [
    PERMISSION_KEYS.LEADS_FOLLOW,
    CAPABILITY_KEYS.LEADS_RECEIVE,
    PERMISSION_KEYS.LEADS_CONVERT,
  ],
  [PERMISSION_KEYS.LEADS_FLOW_CONFIG]: [
    PERMISSION_KEYS.LEADS_FLOW_CONFIG,
    CAPABILITY_KEYS.LEADS_ASSIGN,
  ],
  [PERMISSION_KEYS.LEADS_INTAKE_STATUS]: [PERMISSION_KEYS.LEADS_INTAKE_STATUS],
  [CAPABILITY_KEYS.LEADS_RECEIVE]: [CAPABILITY_KEYS.LEADS_RECEIVE],
  [CAPABILITY_KEYS.LEADS_ASSIGN]: [CAPABILITY_KEYS.LEADS_ASSIGN],
  [PERMISSION_KEYS.LEADS_CONVERT]: [PERMISSION_KEYS.LEADS_CONVERT],

  [PERMISSION_KEYS.CUSTOMERS]: [
    PERMISSION_KEYS.CUSTOMER_LIST,
    PERMISSION_KEYS.CUSTOMER_DETAIL,
    PERMISSION_KEYS.CUSTOMER_CREATE,
    PERMISSION_KEYS.CUSTOMER_EDIT,
    PERMISSION_KEYS.CUSTOMER_ASSIGN,
    PERMISSION_KEYS.CUSTOMER_CREATE_ORDER,
    PERMISSION_KEYS.CUSTOMER_VIEW_ORDERS,
  ],
  [PERMISSION_KEYS.CUSTOMER_LIST]: [PERMISSION_KEYS.CUSTOMER_LIST],
  [PERMISSION_KEYS.CUSTOMER_CREATE]: [PERMISSION_KEYS.CUSTOMER_CREATE],
  [PERMISSION_KEYS.CUSTOMER_DETAIL]: [PERMISSION_KEYS.CUSTOMER_DETAIL],
  [PERMISSION_KEYS.CUSTOMER_EDIT]: [PERMISSION_KEYS.CUSTOMER_EDIT],
  [PERMISSION_KEYS.CUSTOMER_ASSIGN]: [PERMISSION_KEYS.CUSTOMER_ASSIGN],
  [PERMISSION_KEYS.CUSTOMER_PUBLIC_POOL_CLAIM]: [PERMISSION_KEYS.CUSTOMER_PUBLIC_POOL_CLAIM],
  ['客户/客户详情']: [PERMISSION_KEYS.CUSTOMER_DETAIL],
  [PERMISSION_KEYS.CUSTOMER_PROFILE]: [PERMISSION_KEYS.CUSTOMER_DETAIL],
  [PERMISSION_KEYS.CUSTOMER_AI_CARD]: [PERMISSION_KEYS.CUSTOMER_DETAIL],
  [PERMISSION_KEYS.CUSTOMER_CREATE_ORDER]: [PERMISSION_KEYS.CUSTOMER_CREATE_ORDER],
  [PERMISSION_KEYS.CUSTOMER_VIEW_ORDERS]: [PERMISSION_KEYS.CUSTOMER_VIEW_ORDERS],

  [PERMISSION_KEYS.ORDERS]: [
    PERMISSION_KEYS.ORDER_MANAGE,
    PERMISSION_KEYS.ORDER_REVIEW_LIST,
    PERMISSION_KEYS.ORDER_REVIEW,
    PERMISSION_KEYS.ORDER_CREATE,
    PERMISSION_KEYS.ORDER_EDIT,
    PERMISSION_KEYS.ORDER_DELETE,
    PERMISSION_KEYS.ORDER_HISTORY,
    PERMISSION_KEYS.ORDER_PAYMENT_SCREENSHOT,
  ],
  [PERMISSION_KEYS.ORDER_MANAGE]: [PERMISSION_KEYS.ORDER_MANAGE],
  [PERMISSION_KEYS.ORDER_REVIEW_LIST]: [PERMISSION_KEYS.ORDER_REVIEW_LIST],
  [PERMISSION_KEYS.ORDER_REVIEW]: [PERMISSION_KEYS.ORDER_REVIEW],
  ['订单/订单审核台']: [
    PERMISSION_KEYS.ORDER_REVIEW_LIST,
    PERMISSION_KEYS.ORDER_REVIEW,
  ],
  [PERMISSION_KEYS.ORDER_CREATE]: [PERMISSION_KEYS.ORDER_CREATE],
  [PERMISSION_KEYS.ORDER_EDIT]: [PERMISSION_KEYS.ORDER_EDIT],
  [PERMISSION_KEYS.ORDER_DELETE]: [PERMISSION_KEYS.ORDER_DELETE],
  [PERMISSION_KEYS.ORDER_HISTORY]: [PERMISSION_KEYS.ORDER_HISTORY],
  [PERMISSION_KEYS.ORDER_PAYMENT_SCREENSHOT]: [PERMISSION_KEYS.ORDER_PAYMENT_SCREENSHOT],

  [PERMISSION_KEYS.DELIVERY]: [
    PERMISSION_KEYS.DELIVERY_CENTER,
    PERMISSION_KEYS.DELIVERY_MOVE_CARD,
    PERMISSION_KEYS.DELIVERY_STAGE_CONFIG,
  ],
  [PERMISSION_KEYS.DELIVERY_CENTER]: [PERMISSION_KEYS.DELIVERY_CENTER],
  [PERMISSION_KEYS.DELIVERY_MOVE_CARD]: [PERMISSION_KEYS.DELIVERY_MOVE_CARD],
  [PERMISSION_KEYS.DELIVERY_STAGE_CONFIG]: [PERMISSION_KEYS.DELIVERY_STAGE_CONFIG],

  [PERMISSION_KEYS.AFTER_SALES]: [
    PERMISSION_KEYS.AFTER_SALES_RECOVERY,
    PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW_LIST,
    PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW,
    PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE,
    PERMISSION_KEYS.AFTER_SALES_RECOVERY_EDIT,
    PERMISSION_KEYS.AFTER_SALES_RECOVERY_DELETE,
    PERMISSION_KEYS.AFTER_SALES_RECOVERY_HISTORY,
  ],
  [PERMISSION_KEYS.AFTER_SALES_TICKETS]: [PERMISSION_KEYS.AFTER_SALES_TICKETS],
  [PERMISSION_KEYS.AFTER_SALES_RECOVERY]: [PERMISSION_KEYS.AFTER_SALES_RECOVERY],
  [PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE]: [PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE],
  [PERMISSION_KEYS.AFTER_SALES_RECOVERY_EDIT]: [PERMISSION_KEYS.AFTER_SALES_RECOVERY_EDIT],
  [PERMISSION_KEYS.AFTER_SALES_RECOVERY_DELETE]: [PERMISSION_KEYS.AFTER_SALES_RECOVERY_DELETE],
  [PERMISSION_KEYS.AFTER_SALES_RECOVERY_HISTORY]: [PERMISSION_KEYS.AFTER_SALES_RECOVERY_HISTORY],
  [PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW_LIST]: [PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW_LIST],
  [PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW]: [PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW],
  ['售后服务/售后挽回订单']: [PERMISSION_KEYS.AFTER_SALES_RECOVERY],
  ['售后服务/售后挽回订单/新建挽回订单']: [PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE],
  ['售后服务/售后挽回订单/审核挽回订单']: [
    PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW_LIST,
    PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW,
  ],

  [PERMISSION_KEYS.FINANCE]: [PERMISSION_KEYS.FINANCE],
  [PERMISSION_KEYS.FINANCE_MY_COMMISSION]: [PERMISSION_KEYS.FINANCE_MY_COMMISSION],
  [PERMISSION_KEYS.FINANCE_OVERVIEW]: [PERMISSION_KEYS.FINANCE_MY_COMMISSION],
  [PERMISSION_KEYS.FINANCE_SETTLEMENT]: [PERMISSION_KEYS.FINANCE_SETTLEMENT],
  [PERMISSION_KEYS.FINANCE_RECOVERY_SETTLEMENT]: [PERMISSION_KEYS.FINANCE_RECOVERY_SETTLEMENT],
  [PERMISSION_KEYS.FINANCE_PAYOUT]: [PERMISSION_KEYS.FINANCE_PAYOUT],
  [PERMISSION_KEYS.FINANCE_FLOW]: [PERMISSION_KEYS.FINANCE_FLOW],
  [PERMISSION_KEYS.FINANCE_RULES]: [PERMISSION_KEYS.FINANCE_RULES],

  [PERMISSION_KEYS.ECOMMERCE_SETTLEMENT]: [
    PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_WORKBENCH,
    PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_HISTORY,
    PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_EXCEPTIONS,
    PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_TALENTS,
    PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_SETTINGS,
    PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_RULES,
  ],
  [PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_WORKBENCH]: [PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_WORKBENCH],
  [PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_HISTORY]: [PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_HISTORY],
  [PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_EXCEPTIONS]: [PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_EXCEPTIONS],
  [PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_TALENTS]: [PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_TALENTS],
  [PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_SETTINGS]: [PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_SETTINGS],
  [PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_RULES]: [PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_RULES],

  [PERMISSION_KEYS.ASSETS]: [
    PERMISSION_KEYS.ASSETS_OVERVIEW,
    PERMISSION_KEYS.ASSETS_DEVICES,
    PERMISSION_KEYS.ASSETS_PHONES,
    PERMISSION_KEYS.ASSETS_ACCOUNTS,
    PERMISSION_KEYS.ASSETS_MATRIX_PUBLISH,
    PERMISSION_KEYS.ASSETS_RISKS,
    PERMISSION_KEYS.ASSETS_LOGS,
    PERMISSION_KEYS.ASSETS_OFFBOARDING,
    PERMISSION_KEYS.ASSETS_SENSITIVE_VIEW,
    PERMISSION_KEYS.ASSETS_IMPORT_EXPORT,
  ],
  [PERMISSION_KEYS.ASSETS_OVERVIEW]: [PERMISSION_KEYS.ASSETS_OVERVIEW],
  [PERMISSION_KEYS.ASSETS_DEVICES]: [PERMISSION_KEYS.ASSETS_DEVICES],
  [PERMISSION_KEYS.ASSETS_PHONES]: [PERMISSION_KEYS.ASSETS_PHONES],
  [PERMISSION_KEYS.ASSETS_ACCOUNTS]: [PERMISSION_KEYS.ASSETS_ACCOUNTS],
  [PERMISSION_KEYS.ASSETS_MATRIX_PUBLISH]: [PERMISSION_KEYS.ASSETS_MATRIX_PUBLISH],
  [PERMISSION_KEYS.ASSETS_RISKS]: [PERMISSION_KEYS.ASSETS_RISKS],
  [PERMISSION_KEYS.ASSETS_LOGS]: [PERMISSION_KEYS.ASSETS_LOGS],
  [PERMISSION_KEYS.ASSETS_OFFBOARDING]: [PERMISSION_KEYS.ASSETS_OFFBOARDING],
  [PERMISSION_KEYS.ASSETS_SENSITIVE_VIEW]: [PERMISSION_KEYS.ASSETS_SENSITIVE_VIEW],
  [PERMISSION_KEYS.ASSETS_IMPORT_EXPORT]: [PERMISSION_KEYS.ASSETS_IMPORT_EXPORT],

  [PERMISSION_KEYS.GEO]: [
    PERMISSION_KEYS.GEO_OVERVIEW,
    PERMISSION_KEYS.GEO_CONTENT,
    PERMISSION_KEYS.GEO_ANALYTICS,
  ],
  [PERMISSION_KEYS.GEO_OVERVIEW]: [PERMISSION_KEYS.GEO_OVERVIEW],
  [PERMISSION_KEYS.GEO_CONTENT]: [PERMISSION_KEYS.GEO_CONTENT],
  [PERMISSION_KEYS.GEO_ANALYTICS]: [PERMISSION_KEYS.GEO_ANALYTICS],

  [PERMISSION_KEYS.AI_ASSISTANT]: [
    PERMISSION_KEYS.AI_CHAT,
    PERMISSION_KEYS.AI_SUGGESTIONS,
    PERMISSION_KEYS.AI_ANALYTICS,
  ],
  [PERMISSION_KEYS.AI_CHAT]: [PERMISSION_KEYS.AI_CHAT],
  [PERMISSION_KEYS.AI_SUGGESTIONS]: [PERMISSION_KEYS.AI_SUGGESTIONS],
  [PERMISSION_KEYS.AI_ANALYTICS]: [PERMISSION_KEYS.AI_ANALYTICS],

  [PERMISSION_KEYS.ENABLEMENT]: [
    PERMISSION_KEYS.ENABLEMENT_KNOWLEDGE,
    PERMISSION_KEYS.ENABLEMENT_REVIEW,
    PERMISSION_KEYS.ENABLEMENT_PUBLISH,
    PERMISSION_KEYS.ENABLEMENT_SENSITIVE,
  ],
  [PERMISSION_KEYS.ENABLEMENT_KNOWLEDGE]: [PERMISSION_KEYS.ENABLEMENT_KNOWLEDGE],
  [PERMISSION_KEYS.ENABLEMENT_REVIEW]: [PERMISSION_KEYS.ENABLEMENT_REVIEW],
  [PERMISSION_KEYS.ENABLEMENT_PUBLISH]: [PERMISSION_KEYS.ENABLEMENT_PUBLISH],
  [PERMISSION_KEYS.ENABLEMENT_SENSITIVE]: [PERMISSION_KEYS.ENABLEMENT_SENSITIVE],

  [PERMISSION_KEYS.CO_CREATION]: [
    PERMISSION_KEYS.CO_CREATION_SUBMIT,
    PERMISSION_KEYS.CO_CREATION_SUPERVISE,
    PERMISSION_KEYS.CO_CREATION_DECIDE,
    PERMISSION_KEYS.CO_CREATION_VALIDATE,
  ],
  [PERMISSION_KEYS.CO_CREATION_SUBMIT]: [PERMISSION_KEYS.CO_CREATION_SUBMIT],
  [PERMISSION_KEYS.CO_CREATION_SUPERVISE]: [PERMISSION_KEYS.CO_CREATION_SUPERVISE],
  [PERMISSION_KEYS.CO_CREATION_DECIDE]: [PERMISSION_KEYS.CO_CREATION_DECIDE],
  [PERMISSION_KEYS.CO_CREATION_VALIDATE]: [PERMISSION_KEYS.CO_CREATION_VALIDATE],

  [PERMISSION_KEYS.SETTINGS]: [
    PERMISSION_KEYS.SETTINGS_EMPLOYEES_DEPARTMENTS,
    PERMISSION_KEYS.SETTINGS_ROLES,
    PERMISSION_KEYS.SETTINGS_ACCOUNT_RECYCLE,
    PERMISSION_KEYS.SETTINGS_PRODUCTS,
    PERMISSION_KEYS.SETTINGS_ORDER_TYPES,
    PERMISSION_KEYS.SETTINGS_CUSTOMER_LEVELS,
    PERMISSION_KEYS.SETTINGS_CUSTOMER_TAGS,
    PERMISSION_KEYS.SETTINGS_LIFECYCLE,
    PERMISSION_KEYS.SETTINGS_LEAD_SOURCES,
    PERMISSION_KEYS.SETTINGS_LEAD_FLOW,
    PERMISSION_KEYS.SETTINGS_DELIVERY_ASSIGNMENT,
    PERMISSION_KEYS.SETTINGS_AFTER_SALES_SOURCES,
    PERMISSION_KEYS.SETTINGS_AI_CONFIG,
    PERMISSION_KEYS.SETTINGS_DATA_MAINTENANCE,
  ],
  [PERMISSION_KEYS.SETTINGS_EMPLOYEES_DEPARTMENTS]: [PERMISSION_KEYS.SETTINGS_EMPLOYEES_DEPARTMENTS],
  [PERMISSION_KEYS.SETTINGS_ROLES]: [PERMISSION_KEYS.SETTINGS_ROLES],
  [PERMISSION_KEYS.SETTINGS_ACCOUNT_RECYCLE]: [PERMISSION_KEYS.SETTINGS_ACCOUNT_RECYCLE],
  [PERMISSION_KEYS.SETTINGS_PRODUCTS]: [PERMISSION_KEYS.SETTINGS_PRODUCTS],
  [PERMISSION_KEYS.SETTINGS_ORDER_TYPES]: [PERMISSION_KEYS.SETTINGS_ORDER_TYPES],
  [PERMISSION_KEYS.SETTINGS_CUSTOMER_LEVELS]: [PERMISSION_KEYS.SETTINGS_CUSTOMER_LEVELS],
  [PERMISSION_KEYS.SETTINGS_CUSTOMER_TAGS]: [PERMISSION_KEYS.SETTINGS_CUSTOMER_TAGS],
  [PERMISSION_KEYS.SETTINGS_LIFECYCLE]: [PERMISSION_KEYS.SETTINGS_LIFECYCLE],
  [PERMISSION_KEYS.SETTINGS_LEAD_SOURCES]: [PERMISSION_KEYS.SETTINGS_LEAD_SOURCES],
  [PERMISSION_KEYS.SETTINGS_LEAD_FLOW]: [PERMISSION_KEYS.SETTINGS_LEAD_FLOW],
  [PERMISSION_KEYS.SETTINGS_DELIVERY_ASSIGNMENT]: [PERMISSION_KEYS.SETTINGS_DELIVERY_ASSIGNMENT],
  [PERMISSION_KEYS.SETTINGS_AFTER_SALES_SOURCES]: [PERMISSION_KEYS.SETTINGS_AFTER_SALES_SOURCES],
  [PERMISSION_KEYS.SETTINGS_AI_CONFIG]: [PERMISSION_KEYS.SETTINGS_AI_CONFIG],
  [PERMISSION_KEYS.SETTINGS_DATA_MAINTENANCE]: [PERMISSION_KEYS.SETTINGS_DATA_MAINTENANCE],
};

const PERMISSION_GRANTS_BY_NORMALIZED = new Map<string, string[]>(
  Object.entries(PERMISSION_GRANT_TREE).map(([module, grants]) => [normalizePermissionKey(module), grants]),
);

const WRITE_ACTION_PERMISSION_KEYS = [
  PERMISSION_KEYS.ORDER_CREATE,
  PERMISSION_KEYS.ORDER_EDIT,
  PERMISSION_KEYS.CUSTOMER_ASSIGN,
  PERMISSION_KEYS.CUSTOMER_PUBLIC_POOL_CLAIM,
  PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE,
  PERMISSION_KEYS.AFTER_SALES_RECOVERY_EDIT,
  PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_WORKBENCH,
  PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_SETTINGS,
  PERMISSION_KEYS.ASSETS_IMPORT_EXPORT,
  PERMISSION_KEYS.ENABLEMENT_REVIEW,
  PERMISSION_KEYS.ENABLEMENT_PUBLISH,
  PERMISSION_KEYS.CO_CREATION_SUBMIT,
  PERMISSION_KEYS.CO_CREATION_SUPERVISE,
  PERMISSION_KEYS.CO_CREATION_DECIDE,
  PERMISSION_KEYS.CO_CREATION_VALIDATE,
];

const DELETE_ACTION_PERMISSION_KEYS = [
  PERMISSION_KEYS.ORDER_DELETE,
  PERMISSION_KEYS.AFTER_SALES_RECOVERY_DELETE,
];

const ROLE_EDITOR_WRITE_ACTION_PERMISSION_KEYS = [
  PERMISSION_KEYS.LEADS_CREATE,
  PERMISSION_KEYS.LEADS_FOLLOW,
  PERMISSION_KEYS.LEADS_FLOW_CONFIG,
  PERMISSION_KEYS.LEADS_CONVERT,
  PERMISSION_KEYS.CUSTOMER_CREATE,
  PERMISSION_KEYS.CUSTOMER_EDIT,
  PERMISSION_KEYS.CUSTOMER_ASSIGN,
  PERMISSION_KEYS.CUSTOMER_PUBLIC_POOL_CLAIM,
  PERMISSION_KEYS.CUSTOMER_CREATE_ORDER,
  PERMISSION_KEYS.ORDER_REVIEW,
  PERMISSION_KEYS.ORDER_CREATE,
  PERMISSION_KEYS.ORDER_EDIT,
  PERMISSION_KEYS.DELIVERY_MOVE_CARD,
  PERMISSION_KEYS.DELIVERY_STAGE_CONFIG,
  PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE,
  PERMISSION_KEYS.AFTER_SALES_RECOVERY_EDIT,
  PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW,
  PERMISSION_KEYS.FINANCE_SETTLEMENT,
  PERMISSION_KEYS.FINANCE_RECOVERY_SETTLEMENT,
  PERMISSION_KEYS.FINANCE_PAYOUT,
  PERMISSION_KEYS.FINANCE_FLOW,
  PERMISSION_KEYS.FINANCE_RULES,
  PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_WORKBENCH,
  PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_SETTINGS,
  PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_RULES,
  PERMISSION_KEYS.ASSETS_DEVICES,
  PERMISSION_KEYS.ASSETS_PHONES,
  PERMISSION_KEYS.ASSETS_ACCOUNTS,
  PERMISSION_KEYS.ASSETS_MATRIX_PUBLISH,
  PERMISSION_KEYS.ASSETS_OFFBOARDING,
  PERMISSION_KEYS.ASSETS_IMPORT_EXPORT,
  PERMISSION_KEYS.GEO_CONTENT,
  PERMISSION_KEYS.ENABLEMENT_REVIEW,
  PERMISSION_KEYS.ENABLEMENT_PUBLISH,
  PERMISSION_KEYS.SETTINGS_EMPLOYEES_DEPARTMENTS,
  PERMISSION_KEYS.SETTINGS_ROLES,
  PERMISSION_KEYS.SETTINGS_ACCOUNT_RECYCLE,
  PERMISSION_KEYS.SETTINGS_PRODUCTS,
  PERMISSION_KEYS.SETTINGS_ORDER_TYPES,
  PERMISSION_KEYS.SETTINGS_CUSTOMER_LEVELS,
  PERMISSION_KEYS.SETTINGS_LIFECYCLE,
  PERMISSION_KEYS.SETTINGS_LEAD_SOURCES,
  PERMISSION_KEYS.SETTINGS_LEAD_FLOW,
  PERMISSION_KEYS.SETTINGS_DELIVERY_ASSIGNMENT,
  PERMISSION_KEYS.SETTINGS_AFTER_SALES_SOURCES,
  PERMISSION_KEYS.SETTINGS_AI_CONFIG,
  PERMISSION_KEYS.SETTINGS_DATA_MAINTENANCE,
];

const ROLE_EDITOR_DELETE_ACTION_PERMISSION_KEYS = [
  PERMISSION_KEYS.ORDER_DELETE,
  PERMISSION_KEYS.AFTER_SALES_RECOVERY_DELETE,
  PERMISSION_KEYS.SETTINGS_EMPLOYEES_DEPARTMENTS,
  PERMISSION_KEYS.SETTINGS_ROLES,
  PERMISSION_KEYS.SETTINGS_ACCOUNT_RECYCLE,
  PERMISSION_KEYS.SETTINGS_DATA_MAINTENANCE,
];

const ROLE_CODE_BY_USER_ROLE: Record<string, string> = {
  超级管理员: 'super_admin',
  管理员: 'super_admin',
  系统管理员: 'super_admin',
  'Super Admin': 'super_admin',
  销售经理: 'sales_manager',
  'Sales Manager': 'sales_manager',
  销售顾问: 'sales_consultant',
  'Sales Consultant': 'sales_consultant',
  销售: 'sales_consultant',
  运营专员: 'ops_admin',
  运营管理员: 'ops_admin',
  运营: 'ops_admin',
  交付工程师: 'delivery_engineer',
  财务专员: 'finance_specialist',
  财务: 'finance_specialist',
  市场专员: 'market_specialist',
  客户成功: 'customer_success',
};

export function isSuperAdmin(user?: Pick<AuthenticatedUser, 'role' | 'roleId' | 'permissions'> | null): boolean {
  if (!user) return false;
  const liveRole = getLiveRoleForAuthenticatedUser(user);
  if (liveRole) {
    return liveRole.code === 'super_admin' || roleHasPermission(liveRole, ALL_PERMISSION_KEY, 'admin');
  }
  return user.permissions?.some((permission) => (
    normalizePermissionKey(permission.module) === ALL_PERMISSION_KEY
    && permission.actions?.includes('admin')
  )) || false;
}

export function getUserRole(user: Pick<User, 'role' | 'roleId'>, roles: Role[]): Role | undefined {
  const normalizedRole = normalizeUserRoleName(user.role);
  const normalizedCode = ROLE_CODE_BY_USER_ROLE[normalizedRole] || normalizePermissionKey(normalizedRole).toLowerCase();
  return roles.find((item) => (
    item.isActive
    && (
      item.id === user.roleId
      || item.name === normalizedRole
      || normalizePermissionKey(item.code).toLowerCase() === normalizedCode
    )
  ));
}

function readLiveRoles(): Role[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ROLES);
    return raw ? (JSON.parse(raw) as Role[]) : [];
  } catch {
    return [];
  }
}

function getLiveRoleForAuthenticatedUser(user: Pick<AuthenticatedUser, 'role' | 'roleId'>): Role | undefined {
  const roles = readLiveRoles();
  if (!roles.length) return undefined;
  return getUserRole({ role: user.role, roleId: user.roleId }, roles);
}

export function roleHasPermission(role: Role | undefined, permissionKey: string, action = 'read'): boolean {
  if (!role?.isActive) return false;
  if (role.code === 'super_admin') return true;
  const requestedKeys = expandPermissionRequests(permissionKey);
  if (!requestedKeys.length) return false;
  return role.permissions.some((permission) => {
    if (!actionAllowed(getDefaultPermissionActions(permission.module, permission.actions || []), action)) return false;
    const grantedKeys = expandPermissionGrants(permission.module);
    if (grantedKeys.includes(ALL_PERMISSION_KEY)) return true;
    return grantedKeys.some((granted) => requestedKeys.includes(granted));
  });
}

export function hasRolePermission(user: Pick<User, 'role' | 'roleId' | 'isActive'>, roles: Role[], permissionKey: string, action = 'read'): boolean {
  if (!user.isActive) return false;
  return roleHasPermission(getUserRole(user, roles), permissionKey, action);
}

export function isSuperAdminUser(user: Pick<User, 'role' | 'roleId' | 'isActive'>, roles: Role[]): boolean {
  return hasRolePermission(user, roles, ALL_PERMISSION_KEY, 'admin') || getUserRole(user, roles)?.code === 'super_admin';
}

function roleHasDirectPermission(role: Role | undefined, permissionKeys: string[], action = 'read'): boolean {
  if (!role?.isActive) return false;
  if (role.code === 'super_admin') return true;
  const requestedKeys = permissionKeys.map(normalizePermissionKey);
  return role.permissions.some((permission) => (
    actionAllowed(permission.actions || [], action)
    && requestedKeys.includes(normalizePermissionKey(permission.module))
  ));
}

export function canReceiveLead(user: Pick<User, 'role' | 'roleId' | 'isActive' | 'employmentStatus'>, roles: Role[]): boolean {
  if (!user.isActive) return false;
  if ((user.employmentStatus || 'active') !== 'active') return false;
  const role = getUserRole(user, roles);
  if (role?.code === 'super_admin') return false;
  return roleHasDirectPermission(role, [
    CAPABILITY_KEYS.LEADS_RECEIVE,
    PERMISSION_KEYS.LEADS_FOLLOW,
  ]);
}

export function resolveUserPermissions(user: User, roles: Role[]): Permission[] {
  const normalizedRole = normalizeUserRoleName(user.role);
  const mappedCode = ROLE_CODE_BY_USER_ROLE[normalizedRole] || ROLE_CODE_BY_USER_ROLE[String(user.role)];
  const role = getUserRole(user, roles)
    || roles.find((item) => item.isActive && Boolean(mappedCode && item.code === mappedCode));
  if (role?.permissions?.length) return sanitizeRolePermissions(role.permissions);
  return [{ module: normalizedRole, actions: ['read'] }];
}

export function toAuthenticatedUser(user: User, roles: Role[]): AuthenticatedUser {
  return {
    id: user.id,
    name: user.name,
    account: user.account || '',
    email: user.email,
    phone: user.phone,
    role: normalizeUserRoleName(user.role),
    roleId: user.roleId,
    positionId: user.positionId,
    positionName: user.positionName,
    avatar: user.avatar,
    departmentId: user.departmentId,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    mustChangePassword: Boolean(user.mustChangePassword),
    permissions: resolveUserPermissions(user, roles),
  };
}

export function normalizePermissionKey(value: string): string {
  return String(value || '').replace(/\s+/g, '').trim();
}

function actionAllowed(actions: string[], requestedAction: string): boolean {
  if (actions.includes('admin')) return true;
  if (requestedAction === 'read') return actions.some((action) => ['read', 'write', 'delete'].includes(action));
  if (requestedAction === 'write') return actions.some((action) => ['write', 'delete'].includes(action));
  return actions.includes(requestedAction);
}

const permissionKeyMatches = (module: string, keys: string[]) => {
  const normalized = normalizePermissionKey(module);
  return keys.some((key) => normalizePermissionKey(key) === normalized);
};

export function getDefaultPermissionActions(module: string, actions: string[] = ['read']): string[] {
  const next = new Set(actions.length ? actions : ['read']);
  next.add('read');
  if (permissionKeyMatches(module, WRITE_ACTION_PERMISSION_KEYS)) next.add('write');
  if (permissionKeyMatches(module, DELETE_ACTION_PERMISSION_KEYS)) next.add('delete');
  return Array.from(next);
}

export function getRoleEditorPermissionActions(module: string): string[] {
  const next = new Set<string>(['read']);
  if (permissionKeyMatches(module, ROLE_EDITOR_WRITE_ACTION_PERMISSION_KEYS)) next.add('write');
  if (permissionKeyMatches(module, ROLE_EDITOR_DELETE_ACTION_PERMISSION_KEYS)) next.add('delete');
  return Array.from(next);
}

function expandPermissionGrants(module: string): string[] {
  const normalized = normalizePermissionKey(module);
  if (normalized === ALL_PERMISSION_KEY) return [ALL_PERMISSION_KEY];
  const grants = PERMISSION_GRANTS_BY_NORMALIZED.get(normalized);
  return (grants || []).map(normalizePermissionKey);
}

function expandPermissionRequests(module: string): string[] {
  const normalized = normalizePermissionKey(module);
  if (normalized === ALL_PERMISSION_KEY) return [ALL_PERMISSION_KEY];
  const keys = new Set<string>(expandPermissionGrants(module));
  keys.add(normalized);
  for (const [permissionKey, grants] of PERMISSION_GRANTS_BY_NORMALIZED.entries()) {
    if (permissionKey.startsWith(`${normalized}/`)) {
      keys.add(permissionKey);
      grants.map(normalizePermissionKey).forEach((grant) => keys.add(grant));
    }
  }
  return Array.from(keys);
}

function getSanitizedPermissionModules(module: string): string[] {
  const normalized = normalizePermissionKey(module);
  if (normalized === ALL_PERMISSION_KEY) return [ALL_PERMISSION_KEY];
  return PERMISSION_GRANTS_BY_NORMALIZED.get(normalized) || [];
}

function isReadOnlyPermissionActions(actions: string[] = []): boolean {
  const normalized = actions.length ? actions : ['read'];
  return normalized.every((action) => action === 'read');
}

function getReadOnlyExpandedModules(permissions: Permission[]): Set<string> {
  const actionsByModule = new Map<string, string[]>();
  permissions.forEach((permission) => {
    actionsByModule.set(normalizePermissionKey(permission.module), permission.actions || []);
  });

  const expanded = new Set<string>();
  Object.values(PERMISSION_GRANT_TREE).forEach((grants) => {
    const normalizedGrants = grants.map(normalizePermissionKey);
    if (normalizedGrants.length <= 1) return;
    const isCompleteReadOnlyGroup = normalizedGrants.every((module) => (
      actionsByModule.has(module)
      && isReadOnlyPermissionActions(actionsByModule.get(module))
    ));
    if (isCompleteReadOnlyGroup) {
      normalizedGrants.forEach((module) => expanded.add(module));
    }
  });
  return expanded;
}

export function sanitizeRolePermissions(permissions: Permission[] = []): Permission[] {
  const merged = new Map<string, Set<string>>();
  const readOnlyExpandedModules = getReadOnlyExpandedModules(permissions);

  permissions.forEach((permission) => {
    const modules = getSanitizedPermissionModules(permission.module);
    const isReadOnlyExpandedModule = (
      readOnlyExpandedModules.has(normalizePermissionKey(permission.module))
      && isReadOnlyPermissionActions(permission.actions || [])
    );
    const permissionActions = isReadOnlyExpandedModule
      ? ['read']
      : getDefaultPermissionActions(permission.module, permission.actions || []);
    modules.forEach((module) => {
      const actions = merged.get(module) || new Set<string>();
      permissionActions.forEach((action) => actions.add(action));
      merged.set(module, actions);
    });
  });

  return Array.from(merged.entries()).map(([module, actions]) => ({
    module,
    actions: Array.from(actions),
  }));
}

export function hasPermission(
  user: Pick<AuthenticatedUser, 'role' | 'roleId' | 'permissions' | 'isActive'> | null | undefined,
  permissionKey: string,
  action = 'read',
): boolean {
  if (!user?.isActive) return false;
  if (normalizePermissionKey(permissionKey) === PERMISSION_KEYS.HOME) return true;
  const liveRole = getLiveRoleForAuthenticatedUser(user);
  if (liveRole) return roleHasPermission(liveRole, permissionKey, action);
  if (isSuperAdmin(user)) return true;

  const requestedKeys = expandPermissionRequests(permissionKey);
  if (!requestedKeys.length) return false;
  return user.permissions.some((permission) => {
    if (!actionAllowed(permission.actions || [], action)) return false;
    const grantedKeys = expandPermissionGrants(permission.module);
    if (grantedKeys.includes(ALL_PERMISSION_KEY)) return true;
    return grantedKeys.some((granted) => requestedKeys.includes(granted));
  });
}

export function hasExplicitPermission(
  user: Pick<AuthenticatedUser, 'permissions' | 'isActive'> | null | undefined,
  permissionKey: string,
  action = 'read',
): boolean {
  if (!user?.isActive) return false;
  const normalizedKey = normalizePermissionKey(permissionKey);
  return user.permissions.some((permission) => {
    const normalizedModule = normalizePermissionKey(permission.module);
    if (normalizedModule === ALL_PERMISSION_KEY && permission.actions?.includes('admin')) return true;
    return normalizedModule === normalizedKey && actionAllowed(permission.actions || [], action);
  });
}

export function canReviewRecoveryOrders(
  user: Pick<AuthenticatedUser, 'permissions' | 'isActive'> | null | undefined,
): boolean {
  return hasExplicitPermission(user, PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW, 'write');
}
