import { create } from 'zustand';
import { orderApi } from '../api';
import type { OrderStats } from '../types/order';

interface DashboardState {
  stats: OrderStats | null;
  loading: boolean;
  error: string | null;
  fetchStats: () => Promise<void>;
  reset: () => void;
}

const useDashboardStore = create<DashboardState>((set) => ({
  stats: null,
  loading: false,
  error: null,

  fetchStats: async () => {
    set({ loading: true, error: null });
    try {
      const res = await orderApi.fetchOrderStats();
      if (res.code === 0) {
        set({ stats: res.data, loading: false });
      } else {
        set({ error: res.message, loading: false });
      }
    } catch (e: any) {
      set({ error: e.message || '获取统计数据失败', loading: false });
    }
  },

  reset: () => set({ stats: null, loading: false, error: null }),
}));

export default useDashboardStore;
