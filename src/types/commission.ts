import type { ID, Timestamp, ProductLevel } from './common';

/** 提成角色枚举 — 对应需求文档中的6个角色 */
export type CommissionRole = '销售' | '线索' | '客户成功' | '售后' | '招商主管' | '销售主管';

/** 提成状态 — 含审核流程 */
export type CommissionStatus = '待审核' | '待发放' | '已发放' | '已取消';

export type CommissionScene =
  | '899成交'
  | '新代理'
  | '成交线索转代理'
  | '成交线索转新代理'
  | '代理升单'
  | '代理复购'
  | '退款挽回'
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

/** 提成规则 — 核心配置，每条规则对应一个角色的提成方式 */
export interface CommissionRule {
  id: ID;
  name: string;
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
  /** 计算方式：固定金额 或 百分比 */
  commissionType: 'fixed' | 'percentage';
  /** 固定金额值 或 百分比数值 */
  commissionValue: number;
  /** 业绩核算比例，默认 100%，用于升单 70%、代理复购 50% 等 */
  performanceRate?: number;
  /** 主角色分成比例，默认 100%，协同分成时如 80 表示主角色拿 80% */
  splitRatio?: number;
  /** 协同角色，存在时生成协同提成记录 */
  collaboratorRole?: CommissionRole | '';
  /** 是否要求凭证；缺凭证时提成进入待审核 */
  requiresProof?: boolean;
  /** 是否冲销该订单历史基础提成 */
  clawbackBaseCommission?: boolean;
  /** 规则说明 */
  description?: string;
  /** 是否启用 */
  isActive: boolean;
  /** 优先级，越小越优先 */
  priority: number;
}

/** 提成批次 */
export interface CommissionBatch {
  id: ID;
  batchNo: string;
  period: string;
  totalCount: number;
  totalAmount: number;
  status: '待审核' | '待发放' | '已发放' | '已取消';
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
  /** 提成角色 */
  role: CommissionRole;
  /** 人员姓名 */
  owner: string;
  /** 部门 */
  department: string;
  status: CommissionStatus;
  commissionRuleId?: ID;
  commissionType?: 'sales' | 'cs' | 'support' | 'recovery';
  sourceRefundId?: ID;
  isRecoveryBonus?: boolean;
  paidAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** 提成筛选参数 */
export interface CommissionFilters {
  search?: string;
  productLevel?: ProductLevel;
  status?: CommissionStatus;
  owner?: string;
  role?: CommissionRole;
  department?: string;
  startDate?: string;
  endDate?: string;
  month?: string;
  page?: number;
  pageSize?: number;
}

/** 提成统计 */
export interface CommissionStats {
  monthPending: number;
  monthPaid: number;
  monthTotal: number;
  /** 按角色统计 */
  byRole: Record<CommissionRole, number>;
  /** 待审核金额 */
  pendingReview: number;
  /** 提成占营收比例 */
  revenueRatio: number;
}

/** 提成规则计算结果 — 多角色分佣时返回多条 */
export interface CommissionCalcResult {
  ruleId: string;
  role: CommissionRole;
  commissionType: 'fixed' | 'percentage';
  commissionValue: number;
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
}
