import { Prisma, type PrismaClient } from '@prisma/client';
import { STORAGE_KEYS } from '../../../src/shared/utils/constants';
import type {
  BrowserCatalogRepository,
  BrowserShopMappingRepository,
  BrowserShopBinding,
  BrowserStoredProductMapping,
} from './browserCatalogService';

type BrowserCatalogDataClient = Pick<
  Prisma.TransactionClient,
  'browserShopBinding' | 'browserProductMapping' | 'browserLeadSync' | 'businessRecord'
>;
type BrowserCatalogPrisma = BrowserCatalogDataClient & Pick<PrismaClient, '$transaction'>;

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map((entry) => String(entry)).filter(Boolean) : [];
}

function shop(row: any): BrowserShopBinding {
  return { ...row, aliases: stringArray(row.aliases) };
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
  return {
    async listShops() {
      return (await prisma.browserShopBinding.findMany({ orderBy: [{ active: 'desc' }, { updatedAt: 'desc' }] })).map(shop);
    },
    async findShopById(id) {
      const row = await prisma.browserShopBinding.findUnique({ where: { id } });
      return row ? shop(row) : null;
    },
    async findShopByPlatformAndKey(platform, shopKey) {
      const row = await prisma.browserShopBinding.findUnique({
        where: { platform_shopKey: { platform, shopKey } },
      });
      return row ? shop(row) : null;
    },
    async createShop(input) {
      const row = await prisma.browserShopBinding.create({ data: input as any });
      return shop(row);
    },
    async updateShop(id, input) {
      const updated = await prisma.browserShopBinding.updateMany({ where: { id }, data: input as any });
      if (updated.count !== 1) return null;
      const row = await prisma.browserShopBinding.findUnique({ where: { id } });
      return row ? shop(row) : null;
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
