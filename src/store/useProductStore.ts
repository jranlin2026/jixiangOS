import { create } from 'zustand';
import { productApi } from '../api';
import type { Product } from '../types/product';

interface ProductState {
  items: Product[];
  current: Product | null;
  loading: boolean;
  error: string | null;
  fetchItems: () => Promise<void>;
  fetchById: (id: string) => Promise<void>;
  create: (data: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  update: (id: string, data: Partial<Product>) => Promise<void>;
  delete: (id: string) => Promise<void>;
  reset: () => void;
}

const useProductStore = create<ProductState>((set, get) => ({
  items: [],
  current: null,
  loading: false,
  error: null,

  fetchItems: async () => {
    set({ loading: true, error: null });
    try {
      const res = await productApi.getProducts();
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
      const res = await productApi.getProductById(id);
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
      await productApi.createProduct(data);
      await get().fetchItems();
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  update: async (id, data) => {
    set({ loading: true, error: null });
    try {
      await productApi.updateProduct(id, data);
      await get().fetchItems();
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  delete: async (id) => {
    set({ loading: true, error: null });
    try {
      await productApi.deleteProduct(id);
      await get().fetchItems();
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  reset: () => set({ items: [], current: null, loading: false, error: null }),
}));

export default useProductStore;
