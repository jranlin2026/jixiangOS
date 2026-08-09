import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { AuthenticatedUser, LoginPayload } from '../../src/types/auth';
import { createPasswordSalt, hashPassword, normalizeAccount, verifyPassword } from '../../src/shared/utils/auth';
import { mergeRoleWithDefaultAccess } from '../../src/shared/utils/organizationConfig';
import { toAuthenticatedUser } from '../../src/shared/utils/permissions';
import { failure, success } from '../api/response';
import { mapPrismaRole, mapPrismaUser } from '../db/prismaMappers';
import { getBrowserAgentAuthSecret, getBrowserAgentRedirectUris } from '../config/runtime';

type AuthPrisma = Pick<PrismaClient, 'user' | 'role' | 'authSession' | 'browserAgentAuthGrant' | 'browserAgentSession'>;

const DEFAULT_SESSION_TTL_HOURS = 12;
const DEFAULT_REMEMBER_SESSION_DAYS = 30;
const MAX_SESSION_TTL_HOURS = 24;
const MAX_REMEMBER_SESSION_DAYS = 90;
const BROWSER_AGENT_GRANT_TTL_MS = 60 * 1000;
const BROWSER_AGENT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type BrowserAgentTokenPayload = {
  kind: 'grant' | 'session';
  jti: string;
  userId: string;
  parentSessionId: string;
  deviceId: string;
  redirectUri?: string;
  codeChallenge?: string;
  expiresAt: number;
};

function browserAgentSecret() {
  return getBrowserAgentAuthSecret();
}

