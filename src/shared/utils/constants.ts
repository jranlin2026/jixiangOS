/** 路由路径常量 */
export const ROUTES = {
  HOME: '/',
  DASHBOARD: '/dashboard',
  LEADS: '/leads',
  LEAD_DETAIL: '/leads/:id',
  OPPORTUNITIES: '/opportunities',
  CUSTOMERS: '/customers',
  CUSTOMER_DETAIL: '/customers/:id',
  ORDERS: '/orders',
  ORDER_REVIEW: '/order-review',
  ORDER_DETAIL: '/orders/:id',
  DELIVERY: '/delivery',
  AFTER_SALES: '/after-sales',
  COMMISSION: '/commission',
  FINANCE: '/finance',
  ECOMMERCE_SETTLEMENT: '/ecommerce-settlement',
  ASSETS: '/assets',
  GEO: '/geo',
  AI_ASSISTANT: '/ai-assistant',
  ENABLEMENT: '/enablement',
  CO_CREATION: '/co-creation',
  SETTINGS: '/settings',
  REFUND_CENTER: '/refund-center',
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

/** 默认产品等级/业务分类配置 */
export const DEFAULT_PRODUCT_LEVEL_CONFIGS = [
  { id: 'plc-001', name: '899', color: '#2196F3', isActive: true, sortOrder: 1 },
  { id: 'plc-002', name: '课程', color: '#00BCD4', isActive: true, sortOrder: 2 },
  { id: 'plc-003', name: '代理', color: '#4CAF50', isActive: true, sortOrder: 3 },
  { id: 'plc-004', name: '贴牌', color: '#9C27B0', isActive: true, sortOrder: 4 },
  { id: 'plc-005', name: '合伙人', color: '#FF9800', isActive: true, sortOrder: 5 },
] as const;

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

/** 默认客户等级配置 */
export const DEFAULT_CUSTOMER_LEVEL_CONFIGS = CUSTOMER_LEVELS.map((level, index) => ({
  id: `clc-${index + 1}`,
  value: level.value,
  label: level.label,
  color: level.color,
  description: '',
  isActive: true,
  sortOrder: index + 1,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
}));

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
  TO_ASSIGN: '待分配',
  RECOVERING: '挽回中',
  RECOVERY_SUCCESS: '挽回成功',
  WAITING_FINANCE: '待财务退款',
  PENDING: '退款申请中',
  APPROVED: '退款已批准',
  COMPLETED: '退款已完成',
  REJECTED: '退款已拒绝',
} as const;

export type RefundStatus = (typeof REFUND_STATUS)[keyof typeof REFUND_STATUS];

/** 交付流程阶段默认不预设，交付步骤完全由产品配置决定 */
export const DELIVERY_STAGES_899 = [] as const;
export const DELIVERY_STAGES_COURSE = [] as const;
export const DELIVERY_STAGES_AGENT = [] as const;
export const DELIVERY_STAGES_OEM = [] as const;

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
  WITHDRAWN: '已撤回',
  CHARGEBACK_PENDING: '待冲销',
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
  { value: '售后挽回', label: '售后挽回' },
  { value: '转介绍成交', label: '转介绍成交' },
  { value: '智能体服务', label: '智能体服务' },
  { value: '个人资源成交', label: '个人资源成交' },
] as const;

/** 资源归属 */
export const RESOURCE_OWNERSHIPS = [
  { value: '公司资源', label: '公司资源' },
  { value: '个人资源', label: '个人资源' },
] as const;

