import assert from 'node:assert/strict';
import { createBrowserCatalogService, type BrowserCatalogRepository } from './browserCatalogService';

const actor = { id: 'admin-1', name: '管理员', role: 'admin' } as any;
const shops = [
  {
    id: 'shop-1', platform: 'DOUYIN', shopKey: 'jx-main', platformShopId: 'dy-shop-1',
    displayName: '极享智能体', aliases: ['极享官方店'], source: '抖音电商', sourceName: '飞鸽客服',
    sourceType: '公司资源', active: true, createdById: 'admin-1', createdByName: '管理员',
  },
  {
    id: 'shop-off', platform: 'DOUYIN', shopKey: 'jx-old', platformShopId: null,
    displayName: '旧店铺', aliases: [], source: '抖音电商', sourceName: '飞鸽客服', sourceType: '公司资源',
    active: false, createdById: 'admin-1', createdByName: '管理员',
  },
];
const mappings: any[] = [];
const products = [
  { id: 'prod-taojin', name: '淘金AI', price: 299, isActive: true },
  { id: 'prod-off', name: '停用产品', price: 99, isActive: false },
];
const deletedMappings: string[] = [];

const repository: BrowserCatalogRepository = {
  async listShops() { return structuredClone(shops); },
  async findShopById(id) { return structuredClone(shops.find((shop) => shop.id === id) || null); },
  async findShopByPlatformAndKey(platform, shopKey) {
    return structuredClone(shops.find((shop) => shop.platform === platform && shop.shopKey === shopKey) || null);
  },
  async createShop(input) {
    const saved = { ...input, id: `shop-${shops.length + 1}` };
    shops.push(saved as any);
    return structuredClone(saved as any);
  },
  async updateShop(id, input) {
    const index = shops.findIndex((shop) => shop.id === id);
    if (index < 0) return null;
    shops[index] = { ...shops[index], ...input } as any;
    return structuredClone(shops[index]);
  },
  async deleteShop(id) {
    const index = shops.findIndex((shop) => shop.id === id);
    if (index < 0) return false;
    shops.splice(index, 1);
    return true;
  },
  async listMappings(shopBindingId) {
    return structuredClone(mappings.filter((mapping) => !shopBindingId || mapping.shopBindingId === shopBindingId));
  },
  async findMappingById(id) {
    return structuredClone(mappings.find((mapping) => mapping.id === id) || null);
  },
  async createMapping(input) {
    const saved = { ...input, id: `map-${mappings.length + 1}` };
    mappings.push(saved);
    return structuredClone(saved);
  },
  async updateMapping(id, input) {
    const index = mappings.findIndex((mapping) => mapping.id === id);
    if (index < 0) return null;
    mappings[index] = { ...mappings[index], ...input };
    return structuredClone(mappings[index]);
  },
  async deleteMapping(id) {
    const index = mappings.findIndex((mapping) => mapping.id === id);
    if (index < 0) return false;
    deletedMappings.push(id);
    mappings.splice(index, 1);
    return true;
  },
  async listProducts() { return structuredClone(products); },
  async findProductById(id) { return structuredClone(products.find((product) => product.id === id) || null); },
  async hasShopAuditReferences(id) { return id === 'shop-1'; },
  async hasMappingAuditReferences(id) { return id === 'map-audited'; },
};

const service = createBrowserCatalogService({ repository });

const runtime = await service.listRuntimeShops();
assert.equal(runtime.code, 0);
assert.deepEqual(runtime.data, {
  shops: [{
    id: 'shop-1', platform: 'DOUYIN', shopKey: 'jx-main', platformShopId: 'dy-shop-1',
    displayName: '极享智能体', aliases: ['极享官方店'], source: '抖音电商', sourceName: '飞鸽客服',
    sourceType: '公司资源',
  }],
});

const duplicateShop = await service.createShop({
  platform: 'DOUYIN', shopKey: 'jx-main', displayName: '重复店铺', aliases: [], active: true,
}, actor);
assert.equal(duplicateShop.code, 409);
assert.equal(duplicateShop.errorCode, 'SHOP_KEY_CONFLICT');

