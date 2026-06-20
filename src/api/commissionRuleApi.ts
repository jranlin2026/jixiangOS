import type {
  Commission,
  CommissionCalcResult,
  CommissionEvidenceType,
  CommissionRole,
  CommissionRule,
  OfficialPaymentChannel,
} from '../types/commission';
import type { Order } from '../types/order';
import type { ApiResponse } from './types';
import { createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { STORAGE_KEYS, normalizeResourceOwnership } from '../shared/utils/constants';
import { initializeMockData, mockCommissionRules } from './mock';
import { v4 as uuidv4 } from 'uuid';

function ensureInit(): void {
  initializeMockData();
  migrateCommissionRules();
}

function normalizeRule(rule: CommissionRule): CommissionRule {
  const inferredLeaderConfirm = rule.requiresLeaderConfirm ?? rule.orderType === '成交线索转代理';
  const inferredEvidenceTypes: CommissionEvidenceType[] = rule.evidenceTypes?.length
    ? rule.evidenceTypes
    : rule.settlementMode === '仅计业绩'
      ? []
      : ['付款截图', '成交路径截图'];

  return {
    scene: '',
    paymentChannels: [],
    excludeExternalTalent: true,
    performanceRate: 100,
    splitRatio: 100,
    collaboratorRole: '',
    requiresProof: inferredEvidenceTypes.length > 0,
    clawbackBaseCommission: false,
    scenarioGroup: inferScenarioGroup(rule),
    settlementMode: '自动结算',
    description: '',
    ...rule,
    resourceOwnership: rule.resourceOwnership ? normalizeResourceOwnership(rule.resourceOwnership) : '',
    requiresLeaderConfirm: inferredLeaderConfirm,
    evidenceTypes: inferredEvidenceTypes,
  };
}

function inferScenarioGroup(rule: CommissionRule): CommissionRule['scenarioGroup'] {
  const text = `${rule.name || ''}${rule.orderType || ''}${rule.scene || ''}`;
  if (text.includes('代理') || text.includes('转代理')) return '代理转化';
  if (text.includes('升单') || text.includes('复购')) return '升单复购';
  if (text.includes('转介绍')) return '转介绍';
  if (text.includes('挽回') || text.includes('退款')) return '退款挽回';
  if (text.includes('服务') || text.includes('售后') || text.includes('客服')) return '服务激励';
  if (text.includes('个人资源') || text.includes('自拓')) return '个人资源';
  return '新客成交';
}

function migrateCommissionRules(): void {
  const rules = getStorageData<CommissionRule[]>(STORAGE_KEYS.COMMISSION_RULES) || [];
  const hasNewRules = rules.some((rule) => rule.scene || rule.resourceOwnership || rule.paymentChannels?.length);

  if (!hasNewRules) {
    setStorageData(STORAGE_KEYS.COMMISSION_RULES, mockCommissionRules.map(normalizeRule));
    return;
  }

  const normalized = rules.map(normalizeRule);
  setStorageData(STORAGE_KEYS.COMMISSION_RULES, normalized);
}

async function getCommissionRules(): Promise<ApiResponse<CommissionRule[]>> {
  ensureInit();
  await delay(200);
  const rules = getStorageData<CommissionRule[]>(STORAGE_KEYS.COMMISSION_RULES) || [];
  return createSuccessResponse(rules.map(normalizeRule));
}

async function createCommissionRule(data: Omit<CommissionRule, 'id'>): Promise<ApiResponse<CommissionRule>> {
  ensureInit();
  await delay(200);
  const rules = getStorageData<CommissionRule[]>(STORAGE_KEYS.COMMISSION_RULES) || [];
  const newRule: CommissionRule = normalizeRule({
    ...data,
    id: `rule-${uuidv4().slice(0, 8)}`,
  });
  rules.push(newRule);
  setStorageData(STORAGE_KEYS.COMMISSION_RULES, rules);
  return createSuccessResponse(newRule);
}

async function updateCommissionRule(id: string, data: Partial<CommissionRule>): Promise<ApiResponse<CommissionRule | null>> {
  ensureInit();
  await delay(200);
  const rules = getStorageData<CommissionRule[]>(STORAGE_KEYS.COMMISSION_RULES) || [];
  const idx = rules.findIndex((r) => r.id === id);
  if (idx === -1) return createSuccessResponse(null);
  rules[idx] = normalizeRule({ ...rules[idx], ...data });
  setStorageData(STORAGE_KEYS.COMMISSION_RULES, rules);
  return createSuccessResponse(rules[idx]);
}

async function deleteCommissionRule(id: string): Promise<ApiResponse<boolean>> {
  ensureInit();
  await delay(150);
  const rules = getStorageData<CommissionRule[]>(STORAGE_KEYS.COMMISSION_RULES) || [];
  setStorageData(STORAGE_KEYS.COMMISSION_RULES, rules.filter((r) => r.id !== id));
  return createSuccessResponse(true);
}

function matchesField(ruleValue: string | undefined, orderValue: string | undefined): boolean {
  return !ruleValue || ruleValue === orderValue;
}

function matchesRule(rule: CommissionRule, order: Order): boolean {
  const normalized = normalizeRule(rule);
  const channel = order.officialPaymentChannel || mapPaymentMethodToOfficialChannel(order.paymentMethod);
  const orderAmount = order.actualAmount || order.amount;

  if (!normalized.isActive) return false;
  if (normalized.excludeExternalTalent && order.isExternalTalentOrder) return false;
  if (channel === '非官方渠道') return false;
  if (normalized.paymentChannels?.length && !normalized.paymentChannels.includes(channel)) return false;
  if (normalized.minAmount !== undefined && orderAmount < normalized.minAmount) return false;
  if (normalized.maxAmount !== undefined && orderAmount > normalized.maxAmount) return false;

  return (
    matchesField(normalized.productLevel, order.productLevel) &&
    matchesField(normalized.orderType, order.orderType) &&
    matchesField(normalized.sourceType, order.sourceType) &&
    matchesField(normalized.scene, order.dealScene || order.orderType) &&
    matchesField(normalized.resourceOwnership, order.resourceOwnership)
  );
}

function mapPaymentMethodToOfficialChannel(paymentMethod: string): OfficialPaymentChannel {
  if (paymentMethod === '微信支付') return '企业微信转账';
  if (paymentMethod === '支付宝') return '企业支付宝转账';
  if (paymentMethod === '银行转账' || paymentMethod === '对公转账') return '对公银行转账';
  return '非官方渠道';
}

function calcBaseAmount(rule: CommissionRule, order: Order): number {
  const amount = order.performanceBaseAmount || order.actualAmount || order.amount;
  const rate = rule.performanceRate ?? 100;
  return Math.round(amount * (rate / 100) * 100) / 100;
}

function calcCommissionAmount(rule: CommissionRule, performanceAmount: number): number {
  const amount = rule.commissionType === 'fixed'
    ? rule.commissionValue
    : performanceAmount * (rule.commissionValue / 100);
  return Math.round(amount * 100) / 100;
}

function hasPaymentEvidence(order: Order): boolean {
  return Boolean(order.payments?.some((payment) => payment.voucherName || payment.voucherPreview));
}

function hasDealEvidence(order: Order): boolean {
  return Boolean(order.dealEvidenceName || order.dealEvidencePreview);
}

function resolveEvidenceStatus(rule: CommissionRule, order: Order): Commission['evidenceStatus'] {
  const evidenceTypes = rule.evidenceTypes || [];
  if (!rule.requiresProof && evidenceTypes.length === 0 && !rule.requiresLeaderConfirm) return '无需凭证';

  if (evidenceTypes.includes('付款截图') && !hasPaymentEvidence(order)) return '缺付款截图';
  if (evidenceTypes.includes('成交路径截图') && !hasDealEvidence(order)) return '缺成交路径截图';
  if (evidenceTypes.includes('聊天记录截图') && !hasDealEvidence(order)) return '缺聊天记录截图';
  if (rule.requiresLeaderConfirm || evidenceTypes.includes('组长确认')) return '需组长确认';

  return '已齐全';
}

function buildFormulaText(rule: CommissionRule, amount: number, performanceAmount: number, splitNote?: string): string {
  const base = rule.commissionType === 'fixed'
    ? `固定提成 ${rule.commissionValue} 元`
    : `业绩金额 ${performanceAmount} × ${rule.commissionValue}% = ${amount} 元`;
  const performance = rule.performanceRate && rule.performanceRate !== 100
    ? `，业绩按实付金额 ${rule.performanceRate}% 核算`
    : '';
  return [base + performance, splitNote].filter(Boolean).join('；');
}

function buildResult(
  rule: CommissionRule,
  order: Order,
  role: CommissionRole,
  amount: number,
  ownerOverride?: string,
  splitNote?: string,
): CommissionCalcResult {
  const performanceAmount = calcBaseAmount(rule, order);
  const evidenceStatus = resolveEvidenceStatus(rule, order);
  const needsAudit = true;
  const status = '待确认';
  const calculationNote = [
    rule.description,
    rule.performanceRate && rule.performanceRate !== 100 ? `业绩按实付金额 ${rule.performanceRate}% 核算` : '',
    rule.clawbackBaseCommission ? '需冲销历史 899 基础提成' : '',
    splitNote || '',
  ].filter(Boolean).join('；');

  return {
    ruleId: rule.id,
    role,
    commissionType: rule.commissionType,
    commissionValue: rule.commissionValue,
    commissionAmount: amount,
    commissionRate: rule.commissionType === 'percentage' ? rule.commissionValue / 100 : 0,
    performanceAmount,
    status,
    ownerOverride,
    scene: order.dealScene,
    resourceOwnership: order.resourceOwnership,
    proofStatus: evidenceStatus === '已齐全' ? '已上传' : evidenceStatus === '无需凭证' ? '无需凭证' : '待补充',
    calculationNote,
    auditReason: evidenceStatus === '已齐全' || evidenceStatus === '无需凭证' ? '新订单提成待财务审核' : evidenceStatus,
    evidenceRequired: rule.requiresProof || Boolean(rule.evidenceTypes?.length) || rule.requiresLeaderConfirm,
    evidenceStatus,
    formulaText: buildFormulaText(rule, amount, performanceAmount, splitNote),
  };
}

function createResultsForRule(rule: CommissionRule, order: Order): CommissionCalcResult[] {
  const performanceAmount = calcBaseAmount(rule, order);
  const totalAmount = calcCommissionAmount(rule, performanceAmount);
  const splitRatio = rule.splitRatio ?? 100;

  if (rule.collaboratorRole && order.collaboratorName && splitRatio > 0 && splitRatio < 100) {
    const primaryAmount = Math.round(totalAmount * (splitRatio / 100) * 100) / 100;
    const collaboratorAmount = Math.round((totalAmount - primaryAmount) * 100) / 100;
    return [
      buildResult(rule, order, rule.role, primaryAmount, undefined, `主角色分成 ${splitRatio}%`),
      buildResult(rule, order, rule.collaboratorRole, collaboratorAmount, order.collaboratorName, `协同分成 ${100 - splitRatio}%`),
    ];
  }

  if (order.collaboratorRole && order.collaboratorName && order.collaboratorRatio && order.collaboratorRatio > 0 && order.collaboratorRatio < 100) {
    const collaboratorAmount = Math.round(totalAmount * (order.collaboratorRatio / 100) * 100) / 100;
    const primaryAmount = Math.round((totalAmount - collaboratorAmount) * 100) / 100;
    return [
      buildResult(rule, order, rule.role, primaryAmount, undefined, `主角色分成 ${100 - order.collaboratorRatio}%`),
      buildResult(rule, order, order.collaboratorRole, collaboratorAmount, order.collaboratorName, `协同分成 ${order.collaboratorRatio}%`),
    ];
  }

  return [buildResult(rule, order, rule.role, totalAmount)];
}

async function calculateCommissionsForOrder(order: Order): Promise<ApiResponse<CommissionCalcResult[]>> {
  ensureInit();
  await delay(200);
  const rules = (getStorageData<CommissionRule[]>(STORAGE_KEYS.COMMISSION_RULES) || [])
    .map(normalizeRule)
    .filter((rule) => matchesRule(rule, order))
    .sort((a, b) => a.priority - b.priority);

  const results: CommissionCalcResult[] = [];
  for (const rule of rules) {
    results.push(...createResultsForRule(rule, order));
  }

  return createSuccessResponse(results);
}

function clawbackBaseCommissions(order: Order, results: CommissionCalcResult[]): void {
  if (!order.originalOrderId || !results.some((result) => {
    const rule = (getStorageData<CommissionRule[]>(STORAGE_KEYS.COMMISSION_RULES) || []).find((r) => r.id === result.ruleId);
    return rule?.clawbackBaseCommission;
  })) {
    return;
  }

  const commissions = getStorageData<Commission[]>(STORAGE_KEYS.COMMISSIONS) || [];
  const next = commissions.map((commission) => {
    if (
      commission.orderId === order.originalOrderId &&
      commission.status !== '已发放' &&
      (commission.role === '销售' || commission.role === '线索')
    ) {
      return {
        ...commission,
        status: '已取消' as const,
        auditReason: '成交线索转代理冲销原 899 基础提成',
        frozenReason: '成交线索转代理冲销原 899 基础提成',
        calculationNote: '成交线索转代理，按制度冲销原 899 基础提成。',
        updatedAt: new Date().toISOString(),
      };
    }
    return commission;
  });
  setStorageData(STORAGE_KEYS.COMMISSIONS, next);
}

/**
 * 兼容旧调用：根据简单字段构造临时订单计算。
 */
async function calculateCommissions(
  orderId: string,
  productLevel: string,
  orderAmount: number,
  orderType: string,
  sourceType: string,
): Promise<ApiResponse<CommissionCalcResult[]>> {
  return calculateCommissionsForOrder({
    id: orderId,
    orderNo: '',
    customerId: '',
    customerName: '',
    productLevel: productLevel as Order['productLevel'],
    orderType: orderType as Order['orderType'],
    amount: orderAmount,
    actualAmount: orderAmount,
    paymentMethod: '对公转账',
    officialPaymentChannel: '对公银行转账',
    status: '已确认',
    refundStatus: '无',
    owner: '',
    sourceType,
    resourceOwnership: normalizeResourceOwnership(sourceType),
    dealScene: orderType as Order['dealScene'],
    proofStatus: '已上传',
    payments: [],
    createdAt: '',
    updatedAt: '',
  });
}

export const commissionRuleApi = {
  getCommissionRules,
  createCommissionRule,
  updateCommissionRule,
  deleteCommissionRule,
  calculateCommissions,
  calculateCommissionsForOrder,
  clawbackBaseCommissions,
};
