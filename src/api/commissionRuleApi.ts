import type {
  Commission,
  CommissionCalcResult,
  CommissionEvidenceType,
  CommissionRole,
  CommissionRoleConfig,
  CommissionRoleConfigFilters,
  CommissionRoleConfigInput,
  CommissionRule,
  OfficialPaymentChannel,
  SimpleCommissionRuleGroup,
  SimpleCommissionRuleGroupInput,
  SimpleCommissionRulePayout,
} from '../types/commission';
import type { Order } from '../types/order';
import type { User } from '../types/settings';
import type { Department } from '../types/department';
import type { ApiResponse } from './types';
import { createErrorResponse, createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { STORAGE_KEYS, normalizeResourceOwnership } from '../shared/utils/constants';
import { initializeMockData, mockCommissionRules } from './mock';
import { v4 as uuidv4 } from 'uuid';

function ensureInit(): void {
  initializeMockData();
  migrateCommissionRules();
  ensureCommissionRoleConfigs();
}

const DEFAULT_COMMISSION_ROLE_CONFIGS: CommissionRoleConfigInput[] = [
  { name: '销售', code: 'sales', personSource: 'sales_owner', isActive: true, sortOrder: 10, description: '取订单销售负责人，用于销售分成' },
  { name: '线索', code: 'lead', personSource: 'lead_contributor', isActive: true, sortOrder: 20, description: '取订单线索贡献人，用于线索分成' },
  { name: '客户成功', code: 'customer_success', personSource: 'customer_success', isActive: true, sortOrder: 30, description: '取订单客户成功人员' },
  { name: '售后', code: 'after_sales', personSource: 'after_sales', isActive: true, sortOrder: 40, description: '取订单售后人员' },
  { name: '招商主管', code: 'investment_manager', personSource: 'manual', isActive: true, sortOrder: 50, description: '默认待分配，由财务手动指定' },
  { name: '销售主管', code: 'sales_manager', personSource: 'manual', isActive: true, sortOrder: 60, description: '默认待分配，由财务手动指定' },
];

function buildDefaultCommissionRoleConfigs(now = new Date().toISOString()): CommissionRoleConfig[] {
  return DEFAULT_COMMISSION_ROLE_CONFIGS.map((item) => ({
    id: item.code,
    ...item,
    createdAt: now,
    updatedAt: now,
  }));
}

function normalizeCommissionRoleConfig(config: CommissionRoleConfig): CommissionRoleConfig {
  return {
    ...config,
    id: config.id || config.code,
    code: config.code.trim(),
    name: config.name.trim(),
    personSource: config.personSource || 'manual',
    sortOrder: Number(config.sortOrder) || 100,
    isActive: config.isActive !== false,
  };
}

function sortCommissionRoleConfigs(configs: CommissionRoleConfig[]): CommissionRoleConfig[] {
  return configs
    .map(normalizeCommissionRoleConfig)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'zh-CN'));
}

function ensureCommissionRoleConfigs(): CommissionRoleConfig[] {
  const raw = getStorageData<CommissionRoleConfig[]>(STORAGE_KEYS.COMMISSION_ROLE_CONFIGS) || [];
  if (!raw.length) {
    const defaults = buildDefaultCommissionRoleConfigs();
    setStorageData(STORAGE_KEYS.COMMISSION_ROLE_CONFIGS, defaults);
    return defaults;
  }
  const normalized = sortCommissionRoleConfigs(raw);
  setStorageData(STORAGE_KEYS.COMMISSION_ROLE_CONFIGS, normalized);
  return normalized;
}

function getCommissionRoleConfigByName(role: CommissionRole): CommissionRoleConfig | undefined {
  return ensureCommissionRoleConfigs().find((config) => config.name === role);
}

export interface CommissionRoleAssignee {
  owner: string;
  ownerId?: string;
  department: string;
  departmentId?: string;
}

const ROLE_MATCH_TEXT = {
  sales: '\u9500\u552e',
  lead: '\u7ebf\u7d22',
  customerSuccess: '\u5ba2\u6237\u6210\u529f',
  service: '\u552e\u540e',
  salesManager: '\u9500\u552e\u4e3b\u7ba1',
  salesManagerAlt: '\u9500\u552e\u7ecf\u7406',
  pendingAssign: '\u5f85\u5206\u914d',
};

