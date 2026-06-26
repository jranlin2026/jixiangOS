import type { User } from '../../types/settings';
import type { UserWithAuth } from '../../types/auth';
import { normalizeUserRoleName } from './roles';

export const AUTH_SESSION_STORAGE_KEY = 'aaos_auth_session';
export const DEFAULT_ADMIN_ACCOUNT = 'admin';
export const DEFAULT_ADMIN_PASSWORD = 'Admin@123456';
export const DEFAULT_USER_PASSWORD = '1234567';

const ADMIN_USER_ID = 'user-admin';

function readRuntimeEnv(name: string): string | undefined {
  const metaEnv = (import.meta as unknown as { env?: Record<string, string | boolean | undefined> }).env;
  const nodeEnv = typeof process !== 'undefined' ? process.env[name] : undefined;
  const value = metaEnv?.[name] ?? nodeEnv;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isProductionRuntime(): boolean {
  const metaEnv = (import.meta as unknown as { env?: { PROD?: boolean; MODE?: string } }).env;
  return Boolean(metaEnv?.PROD) || readRuntimeEnv('NODE_ENV') === 'production';
}

function configuredDefaultPassword(envName: string, fallback: string): string {
  const configured = readRuntimeEnv(envName);
  if (configured) return configured;
  if (isProductionRuntime()) {
    throw new Error(`${envName} must be configured before running jixiangOS in production.`);
  }
  return fallback;
}

export function getDefaultAdminPassword(): string {
  return configuredDefaultPassword('JIXIANG_DEFAULT_ADMIN_PASSWORD', DEFAULT_ADMIN_PASSWORD);
}

export function getDefaultUserPassword(): string {
  return configuredDefaultPassword('JIXIANG_DEFAULT_USER_PASSWORD', DEFAULT_USER_PASSWORD);
}

export function normalizeAccount(value?: string): string {
  return String(value || '').trim().toLowerCase();
}

export function createPasswordSalt(seed: string): string {
  return `aaos-${normalizeAccount(seed) || 'user'}-salt`;
}

export function hashPassword(password: string, salt: string): string {
  const text = `${salt}:${password}`;
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `mock-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function verifyPassword(password: string, salt?: string, hash?: string): boolean {
  if (!salt || !hash) return false;
  return hashPassword(password, salt) === hash;
}

export function deriveAccount(user: Pick<User, 'account' | 'email' | 'phone' | 'name' | 'id'>): string {
  const existing = normalizeAccount(user.account);
  if (existing) return existing;
  const emailPrefix = normalizeAccount(user.email).split('@')[0];
  if (emailPrefix) return emailPrefix;
  const phone = normalizeAccount(user.phone);
  if (phone) return phone;
  return normalizeAccount(user.name) || user.id;
}

export function withAuthDefaults(user: User, index = 0): UserWithAuth {
  const account = deriveAccount(user);
  const salt = user.passwordSalt || createPasswordSalt(`${user.id}-${account}`);
  const passwordHash = user.passwordHash || hashPassword(getDefaultUserPassword(), salt);

  return {
    ...user,
    role: normalizeUserRoleName(user.role),
    account,
    employmentStatus: user.employmentStatus || 'active',
    passwordSalt: salt,
    passwordHash,
    passwordUpdatedAt: user.passwordUpdatedAt || user.createdAt,
  };
}

export function ensureAdminUser(users: User[]): UserWithAuth[] {
  const now = new Date().toISOString();
  const normalizedUsers = users.map(withAuthDefaults);
  const hasAdmin = normalizedUsers.some((user) => normalizeAccount(user.account) === DEFAULT_ADMIN_ACCOUNT);
  if (hasAdmin) return normalizedUsers;

  const salt = createPasswordSalt(ADMIN_USER_ID);
  return [
    {
      id: ADMIN_USER_ID,
      name: '系统管理员',
      account: DEFAULT_ADMIN_ACCOUNT,
      email: 'admin@company.com',
      phone: '',
      role: '超级管理员' as User['role'],
      roleId: 'role-super-admin',
      departmentId: 'dept-general',
      positionId: 'pos-general-manager',
      positionName: '总经理',
      isActive: true,
      employmentStatus: 'active' as const,
      passwordSalt: salt,
      passwordHash: hashPassword(getDefaultAdminPassword(), salt),
      passwordUpdatedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    ...normalizedUsers,
  ].map(withAuthDefaults);
}

export function ensureUniqueAccount(users: User[], account: string, ignoreUserId?: string): boolean {
  const normalized = normalizeAccount(account);
  return !users.some((user) => user.id !== ignoreUserId && normalizeAccount(user.account) === normalized);
}
