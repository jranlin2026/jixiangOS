import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import type { LeadSourceConfig } from '../../src/types/settings';

export type LeadSourcePair = {
  leadSource?: string | null;
  sourceName?: string | null;
};

function clean(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function nameKey(value: unknown): string {
  return clean(value).toLocaleLowerCase('zh-CN');
}

function generatedId(kind: 'primary' | 'secondary', primary: string, secondary = ''): string {
  const digest = createHash('sha1')
    .update(`${kind}:${nameKey(primary)}:${nameKey(secondary)}`)
    .digest('hex')
    .slice(0, 12);
  return `lscfg-auto-${digest}`;
}

export function reconcileLeadSourceConfigs(
  existing: LeadSourceConfig[],
  pairs: LeadSourcePair[],
  now = new Date().toISOString(),
): { configs: LeadSourceConfig[]; added: LeadSourceConfig[] } {
  const configs = [...existing];
  const added: LeadSourceConfig[] = [];
  const normalizedPairs = pairs
    .map((pair) => ({ leadSource: clean(pair.leadSource), sourceName: clean(pair.sourceName) }))
    .filter((pair) => pair.leadSource)
    .sort((a, b) => (
      a.leadSource.localeCompare(b.leadSource, 'zh-CN')
      || a.sourceName.localeCompare(b.sourceName, 'zh-CN')
    ));

  for (const pair of normalizedPairs) {
    let primary = configs.find((item) => !item.parentId && nameKey(item.name) === nameKey(pair.leadSource));
    if (!primary) {
      primary = {
        id: generatedId('primary', pair.leadSource),
        name: pair.leadSource,
        isActive: true,
        sortOrder: configs.filter((item) => !item.parentId).reduce((max, item) => Math.max(max, item.sortOrder), 0) + 1,
        description: '根据业务数据自动补齐',
        createdAt: now,
        updatedAt: now,
      };
      configs.push(primary);
      added.push(primary);
    }

    if (!pair.sourceName || nameKey(pair.sourceName) === nameKey(pair.leadSource)) continue;
    const childExists = configs.some((item) => (
      item.parentId === primary!.id && nameKey(item.name) === nameKey(pair.sourceName)
    ));
    if (childExists) continue;
    const child: LeadSourceConfig = {
      id: generatedId('secondary', pair.leadSource, pair.sourceName),
      name: pair.sourceName,
      parentId: primary.id,
      isActive: true,
      sortOrder: configs.filter((item) => item.parentId === primary!.id).reduce((max, item) => Math.max(max, item.sortOrder), 0) + 1,
      description: '根据业务数据自动补齐',
      createdAt: now,
      updatedAt: now,
    };
    configs.push(child);
    added.push(child);
  }

  return { configs, added };
}

export function collectLeadSourcePairs(records: unknown): LeadSourcePair[] {
  if (!Array.isArray(records)) return [];
  return records.flatMap((record) => {
    if (!record || typeof record !== 'object') return [];
    const row = record as Record<string, unknown>;
    return [{
      leadSource: clean(row.leadSource || row.source),
      sourceName: clean(row.sourceName),
    }];
  });
}

type LeadSourceConfigTransaction = Pick<Prisma.TransactionClient, 'appStorage' | '$executeRaw' | '$queryRaw'>;

/**
 * Adds newly observed business sources while holding one database transaction lock.
 * The lock prevents an automatic append from overwriting an administrator edit that
 * is being saved at the same time.
 */
export async function ensureLeadSourceConfigsInTransaction(
  tx: LeadSourceConfigTransaction,
  pairs: LeadSourcePair[],
  now = new Date().toISOString(),
): Promise<LeadSourceConfig[]> {
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO app_storage (\`key\`, value, createdAt, updatedAt)
    VALUES (${STORAGE_KEYS.LEAD_SOURCE_CONFIGS}, JSON_ARRAY(), NOW(3), NOW(3))
    ON DUPLICATE KEY UPDATE \`key\` = VALUES(\`key\`)
  `);
  const [current] = await tx.$queryRaw<Array<{ value: unknown }>>(Prisma.sql`
    SELECT value
    FROM app_storage
    WHERE \`key\` = ${STORAGE_KEYS.LEAD_SOURCE_CONFIGS}
    FOR UPDATE
  `);
  const existing = Array.isArray(current?.value) ? current.value as LeadSourceConfig[] : [];
  const reconciled = reconcileLeadSourceConfigs(existing, pairs, now);
  if (!reconciled.added.length) return reconciled.configs;
  await tx.appStorage.update({
    where: { key: STORAGE_KEYS.LEAD_SOURCE_CONFIGS },
    data: { value: reconciled.configs as unknown as Prisma.InputJsonValue },
  });
  return reconciled.configs;
}
