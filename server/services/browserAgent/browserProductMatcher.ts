import type {
  BrowserCatalogProduct,
  BrowserPlatformProductFacts,
  BrowserStoreProductMapping,
} from './browserCatalogTypes';

export type ProductMatchMethod = 'PLATFORM_PRODUCT_ID' | 'PLATFORM_SKU_ID' | 'SHOP_ALIAS' | 'EXACT_OS_NAME';

export type BrowserProductResolution =
  | { status: 'MATCHED'; method: ProductMatchMethod; osProductId: string; osProductName: string; osReferencePrice: number }
  | { status: 'UNMATCHED'; rawProductName: string }
  | { status: 'CONFIG_CONFLICT'; message: string };

export type ResolveBrowserProductInput = {
  shopBindingId?: string;
  facts: BrowserPlatformProductFacts;
  products: BrowserCatalogProduct[];
  mappings: BrowserStoreProductMapping[];
};

export function normalizePlatformProductName(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('zh-CN');
}

function normalizedId(value: string | null | undefined) {
  return String(value || '').trim();
}

function mappingReferences(mappings: BrowserStoreProductMapping[]) {
  return mappings.map((mapping) => `店铺/映射 ${mapping.shopBindingId}/${mapping.id}`).join('、');
}

function resolutionFromMappings(
  mappings: BrowserStoreProductMapping[],
  productsById: Map<string, BrowserCatalogProduct>,
  method: ProductMatchMethod,
): BrowserProductResolution | undefined {
  const productIds = [...new Set(mappings
    .filter((mapping) => mapping.active && productsById.get(mapping.osProductId)?.isActive)
    .map((mapping) => mapping.osProductId))];

  if (productIds.length === 0) return undefined;
  if (productIds.length > 1) {
    return {
      status: 'CONFIG_CONFLICT',
      message: `商品映射配置冲突：${mappingReferences(mappings)} 指向不同 OS 商品（${productIds.join(', ')}）。请在极享OS修正冲突映射后重试。`,
    };
  }

  const product = productsById.get(productIds[0]);
  if (!product) return undefined;
  return {
    status: 'MATCHED',
    method,
    osProductId: product.id,
    osProductName: product.name,
    osReferencePrice: product.price,
  };
}

function mappingResolution(
  mappings: BrowserStoreProductMapping[],
  productsById: Map<string, BrowserCatalogProduct>,
  method: ProductMatchMethod,
  predicate: (mapping: BrowserStoreProductMapping) => boolean,
) {
  return resolutionFromMappings(mappings.filter(predicate), productsById, method);
}

export function resolveBrowserProduct(input: ResolveBrowserProductInput): BrowserProductResolution {
  const rawProductName = input.facts.platformProductName || '';
  const productsById = new Map(input.products.map((product) => [product.id, product]));
  const shopBindingId = normalizedId(input.shopBindingId);
  if (!shopBindingId && input.mappings.length > 0) {
    return {
      status: 'CONFIG_CONFLICT',
      message: `缺少店铺绑定，无法安全选择商品映射（受影响映射：${mappingReferences(input.mappings)}）。请补充店铺绑定并修正冲突映射后重试。`,
    };
  }
  const currentShopMappings = input.mappings.filter((mapping) => mapping.shopBindingId === shopBindingId);
  const platformProductId = normalizedId(input.facts.platformProductId);
  const platformSkuId = normalizedId(input.facts.platformSkuId);

  if (platformProductId) {
    const resolution = mappingResolution(
      currentShopMappings,
      productsById,
      'PLATFORM_PRODUCT_ID',
      (mapping) => normalizedId(mapping.platformProductId) === platformProductId,
    );
    if (resolution) return resolution;
  }

  if (platformSkuId) {
    const resolution = mappingResolution(
      currentShopMappings,
      productsById,
      'PLATFORM_SKU_ID',
      (mapping) => normalizedId(mapping.platformSkuId) === platformSkuId,
    );
    if (resolution) return resolution;
  }

  const normalizedProductName = normalizePlatformProductName(rawProductName);
  if (!normalizedProductName) return { status: 'UNMATCHED', rawProductName };

  const aliasResolution = mappingResolution(
    currentShopMappings,
    productsById,
    'SHOP_ALIAS',
    (mapping) => mapping.aliases.some((alias) => normalizePlatformProductName(alias) === normalizedProductName),
  );
  if (aliasResolution) return aliasResolution;

  const exactProducts = input.products.filter((product) => (
    product.isActive && normalizePlatformProductName(product.name) === normalizedProductName
  ));
  if (exactProducts.length === 1) {
    const product = exactProducts[0];
    return {
      status: 'MATCHED',
      method: 'EXACT_OS_NAME',
      osProductId: product.id,
      osProductName: product.name,
      osReferencePrice: product.price,
    };
  }

  return { status: 'UNMATCHED', rawProductName };
}
