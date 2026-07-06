import { create } from 'zustand';
import { assetApi } from '../api';
import type {
  AssetDashboard,
  AssetDetailBundle,
  AssetDevice,
  AssetDeviceInput,
  AssetFilters,
  AssetImportResult,
  AssetImportType,
  AssetInternetAccount,
  AssetInternetAccountInput,
  AssetOffboardingTask,
  AssetOperationLog,
  AssetPhoneNumber,
  AssetPhoneNumberInput,
  AssetRisk,
  AssetRiskStatus,
  AssetSensitiveField,
  AssetSensitiveRevealResult,
  AssetType,
} from '../types/asset';

type AssetPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

interface AssetState {
  dashboard: AssetDashboard | null;
  devices: AssetDevice[];
  phones: AssetPhoneNumber[];
  accounts: AssetInternetAccount[];
  risks: AssetRisk[];
  logs: AssetOperationLog[];
  offboardingTasks: AssetOffboardingTask[];
  detail: AssetDetailBundle | null;
  pagination: AssetPagination;
  loading: boolean;
  error: string | null;
  fetchDashboard: () => Promise<void>;
  fetchDevices: (filters?: AssetFilters) => Promise<void>;
  fetchPhones: (filters?: AssetFilters) => Promise<void>;
  fetchAccounts: (filters?: AssetFilters) => Promise<void>;
  fetchRisks: (filters?: AssetFilters) => Promise<void>;
  fetchLogs: (filters?: AssetFilters) => Promise<void>;
  fetchOffboardingTasks: (filters?: AssetFilters) => Promise<void>;
  fetchDetail: (type: AssetType, id: string) => Promise<void>;
  createDevice: (input: Partial<AssetDeviceInput>) => Promise<AssetDevice | null>;
  updateDevice: (id: string, input: Partial<AssetDeviceInput>) => Promise<AssetDevice | null>;
  deleteDevice: (id: string) => Promise<AssetDevice | null>;
  createPhone: (input: Partial<AssetPhoneNumberInput>) => Promise<AssetPhoneNumber | null>;
  updatePhone: (id: string, input: Partial<AssetPhoneNumberInput>) => Promise<AssetPhoneNumber | null>;
  deletePhone: (id: string) => Promise<AssetPhoneNumber | null>;
  createAccount: (input: Partial<AssetInternetAccountInput>) => Promise<AssetInternetAccount | null>;
  updateAccount: (id: string, input: Partial<AssetInternetAccountInput>) => Promise<AssetInternetAccount | null>;
  deleteAccount: (id: string) => Promise<AssetInternetAccount | null>;
  updateRiskStatus: (riskId: string, status: AssetRiskStatus) => Promise<void>;
  completeOffboardingTask: (taskId: string) => Promise<void>;
  revealSensitiveField: (type: AssetType, id: string, field: AssetSensitiveField) => Promise<AssetSensitiveRevealResult | null>;
  importAssetsFromCsv: (type: AssetImportType, csvText: string) => Promise<AssetImportResult | null>;
  clearDetail: () => void;
}

const emptyPagination: AssetPagination = {
  page: 1,
  pageSize: 10,
  total: 0,
  totalPages: 1,
};

