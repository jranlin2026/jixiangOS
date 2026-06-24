import type { ApiResponse } from './types';

const BACKEND_SESSION_KEY = 'aaos_backend_auth_token';

function readEnv(name: string): string | undefined {
  const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  const nodeEnv = typeof process !== 'undefined' ? process.env[name] : undefined;
  return viteEnv?.[name] || nodeEnv;
}

export function shouldUseBackendApi(): boolean {
  return readEnv('VITE_USE_BACKEND_API') === 'true';
}

export function getBackendBaseUrl(): string {
  return (readEnv('VITE_AI_API_BASE') || '/api').replace(/\/$/, '');
}

export function readBackendToken(): string | null {
  return localStorage.getItem(BACKEND_SESSION_KEY);
}

export function writeBackendToken(token: string): void {
  localStorage.setItem(BACKEND_SESSION_KEY, token);
}

export function clearBackendToken(): void {
  localStorage.removeItem(BACKEND_SESSION_KEY);
}

export async function backendRequest<T>(path: string, init: RequestInit = {}): Promise<ApiResponse<T>> {
  const token = readBackendToken();
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${getBackendBaseUrl()}${path}`, {
    ...init,
    headers,
  });
  const data = await response.json() as ApiResponse<T>;
  return data;
}

let storageHydratedAt = 0;
let storageHydrationPromise: Promise<void> | null = null;

export async function syncBackendStorageFromServer(maxAgeMs = 1000): Promise<void> {
  if (!shouldUseBackendApi() || typeof localStorage === 'undefined') return;
  if (Date.now() - storageHydratedAt < maxAgeMs) return;
  if (storageHydrationPromise) return storageHydrationPromise;

  storageHydrationPromise = backendRequest<Record<string, unknown>>('/storage')
    .then((response) => {
      if (response.code !== 0 || !response.data) return;
      Object.entries(response.data).forEach(([key, value]) => {
        localStorage.setItem(key, JSON.stringify(value));
      });
      storageHydratedAt = Date.now();
    })
    .catch(() => {
      // Keep the local cache usable when the backend is temporarily unavailable.
    })
    .finally(() => {
      storageHydrationPromise = null;
    });

  return storageHydrationPromise;
}

export function persistBackendStorageValue(key: string, value: unknown): void {
  if (!shouldUseBackendApi()) return;
  void backendRequest(`/storage/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  }).catch(() => undefined);
}

export function removeBackendStorageValue(key: string): void {
  if (!shouldUseBackendApi()) return;
  void backendRequest(`/storage/${encodeURIComponent(key)}`, {
    method: 'DELETE',
  }).catch(() => undefined);
}

export function clearBackendStorageValues(): void {
  if (!shouldUseBackendApi()) return;
  void backendRequest('/storage', {
    method: 'DELETE',
  }).catch(() => undefined);
}
