import type {
  Commission,
  CommissionAdjustmentInput,
  CommissionAuditIssue,
  CommissionCreatableOrderSummary,
  CommissionFilters,
  CommissionOrderSummary,
  CommissionOrderSummaryFilters,
  CommissionOrderSummaryStatusCounts,
  CommissionOperationLog,
  CommissionSettlementBatch,
  CommissionChargebackCompleteInput,
  CommissionRule,
  CommissionTier,
  CommissionTierSnapshot,
  MonthlyCommissionTierConfig,
  MonthlyCommissionPayout,
  MonthlyCommissionRoleSummary,
  CommissionStats,
  CommissionStatus,
} from '../types/commission';
import type { Order } from '../types/order';
import type { Product } from '../types/product';
import type { User } from '../types/settings';
import type { Department } from '../types/department';
import type { ApiResponse, PaginatedResponse } from './types';
import { createErrorResponse, createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { STORAGE_KEYS, DEFAULT_PAGE_SIZE } from '../shared/utils/constants';
import { initializeMockData } from './mock';
import { getCurrentOperatorName } from '../shared/utils/currentOperator';
import { v4 as uuidv4 } from 'uuid';

function ensureInit(): void {
  initializeMockData();
}

const ROLE_DEPARTMENT_MAP: Record<Commission['role'], string> = {
  '销售': '销售部',
  '线索': '市场部',
  '客户成功': '客户成功部',
  '售后': '售后服务部',
  '招商主管': '招商部',
  '销售主管': '销售部',
};

const PENDING_ASSIGN_TEXT = '\u5f85\u5206\u914d';
const DEFAULT_MONTHLY_COMMISSION_TIERS: CommissionTier[] = [
  { minAmount: 0, maxAmount: 30000, rate: 8 },
  { minAmount: 30000, maxAmount: 50000, rate: 10 },
  { minAmount: 50000, rate: 15 },
];

function roundMoney(amount: number): number {
  return Math.round(Number(amount || 0) * 100) / 100;
}

function normalizeCommissionTiers(tiers?: CommissionTier[]): CommissionTier[] {
  return (tiers?.length ? tiers : DEFAULT_MONTHLY_COMMISSION_TIERS)
    .map((tier) => {
      const maxAmount = tier.maxAmount === undefined || tier.maxAmount === null || Number(tier.maxAmount) <= 0
        ? undefined
        : Number(tier.maxAmount);
      return {
        minAmount: Number(tier.minAmount) || 0,
        ...(maxAmount === undefined ? {} : { maxAmount }),
        rate: Number(tier.rate) || 0,
      };
    })
    .sort((a, b) => a.minAmount - b.minAmount);
}

function normalizeExplicitCommissionTiers(tiers?: CommissionTier[]): CommissionTier[] {
  if (!tiers?.length) return [];
  return normalizeCommissionTiers(tiers);
}

function validateCommissionTiers(tiers?: CommissionTier[]): string | null {
  const normalized = normalizeCommissionTiers(tiers);
  if (!normalized.length) return '至少需要配置一个阶梯档位';
  if (normalized[0].minAmount !== 0) return '第一档下限必须为 0';
  for (let index = 0; index < normalized.length; index += 1) {
    const tier = normalized[index];
    if (tier.minAmount < 0) return '阶梯下限不能小于 0';
    if (tier.rate < 0) return '提成比例不能小于 0';
    if (tier.maxAmount !== undefined && tier.maxAmount <= tier.minAmount) return '阶梯上限必须大于下限';
    const next = normalized[index + 1];
    if (next && tier.maxAmount !== next.minAmount) return '阶梯区间必须连续且不能重叠';
    if (!next && tier.maxAmount !== undefined) return '最后一个阶梯必须不设置上限';
  }
  return null;
}

function readMonthlyTierConfigs(): Record<string, MonthlyCommissionTierConfig> {
  return getStorageData<Record<string, MonthlyCommissionTierConfig>>(STORAGE_KEYS.MONTHLY_COMMISSION_TIER_CONFIGS) || {};
}

function getMonthlyTierConfig(period: string): MonthlyCommissionTierConfig {
  const configs = readMonthlyTierConfigs();
  const existing = configs[period];
  return {
    period,
    tiers: normalizeCommissionTiers(existing?.tiers),
    updatedAt: existing?.updatedAt,
  };
}

function resolveMonthlyTier(tiers: CommissionTier[], monthlyPaidAmount: number): CommissionTier | undefined {
  return normalizeCommissionTiers(tiers).find((tier) => (
    monthlyPaidAmount >= tier.minAmount
    && (tier.maxAmount === undefined || monthlyPaidAmount < tier.maxAmount)
  ));
}

function resolveExplicitTier(tiers: CommissionTier[], baseAmount: number): CommissionTier | undefined {
  return normalizeExplicitCommissionTiers(tiers).find((tier) => (
    baseAmount >= tier.minAmount
    && (tier.maxAmount === undefined || baseAmount < tier.maxAmount)
  ));
}

function buildTierSnapshot(tiers: CommissionTier[], baseAmount: number): CommissionTierSnapshot | undefined {
  const normalized = normalizeExplicitCommissionTiers(tiers);
  if (!normalized.length) return undefined;
  const currentTier = resolveExplicitTier(normalized, baseAmount);
  const nextTier = normalized.find((tier) => tier.minAmount > baseAmount);
  return {
    tiers: normalized,
    currentTier,
    nextTier,
    baseAmount: roundMoney(baseAmount),
    gapToNext: nextTier ? roundMoney(nextTier.minAmount - baseAmount) : 0,
  };
}

function formatTierRange(tier?: CommissionTier): string {
  if (!tier) return '未命中阶梯';
  return tier.maxAmount === undefined
    ? `${tier.minAmount} 元以上`
    : `${tier.minAmount}-${tier.maxAmount} 元`;
}

function getActiveUsers(): User[] {
  return (getStorageData<User[]>(STORAGE_KEYS.USERS) || []).filter((user) => user.isActive);
}

function getActiveDepartments(): Department[] {
  return (getStorageData<Department[]>(STORAGE_KEYS.DEPARTMENTS) || []).filter((department) => department.isActive);
}

type CommissionNormalizeContext = {
  ordersById: Map<string, Order>;
  users: User[];
  departments: Department[];
};

function createCommissionNormalizeContext(): CommissionNormalizeContext {
  return {
    ordersById: new Map(getOrders().map((order) => [order.id, order])),
    users: getActiveUsers(),
    departments: getActiveDepartments(),
  };
}

function findUserByIdOrName(idOrName?: string, fallbackName?: string, users = getActiveUsers()): User | undefined {
  const values = [idOrName, fallbackName].filter(Boolean) as string[];
  return users.find((user) => values.includes(user.id) || values.includes(user.name));
}

function getDepartmentByUser(user?: User, departments = getActiveDepartments()): Department | undefined {
  if (!user?.departmentId) return undefined;
  return departments.find((department) => department.id === user.departmentId);
}

function getCommissionPaymentDate(commission: Commission, order?: Order): string {
  return commission.paymentDate || order?.payments?.[0]?.paidAt || order?.createdAt || commission.createdAt;
}

function normalizeDateRange(start?: string, end?: string): { startDate: string; endDate: string } {
  const startDate = start ? (start.length === 10 ? `${start}T00:00:00.000Z` : start) : '';
  const endDate = end ? (end.length === 10 ? `${end}T23:59:59.999Z` : end) : '';
  return { startDate, endDate };
}

function normalizeCommissionStatus(c: Commission): CommissionStatus {
  const rawStatus = String(c.status);
  if (rawStatus === '待审核') return '待确认';
  if (rawStatus === '已取消') return '已撤回';
  if (rawStatus === '异常') return '已撤回';
  return c.status as CommissionStatus;
}

function isWithdrawnCommission(commission: Commission): boolean {
  return commission.status === '已撤回' || String(commission.status) === '已取消';
}

function isChargebackPendingCommission(commission: Commission): boolean {
  return commission.status === '待冲销';
}

function isChargedBackCommission(commission: Commission): boolean {
  return commission.status === '已冲销';
}

function isInactiveCommission(commission: Commission): boolean {
  return isWithdrawnCommission(commission) || isChargebackPendingCommission(commission) || isChargedBackCommission(commission);
}

function isCommissionPendingHandling(commission: Commission): boolean {
  const note = `${commission.auditReason || ''}${commission.frozenReason || ''}${commission.calculationNote || ''}`;
  return isPendingAssignment(commission)
    || Boolean(commission.frozenReason)
    || note.includes('冻结');
}

function isPendingAssignment(commission: Commission): boolean {
  return commission.owner === PENDING_ASSIGN_TEXT || !commission.ownerId;
}

function resolveRuleCalculationType(c: Commission): Commission['ruleCalculationType'] {
  if (c.ruleCalculationType) return c.ruleCalculationType;
  if (!c.commissionRuleId) return undefined;
  const rule = (getStorageData<CommissionRule[]>(STORAGE_KEYS.COMMISSION_RULES) || [])
    .find((item) => item.id === c.commissionRuleId);
  return rule?.commissionType;
}

function resolveRuleTiers(c: Commission): CommissionTier[] {
  const snapshotTiers = normalizeExplicitCommissionTiers(c.tierSnapshot?.tiers);
  if (snapshotTiers.length) return snapshotTiers;
  if (!c.commissionRuleId) return [];
  const rule = (getStorageData<CommissionRule[]>(STORAGE_KEYS.COMMISSION_RULES) || [])
    .find((item) => item.id === c.commissionRuleId);
  return normalizeExplicitCommissionTiers(rule?.tiers);
}

function normalizeCommission(c: Commission, context = createCommissionNormalizeContext()): Commission {
  const normalizedStatus = normalizeCommissionStatus(c);
  const evidenceStatus = c.evidenceStatus || '无需凭证';
  const order = context.ordersById.get(c.orderId);
  const ownerUser = findUserByIdOrName(c.ownerId, c.owner, context.users);
  const ownerDepartment = getDepartmentByUser(ownerUser, context.departments);
  const ruleCalculationType = resolveRuleCalculationType(c);
  return {
    ...c,
    status: normalizedStatus,
    role: c.role || '销售',
    department: c.department || '销售部',
    proofStatus: c.proofStatus || '无需凭证',
    resourceOwnership: c.resourceOwnership || '公司资源',
    scene: c.scene || (c.productLevel === '899' ? '899成交' : '新代理'),
    owner: c.owner || ownerUser?.name || PENDING_ASSIGN_TEXT,
    ownerId: c.ownerId || ownerUser?.id,
    departmentId: c.departmentId || ownerDepartment?.id,
    paymentDate: getCommissionPaymentDate(c, order),
    evidenceStatus,
    evidenceRequired: c.evidenceRequired ?? evidenceStatus !== '无需凭证',
    ruleCalculationType,
    tierSnapshot: c.tierSnapshot || (
      ruleCalculationType === 'tiered_percentage'
        ? buildTierSnapshot(resolveRuleTiers(c), Number(c.performanceAmount || c.orderAmount || 0))
        : undefined
    ),
    formulaText: c.formulaText || (
      c.commissionRate > 0
        ? `业绩金额 ${c.performanceAmount || c.orderAmount} × ${Math.round(c.commissionRate * 100)}% = ${c.commissionAmount} 元`
        : `固定提成 ${c.commissionAmount} 元`
    ),
  };
}

function getAllCommissions(): Commission[] {
  const context = createCommissionNormalizeContext();
  return (getStorageData<Commission[]>(STORAGE_KEYS.COMMISSIONS) || [])
    .map((commission) => normalizeCommission(commission, context))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function saveCommissions(commissions: Commission[]): void {
  setStorageData(STORAGE_KEYS.COMMISSIONS, commissions);
}

function getOrders(): Order[] {
  return (getStorageData<Order[]>(STORAGE_KEYS.ORDERS) || []).filter((order) => !order.deletedAt);
}

function getProductName(productId?: string, productLevel?: string, fallback?: string): string | undefined {
  const products = getStorageData<Product[]>(STORAGE_KEYS.PRODUCTS) || [];
  const matched = (productId ? products.find((product) => product.id === productId) : undefined)
    || (productLevel ? products.find((product) => product.level === productLevel) : undefined);
  return matched?.name || fallback || productLevel;
}

function getOrderById(orderId: string): Order | undefined {
  return getOrders().find((order) => order.id === orderId);
}

function getOrderPaymentDate(order: Order): string {
  return order.payments?.[0]?.paidAt || order.createdAt;
}

function isValidMonthlyPaidOrder(order: Order): boolean {
  return order.status !== '已取消';
}

function isOrderOwnedByEmployee(order: Order, ownerId?: string, ownerName?: string): boolean {
  if (ownerId && order.salesId) return order.salesId === ownerId;
  const targetName = ownerName || '';
  return Boolean(targetName) && (order.salesName === targetName || order.owner === targetName);
}

function calcMonthlyPaidAmountForEmployee(period: string, ownerId?: string, ownerName?: string): number {
  return roundMoney(getOrders()
    .filter((order) => getOrderPaymentDate(order).startsWith(period))
    .filter(isValidMonthlyPaidOrder)
    .filter((order) => isOrderOwnedByEmployee(order, ownerId, ownerName))
    .reduce((total, order) => total + Number(order.actualAmount || order.amount || 0), 0));
}

function isTieredMonthlyCommission(commission: Commission): boolean {
  return commission.ruleCalculationType === 'tiered_percentage';
}

function countsTowardTieredMonthlyBase(commission: Commission): boolean {
  return isTieredMonthlyCommission(commission)
    && !isWithdrawnCommission(commission)
    && !isChargebackPendingCommission(commission)
    && !isChargedBackCommission(commission);
}

function shouldRecalculateTieredCommission(commission: Commission): boolean {
  return isTieredMonthlyCommission(commission)
    && commission.status !== '已发放'
    && !isWithdrawnCommission(commission)
    && !isChargebackPendingCommission(commission)
    && !isChargedBackCommission(commission);
}

function applyMonthlyTieredCommissions(period: string, commissions: Commission[]): Commission[] {
  const rows = commissions.map((commission) => normalizeCommission(commission));
  const monthlyBaseByOwnerRole = new Map<string, number>();

  rows.forEach((commission) => {
    if (!countsTowardTieredMonthlyBase(commission)) return;
    const paymentDate = commission.paymentDate || commission.createdAt;
    if (!paymentDate.startsWith(period)) return;
    const ownerKey = commission.ownerId || `name:${commission.owner}`;
    const key = `${ownerKey}::${commission.role}`;
    monthlyBaseByOwnerRole.set(
      key,
      roundMoney((monthlyBaseByOwnerRole.get(key) || 0) + Number(commission.performanceAmount || commission.orderAmount || 0)),
    );
  });

  return rows.map((commission) => {
    if (!shouldRecalculateTieredCommission(commission)) return commission;
    const paymentDate = commission.paymentDate || commission.createdAt;
    if (!paymentDate.startsWith(period)) return commission;
    const ownerKey = commission.ownerId || `name:${commission.owner}`;
    const monthlyPaidAmount = monthlyBaseByOwnerRole.get(`${ownerKey}::${commission.role}`) || 0;
    const tiers = resolveRuleTiers(commission);
    if (!tiers.length) {
      const formulaText = '缺少销售阶梯规则，请在提成规则中补充阶梯档位后重新确认分账';
      return {
        ...commission,
        commissionRate: 0,
        commissionAmount: 0,
        tierSnapshot: undefined,
        status: '待确认',
        auditReason: formulaText,
        formulaText,
        calculationNote: [commission.calculationNote, formulaText].filter(Boolean).join('；'),
      };
    }
    const tierSnapshot = buildTierSnapshot(tiers, monthlyPaidAmount);
    const tier = tierSnapshot?.currentTier;
    const rate = tier?.rate || 0;
    const performanceAmount = Number(commission.performanceAmount || commission.orderAmount || 0);
    const commissionAmount = roundMoney(performanceAmount * (rate / 100));
    const formulaText = `销售角色月累计阶梯业绩 ${monthlyPaidAmount} 元，命中 ${formatTierRange(tier)} × ${rate}%；本单业绩 ${performanceAmount} × ${rate}% = ${commissionAmount} 元`;
    return {
      ...commission,
      commissionRate: rate / 100,
      commissionAmount,
      tierSnapshot,
      formulaText,
      calculationNote: [commission.calculationNote, formulaText].filter(Boolean).join('；'),
    };
  });
}

function refreshMonthlyTieredCommissions(period: string): Commission[] {
  const commissions = getStorageData<Commission[]>(STORAGE_KEYS.COMMISSIONS) || [];
  const next = applyMonthlyTieredCommissions(period, commissions);
  saveCommissions(next);
  return next;
}

function getOrderCommissions(orderId: string): Commission[] {
  return getAllCommissions()
    .filter((commission) => commission.orderId === orderId)
    .sort((a, b) => {
      const roleOrder = ['线索', '销售', '客户成功', '售后', '招商主管', '销售主管'];
      return roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role);
    });
}

function getCommissionOperationLogs(orderId?: string): CommissionOperationLog[] {
  const logs = getStorageData<CommissionOperationLog[]>(STORAGE_KEYS.COMMISSION_OPERATION_LOGS) || [];
  return logs
    .filter((log) => !orderId || log.orderId === orderId)
    .sort((a, b) => new Date(b.operatedAt).getTime() - new Date(a.operatedAt).getTime());
}

function appendCommissionOperationLog(
  order: Pick<Order, 'id' | 'orderNo' | 'customerName'>,
  action: CommissionOperationLog['action'],
  reason: string | undefined,
  commissions: Commission[],
  operator: string,
  operatedAt: string,
): void {
  const splitSnapshot = commissions.map((commission) => {
    const normalized = normalizeCommission(commission);
    return {
      role: normalized.role,
      owner: normalized.owner,
      ownerId: normalized.ownerId,
      department: normalized.department,
      commissionAmount: Math.round(Number(normalized.commissionAmount || 0) * 100) / 100,
      status: normalized.status,
    };
  });
  const totalCommissionAmount = Math.round(
    splitSnapshot.reduce((sum, item) => sum + Number(item.commissionAmount || 0), 0) * 100,
  ) / 100;
  const normalizedReason = reason?.trim();
  const splitText = splitSnapshot
    .map((item) => `${item.role}：${item.owner} ${item.commissionAmount} 元`)
    .join('；');
  const summary = [
    action === '调整分账' ? '已保存新的分账结果' : action,
    splitText,
    `合计 ${totalCommissionAmount} 元`,
    normalizedReason ? `原因：${normalizedReason}` : '',
  ].filter(Boolean).join('，');
  const logs = getStorageData<CommissionOperationLog[]>(STORAGE_KEYS.COMMISSION_OPERATION_LOGS) || [];
  setStorageData(STORAGE_KEYS.COMMISSION_OPERATION_LOGS, [{
    id: `comm-log-${uuidv4().slice(0, 8)}`,
    orderId: order.id,
    orderNo: order.orderNo,
    customerName: order.customerName,
    action,
    operator,
    operatedAt,
    reason: normalizedReason,
    summary,
    commissionCount: splitSnapshot.length,
    totalCommissionAmount,
    splitSnapshot,
  }, ...logs]);
}

function applyFilters(commissions: Commission[], filters?: CommissionFilters): Commission[] {
  let filtered = [...commissions];

  if (filters?.search) {
    const q = filters.search.toLowerCase();
    filtered = filtered.filter(
      (c) => c.customerName.toLowerCase().includes(q) || c.orderNo.toLowerCase().includes(q),
    );
  }
  if (filters?.productLevel) filtered = filtered.filter((c) => c.productLevel === filters.productLevel);
  if (filters?.status) filtered = filtered.filter((c) => c.status === filters.status);
  if (filters?.owner) filtered = filtered.filter((c) => c.owner === filters.owner);
  if (filters?.ownerId) filtered = filtered.filter((c) => c.ownerId === filters.ownerId || c.owner === findUserByIdOrName(filters.ownerId)?.name);
  if (filters?.role) filtered = filtered.filter((c) => c.role === filters.role);
  if (filters?.department) filtered = filtered.filter((c) => c.department === filters.department);
  if (filters?.departmentId) filtered = filtered.filter((c) => c.departmentId === filters.departmentId);
  if (filters?.month) {
    filtered = filtered.filter((c) => (c.paymentDate || c.createdAt).startsWith(filters.month!));
  }
  const startDate = filters?.startDate
    ? filters.startDate.length === 10 ? `${filters.startDate}T00:00:00.000Z` : filters.startDate
    : '';
  const endDate = filters?.endDate
    ? filters.endDate.length === 10 ? `${filters.endDate}T23:59:59.999Z` : filters.endDate
    : '';
  if (startDate) filtered = filtered.filter((c) => (c.paymentDate || c.createdAt) >= startDate);
  if (endDate) filtered = filtered.filter((c) => (c.paymentDate || c.createdAt) <= endDate);

  return filtered;
}

async function fetchCommissions(filters?: CommissionFilters): Promise<ApiResponse<PaginatedResponse<Commission>>> {
  ensureInit();
  await delay(200);
  const filtered = applyFilters(getAllCommissions(), filters);

  const page = filters?.page || 1;
  const pageSize = filters?.pageSize || DEFAULT_PAGE_SIZE;
  const total = filtered.length;
  const totalPages = Math.ceil(total / pageSize);
  const items = filtered.slice((page - 1) * pageSize, page * pageSize);

  return createSuccessResponse({ items, pagination: { page, pageSize, total, totalPages } });
}

async function fetchCommissionsByOrder(orderId: string): Promise<ApiResponse<Commission[]>> {
  ensureInit();
  await delay(120);
  return createSuccessResponse(getOrderCommissions(orderId));
}

function deriveOrderSummaryStatus(commissions: Commission[]): CommissionOrderSummary['status'] {
  if (commissions.some(isCommissionPendingHandling)) return '待处理';
  if (commissions.every(isInactiveCommission)) return '已撤回';
  if (commissions.every((commission) => commission.status === '已发放')) return '已发放';
  if (commissions.every((commission) => commission.status === '待发放' || commission.status === '已发放')) return '待发放';
  return '待确认';
}

function buildCommissionOrderSummaries(commissions: Commission[]): CommissionOrderSummary[] {
  const formalOrderCommissions = commissions.filter((commission) => (
    commission.sourceBusinessType !== 'after_sales_recovery'
    && commission.sourceBusinessType !== 'refund_recovery'
    && !commission.sourceRecoveryOrderId
  ));
  const ordersById = new Map(getOrders().map((order) => [order.id, order]));
  const roleOrder = ['线索', '销售', '客户成功', '售后', '招商主管', '销售主管'];
  const orderMap = new Map<string, Commission[]>();
  formalOrderCommissions.forEach((commission) => {
    const rows = orderMap.get(commission.orderId) || [];
    rows.push(commission);
    orderMap.set(commission.orderId, rows);
  });

  return Array.from(orderMap.entries()).map(([orderId, rows]) => {
    const sortedRows = rows.slice().sort((a, b) => roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role));
    const first = sortedRows[0];
    const order = ordersById.get(orderId);
    const paymentDate = getCommissionPaymentDate(first, order);
    const orderAmount = order?.actualAmount || order?.amount || first.orderAmount;
    return {
      orderId,
      orderNo: first.orderNo,
      customerName: first.customerName,
      productName: getProductName(order?.productId, order?.productLevel || first.productLevel, order?.productName),
      productLevel: first.productLevel,
      orderType: order?.orderType || first.scene || '',
      paymentDate,
      orderAmount,
      resourceOwnership: order?.resourceOwnership || first.resourceOwnership,
      refundStatus: order?.refundStatus,
      salesOwner: order?.salesName || order?.owner || '',
      salesId: order?.salesId,
      salesName: order?.salesName,
      leadInputBy: order?.leadInputBy,
      leadContributorName: order?.leadContributorName,
      sourceType: order?.sourceType,
      officialPaymentChannel: order?.officialPaymentChannel,
      originalOrderId: order?.originalOrderId,
      notes: order?.notes,
      createdAt: order?.createdAt || first.createdAt,
      sourceOrderDeleted: !order,
      totalCommissionAmount: Math.round(sortedRows.reduce((sumValue, item) => sumValue + item.commissionAmount, 0) * 100) / 100,
      pendingAssignCount: sortedRows.filter(isPendingAssignment).length,
      exceptionCount: sortedRows.filter(isInactiveCommission).length,
      status: deriveOrderSummaryStatus(sortedRows),
      splitSummary: sortedRows.map((item) => ({
        role: item.role,
        amount: item.commissionAmount,
        owner: item.owner,
        ownerId: item.ownerId,
        status: item.status,
      })),
      commissions: sortedRows,
    };
  }).sort((a, b) => new Date(b.paymentDate || '').getTime() - new Date(a.paymentDate || '').getTime());
}

