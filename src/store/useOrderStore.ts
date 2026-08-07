import { create } from 'zustand';
import { orderApi } from '../api';
import type { Order, OrderFilters, OrderStats } from '../types/order';

interface OrderState {
  items: Order[];
  current: Order | null;
  stats: OrderStats | null;
  loading: boolean;
  error: string | null;
  filters: OrderFilters;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  fetchItems: (filters?: OrderFilters) => Promise<void>;
  fetchById: (id: string) => Promise<void>;
  fetchStats: () => Promise<void>;
  create: (data: Omit<Order, 'id' | 'createdAt' | 'updatedAt' | 'orderNo'>) => Promise<void>;
  update: (id: string, data: Partial<Order>) => Promise<void>;
  delete: (id: string) => Promise<void>;
  setFilters: (filters: OrderFilters) => void;
  resetListFilters: () => void;
  reset: () => void;
}

const defaultPagination = { page: 1, pageSize: 10, total: 0, totalPages: 0 };
const defaultFilters: OrderFilters = { page: 1, pageSize: 10, sortBy: 'createdAt', sortDirection: 'desc' };
let orderListRequestSequence = 0;

const useOrderStore = create<OrderState>((set, get) => ({
  items: [],
  current: null,
  stats: null,
  loading: false,
  error: null,
  filters: defaultFilters,
  pagination: defaultPagination,

  fetchItems: async (filters?: OrderFilters) => {
    const requestSequence = ++orderListRequestSequence;
    set({ loading: true, error: null });
    try {
      const f = filters || get().filters;
      const res = await orderApi.fetchOrders(f);
      if (requestSequence !== orderListRequestSequence) return;
      if (res.code === 0) {
        set({ items: res.data.items, pagination: res.data.pagination, loading: false });
      } else {
        set({ error: res.message, loading: false });
      }
    } catch (e: unknown) {
      if (requestSequence !== orderListRequestSequence) return;
      set({ error: e instanceof Error ? e.message : String(e), loading: false });
    }
  },

  fetchById: async (id) => {
    set({ loading: true, error: null });
    try {
      const res = await orderApi.fetchOrderById(id);
      if (res.code === 0) {
        set({ current: res.data, loading: false });
      } else {
        set({ error: res.message, loading: false });
      }
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  fetchStats: async () => {
    try {
      const res = await orderApi.fetchOrderStats();
      if (res.code === 0) set({ stats: res.data });
    } catch { /* ignore */ }
  },

  create: async (data) => {
    set({ loading: true, error: null });
    try {
      const res = await orderApi.createOrder(data);
      if (res.code !== 0) throw new Error(res.message || '创建订单失败');
      await get().fetchItems();
      await get().fetchStats();
    } catch (e: any) {
      set({ error: e.message, loading: false });
      throw e;
    }
  },

  update: async (id, data) => {
    set({ loading: true, error: null });
    try {
      const res = await orderApi.updateOrder(id, data);
      if (res.code !== 0) throw new Error(res.message || '修改订单失败');
      await get().fetchItems();
      await get().fetchStats();
    } catch (e: any) {
      set({ error: e.message, loading: false });
      throw e;
    }
  },

  delete: async (id) => {
    set({ loading: true, error: null });
    try {
      const res = await orderApi.deleteOrder(id);
      if (res.code !== 0) throw new Error(res.message || '删除订单失败');
      const { filters, items, pagination } = get();
      const targetPage = items.length <= 1 && pagination.page > 1 ? pagination.page - 1 : pagination.page;
      const nextFilters = { ...filters, page: targetPage };
      if (targetPage !== filters.page) set({ filters: nextFilters });
      await get().fetchItems(nextFilters);
      await get().fetchStats();
    } catch (e: any) {
      set({ error: e.message, loading: false });
      throw e;
    }
  },

  setFilters: (filters) => set({ filters }),
  resetListFilters: () => set((state) => ({
    filters: {
      ...defaultFilters,
      pageSize: state.filters.pageSize || state.pagination.pageSize || defaultPagination.pageSize,
    },
  })),
  reset: () => set({ items: [], current: null, stats: null, loading: false, error: null, filters: defaultFilters, pagination: defaultPagination }),
}));

export default useOrderStore;
