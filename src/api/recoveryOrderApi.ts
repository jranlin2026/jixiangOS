import { v4 as uuidv4 } from 'uuid';
import type { ApiResponse, PaginatedResponse } from './types';
import { createErrorResponse, createSuccessResponse, delay } from './types';
import { backendRequest, shouldUseBackendApi } from './backendClient';
import { initializeMockData } from './mock';
import { getStorageData, setStorageCacheData, setStorageData } from './mock/storage';
import { STORAGE_KEYS, DEFAULT_PAGE_SIZE } from '../shared/utils/constants';
import { AUTH_SESSION_STORAGE_KEY } from '../shared/utils/auth';
import { getCurrentOperatorName } from '../shared/utils/currentOperator';
import { getCurrentDataVisibilityScope } from '../shared/utils/dataVisibility';
import { PERMISSION_KEYS, normalizePermissionKey, roleHasPermission } from '../shared/utils/permissions';
import { normalizeUserRoleName } from '../shared/utils/roles';
import type { AuthSession } from '../types/auth';
import type { Commission, CommissionPayoutPlan } from '../types/commission';
import type { Department } from '../types/department';
import type { Role } from '../types/role';
import type { User } from '../types/settings';
import type {
  RecoveryOrder,
  RecoveryOrderFilters,
  RecoveryOrderInput,
  RecoverySettlementInput,
  RecoveryOrderSettlementStatus,
  RecoveryOrderStats,
  RecoverySettlementCounts,
} from '../types/recoveryOrder';

