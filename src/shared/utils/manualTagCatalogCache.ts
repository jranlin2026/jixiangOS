import type { ApiResponse } from '../../api/types';
import type { CustomerTagCatalog } from '../../types/tag';

export type ManualTagCatalogScope = 'lead' | 'customer';
export type ManualTagCatalogState = {
  catalog?: CustomerTagCatalog;
  loading: boolean;
  error: string;
  fetchedAt?: number;
};

type FetchCatalog = (scope: ManualTagCatalogScope) => Promise<ApiResponse<CustomerTagCatalog>>;
type Listener = () => void;

export function createManualTagCatalogCache(
  fetchCatalog: FetchCatalog,
  ttlMs = 60_000,
  now: () => number = Date.now,
) {
  const states = new Map<ManualTagCatalogScope, ManualTagCatalogState>();
  const requests = new Map<ManualTagCatalogScope, { generation: number; promise: Promise<void> }>();
  const generations = new Map<ManualTagCatalogScope, number>();
  const listeners = new Map<ManualTagCatalogScope, Set<Listener>>();

  const generation = (scope: ManualTagCatalogScope) => generations.get(scope) || 0;
  const notify = (scope: ManualTagCatalogScope) => {
    listeners.get(scope)?.forEach((listener) => listener());
  };

  const load = (scope: ManualTagCatalogScope, retry = false): Promise<void> => {
    const currentGeneration = generation(scope);
    const cached = states.get(scope);
    if (!retry && cached?.catalog && now() - (cached.fetchedAt || 0) < ttlMs) return Promise.resolve();
    const currentRequest = requests.get(scope);
    if (currentRequest?.generation === currentGeneration) return currentRequest.promise;

    states.set(scope, { ...cached, loading: true, error: '' });
    const promise = Promise.resolve()
      .then(() => fetchCatalog(scope))
      .then((response) => {
        if (generation(scope) !== currentGeneration) return;
        if (response.code !== 0 || !response.data) throw new Error(response.message || '标签目录加载失败');
        states.set(scope, { catalog: response.data, loading: false, error: '', fetchedAt: now() });
      })
      .catch((reason) => {
        if (generation(scope) !== currentGeneration) return;
        states.set(scope, { loading: false, error: reason instanceof Error ? reason.message : '标签目录加载失败' });
      })
      .finally(() => {
        if (requests.get(scope)?.promise === promise) requests.delete(scope);
        if (generation(scope) === currentGeneration) notify(scope);
      });
    // Register before notifying: mounted subscribers may immediately request a
    // reload, and must deduplicate onto this exact generation's request.
    requests.set(scope, { generation: currentGeneration, promise });
    notify(scope);
    return promise;
  };

  const invalidate = (scope?: ManualTagCatalogScope) => {
    const scopes: ManualTagCatalogScope[] = scope ? [scope] : ['lead', 'customer'];
    scopes.forEach((item) => {
      generations.set(item, generation(item) + 1);
      states.delete(item);
      requests.delete(item);
      notify(item);
    });
  };

  const subscribe = (scope: ManualTagCatalogScope, listener: Listener) => {
    const scoped = listeners.get(scope) || new Set<Listener>();
    scoped.add(listener);
    listeners.set(scope, scoped);
    return () => { scoped.delete(listener); };
  };

  return {
    getState: (scope: ManualTagCatalogScope): ManualTagCatalogState => states.get(scope) || { loading: true, error: '' },
    getGeneration: (scope: ManualTagCatalogScope) => generation(scope),
    invalidate,
    load,
    subscribe,
  };
}
