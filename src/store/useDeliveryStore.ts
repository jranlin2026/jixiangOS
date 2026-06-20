import { create } from 'zustand';
import { deliveryApi } from '../api';
import type { Delivery, DeliveryFilters, DeliveryProductType } from '../types/delivery';

interface DeliveryState {
  items: Delivery[];
  current: Delivery | null;
  loading: boolean;
  error: string | null;
  filters: DeliveryFilters;
  pagination: { page: number; pageSize: number; total: number };
  fetchItems: (filters?: DeliveryFilters) => Promise<void>;
  fetchById: (id: string) => Promise<void>;
  fetchByProductType: (productType: DeliveryProductType) => Promise<void>;
  advanceStage: (id: string, targetStage: string) => Promise<void>;
  setFilters: (filters: DeliveryFilters) => void;
  reset: () => void;
}

const defaultPagination = { page: 1, pageSize: 10, total: 0 };

const useDeliveryStore = create<DeliveryState>((set, get) => ({
  items: [],
  current: null,
  loading: false,
  error: null,
  filters: {},
  pagination: defaultPagination,

  fetchItems: async (filters?: DeliveryFilters) => {
    set({ loading: true, error: null });
    try {
      const nextFilters = filters || get().filters;
      const res = await deliveryApi.fetchDeliveries(nextFilters);
      if (res.code === 0) {
        set({
          items: res.data.items,
          pagination: { page: res.data.page, pageSize: res.data.pageSize, total: res.data.total },
          loading: false,
        });
      }
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  fetchById: async (id) => {
    set({ loading: true, error: null });
    try {
      const res = await deliveryApi.fetchDeliveryById(id);
      if (res.code === 0) {
        set({ current: res.data, loading: false });
      }
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  fetchByProductType: async (productType) => {
    set({ loading: true, error: null, filters: { productType, page: 1, pageSize: 200 }, items: [] });
    try {
      const res = await deliveryApi.fetchDeliveriesByProductType(productType);
      if (res.code === 0) {
        set({ items: res.data, pagination: { page: 1, pageSize: res.data.length || 1, total: res.data.length }, loading: false });
      }
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  advanceStage: async (id, targetStage) => {
    const previousItems = get().items;
    const now = new Date().toISOString();
    set({
      loading: false,
      error: null,
      items: previousItems.map((item) => {
        if (item.id !== id) return item;
        const targetIdx = item.stages.indexOf(targetStage);
        if (targetIdx === -1) return item;
        return {
          ...item,
          currentStage: targetStage,
          updatedAt: now,
          tasks: item.tasks.map((task, idx) => {
            const stageIdx = item.stages.findIndex((stage) => stage === task.title);
            const effectiveIdx = stageIdx === -1 ? idx : stageIdx;
            if (effectiveIdx < targetIdx) return { ...task, status: '已完成', completedAt: task.completedAt || now };
            if (effectiveIdx === targetIdx) return { ...task, status: '进行中', completedAt: undefined };
            return { ...task, status: '待开始', completedAt: undefined };
          }),
        };
      }),
    });

    try {
      const res = await deliveryApi.advanceDeliveryStage(id, targetStage);
      if (res.code === 0 && res.data) {
        set({ items: get().items.map((item) => (item.id === id ? res.data! : item)) });
      }
    } catch (e: any) {
      set({ error: e.message, loading: false, items: previousItems });
    }
  },

  setFilters: (filters) => set({ filters }),
  reset: () => set({ items: [], current: null, loading: false, error: null, filters: {}, pagination: defaultPagination }),
}));

export default useDeliveryStore;
