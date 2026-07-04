import { AUTH_SESSION_STORAGE_KEY } from '../shared/utils/auth';
import type { ApiResponse } from './types';

const BACKEND_SESSION_KEY = 'aaos_backend_auth_token';
const LOCAL_ONLY_STORAGE_KEYS = new Set([AUTH_SESSION_STORAGE_KEY, BACKEND_SESSION_KEY]);

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

function jsonContentType(response: Response): boolean {
  return (response.headers.get('content-type') || '').toLowerCase().includes('application/json');
}

function jsonLikeText(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
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
  const text = await response.text();
  let data: ApiResponse<T> | null = null;

  if (text && (jsonContentType(response) || jsonLikeText(text))) {
    try {
      data = JSON.parse(text) as ApiResponse<T>;
    } catch {
      data = null;
    }
  }

  if (data) {
    if (response.status === 401) clearBackendToken();
    return data;
  }

  if (response.status === 401) clearBackendToken();
  return {
    code: response.status || -1,
    data: null as T,
    message: text && !text.trim().startsWith('<')
      ? text
      : `Backend request failed with HTTP ${response.status}`,
  };
}

let storageHydratedAt = 0;
let storageHydrationPromise: Promise<void> | null = null;
const pendingStorageWriteKeys = new Set<string>();
const pendingStorageWritePromises = new Set<Promise<void>>();
const storageWriteProtectedUntil = new Map<string, number>();
const STORAGE_WRITE_PROTECTION_MS = 5000;

function protectStorageKeyFromHydration(key: string): void {
  storageWriteProtectedUntil.set(key, Date.now() + STORAGE_WRITE_PROTECTION_MS);
}

function isStorageKeyProtectedFromHydration(key: string): boolean {
  if (pendingStorageWriteKeys.has(key)) return true;
  const protectedUntil = storageWriteProtectedUntil.get(key) || 0;
  if (protectedUntil > Date.now()) return true;
  storageWriteProtectedUntil.delete(key);
  return false;
}

function isLocalOnlyStorageKey(key: string): boolean {
  return LOCAL_ONLY_STORAGE_KEYS.has(key);
}

export async function syncBackendStorageFromServer(maxAgeMs = 1000): Promise<void> {
  if (!shouldUseBackendApi() || typeof localStorage === 'undefined') return;
  if (Date.now() - storageHydratedAt < maxAgeMs) return;
  if (storageHydrationPromise) return storageHydrationPromise;

  storageHydrationPromise = backendRequest<Record<string, unknown>>('/storage')
    .then((response) => {
      if (response.code !== 0 || !response.data) return;
      Object.entries(response.data).forEach(([key, value]) => {
        if (isLocalOnlyStorageKey(key)) return;
        if (isStorageKeyProtectedFromHydration(key)) return;
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
  if (isLocalOnlyStorageKey(key)) return;
  pendingStorageWriteKeys.add(key);
  protectStorageKeyFromHydration(key);
  const writePromise = backendRequest(`/storage/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  })
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => {
      pendingStorageWriteKeys.delete(key);
      protectStorageKeyFromHydration(key);
      pendingStorageWritePromises.delete(writePromise);
    });
  pendingStorageWritePromises.add(writePromise);
}

export function removeBackendStorageValue(key: string): void {
  if (!shouldUseBackendApi()) return;
  if (isLocalOnlyStorageKey(key)) return;
  pendingStorageWriteKeys.add(key);
  protectStorageKeyFromHydration(key);
  const writePromise = backendRequest(`/storage/${encodeURIComponent(key)}`, {
    method: 'DELETE',
  })
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => {
      pendingStorageWriteKeys.delete(key);
      protectStorageKeyFromHydration(key);
      pendingStorageWritePromises.delete(writePromise);
    });
  pendingStorageWritePromises.add(writePromise);
}

export function clearBackendStorageValues(): void {
  if (!shouldUseBackendApi()) return;
  void backendRequest('/storage', {
    method: 'DELETE',
  }).catch(() => undefined);
}

export async function flushBackendStorageWrites(): Promise<void> {
  if (!shouldUseBackendApi()) return;
  const writes = Array.from(pendingStorageWritePromises);
  if (!writes.length) return;
  await Promise.allSettled(writes);
}