function encodeBrowserAgentToken(payload: BrowserAgentTokenPayload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', browserAgentSecret()).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function decodeBrowserAgentToken(token: string | undefined): BrowserAgentTokenPayload | null {
  if (!token?.startsWith('browser-agent.')) return null;
  const [body, signature] = token.slice('browser-agent.'.length).split('.');
  if (!body || !signature) return null;
  const expected = createHmac('sha256', browserAgentSecret()).update(body).digest();
  const received = Buffer.from(signature, 'base64url');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as BrowserAgentTokenPayload;
    return payload.expiresAt > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

function pkceChallenge(verifier: string) {
  return createHash('sha256').update(verifier).digest('base64url');
}

function isChromeExtensionRedirect(value: string) {
  return getBrowserAgentRedirectUris().includes(value.trim());
}

function boundedPositiveNumber(value: string | undefined, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function sessionDurationMs(remember: boolean): number {
  if (remember) {
    const days = boundedPositiveNumber(process.env.JIXIANG_REMEMBER_SESSION_DAYS, DEFAULT_REMEMBER_SESSION_DAYS, MAX_REMEMBER_SESSION_DAYS);
    return days * 24 * 60 * 60 * 1000;
  }

  const hours = boundedPositiveNumber(process.env.JIXIANG_SESSION_TTL_HOURS, DEFAULT_SESSION_TTL_HOURS, MAX_SESSION_TTL_HOURS);
  return hours * 60 * 60 * 1000;
}

export function createAuthService(prisma: AuthPrisma) {
  const readRoles = async () => {
    const roles = await prisma.role.findMany({ where: { isActive: true } });
    return roles.map(mapPrismaRole).map(mergeRoleWithDefaultAccess);
  };

  return {
    async login(payload: LoginPayload) {
      const account = normalizeAccount(payload.account);
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { account },
            { email: account },
            { phone: account },
          ],
        },
      });

      if (!user) return failure<{ token: string; user: AuthenticatedUser }>('账号不存在');
      if ((user.employmentStatus || 'active') === 'left') return failure<{ token: string; user: AuthenticatedUser }>('账号已离职，请联系管理员');
      if (!user.isActive) return failure<{ token: string; user: AuthenticatedUser }>('账号已停用，请联系管理员');
      if (!verifyPassword(payload.password, user.passwordSalt || undefined, user.passwordHash || undefined)) {
        return failure<{ token: string; user: AuthenticatedUser }>('账号或密码错误');
      }

      const now = new Date();
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: now, updatedAt: now },
      });
      const token = `session-${randomUUID()}`;
      const expiresAt = new Date(now.getTime() + sessionDurationMs(payload.remember));
      await prisma.authSession.deleteMany({
        where: { expiresAt: { lte: now } },
      });
      await prisma.authSession.create({
        data: {
          id: randomUUID(),
          token,
          userId: user.id,
          remember: payload.remember,
          expiresAt,
        },
      });

      const roles = await readRoles();
      return success({ token, user: toAuthenticatedUser(mapPrismaUser(updated), roles) });
    },

    async getCurrentUser(token?: string) {
      if (!token) return success<AuthenticatedUser | null>(null);
      const session = await prisma.authSession.findUnique({
        where: { token },
        include: { user: true },
      });

      if (!session) return success<AuthenticatedUser | null>(null);
      if (session.expiresAt && session.expiresAt.getTime() <= Date.now()) {
        await prisma.authSession.deleteMany({ where: { token } });
        return success<AuthenticatedUser | null>(null);
      }

      if (!session.user.isActive || (session.user.employmentStatus || 'active') === 'left') {
        await prisma.authSession.deleteMany({ where: { token } });
        return success<AuthenticatedUser | null>(null);
      }

      const roles = await readRoles();
      return success(toAuthenticatedUser(mapPrismaUser(session.user), roles));
    },

    async authorizeBrowserAgent(input: {
      parentToken?: string;
      userId: string;
      deviceId: string;
      redirectUri: string;
      codeChallenge: string;
    }) {
      if (!input.parentToken || !input.deviceId.trim() || !isChromeExtensionRedirect(input.redirectUri) || !input.codeChallenge.trim()) {
        return failure<string>('浏览器员工授权参数不完整', 400);
      }
      const parent = await prisma.authSession.findUnique({ where: { token: input.parentToken } });
      if (!parent || parent.userId !== input.userId || (parent.expiresAt && parent.expiresAt.getTime() <= Date.now())) {
        return failure<string>('极享OS登录状态已失效，请重新登录', 401);
      }
      const payload: BrowserAgentTokenPayload = {
        kind: 'grant',
        jti: randomUUID(),
        userId: input.userId,
        parentSessionId: parent.id,
        deviceId: input.deviceId.trim(),
        redirectUri: input.redirectUri.trim(),
        codeChallenge: input.codeChallenge.trim(),
        expiresAt: Date.now() + BROWSER_AGENT_GRANT_TTL_MS,
      };
      await prisma.browserAgentAuthGrant.create({ data: {
        jti: payload.jti,
        userId: payload.userId,
        parentSessionId: payload.parentSessionId,
        deviceId: payload.deviceId,
        redirectUri: payload.redirectUri!,
        codeChallenge: payload.codeChallenge!,
        expiresAt: new Date(payload.expiresAt),
      } });
      return success(`browser-agent.${encodeBrowserAgentToken(payload)}`);
    },

    async exchangeBrowserAgentGrant(input: {
      code?: string;
      verifier?: string;
      redirectUri?: string;
      deviceId?: string;
    }) {
      const payload = decodeBrowserAgentToken(input.code);
      if (!payload || payload.kind !== 'grant') return failure<{ token: string; user: AuthenticatedUser }>('授权码无效或已过期', 401);
      if (payload.redirectUri !== input.redirectUri?.trim() || payload.deviceId !== input.deviceId?.trim()
        || payload.codeChallenge !== pkceChallenge(input.verifier || '')) {
        return failure<{ token: string; user: AuthenticatedUser }>('授权校验失败，请重新连接', 401);
      }
      const consumed = await prisma.browserAgentAuthGrant.updateMany({
        where: { jti: payload.jti, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (consumed.count !== 1) return failure<{ token: string; user: AuthenticatedUser }>('授权码已使用，请重新连接', 401);
      const parent = await prisma.authSession.findUnique({ where: { id: payload.parentSessionId }, include: { user: true } });
      if (!parent || parent.userId !== payload.userId || (parent.expiresAt && parent.expiresAt.getTime() <= Date.now())
        || !parent.user.isActive || (parent.user.employmentStatus || 'active') === 'left') {
        return failure<{ token: string; user: AuthenticatedUser }>('极享OS登录状态已失效，请重新登录', 401);
      }
      const roles = await readRoles();
      const user = toAuthenticatedUser(mapPrismaUser(parent.user), roles);
      const session: BrowserAgentTokenPayload = {
        kind: 'session',
        jti: randomUUID(),
        userId: payload.userId,
        parentSessionId: payload.parentSessionId,
        deviceId: payload.deviceId,
        expiresAt: Math.min(Date.now() + BROWSER_AGENT_SESSION_TTL_MS, parent.expiresAt?.getTime() || Number.MAX_SAFE_INTEGER),
      };
      await prisma.browserAgentSession.create({ data: {
        jti: session.jti,
        userId: session.userId,
        parentSessionId: session.parentSessionId,
        deviceId: session.deviceId,
        expiresAt: new Date(session.expiresAt),
      } });
      return success({ token: `browser-agent.${encodeBrowserAgentToken(session)}`, user });
    },

    async getBrowserAgentUser(token?: string) {
      const payload = decodeBrowserAgentToken(token);
      if (!payload || payload.kind !== 'session') return success<AuthenticatedUser | null>(null);
      const browserSession = await prisma.browserAgentSession.findUnique({ where: { jti: payload.jti } });
      if (!browserSession || browserSession.revokedAt || browserSession.expiresAt.getTime() <= Date.now()
        || browserSession.userId !== payload.userId || browserSession.parentSessionId !== payload.parentSessionId
        || browserSession.deviceId !== payload.deviceId) return success<AuthenticatedUser | null>(null);
      const parent = await prisma.authSession.findUnique({ where: { id: payload.parentSessionId }, include: { user: true } });
      if (!parent || parent.userId !== payload.userId || (parent.expiresAt && parent.expiresAt.getTime() <= Date.now())
        || !parent.user.isActive || (parent.user.employmentStatus || 'active') === 'left') {
        return success<AuthenticatedUser | null>(null);
      }
      await prisma.browserAgentSession.updateMany({ where: { jti: payload.jti, revokedAt: null }, data: { lastUsedAt: new Date() } });
      const roles = await readRoles();
      return success(toAuthenticatedUser(mapPrismaUser(parent.user), roles));
    },

    async logoutBrowserAgent(token?: string) {
      const payload = decodeBrowserAgentToken(token);
      if (payload?.kind === 'session') {
        await prisma.browserAgentSession.updateMany({ where: { jti: payload.jti, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      return success(true);
    },

    async logout(token?: string) {
      if (token) await prisma.authSession.deleteMany({ where: { token } });
      return success(true);
    },

    async changePassword(userId: string, currentPassword: string, newPassword: string) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return failure('账号不存在', 404);
      if (!verifyPassword(currentPassword, user.passwordSalt || undefined, user.passwordHash || undefined)) {
        return failure('当前密码不正确', 400);
      }
      if (newPassword.length < 8) return failure('新密码至少 8 位', 400);
      if (verifyPassword(newPassword, user.passwordSalt || undefined, user.passwordHash || undefined)) {
        return failure('新密码不能与当前密码相同', 400);
      }
      const passwordSalt = createPasswordSalt(`${user.id}-${Date.now()}`);
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: hashPassword(newPassword, passwordSalt),
          passwordSalt,
          passwordUpdatedAt: new Date(),
          mustChangePassword: false,
          updatedAt: new Date(),
        },
      });
      await prisma.authSession.deleteMany({ where: { userId: user.id } });
      return success(true);
    },
  };
}
