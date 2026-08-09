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
  createdAt?: string;
  updatedAt?: string;
};

export type BrowserProductMapping = {
  id: string;
  shopBindingId: string;
  platformIdentityKey: string;
  platformProductId?: string | null;
  platformSkuId?: string | null;
  platformProductName?: string | null;
  aliases: string[];
  osProductId: string;
  osProductName: string;
  active: boolean;
  confirmedById: string;
  confirmedByName: string;
  confirmedAt: string;
  createdAt?: string;
  updatedAt?: string;
};

export type BrowserCatalogProduct = {
  id: string;
  name: string;
  price: number;
  isActive: boolean;
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

export type BrowserAgentCatalog = {
  shops: BrowserShopBinding[];
  mappings: BrowserProductMapping[];
  products: BrowserCatalogProduct[];
  businessShops?: BusinessShopDirectoryEntry[];
};

export type BrowserShopInput = {
  businessShopId?: string;
  platform?: string;
  shopKey?: string;
  platformShopId?: string;
  displayName?: string;
  aliases?: string[];
  active?: boolean;
};

export type BrowserProductMappingInput = {
  shopBindingId: string;
  platformProductId?: string;
  platformSkuId?: string;
  platformProductName: string;
  aliases: string[];
  osProductId: string;
  active: boolean;
};

export type BrowserCatalogApiResponse<T> = {
  code: number;
  data: T | null;
  message: string;
  errorCode?: BrowserCatalogErrorCode;
};
