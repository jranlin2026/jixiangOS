import { create } from 'zustand';
import { aiApi } from '../api';
import type { AIAssistantWorkbench, AIQueryMessage, AIQuerySession } from '../types/ai';

interface AIState {
  sessions: AIQuerySession[];
  currentSession: AIQuerySession | null;
  workbench: AIAssistantWorkbench | null;
  loading: boolean;
  error: string | null;
  fetchWorkbench: () => Promise<void>;
  fetchSessions: () => Promise<void>;
  fetchSessionById: (id: string) => Promise<void>;
  sendQuery: (sessionId: string | null, query: string) => Promise<AIQueryMessage | null>;
  deleteSession: (id: string) => Promise<void>;
  reset: () => void;
}

const useAIStore = create<AIState>((set, get) => ({
  sessions: [],
  currentSession: null,
  workbench: null,
  loading: false,
  error: null,

  fetchWorkbench: async () => {
    try {
      const res = await aiApi.fetchAssistantWorkbench();
      if (res.code === 0) {
        set({ workbench: res.data });
      }
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  fetchSessions: async () => {
    set({ loading: true, error: null });
    try {
      const res = await aiApi.fetchSessions();
      if (res.code === 0) {
        set({ sessions: res.data, loading: false });
      }
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  fetchSessionById: async (id) => {
    set({ loading: true, error: null });
    try {
      const res = await aiApi.fetchSessionById(id);
      if (res.code === 0) {
        set({ currentSession: res.data, loading: false });
      }
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  sendQuery: async (sessionId, query) => {
    set({ loading: true, error: null });
    try {
      const res = await aiApi.sendQuery(sessionId, query);
      if (res.code === 0) {
        await get().fetchSessions();
        await get().fetchWorkbench();
        const sessions = get().sessions;
        const targetSession = sessionId
          ? sessions.find((s) => s.id === sessionId)
          : sessions[0];
        if (targetSession) {
          set({ currentSession: targetSession, loading: false });
        }
        return res.data;
      }
      set({ loading: false });
      return null;
    } catch (e: any) {
      set({ error: e.message, loading: false });
      return null;
    }
  },

  deleteSession: async (id) => {
    try {
      await aiApi.deleteSession(id);
      await get().fetchSessions();
      if (get().currentSession?.id === id) {
        set({ currentSession: null });
      }
    } catch { /* ignore */ }
  },

  reset: () => set({ sessions: [], currentSession: null, workbench: null, loading: false, error: null }),
}));

export default useAIStore;