function ensureInit(): void {
  initializeMockData();
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeRecoveryTime(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function normalizeText(value?: string): string {
  return String(value || '').trim().toLowerCase();
}

function normalizeRecoveryOrder(order: RecoveryOrder): RecoveryOrder {
  if ((order.status as string) === '已生成提成') {
    return { ...order, status: '已分账', settlementStatus: '待发放' };
  }
  if ((order.status as string) === '审核通过') {
    return { ...order, status: '待分账', settlementStatus: order.settlementStatus || '待处理' };
  }
  const rawSettlementStatus = String(order.settlementStatus || '');
  const settlementStatus = rawSettlementStatus === '待分账'
    ? '待处理'
    : rawSettlementStatus === '已分账'
      ? '待发放'
      : order.settlementStatus || (order.status === '待分账' ? '待处理' : order.status === '已分账' ? '待发放' : '未分账');
  return { ...order, settlementStatus: settlementStatus as RecoveryOrderSettlementStatus };
}

function readRecoveryOrders(): RecoveryOrder[] {
  return (getStorageData<RecoveryOrder[]>(STORAGE_KEYS.RECOVERY_ORDERS) || []).map(normalizeRecoveryOrder);
}

function writeRecoveryOrders(items: RecoveryOrder[]): void {
  setStorageData(STORAGE_KEYS.RECOVERY_ORDERS, items);
}

function compactBackendRecoveryCache(order: RecoveryOrder): RecoveryOrder {
  return {
    ...order,
    paymentVoucherPreview: order.paymentVoucherPreview?.startsWith('data:')
      ? undefined
      : order.paymentVoucherPreview,
    chatEvidencePreview: order.chatEvidencePreview?.startsWith('data:')
      ? undefined
      : order.chatEvidencePreview,
  };
}

function cacheBackendRecoveryOrder(order: RecoveryOrder): RecoveryOrder {
  const orders = readRecoveryOrders();
  const index = orders.findIndex((item) => item.id === order.id);
  const next = index === -1
    ? [order, ...orders]
    : orders.map((item, itemIndex) => (itemIndex === index ? order : item));
  setStorageCacheData(STORAGE_KEYS.RECOVERY_ORDERS, next.map(compactBackendRecoveryCache));
  return order;
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

function getPositions(): Array<{ id: string; name: string; departmentId?: string }> {
  return getStorageData<Array<{ id: string; name: string; departmentId?: string }>>(STORAGE_KEYS.POSITIONS) || [];
}

function getPayoutPlans(): CommissionPayoutPlan[] {
  return getStorageData<CommissionPayoutPlan[]>(STORAGE_KEYS.COMMISSION_PAYOUT_PLANS)
    || getStorageData<CommissionPayoutPlan[]>('commission_payout_plans')
    || [];
}

function getCurrentSessionUser(): User | undefined {
  const session = getStorageData<AuthSession>(AUTH_SESSION_STORAGE_KEY);
  if (!session?.userId) return undefined;
  return getUsers().find((user) => user.id === session.userId && user.isActive);
}

function getCurrentSessionRole(): Role | undefined {
  const user = getCurrentSessionUser();
  if (!user) return undefined;
  const roles = getStorageData<Role[]>(STORAGE_KEYS.ROLES) || [];
  const normalizedRole = normalizeUserRoleName(user.role);
  return roles.find((role) => (
    role.isActive
    && (
      role.id === user.roleId
      || role.name === normalizedRole
      || role.name === user.role
    )
  ));
}

function canUseRecoveryPermission(permissionKey: string, action = 'read'): boolean {
  return roleHasPermission(getCurrentSessionRole(), permissionKey, action);
}

function canUseDirectRecoveryPermission(permissionKey: string, action = 'read'): boolean {
  const role = getCurrentSessionRole();
  if (!role?.isActive) return false;
  if (role.code === 'super_admin') return true;
  const normalizedKey = normalizePermissionKey(permissionKey);
  return role.permissions.some((permission) => {
    if (normalizePermissionKey(permission.module) !== normalizedKey) return false;
    const actions = permission.actions || [];
    if (actions.includes('admin')) return true;
    if (action === 'read') return actions.some((item) => ['read', 'write', 'delete'].includes(item));
    if (action === 'write') return actions.some((item) => ['write', 'delete'].includes(item));
    return actions.includes(action);
  });
}

function canUseRecoveryReviewAction(): boolean {
  return canUseDirectRecoveryPermission(PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW, 'write');
}

function canViewRecoveryOrder(order: RecoveryOrder, scopeDomain: NonNullable<RecoveryOrderFilters['scopeDomain']> = 'recoveryOrders'): boolean {
  const scope = getCurrentDataVisibilityScope(scopeDomain);
  if (scope.unrestricted) return true;
  return order.createdBy
    ? scope.visibleUserIds.includes(order.createdBy)
    : Boolean(order.createdByName && scope.visibleUserNames.includes(order.createdByName));
}

function canResubmitReturnedRecoveryOrder(order: RecoveryOrder): boolean {
  if (order.status !== '退回修改') return false;
  const user = getCurrentSessionUser();
  if (!user) return false;
  return order.createdBy === user.id || order.recoveryUserId === user.id;
}

function filterVisibleRecoveryOrders(
  orders: RecoveryOrder[],
  scopeDomain: NonNullable<RecoveryOrderFilters['scopeDomain']> = 'recoveryOrders',
): RecoveryOrder[] {
  return orders.filter((order) => canViewRecoveryOrder(order, scopeDomain));
}

function getDepartmentByUser(user: User): Department | undefined {
  const departments = getDepartments();
  const directDepartment = departments.find((department) => department.id === user.departmentId);
  if (directDepartment) return directDepartment;
  const position = getPositions().find((item) => item.id === user.positionId || item.name === user.positionName);
  const positionDepartment = departments.find((department) => department.id === position?.departmentId);
  if (positionDepartment) return positionDepartment;
  const roles = getStorageData<Role[]>(STORAGE_KEYS.ROLES) || [];
  const role = roles.find((item) => item.id === user.roleId || item.name === user.role);
  return departments.find((department) => department.id === role?.departmentId);
}

function getPayoutPlan(planId?: string): CommissionPayoutPlan | undefined {
  if (!planId) return undefined;
  return getPayoutPlans().find((plan) => plan.id === planId);
}

async function fetchRecoveryOrders(filters: RecoveryOrderFilters = {}): Promise<ApiResponse<PaginatedResponse<RecoveryOrder>>> {
  if (shouldUseBackendApi()) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      params.set(key, Array.isArray(value) ? value.join(',') : String(value));
    });
    const response = await backendRequest<PaginatedResponse<RecoveryOrder>>(
      `/recovery-orders${params.size ? `?${params.toString()}` : ''}`,
    );
    if (response.code !== 0 || !response.data) {
      return createErrorResponse(response.message || '售后挽回订单列表加载失败', response.code || -1);
    }
    const items = response.data.items.map(normalizeRecoveryOrder);
    setStorageCacheData(STORAGE_KEYS.RECOVERY_ORDERS, items.map(compactBackendRecoveryCache));
    return createSuccessResponse({ ...response.data, items }, response.message);
  }

  ensureInit();
  await delay(120);
  const scopeDomain = filters.scopeDomain || 'recoveryOrders';
  const canRead = scopeDomain === 'recoveryOrderApplications'
    ? canUseRecoveryPermission(PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW_LIST, 'read')
    : canUseRecoveryPermission(PERMISSION_KEYS.AFTER_SALES_RECOVERY, 'read')
      || canUseRecoveryPermission(PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE, 'read');
  if (!canRead) {
    return createErrorResponse(scopeDomain === 'recoveryOrderApplications'
      ? '无权查看售后挽回订单审核列表'
      : '无权查看售后挽回订单列表', 403);
  }
  let items = filterVisibleRecoveryOrders(readRecoveryOrders(), filters.scopeDomain);
  if (!filters.includeDeleted) {
    items = items.filter((item) => !item.deletedAt);
  }
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
  if (filters.settlementStatuses?.length) {
    items = items.filter((item) => filters.settlementStatuses?.includes(
      (item.settlementStatus || '未分账') as any,
    ));
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

async function fetchRecoveryOrderById(
  id: string,
  scopeDomain: NonNullable<RecoveryOrderFilters['scopeDomain']> = 'recoveryOrders',
): Promise<ApiResponse<RecoveryOrder | null>> {
  if (shouldUseBackendApi()) {
    const params = new URLSearchParams({ scopeDomain });
    const response = await backendRequest<RecoveryOrder>(
      `/recovery-orders/${encodeURIComponent(id)}?${params.toString()}`,
    );
    if (response.code !== 0 || !response.data) {
      return createErrorResponse(response.message || '售后挽回订单详情加载失败', response.code || -1);
    }
    return createSuccessResponse(cacheBackendRecoveryOrder(normalizeRecoveryOrder(response.data)), response.message);
  }

  ensureInit();
  await delay(80);
  const order = filterVisibleRecoveryOrders(readRecoveryOrders(), scopeDomain)
    .find((item) => item.id === id && !item.deletedAt);
  return createSuccessResponse(order || null);
}

async function fetchRecoveryOrderStats(ownerId?: string): Promise<ApiResponse<RecoveryOrderStats>> {
  ensureInit();
  await delay(80);
  const items = filterVisibleRecoveryOrders(readRecoveryOrders(), 'recoveryOrders').filter((item) => (
    !item.deletedAt
    && (!ownerId || item.createdBy === ownerId || item.recoveryUserId === ownerId || item.assistUserId === ownerId)
  ));
  const commissionIds = new Set(items.flatMap((item) => item.commissionIds || []));
  const commissions = readCommissions();
  return createSuccessResponse({
    total: items.length,
    pendingReview: items.filter((item) => item.status === '待审核').length,
    approved: items.filter((item) => item.status === '待分账' || item.status === '已分账').length,
    rejected: items.filter((item) => item.status === '审核驳回').length,
    waitingSettlement: items.filter((item) => (item.settlementStatus || '未分账') === '待处理').length,
    settled: items.filter((item) => ['待确认', '待发放'].includes(item.settlementStatus || '未分账')).length,
    generatedCommissionAmount: commissions
      .filter((commission) => commissionIds.has(commission.id))
      .reduce((sum, commission) => sum + Number(commission.commissionAmount || 0), 0),
  });
}

async function fetchRecoverySettlementCounts(
  filters: Pick<RecoveryOrderFilters, 'search' | 'includeDeleted'> = {},
): Promise<ApiResponse<RecoverySettlementCounts>> {
  if (shouldUseBackendApi()) {
    const params = new URLSearchParams();
    if (filters.search) params.set('search', filters.search);
    if (filters.includeDeleted) params.set('includeDeleted', 'true');
    return backendRequest<RecoverySettlementCounts>(
      `/recovery-orders/settlement-counts${params.size ? `?${params.toString()}` : ''}`,
    );
  }
  const items = filterVisibleRecoveryOrders(readRecoveryOrders(), 'recoveryOrders')
    .filter((item) => filters.includeDeleted || !item.deletedAt)
    .filter((item) => !filters.search || [item.recoveryNo, item.customerName, item.thirdPartyOrderNo]
      .some((value) => normalizeText(value).includes(normalizeText(filters.search))));
  const statusCounts: Record<string, number> = { 待处理: 0, 待确认: 0, 待发放: 0, 已发放: 0, 已撤回: 0 };
  items.forEach((item) => {
    const value = String(item.settlementStatus || '');
    if (value in statusCounts) statusCounts[value] += 1;
  });
  return createSuccessResponse({
    total: Object.values(statusCounts).reduce((sum, count) => sum + count, 0),
    statusCounts,
  });
}

async function createRecoveryOrder(data: RecoveryOrderInput): Promise<ApiResponse<RecoveryOrder>> {
  if (shouldUseBackendApi()) {
    const response = await backendRequest<RecoveryOrder>('/recovery-orders', {
      method: 'POST',
      body: JSON.stringify({ data }),
    });
    if (response.code !== 0 || !response.data) {
      return createErrorResponse(response.message || '服务端未返回售后挽回订单', response.code || -1);
    }
    return createSuccessResponse(cacheBackendRecoveryOrder(response.data), response.message);
  }

  ensureInit();
  await delay(180);
  if (!canUseRecoveryPermission(PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE, 'write')) {
    return createErrorResponse('无权新增售后挽回订单', 403);
  }
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
    recoveryAt: normalizeRecoveryTime(data.recoveryAt, now),
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
  if (shouldUseBackendApi()) {
    const response = await backendRequest<RecoveryOrder | null>(`/recovery-orders/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ data }),
    });
    if (response.code !== 0) return createErrorResponse(response.message, response.code);
    return createSuccessResponse(response.data ? cacheBackendRecoveryOrder(response.data) : null, response.message);
  }

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
  if (!canUseRecoveryPermission(PERMISSION_KEYS.AFTER_SALES_RECOVERY_EDIT, 'write') && !canResubmitReturnedRecoveryOrder(current)) {
    return createErrorResponse('无权编辑售后挽回订单', 403);
  }
  if (['待确认', '待发放', '已撤回'].includes(current.settlementStatus || '未分账') || current.status === '已分账') {
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
    recoveryAt: normalizeRecoveryTime(data.recoveryAt, current.recoveryAt || current.createdAt),
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
  if (shouldUseBackendApi()) {
    const response = await backendRequest<RecoveryOrder | null>(`/recovery-orders/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason: options.force ? '管理员强制删除' : '售后挽回订单删除' }),
    });
    if (response.code !== 0) return createErrorResponse(response.message, response.code);
    if (response.data) cacheBackendRecoveryOrder(response.data);
    return createSuccessResponse(true, response.message);
  }

  ensureInit();
  await delay(120);
  if (!canUseRecoveryPermission(PERMISSION_KEYS.AFTER_SALES_RECOVERY_DELETE, 'delete')) {
    return createErrorResponse('无权删除售后挽回订单', 403);
  }
  const orders = readRecoveryOrders();
  const idx = orders.findIndex((item) => item.id === id);
  const target = idx >= 0 ? orders[idx] : undefined;
  if (!target) return createSuccessResponse(true);
  const isSettled = ['待确认', '待发放', '已撤回'].includes(target.settlementStatus || '未分账') || target.status === '已分账';
  if (isSettled && !options.force) {
    return createErrorResponse('已分账的售后挽回订单不能删除，请先删除分账记录');
  }
  const now = nowIso();
  orders[idx] = {
    ...target,
    deletedAt: now,
    deletedBy: getCurrentOperatorName(target.createdByName || target.recoveryUserName || '售后'),
    deleteReason: '售后挽回订单删除',
    updatedAt: now,
  };
  writeRecoveryOrders(orders);
  return createSuccessResponse(true);
}

