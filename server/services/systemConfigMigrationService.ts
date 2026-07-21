import { DEFAULT_LIFECYCLE_STATUS_CONFIGS, STORAGE_KEYS } from '../../src/shared/utils/constants';
import type { Prisma } from '@prisma/client';

interface SystemConfigMigrationStore {
  appStorage: {
    findUnique(args: { where: { key: string } }): Promise<{ value: Prisma.JsonValue } | null>;
    upsert(args: {
      where: { key: string };
      update: { value: Prisma.InputJsonValue };
      create: { key: string; value: Prisma.InputJsonValue };
    }): Promise<unknown>;
  };
}

/** Restores only missing system-owned lifecycle states; non-empty administrator configuration is preserved. */
export async function ensureSystemLifecycleDefaults(store: SystemConfigMigrationStore): Promise<boolean> {
  const key = STORAGE_KEYS.LIFECYCLE_STATUS_CONFIGS;
  const defaults = DEFAULT_LIFECYCLE_STATUS_CONFIGS as unknown as Prisma.InputJsonValue;
  const existing = await store.appStorage.findUnique({ where: { key } });
  if (Array.isArray(existing?.value) && existing.value.length > 0) return false;

  await store.appStorage.upsert({
    where: { key },
    update: { value: defaults },
    create: { key, value: defaults },
  });
  return true;
}
