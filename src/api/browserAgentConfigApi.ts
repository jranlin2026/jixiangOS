import { backendRequest } from './backendClient';
import type {
  BrowserAgentCatalog,
  BrowserCatalogApiResponse,
  BrowserProductMapping,
  BrowserProductMappingInput,
  BrowserShopBinding,
  BrowserShopInput,
  BrowserScriptLibrary,
  BrowserScriptLibraryView,
} from '../types/browserAgent';

async function catalogRequest<T>(path: string, init?: RequestInit): Promise<BrowserCatalogApiResponse<T>> {
  return backendRequest<T | null>(path, init) as Promise<BrowserCatalogApiResponse<T>>;
}

export const browserAgentConfigApi = {
  getScriptLibrary: () => catalogRequest<BrowserScriptLibraryView>('/browser-agent/script-library'),

  saveScriptLibrary: (library: BrowserScriptLibrary) => catalogRequest<BrowserScriptLibraryView>(
    '/browser-agent/script-library',
    { method: 'PUT', body: JSON.stringify(library) },
  ),

  getCatalog: () => catalogRequest<BrowserAgentCatalog>('/browser-agent/catalog'),

  syncBusinessShop: (id: string) => catalogRequest<BrowserShopBinding>(
    `/browser-agent/catalog/business-shops/${encodeURIComponent(id)}/sync`,
    { method: 'PUT' },
  ),

  createShop: (input: BrowserShopInput) => catalogRequest<BrowserShopBinding>('/browser-agent/catalog/shops', {
    method: 'POST',
    body: JSON.stringify(input),
  }),

  updateShop: (id: string, input: BrowserShopInput) => catalogRequest<BrowserShopBinding>(
    `/browser-agent/catalog/shops/${encodeURIComponent(id)}`,
    { method: 'PUT', body: JSON.stringify(input) },
  ),

  createMapping: (input: BrowserProductMappingInput) => catalogRequest<BrowserProductMapping>(
    '/browser-agent/catalog/product-mappings',
    { method: 'POST', body: JSON.stringify(input) },
  ),

  updateMapping: (id: string, input: BrowserProductMappingInput) => catalogRequest<BrowserProductMapping>(
    `/browser-agent/catalog/product-mappings/${encodeURIComponent(id)}`,
    { method: 'PUT', body: JSON.stringify(input) },
  ),

  disableMapping: (id: string) => catalogRequest<BrowserProductMapping>(
    `/browser-agent/catalog/product-mappings/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  ),
};