async function approveRecoveryOrder(id: string, auditorId: string, auditorName: string): Promise<ApiResponse<RecoveryOrder | null>> {
  if (shouldUseBackendApi()) {
    const response = await backendRequest<RecoveryOrder | null>(`/recovery-orders/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
    });
    if (response.code !== 0) return createErrorResponse(response.message, response.code);
    return createSuccessResponse(response.data ? cacheBackendRecoveryOrder(response.data) : null, response.message);
  }

  ensureInit();
  await delay(160);
  if (!canUseRecoveryReviewAction()) {
    return createErrorResponse('无权审核售后挽回订单', 403);
  }
  const orders = readRecoveryOrders();
  const idx = orders.findIndex((item) => item.id === id);
  if (idx === -1) return createSuccessResponse(null);
  if (orders[idx].status === '审核驳回') return createErrorResponse('已驳回的挽回单不能直接审核通过');
  if (orders[idx].status === '已分账') return createErrorResponse('已分账的挽回单不能重复审核');
  const now = nowIso();
  orders[idx] = {
    ...orders[idx],
    status: '待分账',
    settlementStatus: '待处理',
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
  if (shouldUseBackendApi()) {
    const response = await backendRequest<RecoveryOrder | null>(`/recovery-orders/${encodeURIComponent(id)}/return`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    if (response.code !== 0) return createErrorResponse(response.message, response.code);
    return createSuccessResponse(response.data ? cacheBackendRecoveryOrder(response.data) : null, response.message);
  }

  ensureInit();
  await delay(140);
  if (!canUseRecoveryReviewAction()) {
    return createErrorResponse('无权退回售后挽回订单', 403);
  }
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
  if (shouldUseBackendApi()) {
    const response = await backendRequest<RecoveryOrder | null>(`/recovery-orders/${encodeURIComponent(id)}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    if (response.code !== 0) return createErrorResponse(response.message, response.code);
    return createSuccessResponse(response.data ? cacheBackendRecoveryOrder(response.data) : null, response.message);
  }

  ensureInit();
  await delay(140);
  if (!canUseRecoveryReviewAction()) {
    return createErrorResponse('无权驳回售后挽回订单', 403);
  }
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
  const currentSettlementStatus = order.settlementStatus || '未分账';
  if (!['待处理', '待确认'].includes(currentSettlementStatus)) return createErrorResponse('只有待处理或待确认的售后挽回订单可以调整分账');
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
  const existingIds = new Set(order.commissionIds || []);
  const lockedCommission = commissions.find((commission) => (
    (existingIds.has(commission.id) || commission.sourceRecoveryOrderId === order.id)
    && commission.status !== '待确认'
  ));
  if (lockedCommission) return createErrorResponse('该售后挽回分账已进入发放链路，不能直接调整');
  const remainingCommissions = commissions.filter((commission) => (
    !existingIds.has(commission.id)
    && commission.sourceRecoveryOrderId !== order.id
  ));
  writeCommissions([...built, ...remainingCommissions]);
  orders[idx] = {
    ...order,
    status: '待分账',
    settlementStatus: '待确认',
    commissionIds: built.map((commission) => commission.id),
    auditorId: order.auditorId || operatorId,
    auditorName: order.auditorName || operatorName,
    auditReason: normalizedReason,
    updatedAt: now,
  };
  writeRecoveryOrders(orders);
  return createSuccessResponse(orders[idx]);
}

async function confirmRecoverySettlement(id: string, operatorName: string): Promise<ApiResponse<RecoveryOrder | null>> {
  ensureInit();
  await delay(140);
  const orders = readRecoveryOrders();
  const idx = orders.findIndex((item) => item.id === id);
  if (idx === -1) return createSuccessResponse(null);
  const order = orders[idx];
  if ((order.settlementStatus || '未分账') !== '待确认') return createErrorResponse('只有待确认的售后挽回分账可以确认');
  const commissionIds = new Set(order.commissionIds || []);
  if (!commissionIds.size) return createErrorResponse('该售后挽回订单还没有分账明细');

  const now = nowIso();
  const commissions = readCommissions();
  let changed = false;
  const nextCommissions = commissions.map((commission) => {
    if (!commissionIds.has(commission.id) && commission.sourceRecoveryOrderId !== order.id) return commission;
    if (commission.status !== '待确认') return commission;
    changed = true;
    return {
      ...commission,
      status: '待发放' as const,
      auditReason: undefined,
      adjustedBy: operatorName,
      adjustedAt: now,
      updatedAt: now,
    };
  });
  if (!changed) return createErrorResponse('该售后挽回订单没有待确认分账');
  writeCommissions(nextCommissions);
  orders[idx] = {
    ...order,
    status: '已分账',
    settlementStatus: '待发放',
    auditReason: `确认售后挽回分账：${operatorName}`,
    updatedAt: now,
  };
  writeRecoveryOrders(orders);
  return createSuccessResponse(orders[idx]);
}

async function resetRecoverySettlement(id: string, operatorName: string, reason?: string): Promise<ApiResponse<RecoveryOrder | null>> {
  ensureInit();
  await delay(160);
  const orders = readRecoveryOrders();
  const idx = orders.findIndex((item) => item.id === id);
  if (idx === -1) return createSuccessResponse(null);
  const order = orders[idx];
  if ((order.settlementStatus || '未分账') !== '待确认') return createErrorResponse('只有待确认的售后挽回分账才能删除');

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
    settlementStatus: '待处理',
    commissionIds: [],
    auditReason: reason?.trim() ? `删除售后挽回分账：${reason.trim()} · ${operatorName}` : `删除售后挽回分账：${operatorName}`,
    updatedAt: now,
  };
  writeRecoveryOrders(orders);
  return createSuccessResponse(orders[idx]);
}

