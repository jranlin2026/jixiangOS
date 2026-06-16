import { create } from 'zustand';
import { orderApi, refundApi } from '../api';
import type { Order, OrderFilters, OrderStats } from '../types/order';
import type { RefundStatus } from '../types/common';

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
  applyRefund: (orderId: string, refundData: { refundAmount: number; refundReason: string; refundCategory: string; applicantId: string; applicantName: string }) => Promise<void>;
  setFilters: (filters: OrderFilters) => void;
  reset: () => void;
}

const defaultPagination = { page: 1, pageSize: 20, total: 0, totalPages: 0 };

const useOrderStore = create<OrderState>((set, get) => ({
  items: [],
  current: null,
  stats: null,
  loading: false,
  error: null,
  filters: {},
  pagination: defaultPagination,

  fetchItems: async (filters?: OrderFilters) => {
    set({ loading: true, error: null });
    try {
      const f = filters || get().filters;
      const res = await orderApi.fetchOrders(f);
      if (res.code === 0) {
        set({ items: res.data.items, pagination: res.data.pagination, loading: false });
      }
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  fetchById: async (id) => {
    set({ loading: true, error: null });
    try {
      const res = await orderApi.fetchOrderById(id);
      if (res.code === 0) {
        set({ current: res.data, loading: false });
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
      await orderApi.createOrder(data);
      await get().fetchItems();
      await get().fetchStats();
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  update: async (id, data) => {
    set({ loading: true, error: null });
    try {
      await orderApi.updateOrder(id, data);
      await get().fetchItems();
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  delete: async (id) => {
    set({ loading: true, error: null });
    try {
      await orderApi.deleteOrder(id);
      await get().fetchItems();
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  applyRefund: async (orderId, refundData) => {
    set({ loading: true, error: null });
    try {
      const order = get().items.find((o) => o.id === orderId) || get().current;
      if (!order) {
        set({ error: '订单不存在', loading: false });
        return;
      }
      await refundApi.createRefund({
        orderId: order.id,
        orderNo: order.orderNo,
        customerId: order.customerId,
        customerName: order.customerName,
        productLevel: order.productLevel,
        orderAmount: order.amount,
        refundAmount: refundData.refundAmount,
        refundReason: refundData.refundReason,
        refundCategory: refundData.refundCategory as any,
        status: '退款申请中',
        applicantId: refundData.applicantId,
        applicantName: refundData.applicantName,
      });
      // 更新订单退款状态
      await orderApi.updateOrder(orderId, { refundStatus: '退款申请中', refundAmount: refundData.refundAmount, refundReason: refundData.refundReason });
      await get().fetchItems();
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  setFilters: (filters) => set({ filters }),
  reset: () => set({ items: [], current: null, stats: null, loading: false, error: null, filters: {}, pagination: defaultPagination }),
}));

export default useOrderStore;
