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
let mappingScanRaceEnabled = false;
let mappingScanWaiters: Array<() => void> = [];
let mappingLockTail = Promise.resolve();
let mappingLockEntries = 0;
let activeMappingLocks = 0;
let maxActiveMappingLocks = 0;

async function waitForConcurrentMappingScans() {
  await new Promise<void>((resolve) => {
    mappingScanWaiters.push(resolve);
    if (mappingScanWaiters.length === 2) {
      const waiters = mappingScanWaiters;
      mappingScanWaiters = [];
      waiters.forEach((release) => release());
    }
  });
}

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
    if (mappingScanRaceEnabled && activeMappingLocks === 0) await waitForConcurrentMappingScans();
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
  async listProducts() { return structuredClone(products); },
  async findProductById(id) { return structuredClone(products.find((product) => product.id === id) || null); },
  async hasShopAuditReferences(id) { return id === 'shop-1'; },
  async withShopMappingLock(_shopBindingId, callback) {
    mappingLockEntries += 1;
    const previous = mappingLockTail;
    let release!: () => void;
    mappingLockTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    activeMappingLocks += 1;
    maxActiveMappingLocks = Math.max(maxActiveMappingLocks, activeMappingLocks);
    await new Promise<void>((resolve) => setImmediate(resolve));
    try {
      return await callback(repository);
    } finally {
      activeMappingLocks -= 1;
      release();
    }
  },
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

const mappingLockEntriesBeforeRace = mappingLockEntries;
mappingScanRaceEnabled = true;
const concurrentAliasResults = await Promise.all([
  service.saveMapping({
    shopBindingId: 'shop-1', platformProductId: 'DY-RACE-1', platformProductName: '并发商品A',
    aliases: ['  并发　同款  '], osProductId: 'prod-taojin', active: true,
  }, actor),
  service.saveMapping({
    shopBindingId: 'shop-1', platformProductId: 'DY-RACE-2', platformProductName: '并发商品B',
    aliases: ['并发 同款'], osProductId: 'prod-other', active: true,
  }, actor),
]);
mappingScanRaceEnabled = false;
assert.deepEqual(
  concurrentAliasResults.map((result) => result.code).sort((left, right) => left - right),
  [0, 409],
  '同店铺并发写入相同规范化别名时必须串行化校验与写入',
);
assert.equal(concurrentAliasResults.find((result) => result.code === 409)?.errorCode, 'PRODUCT_ALIAS_CONFLICT');
assert.equal(mappingLockEntries - mappingLockEntriesBeforeRace, 2, '每个映射保存路径都必须进入店铺数据库锁');
assert.equal(maxActiveMappingLocks, 1, '测试双必须真正串行执行同店铺写入');

mappings.push({
  id: 'map-audited', shopBindingId: 'shop-1', platformIdentityKey: 'product:AUDIT',
  platformProductId: 'AUDIT', platformSkuId: null, platformProductName: '历史商品', aliases: ['历史商品'],
  osProductId: 'prod-taojin', osProductName: '淘金AI', active: true,
  confirmedById: 'admin-1', confirmedByName: '管理员', confirmedAt: new Date(),
});
const mappingLockEntriesBeforeDeletes = mappingLockEntries;
const retired = await service.deleteMapping('map-audited', actor);
assert.equal(retired.code, 0);
assert.equal(retired.data?.active, false);
assert.ok(
  mappings.some((mapping) => mapping.id === 'map-audited' && mapping.active === false),
  '已被审计记录引用的映射必须保留并软删除',
);

for (const historicalMapping of [
  {
    id: 'map-alias-only-history', platformIdentityKey: 'name:历史别名',
    platformProductId: null, platformSkuId: null, platformProductName: '当前名称', aliases: ['当前别名'],
  },
  {
    id: 'map-changed-after-intake', platformIdentityKey: 'product:CHANGED',
    platformProductId: 'CHANGED', platformSkuId: null, platformProductName: '映射已改名', aliases: ['映射已改名'],
  },
]) {
  mappings.push({
    ...historicalMapping,
    shopBindingId: 'shop-1', osProductId: 'prod-taojin', osProductName: '淘金AI', active: true,
    confirmedById: 'admin-1', confirmedByName: '管理员', confirmedAt: new Date(),
  });
  const result = await service.deleteMapping(historicalMapping.id, actor);
  assert.equal(result.code, 0);
  assert.equal(result.data?.active, false);
  assert.ok(
    mappings.some((mapping) => mapping.id === historicalMapping.id && mapping.active === false),
    '别名历史命中或入库后被改动的映射无法安全证明未被审计引用，必须保留并软删除',
  );
}
assert.equal(
  mappingLockEntries - mappingLockEntriesBeforeDeletes,
  3,
  '软删除也是映射写路径，必须使用同一店铺事务锁',
);

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