export function normalizeResourceOwnership(value?: string | null): '公司资源' | '个人资源' {
  const text = String(value || '').trim();
  if (text.includes('个人') || text.includes('自拓') || text.includes('转介绍')) return '个人资源';
  return '公司资源';
}

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
  ORDER_APPLICATIONS: `${STORAGE_PREFIX}order_applications`,
  DELIVERIES: `${STORAGE_PREFIX}deliveries`,
  COMMISSIONS: `${STORAGE_PREFIX}commissions`,
  COMMISSION_OPERATION_LOGS: `${STORAGE_PREFIX}commission_operation_logs`,
  FINANCE: `${STORAGE_PREFIX}finance`,
  USERS: `${STORAGE_PREFIX}users`,
  AI_SESSIONS: `${STORAGE_PREFIX}ai_sessions`,
  DEPARTMENTS: `${STORAGE_PREFIX}departments`,
  POSITIONS: `${STORAGE_PREFIX}positions`,
  ROLES: `${STORAGE_PREFIX}roles`,
  ORGANIZATION_SCHEMA_VERSION: `${STORAGE_PREFIX}organization_schema_version`,
  ORGANIZATION_PROFILE: `${STORAGE_PREFIX}organization_profile`,
  PRODUCTS: `${STORAGE_PREFIX}products`,
  PRODUCT_LEVELS: `${STORAGE_PREFIX}product_levels`,
  CUSTOMER_LEVEL_CONFIGS: `${STORAGE_PREFIX}customer_level_configs`,
  ORDER_TYPE_CONFIGS: `${STORAGE_PREFIX}order_type_configs`,
  LIFECYCLE_STATUS_CONFIGS: `${STORAGE_PREFIX}lifecycle_status_configs`,
  REFUNDS: `${STORAGE_PREFIX}refunds`,
  RECOVERY_ORDERS: `${STORAGE_PREFIX}recovery_orders`,
  AI_CARDS: `${STORAGE_PREFIX}ai_cards`,
  SERVICE_TICKETS: `${STORAGE_PREFIX}service_tickets`,
  OPPORTUNITIES: `${STORAGE_PREFIX}opportunities`,
  ASSET_DEVICES: `${STORAGE_PREFIX}asset_devices`,
  ASSET_PHONE_NUMBERS: `${STORAGE_PREFIX}asset_phone_numbers`,
  ASSET_INTERNET_ACCOUNTS: `${STORAGE_PREFIX}asset_internet_accounts`,
  ASSET_RISKS: `${STORAGE_PREFIX}asset_risks`,
  ASSET_OPERATION_LOGS: `${STORAGE_PREFIX}asset_operation_logs`,
  ASSET_OFFBOARDING_TASKS: `${STORAGE_PREFIX}asset_offboarding_tasks`,
  ASSET_MATRIX_PUBLISH_TASKS: `${STORAGE_PREFIX}asset_matrix_publish_tasks`,
  LEAD_FLOW_CONFIG: `${STORAGE_PREFIX}lead_flow_config`,
  LEAD_INTAKE_RECORDS: `${STORAGE_PREFIX}lead_intake_records`,
  LEAD_SOURCE_CONFIGS: `${STORAGE_PREFIX}lead_source_configs`,
  COMMISSION_RULES: `${STORAGE_PREFIX}commission_rules`,
  COMMISSION_ROLE_CONFIGS: `${STORAGE_PREFIX}commission_role_configs`,
  COMMISSION_PAYOUT_PLANS: `${STORAGE_PREFIX}commission_payout_plans`,
  COMMISSION_SETTLEMENT_BATCHES: `${STORAGE_PREFIX}commission_settlement_batches`,
  ECOMMERCE_SETTLEMENT_RECORDS: `${STORAGE_PREFIX}ecommerce_settlement_records`,
  ECOMMERCE_SETTLEMENT_CONFIG: `${STORAGE_PREFIX}ecommerce_settlement_config`,
  MONTHLY_COMMISSION_TIER_CONFIGS: `${STORAGE_PREFIX}monthly_commission_tier_configs`,
  TAGS: `${STORAGE_PREFIX}tags`,
  INITIALIZED: `${STORAGE_PREFIX}initialized`,
} as const;

/** 从配置中读取产品等级颜色；配置不存在时回退到旧常量 */
export const getProductLevelColor = (level?: string, fallback = '#9ca3af'): string => {
  if (!level) return fallback;
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.PRODUCT_LEVELS);
      if (raw) {
        const configs = JSON.parse(raw) as Array<{ name: string; color: string; isActive?: boolean }>;
        const config = configs.find((item) => item.name === level && item.isActive !== false);
        if (config?.color) return config.color;
      }
    } catch {
      // 使用默认颜色兜底
    }
  }
  return PRODUCT_LEVEL_COLOR_MAP[level] || fallback;
};

export const getProductLevelRowSx = (level?: string) => {
  const color = getProductLevelColor(level);
  return {
    bgcolor: `${color}08`,
    '&:hover': {
      bgcolor: `${color}12`,
    },
  };
};

export const getCustomerLevelConfig = (level?: string) => {
  if (!level) return undefined;
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.CUSTOMER_LEVEL_CONFIGS);
      if (raw) {
        const configs = JSON.parse(raw) as Array<{ value: string; label: string; color: string; isActive?: boolean }>;
        const config = configs.find((item) => item.value === level && item.isActive !== false);
        if (config) return config;
      }
    } catch {
      // 使用默认客户等级兜底
    }
  }
  return DEFAULT_CUSTOMER_LEVEL_CONFIGS.find((item) => item.value === level);
};

/** 分页默认值 */
type SoftTagTone = {
  bgcolor: string;
  color: string;
  borderColor: string;
};

