import { create } from 'zustand';
import { authApi } from '../api/authApi';
import type { AuthenticatedUser, LoginPayload } from '../types/auth';
import { resetSessionStores } from './resetSessionStores';

interface AuthState {
  currentUser: AuthenticatedUser | null;
  loading: boolean;
  initialized: boolean;
  error: string | null;
  bootstrap: () => Promise<void>;
  login: (payload: LoginPayload) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const useAuthStore = create<AuthState>((set) => ({
  currentUser: null,
  loading: true,
  initialized: false,
  error: null,

  bootstrap: async () => {
    set({ loading: true, error: null });
    try {
      const res = await authApi.getCurrentUser();
      resetSessionStores();
      set({ currentUser: res.code === 0 ? res.data : null, loading: false, initialized: true });
    } catch (error: any) {
      resetSessionStores();
      set({ currentUser: null, error: error.message, loading: false, initialized: true });
    }
  },

  login: async (payload) => {
    set({ loading: true, error: null });
    try {
      const res = await authApi.login(payload);
      if (res.code !== 0 || !res.data) {
        set({ currentUser: null, error: res.message || '登录失败', loading: false, initialized: true });
        return false;
      }
      resetSessionStores();
      set({ currentUser: res.data, loading: false, initialized: true });
      return true;
    } catch (error: any) {
      set({ currentUser: null, error: error.message, loading: false, initialized: true });
      return false;
    }
  },

  logout: async () => {
    await authApi.logout();
    resetSessionStores();
    set({ currentUser: null, loading: false, initialized: true, error: null });
  },

  clearError: () => set({ error: null }),
}));

export default useAuthStore;
