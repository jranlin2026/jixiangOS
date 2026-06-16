import { create } from 'zustand';
import { upgradeApi } from '../api';
import type { UpgradeOpportunity, UpgradeFilters } from '../types/upgrade';

interface UpgradeState {
  items: UpgradeOpportunity[];
  current: UpgradeOpportunity | null;
  loading: boolean;
  error: string | null;
  filters: UpgradeFilters;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  fetchItems: (filters?: UpgradeFilters) => Promise<void>;
  fetchById: (id: string) => Promise<void>;
  refreshAI: () => Promise<void>;
  addFollowUp: (opportunityId: string, content: string, createdBy: string) => Promise<void>;
  convertOpportunity: (id: string) => Promise<void>;
  setFilters: (filters: UpgradeFilters) => void;
  reset: () => void;
}

const defaultPagination = { page: 1, pageSize: 20, total: 0, totalPages: 0 };

const useUpgradeStore = create<UpgradeState>((set, get) => ({
  items: [],
  current: null,
  loading: false,
  error: null,
  filters: {},
  pagination: defaultPagination,

  fetchItems: async (filters?: UpgradeFilters) => {
    set({ loading: true, error: null });
    try {
      const f = filters || get().filters;
      const res = await upgradeApi.getOpportunities(f);
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
      const res = await upgradeApi.getOpportunityById(id);
      if (res.code === 0) {
        set({ current: res.data, loading: false });
      }
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  refreshAI: async () => {
    set({ loading: true, error: null });
    try {
      await upgradeApi.refreshOpportunities();
      await get().fetchItems();
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  addFollowUp: async (opportunityId, content, createdBy) => {
    set({ loading: true, error: null });
    try {
      await upgradeApi.addFollowUp(opportunityId, content, createdBy);
      await get().fetchItems();
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  convertOpportunity: async (id) => {
    set({ loading: true, error: null });
    try {
      await upgradeApi.convertOpportunity(id);
      await get().fetchItems();
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  setFilters: (filters) => set({ filters }),
  reset: () => set({ items: [], current: null, loading: false, error: null, filters: {}, pagination: defaultPagination }),
}));

export default useUpgradeStore;