const useAssetStore = create<AssetState>((set, get) => ({
  dashboard: null,
  devices: [],
  phones: [],
  accounts: [],
  risks: [],
  logs: [],
  offboardingTasks: [],
  detail: null,
  pagination: emptyPagination,
  loading: false,
  error: null,

  fetchDashboard: async () => {
    const res = await assetApi.fetchDashboard();
    if (res.code === 0) set({ dashboard: res.data });
  },

  fetchDevices: async (filters) => {
    set({ loading: true, error: null });
    try {
      const res = await assetApi.fetchDevices(filters);
      if (res.code === 0) set({ devices: res.data.items, pagination: res.data.pagination, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  fetchPhones: async (filters) => {
    set({ loading: true, error: null });
    try {
      const res = await assetApi.fetchPhoneNumbers(filters);
      if (res.code === 0) set({ phones: res.data.items, pagination: res.data.pagination, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  fetchAccounts: async (filters) => {
    set({ loading: true, error: null });
    try {
      const res = await assetApi.fetchInternetAccounts(filters);
      if (res.code === 0) set({ accounts: res.data.items, pagination: res.data.pagination, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  fetchRisks: async (filters) => {
    set({ loading: true, error: null });
    try {
      const res = await assetApi.fetchRisks(filters);
      if (res.code === 0) set({ risks: res.data.items, pagination: res.data.pagination, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  fetchLogs: async (filters) => {
    set({ loading: true, error: null });
    try {
      const res = await assetApi.fetchOperationLogs(filters);
      if (res.code === 0) set({ logs: res.data.items, pagination: res.data.pagination, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  fetchOffboardingTasks: async (filters) => {
    set({ loading: true, error: null });
    try {
      const res = await assetApi.fetchOffboardingTasks(filters);
      if (res.code === 0) set({ offboardingTasks: res.data.items, pagination: res.data.pagination, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  fetchDetail: async (type, id) => {
    const res = await assetApi.fetchDetail(type, id);
    if (res.code === 0) set({ detail: res.data });
  },

  createDevice: async (input) => {
    const res = await assetApi.createDevice(input);
    if (res.code !== 0) {
      set({ error: res.message });
      return null;
    }
    await get().fetchDashboard();
    return res.data;
  },

  updateDevice: async (id, input) => {
    const res = await assetApi.updateDevice(id, input);
    if (res.code !== 0) {
      set({ error: res.message });
      return null;
    }
    await get().fetchDashboard();
    await get().fetchDetail('device', id);
    return res.data;
  },

  deleteDevice: async (id) => {
    const res = await assetApi.deleteDevice(id);
    if (res.code !== 0) {
      set({ error: res.message });
      return null;
    }
    await get().fetchDashboard();
    return res.data;
  },

  createPhone: async (input) => {
    const res = await assetApi.createPhoneNumber(input);
    if (res.code !== 0) {
      set({ error: res.message });
      return null;
    }
    await get().fetchDashboard();
    return res.data;
  },

  updatePhone: async (id, input) => {
    const res = await assetApi.updatePhoneNumber(id, input);
    if (res.code !== 0) {
      set({ error: res.message });
      return null;
    }
    await get().fetchDashboard();
    await get().fetchDetail('phone', id);
    return res.data;
  },

  deletePhone: async (id) => {
    const res = await assetApi.deletePhoneNumber(id);
    if (res.code !== 0) {
      set({ error: res.message });
      return null;
    }
    await get().fetchDashboard();
    return res.data;
  },

  createAccount: async (input) => {
    const res = await assetApi.createInternetAccount(input);
    if (res.code !== 0) {
      set({ error: res.message });
      return null;
    }
    await get().fetchDashboard();
    return res.data;
  },

  updateAccount: async (id, input) => {
    const res = await assetApi.updateInternetAccount(id, input);
    if (res.code !== 0) {
      set({ error: res.message });
      return null;
    }
    await get().fetchDashboard();
    await get().fetchDetail('account', id);
    return res.data;
  },

  deleteAccount: async (id) => {
    const res = await assetApi.deleteInternetAccount(id);
    if (res.code !== 0) {
      set({ error: res.message });
      return null;
    }
    await get().fetchDashboard();
    return res.data;
  },

  updateRiskStatus: async (riskId, status) => {
    const res = await assetApi.updateRiskStatus(riskId, status);
    if (res.code === 0) {
      set({ risks: get().risks.map((risk) => (risk.id === riskId && res.data ? res.data : risk)) });
      await get().fetchDashboard();
    }
  },

  completeOffboardingTask: async (taskId) => {
    const res = await assetApi.completeOffboardingTask(taskId);
    if (res.code === 0) {
      set({ offboardingTasks: get().offboardingTasks.map((task) => (task.id === taskId && res.data ? res.data : task)) });
      await get().fetchDashboard();
    }
  },

  revealSensitiveField: async (type, id, field) => {
    const res = await assetApi.revealSensitiveField(type, id, field);
    if (res.code !== 0) {
      set({ error: res.message });
      return null;
    }
    await get().fetchDetail(type, id);
    return res.data;
  },

  importAssetsFromCsv: async (type, csvText) => {
    set({ loading: true, error: null });
    const res = await assetApi.importAssetsFromCsv(type, csvText);
    set({ loading: false });
    if (res.code !== 0) {
      set({ error: res.message });
      return null;
    }
    await get().fetchDashboard();
    return res.data;
  },

  clearDetail: () => set({ detail: null }),
}));

export default useAssetStore;
