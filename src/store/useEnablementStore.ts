import { create } from 'zustand';
import { enablementApi } from '../api';
import type { KnowledgeDocumentDto, KnowledgeSearchHit, KnowledgeWorkflowItemDto } from '../types/enablement';

type EnablementState = {
  knowledge: KnowledgeDocumentDto[];
  searchHits: KnowledgeSearchHit[];
  reviewQueue: KnowledgeWorkflowItemDto[];
  publicationQueue: KnowledgeWorkflowItemDto[];
  loading: boolean;
  error: string | null;
  loadKnowledge(): Promise<void>;
  searchKnowledge(query: string): Promise<void>;
  loadReviewQueue(): Promise<void>;
  loadPublicationQueue(): Promise<void>;
  reset(): void;
};

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : '知识服务暂时不可用，请稍后重试');

const useEnablementStore = create<EnablementState>((set) => ({
  knowledge: [],
  searchHits: [],
  reviewQueue: [],
  publicationQueue: [],
  loading: false,
  error: null,
  async loadKnowledge() {
    set({ loading: true, error: null });
    try {
      const result = await enablementApi.listKnowledge();
      set(result.code === 0
        ? { knowledge: result.data, loading: false }
        : { error: result.message, loading: false });
    } catch (error) {
      set({ error: errorMessage(error), loading: false });
    }
  },
  async searchKnowledge(query) {
    set({ loading: true, error: null });
    try {
      const result = await enablementApi.searchKnowledge(query.trim());
      set(result.code === 0
        ? { searchHits: result.data, loading: false }
        : { error: result.message, loading: false });
    } catch (error) {
      set({ error: errorMessage(error), loading: false });
    }
  },
  async loadReviewQueue() {
    set({ loading: true, error: null });
    try {
      const result = await enablementApi.listReviewQueue();
      set(result.code === 0
        ? { reviewQueue: result.data, loading: false }
        : { error: result.message, loading: false });
    } catch (error) {
      set({ error: errorMessage(error), loading: false });
    }
  },
  async loadPublicationQueue() {
    set({ loading: true, error: null });
    try {
      const result = await enablementApi.listPublicationQueue();
      set(result.code === 0
        ? { publicationQueue: result.data, loading: false }
        : { error: result.message, loading: false });
    } catch (error) {
      set({ error: errorMessage(error), loading: false });
    }
  },
  reset: () => set({
    knowledge: [],
    searchHits: [],
    reviewQueue: [],
    publicationQueue: [],
    loading: false,
    error: null,
  }),
}));

export default useEnablementStore;
