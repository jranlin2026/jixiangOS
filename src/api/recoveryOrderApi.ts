import { v4 as uuidv4 } from 'uuid';
import type { ApiResponse, PaginatedResponse } from './types';
import { createErrorResponse, createSuccessResponse, delay } from './types';
import { initializeMockData } from './mock';
import { getStorageData, setStorageData } from './mock/storage';
import { LIFECYCLE_STATUS_CODES, STORAGE_KEYS, DEFAULT_PAGE_SIZE } from '../shared/utils/constants';
import type { Customer } from '../types/customer';
import type { Commission } from '../types/commission';
import type {
  RecoveryOrder,
  RecoveryOrderFilters,
  RecoveryOrderInput,
  RecoveryOrderStats,
} from '../types/recoveryOrder';

const RECOVERY_COMMISSION_RATE = 0.03;
const ASSIST_COMMISSION_RATE = 0.01;

function ensureInit(): void {
  initializeMockData();
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeText(value?: string): string {
  return String(value || '').trim().toLowerCase();
}

function readRecoveryOrders(): RecoveryOrder[] {
  return getStorageData<RecoveryOrder[]>(STORAGE_KEYS.RECOVERY_ORDERS) || [];
}

function writeRecoveryOrders(items: RecoveryOrder[]): void {
  setStorageData(STORAGE_KEYS.RECOVERY_ORDERS, items);
}

function findMatchedCustomer(data: RecoveryOrderInput): Customer | undefined {
  const phone = normalizeText(data.customerPhone);
  const wechat = normalizeText(data.customerWechat);
  if (!phone && !wechat) return undefined;
  const customers = getStorageData<Customer[]>(STORAGE_KEYS.CUSTOMERS) || [];
  return customers.find((customer) => (
    Boolean(phone && normalizeText(customer.phone) === phone)
    || Boolean(wechat && normalizeText(customer.wechat) === wechat)
  ));
}

function createTemporaryCustomer(data: RecoveryOrderInput, now: string): Customer {
  const customers = getStorageData<Customer[]>(STORAGE_KEYS.CUSTOMERS) || [];
  const customer: Customer = {
    id: `cust-temp-${uuidv4().slice(0, 8)}`,
    name: data.customerName.trim(),
    company: data.customerName.trim() || '售后临时客户',
    phone: data.customerPhone || '',
    wechat: data.customerWechat,
    customerLevel: 'L1',
    lifecycleStatusCode: LIFECYCLE_STATUS_CODES.REFUNDED,
    lifecycleStatusUpdatedAt: now,
    owner: data.createdByName,
    ownerSince: now,
    totalSpent: 0,
    orderCount: 0,
    growthPath: [],
    growthRecords: [],
    activityRecords: [{
      id: `act-${uuidv4().slice(0, 8)}`,
      type: 'refund',
      title: '售后临时客户',
      content: `由退款挽回单自动创建，第三方订单号：${data.thirdPartyOrderNo}`,
      operator: data.createdByName,
      createdAt: now,
    }],
    tags: ['售后临时客户'],
    sourceType: '售后临时客户',
    remark: '仅用于退款挽回单关联，售后不开放客户列表查看。',
    createdAt: now,
    updatedAt: now,
  };
  setStorageData(STORAGE_KEYS.CUSTOMERS, [customer, ...customers]);
  return customer;
}

function resolveCustomerForRecoveryOrder(data: RecoveryOrderInput, now: string): {
  customer: Customer;
  matchStatus: RecoveryOrder['customerMatchStatus'];
} {
  const matched = findMatchedCustomer(data);
  if (matched) return { customer: matched, matchStatus: '已绑定客户' };
  return { customer: createTemporaryCustomer(data, now), matchStatus: '售后临时客户' };
}

function createCommissionFromRecoveryOrder(order: RecoveryOrder, operatorName: string): Commission[] {
  const commissions = getStorageData<Commission[]>(STORAGE_KEYS.COMMISSIONS) || [];
  const exists = commissions.filter((commission) => commission.sourceRecoveryOrderId === order.id);
  if (exists.length) return exists;

  const now = nowIso();
  const baseAmount = Number(order.recoveryAmount || 0);
  const primaryAmount = Math.round(baseAmount * RECOVERY_COMMISSION_RATE * 100) / 100;
  const created: Commission[] = [{
    id: `comm-${uuidv4().slice(0, 8)}`,
    orderId: order.id,
    orderNo: order.recoveryNo,
    customerName: order.customerName,
    productLevel: order.originalProduct,
    orderAmount: baseAmount,
    performanceAmount: baseAmount,
    commissionRate: RECOVERY_COMMISSION_RATE,
    commissionAmount: primaryAmount,
    scene: '退款挽回',
    proofStatus: order.paymentVoucher || order.chatEvidence ? '已上传' : '待补充',
    formulaText: `退款挽回金额 ${baseAmount} × 3% = ${primaryAmount} 元`,
    calculationNote: `第三方退款挽回单 ${order.recoveryNo} 审核通过，由${operatorName}生成售后挽回提成。`,
    role: '售后',
    owner: order.recoveryUserName,
    ownerId: order.recoveryUserId,
    department: '售后服务部',
    paymentDate: order.auditedAt || now,
    status: '待发放',
    sourceType: '人工新增',
    commissionType: 'recovery',
    sourceRecoveryOrderId: order.id,
    sourceBusinessType: 'refund_recovery',
    isRecoveryBonus: true,
    createdAt: now,
    updatedAt: now,
  }];

  if (order.assistUserId && order.assistUserName) {
    const assistAmount = Math.round(baseAmount * ASSIST_COMMISSION_RATE * 100) / 100;
    created.push({
      ...created[0],
      id: `comm-${uuidv4().slice(0, 8)}`,
      commissionRate: ASSIST_COMMISSION_RATE,
      commissionAmount: assistAmount,
      formulaText: `退款挽回协同金额 ${baseAmount} × 1% = ${assistAmount} 元`,
      calculationNote: `第三方退款挽回单 ${order.recoveryNo} 审核通过，生成协同提成。`,
      role: '客户成功',
      owner: order.assistUserName,
      ownerId: order.assistUserId,
      department: '客户成功部',
    });
  }

  setStorageData(STORAGE_KEYS.COMMISSIONS, [...created, ...commissions]);
  return created;
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
  if (filters.status && filters.status !== '全部') items = items.filter((item) => item.status === filters.status);
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
  const commissions = getStorageData<Commission[]>(STORAGE_KEYS.COMMISSIONS) || [];
  return createSuccessResponse({
    total: items.length,
    pendingReview: items.filter((item) => item.status === '待审核').length,
    approved: items.filter((item) => item.status === '审核通过' || item.status === '已生成提成').length,
    rejected: items.filter((item) => item.status === '审核驳回').length,
    generatedCommissionAmount: commissions
      .filter((commission) => commissionIds.has(commission.id))
      .reduce((sum, commission) => sum + Number(commission.commissionAmount || 0), 0),
  });
}

async function createRecoveryOrder(data: RecoveryOrderInput): Promise<ApiResponse<RecoveryOrder>> {
  ensureInit();
  await delay(180);
  if (!data.customerName.trim()) return createErrorResponse('请填写客户姓名');
  if (!data.customerPhone && !data.customerWechat) return createErrorResponse('请至少填写手机号或微信，方便系统匹配客户');
  if (!data.thirdPartyOrderNo.trim()) return createErrorResponse('请填写第三方平台订单号');
  if (!data.originalProduct.trim()) return createErrorResponse('请填写原购买产品');
  if (Number(data.recoveryAmount) <= 0) return createErrorResponse('挽回成交金额必须大于 0');

  const orders = readRecoveryOrders();
  if (orders.some((item) => item.thirdPartyOrderNo === data.thirdPartyOrderNo.trim())) {
    return createErrorResponse('该第三方平台订单号已经创建过退款挽回单');
  }

  const now = nowIso();
  const { customer, matchStatus } = resolveCustomerForRecoveryOrder(data, now);
  const next: RecoveryOrder = {
    ...data,
    id: `recovery-${uuidv4().slice(0, 8)}`,
    recoveryNo: `RCV-${now.slice(0, 10).replace(/-/g, '')}-${String(orders.length + 1).padStart(4, '0')}`,
    thirdPartyOrderNo: data.thirdPartyOrderNo.trim(),
    customerId: customer.id,
    customerName: customer.name || data.customerName.trim(),
    customerPhone: data.customerPhone || customer.phone,
    customerWechat: data.customerWechat || customer.wechat,
    customerMatchStatus: matchStatus,
    originalAmount: Number(data.originalAmount) || 0,
    recoveryAmount: Number(data.recoveryAmount) || 0,
    status: '待审核',
    commissionIds: [],
    createdAt: now,
    updatedAt: now,
  };
  writeRecoveryOrders([next, ...orders]);
  return createSuccessResponse(next);
}

async function approveRecoveryOrder(id: string, auditorId: string, auditorName: string): Promise<ApiResponse<RecoveryOrder | null>> {
  ensureInit();
  await delay(160);
  const orders = readRecoveryOrders();
  const idx = orders.findIndex((item) => item.id === id);
  if (idx === -1) return createSuccessResponse(null);
  if (orders[idx].status === '审核驳回') return createErrorResponse('已驳回的挽回单不能直接审核通过');
  const now = nowIso();
  const approved: RecoveryOrder = {
    ...orders[idx],
    status: '审核通过',
    auditorId,
    auditorName,
    auditedAt: now,
    updatedAt: now,
  };
  const commissions = createCommissionFromRecoveryOrder(approved, auditorName);
  orders[idx] = {
    ...approved,
    status: '已生成提成',
    commissionIds: commissions.map((commission) => commission.id),
    updatedAt: nowIso(),
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
    auditorId,
    auditorName,
    auditReason: reason.trim(),
    auditedAt: now,
    updatedAt: now,
  };
  writeRecoveryOrders(orders);
  return createSuccessResponse(orders[idx]);
}

export const recoveryOrderApi = {
  fetchRecoveryOrders,
  fetchRecoveryOrderStats,
  createRecoveryOrder,
  approveRecoveryOrder,
  rejectRecoveryOrder,
};