const DEFAULT_ROLE_DEPARTMENTS: Record<string, string> = {
  [ROLE_MATCH_TEXT.sales]: '\u9500\u552e\u90e8',
  [ROLE_MATCH_TEXT.lead]: '\u5e02\u573a\u90e8',
  [ROLE_MATCH_TEXT.customerSuccess]: '\u5ba2\u6237\u6210\u529f\u90e8',
  [ROLE_MATCH_TEXT.service]: '\u552e\u540e\u670d\u52a1\u90e8',
  [ROLE_MATCH_TEXT.salesManager]: '\u9500\u552e\u90e8',
  [ROLE_MATCH_TEXT.salesManagerAlt]: '\u9500\u552e\u90e8',
};

function readActiveUsers(): User[] {
  return (getStorageData<User[]>(STORAGE_KEYS.USERS) || []).filter((user) => user.isActive);
}

function readActiveDepartments(): Department[] {
  return (getStorageData<Department[]>(STORAGE_KEYS.DEPARTMENTS) || []).filter((department) => department.isActive);
}

function findUser(users: User[], idOrName?: string, fallbackName?: string): User | undefined {
  const exact = [idOrName, fallbackName].filter(Boolean) as string[];
  return users.find((user) => exact.includes(user.id) || exact.includes(user.name));
}

function buildAssignee(user: User | undefined, departments: Department[], fallbackName?: string, fallbackDepartment?: string): CommissionRoleAssignee {
  const department = user?.departmentId ? departments.find((item) => item.id === user.departmentId) : undefined;
  if (user) {
    return {
      owner: user.name,
      ownerId: user.id,
      department: department?.name || fallbackDepartment || '',
      departmentId: department?.id,
    };
  }
  if (fallbackName) {
    const fallbackDept = fallbackDepartment
      ? departments.find((item) => item.name === fallbackDepartment)
      : undefined;
    return {
      owner: fallbackName,
      department: fallbackDept?.name || fallbackDepartment || '',
      departmentId: fallbackDept?.id,
    };
  }
  return {
    owner: ROLE_MATCH_TEXT.pendingAssign,
    department: fallbackDepartment || '',
  };
}

function validateCommissionRoleConfig(
  data: CommissionRoleConfigInput,
  existing: CommissionRoleConfig[],
  currentId?: string,
): string | null {
  if (!data.name.trim()) return '角色名称不能为空';
  if (!data.code.trim()) return '角色编码不能为空';
  if (existing.some((item) => item.id !== currentId && item.name === data.name.trim())) return '角色名称已存在';
  if (existing.some((item) => item.id !== currentId && item.code === data.code.trim())) return '角色编码已存在';
  if (Number(data.sortOrder) < 0) return '排序不能小于 0';
  return null;
}

function isCommissionRoleUsed(roleName: string): boolean {
  const rules = getStorageData<CommissionRule[]>(STORAGE_KEYS.COMMISSION_RULES) || [];
  const commissions = getStorageData<Commission[]>(STORAGE_KEYS.COMMISSIONS) || [];
  return rules.some((rule) => rule.role === roleName)
    || commissions.some((commission) => commission.role === roleName);
}

