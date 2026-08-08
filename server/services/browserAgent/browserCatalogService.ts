import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../../../src/types/auth';
import type { ApiResponse } from '../../api/response';
import { success } from '../../api/response';
import type { BrowserCatalogProduct, BrowserPlatformProductFacts, BrowserStoreProductMapping } from './browserCatalogTypes';
import { normalizePlatformProductName, resolveBrowserProduct, type BrowserProductResolution } from './browserProductMatcher';

export type BrowserShopBinding = {
  id: string;
  platform: string;
  shopKey: string;
  platformShopId?: string | null;
  displayName: string;
  aliases: string[];
  source: string;
  sourceName: string;
  sourceType: string;
  active: boolean;
  createdById: string;
  createdByName: string;
  createdAt?: Date;
  updatedAt?: Date;
};

export type BrowserStoredProductMapping = BrowserStoreProductMapping & {
  confirmedById: string;
  confirmedByName: string;
  confirmedAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
};

export type BrowserShopInput = {
  platform?: string;
  shopKey?: string;
  platformShopId?: string | null;
  displayName?: string;
  aliases?: string[];
  active?: boolean;
};

export type BrowserProductMappingInput = {
  shopBindingId: string;
  platformProductId?: string | null;
  platformSkuId?: string | null;
  platformProductName: string;
  aliases: string[];
  osProductId: string;
  active: boolean;
};

export type BrowserShopMappingRepository = {
  listMappings(shopBindingId?: string): Promise<BrowserStoredProductMapping[]>;
  findMappingById(id: string): Promise<BrowserStoredProductMapping | null>;
  createMapping(input: Omit<BrowserStoredProductMapping, 'id'> & { id?: string }): Promise<BrowserStoredProductMapping>;
  updateMapping(id: string, input: Partial<BrowserStoredProductMapping>): Promise<BrowserStoredProductMapping | null>;
};

export type BrowserCatalogRepository = {
  listShops(): Promise<BrowserShopBinding[]>;
  findShopById(id: string): Promise<BrowserShopBinding | null>;
  findShopByPlatformAndKey(platform: string, shopKey: string): Promise<BrowserShopBinding | null>;
  createShop(input: Omit<BrowserShopBinding, 'id'> & { id?: string }): Promise<BrowserShopBinding>;
  updateShop(id: string, input: Partial<BrowserShopBinding>): Promise<BrowserShopBinding | null>;
  deleteShop(id: string): Promise<boolean>;
  listMappings: BrowserShopMappingRepository['listMappings'];
  findMappingById: BrowserShopMappingRepository['findMappingById'];
  createMapping: BrowserShopMappingRepository['createMapping'];
  updateMapping: BrowserShopMappingRepository['updateMapping'];
  listProducts(): Promise<BrowserCatalogProduct[]>;
  findProductById(id: string): Promise<BrowserCatalogProduct | null>;
  hasShopAuditReferences(id: string): Promise<boolean>;
  withShopMappingLock<T>(
    shopBindingId: string,
    callback: (repository: BrowserShopMappingRepository) => Promise<T>,
  ): Promise<T>;
};

export type BrowserCatalogErrorCode =
  | 'INVALID_INPUT'
  | 'SHOP_KEY_CONFLICT'
  | 'SHOP_KEY_IMMUTABLE'
  | 'SHOP_BINDING_NOT_FOUND'
  | 'SHOP_BINDING_UNAVAILABLE'
  | 'SHOP_CONTEXT_MISMATCH'
  | 'OS_PRODUCT_NOT_FOUND'
  | 'OS_PRODUCT_INACTIVE'
  | 'PRODUCT_ALIAS_CONFLICT'
  | 'PRODUCT_MAPPING_CONFLICT'
  | 'PRODUCT_MAPPING_NOT_FOUND'
  | 'PRODUCT_MAPPING_CONFIG_CONFLICT';

export type BrowserCatalogResponse<T> = ApiResponse<T | null> & { errorCode?: BrowserCatalogErrorCode };