function applyOrderSummaryFilters(summaries: CommissionOrderSummary[], filters?: CommissionOrderSummaryFilters): CommissionOrderSummary[] {
  let filtered = [...summaries];
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    filtered = filtered.filter((item) => item.orderNo.toLowerCase().includes(q) || item.customerName.toLowerCase().includes(q));
  }
  if (filters?.status && filters.status !== '全部') filtered = filtered.filter((item) => item.status === filters.status);
  if (filters?.ownerId) filtered = filtered.filter((item) => item.commissions.some((commission) => commission.ownerId === filters.ownerId));
  if (filters?.role) filtered = filtered.filter((item) => item.commissions.some((commission) => commission.role === filters.role));
  if (filters?.month) filtered = filtered.filter((item) => item.paymentDate.startsWith(filters.month!));
  const { startDate, endDate } = normalizeDateRange(filters?.startDate, filters?.endDate);
  if (startDate) filtered = filtered.filter((item) => item.paymentDate >= startDate);
  if (endDate) filtered = filtered.filter((item) => item.paymentDate <= endDate);
  return filtered;
}

async function fetchCommissionOrderSummaries(filters?: CommissionOrderSummaryFilters): Promise<ApiResponse<PaginatedResponse<CommissionOrderSummary>>> {
  ensureInit();
  await delay(160);
  const filtered = applyOrderSummaryFilters(buildCommissionOrderSummaries(getAllCommissions()), filters);
  const page = filters?.page || 1;
  const pageSize = filters?.pageSize || DEFAULT_PAGE_SIZE;
  const total = filtered.length;
  const totalPages = Math.ceil(total / pageSize);
  const items = filtered.slice((page - 1) * pageSize, page * pageSize);
  return createSuccessResponse({ items, pagination: { page, pageSize, total, totalPages } });
}

