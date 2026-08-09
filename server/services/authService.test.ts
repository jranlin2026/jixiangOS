import assert from 'node:assert/strict';
import { createAuthService } from './authService';
import { DEFAULT_ADMIN_PASSWORD, createPasswordSalt, hashPassword } from '../../src/shared/utils/auth';
import { hasPermission, PERMISSION_KEYS } from '../../src/shared/utils/permissions';

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
    mustChangePassword: false,
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
    permissions: [
      { module: '全部', actions: ['admin'] },
      { module: PERMISSION_KEYS.CUSTOMER_DELETE, actions: ['read', 'delete'] },
    ],
    dataScopes: {},
    memberCount: 1,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
];

let createdSessionToken = '';
let createdSessionExpiresAt: Date | null = null;
let expiredSessionCleanupCount = 0;
let createdSessionId = 'session-001';
let browserGrant: any = null;
let browserSession: any = null;

const prisma = {
  user: {
    findFirst: async ({ where }: any) => {
      const account = where.OR[0].account;
      return users.find((user) => user.account === account || user.email === account || user.phone === account) || null;
    },
    findUnique: async ({ where }: any) => users.find((user) => user.id === where.id) || null,
    update: async ({ where, data }: any) => {
      const index = users.findIndex((user) => user.id === where.id);
      users[index] = { ...users[index], ...data } as any;
      return users[index];
    },
  },
  role: {
    findMany: async () => roles,
  },
  authSession: {
    create: async ({ data }: any) => {
      createdSessionToken = data.token;
      createdSessionExpiresAt = data.expiresAt;
      return { ...data, id: createdSessionId };
    },
    findUnique: async ({ where }: any) => (
      where.token === createdSessionToken || where.id === createdSessionId
        ? { id: createdSessionId, token: createdSessionToken, userId: 'user-admin', expiresAt: createdSessionExpiresAt, user: users[0] }
        : null
    ),
    deleteMany: async ({ where }: any = {}) => {
      if (where?.expiresAt?.lte) expiredSessionCleanupCount += 1;
      return { count: 1 };
    },
  },
  browserAgentAuthGrant: {
    create: async ({ data }: any) => { browserGrant = { ...data, usedAt: null }; return browserGrant; },
    updateMany: async ({ where, data }: any) => {
      if (!browserGrant || browserGrant.jti !== where.jti || browserGrant.usedAt) return { count: 0 };
      browserGrant = { ...browserGrant, ...data };
      return { count: 1 };
    },
  },
  browserAgentSession: {
    create: async ({ data }: any) => { browserSession = { ...data, revokedAt: null, lastUsedAt: new Date() }; return browserSession; },
    findUnique: async ({ where }: any) => browserSession?.jti === where.jti ? browserSession : null,
    updateMany: async ({ where, data }: any) => {
      if (!browserSession || browserSession.jti !== where.jti || browserSession.revokedAt) return { count: 0 };
      browserSession = { ...browserSession, ...data };
      return { count: 1 };
    },
  },
} as any;

const service = createAuthService(prisma);

const badLogin = await service.login({ account: 'admin', password: 'wrong', remember: true });
assert.notEqual(badLogin.code, 0);

const login = await service.login({ account: 'admin', password: DEFAULT_ADMIN_PASSWORD, remember: true });
assert.equal(login.code, 0);
assert.equal(login.data?.user.account, 'admin');
assert.equal('passwordHash' in (login.data?.user as any), false);
assert.equal('passwordSalt' in (login.data?.user as any), false);
assert.equal('passwordUpdatedAt' in (login.data?.user as any), false);
assert.ok(login.data?.token);
const expiresAt = createdSessionExpiresAt as unknown as Date;
assert.ok(expiresAt instanceof Date);
assert.ok(expiresAt.getTime() > Date.now());
assert.equal(expiredSessionCleanupCount, 1);

const currentUser = await service.getCurrentUser(createdSessionToken);
assert.equal(currentUser.code, 0);
assert.equal(currentUser.data?.account, 'admin');
assert.equal('passwordHash' in (currentUser.data as any), false);
assert.equal('passwordSalt' in (currentUser.data as any), false);
assert.equal('passwordUpdatedAt' in (currentUser.data as any), false);
assert.equal(
  hasPermission(currentUser.data, PERMISSION_KEYS.CUSTOMER_DELETE, 'delete'),
  true,
  '迁移写入默认超级管理员的显式 CUSTOMER_DELETE 必须穿过真实 authService 链保留',
);

const verifier = 'browser-agent-verifier-with-enough-entropy';
const { createHash } = await import('node:crypto');
const codeChallenge = createHash('sha256').update(verifier).digest('base64url');
assert.equal((await service.authorizeBrowserAgent({
  parentToken: createdSessionToken,
  userId: 'user-admin',
  deviceId: 'extension-device-1',
  redirectUri: 'https://malicious-extension.chromiumapp.org/browser-agent',
  codeChallenge,
})).code, 400, '授权回调必须精确绑定已发布的插件ID');
const grant = await service.authorizeBrowserAgent({
  parentToken: createdSessionToken,
  userId: 'user-admin',
  deviceId: 'extension-device-1',
  redirectUri: 'https://ibocdkdaleenngfdmmcnfongfhnolgkd.chromiumapp.org/browser-agent',
  codeChallenge,
});
assert.equal(grant.code, 0);
const exchanged = await service.exchangeBrowserAgentGrant({
  code: grant.data!, verifier, deviceId: 'extension-device-1',
  redirectUri: 'https://ibocdkdaleenngfdmmcnfongfhnolgkd.chromiumapp.org/browser-agent',
});
assert.equal(exchanged.code, 0);
assert.match(exchanged.data?.token || '', /^browser-agent\./);
assert.equal((await service.getCurrentUser(exchanged.data?.token)).data, null, '浏览器员工令牌不能访问普通OS接口');
assert.equal((await service.getBrowserAgentUser(exchanged.data?.token)).data?.id, 'user-admin');
assert.equal((await service.logoutBrowserAgent(exchanged.data?.token)).code, 0);
assert.equal((await service.getBrowserAgentUser(exchanged.data?.token)).data, null, '退出插件后专用令牌必须立即被服务端撤销');
assert.equal((await service.exchangeBrowserAgentGrant({
  code: grant.data!, verifier, deviceId: 'extension-device-1',
  redirectUri: 'https://ibocdkdaleenngfdmmcnfongfhnolgkd.chromiumapp.org/browser-agent',
})).code, 401, '一次性授权码不可重复兑换');

const wrongCurrentPassword = await service.changePassword('user-admin', 'wrong', 'new-password-2026');
assert.equal(wrongCurrentPassword.code, 400);

const weakPassword = await service.changePassword('user-admin', DEFAULT_ADMIN_PASSWORD, 'short');
assert.equal(weakPassword.code, 400);

const changedPassword = await service.changePassword('user-admin', DEFAULT_ADMIN_PASSWORD, 'new-password-2026');
assert.equal(changedPassword.code, 0);
assert.equal(users[0].mustChangePassword, false);

const oldPasswordLogin = await service.login({ account: 'admin', password: DEFAULT_ADMIN_PASSWORD, remember: false });
assert.notEqual(oldPasswordLogin.code, 0);
const newPasswordLogin = await service.login({ account: 'admin', password: 'new-password-2026', remember: false });
assert.equal(newPasswordLogin.code, 0);
