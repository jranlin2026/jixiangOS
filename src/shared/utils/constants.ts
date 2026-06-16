/** 路由路径常量 */
export const ROUTES = {
  HOME: '/',
  LEADS: '/leads',
  LEAD_DETAIL: '/leads/:id',
  CUSTOMERS: '/customers',
  CUSTOMER_DETAIL: '/customers/:id',
  ORDERS: '/orders',
  ORDER_DETAIL: '/orders/:id',
  DELIVERY: '/delivery',
  COMMISSION: '/commission',
  FINANCE: '/finance',
  UPGRADE_ANALYSIS: '/upgrade-analysis',
  AI_ASSISTANT: '/ai-assistant',
  SETTINGS: '/settings',
  REFUND_CENTER: '/refund-center',
  UPGRADE_POOL: '/upgrade-pool',
} as const;

/** 产品等级枚举 */
export const PRODUCT_LEVELS = {
  LEVEL_899: '899',
  LEVEL_COURSE: '课程',
  LEVEL_AGENT: '代理',
  LEVEL_OEM: '贴牌',
  LEVEL_PARTNER: '合伙人',
} as const;

export type ProductLevel = string;

/** 产品等级颜色映射 */
export const PRODUCT_LEVEL_COLOR_MAP: Record<string, string> = {
  '899': '#2196F3',
  '课程': '#00BCD4',
  '代理': '#4CAF50',
  '贴牌': '#9C27B0',
  '合伙人': '#FF9800',
};

/** 产品等级浅色背景映射 */
export const PRODUCT_LEVEL_BG_MAP: Record<string, string> = {
  '899': '#E3F2FD',
  '课程': '#E0F7FA',
  '代理': '#E8F5E9',
  '贴牌': '#F3E5F5',
  '合伙人': '#FFF3E0',
};

/** 客户等级颜色映射 */
export const CUSTOMER_LEVEL_COLOR_MAP: Record<string, string> = {
  L1: '#9E9E9E',
  L2: '#2196F3',
  L3: '#4CAF50',
  L4: '#9C27B0',
  L5: '#FF9800',
};

/** 客户等级标签 */
export const CUSTOMER_LEVEL_LABELS: Record<string, string> = {
  L1: '潜客',
  L2: '智能体用户',
  L3: '代理',
  L4: 'OEM贴牌',
  L5: '合伙人',
};

/** 客户等级列表 */
export const CUSTOMER_LEVELS = [
  { value: 'L1', label: 'L1-潜客', color: '#9E9E9E' },
  { value: 'L2', label: 'L2-智能体用户', color: '#2196F3' },
  { value: 'L3', label: 'L3-代理', color: '#4CAF50' },
  { value: 'L4', label: 'L4-OEM贴牌', color: '#9C27B0' },
  { value: 'L5', label: 'L5-合伙人', color: '#FF9800' },
] as const;

/** 提成比例 */
export const COMMISSION_RATES: Record<string, number> = {
  '899': 0.10,
  '课程': 0.10,
  '代理': 0.15,
  '贴牌': 0.20,
  '合伙人': 0.25,
};

/** 线索状态枚举 */
export const LEAD_STATUS = {
  NEW: '新线索',
  CONTACTED: '已联系',
  QUALIFIED: '已验证',
  PROPOSAL: '方案中',
  NEGOTIATION: '谈判中',
  WON: '已成交',
  LOST: '已流失',
} as const;

export type LeadStatus = (typeof LEAD_STATUS)[keyof typeof LEAD_STATUS];

/** 线索来源 */
export const LEAD_SOURCES = {
  WEBSITE: '官网',
  REFERRAL: '转介绍',
  AD: '广告',
  EXHIBITION: '展会',
  SOCIAL: '社交媒体',
  COLD_CALL: '电话营销',
  OTHER: '其他',
} as const;

export type LeadSource = (typeof LEAD_SOURCES)[keyof typeof LEAD_SOURCES];

/** 跟进方式 */
export const FOLLOW_UP_TYPES = {
  PHONE: '电话',
  WECHAT: '微信',
  EMAIL: '邮件',
  VISIT: '上门',
  MEETING: '会议',
  OTHER: '其他',
} as const;

export type FollowUpType = (typeof FOLLOW_UP_TYPES)[keyof typeof FOLLOW_UP_TYPES];