async function fetchCommissionOrderSummaryStatusCounts(filters?: CommissionOrderSummaryFilters): Promise<ApiResponse<CommissionOrderSummaryStatusCounts>> {
  ensureInit();
  await delay(120);
  const summaries = buildCommissionOrderSummaries(getAllCommissions());
  const filtered = applyOrderSummaryFilters(summaries, { ...filters, status: '全部' });
  const counts: CommissionOrderSummaryStatusCounts = {
    全部: filtered.length,
    待处理: 0,
    待确认: 0,
    待发放: 0,
    已发放: 0,
    已撤回: 0,
  };
  filtered.forEach((summary) => {
    counts[summary.status] += 1;
  });
  return createSuccessResponse(counts);
}

function hasEffectiveCommission(commissions: Commission[]): boolean {
  return commissions.some((commission) => {
    const status = normalizeCommission(commission).status;
    return !['已撤回', '待冲销', '已冲销', '已取消'].includes(status);
  });
}

function isCreatableCommissionOrder(order: Order, commissions: Commission[]): boolean {
  const orderStatus = order.status || '';
  return orderStatus === '已确认'
    && !hasEffectiveCommission(commissions);
}

function mapCreatableOrder(order: Order): CommissionCreatableOrderSummary {
  return {
    orderId: order.id,
    orderNo: order.orderNo,
    customerName: order.customerName,
    productName: getProductName(order.productId, order.productLevel, order.productName),
    productLevel: order.productLevel,
    orderType: order.orderType,
    paymentDate: order.payments?.[0]?.paidAt || order.createdAt,
    orderAmount: order.actualAmount || order.amount,
    resourceOwnership: order.resourceOwnership,
    salesOwner: order.salesName || order.owner,
  };
}

