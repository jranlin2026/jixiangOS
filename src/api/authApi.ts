import type { ApiResponse } from './types';
import { createErrorResponse, createSuccessResponse, delay } from './types';
import { getStorageData, removeStorageData, setStorageData } from './mock/storage';
import { initializeMockData } from './mock';
import { STORAGE_KEYS } from '../shared/utils/constants';
import {
  AUTH_SESSION_STORAGE_KEY,
  createPasswordSalt,
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
import { ensureOrganizationConfigData, migrateUsersWithOrganization } from '../shared/utils/organizationConfig';
import {
  backendRequest,
  clearBackendToken,
  flushBackendStorageWrites,
  shouldUseBackendApi,
  syncBackendStorageFromServer,
  writeBackendToken,
} from './backendClient';

const SESSION_SCOPED_STORAGE_KEYS = [
  STORAGE_KEYS.ORDERS,
  STORAGE_KEYS.ORDER_APPLICATIONS,
  STORAGE_KEYS.DELIVERIES,
  STORAGE_KEYS.RECOVERY_ORDERS,
  STORAGE_KEYS.ASSET_DEVICES,
  STORAGE_KEYS.ASSET_PHONE_NUMBERS,
  STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS,
  STORAGE_KEYS.ASSET_RISKS,
  STORAGE_KEYS.ASSET_OPERATION_LOGS,
  STORAGE_KEYS.ASSET_OFFBOARDING_TASKS,
];

function clearSessionScopedStorageCache(): void {
  if (typeof localStorage === 'undefined') return;
  SESSION_SCOPED_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
}

function setLocalCache<T>(key: string, value: T): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(value));
}

