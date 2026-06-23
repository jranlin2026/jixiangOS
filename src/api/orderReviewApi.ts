import type {
  Order,
  OrderApplication,
  OrderApplicationFilters,
  OrderApplicationReviewLog,
  OrderApplicationStatus,
} from '../types/order';
import type { AuthSession } from '../types/auth';
import type { Customer } from '../types/customer';
import type { Role } from '../types/role';
import type { User } from '../types/settings';
import type { ApiResponse, PaginatedResponse } from './types';
import { createErrorResponse, createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { DEFAULT_PAGE_SIZE, STORAGE_KEYS, normalizeResourceOwnership } from '../shared/utils/constants';
import { AUTH_SESSION_STORAGE_KEY } from '../shared/utils/auth';
import { getCurrentDataVisibilityScope } from '../shared/utils/dataVisibility';
import { normalizeUserRoleName } from '../shared/utils/roles';
import { PERMISSION_KEYS, roleHasPermission } from '../shared/utils/permissions';
import { initializeMockData } from './mock';
import { orderApi } from './orderApi';
import { v4 as uuidv4 } from 'uuid';

const STATUS_PENDING_REVIEW: OrderApplicationStatus = '待财务审核';
const STATUS_RETURNED: OrderApplicationStatus = '退回修改';
const STATUS_APPROVED: OrderApplicationStatus = '已入库';
const STATUS_REJECTED: OrderApplicationStatus = '已驳回';

type OrderApplicationInput = Omit<Order, 'id' | 'createdAt' | 'updatedAt' | 'orderNo'>;

function ensureInit(): void {
  initializeMockData();
}

function readJson<T>(key: string): T | null {
  return getStorageData<T>(key);
}

function getCurrentSession(): AuthSession | null {
  return readJson<AuthSession>(AUTH_SESSION_STORAGE_KEY);
}

function getCurrentUser(): User | undefined {
  const session = getCurrentSession();
  if (!session?.userId) return undefined;
  const users = readJson<User[]>(STORAGE_KEYS.USERS) || [];
  return users.find((user) => user.id === session.userId && user.isActive);
}

function getRole(user?: User): Role | undefined {
  if (!user) return undefined;
  const roles = readJson<Role[]>(STORAGE_KEYS.ROLES) || [];
  const normalizedRole = normalizeUserRoleName(user.role);
  return roles.find((role) => role.isActive && (role.id === user.roleId || role.name === normalizedRole || role.name === user.role));
}

export function canReviewOrderApplications(): boolean {
  return roleHasPermission(getRole(getCurrentUser()), PERMISSION_KEYS.ORDER_REVIEW, 'read');
}

function getStoredApplications(): OrderApplication[] {
  return readJson<OrderApplication[]>(STORAGE_KEYS.ORDER_APPLICATIONS) || [];
}

function saveApplications(applications: OrderApplication[]): void {
  setStorageData(STORAGE_KEYS.ORDER_APPLICATIONS, applications);
}

function enrichOrderDataFromCustomer(data: OrderApplicationInput): OrderApplicationInput {
  if (!data.customerId) return data;
  const customers = readJson<Customer[]>(STORAGE_KEYS.CUSTOMERS) || [];
  const customer = customers.find((item) => item.id === data.customerId);
  if (!customer) return data;
  return {
    ...data,
    sourceType: customer.leadSource || data.sourceType,
    leadSource: customer.leadSource || data.leadSource,
    leadInputBy: customer.leadInputBy || data.leadInputBy,
    leadContributorId: customer.leadContributorId || data.leadContributorId,
    leadContributorName: customer.leadContributorName || data.leadContributorName,
    resourceOwnership: normalizeResourceOwnership(customer.sourceType || data.resourceOwnership || data.sourceType),
  };
}

function currentOperator(fallbackName?: string): { id?: string; name: string } {
  const user = getCurrentUser();
  return {
    id: user?.id,
    name: user?.name || fallbackName || '系统',
  };
}

function buildLog(action: OrderApplicationReviewLog['action'], reason?: string): OrderApplicationReviewLog {
  const operator = currentOperator();
  return {
    id: `oarl-${uuidv4().slice(0, 8)}`,
    action,
    operatorId: operator.id,
    operatorName: operator.name,
    reason,
    createdAt: new Date().toISOString(),
  };
}

function filterVisibleApplications(applications: OrderApplication[]): OrderApplication[] {
  const scope = getCurrentDataVisibilityScope('orderApplications');
  if (scope.unrestricted) return applications;
  return applications.filter((application) => (
    scope.visibleUserNames.includes(application.applicantName)
    || scope.visibleUserIds.includes(application.applicantId || '')
  ));
}

function canAccessApplication(application: OrderApplication): boolean {
  return filterVisibleApplications([application]).length > 0;
}

function applyFilters(applications: OrderApplication[], filters?: OrderApplicationFilters): OrderApplication[] {
  let filtered = [...applications];
  if (filters?.search) {
    const q = filters.search.trim().toLowerCase();
    filtered = filtered.filter((item) => (
      item.applicationNo.toLowerCase().includes(q)
      || item.orderNo?.toLowerCase().includes(q)
      || item.orderData.customerName.toLowerCase().includes(q)
      || item.applicantName.toLowerCase().includes(q)
    ));
  }
  if (filters?.status) filtered = filtered.filter((item) => item.status === filters.status);
  if (filters?.applicantName) filtered = filtered.filter((item) => item.applicantName === filters.applicantName);
  if (filters?.reviewerName) filtered = filtered.filter((item) => item.reviewerName === filters.reviewerName);
  if (filters?.startDate) filtered = filtered.filter((item) => item.submittedAt >= filters.startDate!);
  if (filters?.endDate) filtered = filtered.filter((item) => item.submittedAt <= filters.endDate!);
  return filtered.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

async function fetchOrderApplications(filters?: OrderApplicationFilters): Promise<ApiResponse<PaginatedResponse<OrderApplication>>> {
  ensureInit();
  await delay(120);
  const filtered = applyFilters(filterVisibleApplications(getStoredApplications()), filters);
  const page = filters?.page || 1;
  const pageSize = filters?.pageSize || DEFAULT_PAGE_SIZE;
  const total = filtered.length;
  const totalPages = Math.ceil(total / pageSize);
  const items = filtered.slice((page - 1) * pageSize, page * pageSize);
  return createSuccessResponse({ items, pagination: { page, pageSize, total, totalPages } });
}

async function fetchOrderApplicationById(id: string): Promise<ApiResponse<OrderApplication | null>> {
  ensureInit();
  await delay(100);
  return createSuccessResponse(filterVisibleApplications(getStoredApplications()).find((item) => item.id === id) || null);
}

async function submitOrderApplication(data: OrderApplicationInput): Promise<ApiResponse<OrderApplication>> {
  ensureInit();
  await delay(150);
  const applications = getStoredApplications();
  const now = new Date().toISOString();
  const operator = currentOperator(data.owner);
  const orderData = enrichOrderDataFromCustomer(data);
  const application: OrderApplication = {
    id: `oa-${uuidv4().slice(0, 8)}`,
    applicationNo: `OAPP-${now.slice(0, 10).replace(/-/g, '')}-${String(applications.length + 1).padStart(4, '0')}`,
    status: STATUS_PENDING_REVIEW,
    orderData,
    applicantId: operator.id,
    applicantName: operator.name,
    submittedAt: now,
    reviewLogs: [{
      id: `oarl-${uuidv4().slice(0, 8)}`,
      action: 'submit',
      operatorId: operator.id,
      operatorName: operator.name,
      createdAt: now,
    }],
    createdAt: now,
    updatedAt: now,
  };
  applications.unshift(application);
  saveApplications(applications);
  return createSuccessResponse(application);
}

async function updateReturnedOrderApplication(id: string, data: OrderApplicationInput): Promise<ApiResponse<OrderApplication | null>> {
  ensureInit();
  await delay(150);
  const applications = getStoredApplications();
  const idx = applications.findIndex((item) => item.id === id);
  if (idx === -1) return createSuccessResponse(null);
  if (applications[idx].status !== STATUS_RETURNED) return createErrorResponse('只有退回修改的订单申请可以重新提交');
  const visible = filterVisibleApplications([applications[idx]]);
  if (!visible.length) return createErrorResponse('无权操作该订单申请', 403);
  const now = new Date().toISOString();
  applications[idx] = {
    ...applications[idx],
    status: STATUS_PENDING_REVIEW,
    orderData: enrichOrderDataFromCustomer(data),
    reason: undefined,
    submittedAt: now,
    reviewedAt: undefined,
    reviewerId: undefined,
    reviewerName: undefined,
    reviewLogs: [buildLog('resubmit'), ...applications[idx].reviewLogs],
    updatedAt: now,
  };
  saveApplications(applications);
  return createSuccessResponse(applications[idx]);
}

async function approveOrderApplication(id: string): Promise<ApiResponse<OrderApplication | null>> {
  ensureInit();
  await delay(150);
  if (!canReviewOrderApplications()) return createErrorResponse('无权审核订单申请', 403);
  const applications = getStoredApplications();
  const idx = applications.findIndex((item) => item.id === id);
  if (idx === -1) return createSuccessResponse(null);
  if (!canAccessApplication(applications[idx])) return createErrorResponse('无权操作该订单申请', 403);
  if (applications[idx].status !== STATUS_PENDING_REVIEW) return createErrorResponse('只有待财务审核的订单申请可以入库');

  const orderData = enrichOrderDataFromCustomer(applications[idx].orderData);
  const created = await orderApi.createOrder(orderData);
  if (created.code !== 0) return createErrorResponse(created.message);

  const now = new Date().toISOString();
  const reviewer = currentOperator();
  applications[idx] = {
    ...applications[idx],
    status: STATUS_APPROVED,
    orderData,
    reviewerId: reviewer.id,
    reviewerName: reviewer.name,
    reviewedAt: now,
    orderId: created.data.id,
    orderNo: created.data.orderNo,
    reviewLogs: [buildLog('approve'), ...applications[idx].reviewLogs],
    updatedAt: now,
  };
  saveApplications(applications);
  return createSuccessResponse(applications[idx]);
}

async function returnOrderApplication(id: string, reason: string): Promise<ApiResponse<OrderApplication | null>> {
  ensureInit();
  await delay(120);
  if (!canReviewOrderApplications()) return createErrorResponse('无权退回订单申请', 403);
  const applications = getStoredApplications();
  const idx = applications.findIndex((item) => item.id === id);
  if (idx === -1) return createSuccessResponse(null);
  if (!canAccessApplication(applications[idx])) return createErrorResponse('无权操作该订单申请', 403);
  if (applications[idx].status !== STATUS_PENDING_REVIEW) return createErrorResponse('只有待财务审核的订单申请可以退回');
  const now = new Date().toISOString();
  const reviewer = currentOperator();
  applications[idx] = {
    ...applications[idx],
    status: STATUS_RETURNED,
    reviewerId: reviewer.id,
    reviewerName: reviewer.name,
    reviewedAt: now,
    reason,
    reviewLogs: [buildLog('return', reason), ...applications[idx].reviewLogs],
    updatedAt: now,
  };
  saveApplications(applications);
  return createSuccessResponse(applications[idx]);
}

async function rejectOrderApplication(id: string, reason: string): Promise<ApiResponse<OrderApplication | null>> {
  ensureInit();
  await delay(120);
  if (!canReviewOrderApplications()) return createErrorResponse('无权驳回订单申请', 403);
  const applications = getStoredApplications();
  const idx = applications.findIndex((item) => item.id === id);
  if (idx === -1) return createSuccessResponse(null);
  if (!canAccessApplication(applications[idx])) return createErrorResponse('无权操作该订单申请', 403);
  if (applications[idx].status !== STATUS_PENDING_REVIEW) return createErrorResponse('只有待财务审核的订单申请可以驳回');
  const now = new Date().toISOString();
  const reviewer = currentOperator();
  applications[idx] = {
    ...applications[idx],
    status: STATUS_REJECTED,
    reviewerId: reviewer.id,
    reviewerName: reviewer.name,
    reviewedAt: now,
    reason,
    reviewLogs: [buildLog('reject', reason), ...applications[idx].reviewLogs],
    updatedAt: now,
  };
  saveApplications(applications);
  return createSuccessResponse(applications[idx]);
}

export const ORDER_APPLICATION_STATUSES = {
  PENDING_REVIEW: STATUS_PENDING_REVIEW,
  RETURNED: STATUS_RETURNED,
  APPROVED: STATUS_APPROVED,
  REJECTED: STATUS_REJECTED,
} as const;

export const orderReviewApi = {
  fetchOrderApplications,
  fetchOrderApplicationById,
  submitOrderApplication,
  updateReturnedOrderApplication,
  approveOrderApplication,
  returnOrderApplication,
  rejectOrderApplication,
};
