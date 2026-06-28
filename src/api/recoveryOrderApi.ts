import { v4 as uuidv4 } from 'uuid';
import type { ApiResponse, PaginatedResponse } from './types';
import { createErrorResponse, createSuccessResponse, delay } from './types';
import { initializeMockData } from './mock';
import { getStorageData, setStorageData } from './mock/storage';
import { STORAGE_KEYS, DEFAULT_PAGE_SIZE } from '../shared/utils/constants';
import type { Commission, CommissionPayoutPlan } from '../types/commission';
import type { Department } from '../types/department';
import type { User } from '../types/settings';
import type {
  RecoveryOrder,
  RecoveryOrderFilters,
  RecoveryOrderInput,
  RecoverySettlementInput,
  RecoveryOrderStats,
} from '../types/recoveryOrder';

function ensureInit(): void {
  initializeMockData();
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeText(value?: string): string {
  return String(value || '').trim().toLowerCase();
}

function normalizeRecoveryOrder(order: RecoveryOrder): RecoveryOrder {
  if ((order.status as string) === '已生成提成') {
    return { ...order, status: '已分账', settlementStatus: '已分账' };
  }
  if ((order.status as string) === '审核通过') {
    return { ...order, status: '待分账', settlementStatus: order.settlementStatus || '待分账' };
  }
  return { ...order, settlementStatus: order.settlementStatus || (order.status === '待分账' ? '待分账' : order.status === '已分账' ? '已分账' : '未分账') };
}

function readRecoveryOrders(): RecoveryOrder[] {
  return (getStorageData<RecoveryOrder[]>(STORAGE_KEYS.RECOVERY_ORDERS) || []).map(normalizeRecoveryOrder);
}

function writeRecoveryOrders(items: RecoveryOrder[]): void {
  setStorageData(STORAGE_KEYS.RECOVERY_ORDERS, items);
}

function roundMoney(amount: number): number {
  return Math.round(Number(amount || 0) * 100) / 100;
}

function readCommissions(): Commission[] {
  return getStorageData<Commission[]>(STORAGE_KEYS.COMMISSIONS) || [];
}

function writeCommissions(items: Commission[]): void {
  setStorageData(STORAGE_KEYS.COMMISSIONS, items);
}

function getUsers(): User[] {
  return getStorageData<User[]>(STORAGE_KEYS.USERS) || [];
}

function getDepartments(): Department[] {
  return getStorageData<Department[]>(STORAGE_KEYS.DEPARTMENTS) || [];
}

function getPayoutPlans(): CommissionPayoutPlan[] {
  return getStorageData<CommissionPayoutPlan[]>('commission_payout_plans') || [];
}

function getDepartmentByUser(user: User): Department | undefined {
  const departments = getDepartments();
  return departments.find((department) => department.id === user.departmentId);
}

function getPayoutPlan(planId?: string): CommissionPayoutPlan | undefined {
  if (!planId) return undefined;
  return getPayoutPlans().find((plan) => plan.id === planId);
}

async function fetchRecoveryOrders(filters: RecoveryOrderFilters = {}): Promise<ApiResponse<PaginatedResponse<RecoveryOrder>>> {
  ensureInit();
  await delay(120);
  let items = [...readRecoveryOrders()];
  const q = normalizeText(filters.search);
  if (q) {
    items = items.filter((item) => [
      item.recoveryNo,
      item.thirdPartyOrderNo,
      item.customerName,
      item.customerPhone,
      item.customerWechat,
      item.originalProduct,
      item.recoveryUserName,
    ].some((value) => normalizeText(value).includes(q)));
  }
  if (filters.statuses?.length) {
    items = items.filter((item) => filters.statuses?.includes(item.status));
  } else if (filters.status && filters.status !== '全部') {
    items = items.filter((item) => item.status === filters.status);
  }
  if (filters.settlementStatus && filters.settlementStatus !== '全部') {
    items = items.filter((item) => (item.settlementStatus || '未分账') === filters.settlementStatus);
  }
  if (filters.ownerId) {
    items = items.filter((item) => (
      item.createdBy === filters.ownerId
      || item.recoveryUserId === filters.ownerId
      || item.assistUserId === filters.ownerId
    ));
  }
  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const page = filters.page || 1;
  const pageSize = filters.pageSize || DEFAULT_PAGE_SIZE;
  const total = items.length;
  const totalPages = Math.ceil(total / pageSize);
  return createSuccessResponse({
    items: items.slice((page - 1) * pageSize, page * pageSize),
    pagination: { page, pageSize, total, totalPages },
  });
}

async function fetchRecoveryOrderStats(ownerId?: string): Promise<ApiResponse<RecoveryOrderStats>> {
  ensureInit();
  await delay(80);
  const items = readRecoveryOrders().filter((item) => !ownerId || item.createdBy === ownerId || item.recoveryUserId === ownerId || item.assistUserId === ownerId);
  const commissionIds = new Set(items.flatMap((item) => item.commissionIds || []));
  const commissions = readCommissions();
  return createSuccessResponse({
    total: items.length,
    pendingReview: items.filter((item) => item.status === '待审核').length,
    approved: items.filter((item) => item.status === '待分账' || item.status === '已分账').length,
    rejected: items.filter((item) => item.status === '审核驳回').length,
    waitingSettlement: items.filter((item) => (item.settlementStatus || '未分账') === '待分账').length,
    settled: items.filter((item) => (item.settlementStatus || '未分账') === '已分账').length,
    generatedCommissionAmount: commissions
      .filter((commission) => commissionIds.has(commission.id))
      .reduce((sum, commission) => sum + Number(commission.commissionAmount || 0), 0),
  });
}

async function createRecoveryOrder(data: RecoveryOrderInput): Promise<ApiResponse<RecoveryOrder>> {
  ensureInit();
  await delay(180);
  if (!data.customerName.trim()) return createErrorResponse('请填写客户姓名');
  if (!data.thirdPartyOrderNo.trim()) return createErrorResponse('请填写第三方平台订单号');
  if (!data.originalProduct.trim()) return createErrorResponse('请填写原购买产品');
  if (Number(data.recoveryAmount) <= 0) return createErrorResponse('挽回成交金额必须大于 0');

  const orders = readRecoveryOrders();
  if (orders.some((item) => item.thirdPartyOrderNo === data.thirdPartyOrderNo.trim())) {
    return createErrorResponse('该第三方平台订单号已经创建过售后挽回订单');
  }

  const now = nowIso();
  const next: RecoveryOrder = {
    ...data,
    id: `recovery-${uuidv4().slice(0, 8)}`,
    recoveryNo: `RCV-${now.slice(0, 10).replace(/-/g, '')}-${String(orders.length + 1).padStart(4, '0')}`,
    thirdPartyOrderNo: data.thirdPartyOrderNo.trim(),
    customerId: '',
    customerName: data.customerName.trim(),
    customerPhone: data.customerPhone,
    customerWechat: data.customerWechat,
    customerMatchStatus: '手工填写',
    originalAmount: Number(data.originalAmount) || 0,
    recoveryAmount: Number(data.recoveryAmount) || 0,
    paymentVoucher: data.paymentVoucher,
    paymentVoucherName: data.paymentVoucherName,
    paymentVoucherPreview: data.paymentVoucherPreview,
    chatEvidence: data.chatEvidence,
    chatEvidenceName: data.chatEvidenceName,
    chatEvidencePreview: data.chatEvidencePreview,
    status: '待审核',
    settlementStatus: '未分账',
    commissionIds: [],
    createdAt: now,
    updatedAt: now,
  };
  writeRecoveryOrders([next, ...orders]);
  return createSuccessResponse(next);
}

async function updateRecoveryOrder(id: string, data: RecoveryOrderInput): Promise<ApiResponse<RecoveryOrder | null>> {
  ensureInit();
  await delay(160);
  if (!data.customerName.trim()) return createErrorResponse('请填写客户姓名');
  if (!data.thirdPartyOrderNo.trim()) return createErrorResponse('请填写第三方平台订单号');
  if (!data.originalProduct.trim()) return createErrorResponse('请填写原购买产品');
  if (Number(data.recoveryAmount) <= 0) return createErrorResponse('挽回成交金额必须大于 0');

  const orders = readRecoveryOrders();
  const idx = orders.findIndex((item) => item.id === id);
  if (idx === -1) return createSuccessResponse(null);
  const current = orders[idx];
  if ((current.settlementStatus || '未分账') === '已分账' || current.status === '已分账') {
    return createErrorResponse('已分账的售后挽回订单不能修改');
  }
  if (orders.some((item) => item.id !== id && item.thirdPartyOrderNo === data.thirdPartyOrderNo.trim())) {
    return createErrorResponse('该第三方平台订单号已经创建过售后挽回订单');
  }

  const now = nowIso();
  const recoveryUser = getUsers().find((item) => item.id === data.recoveryUserId);
  const assistUser = data.assistUserId ? getUsers().find((item) => item.id === data.assistUserId) : undefined;
  const nextStatus: RecoveryOrder['status'] = current.status === '退回修改' || current.status === '审核驳回'
    ? '待审核'
    : current.status;

  orders[idx] = {
    ...current,
    customerName: data.customerName.trim(),
    customerPhone: data.customerPhone,
    customerWechat: data.customerWechat,
    thirdPartyOrderNo: data.thirdPartyOrderNo.trim(),
    sourcePlatform: data.sourcePlatform,
    originalProduct: data.originalProduct.trim(),
    originalAmount: Number(data.originalAmount) || 0,
    recoveryAmount: Number(data.recoveryAmount) || 0,
    paymentVoucher: data.paymentVoucher,
    paymentVoucherName: data.paymentVoucherName,
    paymentVoucherPreview: data.paymentVoucherPreview,
    chatEvidence: data.chatEvidence,
    chatEvidenceName: data.chatEvidenceName,
    chatEvidencePreview: data.chatEvidencePreview,
    recoveryUserId: data.recoveryUserId,
    recoveryUserName: recoveryUser?.name || data.recoveryUserName,
    assistUserId: data.assistUserId,
    assistUserName: assistUser?.name || data.assistUserName,
    remark: data.remark,
    status: nextStatus,
    settlementStatus: nextStatus === '待审核' ? '未分账' : current.settlementStatus,
    auditReason: nextStatus === '待审核' ? undefined : current.auditReason,
    updatedAt: now,
  };
  writeRecoveryOrders(orders);
  return createSuccessResponse(orders[idx]);
}

async function deleteRecoveryOrder(id: string, options: { force?: boolean } = {}): Promise<ApiResponse<boolean>> {
  ensureInit();
  await delay(120);
  const orders = readRecoveryOrders();
  const target = orders.find((item) => item.id === id);
  if (!target) return createSuccessResponse(true);
  const isSettled = (target.settlementStatus || '未分账') === '已分账' || target.status === '已分账';
  if (isSettled && !options.force) {
    return createErrorResponse('已分账的售后挽回订单不能删除，请先删除分账记录');
  }
  if (isSettled && options.force) {
    const commissionIds = new Set(target.commissionIds || []);
    const commissions = readCommissions();
    writeCommissions(commissions.filter((commission) => (
      !commissionIds.has(commission.id)
      && commission.sourceRecoveryOrderId !== target.id
    )));
  }
  writeRecoveryOrders(orders.filter((item) => item.id !== id));
  return createSuccessResponse(true);
}

async function approveRecoveryOrder(id: string, auditorId: string, auditorName: string): Promise<ApiResponse<RecoveryOrder | null>> {
  ensureInit();
  await delay(160);
  const orders = readRecoveryOrders();
  const idx = orders.findIndex((item) => item.id === id);
  if (idx === -1) return createSuccessResponse(null);
  if (orders[idx].status === '审核驳回') return createErrorResponse('已驳回的挽回单不能直接审核通过');
  if (orders[idx].status === '已分账') return createErrorResponse('已分账的挽回单不能重复审核');
  const now = nowIso();
  orders[idx] = {
    ...orders[idx],
    status: '待分账',
    settlementStatus: '待分账',
    auditorId,
    auditorName,
    auditedAt: now,
    auditReason: undefined,
    updatedAt: now,
  };
  writeRecoveryOrders(orders);
  return createSuccessResponse(orders[idx]);
}

async function returnRecoveryOrder(id: string, auditorId: string, auditorName: string, reason: string): Promise<ApiResponse<RecoveryOrder | null>> {
  ensureInit();
  await delay(140);
  const orders = readRecoveryOrders();
  const idx = orders.findIndex((item) => item.id === id);
  if (idx === -1) return createSuccessResponse(null);
  if (!reason.trim()) return createErrorResponse('请填写退回修改原因');
  if (orders[idx].status === '已分账') return createErrorResponse('已分账的挽回单不能退回修改');
  const now = nowIso();
  orders[idx] = {
    ...orders[idx],
    status: '退回修改',
    settlementStatus: '未分账',
    auditorId,
    auditorName,
    auditReason: reason.trim(),
    auditedAt: now,
    updatedAt: now,
  };
  writeRecoveryOrders(orders);
  return createSuccessResponse(orders[idx]);
}

async function rejectRecoveryOrder(id: string, auditorId: string, auditorName: string, reason: string): Promise<ApiResponse<RecoveryOrder | null>> {
  ensureInit();
  await delay(140);
  const orders = readRecoveryOrders();
  const idx = orders.findIndex((item) => item.id === id);
  if (idx === -1) return createSuccessResponse(null);
  if (!reason.trim()) return createErrorResponse('请填写驳回原因');
  const now = nowIso();
  orders[idx] = {
    ...orders[idx],
    status: '审核驳回',
    settlementStatus: '未分账',
    auditorId,
    auditorName,
    auditReason: reason.trim(),
    auditedAt: now,
    updatedAt: now,
  };
  writeRecoveryOrders(orders);
  return createSuccessResponse(orders[idx]);
}

function buildRecoveryCommission(order: RecoveryOrder, input: RecoverySettlementInput, operatorName: string, now: string): ApiResponse<Commission> {
  const user = getUsers().find((item) => item.id === input.ownerId && item.isActive);
  if (!user) return createErrorResponse('分账人员不存在或已停用');
  const department = getDepartmentByUser(user);
  const plan = getPayoutPlan(input.payoutPlanId);
  const performanceAmount = roundMoney(input.performanceAmount ?? order.recoveryAmount);
  const calculationType = input.ruleCalculationType || plan?.commissionType || (input.commissionRate ? 'percentage' : 'fixed');
  const commissionRate = calculationType === 'percentage'
    ? Number(input.commissionRate ?? (plan ? plan.commissionValue / 100 : 0))
    : 0;
  const amount = calculationType === 'percentage'
    ? roundMoney(performanceAmount * commissionRate)
    : roundMoney(input.commissionAmount);
  if (amount < 0) return createErrorResponse('提成金额不能小于 0');
  const payoutPlanName = input.payoutPlanName || plan?.name || '自定义金额';
  const formulaText = calculationType === 'percentage'
    ? `${payoutPlanName}：挽回金额 ${performanceAmount} × ${roundMoney(commissionRate * 100)}% = ${amount} 元`
    : `${payoutPlanName}：售后挽回提成 ${amount} 元`;
  return createSuccessResponse({
    id: `comm-${uuidv4().slice(0, 8)}`,
    orderId: order.id,
    orderNo: order.recoveryNo,
    customerName: order.customerName,
    productLevel: order.originalProduct,
    orderAmount: order.recoveryAmount,
    performanceAmount,
    commissionRate,
    commissionAmount: amount,
    scene: '售后挽回',
    proofStatus: order.paymentVoucher || order.paymentVoucherName || order.chatEvidence || order.chatEvidenceName ? '已上传' : '待补充',
    formulaText,
    calculationNote: input.calculationNote || `售后挽回订单 ${order.recoveryNo} 财务分账：${operatorName}`,
    role: input.role,
    owner: user.name,
    ownerId: user.id,
    department: department?.name || '',
    departmentId: department?.id || user.departmentId,
    paymentDate: order.auditedAt || now,
    status: '待确认',
    sourceType: '人工新增',
    commissionType: 'recovery',
    payoutPlanId: input.payoutPlanId,
    payoutPlanName,
    ruleCalculationType: calculationType,
    sourceRecoveryOrderId: order.id,
    sourceBusinessType: 'after_sales_recovery',
    isRecoveryBonus: true,
    adjustReason: '售后挽回分账',
    adjustedBy: operatorName,
    adjustedAt: now,
    createdAt: now,
    updatedAt: now,
  });
}

async function settleRecoveryOrder(
  id: string,
  rows: RecoverySettlementInput[],
  reason: string,
  operatorId: string,
  operatorName: string,
): Promise<ApiResponse<RecoveryOrder | null>> {
  ensureInit();
  await delay(180);
  const normalizedReason = reason.trim();
  if (!normalizedReason) return createErrorResponse('请填写分账说明');
  if (!rows.length) return createErrorResponse('至少添加一条分账记录');
  const orders = readRecoveryOrders();
  const idx = orders.findIndex((item) => item.id === id);
  if (idx === -1) return createSuccessResponse(null);
  const order = orders[idx];
  if ((order.settlementStatus || '未分账') === '已分账') return createErrorResponse('该售后挽回订单已分账');
  if (order.status !== '待分账') return createErrorResponse('只有审核通过的售后挽回订单才能分账');

  const now = nowIso();
  const built: Commission[] = [];
  for (const row of rows) {
    if (!row.role) return createErrorResponse('请选择提成角色');
    if (!row.ownerId) return createErrorResponse('请选择分账人员');
    const res = buildRecoveryCommission(order, row, operatorName, now);
    if (res.code !== 0) return createErrorResponse(res.message || '生成分账失败');
    built.push(res.data);
  }

  const commissions = readCommissions();
  writeCommissions([...built, ...commissions]);
  orders[idx] = {
    ...order,
    status: '已分账',
    settlementStatus: '已分账',
    commissionIds: built.map((commission) => commission.id),
    auditorId: order.auditorId || operatorId,
    auditorName: order.auditorName || operatorName,
    auditReason: normalizedReason,
    updatedAt: now,
  };
  writeRecoveryOrders(orders);
  return createSuccessResponse(orders[idx]);
}

async function resetRecoverySettlement(id: string, operatorName: string): Promise<ApiResponse<RecoveryOrder | null>> {
  ensureInit();
  await delay(160);
  const orders = readRecoveryOrders();
  const idx = orders.findIndex((item) => item.id === id);
  if (idx === -1) return createSuccessResponse(null);
  const order = orders[idx];
  if ((order.settlementStatus || '未分账') !== '已分账') return createErrorResponse('只有已分账的售后挽回订单才能删除分账');

  const commissionIds = new Set(order.commissionIds || []);
  const commissions = readCommissions();
  writeCommissions(commissions.filter((commission) => (
    !commissionIds.has(commission.id)
    && commission.sourceRecoveryOrderId !== order.id
  )));

  const now = nowIso();
  orders[idx] = {
    ...order,
    status: '待分账',
    settlementStatus: '待分账',
    commissionIds: [],
    auditReason: `删除售后挽回分账：${operatorName}`,
    updatedAt: now,
  };
  writeRecoveryOrders(orders);
  return createSuccessResponse(orders[idx]);
}

export const recoveryOrderApi = {
  fetchRecoveryOrders,
  fetchRecoveryOrderStats,
  createRecoveryOrder,
  updateRecoveryOrder,
  deleteRecoveryOrder,
  approveRecoveryOrder,
  returnRecoveryOrder,
  rejectRecoveryOrder,
  settleRecoveryOrder,
  resetRecoverySettlement,
};
