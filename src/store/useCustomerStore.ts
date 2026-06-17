import { create } from 'zustand';
import { customerApi } from '../api';
import type { Customer, CustomerCreateInput, CustomerFilters, AICustomerPortrait } from '../types/customer';

interface CustomerState {
  items: Customer[];
  current: Customer | null;
  loading: boolean;
  error: string | null;
  filters: CustomerFilters;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  fetchItems: (filters?: CustomerFilters) => Promise<void>;
  fetchById: (id: string) => Promise<void>;
  create: (data: CustomerCreateInput) => Promise<void>;
  update: (id: string, data: Partial<Customer>) => Promise<void>;
  delete: (id: string) => Promise<void>;
  fetchAIPortrait: (id: string) => Promise<AICustomerPortrait | null>;
  updateTags: (id: string, tags: string[]) => Promise<void>;
  addFollowUp: (id: string, content: string, operator?: string) => Promise<Customer | null>;
  setFilters: (filters: CustomerFilters) => void;
  reset: () => void;
}

const defaultPagination = { page: 1, pageSize: 20, total: 0, totalPages: 0 };

const useCustomerStore = create<CustomerState>((set, get) => ({
  items: [],
  current: null,
  loading: false,
  error: null,
  filters: {},
  pagination: defaultPagination,

  fetchItems: async (filters?: CustomerFilters) => {
    set({ loading: true, error: null });
    try {
      const f = filters || get().filters;
      const res = await customerApi.fetchCustomers(f);
      if (res.code === 0) {
        set({ items: res.data.items, pagination: res.data.pagination, loading: false });
      } else {
        set({ error: res.message, loading: false });
      }
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  fetchById: async (id) => {
    set({ loading: true, error: null });
    try {
      const res = await customerApi.fetchCustomerById(id);
      if (res.code === 0) {
        set({ current: res.data, loading: false });
      }
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  create: async (data) => {
    set({ loading: true, error: null });
    try {
      await customerApi.createCustomer(data);
      await get().fetchItems();
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  update: async (id, data) => {
    set({ loading: true, error: null });
    try {
      await customerApi.updateCustomer(id, data);
      await get().fetchItems();
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  delete: async (id) => {
    set({ loading: true, error: null });
    try {
      await customerApi.deleteCustomer(id);
      await get().fetchItems();
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  fetchAIPortrait: async (id) => {
    try {
      const res = await customerApi.fetchAIPortrait(id);
      if (res.code === 0) {
        return res.data;
      }
      return null;
    } catch {
      return null;
    }
  },

  updateTags: async (id, tags) => {
    try {
      await customerApi.updateCustomer(id, { tags });
      await get().fetchItems();
    } catch { /* ignore */ }
  },

  addFollowUp: async (id, content, operator) => {
    try {
      const res = await customerApi.addCustomerFollowUp(id, { content, operator });
      if (res.code === 0) {
        await get().fetchItems();
        set({ current: res.data });
        return res.data;
      }
      return null;
    } catch {
      return null;
    }
  },

  setFilters: (filters) => set({ filters }),
  reset: () => set({ items: [], current: null, loading: false, error: null, filters: {}, pagination: defaultPagination }),
}));

export default useCustomerStore;
