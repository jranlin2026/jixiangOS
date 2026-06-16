import { create } from 'zustand';
import { financeApi } from '../api';
import type { FinanceDailyRecord, ChannelROI, FinanceStats, FinanceFilters } from '../types/finance';

interface FinanceState {
  dailyRecords: FinanceDailyRecord[];
  channelROI: ChannelROI[];
  stats: FinanceStats | null;
  loading: boolean;
  error: string | null;
  filters: FinanceFilters;
  fetchDailyRecords: (filters?: FinanceFilters) => Promise<void>;
  fetchChannelROI: () => Promise<void>;
  fetchStats: (filters?: FinanceFilters) => Promise<void>;
  setFilters: (filters: FinanceFilters) => void;
  reset: () => void;
}

const useFinanceStore = create<FinanceState>((set, get) => ({
  dailyRecords: [],
  channelROI: [],
  stats: null,
  loading: false,
  error: null,
  filters: {},

  fetchDailyRecords: async (filters?: FinanceFilters) => {
    set({ loading: true, error: null });
    try {
      const res = await financeApi.fetchFinanceDailyRecords(filters || get().filters);
      if (res.code === 0) {
        set({ dailyRecords: res.data, loading: false });
      }
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  fetchChannelROI: async () => {
    try {
      const res = await financeApi.fetchChannelROI();
      if (res.code === 0) set({ channelROI: res.data });
    } catch { /* ignore */ }
  },

  fetchStats: async (filters?: FinanceFilters) => {
    try {
      const res = await financeApi.fetchFinanceStats(filters || get().filters);
      if (res.code === 0) set({ stats: res.data });
    } catch { /* ignore */ }
  },

  setFilters: (filters) => set({ filters }),
  reset: () => set({ dailyRecords: [], channelROI: [], stats: null, loading: false, error: null, filters: {} }),
}));

export default useFinanceStore;
