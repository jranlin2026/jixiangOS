import type { Refund, RefundFilters } from '../types/refund';
import type { ApiResponse, PaginatedResponse } from './types';
import { createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { STORAGE_KEYS, DEFAULT_PAGE_SIZE } from '../shared/utils/constants';
import { initializeMockData } from './mock';
import { v4 as uuidv4 } from 'uuid';

function ensureInit(): void {
  initializeMockData();
}

async function getRefunds(filters?: RefundFilters): Promise<ApiResponse<PaginatedResponse<Refund>>> {
  ensureInit();
  await delay(200);
  const all = getStorageData<Refund[]>(STORAGE_KEYS.REFUNDS) || [];
  let filtered = [...all];

  if (filters?.search) {
    const q = filters.search.toLowerCase();
    filtered = filtered.filter(
      (r) => r.refundNo.toLowerCase().includes(q) || r.customerName.toLowerCase().includes(q) || r.orderNo.toLowerCase().includes(q),
    );
  }
  if (filters?.status) {
    filtered = filtered.filter((r) => r.status === filters.status);
  }
  if (filters?.refundCategory) {
    filtered = filtered.filter((r) => r.refundCategory === filters.refundCategory);
  }
  if (filters?.startDate) {
    filtered = filtered.filter((r) => r.createdAt >= filters.startDate!);
  }
  if (filters?.endDate) {
    filtered = filtered.filter((r) => r.createdAt <= filters.endDate!);
  }

  const page = filters?.page || 1;
  const pageSize = filters?.pageSize || DEFAULT_PAGE_SIZE;
  const total = filtered.length;
  const totalPages = Math.ceil(total / pageSize);
  const items = filtered.slice((page - 1) * pageSize, page * pageSize);

  return createSuccessResponse({ items, pagination: { page, pageSize, total, totalPages } });
}

async function getRefundById(id: string): Promise<ApiResponse<Refund | null>> {
  ensureInit();
  await delay(150);
  const refunds = getStorageData<Refund[]>(STORAGE_KEYS.REFUNDS) || [];
  return createSuccessResponse(refunds.find((r) => r.id === id) || null);
}

async function createRefund(data: Omit<Refund, 'id' | 'refundNo' | 'createdAt' | 'updatedAt'>): Promise<ApiResponse<Refund>> {
  ensureInit();
  await delay(200);
  const refunds = getStorageData<Refund[]>(STORAGE_KEYS.REFUNDS) || [];
  const now = new Date().toISOString();
  const refundNo = `REF-${now.slice(0, 7).replace('-', '')}-${String(refunds.length + 1).padStart(4, '0')}`;

  const newRefund: Refund = {
    ...data,
    id: `refund-${uuidv4().slice(0, 8)}`,
    refundNo,
    createdAt: now,
    updatedAt: now,
  };
  refunds.unshift(newRefund);
  setStorageData(STORAGE_KEYS.REFUNDS, refunds);
  return createSuccessResponse(newRefund);
}

async function approveRefund(id: string, approverId: string, approverName: string): Promise<ApiResponse<Refund | null>> {
  ensureInit();
  await delay(200);
  const refunds = getStorageData<Refund[]>(STORAGE_KEYS.REFUNDS) || [];
  const idx = refunds.findIndex((r) => r.id === id);
  if (idx === -1) return createSuccessResponse(null);
  const now = new Date().toISOString();
  refunds[idx] = {
    ...refunds[idx],
    status: '退款已批准',
    approverId,
    approverName,
    approvedAt: now,
    updatedAt: now,
  };
  setStorageData(STORAGE_KEYS.REFUNDS, refunds);
  return createSuccessResponse(refunds[idx]);
}

async function rejectRefund(id: string, approverId: string, approverName: string, rejectReason: string): Promise<ApiResponse<Refund | null>> {
  ensureInit();
  await delay(200);
  const refunds = getStorageData<Refund[]>(STORAGE_KEYS.REFUNDS) || [];
  const idx = refunds.findIndex((r) => r.id === id);
  if (idx === -1) return createSuccessResponse(null);
  const now = new Date().toISOString();
  refunds[idx] = {
    ...refunds[idx],
    status: '退款已拒绝',
    approverId,
    approverName,
    approvedAt: now,
    rejectReason,
    updatedAt: now,
  };
  setStorageData(STORAGE_KEYS.REFUNDS, refunds);
  return createSuccessResponse(refunds[idx]);
}

async function completeRefund(id: string, refundMethod: string, refundVoucher?: string): Promise<ApiResponse<Refund | null>> {
  ensureInit();
  await delay(200);
  const refunds = getStorageData<Refund[]>(STORAGE_KEYS.REFUNDS) || [];
  const idx = refunds.findIndex((r) => r.id === id);
  if (idx === -1) return createSuccessResponse(null);
  const now = new Date().toISOString();
  refunds[idx] = {
    ...refunds[idx],
    status: '退款已完成',
    refundMethod,
    refundVoucher,
    completedAt: now,
    updatedAt: now,
  };
  setStorageData(STORAGE_KEYS.REFUNDS, refunds);
  return createSuccessResponse(refunds[idx]);
}

export const refundApi = {
  getRefunds,
  getRefundById,
  createRefund,
  approveRefund,
  rejectRefund,
  completeRefund,
};