async function fetchCreatableCommissionOrders(
  filters?: Pick<CommissionOrderSummaryFilters, 'search' | 'page' | 'pageSize'>,
): Promise<ApiResponse<PaginatedResponse<CommissionCreatableOrderSummary>>> {
  ensureInit();
  await delay(140);
  const commissionsByOrderId = new Map<string, Commission[]>();
  getAllCommissions().forEach((commission) => {
    const rows = commissionsByOrderId.get(commission.orderId) || [];
    rows.push(commission);
    commissionsByOrderId.set(commission.orderId, rows);
  });

  let filtered = getOrders()
    .filter((order) => isCreatableCommissionOrder(order, commissionsByOrderId.get(order.id) || []))
    .map(mapCreatableOrder);

  const q = filters?.search?.trim().toLowerCase();
  if (q) {
    filtered = filtered.filter((order) => (
      order.orderNo.toLowerCase().includes(q)
      || order.customerName.toLowerCase().includes(q)
    ));
  }

  filtered.sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());
  const page = filters?.page || 1;
  const pageSize = filters?.pageSize || DEFAULT_PAGE_SIZE;
  const total = filtered.length;
  const totalPages = Math.ceil(total / pageSize);
  const items = filtered.slice((page - 1) * pageSize, page * pageSize);

  return createSuccessResponse({ items, pagination: { page, pageSize, total, totalPages } });
}

function resolveAdjustmentUser(input: CommissionAdjustmentInput): { user?: User; department?: Department; error?: string } {
  if (!input.ownerId) {
    return { error: '\u8bf7\u9009\u62e9\u7cfb\u7edf\u5458\u5de5\u4f5c\u4e3a\u5206\u6da6\u4eba\u5458' };
  }
  const user = getActiveUsers().find((item) => item.id === input.ownerId && item.isActive);
  if (!user) return { error: '\u5206\u6da6\u4eba\u5458\u4e0d\u5b58\u5728\u6216\u5df2\u505c\u7528' };
  return { user, department: getDepartmentByUser(user) };
}

