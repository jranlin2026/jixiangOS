import { create } from 'zustand';
import { deliveryApi } from '../api';
import type { Delivery, DeliveryFilters, DeliveryProductType } from '../types/delivery';

interface DeliveryState {
  items: Delivery[];
  current: Delivery | null;
  loading: boolean;
  error: string | null;
  filters: DeliveryFilters;
  fetchItems: (filters?: DeliveryFilters) => Promise<void>;
  fetchById: (id: string) => Promise<void>;
  fetchByProductType: (productType: DeliveryProductType) => Promise<void>;
  advanceStage: (id: string, targetStage: string) => Promise<void>;
  setFilters: (filters: DeliveryFilters) => void;
  reset: () => void;
}

const useDeliveryStore = create<DeliveryState>((set, get) => ({
  items: [],
  current: null,
  loading: false,
  error: null,
  filters: {},

  fetchItems: async (filters?: DeliveryFilters) => {
    set({ loading: true, error: null });
    try {
      const f = filters || get().filters;
      const res = await deliveryApi.fetchDeliveries(f);
      if (res.code === 0) {
        set({ items: res.data, loading: false });
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
    set({ loading: true, error: null, filters: { productType }, items: [] });
    try {
      const res = await deliveryApi.fetchDeliveriesByProductType(productType);
      if (res.code === 0) {
        set({ items: res.data, loading: false });
      }
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  advanceStage: async (id, targetStage) => {
    const previousItems = get().items;
    const updateTasks = (delivery: Delivery): Delivery => {
      const targetIdx = delivery.stages.indexOf(targetStage);
      if (targetIdx === -1) return delivery;
      return {
        ...delivery,
        currentStage: targetStage,
        updatedAt: new Date().toISOString(),
        tasks: delivery.tasks.map((task, idx) => {
          const stageIdx = delivery.stages.findIndex((stage) => stage === task.title);
          const effectiveIdx = stageIdx === -1 ? idx : stageIdx;
          if (effectiveIdx < targetIdx) {
            return { ...task, status: '已完成' as const, completedAt: task.completedAt || new Date().toISOString() };
          }
          if (effectiveIdx === targetIdx) {
            return { ...task, status: '进行中' as const, completedAt: undefined };
          }
          return { ...task, status: '待开始' as const, completedAt: undefined };
        }),
      };
    };

    set({
      loading: false,
      error: null,
      items: previousItems.map((item) => (item.id === id ? updateTasks(item) : item)),
    });

    try {
      const res = await deliveryApi.advanceDeliveryStage(id, targetStage);
      if (res.code === 0 && res.data) {
        set({
          items: get().items.map((item) => (item.id === id ? res.data! : item)),
        });
      }
    } catch (e: any) {
      set({ error: e.message, loading: false, items: previousItems });
    }
  },

  setFilters: (filters) => set({ filters }),
  reset: () => set({ items: [], current: null, loading: false, error: null, filters: {} }),
}));

export default useDeliveryStore;
