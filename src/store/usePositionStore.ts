import { create } from 'zustand';
import { positionApi } from '../api';
import type { Position, PositionFilters } from '../types/position';

interface PositionState {
  items: Position[];
  current: Position | null;
  loading: boolean;
  error: string | null;
  fetchItems: (filters?: PositionFilters) => Promise<void>;
  fetchById: (id: string) => Promise<void>;
  create: (data: Omit<Position, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  update: (id: string, data: Partial<Position>) => Promise<void>;
  delete: (id: string) => Promise<void>;
  reset: () => void;
}

const usePositionStore = create<PositionState>((set, get) => ({
  items: [],
  current: null,
  loading: false,
  error: null,

  fetchItems: async (filters?: PositionFilters) => {
    set({ loading: true, error: null });
    try {
      const res = await positionApi.getPositions(filters);
      if (res.code === 0) set({ items: res.data, loading: false });
      else throw new Error(res.message || '获取职位失败');
    } catch (e: any) {
      set({ error: e.message, loading: false });
      throw e;
    }
  },

  fetchById: async (id) => {
    set({ loading: true, error: null });
    try {
      const res = await positionApi.getPositionById(id);
      if (res.code === 0) set({ current: res.data, loading: false });
      else throw new Error(res.message || '获取职位失败');
    } catch (e: any) {
      set({ error: e.message, loading: false });
      throw e;
    }
  },

  create: async (data) => {
    set({ loading: true, error: null });
    try {
      const res = await positionApi.createPosition(data);
      if (res.code !== 0) throw new Error(res.message || '创建职位失败');
      await get().fetchItems();
    } catch (e: any) {
      set({ error: e.message, loading: false });
      throw e;
    }
  },

  update: async (id, data) => {
    set({ loading: true, error: null });
    try {
      const res = await positionApi.updatePosition(id, data);
      if (res.code !== 0) throw new Error(res.message || '更新职位失败');
      await get().fetchItems();
    } catch (e: any) {
      set({ error: e.message, loading: false });
      throw e;
    }
  },

  delete: async (id) => {
    set({ loading: true, error: null });
    try {
      const res = await positionApi.deletePosition(id);
      if (res.code !== 0) throw new Error(res.message || '删除职位失败');
      await get().fetchItems();
    } catch (e: any) {
      set({ error: e.message, loading: false });
      throw e;
    }
  },

  reset: () => set({ items: [], current: null, loading: false, error: null }),
}));

export default usePositionStore;
