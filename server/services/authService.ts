import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { AuthenticatedUser, LoginPayload } from '../../src/types/auth';
import { createPasswordSalt, hashPassword, normalizeAccount, verifyPassword } from '../../src/shared/utils/auth';
import { mergeRoleWithDefaultAccess } from '../../src/shared/utils/organizationConfig';
import { toAuthenticatedUser } from '../../src/shared/utils/permissions';
import { failure, success } from '../api/response';
import { mapPrismaRole, mapPrismaUser } from '../db/prismaMappers';

type AuthPrisma = Pick<PrismaClient, 'user' | 'role' | 'authSession'>;

const DEFAULT_SESSION_TTL_HOURS = 12;
const DEFAULT_REMEMBER_SESSION_DAYS = 30;
const MAX_SESSION_TTL_HOURS = 24;
const MAX_REMEMBER_SESSION_DAYS = 90;

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
