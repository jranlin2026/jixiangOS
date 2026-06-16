import { create } from 'zustand';
import { leadApi } from '../api';
import type { Lead, LeadFilters } from '../types/lead';

interface LeadState {
  items: Lead[];
  current: Lead | null;
  loading: boolean;
  error: string | null;
  filters: LeadFilters;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  fetchItems: (filters?: LeadFilters) => Promise<void>;
  fetchById: (id: string) => Promise<void>;
  create: (data: Omit<Lead, 'id' | 'createdAt' | 'updatedAt' | 'followUpRecords'>) => Promise<void>;
  update: (id: string, data: Partial<Lead>) => Promise<void>;
  delete: (id: string) => Promise<void>;
  setFilters: (filters: LeadFilters) => void;
  reset: () => void;
}

const defaultPagination = { page: 1, pageSize: 20, total: 0, totalPages: 0 };

const useLeadStore = create<LeadState>((set, get) => ({
  items: [],
  current: null,
  loading: false,
  error: null,
  filters: {},
  pagination: defaultPagination,

  fetchItems: async (filters?: LeadFilters) => {
    set({ loading: true, error: null });
    try {
      const f = filters || get().filters;
      const res = await leadApi.fetchLeads(f);
      if (res.code === 0) {
        set({ items: res.data.items, pagination: res.data.pagination, loading: false });
      } else {
        set({ error: res.message, loading: false });
      }
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  fetchById: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const res = await leadApi.fetchLeadById(id);
      if (res.code === 0) {
        set({ current: res.data, loading: false });
      } else {
        set({ error: res.message, loading: false });
      }
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  create: async (data) => {
    set({ loading: true, error: null });
    try {
      await leadApi.createLead(data);
      await get().fetchItems();
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  update: async (id, data) => {
    set({ loading: true, error: null });
    try {
      await leadApi.updateLead(id, data);
      await get().fetchItems();
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  delete: async (id) => {
    set({ loading: true, error: null });
    try {
      await leadApi.deleteLead(id);
      await get().fetchItems();
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  setFilters: (filters) => set({ filters }),
  reset: () => set({ items: [], current: null, loading: false, error: null, filters: {}, pagination: defaultPagination }),
}));

export default useLeadStore;
