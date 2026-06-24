import type { PrismaClient } from '@prisma/client';
import { success } from '../api/response';
import {
  mapPrismaDepartment,
  mapPrismaPosition,
  mapPrismaRole,
  mapPrismaUser,
} from '../db/prismaMappers';

type SettingsPrisma = Pick<PrismaClient, 'user' | 'role' | 'department' | 'position'>;

export function createSettingsService(prisma: SettingsPrisma) {
  return {
    async listUsers() {
      const rows = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
      return success(rows.map(mapPrismaUser));
    },

    async listRoles() {
      const rows = await prisma.role.findMany({ orderBy: { createdAt: 'asc' } });
      return success(rows.map(mapPrismaRole));
    },

    async listDepartments() {
      const rows = await prisma.department.findMany({ orderBy: { createdAt: 'asc' } });
      return success(rows.map(mapPrismaDepartment));
    },

    async listPositions() {
      const rows = await prisma.position.findMany({ orderBy: { sortOrder: 'asc' } });
      return success(rows.map(mapPrismaPosition));
    },
  };
}
