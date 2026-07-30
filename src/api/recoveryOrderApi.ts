import { v4 as uuidv4 } from 'uuid';
import type { ApiResponse, PaginatedResponse } from './types';
import { createErrorResponse, createSuccessResponse, delay } from './types';
import { backendRequest, shouldUseBackendApi, syncBackendStorageScopeFromServer } from './backendClient';
import { initializeMockData } from './mock';
import { getStorageData, setStorageCacheData, setStorageData } from './mock/storage';
import { STORAGE_KEYS, DEFAULT_PAGE_SIZE } from '../shared/utils/constants';
import { AUTH_SESSION_STORAGE_KEY } from '../shared/utils/auth';
import { getCurrentOperatorName } from '../shared/utils/currentOperator';
import { getCurrentDataVisibilityScope } from '../shared/utils/dataVisibility';
import { isSuperAdminUser, PERMISSION_KEYS, normalizePermissionKey, roleHasPermission } from '../shared/utils/permissions';
import { normalizeUserRoleName } from '../shared/utils/roles';
import {
  isInactiveRecoveryCommissionStatus,
  isRecoveryCommissionRelatedToOrder,
  isRecoveryOrderDeletionLocked,
} from '../shared/utils/recoveryOrderDeletion';
import type { AuthSession } from '../types/auth';
import type {
  Commission,
  CommissionCorrectionPreview,
  CommissionPayoutCorrectionContext,
  CommissionPayoutPlan,
} from '../types/commission';
import { buildCommissionPayoutPlanSnapshot } from '../shared/utils/commissionConfiguration';
import type { Department } from '../types/department';
import type { Role } from '../types/role';
import type { User } from '../types/settings';
import type {
  RecoveryOrder,
  RecoveryOrderCorrectionInput,
  RecoveryOrderCorrectionPrecheck,
  RecoveryOrderFilters,
  RecoveryOrderInput,
  RecoveryOrderMetadataEditInput,
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

function appendLocalRecoveryReview(
  order: RecoveryOrder,
  auditorId: string,
  auditorName: string,
  changedAt: string,
  summary: string,
  reason?: string,
): NonNullable<RecoveryOrder['changeHistory']> {
  const normalizedReason = reason?.trim();
  return [{
    id: `rch-${uuidv4().slice(0, 16)}`,
    action: 'review',
    operatorId: auditorId,
    operator: auditorName,
    changedAt,
    ...(normalizedReason ? { reason: normalizedReason } : {}),
    summary,
  }, ...(order.changeHistory || [])];
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
  const rawStatus = String(order.status || '');
  const rawSettlementStatus = String(order.settlementStatus || '');
  const settlementStatus = rawSettlementStatus === '待分账'
    ? '待处理'
    : rawSettlementStatus === '已分账'
      ? '待发放'
      : order.settlementStatus
        || (rawStatus === '已生成提成' || rawStatus === '已分账'
          ? '待发放'
          : rawStatus === '审核通过' || rawStatus === '待分账'
            ? '待处理'
            : '未分账');
  const status = ['已生成提成', '待分账', '已分账'].includes(rawStatus)
    ? '审核通过'
    : order.status;
  return {
    ...order,
    status: status as RecoveryOrder['status'],
    settlementStatus: settlementStatus as RecoveryOrderSettlementStatus,
  };
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

function isCurrentSessionSuperAdmin(): boolean {
  const user = getCurrentSessionUser();
  if (!user) return false;
  return isSuperAdminUser(user, getStorageData<Role[]>(STORAGE_KEYS.ROLES) || []);
}

function canViewRecoveryOrder(order: RecoveryOrder, scopeDomain: NonNullable<RecoveryOrderFilters['scopeDomain']> = 'recoveryOrders'): boolean {
  const scope = getCurrentDataVisibilityScope(scopeDomain);
  if (scope.unrestricted) return true;
  return [
    [order.createdBy, order.createdByName],
    [order.recoveryUserId, order.recoveryUserName],
    [order.assistUserId, order.assistUserName],
  ].some(([userId, userName]) => (
    userId
      ? scope.visibleUserIds.includes(userId)
      : Boolean(userName && scope.visibleUserNames.includes(userName))
  ));
}

function canResubmitReturnedRecoveryOrder(order: RecoveryOrder): boolean {
  if (order.status !== '退回修改') return false;
  const user = getCurrentSessionUser();
  if (!user) return false;
  return order.createdBy === user.id
    && canUseRecoveryPermission(PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE, 'write');
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
  if (scopeDomain === 'recoveryOrderApplications') {
    items = items.filter((item) => !item.reviewCleanedAt);
  }
  const financeSettlementStatuses = ['待处理', '待确认', '待发放', '已发放', '已撤回'];
  const hasExplicitFinanceSettlementFilter = Boolean(
    filters.settlementStatuses?.some((status) => financeSettlementStatuses.includes(status))
    || (filters.settlementStatus
      && filters.settlementStatus !== '全部'
      && financeSettlementStatuses.includes(filters.settlementStatus)),
  );
  if (hasExplicitFinanceSettlementFilter) {
    items = items.filter((item) => !item.settlementCleanedAt);
  }
  const canIncludeDeleted = scopeDomain === 'recoveryOrderApplications'
    || (canUseRecoveryPermission(PERMISSION_KEYS.FINANCE_RECOVERY_SETTLEMENT, 'read')
      && hasExplicitFinanceSettlementFilter);
  if (!filters.includeDeleted || !canIncludeDeleted) {
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
  if (filters.importBatchId) {
    items = items.filter((item) => item.importBatchId === filters.importBatchId);
  }
  if (filters.recoveryUserId) {
    items = items.filter((item) => item.recoveryUserId === filters.recoveryUserId);
  }
  if (filters.recoveryStartDate) {
    items = items.filter((item) => (item.recoveryAt || item.createdAt) >= filters.recoveryStartDate!);
  }
  if (filters.recoveryEndDate) {
    const recoveryEndDate = filters.recoveryEndDate.length === 10
      ? `${filters.recoveryEndDate}T23:59:59.999Z`
      : filters.recoveryEndDate;
    items = items.filter((item) => (item.recoveryAt || item.createdAt) <= recoveryEndDate);
  }
  const sortDirection = filters.sortDirection === 'asc' ? 1 : -1;
  items.sort((a, b) => {
    const aValue = filters.sortBy === 'recoveryAt'
      ? (a.recoveryAt || a.createdAt)
      : filters.sortBy === 'createdAt' ? a.createdAt : (a.updatedAt || a.createdAt);
    const bValue = filters.sortBy === 'recoveryAt'
      ? (b.recoveryAt || b.createdAt)
      : filters.sortBy === 'createdAt' ? b.createdAt : (b.updatedAt || b.createdAt);
    return sortDirection * (new Date(aValue).getTime() - new Date(bValue).getTime());
  });
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
    .find((item) => (
      item.id === id
      && (!item.deletedAt || scopeDomain === 'recoveryOrderApplications')
      && (scopeDomain !== 'recoveryOrderApplications' || !item.reviewCleanedAt)
    ));
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
    approved: items.filter((item) => item.status === '审核通过').length,
    rejected: items.filter((item) => item.status === '审核驳回').length,
    waitingSettlement: items.filter((item) => (item.settlementStatus || '未分账') === '待处理').length,
    settled: items.filter((item) => ['待确认', '待发放'].includes(item.settlementStatus || '未分账')).length,
    generatedCommissionAmount: commissions
      .filter((commission) => commissionIds.has(commission.id))
      .reduce((sum, commission) => sum + Number(commission.commissionAmount || 0), 0),
  });
}

async function fetchRecoverySettlementCounts(
  filters: Pick<RecoveryOrderFilters, 'search' | 'includeDeleted' | 'recoveryStartDate' | 'recoveryEndDate' | 'recoveryUserId'> = {},
): Promise<ApiResponse<RecoverySettlementCounts>> {
  if (shouldUseBackendApi()) {
    const params = new URLSearchParams();
    if (filters.search) params.set('search', filters.search);
    if (filters.includeDeleted) params.set('includeDeleted', 'true');
    if (filters.recoveryStartDate) params.set('recoveryStartDate', filters.recoveryStartDate);
    if (filters.recoveryEndDate) params.set('recoveryEndDate', filters.recoveryEndDate);
    if (filters.recoveryUserId) params.set('recoveryUserId', filters.recoveryUserId);
    return backendRequest<RecoverySettlementCounts>(
      `/recovery-orders/settlement-counts${params.size ? `?${params.toString()}` : ''}`,
    );
  }
  let items = filterVisibleRecoveryOrders(readRecoveryOrders(), 'recoveryOrders')
    .filter((item) => !item.settlementCleanedAt)
    .filter((item) => filters.includeDeleted || !item.deletedAt)
    .filter((item) => !filters.search || [item.recoveryNo, item.customerName, item.thirdPartyOrderNo]
      .some((value) => normalizeText(value).includes(normalizeText(filters.search))));
  if (filters.recoveryStartDate) {
    items = items.filter((item) => (item.recoveryAt || item.createdAt) >= filters.recoveryStartDate!);
  }
  if (filters.recoveryEndDate) {
    const recoveryEndDate = filters.recoveryEndDate.length === 10
      ? `${filters.recoveryEndDate}T23:59:59.999Z`
      : filters.recoveryEndDate;
    items = items.filter((item) => (item.recoveryAt || item.createdAt) <= recoveryEndDate);
  }
  if (filters.recoveryUserId) items = items.filter((item) => item.recoveryUserId === filters.recoveryUserId);
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
  const creator = getCurrentSessionUser();
  const next: RecoveryOrder = {
    ...data,
    createdBy: creator?.id || '',
    createdByName: creator?.name || '',
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
    originalProductId: data.originalProductId,
    originalProductLevel: data.originalProductLevel,
    officialPaymentChannel: data.officialPaymentChannel,
    paymentOrderNo: data.paymentOrderNo?.trim() || undefined,
    paymentAt: data.paymentAt ? normalizeRecoveryTime(data.paymentAt, now) : undefined,
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
  const canEdit = canUseRecoveryPermission(PERMISSION_KEYS.AFTER_SALES_RECOVERY_EDIT, 'write');
  const canCreate = canUseRecoveryPermission(PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE, 'write');
  if (!canEdit && !canCreate) {
    return createErrorResponse('无权编辑售后挽回订单', 403);
  }
  if (!data.customerName.trim()) return createErrorResponse('请填写客户姓名');
  if (!data.thirdPartyOrderNo.trim()) return createErrorResponse('请填写第三方平台订单号');
  if (!data.originalProduct.trim()) return createErrorResponse('请填写原购买产品');
  if (Number(data.recoveryAmount) <= 0) return createErrorResponse('挽回成交金额必须大于 0');

  const orders = readRecoveryOrders();
  const idx = orders.findIndex((item) => item.id === id);
  if (idx === -1) return createSuccessResponse(null);
  const current = orders[idx];
  if (current.status === '审核驳回') {
    return createErrorResponse('审核驳回的售后挽回订单已终止，不能修改或重新提交；如需重新办理请新建申请', 409);
  }
  if (!['待审核', '退回修改'].includes(current.status)) {
    return createErrorResponse('审核通过后的记录请使用“编辑资料”或“挽回单更正”', 409);
  }
  const isReturnedForChanges = current.status === '退回修改';
  if (isReturnedForChanges && !canResubmitReturnedRecoveryOrder(current)) {
    return createErrorResponse('只有原创建人可以修改并重新提交退回修改的挽回单', 403);
  }
  if (!isReturnedForChanges && !canEdit) {
    return createErrorResponse('无权编辑售后挽回订单', 403);
  }
  if (['待确认', '待发放', '已发放', '已撤回'].includes(current.settlementStatus || '未分账')) {
    return createErrorResponse('已分账的售后挽回订单不能修改');
  }
  if (orders.some((item) => item.id !== id && item.thirdPartyOrderNo === data.thirdPartyOrderNo.trim())) {
    return createErrorResponse('该第三方平台订单号已经创建过售后挽回订单');
  }

  const now = nowIso();
  const recoveryUser = getUsers().find((item) => item.id === data.recoveryUserId);
  const assistUser = data.assistUserId ? getUsers().find((item) => item.id === data.assistUserId) : undefined;
  const nextStatus: RecoveryOrder['status'] = current.status === '退回修改'
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
    originalProductId: data.originalProductId || current.originalProductId,
    originalProductLevel: data.originalProductLevel || current.originalProductLevel,
    originalAmount: Number(data.originalAmount) || 0,
    recoveryAmount: Number(data.recoveryAmount) || 0,
    recoveryAt: normalizeRecoveryTime(data.recoveryAt, current.recoveryAt || current.createdAt),
    officialPaymentChannel: data.officialPaymentChannel,
    paymentOrderNo: data.paymentOrderNo?.trim() || undefined,
    paymentAt: data.paymentAt ? normalizeRecoveryTime(data.paymentAt, current.paymentAt || current.createdAt) : undefined,
    paymentVoucher: data.paymentVoucher ?? current.paymentVoucher,
    paymentVoucherName: data.paymentVoucherName ?? current.paymentVoucherName,
    paymentVoucherPreview: data.paymentVoucherPreview ?? current.paymentVoucherPreview,
    chatEvidence: data.chatEvidence ?? current.chatEvidence,
    chatEvidenceName: data.chatEvidenceName ?? current.chatEvidenceName,
    chatEvidencePreview: data.chatEvidencePreview ?? current.chatEvidencePreview,
    recoveryAttachments: data.recoveryAttachments ?? current.recoveryAttachments,
    paymentAttachments: data.recoveryAttachments !== undefined ? undefined : (data.paymentAttachments ?? current.paymentAttachments),
    chatAttachments: data.recoveryAttachments !== undefined ? undefined : (data.chatAttachments ?? current.chatAttachments),
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

async function editRecoveryOrderMetadata(
  id: string,
  data: RecoveryOrderMetadataEditInput,
): Promise<ApiResponse<RecoveryOrder | null>> {
  if (!shouldUseBackendApi()) return createErrorResponse('售后挽回资料编辑仅支持服务端模式', 503);
  const response = await backendRequest<RecoveryOrder | null>(`/recovery-orders/${encodeURIComponent(id)}/metadata`, {
    method: 'PATCH',
    body: JSON.stringify({ data }),
  });
  if (response.code !== 0) return createErrorResponse(response.message, response.code);
  return createSuccessResponse(response.data ? cacheBackendRecoveryOrder(response.data) : null, response.message);
}

async function precheckRecoveryOrderCorrection(
  id: string,
  payoutContext?: CommissionPayoutCorrectionContext,
): Promise<ApiResponse<RecoveryOrderCorrectionPrecheck | null>> {
  if (!shouldUseBackendApi()) return createErrorResponse('售后挽回订单更正预检仅支持服务端模式', 503);
  const params = new URLSearchParams();
  if (payoutContext?.payoutRecordId) params.set('payoutRecordId', payoutContext.payoutRecordId);
  if (payoutContext?.commissionId) params.set('commissionId', payoutContext.commissionId);
  const query = params.size ? `?${params.toString()}` : '';
  return backendRequest<RecoveryOrderCorrectionPrecheck>(`/recovery-orders/${encodeURIComponent(id)}/correction-precheck${query}`);
}

async function correctRecoveryOrder(
  id: string,
  input: RecoveryOrderCorrectionInput,
): Promise<ApiResponse<RecoveryOrder | null>> {
  if (!shouldUseBackendApi()) return createErrorResponse('售后挽回订单更正仅支持服务端模式', 503);
  const response = await backendRequest<RecoveryOrder | null>(`/recovery-orders/${encodeURIComponent(id)}/correct`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (response.code !== 0) return createErrorResponse(response.message, response.code);
  return createSuccessResponse(response.data ? cacheBackendRecoveryOrder(response.data) : null, response.message);
}

async function previewRecoveryOrderCorrection(
  id: string,
  input: RecoveryOrderCorrectionInput,
): Promise<ApiResponse<CommissionCorrectionPreview | null>> {
  if (!shouldUseBackendApi()) return createErrorResponse('售后挽回订单更正影响预览仅支持服务端模式', 503);
  const response = await backendRequest<CommissionCorrectionPreview | null>(`/recovery-orders/${encodeURIComponent(id)}/correction-preview`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (response.code !== 0 || !response.data) {
    return createErrorResponse(response.message || '服务端未返回售后挽回更正影响预览', response.code || -1);
  }
  return createSuccessResponse(response.data, response.message);
}

async function deleteRecoveryOrder(id: string): Promise<ApiResponse<boolean>> {
  if (shouldUseBackendApi()) {
    const response = await backendRequest<RecoveryOrder | null>(`/recovery-orders/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason: '售后挽回订单删除' }),
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
  const commissionIds = new Set(target.commissionIds || []);
  const relatedCommissionStatuses = readCommissions()
    .filter((commission) => isRecoveryCommissionRelatedToOrder(target.id, commissionIds, commission))
    .map((commission) => commission.status);
  if (relatedCommissionStatuses.some((status) => !isInactiveRecoveryCommissionStatus(status))) {
    return createErrorResponse('该售后挽回订单仍有活动提成，请先在财务中心处理', 409);
  }
  if (isRecoveryOrderDeletionLocked(target)) {
    return createErrorResponse('该售后挽回订单仍有活动分账，请先在财务中心处理', 409);
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

async function cleanupDeletedRecoveryOrderReview(id: string, reason: string): Promise<ApiResponse<RecoveryOrder | null>> {
  if (shouldUseBackendApi()) {
    const response = await backendRequest<RecoveryOrder | null>(`/recovery-orders/${encodeURIComponent(id)}/cleanup-review`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    if (response.code !== 0 || !response.data) {
      return createErrorResponse(response.message || '服务端未返回清理结果', response.code || -1);
    }
    return createSuccessResponse(cacheBackendRecoveryOrder(response.data), response.message);
  }

  ensureInit();
  await delay(120);
  if (!isCurrentSessionSuperAdmin()) return createErrorResponse('仅超级管理员可以清理售后审核记录', 403);
  const cleanReason = reason.trim();
  if (!cleanReason) return createErrorResponse('清理售后审核记录必须填写原因', 400);
  const orders = readRecoveryOrders();
  const index = orders.findIndex((item) => item.id === id);
  if (index === -1) return createErrorResponse('售后挽回订单不存在', 404);
  if (orders[index].reviewCleanedAt) return createSuccessResponse(orders[index]);
  if (orders[index].status !== '审核驳回' && !orders[index].deletedAt) {
    return createErrorResponse('只有已驳回，或业务单已经删除的售后审核记录可以清理', 409);
  }
  const cleanedAt = nowIso();
  orders[index] = {
    ...orders[index],
    reviewCleanedAt: cleanedAt,
    reviewCleanedBy: getCurrentOperatorName('超级管理员'),
    reviewCleanupReason: cleanReason,
    updatedAt: cleanedAt,
  };
  writeRecoveryOrders(orders);
  return createSuccessResponse(orders[index]);
}

async function cleanupDeletedRecoverySettlement(id: string, reason: string): Promise<ApiResponse<RecoveryOrder | null>> {
  if (shouldUseBackendApi()) {
    const response = await backendRequest<RecoveryOrder | null>(`/recovery-orders/${encodeURIComponent(id)}/cleanup-settlement`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    if (response.code !== 0 || !response.data) {
      return createErrorResponse(response.message || '服务端未返回清理结果', response.code || -1);
    }
    return createSuccessResponse(cacheBackendRecoveryOrder(response.data), response.message);
  }

  ensureInit();
  await delay(120);
  if (!isCurrentSessionSuperAdmin()) return createErrorResponse('仅超级管理员可以清理废弃售后挽回分账', 403);
  const cleanReason = reason.trim();
  if (!cleanReason) return createErrorResponse('清理废弃售后挽回分账必须填写原因', 400);
  const orders = readRecoveryOrders();
  const index = orders.findIndex((item) => item.id === id);
  if (index === -1) return createErrorResponse('售后挽回订单不存在', 404);
  if (!orders[index].deletedAt) return createErrorResponse('只有源售后挽回订单已删除的分账记录可以清理', 409);
  if (orders[index].settlementCleanedAt) return createSuccessResponse(orders[index]);
  const commissionIds = new Set(orders[index].commissionIds || []);
  const hasActiveCommission = readCommissions().some((commission) => (
    isRecoveryCommissionRelatedToOrder(orders[index].id, commissionIds, commission)
    && !isInactiveRecoveryCommissionStatus(commission.status)
  ));
  if (hasActiveCommission) return createErrorResponse('该废弃分账仍有活动提成，请先撤回或完成财务处理', 409);
  const cleanedAt = nowIso();
  orders[index] = {
    ...orders[index],
    settlementCleanedAt: cleanedAt,
    settlementCleanedById: getCurrentSessionUser()?.id,
    settlementCleanedBy: getCurrentOperatorName('超级管理员'),
    settlementCleanupReason: cleanReason,
    updatedAt: cleanedAt,
  };
  writeRecoveryOrders(orders);
  return createSuccessResponse(orders[index]);
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
  const current = orders[idx];
  if (current.status === '审核通过') return createSuccessResponse(current);
  if (current.status !== '待审核') return createErrorResponse('只有待审核售后挽回订单可以执行该操作', 409);
  const now = nowIso();
  orders[idx] = {
    ...current,
    status: '审核通过',
    settlementStatus: '待处理',
    auditorId,
    auditorName,
    auditedAt: now,
    changeHistory: appendLocalRecoveryReview(
      current,
      auditorId,
      auditorName,
      now,
      '审核通过售后挽回订单',
    ),
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
  const normalizedReason = reason.trim();
  if (!normalizedReason) return createErrorResponse('请填写退回修改原因');
  const current = orders[idx];
  if (current.status === '退回修改' && current.auditReason === normalizedReason) return createSuccessResponse(current);
  if (current.status !== '待审核') return createErrorResponse('只有待审核售后挽回订单可以执行该操作', 409);
  const now = nowIso();
  orders[idx] = {
    ...current,
    status: '退回修改',
    settlementStatus: '未分账',
    auditorId,
    auditorName,
    auditReason: normalizedReason,
    auditedAt: now,
    changeHistory: appendLocalRecoveryReview(
      current,
      auditorId,
      auditorName,
      now,
      '退回售后挽回订单修改',
      normalizedReason,
    ),
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
  const normalizedReason = reason.trim();
  if (!normalizedReason) return createErrorResponse('请填写驳回原因');
  const current = orders[idx];
  if (current.status === '审核驳回' && current.auditReason === normalizedReason) return createSuccessResponse(current);
  if (current.status !== '待审核') return createErrorResponse('只有待审核售后挽回订单可以执行该操作', 409);
  const now = nowIso();
  orders[idx] = {
    ...current,
    status: '审核驳回',
    settlementStatus: '未分账',
    auditorId,
    auditorName,
    auditReason: normalizedReason,
    auditedAt: now,
    changeHistory: appendLocalRecoveryReview(
      current,
      auditorId,
      auditorName,
      now,
      '驳回售后挽回订单',
      normalizedReason,
    ),
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
  const amount = calculationType === 'tiered_percentage'
    ? 0
    : calculationType === 'percentage'
      ? roundMoney(performanceAmount * commissionRate)
      : roundMoney(input.commissionAmount);
  if (amount < 0) return createErrorResponse('提成金额不能小于 0');
  const payoutPlanName = input.payoutPlanName || plan?.name || '自定义金额';
  const payoutPlanSnapshot = input.payoutPlanSnapshot || (plan ? buildCommissionPayoutPlanSnapshot(plan) : undefined);
  const formulaText = calculationType === 'tiered_percentage'
    ? `${payoutPlanName}：按挽回人员与方案版本汇总月度挽回业绩后计算`
    : calculationType === 'percentage'
      ? `${payoutPlanName}：挽回金额 ${performanceAmount} × ${roundMoney(commissionRate * 100)}% = ${amount} 元`
      : `${payoutPlanName}：售后挽回提成 ${amount} 元`;
  return createSuccessResponse({
    id: `comm-${uuidv4().slice(0, 8)}`,
    orderId: order.id,
    orderNo: order.recoveryNo,
    customerName: order.customerName,
    productLevel: order.originalProductLevel || order.originalProduct,
    orderAmount: order.recoveryAmount,
    performanceAmount,
    commissionRate,
    commissionAmount: amount,
    scene: '售后挽回',
    proofStatus: order.recoveryAttachments?.length || order.paymentAttachments?.length || order.chatAttachments?.length
      || order.paymentVoucher || order.paymentVoucherName || order.chatEvidence || order.chatEvidenceName ? '已上传' : '待补充',
    formulaText,
    calculationNote: input.calculationNote || `售后挽回订单 ${order.recoveryNo} 财务分账：${operatorName}`,
    role: input.role,
    roleId: input.roleId,
    roleCode: input.roleCode,
    roleNameSnapshot: input.roleNameSnapshot || input.role,
    owner: user.name,
    ownerId: user.id,
    department: department?.name || '',
    departmentId: department?.id || user.departmentId,
    paymentDate: order.recoveryAt || now,
    status: '待确认',
    sourceType: '人工新增',
    commissionType: 'recovery',
    payoutPlanId: input.payoutPlanId,
    payoutPlanName,
    payoutPlanVersion: input.payoutPlanVersion || payoutPlanSnapshot?.version,
    payoutPlanSnapshot,
    ruleCalculationType: calculationType,
    tierSnapshot: calculationType === 'tiered_percentage'
      ? (input.tierSnapshot || (payoutPlanSnapshot?.tiers?.length
        ? { tiers: payoutPlanSnapshot.tiers, baseAmount: performanceAmount, gapToNext: 0 }
        : undefined))
      : undefined,
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
  if (shouldUseBackendApi()) {
    const response = await backendRequest<RecoveryOrder | null>(`/recovery-orders/${encodeURIComponent(id)}/settle`, {
      method: 'POST',
      body: JSON.stringify({ rows, reason }),
    });
    if (response.code !== 0) return createErrorResponse(response.message, response.code);
    await syncBackendStorageScopeFromServer('commissions', 0);
    return createSuccessResponse(response.data ? cacheBackendRecoveryOrder(response.data) : null, response.message);
  }

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
  if (!['审核通过', '待分账', '已分账'].includes(order.status)) return createErrorResponse('只有审核通过的售后挽回订单才能分账');

  const now = nowIso();
  const commissions = readCommissions();
  const existingIds = new Set(order.commissionIds || []);
  const relatedCommissions = commissions.filter((commission) => (
    existingIds.has(commission.id) || commission.sourceRecoveryOrderId === order.id
  ));
  const activeRelatedCommissions = relatedCommissions.filter((commission) => (
    !isInactiveRecoveryCommissionStatus(commission.status)
  ));
  const lockedCommission = activeRelatedCommissions.find((commission) => commission.status !== '待确认');
  if (lockedCommission) return createErrorResponse('该售后挽回分账已进入发放链路，不能直接调整');
  const maxHistoricalVersion = Math.max(0, ...relatedCommissions.map((commission) => commission.settlementVersion || 1));
  const settlementVersion = order.settlementVersion
    || (activeRelatedCommissions.length
      ? Math.max(1, ...activeRelatedCommissions.map((commission) => commission.settlementVersion || 1))
      : Math.max(1, maxHistoricalVersion + (relatedCommissions.length ? 1 : 0)));
  const settlementRoundId = order.settlementRoundId || `recovery-settlement-${order.id}-v${settlementVersion}`;
  const orderForSettlement = { ...order, settlementVersion, settlementRoundId };
  const built: Commission[] = [];
  for (const row of rows) {
    if (!row.role) return createErrorResponse('请选择提成角色');
    if (!row.ownerId) return createErrorResponse('请选择分账人员');
    const res = buildRecoveryCommission(orderForSettlement, row, operatorName, now);
    if (res.code !== 0) return createErrorResponse(res.message || '生成分账失败');
    built.push({ ...res.data, settlementVersion, settlementRoundId });
  }

  const remainingCommissions = commissions.filter((commission) => (
    (!existingIds.has(commission.id) && commission.sourceRecoveryOrderId !== order.id)
    || isInactiveRecoveryCommissionStatus(commission.status)
  ));
  writeCommissions([...built, ...remainingCommissions]);
  orders[idx] = {
    ...order,
    status: '审核通过',
    settlementStatus: '待确认',
    settlementHandledBy: operatorName,
    settlementHandledAt: now,
    settlementConfirmedBy: undefined,
    settlementConfirmedAt: undefined,
    settlementPaidAt: undefined,
    settlementWithdrawnBy: undefined,
    settlementWithdrawnAt: undefined,
    settlementWithdrawReason: undefined,
    settlementVersion,
    settlementRoundId,
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
  if (shouldUseBackendApi()) {
    const response = await backendRequest<RecoveryOrder | null>(`/recovery-orders/${encodeURIComponent(id)}/confirm-settlement`, {
      method: 'POST',
    });
    if (response.code !== 0) return createErrorResponse(response.message, response.code);
    await syncBackendStorageScopeFromServer('commissions', 0);
    return createSuccessResponse(response.data ? cacheBackendRecoveryOrder(response.data) : null, response.message);
  }

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
    status: '审核通过',
    settlementStatus: '待发放',
    settlementConfirmedBy: operatorName,
    settlementConfirmedAt: now,
    settlementWithdrawnBy: undefined,
    settlementWithdrawnAt: undefined,
    settlementWithdrawReason: undefined,
    auditReason: `确认售后挽回分账：${operatorName}`,
    updatedAt: now,
  };
  writeRecoveryOrders(orders);
  return createSuccessResponse(orders[idx]);
}

async function resetRecoverySettlement(id: string, operatorName: string, reason?: string): Promise<ApiResponse<RecoveryOrder | null>> {
  if (shouldUseBackendApi()) {
    const response = await backendRequest<RecoveryOrder | null>(`/recovery-orders/${encodeURIComponent(id)}/reset-settlement`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    if (response.code !== 0) return createErrorResponse(response.message, response.code);
    await syncBackendStorageScopeFromServer('commissions', 0);
    return createSuccessResponse(response.data ? cacheBackendRecoveryOrder(response.data) : null, response.message);
  }

  ensureInit();
  await delay(160);
  const orders = readRecoveryOrders();
  const idx = orders.findIndex((item) => item.id === id);
  if (idx === -1) return createSuccessResponse(null);
  const order = orders[idx];
  if ((order.settlementStatus || '未分账') !== '待确认') return createErrorResponse('只有待确认的售后挽回分账才能重置');

  const commissionIds = new Set(order.commissionIds || []);
  const commissions = readCommissions();
  writeCommissions(commissions.filter((commission) => (
    !commissionIds.has(commission.id)
    && commission.sourceRecoveryOrderId !== order.id
  )));

  const now = nowIso();
  orders[idx] = {
    ...order,
    status: '审核通过',
    settlementStatus: '待处理',
    settlementHandledBy: undefined,
    settlementHandledAt: undefined,
    settlementConfirmedBy: undefined,
    settlementConfirmedAt: undefined,
    settlementPaidAt: undefined,
    settlementWithdrawnBy: undefined,
    settlementWithdrawnAt: undefined,
    settlementWithdrawReason: undefined,
    commissionIds: [],
    auditReason: reason?.trim() ? `重置售后挽回分账：${reason.trim()} · ${operatorName}` : `重置售后挽回分账：${operatorName}`,
    updatedAt: now,
  };
  writeRecoveryOrders(orders);
  return createSuccessResponse(orders[idx]);
}

async function withdrawRecoverySettlement(id: string, reason: string, operatorName: string): Promise<ApiResponse<RecoveryOrder | null>> {
  if (shouldUseBackendApi()) {
    const response = await backendRequest<RecoveryOrder | null>(`/recovery-orders/${encodeURIComponent(id)}/withdraw-settlement`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    if (response.code !== 0) return createErrorResponse(response.message, response.code);
    await syncBackendStorageScopeFromServer('commissions', 0);
    return createSuccessResponse(response.data ? cacheBackendRecoveryOrder(response.data) : null, response.message);
  }

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
    status: '审核通过',
    settlementStatus: '已撤回',
    settlementWithdrawnBy: operatorName,
    settlementWithdrawnAt: now,
    settlementWithdrawReason: normalizedReason,
    auditReason: normalizedReason,
    updatedAt: now,
  };
  writeRecoveryOrders(orders);
  return createSuccessResponse(orders[idx]);
}

async function reopenRecoverySettlement(
  id: string,
  reason: string,
  operatorName: string,
): Promise<ApiResponse<RecoveryOrder | null>> {
  if (shouldUseBackendApi()) {
    const response = await backendRequest<RecoveryOrder | null>(`/recovery-orders/${encodeURIComponent(id)}/reopen-settlement`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    if (response.code !== 0) return createErrorResponse(response.message, response.code);
    await syncBackendStorageScopeFromServer('commissions', 0);
    return createSuccessResponse(response.data ? cacheBackendRecoveryOrder(response.data) : null, response.message);
  }
  ensureInit();
  await delay(120);
  const normalizedReason = reason.trim();
  if (!normalizedReason) return createErrorResponse('重新分账必须填写原因');
  const orders = readRecoveryOrders();
  const idx = orders.findIndex((item) => item.id === id);
  if (idx === -1) return createErrorResponse('售后挽回订单不存在', 404);
  const order = orders[idx];
  if (order.deletedAt) return createErrorResponse('源售后挽回订单已删除，不能重新分账');
  if ((order.settlementStatus || '未分账') !== '已撤回') return createErrorResponse('只有已撤回的售后挽回分账可以重新分账');
  const related = readCommissions().filter((commission) => (
    (order.commissionIds || []).includes(commission.id)
    || commission.sourceRecoveryOrderId === order.id
  ));
  if (!related.length || related.some((commission) => commission.status !== '已撤回')) {
    return createErrorResponse('该售后挽回订单仍有活动提成，不能重新分账');
  }
  const now = nowIso();
  const version = Math.max(1, ...related.map((commission) => commission.settlementVersion || 1)) + 1;
  orders[idx] = {
    ...order,
    status: '审核通过',
    settlementStatus: '待处理',
    settlementVersion: version,
    settlementRoundId: `recovery-settlement-${order.id}-v${version}`,
    commissionIds: [],
    settlementHandledBy: undefined,
    settlementHandledAt: undefined,
    settlementConfirmedBy: undefined,
    settlementConfirmedAt: undefined,
    settlementWithdrawnBy: undefined,
    settlementWithdrawnAt: undefined,
    settlementWithdrawReason: undefined,
    auditReason: `重新分账：${normalizedReason} · ${operatorName}`,
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
  editRecoveryOrderMetadata,
  precheckRecoveryOrderCorrection,
  previewRecoveryOrderCorrection,
  correctRecoveryOrder,
  deleteRecoveryOrder,
  cleanupDeletedRecoveryOrderReview,
  cleanupDeletedRecoverySettlement,
  approveRecoveryOrder,
  returnRecoveryOrder,
  rejectRecoveryOrder,
  settleRecoveryOrder,
  confirmRecoverySettlement,
  resetRecoverySettlement,
  withdrawRecoverySettlement,
  reopenRecoverySettlement,
};
