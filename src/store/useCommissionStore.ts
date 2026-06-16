import { create } from 'zustand';
import { commissionApi } from '../api';
import type { Commission, CommissionFilters, CommissionStats } from '../types/commission';

interface CommissionState {
  items: Commission[];
  stats: CommissionStats | null;
  loading: boolean;
  error: string | null;
  filters: CommissionFilters;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  fetchItems: (filters?: CommissionFilters) => Promise<void>;
  fetchStats: () => Promise<void>;
  updateStatus: (id: string, status: '待审核' | '待发放' | '已发放' | '已取消') => Promise<void>;
  setFilters: (filters: CommissionFilters) => void;
  reset: () => void;
}

const defaultPagination = { page: 1, pageSize: 20, total: 0, totalPages: 0 };

const useCommissionStore = create<CommissionState>((set, get) => ({
  items: [],
  stats: null,
  loading: false,
  error: null,
  filters: {},
  pagination: defaultPagination,

  fetchItems: async (filters?: CommissionFilters) => {
    set({ loading: true, error: null });
    try {
      const f = filters || get().filters;
      const res = await commissionApi.fetchCommissions(f);
      if (res.code === 0) {
        set({ items: res.data.items, pagination: res.data.pagination, loading: false });
      }
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  fetchStats: async () => {
    try {
      const res = await commissionApi.fetchCommissionStats();
      if (res.code === 0) set({ stats: res.data });
    } catch { /* ignore */ }
  },

  updateStatus: async (id, status) => {
    set({ loading: true, error: null });
    try {
      await commissionApi.updateCommissionStatus(id, status as any);
      await get().fetchItems();
      await get().fetchStats();
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  setFilters: (filters) => set({ filters }),
  reset: () => set({ items: [], stats: null, loading: false, error: null, filters: {}, pagination: defaultPagination }),
}));

export default useCommissionStore;
