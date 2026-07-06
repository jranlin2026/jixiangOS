import type { ID, Timestamp, ProductLevel } from './common';

/** 提成角色是分账业务口径，不等同于系统权限角色 */
export type CommissionRole = string;

export type CommissionRolePersonSource =
  | 'sales_owner'
  | 'lead_contributor'
  | 'customer_success'
  | 'after_sales'
  | 'manual';

export interface CommissionRoleConfig {
  id: ID;
  name: CommissionRole;
  code: string;
  /** @deprecated 人员匹配改为系统内置规则，保留字段仅兼容历史数据 */
  personSource?: CommissionRolePersonSource;
  isActive: boolean;
  sortOrder: number;
  description?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CommissionRoleConfigInput {
  name: CommissionRole;
  code: string;
  /** @deprecated 人员匹配改为系统内置规则，保留字段仅兼容历史数据 */
  personSource?: CommissionRolePersonSource;
  isActive: boolean;
  sortOrder: number;
  description?: string;
}

export interface CommissionRoleConfigFilters {
  search?: string;
  isActive?: boolean;
}

/** 提成状态 — 含审核流程 */
export type CommissionStatus = '待确认' | '待发放' | '已发放' | '已取消' | '已撤回' | '待冲销' | '已冲销';
export type LegacyCommissionStatus = CommissionStatus | '待审核' | '异常';
export type CommissionOrderSummaryStatus = '待处理' | '待确认' | '待发放' | '已发放' | '已撤回';

export type CommissionScene =
  | '899成交'
  | '新代理'
  | '成交线索转代理'
  | '成交线索转新代理'
  | '代理升单'
  | '代理复购'
  | '售后挽回'
  | '转介绍成交'
  | '智能体服务'
  | '个人资源成交';

export type ResourceOwnership = '公司资源' | '个人资源';

export type OfficialPaymentChannel =
  | '企业微信转账'
  | '企业支付宝转账'
  | '对公银行转账'
  | '公司自营小店'
  | '非官方渠道';

export type ProofStatus = '无需凭证' | '待补充' | '已上传';

export type CommissionEvidenceType = '付款截图' | '成交路径截图' | '聊天记录截图' | '组长确认';
export type CommissionScenarioGroup = '新客成交' | '代理转化' | '升单复购' | '转介绍' | '售后挽回' | '服务激励' | '个人资源';
export type CommissionSettlementMode = '自动结算' | '人工审核' | '仅计业绩';
export type CommissionRuleCalculationType = 'fixed' | 'percentage' | 'tiered_percentage';

export interface CommissionTier {
  minAmount: number;
  maxAmount?: number;
  rate: number;
}

export interface CommissionTierSnapshot {
  tiers: CommissionTier[];
  currentTier?: CommissionTier;
  nextTier?: CommissionTier;
  baseAmount: number;
  gapToNext: number;
}

/** 提成规则 — 核心配置，每条规则对应一个角色的提成方式 */
export interface CommissionRule {
  id: ID;
  name: string;
  /** 简化 IF/DO 规则组 ID，同一组内每个提成角色一条底层规则 */
  ruleGroupId?: ID;
  /** 简化 IF/DO 规则组名称 */
  ruleGroupName?: string;
  /** 产品等级，空=通用 */
  productLevel: ProductLevel | '';
  /** 订单类型，空=通用 */
  orderType: string;
  /** 来源类型，空=通用 */
  sourceType: string;
  /** 制度场景，空=通用 */
  scene?: CommissionScene | '';
  /** 资源归属，空=通用 */
  resourceOwnership?: ResourceOwnership | '';
  /** 官方收款渠道，空数组/空值=不限 */
  paymentChannels?: OfficialPaymentChannel[];
  /** 外部达人成交是否排除 */
  excludeExternalTalent?: boolean;
  /** 提成角色 — 销售线索客户成功售后招商主管销售主管 */
  role: CommissionRole;
  /** 计算方式：固定金额、百分比 或 销售月累计阶梯提成 */
  commissionType: CommissionRuleCalculationType;
  /** 固定金额值 或 百分比数值 */
  commissionValue: number;
  /** 销售月累计阶梯档位，仅用于 tiered_percentage */
  tiers?: CommissionTier[];
  /** 提成方案 ID，规则行引用方案后会把方案算法快照复制到本规则 */
  payoutPlanId?: ID;
  /** 提成方案名称快照 */
  payoutPlanName?: string;
  /** 业绩核算比例，默认 100%，用于升单 70%、代理复购 50% 等 */
  performanceRate?: number;
  /** 主角色分成比例，默认 100%，协同分成时如 80 表示主角色拿 80% */
  splitRatio?: number;
  /** 协同角色，存在时生成协同提成记录 */
  collaboratorRole?: CommissionRole | '';
  /** 是否要求凭证；缺凭证时提成进入待确认 */
  requiresProof?: boolean;
  /** 是否冲销该订单历史基础提成 */
  clawbackBaseCommission?: boolean;
  /** 制度场景分组，用于规则管理和财务筛选 */
  scenarioGroup?: CommissionScenarioGroup;
  /** 是否需要组长以上确认 */
  requiresLeaderConfirm?: boolean;
  /** 需要留存的凭证类型 */
  evidenceTypes?: CommissionEvidenceType[];
  /** 金额区间下限，用于 450/599/898 等分档 */
  minAmount?: number;
  /** 金额区间上限 */
  maxAmount?: number;
  /** 结算方式 */
  settlementMode?: CommissionSettlementMode;
  /** 规则说明 */
  description?: string;
  /** 是否启用 */
  isActive: boolean;
  /** 优先级，越小越优先 */
  priority: number;
}

export interface SimpleCommissionRulePayout {
  role: CommissionRole;
  payoutPlanId?: ID;
  payoutPlanName?: string;
  commissionType: CommissionRuleCalculationType;
  commissionValue: number;
  tiers?: CommissionTier[];
}

export interface CommissionPayoutPlan {
  id: ID;
  name: string;
  commissionType: CommissionRuleCalculationType;
  commissionValue: number;
  tiers?: CommissionTier[];
  isActive: boolean;
  description?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type CommissionPayoutPlanInput = Omit<CommissionPayoutPlan, 'id' | 'createdAt' | 'updatedAt'>;

export interface SimpleCommissionRuleGroup {
  id: ID;
  name: string;
  orderType: string;
  resourceOwnership: ResourceOwnership;
  isActive: boolean;
  payouts: SimpleCommissionRulePayout[];
}

export type SimpleCommissionRuleGroupInput = Omit<SimpleCommissionRuleGroup, 'id'>;

/** 提成批次 */
export interface CommissionBatch {
  id: ID;
  batchNo: string;
  period: string;
  totalCount: number;
  totalAmount: number;
  status: '待确认' | '待发放' | '已发放' | '已取消' | '已撤回' | '待冲销';
  approvedBy?: string;
  paidAt?: Timestamp;
  commissionIds: ID[];
}

/** 提成记录 — 每个角色一条 */
export interface Commission {
  id: ID;
  orderId: ID;
  orderNo: string;
  customerName: string;
  productLevel: ProductLevel;
  orderAmount: number;
  /** 提成比例（显示用，percentage 类型=实际比例如0.08，fixed 类型=0） */
  commissionRate: number;
  /** 提成金额 */
  commissionAmount: number;
  /** 业绩核算金额 */
  performanceAmount?: number;
  /** 制度场景 */
  scene?: CommissionScene;
  /** 资源归属 */
  resourceOwnership?: ResourceOwnership;
  /** 凭证状态 */
  proofStatus?: ProofStatus;
  /** 计算说明 */
  calculationNote?: string;
  /** 财务审核原因或待补充原因 */
  auditReason?: string;
  /** 是否需要凭证 */
  evidenceRequired?: boolean;
  /** 凭证校验状态 */
  evidenceStatus?: '已齐全' | '缺付款截图' | '缺成交路径截图' | '缺聊天记录截图' | '需组长确认' | '无需凭证';
  /** 面向财务展示的公式 */
  formulaText?: string;
  /** 提成方案 ID，生成或调整分账时保存方案快照 */
  payoutPlanId?: ID;
  /** 提成方案名称快照 */
  payoutPlanName?: string;
  /** 分账规则计算方式，用于月度阶梯提成等结算口径 */
  ruleCalculationType?: CommissionRuleCalculationType;
  /** 生成/调整分账时保留的阶梯规则快照 */
  tierSnapshot?: CommissionTierSnapshot;
  /** 所属结算批次 */
  batchId?: ID;
  /** 冻结原因 */
  frozenReason?: string;
  /** 冲销来源提成 */
  clawbackFromCommissionId?: ID;
  /** 提成角色 */
  role: CommissionRole;
  /** 人员姓名 */
  owner: string;
  /** 部门 */
  ownerId?: ID;
  department: string;
  departmentId?: ID;
  paymentDate?: Timestamp;
  status: CommissionStatus;
  commissionRuleId?: ID;
  sourceType?: '自动规则' | '人工新增';
  isManualAdjusted?: boolean;
  adjustReason?: string;
  adjustedBy?: string;
  adjustedAt?: Timestamp;
  commissionType?: 'sales' | 'cs' | 'support' | 'recovery';
  sourceRefundId?: ID;
  sourceRecoveryOrderId?: ID;
  sourceBusinessType?: 'formal_order' | 'after_sales_recovery' | 'refund_recovery';
  isRecoveryBonus?: boolean;
  paidAt?: Timestamp;
  chargebackMethod?: CommissionChargebackMethod;
  chargebackAmount?: number;
  chargebackReason?: string;
  chargebackHandledBy?: string;
  chargebackHandledAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type CommissionChargebackMethod = '线下追回' | '下月提成抵扣' | '财务确认无需追回';

export interface CommissionChargebackCompleteInput {
  method: CommissionChargebackMethod;
  amount: number;
  reason: string;
}

export type CommissionOperationAction = '调整分账' | '确认分账' | '删除分账' | '清理废弃分账' | '撤回提成' | '发起冲销' | '退款待冲销' | '冲销处理完成' | '发放提成';

export interface CommissionOperationSplitSnapshot {
  role: CommissionRole;
  owner: string;
  ownerId?: ID;
  department?: string;
  commissionAmount: number;
  status: CommissionStatus;
}

export interface CommissionOperationLog {
  id: ID;
  orderId: ID;
  orderNo: string;
  customerName: string;
  action: CommissionOperationAction;
  operator: string;
  operatedAt: Timestamp;
  reason?: string;
  summary: string;
  commissionCount?: number;
  totalCommissionAmount?: number;
  splitSnapshot?: CommissionOperationSplitSnapshot[];
}

export interface CommissionAuditIssue {
  id: ID;
  commissionId: ID;
  orderId: ID;
  orderNo: string;
  customerName: string;
  owner: string;
  role: CommissionRole;
  amount: number;
  issueType: '缺凭证' | '需确认' | '规则冲突' | '退款冻结' | '金额异常';
  reason: string;
  status: CommissionStatus;
  createdAt: Timestamp;
}

export interface CommissionSettlementBatch {
  id: ID;
  batchNo: string;
  period: string;
  totalCount: number;
  totalAmount: number;
  pendingReviewAmount: number;
  pendingPayAmount: number;
  paidAmount: number;
  cancelledAmount: number;
  status: '待确认' | '待发放' | '已发放';
  generatedAt: Timestamp;
  paidAt?: Timestamp;
  commissionIds: ID[];
  byOwner: Array<{ owner: string; department: string; count: number; amount: number }>;
  byRole: Array<{ role: CommissionRole; count: number; amount: number }>;
}

/** 提成筛选参数 */
export interface CommissionFilters {
  search?: string;
  productLevel?: ProductLevel;
  status?: CommissionStatus;
  owner?: string;
  ownerId?: ID;
  role?: CommissionRole;
  department?: string;
  departmentId?: ID;
  startDate?: string;
  endDate?: string;
  month?: string;
  page?: number;
  pageSize?: number;
}

export interface CommissionOrderSummary {
  orderId: ID;
  orderNo: string;
  customerName: string;
  productName?: string;
  productLevel: ProductLevel;
  orderType: string;
  paymentDate: Timestamp;
  orderAmount: number;
  resourceOwnership?: ResourceOwnership | '';
  refundStatus?: string;
  salesOwner?: string;
  salesId?: ID;
  salesName?: string;
  leadInputBy?: string;
  leadContributorName?: string;
  sourceType?: string;
  officialPaymentChannel?: OfficialPaymentChannel;
  originalOrderId?: string;
  notes?: string;
  createdAt?: Timestamp;
  sourceOrderDeleted?: boolean;
  totalCommissionAmount: number;
  pendingAssignCount: number;
  exceptionCount: number;
  status: CommissionOrderSummaryStatus;
  splitSummary: Array<{ role: CommissionRole; amount: number; owner: string; ownerId?: ID; status: CommissionStatus }>;
  commissions: Commission[];
}

export interface CommissionCreatableOrderSummary {
  orderId: ID;
  orderNo: string;
  customerName: string;
  productName?: string;
  productLevel: ProductLevel;
  orderType: string;
  paymentDate: Timestamp;
  orderAmount: number;
  resourceOwnership?: ResourceOwnership | '';
  salesOwner?: string;
}

export interface CommissionOrderSummaryFilters {
  search?: string;
  status?: CommissionOrderSummaryStatus | '全部';
  ownerId?: ID;
  role?: CommissionRole;
  startDate?: string;
  endDate?: string;
  month?: string;
  page?: number;
  pageSize?: number;
}

export type CommissionOrderSummaryStatusCounts = Record<CommissionOrderSummaryStatus | '全部', number>;

export interface MonthlyCommissionPayout {
  period: string;
  owner: string;
  ownerId?: ID;
  department: string;
  departmentId?: ID;
  orderCount: number;
  monthlyPaidAmount: number;
  pendingConfirmAmount: number;
  pendingPayAmount: number;
  paidAmount: number;
  exceptionAmount: number;
  withdrawnAmount: number;
  chargebackAmount: number;
  totalAmount: number;
  status: '待确认' | '待发放' | '已发放' | '无应发';
  commissions: Commission[];
  roleSummaries?: MonthlyCommissionRoleSummary[];
}

export interface MonthlyCommissionTierConfig {
  period: string;
  tiers: CommissionTier[];
  updatedAt?: Timestamp;
}

export interface MonthlyCommissionRoleSummary {
  role: CommissionRole;
  orderCount: number;
  monthlyPaidAmount: number;
  pendingConfirmAmount: number;
  pendingPayAmount: number;
  paidAmount: number;
  exceptionAmount: number;
  withdrawnAmount: number;
  chargebackAmount: number;
  totalAmount: number;
  status: MonthlyCommissionPayout['status'];
  isTiered: boolean;
  tierSnapshot?: CommissionTierSnapshot;
  commissions: Commission[];
}

export interface CommissionAdjustmentInput {
  id?: ID;
  orderId: ID;
  role: CommissionRole;
  owner?: string;
  ownerId?: ID;
  department?: string;
  departmentId?: ID;
  paymentDate?: Timestamp;
  commissionAmount: number;
  commissionRate?: number;
  performanceAmount?: number;
  calculationNote?: string;
  commissionRuleId?: ID;
  payoutPlanId?: ID;
  payoutPlanName?: string;
  ruleCalculationType?: CommissionRuleCalculationType;
  tierSnapshot?: CommissionTierSnapshot;
}

/** 提成统计 */
export interface CommissionStats {
  monthPending: number;
  monthPaid: number;
  monthTotal: number;
  /** 按角色统计 */
  byRole: Record<CommissionRole, number>;
  /** 待确认金额 */
  pendingReview: number;
  /** 提成占营收比例 */
  revenueRatio: number;
}

/** 提成规则计算结果 — 多角色分佣时返回多条 */
export interface CommissionCalcResult {
  ruleId: string;
  role: CommissionRole;
  commissionType: CommissionRuleCalculationType;
  commissionValue: number;
  tiers?: CommissionTier[];
  payoutPlanId?: ID;
  payoutPlanName?: string;
  commissionAmount: number;
  commissionRate: number;
  performanceAmount: number;
  status: CommissionStatus;
  ownerOverride?: string;
  departmentOverride?: string;
  scene?: CommissionScene;
  resourceOwnership?: ResourceOwnership;
  proofStatus?: ProofStatus;
  calculationNote?: string;
  auditReason?: string;
  evidenceRequired?: boolean;
  evidenceStatus?: Commission['evidenceStatus'];
  formulaText?: string;
}
