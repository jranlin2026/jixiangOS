import { create } from 'zustand';
import { departmentApi } from '../api';
import type { Department, DepartmentFilters } from '../types/department';

interface DepartmentState {
  items: Department[];
  current: Department | null;
  loading: boolean;
  error: string | null;
  fetchItems: (filters?: DepartmentFilters) => Promise<void>;
  fetchById: (id: string) => Promise<void>;
  create: (data: Omit<Department, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  update: (id: string, data: Partial<Department>) => Promise<void>;
  delete: (id: string) => Promise<void>;
  reset: () => void;
}

const useDepartmentStore = create<DepartmentState>((set, get) => ({
  items: [],
  current: null,
  loading: false,
  error: null,

  fetchItems: async (filters?: DepartmentFilters) => {
    set({ loading: true, error: null });
    try {
      const res = await departmentApi.getDepartments(filters);
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
      const res = await departmentApi.getDepartmentById(id);
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
      await departmentApi.createDepartment(data);
      await get().fetchItems();
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  update: async (id, data) => {
    set({ loading: true, error: null });
    try {
      await departmentApi.updateDepartment(id, data);
      await get().fetchItems();
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  delete: async (id) => {
    set({ loading: true, error: null });
    try {
      await departmentApi.deleteDepartment(id);
      await get().fetchItems();
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  reset: () => set({ items: [], current: null, loading: false, error: null }),
}));

export default useDepartmentStore;