const TAG_TONES = {
  neutral: { bgcolor: '#f3f4f6', color: '#4b5563', borderColor: '#e5e7eb' },
  blue: { bgcolor: '#e8f2ff', color: '#0f5fca', borderColor: '#cfe3fb' },
  cyan: { bgcolor: '#e6f6fb', color: '#08768f', borderColor: '#c9edf6' },
  green: { bgcolor: '#e7f7ef', color: '#16815c', borderColor: '#c9ead9' },
  purple: { bgcolor: '#f1ecff', color: '#6d4cc2', borderColor: '#ded3ff' },
  amber: { bgcolor: '#fff4e5', color: '#b45309', borderColor: '#f8ddb7' },
  rose: { bgcolor: '#fff1f2', color: '#be123c', borderColor: '#ffd5dc' },
  slate: { bgcolor: '#f1f5f9', color: '#475569', borderColor: '#dbe3ec' },
} satisfies Record<string, SoftTagTone>;

const softTagBaseSx = (tone: SoftTagTone) => ({
  bgcolor: tone.bgcolor,
  color: tone.color,
  border: `1px solid ${tone.borderColor}`,
  fontWeight: 700,
  fontSize: '0.75rem',
  height: 24,
  borderRadius: '6px',
  '& .MuiChip-label': {
    px: 0.75,
    lineHeight: 1.2,
  },
});

const normalizeTagText = (value?: string) => (value || '').toLowerCase();

const pickProductTone = (level?: string) => {
  const text = normalizeTagText(level);
  if (text.includes('ai') || text.includes('899') || text.includes('智能体')) return TAG_TONES.blue;
  if (text.includes('课程')) return TAG_TONES.cyan;
  if (text.includes('代理')) return TAG_TONES.green;
  if (text.includes('贴牌') || text.includes('oem')) return TAG_TONES.purple;
  if (text.includes('合伙人')) return TAG_TONES.amber;
  return TAG_TONES.neutral;
};

const pickCustomerTone = (level?: string) => {
  const text = normalizeTagText(level);
  if (text.includes('l5') || text.includes('合伙人')) return TAG_TONES.amber;
  if (text.includes('l4') || text.includes('oem') || text.includes('贴牌')) return TAG_TONES.purple;
  if (text.includes('l3') || text.includes('代理')) return TAG_TONES.green;
  if (text.includes('l2') || text.includes('智能体')) return TAG_TONES.blue;
  return TAG_TONES.neutral;
};

const pickLifecycleTone = (status?: string) => {
  const text = normalizeTagText(status);
  if (text.includes('pending_followup') || text.includes('待跟进')) return TAG_TONES.neutral;
  if (text.includes('following') || text.includes('跟进中')) return TAG_TONES.blue;
  if (text.includes('ordered') || text.includes('订单')) return TAG_TONES.green;
  if (text.includes('refunded') || text.includes('退款')) return TAG_TONES.rose;
  if (text.includes('public_pool') || text.includes('公海') || text.includes('流失')) return TAG_TONES.slate;
  return TAG_TONES.neutral;
};

export const getSoftTagSx = (tone: SoftTagTone = TAG_TONES.neutral) => softTagBaseSx(tone);

export const getProductLevelTagSx = (level?: string) => softTagBaseSx(pickProductTone(level));

export const getCustomerLevelTagSx = (levelOrLabel?: string) => softTagBaseSx(pickCustomerTone(levelOrLabel));

export const getLifecycleStatusTagSx = (codeOrName?: string) => softTagBaseSx(pickLifecycleTone(codeOrName));

export const DEFAULT_PAGE_SIZE = 10;
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
  { id: 'rule-001', name: '899成交-销售(公司资源)', productLevel: '899', orderType: '899成交', sourceType: '', resourceOwnership: '公司资源', role: '销售' as const, commissionType: 'fixed' as const, commissionValue: 120, isActive: true, priority: 10 },
  { id: 'rule-002', name: '899成交-销售(个人资源)', productLevel: '899', orderType: '899成交', sourceType: '', resourceOwnership: '个人资源', role: '销售' as const, commissionType: 'fixed' as const, commissionValue: 200, isActive: true, priority: 11 },
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
  { id: 'rule-018', name: '课程成交-销售(公司资源)', productLevel: '课程', orderType: '新购', sourceType: '', resourceOwnership: '公司资源', role: '销售' as const, commissionType: 'fixed' as const, commissionValue: 200, isActive: true, priority: 70 },
  { id: 'rule-019', name: '课程成交-销售(个人资源)', productLevel: '课程', orderType: '新购', sourceType: '', resourceOwnership: '个人资源', role: '销售' as const, commissionType: 'fixed' as const, commissionValue: 300, isActive: true, priority: 71 },
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

