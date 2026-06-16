import type { Commission, CommissionFilters, CommissionStats, CommissionStatus } from '../types/commission';
import type { ApiResponse, PaginatedResponse } from './types';
import { createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { STORAGE_KEYS, DEFAULT_PAGE_SIZE } from '../shared/utils/constants';
import { initializeMockData } from './mock';

function ensureInit(): void {
  initializeMockData();
}

function normalizeCommission(c: Commission): Commission {
  return {
    ...c,
    role: c.role || '销售',
    department: c.department || '销售部',
    proofStatus: c.proofStatus || '无需凭证',
    resourceOwnership: c.resourceOwnership || '公司资源',
    scene: c.scene || (c.productLevel === '899' ? '899成交' : '新代理'),
  };
}

async function fetchCommissions(filters?: CommissionFilters): Promise<ApiResponse<PaginatedResponse<Commission>>> {
  ensureInit();
  await delay(200);
  const all = (getStorageData<Commission[]>(STORAGE_KEYS.COMMISSIONS) || []).map(normalizeCommission);
  let filtered = [...all];

  if (filters?.search) {
    const q = filters.search.toLowerCase();
    filtered = filtered.filter(
      (c) => c.customerName.toLowerCase().includes(q) || c.orderNo.toLowerCase().includes(q),
    );
  }
  if (filters?.productLevel) {
    filtered = filtered.filter((c) => c.productLevel === filters.productLevel);
  }
  if (filters?.status) {
    filtered = filtered.filter((c) => c.status === filters.status);
  }
  if (filters?.owner) {
    filtered = filtered.filter((c) => c.owner === filters.owner);
  }
  if (filters?.role) {
    filtered = filtered.filter((c) => c.role === filters.role);
  }
  if (filters?.department) {
    filtered = filtered.filter((c) => c.department === filters.department);
  }
  if (filters?.startDate) {
    filtered = filtered.filter((c) => c.createdAt >= filters.startDate!);
  }
  if (filters?.endDate) {
    filtered = filtered.filter((c) => c.createdAt <= filters.endDate!);
  }

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
  const commissions = getStorageData<Commission[]>(STORAGE_KEYS.COMMISSIONS) || [];
  const normalizedCommissions = commissions.map(normalizeCommission);
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

async function updateCommissionStatus(id: string, status: CommissionStatus): Promise<ApiResponse<Commission | null>> {
  ensureInit();
  await delay(200);
  const commissions = getStorageData<Commission[]>(STORAGE_KEYS.COMMISSIONS) || [];
  const idx = commissions.findIndex((c) => c.id === id);
  if (idx === -1) return createSuccessResponse(null);
  commissions[idx] = {
    ...commissions[idx],
    status,
    paidAt: status === '已发放' ? new Date().toISOString() : commissions[idx].paidAt,
    updatedAt: new Date().toISOString(),
  };
  setStorageData(STORAGE_KEYS.COMMISSIONS, commissions);
  return createSuccessResponse(commissions[idx]);
}

/** 批量审核提成 */
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
        updatedAt: new Date().toISOString(),
      };
      count++;
    }
  }
  setStorageData(STORAGE_KEYS.COMMISSIONS, commissions);
  return createSuccessResponse(count);
}

/** 批量发放提成 */
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
  setStorageData(STORAGE_KEYS.COMMISSIONS, commissions);
  return createSuccessResponse(count);
}

export const commissionApi = {
  fetchCommissions,
  fetchCommissionStats,
  updateCommissionStatus,
  batchApproveCommission,
  batchPayCommission,
};
