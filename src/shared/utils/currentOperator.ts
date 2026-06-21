import type { AuthSession } from '../../types/auth';
import type { User } from '../../types/settings';
import { AUTH_SESSION_STORAGE_KEY } from './auth';
import { STORAGE_KEYS } from './constants';

export const SYSTEM_OPERATOR = '系统';

function readLocalStorageJson<T>(key: string): T | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function cleanName(value?: string): string {
  return String(value || '').trim();
}

function isSessionValid(session: AuthSession | null): session is AuthSession {
  if (!session?.userId) return false;
  if (!session.expiresAt) return true;
  return new Date(session.expiresAt).getTime() > Date.now();
}

export function getCurrentOperatorName(fallback = SYSTEM_OPERATOR): string {
  const safeFallback = cleanName(fallback) || SYSTEM_OPERATOR;
  const session = readLocalStorageJson<AuthSession>(AUTH_SESSION_STORAGE_KEY);
  if (!isSessionValid(session)) return safeFallback;

  const users = readLocalStorageJson<User[]>(STORAGE_KEYS.USERS) || [];
  const currentUser = users.find((user) => user.id === session.userId);
  return cleanName(currentUser?.name) || safeFallback;
}

export function getCurrentOperatorUser(): User | null {
  const session = readLocalStorageJson<AuthSession>(AUTH_SESSION_STORAGE_KEY);
  if (!isSessionValid(session)) return null;

  const users = readLocalStorageJson<User[]>(STORAGE_KEYS.USERS) || [];
  return users.find((user) => user.id === session.userId) || null;
}