/** 挽回动作类型 */
export const RECOVERY_ACTION_TYPES = [
  { value: '电话沟通', label: '电话沟通' },
  { value: '微信沟通', label: '微信沟通' },
  { value: '补课培训', label: '补课培训' },
  { value: '优惠补偿', label: '优惠补偿' },
  { value: '服务升级', label: '服务升级' },
  { value: '专人跟进', label: '专人跟进' },
] as const;

/** 挽回方案 */
export const RECOVERY_SOLUTIONS = [
  { value: '补课/培训', label: '补课/培训' },
  { value: '服务升级', label: '服务升级' },
  { value: '专人跟进', label: '专人跟进' },
  { value: '优惠券/补偿', label: '优惠券/补偿' },
  { value: '换产品', label: '换产品' },
  { value: '延长服务期', label: '延长服务期' },
] as const;

/** 订单类型列表 — 匹配提成业务场景 */
export const ORDER_TYPES = [
  { value: '899成交', label: '899成交' },
  { value: '新代理', label: '新代理' },
  { value: '成交线索转代理', label: '成交线索转代理' },
  { value: '成交线索转新代理', label: '成交线索转新代理' },
  { value: '代理升单', label: '代理升单' },
  { value: '代理复购', label: '代理复购' },
  { value: '售后挽回', label: '售后挽回' },
  { value: '转介绍成交', label: '转介绍成交' },
  { value: '新购', label: '新购' },
  { value: '续费', label: '续费' },
  { value: '升级', label: '升级' },
  { value: '增购', label: '增购' },
] as const;

export const DEFAULT_ORDER_TYPE_CONFIGS = ORDER_TYPES.map((type, index) => ({
  id: `otc-${index + 1}`,
  name: type.value,
  description: '',
  isActive: true,
  sortOrder: index + 1,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
}));

export const LIFECYCLE_STATUS_CODES = {
  PENDING_FOLLOWUP: 'pending_followup',
  FOLLOWING: 'following',
  ORDERED: 'ordered',
  REFUNDED: 'refunded',
  PUBLIC_POOL: 'public_pool',
} as const;

export type LifecycleStatusCode = (typeof LIFECYCLE_STATUS_CODES)[keyof typeof LIFECYCLE_STATUS_CODES];

export const DEFAULT_LIFECYCLE_STATUS_CONFIGS = [
  { id: 'lsc-001', code: LIFECYCLE_STATUS_CODES.PENDING_FOLLOWUP, name: '待跟进', description: '线索入库或领取后等待销售开始跟进', color: '#9E9E9E', isActive: true, sortOrder: 1, isSystem: true },
  { id: 'lsc-002', code: LIFECYCLE_STATUS_CODES.FOLLOWING, name: '跟进中', description: '销售正在跟进客户需求', color: '#2196F3', isActive: true, sortOrder: 2, isSystem: true },
  { id: 'lsc-003', code: LIFECYCLE_STATUS_CODES.ORDERED, name: '已转订单', description: '客户已创建或确认订单', color: '#4CAF50', isActive: true, sortOrder: 3, isSystem: true },
  { id: 'lsc-004', code: LIFECYCLE_STATUS_CODES.REFUNDED, name: '已退款', description: '关联订单退款已完成', color: '#F44336', isActive: true, sortOrder: 4, isSystem: true },
  { id: 'lsc-005', code: LIFECYCLE_STATUS_CODES.PUBLIC_POOL, name: '流失公海', description: '销售放弃后释放归属并进入公海', color: '#607D8B', isActive: true, sortOrder: 5, isSystem: true },
].map((item) => ({
  ...item,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
}));

export function normalizeLifecycleStatusCode(value?: string | null): LifecycleStatusCode {
  const text = String(value || '').trim();
  if (Object.values(LIFECYCLE_STATUS_CODES).includes(text as LifecycleStatusCode)) return text as LifecycleStatusCode;
  if (!text || text === '未转商机' || text === '新线索' || text === '待分配' || text === '待跟进') return LIFECYCLE_STATUS_CODES.PENDING_FOLLOWUP;
  if (text === '商机跟进中' || text === '进行中' || text === '已联系' || text === '已验证' || text === '方案中' || text === '谈判中' || text === '跟进中') return LIFECYCLE_STATUS_CODES.FOLLOWING;
  if (text === '已成交' || text === '赢单' || text === '已转订单') return LIFECYCLE_STATUS_CODES.ORDERED;
  if (text === '已退款' || text === '退款已完成') return LIFECYCLE_STATUS_CODES.REFUNDED;
  if (text === '已流失' || text === '输单' || text === '流失公海' || text === '公海待领取') return LIFECYCLE_STATUS_CODES.PUBLIC_POOL;
  return LIFECYCLE_STATUS_CODES.PENDING_FOLLOWUP;
}