/** 订单状态 */
export const ORDER_STATUS = {
  PENDING: '待确认',
  CONFIRMED: '已确认',
  PROCESSING: '处理中',
  COMPLETED: '已完成',
  REFUNDING: '退款中',
  REFUNDED: '已退款',
  CANCELLED: '已取消',
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

/** 退款状态 */
export const REFUND_STATUS = {
  NONE: '无',
  PENDING: '退款申请中',
  APPROVED: '退款已批准',
  COMPLETED: '退款已完成',
  REJECTED: '退款已拒绝',
} as const;

export type RefundStatus = (typeof REFUND_STATUS)[keyof typeof REFUND_STATUS];

/** 交付流程阶段 — 899产品 */
export const DELIVERY_STAGES_899 = [
  '合同签订',
  '需求确认',
  '系统部署',
  '培训交付',
  '验收完成',
] as const;

/** 交付流程阶段 — 课程产品 */
export const DELIVERY_STAGES_COURSE = [
  '合同签订',
  '课程安排',
  '授课进行',
  '培训完成',
  '验收完成',
] as const;

/** 交付流程阶段 — 代理产品 */
export const DELIVERY_STAGES_AGENT = [
  '合同签订',
  '代理授权',
  '系统开通',
  '培训完成',
  '运营支持',
] as const;

/** 交付流程阶段 — 贴牌产品 */
export const DELIVERY_STAGES_OEM = [
  '合同签订',
  '品牌定制',
  '系统部署',
  '测试验收',
  '上线运营',
] as const;

export type DeliveryStage899 = (typeof DELIVERY_STAGES_899)[number];
export type DeliveryStageAgent = (typeof DELIVERY_STAGES_AGENT)[number];
export type DeliveryStageOem = (typeof DELIVERY_STAGES_OEM)[number];

/** 渠道类型 */
export const CHANNEL_TYPES = {
  SEARCH: '搜索引擎',
  SOCIAL: '社交媒体',
  EXHIBITION: '展会',
  REFERRAL: '转介绍',
  DIRECT: '直销',
} as const;

export type ChannelType = (typeof CHANNEL_TYPES)[keyof typeof CHANNEL_TYPES];

/** 提成状态 */
export const COMMISSION_STATUS = {
  PENDING_REVIEW: '待审核',
  PENDING: '待发放',
  PAID: '已发放',
  CANCELLED: '已取消',
} as const;

export type CommissionStatus = (typeof COMMISSION_STATUS)[keyof typeof COMMISSION_STATUS];

/** 提成制度场景 */
export const COMMISSION_SCENES = [
  { value: '899成交', label: '899成交' },
  { value: '新代理', label: '新代理' },
  { value: '成交线索转代理', label: '成交线索转代理' },
  { value: '成交线索转新代理', label: '成交线索转新代理' },
  { value: '代理升单', label: '代理升单' },
  { value: '代理复购', label: '代理复购' },
  { value: '退款挽回', label: '退款挽回' },
  { value: '转介绍成交', label: '转介绍成交' },
  { value: '智能体服务', label: '智能体服务' },
  { value: '个人资源成交', label: '个人资源成交' },
] as const;

/** 资源归属 */
export const RESOURCE_OWNERSHIPS = [
  { value: '公司资源', label: '公司资源' },
  { value: '个人资源', label: '个人资源' },
] as const;

/** 官方收款渠道 */
export const OFFICIAL_PAYMENT_CHANNELS = [
  { value: '企业微信转账', label: '企业微信转账' },
  { value: '企业支付宝转账', label: '企业支付宝转账' },
  { value: '对公银行转账', label: '对公银行转账' },
  { value: '公司自营小店', label: '公司自营小店' },
  { value: '非官方渠道', label: '非官方渠道' },
] as const;

/** 凭证状态 */
export const PROOF_STATUSES = [
  { value: '无需凭证', label: '无需凭证' },
  { value: '待补充', label: '待补充' },
  { value: '已上传', label: '已上传' },
] as const;

/** AI 查询场景 */
export const AI_QUERY_SCENARIOS = {
  SALES_DATA: 'sales_data',
  REFUND_REASON: 'refund_reason',
  SALES_RANKING: 'sales_ranking',
  CONVERSION_RATE: 'conversion_rate',
  HIGH_POTENTIAL: 'high_potential',
  GENERAL: 'general',
} as const;

/** localStorage 键名前缀 */
export const STORAGE_PREFIX = 'aaos_';

/** localStorage 键名 */
export const STORAGE_KEYS = {
  LEADS: `${STORAGE_PREFIX}leads`,
  CUSTOMERS: `${STORAGE_PREFIX}customers`,
  ORDERS: `${STORAGE_PREFIX}orders`,
  DELIVERIES: `${STORAGE_PREFIX}deliveries`,
  COMMISSIONS: `${STORAGE_PREFIX}commissions`,
  FINANCE: `${STORAGE_PREFIX}finance`,
  USERS: `${STORAGE_PREFIX}users`,
  CHANNELS: `${STORAGE_PREFIX}channels`,
  AI_SESSIONS: `${STORAGE_PREFIX}ai_sessions`,
  DEPARTMENTS: `${STORAGE_PREFIX}departments`,
  ROLES: `${STORAGE_PREFIX}roles`,
  PRODUCTS: `${STORAGE_PREFIX}products`,
  REFUNDS: `${STORAGE_PREFIX}refunds`,
  UPGRADE_POOL: `${STORAGE_PREFIX}upgrade_pool`,
  COMMISSION_RULES: `${STORAGE_PREFIX}commission_rules`,
  TAGS: `${STORAGE_PREFIX}tags`,
  INITIALIZED: `${STORAGE_PREFIX}initialized`,
} as const;

/** 分页默认值 */
export const DEFAULT_PAGE_SIZE = 20;
export const DEFAULT_PAGE = 1;

/** 产品等级 → 客户等级映射 */
export const PRODUCT_TO_CUSTOMER_LEVEL: Record<string, string> = {
  '899': 'L2',
  '课程': 'L2',
  '代理': 'L3',
  '贴牌': 'L4',
  '合伙人': 'L5',
};

/** 预设提成规则 — 多角色分佣，每条规则对应一个角色 */
export const COMMISSION_RULES = [
  // 899成交
  { id: 'rule-001', name: '899成交-销售(公司资源)', productLevel: '899', orderType: '899成交', sourceType: '公司资源', role: '销售' as const, commissionType: 'fixed' as const, commissionValue: 120, isActive: true, priority: 10 },
  { id: 'rule-002', name: '899成交-销售(自拓)', productLevel: '899', orderType: '899成交', sourceType: '自拓', role: '销售' as const, commissionType: 'fixed' as const, commissionValue: 200, isActive: true, priority: 11 },
  { id: 'rule-003', name: '899成交-线索', productLevel: '899', orderType: '899成交', sourceType: '', role: '线索' as const, commissionType: 'fixed' as const, commissionValue: 30, isActive: true, priority: 12 },
  // 新代理
  { id: 'rule-004', name: '新代理-销售', productLevel: '代理', orderType: '新代理', sourceType: '', role: '销售' as const, commissionType: 'percentage' as const, commissionValue: 8, isActive: true, priority: 20 },
  { id: 'rule-005', name: '新代理-线索', productLevel: '代理', orderType: '新代理', sourceType: '', role: '线索' as const, commissionType: 'percentage' as const, commissionValue: 3, isActive: true, priority: 21 },
  { id: 'rule-006', name: '新代理-客户成功', productLevel: '代理', orderType: '新代理', sourceType: '', role: '客户成功' as const, commissionType: 'percentage' as const, commissionValue: 1, isActive: true, priority: 22 },
  // 贴牌
  { id: 'rule-007', name: '贴牌-销售', productLevel: '贴牌', orderType: '新购', sourceType: '', role: '销售' as const, commissionType: 'percentage' as const, commissionValue: 8, isActive: true, priority: 30 },
  { id: 'rule-008', name: '贴牌-线索', productLevel: '贴牌', orderType: '新购', sourceType: '', role: '线索' as const, commissionType: 'percentage' as const, commissionValue: 3, isActive: true, priority: 31 },
  { id: 'rule-009', name: '贴牌-客户成功', productLevel: '贴牌', orderType: '新购', sourceType: '', role: '客户成功' as const, commissionType: 'percentage' as const, commissionValue: 1, isActive: true, priority: 32 },
  // 合伙人
  { id: 'rule-010', name: '合伙人-销售', productLevel: '合伙人', orderType: '新购', sourceType: '', role: '销售' as const, commissionType: 'percentage' as const, commissionValue: 8, isActive: true, priority: 40 },
  { id: 'rule-011', name: '合伙人-线索', productLevel: '合伙人', orderType: '新购', sourceType: '', role: '线索' as const, commissionType: 'percentage' as const, commissionValue: 3, isActive: true, priority: 41 },
  { id: 'rule-012', name: '合伙人-客户成功', productLevel: '合伙人', orderType: '新购', sourceType: '', role: '客户成功' as const, commissionType: 'percentage' as const, commissionValue: 1, isActive: true, priority: 42 },
  // 升单
  { id: 'rule-013', name: '代理升单-销售', productLevel: '', orderType: '代理升单', sourceType: '', role: '销售' as const, commissionType: 'percentage' as const, commissionValue: 8, isActive: true, priority: 5 },
  { id: 'rule-014', name: '代理升单-客户成功', productLevel: '', orderType: '代理升单', sourceType: '', role: '客户成功' as const, commissionType: 'percentage' as const, commissionValue: 1, isActive: true, priority: 6 },
  // 通用升级
  { id: 'rule-015', name: '升级-销售', productLevel: '', orderType: '升级', sourceType: '', role: '销售' as const, commissionType: 'percentage' as const, commissionValue: 8, isActive: true, priority: 50 },
  { id: 'rule-016', name: '升级-客户成功', productLevel: '', orderType: '升级', sourceType: '', role: '客户成功' as const, commissionType: 'percentage' as const, commissionValue: 1, isActive: true, priority: 51 },
  // 续费
  { id: 'rule-017', name: '续费-客户成功', productLevel: '', orderType: '续费', sourceType: '', role: '客户成功' as const, commissionType: 'percentage' as const, commissionValue: 2, isActive: true, priority: 60 },
  // 课程
  { id: 'rule-018', name: '课程成交-销售(公司资源)', productLevel: '课程', orderType: '新购', sourceType: '公司资源', role: '销售' as const, commissionType: 'fixed' as const, commissionValue: 200, isActive: true, priority: 70 },
  { id: 'rule-019', name: '课程成交-销售(自拓)', productLevel: '课程', orderType: '新购', sourceType: '自拓', role: '销售' as const, commissionType: 'fixed' as const, commissionValue: 300, isActive: true, priority: 71 },
  { id: 'rule-020', name: '课程成交-线索', productLevel: '课程', orderType: '新购', sourceType: '', role: '线索' as const, commissionType: 'fixed' as const, commissionValue: 50, isActive: true, priority: 72 },
];

/** 退款分类 */
export const REFUND_CATEGORIES = [
  { value: '产品质量', label: '产品质量' },
  { value: '服务不满意', label: '服务不满意' },
  { value: '预算调整', label: '预算调整' },
  { value: '需求变更', label: '需求变更' },
  { value: '其他', label: '其他' },
] as const;

/** 订单类型列表 — 匹配提成业务场景 */
export const ORDER_TYPES = [
  { value: '899成交', label: '899成交' },
  { value: '新代理', label: '新代理' },
  { value: '成交线索转代理', label: '成交线索转代理' },
  { value: '成交线索转新代理', label: '成交线索转新代理' },
  { value: '代理升单', label: '代理升单' },
  { value: '代理复购', label: '代理复购' },
  { value: '退款挽回', label: '退款挽回' },
  { value: '转介绍成交', label: '转介绍成交' },
  { value: '新购', label: '新购' },
  { value: '续费', label: '续费' },
  { value: '升级', label: '升级' },
  { value: '增购', label: '增购' },
] as const;

/** 支付方式列表 */
export const PAYMENT_METHODS = [
  { value: '银行转账', label: '银行转账' },
  { value: '支付宝', label: '支付宝' },
  { value: '微信支付', label: '微信支付' },
  { value: '对公转账', label: '对公转账' },
  { value: '现金', label: '现金' },
] as const;

/** 预设产品列表 */
export const PRODUCT_LIST = [
  { id: 'prod-001', name: '899智能体', level: '899' as const, price: 899, originalPrice: 1299, description: '基础AI智能体，适合个人和小团队', features: ['AI对话', '知识库', '基础分析'], deliveryStages: [...DELIVERY_STAGES_899], isActive: true, sortOrder: 1 },
  { id: 'prod-002', name: '2980课程', level: '课程' as const, price: 2980, originalPrice: 3980, description: 'AI运营实战课程，系统学习AI应用', features: ['在线课程', '实操指导', '社群答疑'], deliveryStages: [...DELIVERY_STAGES_COURSE], isActive: true, sortOrder: 2 },
  { id: 'prod-003', name: '9800代理', level: '代理' as const, price: 9800, originalPrice: 12800, description: '区域代理授权，享受代理分销权益', features: ['代理授权', '系统开通', '培训支持', '运营指导'], deliveryStages: [...DELIVERY_STAGES_AGENT], isActive: true, sortOrder: 3 },
  { id: 'prod-004', name: '29800贴牌', level: '贴牌' as const, price: 29800, originalPrice: 39800, description: '品牌定制版，打造专属AI品牌', features: ['品牌定制', '独立部署', '技术支持', '持续升级'], deliveryStages: [...DELIVERY_STAGES_OEM], isActive: true, sortOrder: 4 },
  { id: 'prod-005', name: '59800合伙人', level: '合伙人' as const, price: 59800, originalPrice: 79800, description: '战略合伙人，深度合作共享收益', features: ['战略合伙', '利益共享', '优先支持', '定制开发'], deliveryStages: [...DELIVERY_STAGES_899], isActive: true, sortOrder: 5 },
];
