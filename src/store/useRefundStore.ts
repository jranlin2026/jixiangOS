import { create } from 'zustand';
import { refundApi } from '../api';
import type { RecoveryLog, RecoveryRole, Refund, RefundFilters, RefundStats } from '../types/refund';

interface RefundState {
  items: Refund[];
  current: Refund | null;
  stats: RefundStats | null;
  loading: boolean;
  error: string | null;
  filters: RefundFilters;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  fetchItems: (filters?: RefundFilters) => Promise<void>;
  fetchStats: () => Promise<void>;
  fetchById: (id: string) => Promise<void>;
  assign: (id: string, data: { userId: string; userName: string; role: RecoveryRole; reason?: string }) => Promise<void>;
  addLog: (id: string, data: Omit<RecoveryLog, 'id' | 'refundId' | 'createdAt'>) => Promise<void>;
  markSuccess: (id: string, data: { operatorId: string; operatorName: string; successMethod: string; retainedAmount: number; note: string }) => Promise<void>;
  markFailed: (id: string, data: { operatorId: string; operatorName: string; failedReason: string; note: string }) => Promise<void>;
  approve: (id: string, approverId: string, approverName: string) => Promise<void>;
  reject: (id: string, approverId: string, approverName: string, rejectReason: string) => Promise<void>;
  complete: (id: string, refundMethod: string, refundVoucher?: string, refundSerialNo?: string, refundedAt?: string) => Promise<void>;
  setFilters: (filters: RefundFilters) => void;
  reset: () => void;
}

const defaultPagination = { page: 1, pageSize: 20, total: 0, totalPages: 0 };

const useRefundStore = create<RefundState>((set, get) => ({
  items: [],
  current: null,
  stats: null,
  loading: false,
  error: null,
  filters: {},
  pagination: defaultPagination,

  fetchItems: async (filters?: RefundFilters) => {
    set({ loading: true, error: null });
    try {
      const f = filters || get().filters;
      const res = await refundApi.getRefunds(f);
      if (res.code === 0) {
        set({ items: res.data.items, pagination: res.data.pagination, loading: false });
      }
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  fetchStats: async () => {
    try {
      const res = await refundApi.getRefundStats();
      if (res.code === 0) set({ stats: res.data });
    } catch { /* ignore */ }
  },

  fetchById: async (id) => {
    set({ loading: true, error: null });
    try {
      const res = await refundApi.getRefundById(id);
      if (res.code === 0) {
        set({ current: res.data, loading: false });
      }
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  assign: async (id, data) => {
    set({ loading: true, error: null });
    try {
      const res = await refundApi.assignRecoveryTask(id, data);
      if (res.code !== 0) {
        set({ error: res.message, loading: false });
        return;
      }
      await get().fetchItems();
      await get().fetchStats();
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  addLog: async (id, data) => {
    set({ loading: true, error: null });
    try {
      const res = await refundApi.addRecoveryLog(id, data);
      if (res.code !== 0) {
        set({ error: res.message, loading: false });
        return;
      }
      await get().fetchItems();
      await get().fetchStats();
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  markSuccess: async (id, data) => {
    set({ loading: true, error: null });
    try {
      const res = await refundApi.markRecoverySuccess(id, data);
      if (res.code !== 0) {
        set({ error: res.message, loading: false });
        return;
      }
      await get().fetchItems();
      await get().fetchStats();
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  markFailed: async (id, data) => {
    set({ loading: true, error: null });
    try {
      const res = await refundApi.markRecoveryFailed(id, data);
      if (res.code !== 0) {
        set({ error: res.message, loading: false });
        return;
      }
      await get().fetchItems();
      await get().fetchStats();
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  approve: async (id, approverId, approverName) => {
    set({ loading: true, error: null });
    try {
      const res = await refundApi.approveRefund(id, approverId, approverName);
      if (res.code !== 0) {
        set({ error: res.message, loading: false });
        return;
      }
      await get().fetchItems();
      await get().fetchStats();
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  reject: async (id, approverId, approverName, rejectReason) => {
    set({ loading: true, error: null });
    try {
      const res = await refundApi.rejectRefund(id, approverId, approverName, rejectReason);
      if (res.code !== 0) {
        set({ error: res.message, loading: false });
        return;
      }
      await get().fetchItems();
      await get().fetchStats();
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  complete: async (id, refundMethod, refundVoucher, refundSerialNo, refundedAt) => {
    set({ loading: true, error: null });
    try {
      const res = await refundApi.completeRefund(id, refundMethod, refundVoucher, refundSerialNo, refundedAt);
      if (res.code !== 0) {
        set({ error: res.message, loading: false });
        return;
      }
      await get().fetchItems();
      await get().fetchStats();
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  setFilters: (filters) => set({ filters }),
  reset: () => set({ items: [], current: null, stats: null, loading: false, error: null, filters: {}, pagination: defaultPagination }),
}));

export default useRefundStore;
