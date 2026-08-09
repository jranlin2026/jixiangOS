import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../../../src/types/auth';
import type { ApiResponse } from '../../api/response';
import { success } from '../../api/response';
import type {
  BrowserCatalogProduct,
  BrowserRequiredOrderFacts,
  BrowserStoreProductMapping,
} from './browserCatalogTypes';
import { normalizePlatformProductName, resolveBrowserProduct, type BrowserProductResolution } from './browserProductMatcher';

export type BrowserShopBinding = {
  id: string;
  businessPlatformId?: string | null;
  businessPlatformName?: string | null;
  businessShopId?: string | null;
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
  businessShopId?: string;
  platform?: string;
  shopKey?: string;
  platformShopId?: string | null;
  displayName?: string;
  aliases?: string[];
  active?: boolean;
};

export type BusinessShopDirectoryEntry = {
  id: string;
  platformId: string;
  platformCode: string;
  platformName: string;
  name: string;
  platformShopId?: string | null;
  aliases?: string[];
  active: boolean;
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

export type BrowserLockedShopBinding = Pick<BrowserShopBinding, 'id' | 'active'>;

export type BrowserCatalogRepository = {
  listBusinessShops(): Promise<BusinessShopDirectoryEntry[]>;
  findBusinessShopById(id: string): Promise<BusinessShopDirectoryEntry | null>;
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
    callback: (
      repository: BrowserShopMappingRepository,
      lockedShop: BrowserLockedShopBinding | null,
    ) => Promise<T>,
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
  | 'PRODUCT_MAPPING_CONFIG_CONFLICT'
  | 'PRODUCT_CONFIG_CONFLICT';

export type BrowserProductPreviewInput = {
  platform?: string;
  shopBindingId?: string;
  pageShopDisplayName?: string;
  platformProductId?: string;
  platformSkuId?: string;
  platformProductName?: string;
  paymentAmount?: number;
  paymentAt?: string;
};

export type BrowserProductPreview = {
  shop: ReturnType<typeof runtimeShop>;
  productResolution: Exclude<BrowserProductResolution, { status: 'CONFIG_CONFLICT' }>;
  facts: BrowserRequiredOrderFacts & { paymentAt?: string };
  priceDifference: { paymentAmount: number; osReferencePrice: number; amount: number; differs: boolean } | null;
};

export type BrowserCatalogResponse<T> = ApiResponse<T | null> & { errorCode?: BrowserCatalogErrorCode };

function catalogFailure<T>(message: string, code: number, errorCode: BrowserCatalogErrorCode): BrowserCatalogResponse<T> {
  return { code, data: null, message, errorCode };
}

function cleanText(value: unknown) {
  return String(value ?? '').trim();
}

export function browserPaymentAmountInCents(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  if (Number(value.toFixed(2)) !== value) return null;
  const cents = Math.round(value * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

export function browserPaymentAtDate(value: unknown) {
  const text = cleanText(value);
  const parts = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/);
  if (!parts) return null;
  const [year, month, day, hour, minute, second] = parts.slice(1, 7).map(Number);
  const calendar = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (calendar.getUTCFullYear() !== year
    || calendar.getUTCMonth() !== month - 1
    || calendar.getUTCDate() !== day
    || calendar.getUTCHours() !== hour
    || calendar.getUTCMinutes() !== minute
    || calendar.getUTCSeconds() !== second) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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
    ...(shop.businessPlatformId ? { businessPlatformId: shop.businessPlatformId } : {}),
    ...(shop.businessPlatformName ? { businessPlatformName: shop.businessPlatformName } : {}),
    ...(shop.businessShopId ? { businessShopId: shop.businessShopId } : {}),
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

  async function syncBusinessShop(
    businessShopId: string,
    actor: AuthenticatedUser,
  ): Promise<BrowserCatalogResponse<BrowserShopBinding>> {
    const id = cleanText(businessShopId);
    const businessShop = id ? await repository.findBusinessShopById(id) : null;
    if (!businessShop) return catalogFailure('业务店铺不存在', 404, 'SHOP_BINDING_NOT_FOUND');
    if (businessShop.platformCode.toUpperCase() !== 'DOUYIN') {
      return catalogFailure('当前浏览器员工MVP仅支持抖音店铺', 400, 'INVALID_INPUT');
    }
    const existing = (await repository.listShops()).find((shop) => shop.businessShopId === businessShop.id);
    const platformShopId = businessShop.platformShopId !== undefined
      ? cleanText(businessShop.platformShopId)
      : cleanText(existing?.platformShopId);
    if (!existing && !platformShopId) {
      return catalogFailure('请先在业务平台与店铺中填写平台店铺ID', 400, 'INVALID_INPUT');
    }
    const values = {
      businessPlatformId: businessShop.platformId,
      businessShopId: businessShop.id,
      platform: 'DOUYIN',
      platformShopId: platformShopId || null,
      displayName: businessShop.name,
      aliases: businessShop.aliases !== undefined ? uniqueTexts(businessShop.aliases) : (existing?.aliases || []),
      source: '抖音电商',
      sourceName: '飞鸽客服',
      sourceType: '公司资源',
      active: businessShop.active,
    };
    try {
      if (existing) {
        const updated = await repository.updateShop(existing.id, values);
        return updated ? success(updated) : catalogFailure('店铺绑定不存在', 404, 'SHOP_BINDING_NOT_FOUND');
      }
      return success(await repository.createShop({
        id: randomUUID(),
        ...values,
        shopKey: `business-${businessShop.id}`,
        createdById: actor.id,
        createdByName: actor.name,
      }));
    } catch (error) {
      if (uniqueConflict(error)) {
        return catalogFailure('该业务店铺已接入浏览器员工', 409, 'SHOP_KEY_CONFLICT');
      }
      throw error;
    }
  }

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
    return repository.withShopMappingLock(shopBindingId, async (mappingRepository, lockedShop) => {
      if (!lockedShop) {
        return catalogFailure('店铺绑定不存在', 404, 'SHOP_BINDING_NOT_FOUND');
      }
      if (!lockedShop.active) {
        return catalogFailure('店铺绑定已停用', 409, 'SHOP_BINDING_UNAVAILABLE');
      }
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

  async function resolveForIntake(input: {
    platform: string;
    shopBindingId: string;
    pageShopDisplayName?: string;
    facts: BrowserRequiredOrderFacts;
  }): Promise<BrowserCatalogResponse<{
    binding: ReturnType<typeof runtimeShop>;
    resolution: BrowserProductResolution;
    product: { id: string; name: string; referencePrice: number } | null;
    priceDifference: { paymentAmount: number; osReferencePrice: number; amount: number; differs: boolean } | null;
  }>> {
    const binding = await repository.findShopById(cleanText(input.shopBindingId));
    const platform = cleanText(input.platform).toUpperCase();
    if (!binding || !binding.active || cleanText(binding.platform).toUpperCase() !== platform) {
      return catalogFailure('店铺绑定不存在或已停用', 409, 'SHOP_BINDING_UNAVAILABLE');
    }
    const [products, allMappings, shops] = await Promise.all([
      repository.listProducts(), repository.listMappings(), repository.listShops(),
    ]);
    const activeShopIds = new Set(shops.filter((shop) => shop.active).map((shop) => shop.id));
    const mappings = allMappings.filter((mapping) => activeShopIds.has(mapping.shopBindingId));
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
    const paymentCents = browserPaymentAmountInCents(paymentAmount);
    const referenceCents = product ? Math.round(product.referencePrice * 100) : null;
    const priceDifference = product && paymentCents !== null && referenceCents !== null
      ? {
          paymentAmount: paymentCents / 100,
          osReferencePrice: referenceCents / 100,
          amount: (paymentCents - referenceCents) / 100,
          differs: paymentCents !== referenceCents,
        }
      : null;
    return success({ binding: runtimeShop(binding), resolution, product, priceDifference });
  }

  async function previewProductMapping(
    input: BrowserProductPreviewInput,
  ): Promise<BrowserCatalogResponse<BrowserProductPreview>> {
    if (cleanText(input.platform).toUpperCase() !== 'DOUYIN') {
      return catalogFailure('当前仅支持抖音平台', 400, 'INVALID_INPUT');
    }
    const shopBindingId = cleanText(input.shopBindingId);
    if (!shopBindingId) return catalogFailure('店铺绑定不能为空', 400, 'INVALID_INPUT');
    const platformProductName = cleanText(input.platformProductName);
    const hasPaymentAmount = input.paymentAmount !== undefined && input.paymentAmount !== null;
    const paymentCents = hasPaymentAmount ? browserPaymentAmountInCents(input.paymentAmount) : null;
    if (hasPaymentAmount && paymentCents === null) {
      return catalogFailure('实付金额必须为非负数且最多两位小数', 400, 'INVALID_INPUT');
    }
    const paymentAt = cleanText(input.paymentAt);
    const paymentAtDate = paymentAt ? browserPaymentAtDate(paymentAt) : null;
    if (paymentAt && !paymentAtDate) {
      return catalogFailure('付款时间格式不正确', 400, 'INVALID_INPUT');
    }
    const facts = {
      ...(cleanText(input.platformProductId) ? { platformProductId: cleanText(input.platformProductId) } : {}),
      ...(cleanText(input.platformSkuId) ? { platformSkuId: cleanText(input.platformSkuId) } : {}),
      ...(platformProductName ? { platformProductName } : {}),
      ...(paymentCents !== null ? { paymentAmount: paymentCents / 100 } : {}),
    };
    const resolved = await resolveForIntake({
      platform: 'DOUYIN',
      shopBindingId,
      pageShopDisplayName: cleanText(input.pageShopDisplayName) || undefined,
      facts,
    });
    if (resolved.code !== 0 || !resolved.data) {
      const errorCode = resolved.errorCode === 'PRODUCT_MAPPING_CONFIG_CONFLICT'
        ? 'PRODUCT_CONFIG_CONFLICT' as const
        : resolved.errorCode;
      return {
        code: resolved.code,
        data: null,
        message: resolved.message,
        ...(errorCode ? { errorCode } : {}),
      };
    }
    return success<BrowserProductPreview>({
      shop: resolved.data.binding,
      productResolution: resolved.data.resolution as BrowserProductPreview['productResolution'],
      facts: {
        ...facts,
        ...(paymentAtDate ? { paymentAt: paymentAtDate.toISOString() } : {}),
      },
      priceDifference: resolved.data.priceDifference,
    });
  }

  return {
    syncBusinessShop,
    async listRuntimeShops() {
      const shops = (await repository.listShops())
        .filter((shop) => shop.active && cleanText(shop.platform).toUpperCase() === 'DOUYIN')
        .map(runtimeShop);
      return success({ shops });
    },

    previewProductMapping,

    async listCatalog() {
      const [shops, mappings, products, businessShops] = await Promise.all([
        repository.listShops(), repository.listMappings(), repository.listProducts(), repository.listBusinessShops(),
      ]);
      return success({ shops, mappings, products, businessShops });
    },

    async createShop(input: BrowserShopInput, actor: AuthenticatedUser): Promise<BrowserCatalogResponse<BrowserShopBinding>> {
      const businessShopId = cleanText(input.businessShopId);
      const businessShop = businessShopId ? await repository.findBusinessShopById(businessShopId) : null;
      if (businessShopId && (!businessShop || !businessShop.active)) {
        return catalogFailure('业务店铺不存在或已停用，请先在业务平台与店铺中维护', 409, 'SHOP_BINDING_UNAVAILABLE');
      }
      if (businessShop && businessShop.platformCode.toUpperCase() !== 'DOUYIN') {
        return catalogFailure('当前浏览器员工MVP仅支持抖音店铺', 400, 'INVALID_INPUT');
      }
      if (businessShopId && (await repository.listShops()).some((shop) => shop.businessShopId === businessShopId)) {
        return catalogFailure('该业务店铺已接入平台商品映射，请直接编辑原配置', 409, 'SHOP_KEY_CONFLICT');
      }
      const platform = businessShop?.platformCode || cleanText(input.platform).toUpperCase();
      const shopKey = cleanText(input.shopKey);
      const displayName = businessShop?.name || cleanText(input.displayName);
      if (!platform || !shopKey || !displayName) {
        return catalogFailure('平台、稳定店铺标识和店铺名称不能为空', 400, 'INVALID_INPUT');
      }
      if (await repository.findShopByPlatformAndKey(platform, shopKey)) {
        return catalogFailure('同一平台下的稳定店铺标识必须唯一', 409, 'SHOP_KEY_CONFLICT');
      }
      try {
        return success(await repository.createShop({
          id: randomUUID(),
          businessPlatformId: businessShop?.platformId || null,
          businessShopId: businessShop?.id || null,
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
      const requestedBusinessShopId = input.businessShopId === undefined
        ? cleanText(existing.businessShopId)
        : cleanText(input.businessShopId);
      if (existing.businessShopId && requestedBusinessShopId !== cleanText(existing.businessShopId)) {
        return catalogFailure('已接入的业务店铺不能更换，请停用后重新接入', 409, 'SHOP_KEY_IMMUTABLE');
      }
      const businessShop = requestedBusinessShopId
        ? await repository.findBusinessShopById(requestedBusinessShopId)
        : null;
      if (requestedBusinessShopId && (!businessShop || !businessShop.active)) {
        return catalogFailure('业务店铺不存在或已停用，请先在业务平台与店铺中维护', 409, 'SHOP_BINDING_UNAVAILABLE');
      }
      if (businessShop && businessShop.platformCode.toUpperCase() !== 'DOUYIN') {
        return catalogFailure('当前浏览器员工MVP仅支持抖音店铺', 400, 'INVALID_INPUT');
      }
      if (!existing.businessShopId && requestedBusinessShopId
        && (await repository.listShops()).some((shop) => shop.id !== id && shop.businessShopId === requestedBusinessShopId)) {
        return catalogFailure('该业务店铺已接入平台商品映射，请直接编辑原配置', 409, 'SHOP_KEY_CONFLICT');
      }
      const displayName = businessShop?.name
        || (input.displayName === undefined ? existing.displayName : cleanText(input.displayName));
      if (!displayName) return catalogFailure('店铺名称不能为空', 400, 'INVALID_INPUT');
      try {
        const updated = await repository.updateShop(id, {
          ...(businessShop ? {
            businessPlatformId: businessShop.platformId,
            businessShopId: businessShop.id,
            platform: businessShop.platformCode,
          } : {}),
          displayName,
          platformShopId: input.platformShopId === undefined
            ? existing.platformShopId
            : (cleanText(input.platformShopId) || null),
          aliases: input.aliases === undefined ? existing.aliases : uniqueTexts(input.aliases),
          active: input.active === undefined ? existing.active : Boolean(input.active),
        });
        return updated ? success(updated) : catalogFailure('店铺绑定不存在', 404, 'SHOP_BINDING_NOT_FOUND');
      } catch (error) {
        if (uniqueConflict(error)) {
          return catalogFailure('该业务店铺已接入平台商品映射，请直接编辑原配置', 409, 'SHOP_KEY_CONFLICT');
        }
        throw error;
      }
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

    resolveForIntake,
  };
}

export type BrowserCatalogService = ReturnType<typeof createBrowserCatalogService>;
