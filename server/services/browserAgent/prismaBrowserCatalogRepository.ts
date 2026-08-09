import { Prisma, type PrismaClient } from '@prisma/client';
import { STORAGE_KEYS } from '../../../src/shared/utils/constants';
import type {
  BusinessShopDirectoryEntry,
  BrowserCatalogRepository,
  BrowserShopMappingRepository,
  BrowserShopBinding,
  BrowserStoredProductMapping,
} from './browserCatalogService';

type BrowserCatalogDataClient = Pick<
  Prisma.TransactionClient,
  'browserShopBinding' | 'browserProductMapping' | 'browserLeadSync' | 'businessRecord' | 'appStorage'
>;
type BrowserCatalogPrisma = BrowserCatalogDataClient & Pick<PrismaClient, '$transaction'>;

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map((entry) => String(entry)).filter(Boolean) : [];
}

function shop(row: any): BrowserShopBinding {
  return { ...row, aliases: stringArray(row.aliases) };
}

type LegacySourceConfig = {
  id?: unknown;
  name?: unknown;
  parentId?: unknown;
  isActive?: unknown;
  platformShopId?: unknown;
  aliases?: unknown;
};

export function businessPlatformCode(name: string) {
  const normalized = name.trim().toLocaleLowerCase('zh-CN');
  if (/(抖音|抖店|douyin)/i.test(normalized)) return 'DOUYIN';
  if (/(微信|wechat|weixin)/i.test(normalized)) return 'WECHAT';
  if (/(快手|kuaishou)/i.test(normalized)) return 'KUAISHOU';
  if (/(小红书|xiaohongshu|rednote)/i.test(normalized)) return 'XIAOHONGSHU';
  return normalized.replace(/[^a-z0-9\u4e00-\u9fff]+/gi, '-').replace(/^-|-$/g, '').toUpperCase();
}

function exactDirectoryName(value: unknown) {
  return String(value || '').trim();
}

export function matchLegacyBindingToBusinessShop(
  binding: Pick<BrowserShopBinding, 'platform' | 'displayName'>,
  directory: BusinessShopDirectoryEntry[],
) {
  const platform = String(binding.platform || '').trim().toUpperCase();
  const name = exactDirectoryName(binding.displayName);
  const matches = directory.filter((shop) => (
    shop.platformCode.trim().toUpperCase() === platform
    && exactDirectoryName(shop.name) === name
  ));
  return matches.length === 1 ? matches[0] : null;
}

export function uniqueLegacyBusinessShopMatches(
  bindings: Array<Pick<BrowserShopBinding, 'businessShopId' | 'platform' | 'displayName'>>,
  directory: BusinessShopDirectoryEntry[],
) {
  const claimed = new Set(bindings.map((binding) => String(binding.businessShopId || '')).filter(Boolean));
  const candidates = bindings.map((binding) => (
    binding.businessShopId ? null : matchLegacyBindingToBusinessShop(binding, directory)
  ));
  const counts = new Map<string, number>();
  candidates.forEach((candidate) => {
    if (candidate) counts.set(candidate.id, (counts.get(candidate.id) || 0) + 1);
  });
  return candidates.map((candidate) => (
    candidate && counts.get(candidate.id) === 1 && !claimed.has(candidate.id) ? candidate : null
  ));
}

async function listBusinessShops(prisma: Pick<BrowserCatalogDataClient, 'appStorage'>): Promise<BusinessShopDirectoryEntry[]> {
  const row = await prisma.appStorage.findUnique({ where: { key: STORAGE_KEYS.AFTER_SALES_SOURCE_CONFIGS } });
  const configs = Array.isArray(row?.value) ? row.value as LegacySourceConfig[] : [];
  const platforms = new Map(configs
    .filter((item) => !String(item.parentId || '').trim())
    .map((item) => [String(item.id || ''), item]));
  return configs.flatMap((item) => {
    const platform = platforms.get(String(item.parentId || ''));
    const id = String(item.id || '').trim();
    const name = String(item.name || '').trim();
    const platformId = String(platform?.id || '').trim();
    const platformName = String(platform?.name || '').trim();
    if (!id || !name || !platformId || !platformName) return [];
    return [{
      id,
      platformId,
      platformCode: businessPlatformCode(platformName),
      platformName,
      name,
      ...(item.platformShopId !== undefined ? { platformShopId: String(item.platformShopId || '').trim() || null } : {}),
      ...(Array.isArray(item.aliases) ? { aliases: stringArray(item.aliases) } : {}),
      active: item.isActive !== false && platform?.isActive !== false,
    }];
  });
}

function mapping(row: any): BrowserStoredProductMapping {
  return { ...row, aliases: stringArray(row.aliases) };
}

function product(row: any) {
  const data = row?.data && typeof row.data === 'object' && !Array.isArray(row.data) ? row.data : {};
  return {
    id: String(row.recordId),
    name: String(data.name || '').trim(),
    price: Number(data.price),
    isActive: data.isActive === true,
  };
}