function ensureAuthData(): { users: UserWithAuth[]; roles: Role[] } {
  initializeMockData();
  const storedUsers = getStorageData<User[]>(STORAGE_KEYS.USERS) || [];
  ensureOrganizationConfigData();
  const users = migrateUsersWithOrganization(ensureAdminUser(storedUsers)) as UserWithAuth[];
  setStorageData(STORAGE_KEYS.USERS, users);
  const roles = ensureOrganizationConfigData().roles;
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

function cacheBackendAuthenticatedUser(user: AuthenticatedUser, token?: string, remember = true): void {
  const now = new Date().toISOString();
  setLocalCache(AUTH_SESSION_STORAGE_KEY, {
    userId: user.id,
    token: token || `backend-${user.id}`,
    remember,
    createdAt: now,
    expiresAt: remember ? undefined : new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
  });

  const users = getStorageData<User[]>(STORAGE_KEYS.USERS) || [];
  const cachedUser: User = {
    ...(users.find((item) => item.id === user.id) || {}),
    id: user.id,
    name: user.name,
    account: user.account,
    email: user.email,
    phone: user.phone,
    role: user.role,
    roleId: user.roleId,
    departmentId: user.departmentId,
    positionId: user.positionId,
    positionName: user.positionName,
    avatar: user.avatar,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    mustChangePassword: user.mustChangePassword,
    employmentStatus: 'active',
    createdAt: users.find((item) => item.id === user.id)?.createdAt || now,
    updatedAt: now,
  };
  setLocalCache(STORAGE_KEYS.USERS, [cachedUser, ...users.filter((item) => item.id !== user.id)]);

  const roles = getStorageData<Role[]>(STORAGE_KEYS.ROLES) || [];
  const cachedRole: Role = {
    ...(roles.find((item) => item.id === user.roleId || item.name === user.role) || {}),
    id: user.roleId || `role-${user.role}`,
    name: user.role,
    code: roles.find((item) => item.id === user.roleId || item.name === user.role)?.code || '',
    permissions: user.permissions,
    memberCount: roles.find((item) => item.id === user.roleId || item.name === user.role)?.memberCount || 0,
    isActive: true,
    createdAt: roles.find((item) => item.id === user.roleId || item.name === user.role)?.createdAt || now,
    updatedAt: now,
  };
  setLocalCache(STORAGE_KEYS.ROLES, [cachedRole, ...roles.filter((item) => item.id !== cachedRole.id && item.name !== cachedRole.name)]);
}

async function login(payload: LoginPayload): Promise<ApiResponse<AuthenticatedUser | null>> {
  if (shouldUseBackendApi()) {
    await flushBackendStorageWrites();
    clearSessionScopedStorageCache();
    const response = await backendRequest<{ token: string; user: AuthenticatedUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (response.code !== 0 || !response.data) return createErrorResponse(response.message, response.code);
    writeBackendToken(response.data.token);
    cacheBackendAuthenticatedUser(response.data.user, response.data.token, payload.remember);
    await syncBackendStorageFromServer(0);
    return createSuccessResponse(response.data.user);
  }

  await delay(200);
  const { users, roles } = ensureAuthData();
  const account = normalizeAccount(payload.account);
  const user = users.find((item) => (
    normalizeAccount(item.account) === account
    || normalizeAccount(item.email) === account
    || normalizeAccount(item.phone) === account
  ));

  if (!user) return createErrorResponse('账号不存在');
  if ((user.employmentStatus || 'active') === 'left') return createErrorResponse('账号已离职，请联系管理员');
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
  if (shouldUseBackendApi()) {
    const response = await backendRequest<AuthenticatedUser | null>('/auth/me');
    if (response.code === 0 && response.data) cacheBackendAuthenticatedUser(response.data);
    return response;
  }

  await delay(80);
  const session = readSession();
  if (!session || isExpired(session)) {
    removeStorageData(AUTH_SESSION_STORAGE_KEY);
    return createSuccessResponse(null);
  }

  const { users, roles } = ensureAuthData();
  const user = users.find((item) => item.id === session.userId && item.isActive && (item.employmentStatus || 'active') !== 'left');
  if (!user) {
    removeStorageData(AUTH_SESSION_STORAGE_KEY);
    return createSuccessResponse(null);
  }

  return createSuccessResponse(toAuthenticatedUser(user, roles));
}

async function logout(): Promise<ApiResponse<boolean>> {
  if (shouldUseBackendApi()) {
    await flushBackendStorageWrites();
    const response = await backendRequest<boolean>('/auth/logout', { method: 'POST' });
    clearBackendToken();
    if (typeof localStorage !== 'undefined') localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    clearSessionScopedStorageCache();
    return response;
  }

  await delay(50);
  removeStorageData(AUTH_SESSION_STORAGE_KEY);
  return createSuccessResponse(true);
}

async function changePassword(currentPassword: string, newPassword: string): Promise<ApiResponse<boolean>> {
  if (shouldUseBackendApi()) {
    return backendRequest<boolean>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  }
  const session = readSession();
  if (!session) return createErrorResponse('登录已失效，请重新登录', 401);
  const { users } = ensureAuthData();
  const user = users.find((item) => item.id === session.userId);
  if (!user || !verifyPassword(currentPassword, user.passwordSalt, user.passwordHash)) {
    return createErrorResponse('当前密码不正确', 400);
  }
  if (newPassword.length < 8) return createErrorResponse('新密码至少 8 位', 400);
  if (verifyPassword(newPassword, user.passwordSalt, user.passwordHash)) return createErrorResponse('新密码不能与当前密码相同', 400);
  const fields = createUserPasswordFields(user.id, user.account || user.email, newPassword);
  setStorageData(STORAGE_KEYS.USERS, users.map((item) => item.id === user.id
    ? { ...item, ...fields, mustChangePassword: false, updatedAt: new Date().toISOString() }
    : item));
  removeStorageData(AUTH_SESSION_STORAGE_KEY);
  return createSuccessResponse(true);
}

function createUserPasswordFields(userId: string, account: string, password: string) {
  const passwordSalt = createPasswordSalt(`${userId}-${normalizeAccount(account)}`);
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
  changePassword,
  ensureAuthData,
  createUserPasswordFields,
};
