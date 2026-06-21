import { create } from 'zustand';
import { roleApi } from '../api';
import type { Role, RoleFilters } from '../types/role';

interface RoleState {
  items: Role[];
  current: Role | null;
  loading: boolean;
  error: string | null;
  fetchItems: (filters?: RoleFilters) => Promise<void>;
  fetchById: (id: string) => Promise<void>;
  create: (data: Omit<Role, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  update: (id: string, data: Partial<Role>) => Promise<void>;
  delete: (id: string) => Promise<void>;
  reset: () => void;
}

const useRoleStore = create<RoleState>((set, get) => ({
  items: [],
  current: null,
  loading: false,
  error: null,

  fetchItems: async (filters?: RoleFilters) => {
    set({ loading: true, error: null });
    try {
      const res = await roleApi.getRoles(filters);
      if (res.code === 0) {
        set({ items: res.data, loading: false });
      } else {
        throw new Error(res.message || '获取角色失败');
      }
    } catch (e: any) {
      set({ error: e.message, loading: false });
      throw e;
    }
  },

  fetchById: async (id) => {
    set({ loading: true, error: null });
    try {
      const res = await roleApi.getRoleById(id);
      if (res.code === 0) {
        set({ current: res.data, loading: false });
      } else {
        throw new Error(res.message || '获取角色失败');
      }
    } catch (e: any) {
      set({ error: e.message, loading: false });
      throw e;
    }
  },

  create: async (data) => {
    set({ loading: true, error: null });
    try {
      const res = await roleApi.createRole(data);
      if (res.code !== 0) throw new Error(res.message || '创建角色失败');
      await get().fetchItems();
    } catch (e: any) {
      set({ error: e.message, loading: false });
      throw e;
    }
  },

  update: async (id, data) => {
    set({ loading: true, error: null });
    try {
      const res = await roleApi.updateRole(id, data);
      if (res.code !== 0) throw new Error(res.message || '更新角色失败');
      await get().fetchItems();
    } catch (e: any) {
      set({ error: e.message, loading: false });
      throw e;
    }
  },

  delete: async (id) => {
    set({ loading: true, error: null });
    try {
      const res = await roleApi.deleteRole(id);
      if (res.code !== 0) throw new Error(res.message || '删除角色失败');
      await get().fetchItems();
    } catch (e: any) {
      set({ error: e.message, loading: false });
      throw e;
    }
  },

  reset: () => set({ items: [], current: null, loading: false, error: null }),
}));

export default useRoleStore;
