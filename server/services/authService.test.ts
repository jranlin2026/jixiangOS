import assert from 'node:assert/strict';
import { createAuthService } from './authService';
import { DEFAULT_ADMIN_PASSWORD, createPasswordSalt, hashPassword } from '../../src/shared/utils/auth';

const now = new Date('2026-06-24T00:00:00.000Z');
const salt = createPasswordSalt('user-admin');

const users = [
  {
    id: 'user-admin',
    name: '系统管理员',
    account: 'admin',
    email: 'admin@company.com',
    phone: '',
    role: '超级管理员',
    avatar: null,
    departmentId: 'dept-general',
    positionId: 'pos-general-manager',
    positionName: '总经理',
    roleId: 'role-super-admin',
    passwordHash: hashPassword(DEFAULT_ADMIN_PASSWORD, salt),
    passwordSalt: salt,
    passwordUpdatedAt: now,
    lastLoginAt: null,
    isActive: true,
    employmentStatus: 'active',
    leftAt: null,
    leftBy: null,
    createdAt: now,
    updatedAt: now,
  },
];

const roles = [
  {
    id: 'role-super-admin',
    name: '超级管理员',
    code: 'super_admin',
    description: '拥有全部权限',
    departmentId: null,
    permissions: [{ module: '全部', actions: ['admin'] }],
    dataScopes: {},
    memberCount: 1,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
];

let createdSessionToken = '';

const prisma = {
  user: {
    findFirst: async ({ where }: any) => {
      const account = where.OR[0].account;
      return users.find((user) => user.account === account || user.email === account || user.phone === account) || null;
    },
    update: async ({ where, data }: any) => ({ ...users.find((user) => user.id === where.id)!, ...data }),
  },
  role: {
    findMany: async () => roles,
  },
  authSession: {
    create: async ({ data }: any) => {
      createdSessionToken = data.token;
      return { ...data, id: 'session-001' };
    },
    findUnique: async ({ where }: any) => (
      where.token === createdSessionToken ? { token: createdSessionToken, userId: 'user-admin', expiresAt: null, user: users[0] } : null
    ),
    deleteMany: async () => ({ count: 1 }),
  },
} as any;

const service = createAuthService(prisma);

const badLogin = await service.login({ account: 'admin', password: 'wrong', remember: true });
assert.notEqual(badLogin.code, 0);

const login = await service.login({ account: 'admin', password: DEFAULT_ADMIN_PASSWORD, remember: true });
assert.equal(login.code, 0);
assert.equal(login.data?.user.account, 'admin');
assert.ok(login.data?.token);

const currentUser = await service.getCurrentUser(createdSessionToken);
assert.equal(currentUser.code, 0);
assert.equal(currentUser.data?.account, 'admin');