const changedKey = await service.updateShop('shop-1', { shopKey: 'new-key', displayName: '极享智能体' }, actor);
assert.equal(changedKey.code, 409);
assert.equal(changedKey.errorCode, 'SHOP_KEY_IMMUTABLE');

const inactiveProduct = await service.saveMapping({
  shopBindingId: 'shop-1', platformProductName: '已停用', aliases: [], osProductId: 'prod-off', active: true,
}, actor);
assert.equal(inactiveProduct.code, 409);
assert.equal(inactiveProduct.errorCode, 'OS_PRODUCT_INACTIVE');

const savedMapping = await service.saveMapping({
  shopBindingId: 'shop-1', platformProductId: 'DY-100',
  platformProductName: '  淘金ＡＩ   多模态  ', aliases: ['读书卡', ' 读书卡 '],
  osProductId: 'prod-taojin', active: true,
}, actor);
assert.equal(savedMapping.code, 0);
assert.equal(savedMapping.data?.osProductName, '淘金AI');
assert.deepEqual(savedMapping.data?.aliases, ['淘金ai 多模态', '读书卡']);

products.push({ id: 'prod-other', name: '其他产品', price: 399, isActive: true });
const aliasConflict = await service.saveMapping({
  shopBindingId: 'shop-1', platformProductId: 'DY-200', platformProductName: '别的商品',
  aliases: ['ＤＹ－ＡＩ　同款'], osProductId: 'prod-other', active: true,
}, actor);
assert.equal(aliasConflict.code, 0);
const normalizedConflict = await service.saveMapping({
  shopBindingId: 'shop-1', platformProductId: 'DY-201', platformProductName: '又一个商品',
  aliases: ['dy-ai 同款'], osProductId: 'prod-taojin', active: true,
}, actor);
assert.equal(normalizedConflict.code, 409);
assert.equal(normalizedConflict.errorCode, 'PRODUCT_ALIAS_CONFLICT');

mappings.push({
  id: 'map-audited', shopBindingId: 'shop-1', platformIdentityKey: 'product:AUDIT',
  platformProductId: 'AUDIT', platformSkuId: null, platformProductName: '历史商品', aliases: ['历史商品'],
  osProductId: 'prod-taojin', osProductName: '淘金AI', active: true,
  confirmedById: 'admin-1', confirmedByName: '管理员', confirmedAt: new Date(),
});
const retired = await service.deleteMapping('map-audited', actor);
assert.equal(retired.code, 0);
assert.equal(retired.data?.active, false);
assert.equal(deletedMappings.includes('map-audited'), false, '已被审计记录引用的映射不得物理删除');

const retiredShop = await service.deleteShop('shop-1', actor);
assert.equal(retiredShop.code, 0);
assert.equal(retiredShop.data?.active, false);
assert.ok(shops.some((shop) => shop.id === 'shop-1'), '已被审计记录引用的店铺不得物理删除');

await service.updateShop('shop-1', { active: true }, actor);
const matched = await service.resolveForIntake({
  shopBindingId: 'shop-1',
  facts: { platformProductId: 'DY-100', platformProductName: '淘金AI 多模态', paymentAmount: 349 },
});
assert.equal(matched.code, 0);
assert.equal(matched.data?.resolution.status, 'MATCHED');
assert.deepEqual(matched.data?.product, { id: 'prod-taojin', name: '淘金AI', referencePrice: 299 });
assert.deepEqual(matched.data?.priceDifference, {
  paymentAmount: 349, osReferencePrice: 299, amount: 50, differs: true,
});

const unmatched = await service.resolveForIntake({
  shopBindingId: 'shop-1', facts: { platformProductName: '完全未配置商品', paymentAmount: 299 },
});
assert.equal(unmatched.code, 0, '未匹配商品仍允许继续入库');
assert.equal(unmatched.data?.resolution.status, 'UNMATCHED');
assert.equal(unmatched.data?.product, null);

console.log('browser catalog service: ok');