function catalogFailure<T>(message: string, code: number, errorCode: BrowserCatalogErrorCode): BrowserCatalogResponse<T> {
  return { code, data: null, message, errorCode };
}

function cleanText(value: unknown) {
  return String(value ?? '').trim();
}

function uniqueTexts(values: unknown) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(cleanText).filter(Boolean))];
}

function normalizedAliases(platformProductName: string, aliases: string[]) {
  return [...new Set([platformProductName, ...aliases]
    .map((alias) => normalizePlatformProductName(alias))
    .filter(Boolean))];
}

function platformIdentityKey(input: BrowserProductMappingInput, aliases: string[]) {
  const productId = cleanText(input.platformProductId);
  if (productId) return `product:${productId}`;
  const skuId = cleanText(input.platformSkuId);
  if (skuId) return `sku:${skuId}`;
  return `name:${aliases[0] || normalizePlatformProductName(input.platformProductName)}`;
}

function runtimeShop(shop: BrowserShopBinding) {
  return {
    id: shop.id,
    platform: shop.platform,
    shopKey: shop.shopKey,
    platformShopId: shop.platformShopId ?? null,
    displayName: shop.displayName,
    aliases: shop.aliases,
    source: shop.source,
    sourceName: shop.sourceName,
    sourceType: shop.sourceType,
  };
}

function uniqueConflict(error: unknown) {
  return Boolean(error && typeof error === 'object' && (error as { code?: unknown }).code === 'P2002');
}

