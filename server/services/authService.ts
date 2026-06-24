import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { AuthenticatedUser, LoginPayload } from '../../src/types/auth';
import { normalizeAccount, verifyPassword } from '../../src/shared/utils/auth';
import { toAuthenticatedUser } from '../../src/shared/utils/permissions';
import { failure, success } from '../api/response';
import { mapPrismaRole, mapPrismaUser } from '../db/prismaMappers';

type AuthPrisma = Pick<PrismaClient, 'user' | 'role' | 'authSession'>;

export function createAuthService(prisma: AuthPrisma) {
  const readRoles = async () => {
    const roles = await prisma.role.findMany({ where: { isActive: true } });
    return roles.map(mapPrismaRole);
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
      const expiresAt = payload.remember ? null : new Date(Date.now() + 12 * 60 * 60 * 1000);
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
  };
}