function createMappingRepository(prisma: BrowserCatalogDataClient): BrowserShopMappingRepository {
  return {
    async listMappings(shopBindingId) {
      return (await prisma.browserProductMapping.findMany({
        where: shopBindingId ? { shopBindingId } : undefined,
        orderBy: [{ active: 'desc' }, { updatedAt: 'desc' }],
      })).map(mapping);
    },
    async findMappingById(id) {
      const row = await prisma.browserProductMapping.findUnique({ where: { id } });
      return row ? mapping(row) : null;
    },
    async createMapping(input) {
      return mapping(await prisma.browserProductMapping.create({ data: input as any }));
    },
    async updateMapping(id, input) {
      const updated = await prisma.browserProductMapping.updateMany({ where: { id }, data: input as any });
      if (updated.count !== 1) return null;
      const row = await prisma.browserProductMapping.findUnique({ where: { id } });
      return row ? mapping(row) : null;
    },
  };
}

export function createPrismaBrowserCatalogRepository(prisma: BrowserCatalogPrisma): BrowserCatalogRepository {
  const mappingRepository = createMappingRepository(prisma);
  const hydrate = (row: any, directory: BusinessShopDirectoryEntry[]) => {
    const stored = shop(row);
    if (!stored.businessShopId) return { ...stored, active: false };
    const business = directory.find((item) => item.id === stored.businessShopId);
    if (!business) return { ...stored, active: false };
    return {
      ...stored,
      businessPlatformId: business.platformId,
      businessPlatformName: business.platformName,
      platform: business.platformCode,
      displayName: business.name,
      platformShopId: business.platformShopId !== undefined ? business.platformShopId : stored.platformShopId,
      aliases: business.aliases !== undefined ? business.aliases : stored.aliases,
      active: stored.active && business.active,
    };
  };
  const linkAndHydrate = async (rows: any[]) => {
    const directory = await listBusinessShops(prisma);
    const candidates = uniqueLegacyBusinessShopMatches(rows.map(shop), directory);
    for (const [index, row] of rows.entries()) {
      if (row.businessShopId) continue;
      const business = candidates[index];
      if (!business) continue;
      try {
        const updated = await prisma.browserShopBinding.updateMany({
          where: { id: row.id, businessShopId: null },
          data: { businessPlatformId: business.platformId, businessShopId: business.id },
        });
        if (updated.count === 1) {
          row.businessPlatformId = business.platformId;
          row.businessShopId = business.id;
        }
      } catch (error) {
        if (!(error && typeof error === 'object' && (error as { code?: unknown }).code === 'P2002')) throw error;
      }
    }
    return rows.map((row) => hydrate(row, directory));
  };
  return {
    async listBusinessShops() { return listBusinessShops(prisma); },
    async findBusinessShopById(id) {
      return (await listBusinessShops(prisma)).find((item) => item.id === id) || null;
    },
    async listShops() {
      return linkAndHydrate(await prisma.browserShopBinding.findMany({ orderBy: [{ active: 'desc' }, { updatedAt: 'desc' }] }));
    },
    async findShopById(id) {
      const row = await prisma.browserShopBinding.findUnique({ where: { id } });
      return row ? hydrate(row, await listBusinessShops(prisma)) : null;
    },
    async findShopByPlatformAndKey(platform, shopKey) {
      const row = await prisma.browserShopBinding.findUnique({
        where: { platform_shopKey: { platform, shopKey } },
      });
      return row ? hydrate(row, await listBusinessShops(prisma)) : null;
    },
    async createShop(input) {
      const row = await prisma.browserShopBinding.create({ data: input as any });
      return (await linkAndHydrate([row]))[0];
    },
    async updateShop(id, input) {
      const updated = await prisma.browserShopBinding.updateMany({ where: { id }, data: input as any });
      if (updated.count !== 1) return null;
      const row = await prisma.browserShopBinding.findUnique({ where: { id } });
      return row ? (await linkAndHydrate([row]))[0] : null;
    },
    async deleteShop(id) {
      const deleted = await prisma.browserShopBinding.deleteMany({ where: { id } });
      return deleted.count === 1;
    },
    ...mappingRepository,
    async listProducts() {
      return (await prisma.businessRecord.findMany({
        where: { domain: STORAGE_KEYS.PRODUCTS },
        orderBy: { createdAt: 'asc' },
      })).map(product);
    },
    async findProductById(id) {
      const row = await prisma.businessRecord.findUnique({
        where: { domain_recordId: { domain: STORAGE_KEYS.PRODUCTS, recordId: id } },
      });
      return row ? product(row) : null;
    },
    async hasShopAuditReferences(id) {
      return await prisma.browserLeadSync.count({ where: { shopBindingId: id } }) > 0;
    },
    async withShopMappingLock(shopBindingId, callback) {
      return prisma.$transaction(async (transaction) => {
        const lockedRows = await transaction.$queryRaw<Array<{ id: string; active: boolean | number }>>(
          Prisma.sql`SELECT id, active FROM browser_shop_bindings WHERE id = ${shopBindingId} FOR UPDATE`,
        );
        const lockedRow = lockedRows[0];
        return callback(
          createMappingRepository(transaction),
          lockedRow ? { id: String(lockedRow.id), active: Boolean(lockedRow.active) } : null,
        );
      });
    },
  };
}
