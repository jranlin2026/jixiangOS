import type { RequestHandler } from 'express';
import type { AuthenticatedUser } from '../../src/types/auth';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { mapPrismaRole } from '../db/prismaMappers';
import { canAccessLegacyStorageKey } from '../services/legacyStorageAccess';
import type { AuthenticatedRequest } from '../middleware/auth';

type RuntimeRoleRow = Parameters<typeof mapPrismaRole>[0];

type RuntimeStorageGetHandlerDependencies = {
  roleStore: {
    findMany(input?: unknown): Promise<RuntimeRoleRow[]>;
  };
  runtimeStorageKeys: readonly string[];
  storageReader: {
    get(key: string): Promise<{ code: number; data?: unknown }>;
  };
  filterData(
    data: Record<string, unknown>,
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> | Record<string, unknown>;
};

function queryScope(value: unknown): string {
  if (Array.isArray(value)) return queryScope(value[0]);
  return typeof value === 'string' ? value : '';
}

export function createRuntimeStorageGetHandler(
  dependencies: RuntimeStorageGetHandlerDependencies,
): RequestHandler {
  return async (request, response, next) => {
    if (queryScope(request.query.scope) !== 'runtime') {
      next();
      return;
    }

    const currentUser = (request as AuthenticatedRequest).currentUser;
    if (!currentUser) {
      response.status(401).json({ code: 401, data: null, message: 'Unauthorized' });
      return;
    }

    const entries = await Promise.all(dependencies.runtimeStorageKeys
      .filter((key) => (
        key === STORAGE_KEYS.ROLES
        || canAccessLegacyStorageKey(currentUser, key, 'runtime')
      ))
      .map(async (key) => {
        if (key === STORAGE_KEYS.ROLES) {
          const canReadAllRoles = canAccessLegacyStorageKey(currentUser, key, 'runtime');
          const rows = canReadAllRoles
            ? await dependencies.roleStore.findMany({ orderBy: { createdAt: 'asc' } })
            : currentUser.roleId
              ? await dependencies.roleStore.findMany({
                  where: { id: currentUser.roleId },
                  orderBy: { createdAt: 'asc' },
                })
              : [];
          return [key, rows.map(mapPrismaRole)] as const;
        }
        const result = await dependencies.storageReader.get(key);
        return [key, result.code === 0 ? result.data ?? null : null] as const;
      }));
    const data = await dependencies.filterData(Object.fromEntries(entries), currentUser);
    response.json({ code: 0, data, message: 'success' });
  };
}
