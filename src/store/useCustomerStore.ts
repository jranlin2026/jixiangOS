import { create } from 'zustand';
import { customerApi } from '../api';
import type { Customer, CustomerActivityRecord, CustomerCreateInput, CustomerFilters, AICustomerPortrait } from '../types/customer';

interface CustomerState {
  items: Customer[];
  current: Customer | null;
  loading: boolean;
  error: string | null;
  filters: CustomerFilters;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  fetchItems: (filters?: CustomerFilters) => Promise<void>;
  fetchById: (id: string) => Promise<void>;
  create: (data: CustomerCreateInput) => Promise<boolean>;
  update: (id: string, data: Partial<Customer>) => Promise<boolean>;
  delete: (id: string) => Promise<void>;
  fetchAIPortrait: (id: string) => Promise<AICustomerPortrait | null>;
  addFollowUp: (id: string, content: string, operator?: string, attachments?: CustomerActivityRecord['attachments']) => Promise<Customer | null>;
  setFilters: (filters: CustomerFilters) => void;
  reset: () => void;
}

const defaultPagination = { page: 1, pageSize: 10, total: 0, totalPages: 0 };
let customerListRequestSequence = 0;

const useCustomerStore = create<CustomerState>((set, get) => ({
  items: [],
  current: null,
  loading: false,
  error: null,
  filters: { page: 1, pageSize: 10 },
  pagination: defaultPagination,

  fetchItems: async (filters?: CustomerFilters) => {
    const requestSequence = ++customerListRequestSequence;
    set({ loading: true, error: null });
    try {
      const f = filters || get().filters;
      const res = await customerApi.fetchCustomers(f);
      if (requestSequence !== customerListRequestSequence) return;
      if (res.code === 0) {
        set({ items: res.data.items, pagination: res.data.pagination, loading: false });
      } else {
        set({ error: res.message, loading: false });
      }
    } catch (e: unknown) {
      if (requestSequence !== customerListRequestSequence) return;
      set({ error: e instanceof Error ? e.message : String(e), loading: false });
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
      const res = await customerApi.createCustomer(data);
      if (res.code !== 0 || !res.data) throw new Error(res.message || '新增客户失败');
      await get().fetchItems();
      return true;
    } catch (e: any) {
      set({ error: e.message, loading: false });
      throw e;
    }
  },

  update: async (id, data) => {
    set({ loading: true, error: null });
    try {
      const res = await customerApi.updateCustomer(id, data);
      if (res.code !== 0 || !res.data) throw new Error(res.message || '更新客户失败');
      await get().fetchItems();
      return true;
    } catch (e: any) {
      set({ error: e.message, loading: false });
      throw e;
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

  addFollowUp: async (id, content, operator, attachments) => {
    try {
      const res = await customerApi.addCustomerFollowUp(id, { content, operator, attachments });
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
  reset: () => set({ items: [], current: null, loading: false, error: null, filters: { page: 1, pageSize: 10 }, pagination: defaultPagination }),
}));

export default useCustomerStore;