async function cleanupDeletedSourceRecoverySettlement(
  id: string,
  operatorName: string,
  reason?: string,
): Promise<ApiResponse<boolean>> {
  ensureInit();
  await delay(160);
  const normalizedReason = String(reason || '').trim();
  if (!normalizedReason) return createErrorResponse('清理废弃分账必须填写原因');

  const orders = readRecoveryOrders();
  const target = orders.find((item) => item.id === id);
  if (!target) return createSuccessResponse(true);
  if (!target.deletedAt) return createErrorResponse('源售后挽回订单仍存在，不能作为废弃分账清理');

  const commissionIds = new Set(target.commissionIds || []);
  const commissions = readCommissions();
  const relatedCommissions = commissions.filter((commission) => (
    commissionIds.has(commission.id)
    || commission.sourceRecoveryOrderId === target.id
    || commission.orderId === target.id
    || commission.orderNo === target.recoveryNo
  ));
  const locked = relatedCommissions.find((commission) => (
    commission.status === '已发放'
    || commission.status === '待冲销'
    || commission.status === '已冲销'
  ));
  if (locked) {
    return createErrorResponse('已发放的分账不能清理；第一版不支持系统内冲销，请财务线下处理。');
  }

  writeCommissions(commissions.filter((commission) => (
    !commissionIds.has(commission.id)
    && commission.sourceRecoveryOrderId !== target.id
    && commission.orderId !== target.id
    && commission.orderNo !== target.recoveryNo
  )));
  writeRecoveryOrders(orders.filter((item) => item.id !== id));
  void operatorName;
  return createSuccessResponse(true);
}

