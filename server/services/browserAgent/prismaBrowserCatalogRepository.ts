import type { PrismaClient } from '@prisma/client';
import { STORAGE_KEYS } from '../../../src/shared/utils/constants';
import type {
  BrowserCatalogRepository,
  BrowserShopBinding,
  BrowserStoredProductMapping,
} from './browserCatalogService';

type BrowserCatalogPrisma = Pick<
  PrismaClient,
  'browserShopBinding' | 'browserProductMapping' | 'browserLeadSync' | 'businessRecord'
>;

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

export function createPrismaBrowserCatalogRepository(prisma: BrowserCatalogPrisma): BrowserCatalogRepository {
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
    async deleteMapping(id) {
      const deleted = await prisma.browserProductMapping.deleteMany({ where: { id } });
      return deleted.count === 1;
    },
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
    async hasMappingAuditReferences(id) {
      const row = await prisma.browserProductMapping.findUnique({ where: { id } });
      if (!row) return false;
      return await prisma.browserLeadSync.count({
        where: {
          shopBindingId: row.shopBindingId,
          matchedProductId: row.osProductId,
          OR: [
            ...(row.platformProductId ? [{ platformProductId: row.platformProductId }] : []),
            ...(row.platformSkuId ? [{ platformSkuId: row.platformSkuId }] : []),
            { sourceProductName: row.platformProductName },
          ],
        },
      }) > 0;
    },
  };
}
