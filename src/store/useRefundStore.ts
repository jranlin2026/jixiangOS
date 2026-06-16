import { create } from 'zustand';
import { refundApi } from '../api';
import type { Refund, RefundFilters } from '../types/refund';

interface RefundState {
  items: Refund[];
  current: Refund | null;
  loading: boolean;
  error: string | null;
  filters: RefundFilters;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  fetchItems: (filters?: RefundFilters) => Promise<void>;
  fetchById: (id: string) => Promise<void>;
  approve: (id: string, approverId: string, approverName: string) => Promise<void>;
  reject: (id: string, approverId: string, approverName: string, rejectReason: string) => Promise<void>;
  complete: (id: string, refundMethod: string, refundVoucher?: string) => Promise<void>;
  setFilters: (filters: RefundFilters) => void;
  reset: () => void;
}

const defaultPagination = { page: 1, pageSize: 20, total: 0, totalPages: 0 };

const useRefundStore = create<RefundState>((set, get) => ({
  items: [],
  current: null,
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

  approve: async (id, approverId, approverName) => {
    set({ loading: true, error: null });
    try {
      await refundApi.approveRefund(id, approverId, approverName);
      await get().fetchItems();
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  reject: async (id, approverId, approverName, rejectReason) => {
    set({ loading: true, error: null });
    try {
      await refundApi.rejectRefund(id, approverId, approverName, rejectReason);
      await get().fetchItems();
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  complete: async (id, refundMethod, refundVoucher) => {
    set({ loading: true, error: null });
    try {
      await refundApi.completeRefund(id, refundMethod, refundVoucher);
      await get().fetchItems();
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  setFilters: (filters) => set({ filters }),
  reset: () => set({ items: [], current: null, loading: false, error: null, filters: {}, pagination: defaultPagination }),
}));

export default useRefundStore;
