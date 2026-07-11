import { create } from 'zustand';
import { enablementApi } from '../api';
import type { KnowledgeDocumentDto, KnowledgeSearchHit, KnowledgeWorkflowItemDto } from '../types/enablement';

type EnablementState = {
  knowledge: KnowledgeDocumentDto[];
  searchHits: KnowledgeSearchHit[];
  reviewQueue: KnowledgeWorkflowItemDto[];
  publicationQueue: KnowledgeWorkflowItemDto[];
  loading: boolean;
  pendingRequests: number;
  error: string | null;
  loadKnowledge(): Promise<void>;
  searchKnowledge(query: string): Promise<void>;
  loadReviewQueue(): Promise<void>;
  loadPublicationQueue(): Promise<void>;
  reset(): void;
};

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : '知识服务暂时不可用，请稍后重试');

const beginRequest = (set: (partial: Partial<EnablementState> | ((state: EnablementState) => Partial<EnablementState>)) => void) => {
  set((state) => ({ pendingRequests: state.pendingRequests + 1, loading: true, error: null }));
};

const finishRequest = (set: (partial: Partial<EnablementState> | ((state: EnablementState) => Partial<EnablementState>)) => void) => {
  set((state) => {
    const pendingRequests = Math.max(0, state.pendingRequests - 1);
    return { pendingRequests, loading: pendingRequests > 0 };
  });
};

const useEnablementStore = create<EnablementState>((set) => ({
  knowledge: [],
  searchHits: [],
  reviewQueue: [],
  publicationQueue: [],
  loading: false,
  pendingRequests: 0,
  error: null,
  async loadKnowledge() {
    beginRequest(set);
    try {
      const result = await enablementApi.listKnowledge();
      set(result.code === 0 ? { knowledge: result.data } : { error: result.message });
    } catch (error) {
      set({ error: errorMessage(error) });
    } finally {
      finishRequest(set);
    }
  },
  async searchKnowledge(query) {
    beginRequest(set);
    try {
      const result = await enablementApi.searchKnowledge(query.trim());
      set(result.code === 0 ? { searchHits: result.data } : { error: result.message });
    } catch (error) {
      set({ error: errorMessage(error) });
    } finally {
      finishRequest(set);
    }
  },
  async loadReviewQueue() {
    beginRequest(set);
    try {
      const result = await enablementApi.listReviewQueue();
      set(result.code === 0 ? { reviewQueue: result.data } : { error: result.message });
    } catch (error) {
      set({ error: errorMessage(error) });
    } finally {
      finishRequest(set);
    }
  },
  async loadPublicationQueue() {
    beginRequest(set);
    try {
      const result = await enablementApi.listPublicationQueue();
      set(result.code === 0 ? { publicationQueue: result.data } : { error: result.message });
    } catch (error) {
      set({ error: errorMessage(error) });
    } finally {
      finishRequest(set);
    }
  },
  reset: () => set({
    knowledge: [],
    searchHits: [],
    reviewQueue: [],
    publicationQueue: [],
    loading: false,
    pendingRequests: 0,
    error: null,
  }),
}));

export default useEnablementStore;