export function createBrowserCatalogService(deps: { repository: BrowserCatalogRepository }) {
  const { repository } = deps;

  async function saveMapping(
    input: BrowserProductMappingInput,
    actor: AuthenticatedUser,
    mappingId?: string,
  ): Promise<BrowserCatalogResponse<BrowserStoredProductMapping>> {
    const shopBindingId = cleanText(input.shopBindingId);
    const platformProductName = cleanText(input.platformProductName);
    const osProductId = cleanText(input.osProductId);
    if (!shopBindingId || !platformProductName || !osProductId) {
      return catalogFailure('店铺、平台商品名称和OS标准产品不能为空', 400, 'INVALID_INPUT');
    }
    if (!await repository.findShopById(shopBindingId)) {
      return catalogFailure('店铺绑定不存在', 404, 'SHOP_BINDING_NOT_FOUND');
    }
    const product = await repository.findProductById(osProductId);
    if (!product) return catalogFailure('OS标准产品不存在', 404, 'OS_PRODUCT_NOT_FOUND');
    if (!product.isActive) return catalogFailure('OS标准产品已停用', 409, 'OS_PRODUCT_INACTIVE');

    const aliases = normalizedAliases(platformProductName, uniqueTexts(input.aliases));
    const now = new Date();
    const values = {
      shopBindingId,
      platformIdentityKey: platformIdentityKey(input, aliases),
      platformProductId: cleanText(input.platformProductId) || null,
      platformSkuId: cleanText(input.platformSkuId) || null,
      platformProductName,
      aliases,
      osProductId: product.id,
      osProductName: product.name,
      active: Boolean(input.active),
      confirmedById: actor.id,
      confirmedByName: actor.name,
      confirmedAt: now,
    };
    return repository.withShopMappingLock(shopBindingId, async (mappingRepository) => {
      const existing = mappingId ? await mappingRepository.findMappingById(mappingId) : null;
      if (mappingId && !existing) return catalogFailure('商品映射不存在', 404, 'PRODUCT_MAPPING_NOT_FOUND');
      if (existing && existing.shopBindingId !== shopBindingId) {
        return catalogFailure('商品映射创建后不能修改所属店铺', 409, 'PRODUCT_MAPPING_CONFLICT');
      }
      if (input.active) {
        const aliasSet = new Set(aliases);
        const conflict = (await mappingRepository.listMappings(shopBindingId)).find((mapping) => (
          mapping.id !== mappingId
          && mapping.active
          && mapping.osProductId !== product.id
          && mapping.aliases.some((alias) => aliasSet.has(normalizePlatformProductName(alias)))
        ));
        if (conflict) {
          return catalogFailure(
            `平台商品别名已指向OS产品“${conflict.osProductName}”，请先修正冲突映射`,
            409,
            'PRODUCT_ALIAS_CONFLICT',
          );
        }
      }
      try {
        const saved = mappingId
          ? await mappingRepository.updateMapping(mappingId, values)
          : await mappingRepository.createMapping({ id: randomUUID(), ...values });
        return saved
          ? success(saved)
          : catalogFailure('商品映射不存在', 404, 'PRODUCT_MAPPING_NOT_FOUND');
      } catch (error) {
        if (uniqueConflict(error)) {
          return catalogFailure('当前店铺已存在相同平台商品身份的映射', 409, 'PRODUCT_MAPPING_CONFLICT');
        }
        throw error;
      }
    });
  }

  return {
    async listRuntimeShops() {
      const shops = (await repository.listShops()).filter((shop) => shop.active).map(runtimeShop);
      return success({ shops });
    },

    async listCatalog() {
      const [shops, mappings, products] = await Promise.all([
        repository.listShops(), repository.listMappings(), repository.listProducts(),
      ]);
      return success({ shops, mappings, products });
    },

    async createShop(input: BrowserShopInput, actor: AuthenticatedUser): Promise<BrowserCatalogResponse<BrowserShopBinding>> {
      const platform = cleanText(input.platform).toUpperCase();
      const shopKey = cleanText(input.shopKey);
      const displayName = cleanText(input.displayName);
      if (!platform || !shopKey || !displayName) {
        return catalogFailure('平台、稳定店铺标识和店铺名称不能为空', 400, 'INVALID_INPUT');
      }
      if (await repository.findShopByPlatformAndKey(platform, shopKey)) {
        return catalogFailure('同一平台下的稳定店铺标识必须唯一', 409, 'SHOP_KEY_CONFLICT');
      }
      try {
        return success(await repository.createShop({
          id: randomUUID(),
          platform,
          shopKey,
          platformShopId: cleanText(input.platformShopId) || null,
          displayName,
          aliases: uniqueTexts(input.aliases),
          source: '抖音电商',
          sourceName: '飞鸽客服',
          sourceType: '公司资源',
          active: input.active !== false,
          createdById: actor.id,
          createdByName: actor.name,
        }));
      } catch (error) {
        if (uniqueConflict(error)) {
          return catalogFailure('同一平台下的稳定店铺标识必须唯一', 409, 'SHOP_KEY_CONFLICT');
        }
        throw error;
      }
    },

    async updateShop(id: string, input: BrowserShopInput, _actor: AuthenticatedUser): Promise<BrowserCatalogResponse<BrowserShopBinding>> {
      const existing = await repository.findShopById(id);
      if (!existing) return catalogFailure('店铺绑定不存在', 404, 'SHOP_BINDING_NOT_FOUND');
      if ((input.shopKey !== undefined && cleanText(input.shopKey) !== existing.shopKey)
        || (input.platform !== undefined && cleanText(input.platform).toUpperCase() !== existing.platform)) {
        return catalogFailure('平台和稳定店铺标识创建后不可修改', 409, 'SHOP_KEY_IMMUTABLE');
      }
      const displayName = input.displayName === undefined ? existing.displayName : cleanText(input.displayName);
      if (!displayName) return catalogFailure('店铺名称不能为空', 400, 'INVALID_INPUT');
      const updated = await repository.updateShop(id, {
        displayName,
        platformShopId: input.platformShopId === undefined
          ? existing.platformShopId
          : (cleanText(input.platformShopId) || null),
        aliases: input.aliases === undefined ? existing.aliases : uniqueTexts(input.aliases),
        active: input.active === undefined ? existing.active : Boolean(input.active),
      });
      return updated ? success(updated) : catalogFailure('店铺绑定不存在', 404, 'SHOP_BINDING_NOT_FOUND');
    },

    async deleteShop(id: string, _actor: AuthenticatedUser): Promise<BrowserCatalogResponse<BrowserShopBinding & { deleted?: boolean }>> {
      const existing = await repository.findShopById(id);
      if (!existing) return catalogFailure('店铺绑定不存在', 404, 'SHOP_BINDING_NOT_FOUND');
      if (await repository.hasShopAuditReferences(id)) {
        const retired = await repository.updateShop(id, { active: false });
        return retired ? success(retired) : catalogFailure('店铺绑定不存在', 404, 'SHOP_BINDING_NOT_FOUND');
      }
      await repository.deleteShop(id);
      return success({ ...existing, active: false, deleted: true });
    },

    saveMapping,

    async updateMapping(id: string, input: BrowserProductMappingInput, actor: AuthenticatedUser) {
      return saveMapping(input, actor, id);
    },

    async deleteMapping(id: string, _actor: AuthenticatedUser): Promise<BrowserCatalogResponse<BrowserStoredProductMapping>> {
      const existing = await repository.findMappingById(id);
      if (!existing) return catalogFailure('商品映射不存在', 404, 'PRODUCT_MAPPING_NOT_FOUND');
      return repository.withShopMappingLock(existing.shopBindingId, async (mappingRepository) => {
        if (!await mappingRepository.findMappingById(id)) {
          return catalogFailure('商品映射不存在', 404, 'PRODUCT_MAPPING_NOT_FOUND');
        }
        const retired = await mappingRepository.updateMapping(id, { active: false });
        return retired ? success(retired) : catalogFailure('商品映射不存在', 404, 'PRODUCT_MAPPING_NOT_FOUND');
      });
    },

    async resolveForIntake(input: {
      shopBindingId: string;
      pageShopDisplayName?: string;
      facts: BrowserPlatformProductFacts;
    }): Promise<BrowserCatalogResponse<{
      binding: ReturnType<typeof runtimeShop>;
      resolution: BrowserProductResolution;
      product: { id: string; name: string; referencePrice: number } | null;
      priceDifference: { paymentAmount: number; osReferencePrice: number; amount: number; differs: boolean } | null;
    }>> {
      const binding = await repository.findShopById(cleanText(input.shopBindingId));
      if (!binding || !binding.active) {
        return catalogFailure('店铺绑定不存在或已停用', 409, 'SHOP_BINDING_UNAVAILABLE');
      }
      const pageShopName = normalizePlatformProductName(cleanText(input.pageShopDisplayName));
      const acceptedShopNames = [binding.displayName, ...binding.aliases].map(normalizePlatformProductName);
      if (pageShopName && !acceptedShopNames.includes(pageShopName)) {
        return catalogFailure('当前页面店铺与已选店铺绑定不一致', 409, 'SHOP_CONTEXT_MISMATCH');
      }
      const [products, mappings] = await Promise.all([
        repository.listProducts(), repository.listMappings(binding.id),
      ]);
      const resolution = resolveBrowserProduct({
        shopBindingId: binding.id,
        facts: input.facts,
        products,
        mappings,
      });
      if (resolution.status === 'CONFIG_CONFLICT') {
        return catalogFailure(resolution.message, 409, 'PRODUCT_MAPPING_CONFIG_CONFLICT');
      }
      const product = resolution.status === 'MATCHED'
        ? { id: resolution.osProductId, name: resolution.osProductName, referencePrice: resolution.osReferencePrice }
        : null;
      const paymentAmount = input.facts.paymentAmount;
      const priceDifference = product && typeof paymentAmount === 'number' && Number.isFinite(paymentAmount)
        ? {
            paymentAmount,
            osReferencePrice: product.referencePrice,
            amount: Number((paymentAmount - product.referencePrice).toFixed(2)),
            differs: paymentAmount !== product.referencePrice,
          }
        : null;
      return success({ binding: runtimeShop(binding), resolution, product, priceDifference });
    },
  };
}

export type BrowserCatalogService = ReturnType<typeof createBrowserCatalogService>;
