import type {
  Commission,
  CommissionAuditIssue,
  CommissionFilters,
  CommissionSettlementBatch,
  CommissionStats,
  CommissionStatus,
} from '../types/commission';
import type { Order } from '../types/order';
import type { ApiResponse, PaginatedResponse } from './types';
import { createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { STORAGE_KEYS, DEFAULT_PAGE_SIZE } from '../shared/utils/constants';
import { initializeMockData } from './mock';
import { v4 as uuidv4 } from 'uuid';

function ensureInit(): void {
  initializeMockData();
}

function normalizeCommission(c: Commission): Commission {
  const evidenceStatus = c.evidenceStatus || '无需凭证';
  return {
    ...c,
    role: c.role || '销售',
    department: c.department || '销售部',
    proofStatus: c.proofStatus || '无需凭证',
    resourceOwnership: c.resourceOwnership || '公司资源',
    scene: c.scene || (c.productLevel === '899' ? '899成交' : '新代理'),
    evidenceStatus,
    evidenceRequired: c.evidenceRequired ?? evidenceStatus !== '无需凭证',
    formulaText: c.formulaText || (
      c.commissionRate > 0
        ? `业绩金额 ${c.performanceAmount || c.orderAmount} × ${Math.round(c.commissionRate * 100)}% = ${c.commissionAmount} 元`
        : `固定提成 ${c.commissionAmount} 元`
    ),
  };
}

function getAllCommissions(): Commission[] {
  return (getStorageData<Commission[]>(STORAGE_KEYS.COMMISSIONS) || [])
    .map(normalizeCommission)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function saveCommissions(commissions: Commission[]): void {
  setStorageData(STORAGE_KEYS.COMMISSIONS, commissions);
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
  if (filters?.role) filtered = filtered.filter((c) => c.role === filters.role);
  if (filters?.department) filtered = filtered.filter((c) => c.department === filters.department);
  if (filters?.month) {
    filtered = filtered.filter((c) => c.createdAt.startsWith(filters.month!));
  }
  if (filters?.startDate) filtered = filtered.filter((c) => c.createdAt >= filters.startDate!);
  if (filters?.endDate) filtered = filtered.filter((c) => c.createdAt <= filters.endDate!);

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

async function fetchCommissionStats(): Promise<ApiResponse<CommissionStats>> {
  ensureInit();
  await delay(200);
  const normalizedCommissions = getAllCommissions();
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const monthCommissions = normalizedCommissions.filter((c) => c.createdAt >= monthStart);
  const byRole = normalizedCommissions.reduce((acc, c) => {
    acc[c.role] = (acc[c.role] || 0) + c.commissionAmount;
    return acc;
  }, {} as CommissionStats['byRole']);
  const monthTotal = monthCommissions.reduce((s, c) => s + c.commissionAmount, 0);

  const stats: CommissionStats = {
    monthPending: monthCommissions.filter((c) => c.status === '待发放' || c.status === '待审核').reduce((s, c) => s + c.commissionAmount, 0),
    monthPaid: monthCommissions.filter((c) => c.status === '已发放').reduce((s, c) => s + c.commissionAmount, 0),
    monthTotal,
    byRole,
    pendingReview: monthCommissions.filter((c) => c.status === '待审核').reduce((s, c) => s + c.commissionAmount, 0),
    revenueRatio: 0,
  };

  return createSuccessResponse(stats);
}

function buildAuditIssues(commissions: Commission[]): CommissionAuditIssue[] {
  return commissions
    .filter((commission) => {
      const note = `${commission.auditReason || ''}${commission.frozenReason || ''}${commission.calculationNote || ''}`;
      return commission.status === '待审核'
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
    if (idx !== -1 && commissions[idx].status === '待审核') {
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

function buildSettlementBatch(period: string, commissions: Commission[]): CommissionSettlementBatch {
  const settleCommissions = commissions.filter(
    (commission) => commission.createdAt.startsWith(period) && commission.status !== '已取消',
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

  const pendingReviewAmount = sum(settleCommissions, '待审核');
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
    cancelledAmount: sum(commissions.filter((commission) => commission.createdAt.startsWith(period)), '已取消'),
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
  const batch = buildSettlementBatch(period, getAllCommissions());
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

  const refreshed = buildSettlementBatch(batches[batchIdx].period, nextCommissions.map(normalizeCommission));
  batches[batchIdx] = {
    ...refreshed,
    id: batches[batchIdx].id,
    batchNo: batches[batchIdx].batchNo,
    paidAt: now,
  };
  setStorageData(STORAGE_KEYS.COMMISSION_SETTLEMENT_BATCHES, batches);

  return createSuccessResponse(batches[batchIdx]);
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
  fetchCommissionStats,
  fetchCommissionAuditIssues,
  fetchSettlementBatches,
  generateSettlementBatch,
  paySettlementBatch,
  fetchCommissionDetail,
  updateCommissionStatus,
  batchApproveCommission,
  batchPayCommission,
};