const authoritativePreview = await service.previewProductMapping({
  platform: 'DOUYIN',
  shopBindingId: 'shop-1',
  pageShopDisplayName: ' 极享官方店 ',
  platformProductId: ' DY-100 ',
  platformProductName: ' 淘金AI 多模态 ',
  paymentAmount: 349,
  paymentAt: '2026-08-08T19:34:20+08:00',
});
assert.equal(authoritativePreview.code, 0);
assert.deepEqual(authoritativePreview.data, {
  shop: {
    id: 'shop-1', platform: 'DOUYIN', shopKey: 'jx-main', platformShopId: 'dy-shop-1',
    displayName: '极享智能体', aliases: ['极享官方店'], source: '抖音电商', sourceName: '飞鸽客服',
    sourceType: '公司资源',
  },
  productResolution: {
    status: 'MATCHED', method: 'PLATFORM_PRODUCT_ID', osProductId: 'prod-taojin',
    osProductName: '淘金AI', osReferencePrice: 299,
  },
  facts: {
    platformProductId: 'DY-100',
    platformProductName: '淘金AI 多模态',
    paymentAmount: 349,
    paymentAt: '2026-08-08T11:34:20.000Z',
  },
  priceDifference: { paymentAmount: 349, osReferencePrice: 299, amount: 50, differs: true },
}, '权威预览必须复用店铺校验和确定性匹配，并在入库前返回参考价');

const authoritativeUnmatched = await service.previewProductMapping({
  platform: 'DOUYIN', shopBindingId: 'shop-1', pageShopDisplayName: '极享智能体',
  platformProductName: '完全未配置商品', paymentAmount: 188,
});
assert.equal(authoritativeUnmatched.code, 0);
assert.deepEqual(authoritativeUnmatched.data?.productResolution, {
  status: 'UNMATCHED', rawProductName: '完全未配置商品',
});

const previewMismatch = await service.previewProductMapping({
  platform: 'DOUYIN', shopBindingId: 'shop-1', pageShopDisplayName: '其他店铺',
  platformProductName: '淘金AI 多模态',
});
assert.equal(previewMismatch.code, 409);
assert.equal(previewMismatch.errorCode, 'SHOP_CONTEXT_MISMATCH');

const previewUnavailable = await service.previewProductMapping({
  platform: 'DOUYIN', shopBindingId: 'shop-off', pageShopDisplayName: '旧店铺',
  platformProductName: '淘金AI 多模态',
});
assert.equal(previewUnavailable.code, 409);
assert.equal(previewUnavailable.errorCode, 'SHOP_BINDING_UNAVAILABLE');

mappings.push({
  id: 'map-preview-conflict', shopBindingId: 'shop-1', platformIdentityKey: 'product:DY-100',
  platformProductId: 'DY-100', platformSkuId: null, platformProductName: '冲突映射', aliases: ['冲突映射'],
  osProductId: 'prod-other', osProductName: '其他产品', active: true,
  confirmedById: 'admin-1', confirmedByName: '管理员', confirmedAt: new Date(),
});
const previewConflict = await service.previewProductMapping({
  platform: 'DOUYIN', shopBindingId: 'shop-1', pageShopDisplayName: '极享智能体',
  platformProductId: 'DY-100', platformProductName: '淘金AI 多模态',
});
assert.equal(previewConflict.code, 409);
assert.equal(previewConflict.errorCode, 'PRODUCT_CONFIG_CONFLICT');
mappings.splice(mappings.findIndex((mapping) => mapping.id === 'map-preview-conflict'), 1);

console.log('browser catalog service: ok');