function normalizeRule(rule: CommissionRule): CommissionRule {
  const inferredLeaderConfirm = rule.requiresLeaderConfirm ?? rule.orderType === '成交线索转代理';
  const inferredEvidenceTypes: CommissionEvidenceType[] = rule.evidenceTypes !== undefined
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

function readCommissionRulesForSimpleGroups(): CommissionRule[] {
  const rules = getStorageData<CommissionRule[]>(STORAGE_KEYS.COMMISSION_RULES) || [];
  if (rules.length && rules.every((rule) => !rule.ruleGroupId)) {
    setStorageData(STORAGE_KEYS.COMMISSION_RULES, []);
    return [];
  }
  const normalized = rules.map(normalizeRule);
  setStorageData(STORAGE_KEYS.COMMISSION_RULES, normalized);
  return normalized;
}

function groupSimpleRules(rules: CommissionRule[]): SimpleCommissionRuleGroup[] {
  const map = new Map<string, CommissionRule[]>();
  rules.filter((rule) => rule.ruleGroupId).forEach((rule) => {
    const key = rule.ruleGroupId!;
    map.set(key, [...(map.get(key) || []), rule]);
  });

  return Array.from(map.entries()).map(([id, groupRules]) => {
    const sorted = groupRules.slice().sort((a, b) => a.priority - b.priority);
    const first = sorted[0];
    return {
      id,
      name: first.ruleGroupName || first.name,
      orderType: first.orderType,
      resourceOwnership: first.resourceOwnership || '公司资源',
      isActive: sorted.every((rule) => rule.isActive),
      payouts: sorted.map((rule) => ({
        role: rule.role,
        commissionType: rule.commissionType,
        commissionValue: rule.commissionValue,
      })),
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

function validateSimpleRuleGroup(data: SimpleCommissionRuleGroupInput): string | null {
  if (!data.name.trim()) return '规则名称不能为空';
  if (!data.orderType) return '请选择订单类型';
  if (!data.resourceOwnership) return '请选择资源来源';
  if (!data.payouts.length) return '至少配置一个提成角色';
  const roles = data.payouts.map((item) => item.role);
  if (new Set(roles).size !== roles.length) return '同一规则内不能重复配置提成角色';
  if (data.payouts.some((item) => Number(item.commissionValue) < 0)) return '分润数值不能小于 0';
  const activeRoles = new Set(ensureCommissionRoleConfigs().filter((item) => item.isActive).map((item) => item.name));
  const inactiveRole = roles.find((role) => !activeRoles.has(role));
  if (inactiveRole) return `提成角色「${inactiveRole}」未启用，不能用于新规则`;
  return null;
}

function hasDuplicateSimpleCondition(groups: SimpleCommissionRuleGroup[], data: SimpleCommissionRuleGroupInput, currentId?: string): boolean {
  return groups.some((group) => (
    group.id !== currentId
    && group.orderType === data.orderType
    && group.resourceOwnership === data.resourceOwnership
  ));
}

function buildSimpleRule(
  groupId: string,
  data: SimpleCommissionRuleGroupInput,
  payout: SimpleCommissionRulePayout,
  index: number,
): CommissionRule {
  return normalizeRule({
    id: `rule-${uuidv4().slice(0, 8)}`,
    name: `${data.name}-${payout.role}`,
    ruleGroupId: groupId,
    ruleGroupName: data.name,
    productLevel: '',
    orderType: data.orderType,
    sourceType: '',
    scene: '',
    resourceOwnership: data.resourceOwnership,
    paymentChannels: [],
    excludeExternalTalent: false,
    role: payout.role,
    commissionType: payout.commissionType,
    commissionValue: Number(payout.commissionValue) || 0,
    performanceRate: 100,
    splitRatio: 100,
    collaboratorRole: '',
    requiresProof: false,
    clawbackBaseCommission: false,
    scenarioGroup: '新客成交',
    requiresLeaderConfirm: false,
    evidenceTypes: [],
    settlementMode: '自动结算',
    description: '',
    isActive: data.isActive,
    priority: index + 1,
  });
}

async function getSimpleCommissionRuleGroups(): Promise<ApiResponse<SimpleCommissionRuleGroup[]>> {
  ensureInit();
  await delay(160);
  return createSuccessResponse(groupSimpleRules(readCommissionRulesForSimpleGroups()));
}

async function createSimpleCommissionRuleGroup(data: SimpleCommissionRuleGroupInput): Promise<ApiResponse<SimpleCommissionRuleGroup>> {
  ensureInit();
  await delay(180);
  const validation = validateSimpleRuleGroup(data);
  if (validation) return createErrorResponse(validation);
  const existingRules = readCommissionRulesForSimpleGroups();
  const groups = groupSimpleRules(existingRules);
  if (hasDuplicateSimpleCondition(groups, data)) return createErrorResponse('相同订单类型和资源来源的规则已存在');

  const groupId = `crg-${uuidv4().slice(0, 8)}`;
  const newRules = data.payouts.map((payout, index) => buildSimpleRule(groupId, data, payout, index));
  setStorageData(STORAGE_KEYS.COMMISSION_RULES, [...existingRules, ...newRules]);
  return createSuccessResponse(groupSimpleRules(newRules)[0]);
}

async function updateSimpleCommissionRuleGroup(
  id: string,
  data: SimpleCommissionRuleGroupInput,
): Promise<ApiResponse<SimpleCommissionRuleGroup | null>> {
  ensureInit();
  await delay(180);
  const validation = validateSimpleRuleGroup(data);
  if (validation) return createErrorResponse(validation);
  const existingRules = readCommissionRulesForSimpleGroups();
  const groups = groupSimpleRules(existingRules);
  if (!groups.some((group) => group.id === id)) return createSuccessResponse(null);
  if (hasDuplicateSimpleCondition(groups, data, id)) return createErrorResponse('相同订单类型和资源来源的规则已存在');

  const rest = existingRules.filter((rule) => rule.ruleGroupId !== id);
  const nextGroupRules = data.payouts.map((payout, index) => buildSimpleRule(id, data, payout, index));
  setStorageData(STORAGE_KEYS.COMMISSION_RULES, [...rest, ...nextGroupRules]);
  return createSuccessResponse(groupSimpleRules(nextGroupRules)[0]);
}

async function deleteSimpleCommissionRuleGroup(id: string): Promise<ApiResponse<boolean>> {
  ensureInit();
  await delay(120);
  const rules = readCommissionRulesForSimpleGroups();
  setStorageData(STORAGE_KEYS.COMMISSION_RULES, rules.filter((rule) => rule.ruleGroupId !== id));
  return createSuccessResponse(true);
}

async function getCommissionRoleConfigs(
  filters?: CommissionRoleConfigFilters,
): Promise<ApiResponse<CommissionRoleConfig[]>> {
  ensureInit();
  await delay(120);
  let configs = ensureCommissionRoleConfigs();
  if (filters?.isActive !== undefined) configs = configs.filter((item) => item.isActive === filters.isActive);
  if (filters?.search) {
    const q = filters.search.trim().toLowerCase();
    configs = configs.filter((item) => (
      item.name.toLowerCase().includes(q)
      || item.code.toLowerCase().includes(q)
      || item.description?.toLowerCase().includes(q)
    ));
  }
  return createSuccessResponse(configs);
}

async function createCommissionRoleConfig(
  data: CommissionRoleConfigInput,
): Promise<ApiResponse<CommissionRoleConfig>> {
  ensureInit();
  await delay(160);
  const existing = ensureCommissionRoleConfigs();
  const validation = validateCommissionRoleConfig(data, existing);
  if (validation) return createErrorResponse(validation);
  const now = new Date().toISOString();
  const newConfig = normalizeCommissionRoleConfig({
    id: `commission-role-${uuidv4().slice(0, 8)}`,
    ...data,
    name: data.name.trim(),
    code: data.code.trim(),
    createdAt: now,
    updatedAt: now,
  });
  const next = sortCommissionRoleConfigs([...existing, newConfig]);
  setStorageData(STORAGE_KEYS.COMMISSION_ROLE_CONFIGS, next);
  return createSuccessResponse(newConfig);
}

async function updateCommissionRoleConfig(
  id: string,
  data: Partial<CommissionRoleConfigInput>,
): Promise<ApiResponse<CommissionRoleConfig | null>> {
  ensureInit();
  await delay(160);
  const existing = ensureCommissionRoleConfigs();
  const idx = existing.findIndex((item) => item.id === id || item.code === id);
  if (idx === -1) return createSuccessResponse(null);

  const before = existing[idx];
  const nextConfig = normalizeCommissionRoleConfig({
    ...before,
    ...data,
    name: data.name !== undefined ? data.name.trim() : before.name,
    code: data.code !== undefined ? data.code.trim() : before.code,
    updatedAt: new Date().toISOString(),
  });
  const validation = validateCommissionRoleConfig(nextConfig, existing, before.id);
  if (validation) return createErrorResponse(validation);

  const next = sortCommissionRoleConfigs(existing.map((item) => (item.id === before.id ? nextConfig : item)));
  setStorageData(STORAGE_KEYS.COMMISSION_ROLE_CONFIGS, next);

  if (before.name !== nextConfig.name) {
    const rules = getStorageData<CommissionRule[]>(STORAGE_KEYS.COMMISSION_RULES) || [];
    setStorageData(STORAGE_KEYS.COMMISSION_RULES, rules.map((rule) => (
      rule.role === before.name ? { ...rule, role: nextConfig.name } : rule
    )));
    const commissions = getStorageData<Commission[]>(STORAGE_KEYS.COMMISSIONS) || [];
    setStorageData(STORAGE_KEYS.COMMISSIONS, commissions.map((commission) => (
      commission.role === before.name ? { ...commission, role: nextConfig.name } : commission
    )));
  }

  return createSuccessResponse(nextConfig);
}

async function deleteCommissionRoleConfig(id: string): Promise<ApiResponse<boolean>> {
  ensureInit();
  await delay(120);
  const configs = ensureCommissionRoleConfigs();
  const target = configs.find((item) => item.id === id || item.code === id);
  if (!target) return createSuccessResponse(true);
  if (isCommissionRoleUsed(target.name)) return createErrorResponse('该提成角色已被规则或提成记录使用，不能删除，请改为停用');
  setStorageData(STORAGE_KEYS.COMMISSION_ROLE_CONFIGS, configs.filter((item) => item.id !== target.id));
  return createSuccessResponse(true);
}

function resolveCommissionRoleOwner(order: Order, role: CommissionRole): string {
  const config = getCommissionRoleConfigByName(role);
  const source = config?.personSource;
  if (source === 'sales_owner') return order.salesName || order.owner || '';
  if (source === 'lead_contributor') return order.leadContributorName || '';
  if (source === 'customer_success') return order.successName || '';
  if (source === 'after_sales') return order.serviceName || '';
  if (source === 'manual') return '';

  if (role === '销售') return order.salesName || order.owner || '';
  if (role === '线索') return order.leadContributorName || '';
  if (role === '客户成功') return order.successName || '';
  if (role === '售后') return order.serviceName || '';
  return order.owner || '';
}

function resolveCommissionRoleAssignee(order: Order, role: CommissionRole): CommissionRoleAssignee {
  const users = readActiveUsers();
  const departments = readActiveDepartments();
  const roleName = String(role);
  const fallbackDepartment = DEFAULT_ROLE_DEPARTMENTS[roleName] || '';

  if (roleName === ROLE_MATCH_TEXT.sales) {
    return buildAssignee(findUser(users, (order as any).salesId, order.salesName || order.owner), departments, order.salesName || order.owner, fallbackDepartment);
  }

  if (roleName === ROLE_MATCH_TEXT.lead) {
    return buildAssignee(findUser(users, (order as any).leadContributorId, order.leadContributorName), departments, order.leadContributorName, fallbackDepartment);
  }

  if (roleName === ROLE_MATCH_TEXT.customerSuccess) {
    return buildAssignee(findUser(users, (order as any).successId, (order as any).successName), departments, (order as any).successName, fallbackDepartment);
  }

  if (roleName === ROLE_MATCH_TEXT.service) {
    return buildAssignee(findUser(users, (order as any).serviceId, (order as any).serviceName), departments, (order as any).serviceName, fallbackDepartment);
  }

  if (roleName === ROLE_MATCH_TEXT.salesManager || roleName === ROLE_MATCH_TEXT.salesManagerAlt) {
    const salesUser = findUser(users, (order as any).salesId, order.salesName || order.owner);
    const salesDepartment = salesUser?.departmentId
      ? departments.find((department) => department.id === salesUser.departmentId)
      : undefined;
    const manager = salesDepartment?.managerId
      ? users.find((user) => user.id === salesDepartment.managerId)
      : undefined;
    return buildAssignee(manager, departments, undefined, fallbackDepartment);
  }

  return buildAssignee(undefined, departments, undefined, fallbackDepartment);
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

function hasLeadContributor(order: Order): boolean {
  return Boolean(order.leadContributorName || (order as any).leadContributorId);
}

function matchesRule(rule: CommissionRule, order: Order): boolean {
  const normalized = normalizeRule(rule);
  const channel = order.officialPaymentChannel || mapPaymentMethodToOfficialChannel(order.paymentMethod);
  const orderAmount = order.actualAmount || order.amount;

  if (!normalized.isActive) return false;
  if (normalized.role === ROLE_MATCH_TEXT.lead && !hasLeadContributor(order)) return false;
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
  getCommissionRoleConfigs,
  createCommissionRoleConfig,
  updateCommissionRoleConfig,
  deleteCommissionRoleConfig,
  getSimpleCommissionRuleGroups,
  createSimpleCommissionRuleGroup,
  updateSimpleCommissionRuleGroup,
  deleteSimpleCommissionRuleGroup,
  resolveCommissionRoleAssignee,
  resolveCommissionRoleOwner,
  getCommissionRules,
  createCommissionRule,
  updateCommissionRule,
  deleteCommissionRule,
  calculateCommissions,
  calculateCommissionsForOrder,
  clawbackBaseCommissions,
};
