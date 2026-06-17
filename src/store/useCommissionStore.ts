import { create } from 'zustand';
import { commissionApi } from '../api';
import type {
  Commission,
  CommissionAuditIssue,
  CommissionFilters,
  CommissionSettlementBatch,
  CommissionStats,
  CommissionStatus,
} from '../types/commission';

interface CommissionState {
  items: Commission[];
  auditIssues: CommissionAuditIssue[];
  batches: CommissionSettlementBatch[];
  stats: CommissionStats | null;
  loading: boolean;
  error: string | null;
  filters: CommissionFilters;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  fetchItems: (filters?: CommissionFilters) => Promise<void>;
  fetchStats: () => Promise<void>;
  fetchAuditIssues: (filters?: CommissionFilters) => Promise<void>;
  fetchBatches: () => Promise<void>;
  generateBatch: (period: string) => Promise<void>;
  payBatch: (batchId: string) => Promise<void>;
  updateStatus: (id: string, status: CommissionStatus) => Promise<void>;
  batchApprove: (ids: string[]) => Promise<void>;
  batchPay: (ids: string[]) => Promise<void>;
  setFilters: (filters: CommissionFilters) => void;
  reset: () => void;
}

const defaultPagination = { page: 1, pageSize: 20, total: 0, totalPages: 0 };

const useCommissionStore = create<CommissionState>((set, get) => ({
  items: [],
  auditIssues: [],
  batches: [],
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

  fetchAuditIssues: async (filters?: CommissionFilters) => {
    try {
      const res = await commissionApi.fetchCommissionAuditIssues(filters || get().filters);
      if (res.code === 0) set({ auditIssues: res.data });
    } catch { /* ignore */ }
  },

  fetchBatches: async () => {
    try {
      const res = await commissionApi.fetchSettlementBatches();
      if (res.code === 0) set({ batches: res.data });
    } catch { /* ignore */ }
  },

  generateBatch: async (period) => {
    set({ loading: true, error: null });
    try {
      await commissionApi.generateSettlementBatch(period);
      await get().fetchBatches();
      await get().fetchItems();
      await get().fetchStats();
      set({ loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  payBatch: async (batchId) => {
    set({ loading: true, error: null });
    try {
      await commissionApi.paySettlementBatch(batchId);
      await get().fetchBatches();
      await get().fetchItems();
      await get().fetchStats();
      set({ loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  updateStatus: async (id, status) => {
    set({ loading: true, error: null });
    try {
      await commissionApi.updateCommissionStatus(id, status);
      await get().fetchItems();
      await get().fetchAuditIssues();
      await get().fetchBatches();
      await get().fetchStats();
      set({ loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  batchApprove: async (ids) => {
    set({ loading: true, error: null });
    try {
      await commissionApi.batchApproveCommission(ids);
      await get().fetchItems();
      await get().fetchAuditIssues();
      await get().fetchStats();
      set({ loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  batchPay: async (ids) => {
    set({ loading: true, error: null });
    try {
      await commissionApi.batchPayCommission(ids);
      await get().fetchItems();
      await get().fetchBatches();
      await get().fetchStats();
      set({ loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  setFilters: (filters) => set({ filters }),
  reset: () => set({
    items: [],
    auditIssues: [],
    batches: [],
    stats: null,
    loading: false,
    error: null,
    filters: {},
    pagination: defaultPagination,
  }),
}));

export default useCommissionStore;
