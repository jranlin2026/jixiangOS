import type {
  RecoveryLog,
  RecoveryPriority,
  RecoveryRole,
  Refund,
  RefundFilters,
  RefundStats,
} from '../types/refund';
import type { Order } from '../types/order';
import type { Product } from '../types/product';
import type { Commission, CommissionOperationLog } from '../types/commission';
import type { FinanceExpense, FinanceDailyRecord, ChannelROI, FinanceIncome } from '../types/finance';
import type { ApiResponse, PaginatedResponse } from './types';
import { createErrorResponse, createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { STORAGE_KEYS, DEFAULT_PAGE_SIZE } from '../shared/utils/constants';
import { initializeMockData } from './mock';
import { syncLifecycleByOrder, syncOpportunityRefundedByOrderId } from './lifecycleSync';
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_RECOVERY_RATE = 0.03;
const DEFAULT_MAX_ATTEMPTS = 3;

interface FinanceStorage {
  dailyRecords: FinanceDailyRecord[];
  channelROI: ChannelROI[];
  incomes: FinanceIncome[];
  expenses: FinanceExpense[];
}

function ensureInit(): void {
  initializeMockData();
}

function nowIso(): string {
  return new Date().toISOString();
}

function addMinutes(date: Date, minutes: number): string {
  return new Date(date.getTime() + minutes * 60000).toISOString();
}

function getFinanceStorage(): FinanceStorage {
  const data = getStorageData<FinanceStorage>(STORAGE_KEYS.FINANCE);
  return {
    dailyRecords: data?.dailyRecords || [],
    channelROI: data?.channelROI || [],
    incomes: data?.incomes || [],
    expenses: data?.expenses || [],
  };
}

function getPriority(amount: number): RecoveryPriority {
  if (amount >= 10000) return '高';
  if (amount >= 3000) return '中';
  return '低';
}

function pickDefaultAssignee(data: Partial<Refund>, order?: Order): { id: string; name: string; role: RecoveryRole } {
  if (order?.salesId || order?.salesName || order?.owner) {
    return { id: order.salesId || data.applicantId || 'user-001', name: order.salesName || order.owner || data.applicantName || '待分配', role: '销售' };
  }
  if (order?.successId || order?.successName) {
    return { id: order.successId || data.applicantId || 'user-002', name: order.successName || '客户成功', role: '客户成功' };
  }
  if (order?.serviceId || order?.serviceName) {
    return { id: order.serviceId || data.applicantId || 'user-003', name: order.serviceName || '售后', role: '售后' };
  }
  return { id: data.applicantId || 'user-001', name: data.applicantName || '待分配', role: '销售' };
}

function getProductName(productId?: string, productLevel?: string, fallback?: string): string | undefined {
  const products = getStorageData<Product[]>(STORAGE_KEYS.PRODUCTS) || [];
  const matched = (productId ? products.find((product) => product.id === productId) : undefined)
    || (productLevel ? products.find((product) => product.level === productLevel) : undefined);
  return matched?.name || fallback || productLevel;
}

function normalizeRefund(refund: Refund): Refund {
  const createdAt = refund.createdAt || nowIso();
  const order = (getStorageData<Order[]>(STORAGE_KEYS.ORDERS) || [])
    .find((item) => item.id === refund.orderId || item.orderNo === refund.orderNo);
  const assigned = pickDefaultAssignee(refund);
  const status = refund.status === '退款申请中' ? '待分配' : refund.status;
  const recoveryTask = refund.recoveryTask || {
    id: `rt-${uuidv4().slice(0, 8)}`,
    refundId: refund.id,
    orderId: refund.orderId,
    orderNo: refund.orderNo,
    customerId: refund.customerId,
    customerName: refund.customerName,
    assignedToUserId: assigned.id,
    assignedToName: assigned.name,
    assignedToRole: assigned.role,
    status: status === '挽回成功' ? '成功' as const : status === '待财务退款' || status === '退款已完成' ? '失败' as const : status === '挽回中' ? '进行中' as const : '待处理' as const,
    priority: getPriority(refund.refundAmount),
    attemptCount: refund.recoveryLogs?.length || 0,
    maxAttempts: DEFAULT_MAX_ATTEMPTS,
    lockUntil: addMinutes(new Date(createdAt), 30),
    createdAt,
    updatedAt: refund.updatedAt || createdAt,
  };

  return {
    ...refund,
    productName: getProductName(order?.productId, order?.productLevel || refund.productLevel, refund.productName || order?.productName),
    status,
    recoveryRate: refund.recoveryRate ?? DEFAULT_RECOVERY_RATE,
    frozenCommissionAmount: refund.frozenCommissionAmount ?? 0,
    estimatedLossAmount: refund.estimatedLossAmount ?? refund.refundAmount,
    recoveryLogs: refund.recoveryLogs || [],
    recoveryTask,
    riskTags: refund.riskTags || [],
    operationLogs: refund.operationLogs || [`${createdAt} 创建退款申请`],
  };
}

function saveRefunds(refunds: Refund[]): void {
  setStorageData(STORAGE_KEYS.REFUNDS, refunds);
}

function appendRefundCommissionOperationLog(refund: Refund, action: CommissionOperationLog['action'], reason: string, commissions: Commission[]): void {
  if (!commissions.length) return;
  const logs = getStorageData<CommissionOperationLog[]>(STORAGE_KEYS.COMMISSION_OPERATION_LOGS) || [];
  const totalCommissionAmount = Math.round(
    commissions.reduce((sum, commission) => sum + Number(commission.commissionAmount || 0), 0) * 100,
  ) / 100;
  const operatedAt = nowIso();
  setStorageData(STORAGE_KEYS.COMMISSION_OPERATION_LOGS, [{
    id: `comm-log-${uuidv4().slice(0, 8)}`,
    orderId: refund.orderId,
    orderNo: refund.orderNo,
    customerName: refund.customerName,
    action,
    operator: refund.approverName || '财务',
    operatedAt,
    reason,
    summary: `${action}，${commissions.length} 条分账，合计 ${totalCommissionAmount} 元，原因：${reason}`,
    commissionCount: commissions.length,
    totalCommissionAmount,
  }, ...logs]);
}

function freezeCommissions(refund: Refund): number {
  const commissions = getStorageData<Commission[]>(STORAGE_KEYS.COMMISSIONS) || [];
  let frozenAmount = 0;
  const updated = commissions.map((commission) => {
    if (commission.orderId !== refund.orderId && commission.orderNo !== refund.orderNo) return commission;
    if (commission.status === '已发放' || commission.isRecoveryBonus) return commission;
    frozenAmount += commission.commissionAmount;
    return {
      ...commission,
      status: '待确认' as const,
      calculationNote: `${commission.calculationNote || ''} 退款申请 ${refund.refundNo} 已冻结，待挽回/退款结果确认。`.trim(),
      sourceRefundId: refund.id,
      updatedAt: nowIso(),
    };
  });
  setStorageData(STORAGE_KEYS.COMMISSIONS, updated);
  return Math.round(frozenAmount * 100) / 100;
}

function releaseCommissions(refund: Refund): void {
  const commissions = getStorageData<Commission[]>(STORAGE_KEYS.COMMISSIONS) || [];
  setStorageData(STORAGE_KEYS.COMMISSIONS, commissions.map((commission) => {
    if (commission.sourceRefundId !== refund.id || commission.isRecoveryBonus || commission.status === '已发放') return commission;
    return {
      ...commission,
      status: '待发放' as const,
      calculationNote: `${commission.calculationNote || ''} 挽回成功，原提成解冻。`.trim(),
      updatedAt: nowIso(),
    };
  }));
}

function cancelCommissions(refund: Refund): void {
  const commissions = getStorageData<Commission[]>(STORAGE_KEYS.COMMISSIONS) || [];
  const withdrawnCommissions: Commission[] = [];
  setStorageData(STORAGE_KEYS.COMMISSIONS, commissions.map((commission) => {
    if ((commission.orderId !== refund.orderId && commission.orderNo !== refund.orderNo) || commission.isRecoveryBonus) return commission;
    if (commission.status === '已发放') return commission;
    const nextCommission = {
      ...commission,
      status: '已撤回' as const,
      auditReason: `订单退款：${refund.refundNo}`,
      calculationNote: `${commission.calculationNote || ''} 退款完成，未发放提成已撤回。`.trim(),
      sourceRefundId: refund.id,
      updatedAt: nowIso(),
    };
    withdrawnCommissions.push(nextCommission);
    return nextCommission;
  }));
  appendRefundCommissionOperationLog(refund, '撤回提成', `订单退款：${refund.refundNo}`, withdrawnCommissions);
}

function markPaidRefundChargebacks(refund: Refund): void {
  const commissions = getStorageData<Commission[]>(STORAGE_KEYS.COMMISSIONS) || [];
  const paidStatus = '已发放';
  const reason = `已发放后退款：${refund.refundNo}，需财务人工冲销/追回`;
  const chargebackCommissions: Commission[] = [];

  const nextCommissions = commissions.map((commission) => {
    if ((commission.orderId !== refund.orderId && commission.orderNo !== refund.orderNo) || commission.isRecoveryBonus) return commission;
    if (commission.status !== paidStatus) return commission;
    const nextCommission = {
      ...commission,
      status: '待冲销' as const,
      auditReason: reason,
      frozenReason: reason,
      calculationNote: `${commission.calculationNote || ''} ${reason}`.trim(),
      sourceRefundId: refund.id,
      updatedAt: nowIso(),
    };
    chargebackCommissions.push(nextCommission);
    return nextCommission;
  });

  setStorageData(STORAGE_KEYS.COMMISSIONS, nextCommissions);
  appendRefundCommissionOperationLog(refund, '退款待冲销', reason, chargebackCommissions);
}

function markPaidRefundExceptions(refund: Refund): void {
  markPaidRefundChargebacks(refund);
}

function createRecoveryCommission(refund: Refund, operatorId: string, operatorName: string): number {
  const commissions = getStorageData<Commission[]>(STORAGE_KEYS.COMMISSIONS) || [];
  const exists = commissions.some((commission) => commission.sourceRefundId === refund.id && commission.isRecoveryBonus);
  if (exists) return refund.recoveryCommissionAmount || 0;

  const rate = refund.recoveryRate ?? DEFAULT_RECOVERY_RATE;
  const baseAmount = refund.retainedAmount || refund.refundAmount;
  const amount = Math.round(baseAmount * rate * 100) / 100;
  const role = refund.recoveryTask?.assignedToRole || '销售';
  const department = role === '客户成功' ? '客户成功部' : role === '售后' ? '售后服务部' : '销售部';
  commissions.unshift({
    id: `comm-${uuidv4().slice(0, 8)}`,
    orderId: refund.orderId,
    orderNo: refund.orderNo,
    customerName: refund.customerName,
    productLevel: refund.productLevel,
    orderAmount: baseAmount,
    commissionRate: rate,
    commissionAmount: amount,
    performanceAmount: baseAmount,
    scene: '退款挽回',
    proofStatus: '已上传',
    calculationNote: `挽回提成 = 保留金额 ${baseAmount} × ${Math.round(rate * 100)}%，来源退款单 ${refund.refundNo}。`,
    role: role === '客户成功' ? '客户成功' : role === '售后' ? '售后' : '销售',
    owner: operatorName,
    department,
    status: '待确认',
    commissionType: 'recovery',
    sourceRefundId: refund.id,
    isRecoveryBonus: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
  setStorageData(STORAGE_KEYS.COMMISSIONS, commissions);
  return amount;
}

function updateOrderAfterRefund(refund: Refund): void {
  const orders = getStorageData<Order[]>(STORAGE_KEYS.ORDERS) || [];
  const idx = orders.findIndex((order) => order.id === refund.orderId || order.orderNo === refund.orderNo);
  if (idx === -1) return;
  const order = orders[idx];
  const isFullRefund = refund.refundAmount >= order.actualAmount;
  orders[idx] = {
    ...order,
    refundStatus: '退款已完成',
    refundAmount: refund.refundAmount,
    refundReason: refund.refundReason,
    status: isFullRefund ? '已退款' : order.status,
    actualAmount: isFullRefund ? 0 : Math.max(0, order.actualAmount - refund.refundAmount),
    performanceBaseAmount: isFullRefund ? 0 : Math.max(0, (order.performanceBaseAmount || order.actualAmount) - refund.refundAmount),
    updatedAt: nowIso(),
  };
  setStorageData(STORAGE_KEYS.ORDERS, orders);
  syncLifecycleByOrder(orders[idx], 'refunded');
  syncOpportunityRefundedByOrderId(orders[idx].id);
}

function writeFinanceExpense(refund: Refund, refundMethod: string, paidAt: string): void {
  const storage = getFinanceStorage();
  const exists = storage.expenses.some((expense) => expense.description.includes(refund.refundNo));
  if (!exists) {
    storage.expenses.unshift({
      id: `fe-${uuidv4().slice(0, 8)}`,
      category: '客户退款',
      amount: refund.refundAmount,
      description: `${refund.refundNo} ${refund.customerName} ${refundMethod} 退款`,
      approvedBy: refund.approverName,
      paidAt,
    });
  }
  const day = paidAt.slice(0, 10);
  const daily = storage.dailyRecords.find((record) => record.date === day);
  if (daily) {
    daily.refundAmount += refund.refundAmount;
    daily.profit = daily.revenue - daily.cost - daily.refundAmount;
  }
  setStorageData(STORAGE_KEYS.FINANCE, storage);
}

async function getRefunds(filters?: RefundFilters): Promise<ApiResponse<PaginatedResponse<Refund>>> {
  ensureInit();
  await delay(200);
  const all = (getStorageData<Refund[]>(STORAGE_KEYS.REFUNDS) || []).map(normalizeRefund);
  let filtered = [...all];

  if (filters?.search) {
    const q = filters.search.toLowerCase();
    filtered = filtered.filter(
      (r) => r.refundNo.toLowerCase().includes(q) || r.customerName.toLowerCase().includes(q) || r.orderNo.toLowerCase().includes(q),
    );
  }
  if (filters?.status) filtered = filtered.filter((r) => r.status === filters.status);
  if (filters?.refundCategory) filtered = filtered.filter((r) => r.refundCategory === filters.refundCategory);
  if (filters?.productLevel) filtered = filtered.filter((r) => r.productLevel === filters.productLevel);
  if (filters?.owner) filtered = filtered.filter((r) => r.recoveryTask?.assignedToName === filters.owner || r.applicantName === filters.owner);
  if (filters?.minAmount !== undefined) filtered = filtered.filter((r) => r.refundAmount >= Number(filters.minAmount));
  if (filters?.maxAmount !== undefined) filtered = filtered.filter((r) => r.refundAmount <= Number(filters.maxAmount));
  if (filters?.hasRecoveryLog !== undefined) filtered = filtered.filter((r) => Boolean(r.recoveryLogs?.length) === filters.hasRecoveryLog);
  if (filters?.isTimeout) filtered = filtered.filter((r) => Boolean(r.recoveryTask?.nextFollowUpAt && r.recoveryTask.nextFollowUpAt < nowIso() && r.status === '挽回中'));
  if (filters?.startDate) filtered = filtered.filter((r) => r.createdAt >= filters.startDate!);
  if (filters?.endDate) filtered = filtered.filter((r) => r.createdAt <= filters.endDate!);

  filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const page = filters?.page || 1;
  const pageSize = filters?.pageSize || DEFAULT_PAGE_SIZE;
  const total = filtered.length;
  const totalPages = Math.ceil(total / pageSize);
  const items = filtered.slice((page - 1) * pageSize, page * pageSize);

  return createSuccessResponse({ items, pagination: { page, pageSize, total, totalPages } });
}

async function getRefundStats(): Promise<ApiResponse<RefundStats>> {
  ensureInit();
  await delay(120);
  const refunds = (getStorageData<Refund[]>(STORAGE_KEYS.REFUNDS) || []).map(normalizeRefund);
  return createSuccessResponse({
    toAssign: refunds.filter((item) => item.status === '待分配').length,
    recovering: refunds.filter((item) => item.status === '挽回中').length,
    waitingFinance: refunds.filter((item) => item.status === '待财务退款' || item.status === '退款已批准').length,
    recoverySuccess: refunds.filter((item) => item.status === '挽回成功').length,
    completed: refunds.filter((item) => item.status === '退款已完成').length,
    frozenCommissionAmount: refunds.reduce((sum, item) => sum + (item.frozenCommissionAmount || 0), 0),
    estimatedLossAmount: refunds.filter((item) => item.status !== '挽回成功' && item.status !== '退款已完成').reduce((sum, item) => sum + item.refundAmount, 0),
  });
}

async function getRefundById(id: string): Promise<ApiResponse<Refund | null>> {
  ensureInit();
  await delay(150);
  const refunds = (getStorageData<Refund[]>(STORAGE_KEYS.REFUNDS) || []).map(normalizeRefund);
  return createSuccessResponse(refunds.find((r) => r.id === id) || null);
}

async function createRefund(data: Omit<Refund, 'id' | 'refundNo' | 'createdAt' | 'updatedAt'>): Promise<ApiResponse<Refund>> {
  ensureInit();
  await delay(200);
  const refunds = (getStorageData<Refund[]>(STORAGE_KEYS.REFUNDS) || []).map(normalizeRefund);
  const hasActive = refunds.some((refund) => refund.orderId === data.orderId && !['退款已完成', '退款已拒绝', '挽回成功'].includes(refund.status));
  if (hasActive) return createErrorResponse('该订单已有未完结退款申请，不能重复创建');
  if (data.refundAmount <= 0 || data.refundAmount > data.orderAmount) return createErrorResponse('退款金额必须大于0且不能超过订单金额');

  const orders = getStorageData<Order[]>(STORAGE_KEYS.ORDERS) || [];
  const order = orders.find((item) => item.id === data.orderId || item.orderNo === data.orderNo);
  const now = nowIso();
  const refundNo = `REF-${now.slice(0, 7).replace('-', '')}-${String(refunds.length + 1).padStart(4, '0')}`;
  const assigned = pickDefaultAssignee(data, order);
  const riskTags = [
    order?.officialPaymentChannel === '非官方渠道' ? '非官方渠道' : '',
    order?.isExternalTalentOrder ? '外部达人订单' : '',
    data.refundAmount >= 10000 ? '高金额' : '',
  ].filter(Boolean);

  const newRefund = normalizeRefund({
    ...data,
    id: `refund-${uuidv4().slice(0, 8)}`,
    refundNo,
    status: riskTags.length ? '待分配' : '待分配',
    recoveryRate: DEFAULT_RECOVERY_RATE,
    riskTags,
    operationLogs: [`${now} 创建退款申请`, `${now} 自动生成挽回任务，默认分配给${assigned.name}`],
    recoveryTask: {
      id: `rt-${uuidv4().slice(0, 8)}`,
      refundId: `refund-temp`,
      orderId: data.orderId,
      orderNo: data.orderNo,
      customerId: data.customerId,
      customerName: data.customerName,
      assignedToUserId: assigned.id,
      assignedToName: assigned.name,
      assignedToRole: assigned.role,
      status: '待处理',
      priority: getPriority(data.refundAmount),
      attemptCount: 0,
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      lockUntil: addMinutes(new Date(now), 30),
      createdAt: now,
      updatedAt: now,
    },
    recoveryLogs: [],
    frozenCommissionAmount: 0,
    estimatedLossAmount: data.refundAmount,
    createdAt: now,
    updatedAt: now,
  });
  newRefund.recoveryTask!.refundId = newRefund.id;
  newRefund.frozenCommissionAmount = freezeCommissions(newRefund);

  refunds.unshift(newRefund);
  saveRefunds(refunds);
  return createSuccessResponse(newRefund);
}

async function assignRecoveryTask(id: string, assignee: { userId: string; userName: string; role: RecoveryRole; reason?: string }): Promise<ApiResponse<Refund | null>> {
  ensureInit();
  await delay(200);
  const refunds = (getStorageData<Refund[]>(STORAGE_KEYS.REFUNDS) || []).map(normalizeRefund);
  const idx = refunds.findIndex((r) => r.id === id);
  if (idx === -1) return createSuccessResponse(null);
  const now = nowIso();
  refunds[idx] = {
    ...refunds[idx],
    status: '挽回中',
    recoveryTask: {
      ...refunds[idx].recoveryTask!,
      assignedToUserId: assignee.userId,
      assignedToName: assignee.userName,
      assignedToRole: assignee.role,
      status: '进行中',
      assignReason: assignee.reason,
      lockUntil: addMinutes(new Date(now), 30),
      updatedAt: now,
    },
    operationLogs: [...(refunds[idx].operationLogs || []), `${now} 分配挽回任务给${assignee.userName}${assignee.reason ? `，原因：${assignee.reason}` : ''}`],
    updatedAt: now,
  };
  saveRefunds(refunds);
  return createSuccessResponse(refunds[idx]);
}

async function addRecoveryLog(id: string, data: Omit<RecoveryLog, 'id' | 'refundId' | 'createdAt'>): Promise<ApiResponse<Refund | null>> {
  ensureInit();
  await delay(200);
  const refunds = (getStorageData<Refund[]>(STORAGE_KEYS.REFUNDS) || []).map(normalizeRefund);
  const idx = refunds.findIndex((r) => r.id === id);
  if (idx === -1) return createSuccessResponse(null);
  const now = nowIso();
  const refund = refunds[idx];
  const logs = refund.recoveryLogs || [];
  const nextAttempt = (refund.recoveryTask?.attemptCount || 0) + 1;
  const log: RecoveryLog = { ...data, id: `rl-${uuidv4().slice(0, 8)}`, refundId: id, createdAt: now };
  const exceeded = nextAttempt >= (refund.recoveryTask?.maxAttempts || DEFAULT_MAX_ATTEMPTS) && data.result === '挽回失败';

  refunds[idx] = {
    ...refund,
    status: data.result === '跟进中' ? '挽回中' : exceeded ? '待财务退款' : refund.status,
    recoveryLogs: [log, ...logs],
    recoveryTask: {
      ...refund.recoveryTask!,
      status: exceeded ? '失败' : '进行中',
      attemptCount: nextAttempt,
      nextFollowUpAt: data.nextFollowUpAt,
      resultNote: data.content,
      updatedAt: now,
    },
    operationLogs: [...(refund.operationLogs || []), `${now} ${data.operatorName}记录挽回：${data.actionType}，结果：${data.result}`],
    updatedAt: now,
  };
  saveRefunds(refunds);
  return createSuccessResponse(refunds[idx]);
}

async function markRecoverySuccess(id: string, data: { operatorId: string; operatorName: string; successMethod: string; retainedAmount: number; note: string }): Promise<ApiResponse<Refund | null>> {
  ensureInit();
  await delay(200);
  const refunds = (getStorageData<Refund[]>(STORAGE_KEYS.REFUNDS) || []).map(normalizeRefund);
  const idx = refunds.findIndex((r) => r.id === id);
  if (idx === -1) return createSuccessResponse(null);
  const refund = refunds[idx];
  if (refund.status === '退款已完成') return createErrorResponse('已完成退款不能再标记挽回成功');
  const now = nowIso();
  const retainedAmount = Number(data.retainedAmount) || refund.orderAmount;
  const commissionAmount = createRecoveryCommission({ ...refund, retainedAmount }, data.operatorId, data.operatorName);
  releaseCommissions(refund);

  refunds[idx] = {
    ...refund,
    status: '挽回成功',
    retainedAmount,
    recoveryCommissionAmount: commissionAmount,
    estimatedLossAmount: 0,
    recoveryTask: {
      ...refund.recoveryTask!,
      status: '成功',
      successOperatorId: data.operatorId,
      successOperatorName: data.operatorName,
      successMethod: data.successMethod,
      retainedAmount,
      successTime: now,
      resultNote: data.note,
      updatedAt: now,
    },
    recoveryLogs: [{
      id: `rl-${uuidv4().slice(0, 8)}`,
      refundId: id,
      operatorId: data.operatorId,
      operatorName: data.operatorName,
      operatorRole: refund.recoveryTask?.assignedToRole || '销售',
      actionType: data.successMethod,
      content: data.note,
      result: '挽回成功',
      createdAt: now,
    }, ...(refund.recoveryLogs || [])],
    operationLogs: [...(refund.operationLogs || []), `${now} 挽回成功，生成挽回提成 ${commissionAmount}`],
    updatedAt: now,
  };
  saveRefunds(refunds);
  return createSuccessResponse(refunds[idx]);
}

async function markRecoveryFailed(id: string, data: { operatorId: string; operatorName: string; failedReason: string; note: string }): Promise<ApiResponse<Refund | null>> {
  ensureInit();
  await delay(200);
  const refunds = (getStorageData<Refund[]>(STORAGE_KEYS.REFUNDS) || []).map(normalizeRefund);
  const idx = refunds.findIndex((r) => r.id === id);
  if (idx === -1) return createSuccessResponse(null);
  const now = nowIso();
  const refund = refunds[idx];
  refunds[idx] = {
    ...refund,
    status: '待财务退款',
    recoveryTask: {
      ...refund.recoveryTask!,
      status: '失败',
      failedReason: data.failedReason,
      resultNote: data.note,
      updatedAt: now,
    },
    recoveryLogs: [{
      id: `rl-${uuidv4().slice(0, 8)}`,
      refundId: id,
      operatorId: data.operatorId,
      operatorName: data.operatorName,
      operatorRole: refund.recoveryTask?.assignedToRole || '销售',
      actionType: '标记失败',
      content: data.note || data.failedReason,
      result: '挽回失败',
      createdAt: now,
    }, ...(refund.recoveryLogs || [])],
    operationLogs: [...(refund.operationLogs || []), `${now} 挽回失败，进入财务退款审批`],
    updatedAt: now,
  };
  saveRefunds(refunds);
  return createSuccessResponse(refunds[idx]);
}

async function approveRefund(id: string, approverId: string, approverName: string): Promise<ApiResponse<Refund | null>> {
  ensureInit();
  await delay(200);
  const refunds = (getStorageData<Refund[]>(STORAGE_KEYS.REFUNDS) || []).map(normalizeRefund);
  const idx = refunds.findIndex((r) => r.id === id);
  if (idx === -1) return createSuccessResponse(null);
  const now = nowIso();
  refunds[idx] = {
    ...refunds[idx],
    status: '退款已批准',
    approverId,
    approverName,
    approvedAt: now,
    operationLogs: [...(refunds[idx].operationLogs || []), `${now} ${approverName}批准退款`],
    updatedAt: now,
  };
  saveRefunds(refunds);
  return createSuccessResponse(refunds[idx]);
}

async function rejectRefund(id: string, approverId: string, approverName: string, rejectReason: string): Promise<ApiResponse<Refund | null>> {
  ensureInit();
  await delay(200);
  const refunds = (getStorageData<Refund[]>(STORAGE_KEYS.REFUNDS) || []).map(normalizeRefund);
  const idx = refunds.findIndex((r) => r.id === id);
  if (idx === -1) return createSuccessResponse(null);
  const now = nowIso();
  releaseCommissions(refunds[idx]);
  refunds[idx] = {
    ...refunds[idx],
    status: '退款已拒绝',
    approverId,
    approverName,
    approvedAt: now,
    rejectReason,
    operationLogs: [...(refunds[idx].operationLogs || []), `${now} ${approverName}驳回退款：${rejectReason}`],
    updatedAt: now,
  };
  saveRefunds(refunds);
  return createSuccessResponse(refunds[idx]);
}

async function completeRefund(id: string, refundMethod: string, refundVoucher?: string, refundSerialNo?: string, refundedAt?: string): Promise<ApiResponse<Refund | null>> {
  ensureInit();
  await delay(200);
  const refunds = (getStorageData<Refund[]>(STORAGE_KEYS.REFUNDS) || []).map(normalizeRefund);
  const idx = refunds.findIndex((r) => r.id === id);
  if (idx === -1) return createSuccessResponse(null);
  const now = nowIso();
  const paidAt = refundedAt ? new Date(refundedAt).toISOString() : now;
  const refund = {
    ...refunds[idx],
    status: '退款已完成' as const,
    refundMethod,
    refundVoucher,
    refundSerialNo,
    refundedAt: paidAt,
    completedAt: paidAt,
    operationLogs: [...(refunds[idx].operationLogs || []), `${now} 财务确认退款，方式：${refundMethod}${refundSerialNo ? `，流水号：${refundSerialNo}` : ''}`],
    updatedAt: now,
  };
  cancelCommissions(refund);
  markPaidRefundExceptions(refund);
  updateOrderAfterRefund(refund);
  writeFinanceExpense(refund, refundMethod, paidAt);
  refunds[idx] = refund;
  saveRefunds(refunds);
  return createSuccessResponse(refund);
}

export const refundApi = {
  getRefunds,
  getRefundStats,
  getRefundById,
  createRefund,
  assignRecoveryTask,
  addRecoveryLog,
  markRecoverySuccess,
  markRecoveryFailed,
  approveRefund,
  rejectRefund,
  completeRefund,
};