function buildAdjustedCommission(
  order: Order,
  input: CommissionAdjustmentInput,
  assignee: { user: User; department?: Department },
  existing: Commission | undefined,
  adjustReason: string,
  operator: string,
  now: string,
): Commission {
  const orderAmount = order.actualAmount || order.amount;
  const performanceAmount = input.performanceAmount ?? existing?.performanceAmount ?? order.performanceBaseAmount ?? orderAmount;
  const calculationType = input.ruleCalculationType || existing?.ruleCalculationType || (input.commissionRate && input.commissionRate > 0 ? 'percentage' : 'fixed');
  const matchedRule = input.commissionRuleId
    ? (getStorageData<CommissionRule[]>(STORAGE_KEYS.COMMISSION_RULES) || []).find((rule) => rule.id === input.commissionRuleId)
    : undefined;
  const payoutPlanName = input.payoutPlanName || existing?.payoutPlanName || matchedRule?.payoutPlanName;
  const tierSource = normalizeExplicitCommissionTiers(input.tierSnapshot?.tiers || existing?.tierSnapshot?.tiers || matchedRule?.tiers);
  const tierSnapshot = calculationType === 'tiered_percentage'
    ? buildTierSnapshot(tierSource, performanceAmount)
    : undefined;
  const commissionRate = calculationType === 'percentage' ? Number(input.commissionRate || 0) : 0;
  const amount = calculationType === 'tiered_percentage'
    ? 0
    : calculationType === 'percentage'
      ? roundMoney(performanceAmount * commissionRate)
      : roundMoney(input.commissionAmount || 0);
  const formulaText = calculationType === 'tiered_percentage'
    ? (tierSource.length
      ? `${payoutPlanName || '销售月累计阶梯提成'}，金额由员工提成月报按销售角色阶梯业绩自动结算`
      : `${payoutPlanName || '销售月累计阶梯提成'} 缺少销售阶梯规则，请绑定一条销售阶梯规则`)
    : calculationType === 'percentage'
      ? `${payoutPlanName ? `${payoutPlanName}：` : ''}业绩金额 ${performanceAmount} × ${roundMoney(commissionRate * 100)}% = ${amount} 元`
      : `${payoutPlanName ? `${payoutPlanName}：` : ''}固定提成 ${amount} 元`;
  const sourceType = existing?.sourceType || '人工新增';
  return {
    id: existing?.id || input.id || `comm-${uuidv4().slice(0, 8)}`,
    orderId: order.id,
    orderNo: order.orderNo,
    customerName: order.customerName,
    productLevel: order.productLevel,
    orderAmount,
    commissionRate,
    commissionAmount: amount,
    performanceAmount,
    scene: existing?.scene || order.dealScene,
    resourceOwnership: existing?.resourceOwnership || order.resourceOwnership,
    proofStatus: existing?.proofStatus || order.proofStatus,
    calculationNote: input.calculationNote || existing?.calculationNote || '财务人工调整分账',
    auditReason: undefined,
    evidenceRequired: existing?.evidenceRequired,
    evidenceStatus: existing?.evidenceStatus || '无需凭证',
    payoutPlanId: input.payoutPlanId || existing?.payoutPlanId || matchedRule?.payoutPlanId,
    payoutPlanName,
    ruleCalculationType: calculationType,
    tierSnapshot,
    formulaText,
    role: input.role,
    owner: assignee.user.name,
    ownerId: assignee.user.id,
    department: assignee.department?.name || existing?.department || ROLE_DEPARTMENT_MAP[input.role] || '',
    departmentId: assignee.department?.id,
    paymentDate: input.paymentDate || existing?.paymentDate || order.payments?.[0]?.paidAt || order.createdAt,
    status: '待确认',
    commissionRuleId: input.commissionRuleId || existing?.commissionRuleId,
    sourceType,
    isManualAdjusted: true,
    adjustReason,
    adjustedBy: operator,
    adjustedAt: now,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

async function saveOrderCommissionAdjustments(
  orderId: string,
  rows: CommissionAdjustmentInput[],
  adjustReason: string,
): Promise<ApiResponse<Commission[]>> {
  ensureInit();
  await delay(160);
  const reason = adjustReason.trim();
  if (!reason) return createErrorResponse('调整分账必须填写原因');
  const order = getOrderById(orderId);
  if (!order) return createErrorResponse('订单不存在', 404);
  if (!rows.length) return createErrorResponse('至少保留一条分账记录');

  const resolvedRows = rows.map((row) => ({ row, resolved: resolveAdjustmentUser(row) }));
  const invalidRow = resolvedRows.find((item) => item.resolved.error || !item.resolved.user);
  if (invalidRow) return createErrorResponse(invalidRow.resolved.error || '\u5206\u6da6\u4eba\u5458\u4e0d\u53ef\u7528');

  const now = new Date().toISOString();
  const operator = getCurrentOperatorName('财务');
  const commissions = getStorageData<Commission[]>(STORAGE_KEYS.COMMISSIONS) || [];
  const existingById = new Map(
    commissions
      .filter((commission) => commission.orderId === orderId)
      .map((commission) => [commission.id, normalizeCommission(commission)]),
  );
  const submittedIds = new Set(rows.map((row) => row.id).filter(Boolean));
  const removedLockedRow = Array.from(existingById.values()).find((commission) => (
    !submittedIds.has(commission.id) && commission.status !== '待确认'
  ));
  if (removedLockedRow) return createErrorResponse('只能删除待确认阶段的分账记录，已进入发放链路的分账请使用撤回流程');

  const adjustedRows = resolvedRows.map(({ row, resolved }) => buildAdjustedCommission(
    order,
    row,
    { user: resolved.user!, department: resolved.department },
    row.id ? existingById.get(row.id) : undefined,
    reason,
    operator,
    now,
  ));
  const next = [
    ...adjustedRows,
    ...commissions.filter((commission) => commission.orderId !== orderId),
  ];
  saveCommissions(next);
  appendCommissionOperationLog(order, '调整分账', reason, adjustedRows, operator, now);
  return createSuccessResponse(getOrderCommissions(orderId));
}

async function deleteOrderCommissions(orderId: string, reason: string): Promise<ApiResponse<boolean>> {
  ensureInit();
  await delay(160);
  const normalizedReason = reason.trim();
  if (!normalizedReason) return createErrorResponse('删除订单分账必须填写原因');
  const order = getOrderById(orderId);
  if (!order) return createErrorResponse('订单不存在', 404);

  const commissions = getStorageData<Commission[]>(STORAGE_KEYS.COMMISSIONS) || [];
  const orderCommissions = commissions
    .filter((commission) => commission.orderId === orderId)
    .map((commission) => normalizeCommission(commission));
  if (!orderCommissions.length) return createErrorResponse('该订单没有可删除的分账记录');

  const lockedCommission = orderCommissions.find((commission) => commission.status !== '待确认');
  if (lockedCommission) return createErrorResponse('只能删除待确认阶段的订单分账，已进入发放链路的分账请使用撤回流程');

  const now = new Date().toISOString();
  const operator = getCurrentOperatorName('财务');
  saveCommissions(commissions.filter((commission) => commission.orderId !== orderId));
  appendCommissionOperationLog(order, '删除分账', normalizedReason, orderCommissions, operator, now);
  return createSuccessResponse(true);
}

function buildDeletedSourceOrderFromCommissions(orderId: string, commissions: Commission[]): Pick<Order, 'id' | 'orderNo' | 'customerName'> {
  const first = commissions[0];
  return {
    id: orderId,
    orderNo: first?.orderNo || orderId,
    customerName: first?.customerName || '源订单已删除',
  };
}

async function cleanupDeletedSourceOrderCommissions(orderId: string, reason: string): Promise<ApiResponse<boolean>> {
  ensureInit();
  await delay(160);
  const normalizedReason = reason.trim();
  if (!normalizedReason) return createErrorResponse('清理废弃分账必须填写原因');
  if (getOrderById(orderId)) return createErrorResponse('源订单仍存在，不能作为废弃分账清理');

  const commissions = getStorageData<Commission[]>(STORAGE_KEYS.COMMISSIONS) || [];
  const orderCommissions = commissions
    .filter((commission) => commission.orderId === orderId)
    .map((commission) => normalizeCommission(commission));
  if (!orderCommissions.length) return createErrorResponse('没有可清理的废弃分账记录');

  const locked = orderCommissions.find((commission) => (
    commission.status === '已发放'
    || commission.status === '待冲销'
    || commission.status === '已冲销'
  ));
  if (locked) return createErrorResponse('已发放的分账不能清理；第一版不支持系统内冲销，请财务线下处理。');

  const now = new Date().toISOString();
  const operator = getCurrentOperatorName('财务');
  const deletedOrder = buildDeletedSourceOrderFromCommissions(orderId, orderCommissions);
  saveCommissions(commissions.filter((commission) => commission.orderId !== orderId));
  appendCommissionOperationLog(deletedOrder, '清理废弃分账', normalizedReason, orderCommissions, operator, now);
  return createSuccessResponse(true);
}

async function confirmOrderCommissions(orderId: string, reason?: string): Promise<ApiResponse<Commission[]>> {
  ensureInit();
  await delay(160);
  const order = getOrderById(orderId);
  if (!order) return createErrorResponse('订单不存在', 404);
  const now = new Date().toISOString();
  const operator = getCurrentOperatorName('财务');
  const commissions = getStorageData<Commission[]>(STORAGE_KEYS.COMMISSIONS) || [];
  let changed = false;
  const confirmedCommissions: Commission[] = [];
  const next = commissions.map((commission) => {
    if (commission.orderId !== orderId || normalizeCommission(commission).status !== '待确认') return commission;
    changed = true;
    const confirmed = {
      ...commission,
      status: '待发放' as const,
      auditReason: undefined,
      calculationNote: [commission.calculationNote, reason ? `财务确认：${reason}` : `财务确认：${operator}`].filter(Boolean).join('；'),
      adjustedBy: commission.adjustedBy || operator,
      adjustedAt: commission.adjustedAt || now,
      updatedAt: now,
    };
    confirmedCommissions.push(normalizeCommission(confirmed));
    return confirmed;
  });
  if (!changed) return createErrorResponse('该订单没有待确认分账');
  saveCommissions(next);
  appendCommissionOperationLog(order, '确认分账', reason, confirmedCommissions, operator, now);
  return createSuccessResponse(getOrderCommissions(orderId));
}

async function withdrawOrderCommissions(orderId: string, reason: string): Promise<ApiResponse<Commission[]>> {
  ensureInit();
  await delay(160);
  const normalizedReason = reason.trim();
  if (!normalizedReason) return createErrorResponse('撤回提成必须填写原因');
  const order = getOrderById(orderId);
  if (!order) return createErrorResponse('订单不存在', 404);
  const now = new Date().toISOString();
  const operator = getCurrentOperatorName('财务');
  const commissions = getStorageData<Commission[]>(STORAGE_KEYS.COMMISSIONS) || [];
  const currentOrderCommissions = commissions
    .filter((commission) => commission.orderId === orderId)
    .map((commission) => normalizeCommission(commission));
  if (currentOrderCommissions.some((commission) => commission.status === '已发放')) {
    return createErrorResponse('提成已发放，第一版不支持系统内冲销，请财务线下处理。');
  }
  let changed = false;
  const withdrawnCommissions: Commission[] = [];
  const next = commissions.map((commission) => {
    if (commission.orderId !== orderId) return commission;
    const normalized = normalizeCommission(commission);
    if (!['待确认', '待发放'].includes(normalized.status)) return commission;
    changed = true;
    const updated: Commission = {
      ...commission,
      status: '已撤回',
      auditReason: normalizedReason,
      frozenReason: undefined,
      calculationNote: [commission.calculationNote, `撤回提成：${normalizedReason}。`].filter(Boolean).join(' '),
      updatedAt: now,
    };
    withdrawnCommissions.push(normalizeCommission(updated));
    return updated;
  });
  if (!changed) return createErrorResponse('该订单没有可撤回提成');
  saveCommissions(next);
  appendCommissionOperationLog(order, '撤回提成', normalizedReason, withdrawnCommissions, operator, now);
  return createSuccessResponse(getOrderCommissions(orderId));
}

async function startCommissionChargeback(orderId: string, reason: string): Promise<ApiResponse<Commission[]>> {
  ensureInit();
  await delay(160);
  void orderId;
  void reason;
  return createErrorResponse('第一版不支持系统内冲销，请财务线下处理。');
}

async function completeCommissionChargeback(
  orderId: string,
  input: CommissionChargebackCompleteInput,
): Promise<ApiResponse<Commission[]>> {
  ensureInit();
  await delay(180);
  void orderId;
  void input;
  return createErrorResponse('第一版不支持系统内冲销，请财务线下处理。');
}

async function fetchCommissionOperationLogs(orderId: string): Promise<ApiResponse<CommissionOperationLog[]>> {
  ensureInit();
  await delay(120);
  return createSuccessResponse(getCommissionOperationLogs(orderId));
}

async function fetchCommissionStats(): Promise<ApiResponse<CommissionStats>> {
  ensureInit();
  await delay(200);
  const normalizedCommissions = getAllCommissions();
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const monthCommissions = normalizedCommissions.filter((c) => (c.paymentDate || c.createdAt) >= monthStart);
  const byRole = normalizedCommissions.reduce((acc, c) => {
    acc[c.role] = (acc[c.role] || 0) + c.commissionAmount;
    return acc;
  }, {} as CommissionStats['byRole']);
  const monthTotal = monthCommissions.reduce((s, c) => s + c.commissionAmount, 0);

  const stats: CommissionStats = {
    monthPending: monthCommissions.filter((c) => c.status === '待发放' || c.status === '待确认').reduce((s, c) => s + c.commissionAmount, 0),
    monthPaid: monthCommissions.filter((c) => c.status === '已发放').reduce((s, c) => s + c.commissionAmount, 0),
    monthTotal,
    byRole,
    pendingReview: monthCommissions.filter((c) => c.status === '待确认').reduce((s, c) => s + c.commissionAmount, 0),
    revenueRatio: 0,
  };

  return createSuccessResponse(stats);
}

function buildAuditIssues(commissions: Commission[]): CommissionAuditIssue[] {
  return commissions
    .filter((commission) => {
      const note = `${commission.auditReason || ''}${commission.frozenReason || ''}${commission.calculationNote || ''}`;
      return commission.status === '待确认'
        || Boolean(commission.frozenReason)
        || note.includes('冲销')
        || note.includes('冻结')
        || note.includes('退款');
    })
    .map((commission) => {
      let issueType: CommissionAuditIssue['issueType'] = '需确认';
      if (commission.evidenceStatus?.startsWith('缺')) issueType = '缺凭证';
      if (commission.frozenReason) issueType = '退款冻结';
      if (commission.calculationNote?.includes('冲销')) issueType = '规则冲突';

      return {
        id: `issue-${commission.id}`,
        commissionId: commission.id,
        orderId: commission.orderId,
        orderNo: commission.orderNo,
        customerName: commission.customerName,
        owner: commission.owner,
        role: commission.role,
        amount: commission.commissionAmount,
        issueType,
        reason: commission.auditReason || commission.frozenReason || commission.calculationNote || '需要财务确认',
        status: commission.status,
        createdAt: commission.updatedAt || commission.createdAt,
      };
    });
}

async function fetchCommissionAuditIssues(filters?: CommissionFilters): Promise<ApiResponse<CommissionAuditIssue[]>> {
  ensureInit();
  await delay(150);
  return createSuccessResponse(buildAuditIssues(applyFilters(getAllCommissions(), filters)));
}

async function updateCommissionStatus(id: string, status: CommissionStatus): Promise<ApiResponse<Commission | null>> {
  ensureInit();
  await delay(200);
  const commissions = getStorageData<Commission[]>(STORAGE_KEYS.COMMISSIONS) || [];
  const idx = commissions.findIndex((c) => c.id === id);
  if (idx === -1) return createSuccessResponse(null);
  commissions[idx] = {
    ...commissions[idx],
    status,
    auditReason: status === '待发放' ? undefined : commissions[idx].auditReason,
    paidAt: status === '已发放' ? new Date().toISOString() : commissions[idx].paidAt,
    updatedAt: new Date().toISOString(),
  };
  saveCommissions(commissions);
  return createSuccessResponse(normalizeCommission(commissions[idx]));
}

async function batchApproveCommission(ids: string[]): Promise<ApiResponse<number>> {
  ensureInit();
  await delay(300);
  const commissions = getStorageData<Commission[]>(STORAGE_KEYS.COMMISSIONS) || [];
  let count = 0;
  for (const id of ids) {
    const idx = commissions.findIndex((c) => c.id === id);
    if (idx !== -1 && (commissions[idx].status as string) === '待确认') {
      commissions[idx] = {
        ...commissions[idx],
        status: '待发放',
        auditReason: undefined,
        updatedAt: new Date().toISOString(),
      };
      count++;
    }
  }
  saveCommissions(commissions);
  return createSuccessResponse(count);
}

async function batchPayCommission(ids: string[]): Promise<ApiResponse<number>> {
  ensureInit();
  await delay(300);
  const commissions = getStorageData<Commission[]>(STORAGE_KEYS.COMMISSIONS) || [];
  let count = 0;
  for (const id of ids) {
    const idx = commissions.findIndex((c) => c.id === id);
    if (idx !== -1 && commissions[idx].status === '待发放') {
      commissions[idx] = {
        ...commissions[idx],
        status: '已发放',
        paidAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      count++;
    }
  }
  saveCommissions(commissions);
  return createSuccessResponse(count);
}

function getStoredBatches(): CommissionSettlementBatch[] {
  return getStorageData<CommissionSettlementBatch[]>(STORAGE_KEYS.COMMISSION_SETTLEMENT_BATCHES) || [];
}

async function fetchSettlementBatches(): Promise<ApiResponse<CommissionSettlementBatch[]>> {
  ensureInit();
  await delay(150);
  return createSuccessResponse(getStoredBatches());
}

function sum(commissions: Commission[], status?: CommissionStatus): number {
  return commissions
    .filter((commission) => !status || commission.status === status)
    .reduce((total, commission) => total + commission.commissionAmount, 0);
}

function isPayableCommission(commission: Commission): boolean {
  return commission.status === '待发放' || commission.status === '已发放';
}

function buildSettlementBatch(period: string, commissions: Commission[]): CommissionSettlementBatch {
  const settleCommissions = commissions.filter(
    (commission) => commission.createdAt.startsWith(period) && isPayableCommission(commission),
  );
  const byOwnerMap = new Map<string, { owner: string; department: string; count: number; amount: number }>();
  const byRoleMap = new Map<string, { role: Commission['role']; count: number; amount: number }>();

  settleCommissions.forEach((commission) => {
    const ownerKey = `${commission.owner}-${commission.department}`;
    const ownerItem = byOwnerMap.get(ownerKey) || { owner: commission.owner, department: commission.department, count: 0, amount: 0 };
    ownerItem.count += 1;
    ownerItem.amount += commission.commissionAmount;
    byOwnerMap.set(ownerKey, ownerItem);

    const roleItem = byRoleMap.get(commission.role) || { role: commission.role, count: 0, amount: 0 };
    roleItem.count += 1;
    roleItem.amount += commission.commissionAmount;
    byRoleMap.set(commission.role, roleItem);
  });

  const pendingReviewAmount = sum(commissions.filter((commission) => commission.createdAt.startsWith(period)), '待确认');
  const pendingPayAmount = sum(settleCommissions, '待发放');
  const paidAmount = sum(settleCommissions, '已发放');
  const totalAmount = settleCommissions.reduce((total, commission) => total + commission.commissionAmount, 0);

  return {
    id: `batch-${uuidv4().slice(0, 8)}`,
    batchNo: `COM-${period.replace('-', '')}-${String(Date.now()).slice(-4)}`,
    period,
    totalCount: settleCommissions.length,
    totalAmount,
    pendingReviewAmount,
    pendingPayAmount,
    paidAmount,
    cancelledAmount: sum(commissions.filter((commission) => commission.createdAt.startsWith(period)), '已撤回'),
    status: pendingReviewAmount > 0 ? '待确认' : paidAmount >= totalAmount && totalAmount > 0 ? '已发放' : '待发放',
    generatedAt: new Date().toISOString(),
    commissionIds: settleCommissions.map((commission) => commission.id),
    byOwner: Array.from(byOwnerMap.values()).map((item) => ({ ...item, amount: Math.round(item.amount * 100) / 100 })),
    byRole: Array.from(byRoleMap.values()).map((item) => ({ ...item, amount: Math.round(item.amount * 100) / 100 })),
  };
}

function buildPaymentDateSettlementBatch(period: string, commissions: Commission[]): CommissionSettlementBatch {
  const periodCommissions = commissions.filter((commission) => (commission.paymentDate || commission.createdAt).startsWith(period));
  const settleCommissions = periodCommissions.filter(isPayableCommission);
  const byOwnerMap = new Map<string, { owner: string; department: string; count: number; amount: number }>();
  const byRoleMap = new Map<string, { role: Commission['role']; count: number; amount: number }>();

  settleCommissions.forEach((commission) => {
    const ownerKey = commission.ownerId || `${commission.owner}-${commission.department}`;
    const ownerItem = byOwnerMap.get(ownerKey) || { owner: commission.owner, department: commission.department, count: 0, amount: 0 };
    ownerItem.count += 1;
    ownerItem.amount += commission.commissionAmount;
    byOwnerMap.set(ownerKey, ownerItem);

    const roleItem = byRoleMap.get(commission.role) || { role: commission.role, count: 0, amount: 0 };
    roleItem.count += 1;
    roleItem.amount += commission.commissionAmount;
    byRoleMap.set(commission.role, roleItem);
  });

  const pendingReviewAmount = sum(periodCommissions, '待确认');
  const pendingPayAmount = sum(settleCommissions, '待发放');
  const paidAmount = sum(settleCommissions, '已发放');
  const totalAmount = settleCommissions.reduce((total, commission) => total + commission.commissionAmount, 0);

  return {
    id: `batch-${uuidv4().slice(0, 8)}`,
    batchNo: `COM-${period.replace('-', '')}-${String(Date.now()).slice(-4)}`,
    period,
    totalCount: settleCommissions.length,
    totalAmount,
    pendingReviewAmount,
    pendingPayAmount,
    paidAmount,
    cancelledAmount: sum(periodCommissions, '已撤回'),
    status: pendingReviewAmount > 0 ? '待确认' : paidAmount >= totalAmount && totalAmount > 0 ? '已发放' : '待发放',
    generatedAt: new Date().toISOString(),
    commissionIds: settleCommissions.map((commission) => commission.id),
    byOwner: Array.from(byOwnerMap.values()).map((item) => ({ ...item, amount: Math.round(item.amount * 100) / 100 })),
    byRole: Array.from(byRoleMap.values()).map((item) => ({ ...item, amount: Math.round(item.amount * 100) / 100 })),
  };
}

async function generateSettlementBatch(period: string): Promise<ApiResponse<CommissionSettlementBatch>> {
  ensureInit();
  await delay(250);
  const batch = buildPaymentDateSettlementBatch(period, refreshMonthlyTieredCommissions(period));
  const batches = getStoredBatches().filter((item) => item.period !== period);
  setStorageData(STORAGE_KEYS.COMMISSION_SETTLEMENT_BATCHES, [batch, ...batches]);

  const commissions = getStorageData<Commission[]>(STORAGE_KEYS.COMMISSIONS) || [];
  const nextCommissions = commissions.map((commission) => (
    batch.commissionIds.includes(commission.id)
      ? { ...commission, batchId: batch.id, updatedAt: new Date().toISOString() }
      : commission
  ));
  saveCommissions(nextCommissions);

  return createSuccessResponse(batch);
}

async function paySettlementBatch(batchId: string): Promise<ApiResponse<CommissionSettlementBatch | null>> {
  ensureInit();
  await delay(300);
  const batches = getStoredBatches();
  const batchIdx = batches.findIndex((item) => item.id === batchId);
  if (batchIdx === -1) return createSuccessResponse(null);

  const commissions = getStorageData<Commission[]>(STORAGE_KEYS.COMMISSIONS) || [];
  const now = new Date().toISOString();
  const nextCommissions = commissions.map((commission) => (
    batches[batchIdx].commissionIds.includes(commission.id) && commission.status === '待发放'
      ? { ...commission, status: '已发放' as const, paidAt: now, updatedAt: now }
      : commission
  ));
  saveCommissions(nextCommissions);

  const refreshed = buildPaymentDateSettlementBatch(
    batches[batchIdx].period,
    nextCommissions.map((commission) => normalizeCommission(commission)),
  );
  batches[batchIdx] = {
    ...refreshed,
    id: batches[batchIdx].id,
    batchNo: batches[batchIdx].batchNo,
    paidAt: now,
  };
  setStorageData(STORAGE_KEYS.COMMISSION_SETTLEMENT_BATCHES, batches);

  return createSuccessResponse(batches[batchIdx]);
}

function getMonthlyPayoutCommissions(period: string, sourceCommissions?: Commission[]): Commission[] {
  const commissions = sourceCommissions || applyMonthlyTieredCommissions(period, getAllCommissions());
  return commissions.filter((commission) => {
    const paymentDate = commission.paymentDate || commission.createdAt;
    return paymentDate.startsWith(period)
      && (
        commission.status === '待确认'
        || commission.status === '待发放'
        || commission.status === '已发放'
        || commission.status === '已撤回'
      );
  });
}

function buildMonthlyRoleSummary(role: string, rows: Commission[]): MonthlyCommissionRoleSummary {
  const isTiered = rows.some((commission) => commission.ruleCalculationType === 'tiered_percentage');
  const tierRows = rows.filter((commission) => commission.ruleCalculationType === 'tiered_percentage');
  const activeTierBase = roundMoney(rows
    .filter(countsTowardTieredMonthlyBase)
    .reduce((sumValue, commission) => sumValue + Number(commission.performanceAmount || commission.orderAmount || 0), 0));
  const tierSource = rows.find(countsTowardTieredMonthlyBase) || tierRows[0];
  const effectiveTierSnapshot = isTiered && tierSource
    ? buildTierSnapshot(resolveRuleTiers(tierSource), activeTierBase)
    : undefined;
  const getSummaryAmount = (commission: Commission) => {
    if (commission.ruleCalculationType !== 'tiered_percentage') return commission.commissionAmount;
    const rate = effectiveTierSnapshot?.currentTier?.rate ?? Number(commission.commissionRate || 0) * 100;
    if (!rate) return commission.commissionAmount;
    return roundMoney(Number(commission.performanceAmount || commission.orderAmount || 0) * (rate / 100));
  };
  const pendingConfirmAmount = rows
    .filter((commission) => commission.status === '待确认' && !isCommissionPendingHandling(commission))
    .reduce((sumValue, commission) => sumValue + getSummaryAmount(commission), 0);
  const pendingPayAmount = rows
    .filter((commission) => commission.status === '待发放')
    .reduce((sumValue, commission) => sumValue + getSummaryAmount(commission), 0);
  const paidAmount = rows
    .filter((commission) => commission.status === '已发放')
    .reduce((sumValue, commission) => sumValue + getSummaryAmount(commission), 0);
  const withdrawnAmount = rows
    .filter(isWithdrawnCommission)
    .reduce((sumValue, commission) => sumValue + getSummaryAmount(commission), 0);
  const status: MonthlyCommissionPayout['status'] = pendingConfirmAmount > 0
    ? '待确认'
    : pendingPayAmount > 0
      ? '待发放'
      : paidAmount > 0
        ? '已发放'
        : '无应发';

  return {
    role,
    orderCount: new Set(rows.map((commission) => commission.orderId)).size,
    monthlyPaidAmount: activeTierBase,
    pendingConfirmAmount: roundMoney(pendingConfirmAmount),
    pendingPayAmount: roundMoney(pendingPayAmount),
    paidAmount: roundMoney(paidAmount),
    exceptionAmount: 0,
    withdrawnAmount: roundMoney(withdrawnAmount),
    chargebackAmount: 0,
    totalAmount: roundMoney(pendingConfirmAmount + pendingPayAmount + paidAmount),
    status,
    isTiered,
    tierSnapshot: effectiveTierSnapshot,
    commissions: rows,
  };
}

function buildMonthlyPayouts(period: string): MonthlyCommissionPayout[] {
  const payoutRows = getMonthlyPayoutCommissions(period);
  const map = new Map<string, Commission[]>();
  payoutRows.forEach((commission) => {
    const key = commission.ownerId || `name:${commission.owner}`;
    map.set(key, [...(map.get(key) || []), commission]);
  });

  return Array.from(map.entries()).map(([key, rows]) => {
    const first = rows[0];
    const roleMap = new Map<string, Commission[]>();
    rows.forEach((commission) => {
      roleMap.set(commission.role, [...(roleMap.get(commission.role) || []), commission]);
    });
    const roleSummaries = Array.from(roleMap.entries())
      .map(([role, roleRows]) => buildMonthlyRoleSummary(role, roleRows))
      .sort((a, b) => b.totalAmount - a.totalAmount || a.role.localeCompare(b.role, 'zh-CN'));
    const pendingConfirmAmount = roleSummaries.reduce((sumValue, item) => sumValue + item.pendingConfirmAmount, 0);
    const pendingPayAmount = roleSummaries.reduce((sumValue, item) => sumValue + item.pendingPayAmount, 0);
    const paidAmount = roleSummaries.reduce((sumValue, item) => sumValue + item.paidAmount, 0);
    const withdrawnAmount = roleSummaries.reduce((sumValue, item) => sumValue + item.withdrawnAmount, 0);
    const orderCount = new Set(rows.map((commission) => commission.orderId)).size;
    const monthlyPaidAmount = roleSummaries.reduce((sumValue, item) => sumValue + item.monthlyPaidAmount, 0);
    const status: MonthlyCommissionPayout['status'] = pendingConfirmAmount > 0
      ? '待确认'
      : pendingPayAmount > 0
        ? '待发放'
        : paidAmount > 0
          ? '已发放'
          : '无应发';
    return {
      period,
      owner: first.owner,
      ownerId: first.ownerId || (key.startsWith('name:') ? undefined : key),
      department: first.department,
      departmentId: first.departmentId,
      orderCount,
      monthlyPaidAmount,
      pendingConfirmAmount: roundMoney(pendingConfirmAmount),
      pendingPayAmount: roundMoney(pendingPayAmount),
      paidAmount: roundMoney(paidAmount),
      exceptionAmount: 0,
      withdrawnAmount: roundMoney(withdrawnAmount),
      chargebackAmount: 0,
      totalAmount: roundMoney(pendingConfirmAmount + pendingPayAmount + paidAmount),
      status,
      commissions: rows,
      roleSummaries,
    };
  }).sort((a, b) => (
    b.totalAmount - a.totalAmount
    || a.owner.localeCompare(b.owner, 'zh-CN')
  ));
}

async function fetchMonthlyCommissionPayouts(period: string): Promise<ApiResponse<MonthlyCommissionPayout[]>> {
  ensureInit();
  await delay(160);
  if (!period) return createErrorResponse('请选择结算月份');
  refreshMonthlyTieredCommissions(period);
  return createSuccessResponse(buildMonthlyPayouts(period));
}

async function fetchMonthlyCommissionTierConfig(period: string): Promise<ApiResponse<MonthlyCommissionTierConfig>> {
  ensureInit();
  await delay(100);
  if (!period) return createErrorResponse('请选择结算月份');
  return createSuccessResponse(getMonthlyTierConfig(period));
}

async function saveMonthlyCommissionTierConfig(
  period: string,
  tiers: CommissionTier[],
): Promise<ApiResponse<MonthlyCommissionTierConfig>> {
  ensureInit();
  await delay(140);
  if (!period) return createErrorResponse('请选择结算月份');
  const validation = validateCommissionTiers(tiers);
  if (validation) return createErrorResponse(validation);
  const configs = readMonthlyTierConfigs();
  const nextConfig: MonthlyCommissionTierConfig = {
    period,
    tiers: normalizeCommissionTiers(tiers),
    updatedAt: new Date().toISOString(),
  };
  setStorageData(STORAGE_KEYS.MONTHLY_COMMISSION_TIER_CONFIGS, {
    ...configs,
    [period]: nextConfig,
  });
  refreshMonthlyTieredCommissions(period);
  return createSuccessResponse(nextConfig);
}

async function payMonthlyOwnerCommissions(period: string, ownerId: string): Promise<ApiResponse<MonthlyCommissionPayout[]>> {
  ensureInit();
  await delay(180);
  if (!period) return createErrorResponse('请选择结算月份');
  if (!ownerId) return createErrorResponse('请选择发放人员');
  const now = new Date().toISOString();
  const commissions = refreshMonthlyTieredCommissions(period);
  let changed = false;
  const next = commissions.map((commission) => {
    const normalized = normalizeCommission(commission);
    if ((normalized.paymentDate || normalized.createdAt).startsWith(period)
      && normalized.ownerId === ownerId
      && normalized.status === '待发放') {
      changed = true;
      return { ...commission, status: '已发放' as const, paidAt: now, updatedAt: now };
    }
    return commission;
  });
  if (!changed) return createErrorResponse('该人员没有待发放提成');
  saveCommissions(next);
  return createSuccessResponse(buildMonthlyPayouts(period));
}

async function payMonthlyCommissionBatch(period: string): Promise<ApiResponse<MonthlyCommissionPayout[]>> {
  ensureInit();
  await delay(220);
  if (!period) return createErrorResponse('请选择结算月份');
  await generateSettlementBatch(period);
  const now = new Date().toISOString();
  const commissions = refreshMonthlyTieredCommissions(period);
  let changed = false;
  const next = commissions.map((commission) => {
    const normalized = normalizeCommission(commission);
    if ((normalized.paymentDate || normalized.createdAt).startsWith(period) && normalized.status === '待发放') {
      changed = true;
      return { ...commission, status: '已发放' as const, paidAt: now, updatedAt: now };
    }
    return commission;
  });
  if (changed) saveCommissions(next);
  return createSuccessResponse(buildMonthlyPayouts(period));
}

async function fetchCommissionDetail(id: string): Promise<ApiResponse<{ commission: Commission; order?: Order } | null>> {
  ensureInit();
  await delay(120);
  const commission = getAllCommissions().find((item) => item.id === id);
  if (!commission) return createSuccessResponse(null);
  const order = (getStorageData<Order[]>(STORAGE_KEYS.ORDERS) || []).find((item) => item.id === commission.orderId);
  return createSuccessResponse({ commission, order });
}

export const commissionApi = {
  fetchCommissions,
  fetchCommissionsByOrder,
  fetchCommissionOrderSummaries,
  fetchCommissionOrderSummaryStatusCounts,
  fetchCreatableCommissionOrders,
  fetchMonthlyCommissionPayouts,
  fetchMonthlyCommissionTierConfig,
  saveMonthlyCommissionTierConfig,
  fetchCommissionStats,
  fetchCommissionAuditIssues,
  fetchCommissionOperationLogs,
  fetchSettlementBatches,
  generateSettlementBatch,
  paySettlementBatch,
  payMonthlyOwnerCommissions,
  payMonthlyCommissionBatch,
  fetchCommissionDetail,
  saveOrderCommissionAdjustments,
  deleteOrderCommissions,
  cleanupDeletedSourceOrderCommissions,
  confirmOrderCommissions,
  withdrawOrderCommissions,
  startCommissionChargeback,
  completeCommissionChargeback,
  updateCommissionStatus,
  batchApproveCommission,
  batchPayCommission,
};
