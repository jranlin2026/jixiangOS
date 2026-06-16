import type {
  Commission,
  CommissionCalcResult,
  CommissionRole,
  CommissionRule,
  OfficialPaymentChannel,
  ProofStatus,
} from '../types/commission';
import type { Order } from '../types/order';
import type { ApiResponse } from './types';
import { createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { STORAGE_KEYS } from '../shared/utils/constants';
import { initializeMockData, mockCommissionRules } from './mock';
import { v4 as uuidv4 } from 'uuid';

const OFFICIAL_CHANNELS: OfficialPaymentChannel[] = ['企业微信转账', '企业支付宝转账', '对公银行转账', '公司自营小店'];

function ensureInit(): void {
  initializeMockData();
  migrateCommissionRules();
}

function normalizeRule(rule: CommissionRule): CommissionRule {
  return {
    scene: '',
    resourceOwnership: '',
    paymentChannels: [],
    excludeExternalTalent: true,
    performanceRate: 100,
    splitRatio: 100,
    collaboratorRole: '',
    requiresProof: false,
    clawbackBaseCommission: false,
    description: '',
    ...rule,
  };
}

function migrateCommissionRules(): void {
  const rules = getStorageData<CommissionRule[]>(STORAGE_KEYS.COMMISSION_RULES) || [];
  const hasNewRules = rules.some((rule) => rule.scene || rule.resourceOwnership || rule.paymentChannels?.length);

  if (!hasNewRules) {
    setStorageData(STORAGE_KEYS.COMMISSION_RULES, mockCommissionRules);
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

  if (!normalized.isActive) return false;
  if (normalized.excludeExternalTalent && order.isExternalTalentOrder) return false;
  if (channel === '非官方渠道') return false;
  if (normalized.paymentChannels?.length && !normalized.paymentChannels.includes(channel)) return false;

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

function buildResult(
  rule: CommissionRule,
  order: Order,
  role: CommissionRole,
  amount: number,
  ownerOverride?: string,
  splitNote?: string,
): CommissionCalcResult {
  const proofStatus: ProofStatus = order.proofStatus || (rule.requiresProof ? '待补充' : '无需凭证');
  const performanceAmount = calcBaseAmount(rule, order);
  const status = rule.requiresProof && proofStatus !== '已上传' ? '待审核' : '待发放';
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
    proofStatus,
    calculationNote,
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
    status: '待确认',
    refundStatus: '无',
    owner: '',
    sourceType,
    resourceOwnership: sourceType === '自拓' ? '个人资源' : '公司资源',
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
