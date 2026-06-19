import type { ApiResponse } from './types';
import { createErrorResponse, createSuccessResponse, delay } from './types';
import { getStorageData, removeStorageData, setStorageData } from './mock/storage';
import { initializeMockData } from './mock';
import { STORAGE_KEYS } from '../shared/utils/constants';
import {
  AUTH_SESSION_STORAGE_KEY,
  ensureAdminUser,
  hashPassword,
  normalizeAccount,
  verifyPassword,
} from '../shared/utils/auth';
import { toAuthenticatedUser } from '../shared/utils/permissions';
import type { AuthenticatedUser, AuthSession, LoginPayload, UserWithAuth } from '../types/auth';
import type { Role } from '../types/role';
import type { User } from '../types/settings';
import { v4 as uuidv4 } from 'uuid';

function ensureAuthData(): { users: UserWithAuth[]; roles: Role[] } {
  initializeMockData();
  const storedUsers = getStorageData<User[]>(STORAGE_KEYS.USERS) || [];
  const users = ensureAdminUser(storedUsers);
  setStorageData(STORAGE_KEYS.USERS, users);
  const roles = getStorageData<Role[]>(STORAGE_KEYS.ROLES) || [];
  return { users, roles };
}

function readSession(): AuthSession | null {
  return getStorageData<AuthSession>(AUTH_SESSION_STORAGE_KEY);
}

function writeSession(userId: string, remember: boolean): AuthSession {
  const now = new Date().toISOString();
  const session: AuthSession = {
    userId,
    token: `session-${uuidv4()}`,
    remember,
    createdAt: now,
    expiresAt: remember ? undefined : new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
  };
  setStorageData(AUTH_SESSION_STORAGE_KEY, session);
  return session;
}

function isExpired(session: AuthSession): boolean {
  return Boolean(session.expiresAt && new Date(session.expiresAt).getTime() <= Date.now());
}

async function login(payload: LoginPayload): Promise<ApiResponse<AuthenticatedUser | null>> {
  await delay(200);
  const { users, roles } = ensureAuthData();
  const account = normalizeAccount(payload.account);
  const user = users.find((item) => (
    normalizeAccount(item.account) === account
    || normalizeAccount(item.email) === account
    || normalizeAccount(item.phone) === account
  ));

  if (!user) return createErrorResponse('账号不存在');
  if (!user.isActive) return createErrorResponse('账号已停用，请联系管理员');
  if (!verifyPassword(payload.password, user.passwordSalt, user.passwordHash)) {
    return createErrorResponse('账号或密码错误');
  }

  const now = new Date().toISOString();
  const nextUsers = users.map((item) => (item.id === user.id ? { ...item, lastLoginAt: now, updatedAt: now } : item));
  setStorageData(STORAGE_KEYS.USERS, nextUsers);
  writeSession(user.id, payload.remember);
  const nextUser = nextUsers.find((item) => item.id === user.id)!;
  return createSuccessResponse(toAuthenticatedUser(nextUser, roles));
}

async function getCurrentUser(): Promise<ApiResponse<AuthenticatedUser | null>> {
  await delay(80);
  const session = readSession();
  if (!session || isExpired(session)) {
    removeStorageData(AUTH_SESSION_STORAGE_KEY);
    return createSuccessResponse(null);
  }

  const { users, roles } = ensureAuthData();
  const user = users.find((item) => item.id === session.userId && item.isActive);
  if (!user) {
    removeStorageData(AUTH_SESSION_STORAGE_KEY);
    return createSuccessResponse(null);
  }

  return createSuccessResponse(toAuthenticatedUser(user, roles));
}

async function logout(): Promise<ApiResponse<boolean>> {
  await delay(50);
  removeStorageData(AUTH_SESSION_STORAGE_KEY);
  return createSuccessResponse(true);
}

function createUserPasswordFields(userId: string, account: string, password: string) {
  const passwordSalt = `aaos-${userId}-${normalizeAccount(account)}-salt`;
  return {
    passwordSalt,
    passwordHash: hashPassword(password, passwordSalt),
    passwordUpdatedAt: new Date().toISOString(),
  };
}

export const authApi = {
  login,
  getCurrentUser,
  logout,
  ensureAuthData,
  createUserPasswordFields,
};
