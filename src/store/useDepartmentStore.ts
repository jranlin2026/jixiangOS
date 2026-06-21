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
      } else {
        throw new Error(res.message || '获取部门失败');
      }
    } catch (e: any) {
      set({ error: e.message, loading: false });
      throw e;
    }
  },

  fetchById: async (id) => {
    set({ loading: true, error: null });
    try {
      const res = await departmentApi.getDepartmentById(id);
      if (res.code === 0) {
        set({ current: res.data, loading: false });
      } else {
        throw new Error(res.message || '获取部门失败');
      }
    } catch (e: any) {
      set({ error: e.message, loading: false });
      throw e;
    }
  },

  create: async (data) => {
    set({ loading: true, error: null });
    try {
      const res = await departmentApi.createDepartment(data);
      if (res.code !== 0) throw new Error(res.message || '创建部门失败');
      await get().fetchItems();
    } catch (e: any) {
      set({ error: e.message, loading: false });
      throw e;
    }
  },

  update: async (id, data) => {
    set({ loading: true, error: null });
    try {
      const res = await departmentApi.updateDepartment(id, data);
      if (res.code !== 0) throw new Error(res.message || '更新部门失败');
      await get().fetchItems();
    } catch (e: any) {
      set({ error: e.message, loading: false });
      throw e;
    }
  },

  delete: async (id) => {
    set({ loading: true, error: null });
    try {
      const res = await departmentApi.deleteDepartment(id);
      if (res.code !== 0) throw new Error(res.message || '删除部门失败');
      await get().fetchItems();
    } catch (e: any) {
      set({ error: e.message, loading: false });
      throw e;
    }
  },

  reset: () => set({ items: [], current: null, loading: false, error: null }),
}));

export default useDepartmentStore;
