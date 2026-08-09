export type BrowserCatalogProduct = {
  id: string;
  name: string;
  price: number;
  isActive: boolean;
};

export type BrowserStoreProductMapping = {
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
};

export type BrowserPlatformProductFacts = {
  platformProductId?: string | null;
  platformSkuId?: string | null;
  platformProductName?: string | null;
  paymentAmount?: number | null;
};

export type BrowserRequiredOrderFacts = BrowserPlatformProductFacts;