async function withdrawRecoverySettlement(id: string, reason: string, operatorName: string): Promise<ApiResponse<RecoveryOrder | null>> {
  ensureInit();
  await delay(140);
  const normalizedReason = reason.trim();
  if (!normalizedReason) return createErrorResponse('请填写撤回原因');
  const orders = readRecoveryOrders();
  const idx = orders.findIndex((item) => item.id === id);
  if (idx === -1) return createSuccessResponse(null);
  const order = orders[idx];
  if (!['待确认', '待发放'].includes(order.settlementStatus || '未分账')) {
    return createErrorResponse('只有待确认或待发放的售后挽回分账可以撤回');
  }
  const commissionIds = new Set(order.commissionIds || []);
  const now = nowIso();
  const commissions = readCommissions();
  let changed = false;
  const nextCommissions = commissions.map((commission) => {
    if (!commissionIds.has(commission.id) && commission.sourceRecoveryOrderId !== order.id) return commission;
    if (commission.status === '已撤回') return commission;
    changed = true;
    return {
      ...commission,
      status: '已撤回' as const,
      auditReason: `售后挽回分账撤回：${normalizedReason}`,
      adjustedBy: operatorName,
      adjustedAt: now,
      updatedAt: now,
    };
  });
  if (!changed) return createErrorResponse('该售后挽回订单没有可撤回提成');
  writeCommissions(nextCommissions);
  orders[idx] = {
    ...order,
    status: '已分账',
    settlementStatus: '已撤回',
    auditReason: normalizedReason,
    updatedAt: now,
  };
  writeRecoveryOrders(orders);
  return createSuccessResponse(orders[idx]);
}

export const recoveryOrderApi = {
  fetchRecoveryOrders,
  fetchRecoveryOrderById,
  fetchRecoveryOrderStats,
  fetchRecoverySettlementCounts,
  createRecoveryOrder,
  updateRecoveryOrder,
  deleteRecoveryOrder,
  approveRecoveryOrder,
  returnRecoveryOrder,
  rejectRecoveryOrder,
  settleRecoveryOrder,
  confirmRecoverySettlement,
  resetRecoverySettlement,
  cleanupDeletedSourceRecoverySettlement,
  withdrawRecoverySettlement,
};
