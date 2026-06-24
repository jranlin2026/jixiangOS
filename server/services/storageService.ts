import type { Prisma, PrismaClient } from '@prisma/client';
import { failure, success } from '../api/response';

type StoragePrisma = Pick<PrismaClient, 'appStorage'>;

const STORAGE_KEY_PATTERN = /^aaos_[a-zA-Z0-9_:-]+$/;

export function createStorageService(prisma: StoragePrisma) {
  return {
    async list() {
      const rows = await prisma.appStorage.findMany({ orderBy: { key: 'asc' } });
      return success(Object.fromEntries(rows.map((row) => [row.key, row.value])));
    },

    async get(key: string) {
      if (!STORAGE_KEY_PATTERN.test(key)) return failure('invalid storage key', 400);
      const row = await prisma.appStorage.findUnique({ where: { key } });
      return success(row?.value ?? null);
    },

    async set(key: string, value: unknown) {
      if (!STORAGE_KEY_PATTERN.test(key)) return failure('invalid storage key', 400);
      const row = await prisma.appStorage.upsert({
        where: { key },
        update: { value: value as Prisma.InputJsonValue },
        create: { key, value: value as Prisma.InputJsonValue },
      });
      return success(row.value);
    },

    async remove(key: string) {
      if (!STORAGE_KEY_PATTERN.test(key)) return failure('invalid storage key', 400);
      await prisma.appStorage.deleteMany({ where: { key } });
      return success(true);
    },

    async clearPrefix(prefix = 'aaos_') {
      await prisma.appStorage.deleteMany({ where: { key: { startsWith: prefix } } });
      return success(true);
    },
  };
}
