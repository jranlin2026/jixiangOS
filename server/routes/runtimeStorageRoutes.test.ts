import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { createRequireAuth } from '../middleware/auth';
import { createAuthService } from '../services/authService';
import { createRuntimeStorageGetHandler } from './runtimeStorageRoutes';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';

const now = new Date('2026-07-17T00:00:00.000Z');
const roleRow = (id: string, name: string, code: string, permissions: unknown[]) => ({
  id,
  name,
  code,
  description: null,
  departmentId: null,
  permissions,
  dataScopes: { customers: 'self' },
  memberCount: 0,
  isActive: true,
  createdAt: now,
  updatedAt: now,
});
const roles = [
  roleRow('role-legacy-resolved', '旧销售角色', 'legacy_sales', [
    { module: PERMISSION_KEYS.CUSTOMER_LIST, actions: ['read'] },
  ]),
  roleRow('role-settings-reader', '角色设置查看员', 'role_settings_reader', [
    { module: PERMISSION_KEYS.SETTINGS_ROLES, actions: ['read'] },
  ]),
  roleRow('role-hidden', '不相关角色', 'hidden_role', [
    { module: PERMISSION_KEYS.FINANCE, actions: ['read'] },
  ]),
];

const userRow = (id: string, role: string, roleId: string | null) => ({
  id,
  name: id,
  account: id,
  email: `${id}@example.test`,
  phone: '',
  role,
  avatar: null,
  departmentId: null,
  positionId: null,
  positionName: null,
  roleId,
  passwordHash: null,
  passwordSalt: null,
  passwordUpdatedAt: null,
  mustChangePassword: false,
  lastLoginAt: null,
  isActive: true,
  employmentStatus: 'active',
  leftAt: null,
  leftBy: null,
  createdAt: now,
  updatedAt: now,
});

const sessions = new Map([
  ['legacy-session', userRow('user-legacy', '旧销售角色', null)],
  ['settings-session', userRow('user-settings', '角色设置查看员', 'role-settings-reader')],
  ['unresolved-session', userRow('user-unresolved', '不存在角色', null)],
]);
const prisma = {
  role: {
    findMany: async (input?: any) => {
      if (input?.where?.id) return roles.filter((role) => role.id === input.where.id);
      if (input?.where?.isActive) return roles.filter((role) => role.isActive);
      return [...roles];
    },
  },
  authSession: {
    findUnique: async (input: any) => {
      const user = sessions.get(input.where.token);
      return user
        ? { token: input.where.token, expiresAt: new Date('2099-01-01T00:00:00.000Z'), user }
        : null;
    },
    deleteMany: async () => ({ count: 0 }),
  },
  user: {} as any,
};

const authService = createAuthService(prisma as any);
const app = express();
app.get(
  '/api/storage',
  createRequireAuth(authService),
  createRuntimeStorageGetHandler({
    roleStore: prisma.role as any,
    runtimeStorageKeys: [STORAGE_KEYS.ROLES],
    storageReader: {
      get: async () => ({ code: 0, data: null, message: 'success' }),
    },
    filterData: async (data) => data,
  }),
);

const listener = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => listener.once('listening', resolve));
const address = listener.address() as AddressInfo;

async function readRuntimeRoles(token: string) {
  const response = await fetch(`http://127.0.0.1:${address.port}/api/storage?scope=runtime`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(response.status, 200);
  const body = await response.json() as any;
  return body.data[STORAGE_KEYS.ROLES] as Array<{ id: string }>;
}

try {
  assert.deepEqual(
    (await readRuntimeRoles('legacy-session')).map((role) => role.id),
    ['role-legacy-resolved'],
    'roleId=null 的合法旧用户必须在认证层解析后，只收到其不可变当前角色',
  );
  assert.deepEqual(
    (await readRuntimeRoles('settings-session')).map((role) => role.id).sort(),
    roles.map((role) => role.id).sort(),
    '具备角色设置读取权限的用户才可收到全量角色',
  );
  assert.deepEqual(
    await readRuntimeRoles('unresolved-session'),
    [],
    '无法解析当前角色时必须 fail closed，不能泄露全量角色',
  );
} finally {
  await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
}