export function getLifecycleConfigByCode(code?: string) {
  const normalizedCode = normalizeLifecycleStatusCode(code);
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LIFECYCLE_STATUS_CONFIGS);
    const configs = raw ? JSON.parse(raw) : [];
    if (Array.isArray(configs)) {
      const configured = configs.find((item) => item?.code === normalizedCode);
      if (configured) return configured;
    }
  } catch {
    // Fall through to defaults when localStorage is unavailable or corrupted.
  }
  return DEFAULT_LIFECYCLE_STATUS_CONFIGS.find((item) => item.code === normalizedCode) || DEFAULT_LIFECYCLE_STATUS_CONFIGS[0];
}

export const DEFAULT_LEAD_FLOW_CONFIG = {
  id: 'lead-flow-global',
  uniqueKeyMode: 'phone_or_wechat',
  interceptionEnabled: true,
  autoAssignEnabled: true,
  autoClaimAfterAssignmentEnabled: false,
  assignmentMode: 'round_robin',
  participantUserIds: [],
  dailyLimitEnabled: true,
  dailyLimit: 200,
  lastAssignedIndex: -1,
  updatedAt: '2026-06-01T00:00:00.000Z',
} as const;

export const DEFAULT_LEAD_SOURCE_CONFIGS = [
  { id: 'lscfg-001', name: '官网', isActive: true, sortOrder: 1, description: '官网表单、在线咨询等自然留资' },
  { id: 'lscfg-002', name: '抖音', isActive: true, sortOrder: 2, description: '抖音渠道线索' },
  { id: 'lscfg-003', name: '直播', parentId: 'lscfg-002', isActive: true, sortOrder: 1, description: '抖音直播间留资' },
  { id: 'lscfg-004', name: '视频', parentId: 'lscfg-002', isActive: true, sortOrder: 2, description: '短视频组件或私信留资' },
  { id: 'lscfg-005', name: '广告', isActive: true, sortOrder: 3, description: '投放广告线索' },
  { id: 'lscfg-006', name: '信息流', parentId: 'lscfg-005', isActive: true, sortOrder: 1, description: '信息流广告' },
  { id: 'lscfg-007', name: '搜索广告', parentId: 'lscfg-005', isActive: true, sortOrder: 2, description: '搜索竞价广告' },
  { id: 'lscfg-008', name: '转介绍', isActive: true, sortOrder: 4, description: '客户或伙伴推荐' },
  { id: 'lscfg-009', name: '展会', isActive: true, sortOrder: 5, description: '线下活动或展会' },
  { id: 'lscfg-010', name: '其他', isActive: true, sortOrder: 99, description: '未归类来源' },
].map((item) => ({
  ...item,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
}));

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
  { id: 'prod-001', name: '899智能体', level: '899' as const, price: 899, originalPrice: 1299, description: '基础AI智能体，适合个人和小团队', features: ['AI对话', '知识库', '基础分析'], deliveryStages: [], isActive: true, sortOrder: 1 },
  { id: 'prod-002', name: '2980课程', level: '课程' as const, price: 2980, originalPrice: 3980, description: 'AI运营实战课程，系统学习AI应用', features: ['在线课程', '实操指导', '社群答疑'], deliveryStages: [], isActive: true, sortOrder: 2 },
  { id: 'prod-003', name: '9800代理', level: '代理' as const, price: 9800, originalPrice: 12800, description: '区域代理授权，享受代理分销权益', features: ['代理授权', '系统开通', '培训支持', '运营指导'], deliveryStages: [], isActive: true, sortOrder: 3 },
  { id: 'prod-004', name: '29800贴牌', level: '贴牌' as const, price: 29800, originalPrice: 39800, description: '品牌定制版，打造专属AI品牌', features: ['品牌定制', '独立部署', '技术支持', '持续升级'], deliveryStages: [], isActive: true, sortOrder: 4 },
  { id: 'prod-005', name: '59800合伙人', level: '合伙人' as const, price: 59800, originalPrice: 79800, description: '战略合伙人，深度合作共享收益', features: ['战略合伙', '利益共享', '优先支持', '定制开发'], deliveryStages: [], isActive: true, sortOrder: 5 },
];
