import assert from 'node:assert/strict';
import { createBrowserCatalogService, type BrowserCatalogRepository } from './browserCatalogService';

const actor = { id: 'admin-1', name: '管理员', role: 'admin' } as any;
const businessShops = [{
  id: 'business-shop-main',
  platformId: 'business-platform-douyin',
  platformCode: 'DOUYIN',
  platformName: '抖音小店',
  name: '极享新店',
  active: true,
}, {
  id: 'business-shop-auto',
  platformId: 'business-platform-douyin',
  platformCode: 'DOUYIN',
  platformName: '抖音小店',
  name: '自动接入店',
  platformShopId: 'dy-business-main',
  aliases: ['自动接入旗舰店'],
  active: true,
}, {
  id: 'business-shop-legacy',
  platformId: 'business-platform-douyin',
  platformCode: 'DOUYIN',
  platformName: '抖音小店',
  name: '极享智能体统一店',
  active: true,
}, {
  id: 'business-shop-wechat',
  platformId: 'business-platform-wechat',
  platformCode: 'WECHAT',
  platformName: '微信小店',
  name: '极享微信店',
  active: true,
}, {
  id: 'business-shop-race',
  platformId: 'business-platform-douyin',
  platformCode: 'DOUYIN',
  platformName: '抖音小店',
  name: '并发接入店',
  active: true,
}];
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
  {
    id: 'shop-other-platform', platform: 'WECHAT', shopKey: 'wx-main', platformShopId: null,
    displayName: '微信店铺', aliases: [], source: '微信', sourceName: '微信客服', sourceType: '公司资源',
    active: true, createdById: 'admin-1', createdByName: '管理员',
  },
  {
    id: 'shop-legacy-unlinked', platform: 'DOUYIN', shopKey: 'legacy-unlinked', platformShopId: null,
    displayName: '待归并旧店', aliases: [], source: '抖音电商', sourceName: '飞鸽客服',
    sourceType: '公司资源', active: false, createdById: 'admin-1', createdByName: '管理员',
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
let catalogWriteCalls = 0;
let mappingReadCalls = 0;
let nextLockedShopState: 'MISSING' | 'INACTIVE' | null = null;
let nextShopUpdateUniqueConflict = false;

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
  async listBusinessShops() { return structuredClone(businessShops); },
  async findBusinessShopById(id) { return structuredClone(businessShops.find((shop) => shop.id === id) || null); },
  async listShops() { return structuredClone(shops); },
  async findShopById(id) { return structuredClone(shops.find((shop) => shop.id === id) || null); },
  async findShopByPlatformAndKey(platform, shopKey) {
    return structuredClone(shops.find((shop) => shop.platform === platform && shop.shopKey === shopKey) || null);
  },
  async createShop(input) {
    catalogWriteCalls += 1;
    const saved = { ...input, id: `shop-${shops.length + 1}` };
    shops.push(saved as any);
    return structuredClone(saved as any);
  },
  async updateShop(id, input) {
    catalogWriteCalls += 1;
    if (nextShopUpdateUniqueConflict) {
      nextShopUpdateUniqueConflict = false;
      throw Object.assign(new Error('unique'), { code: 'P2002' });
    }
    const index = shops.findIndex((shop) => shop.id === id);
    if (index < 0) return null;
    shops[index] = { ...shops[index], ...input } as any;
    return structuredClone(shops[index]);
  },
  async deleteShop(id) {
    catalogWriteCalls += 1;
    const index = shops.findIndex((shop) => shop.id === id);
    if (index < 0) return false;
    shops.splice(index, 1);
    return true;
  },
  async listMappings(shopBindingId) {
    mappingReadCalls += 1;
    if (mappingScanRaceEnabled && activeMappingLocks === 0) await waitForConcurrentMappingScans();
    return structuredClone(mappings.filter((mapping) => !shopBindingId || mapping.shopBindingId === shopBindingId));
  },
  async findMappingById(id) {
    return structuredClone(mappings.find((mapping) => mapping.id === id) || null);
  },
  async createMapping(input) {
    catalogWriteCalls += 1;
    const saved = { ...input, id: `map-${mappings.length + 1}` };
    mappings.push(saved);
    return structuredClone(saved);
  },
  async updateMapping(id, input) {
    catalogWriteCalls += 1;
    const index = mappings.findIndex((mapping) => mapping.id === id);
    if (index < 0) return null;
    mappings[index] = { ...mappings[index], ...input };
    return structuredClone(mappings[index]);
  },
  async listProducts() { return structuredClone(products); },
  async findProductById(id) { return structuredClone(products.find((product) => product.id === id) || null); },
  async hasShopAuditReferences(id) { return id === 'shop-1'; },
  async withShopMappingLock(shopBindingId, callback) {
    mappingLockEntries += 1;
    const previous = mappingLockTail;
    let release!: () => void;
    mappingLockTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    activeMappingLocks += 1;
    maxActiveMappingLocks = Math.max(maxActiveMappingLocks, activeMappingLocks);
    await new Promise<void>((resolve) => setImmediate(resolve));
    try {
      const currentShop = shops.find((shop) => shop.id === shopBindingId) || null;
      const lockedShop = nextLockedShopState === 'MISSING'
        ? null
        : currentShop && { id: currentShop.id, active: nextLockedShopState === 'INACTIVE' ? false : currentShop.active };
      nextLockedShopState = null;
      return await (callback as any)(repository, lockedShop);
    } finally {
      activeMappingLocks -= 1;
      release();
    }
  },
};

const service = createBrowserCatalogService({ repository });

const syncedBusinessShop = await service.syncBusinessShop('business-shop-auto', actor);
assert.equal(syncedBusinessShop.code, 0);
assert.equal(syncedBusinessShop.data?.businessShopId, 'business-shop-auto');
assert.equal(syncedBusinessShop.data?.shopKey, 'business-business-shop-auto');
assert.equal(syncedBusinessShop.data?.platformShopId, 'dy-business-main');
assert.deepEqual(syncedBusinessShop.data?.aliases, ['自动接入旗舰店']);
const syncedBusinessBindingId = syncedBusinessShop.data?.id;
businessShops[1].name = '自动接入店（更新）';
businessShops[1].platformShopId = 'dy-business-main-2';
businessShops[1].aliases = ['自动接入官方店'];
const resyncedBusinessShop = await service.syncBusinessShop('business-shop-auto', actor);
assert.equal(resyncedBusinessShop.code, 0);
assert.equal(resyncedBusinessShop.data?.id, syncedBusinessBindingId);
assert.equal(resyncedBusinessShop.data?.displayName, '自动接入店（更新）');
assert.equal(resyncedBusinessShop.data?.platformShopId, 'dy-business-main-2');
assert.deepEqual(resyncedBusinessShop.data?.aliases, ['自动接入官方店']);
businessShops[1].active = false;
const retiredBusinessShop = await service.syncBusinessShop('business-shop-auto', actor);
assert.equal(retiredBusinessShop.code, 0);
assert.equal(retiredBusinessShop.data?.active, false);
delete businessShops[1].platformShopId;
delete businessShops[1].aliases;
businessShops[1].active = true;
const legacyMasterSync = await service.syncBusinessShop('business-shop-auto', actor);
assert.equal(legacyMasterSync.code, 0);
assert.equal(legacyMasterSync.data?.platformShopId, 'dy-business-main-2');
assert.deepEqual(legacyMasterSync.data?.aliases, ['自动接入官方店']);
businessShops[1].active = false;
await service.syncBusinessShop('business-shop-auto', actor);

const unsupportedSync = await service.syncBusinessShop('business-shop-wechat', actor);
assert.equal(unsupportedSync.code, 400);
assert.match(unsupportedSync.message, /仅支持抖音/);

const unsupportedBusinessShop = await service.createShop({
  businessShopId: 'business-shop-wechat', shopKey: 'wechat-linked', aliases: [], active: true,
}, actor);
assert.equal(unsupportedBusinessShop.code, 400);
assert.match(unsupportedBusinessShop.message, /仅支持抖音/);

const runtime = await service.listRuntimeShops();
assert.equal(runtime.code, 0);
assert.deepEqual(runtime.data, {
  shops: [{
    id: 'shop-1', platform: 'DOUYIN', shopKey: 'jx-main', platformShopId: 'dy-shop-1',
    displayName: '极享智能体', aliases: ['极享官方店'], source: '抖音电商', sourceName: '飞鸽客服',
    sourceType: '公司资源',
  }],
});

const linkedShop = await service.createShop({
  businessShopId: 'business-shop-main',
  shopKey: 'jx-linked',
  platformShopId: 'dy-linked',
  aliases: ['极享新店旗舰店'],
  active: true,
}, actor);
assert.equal(linkedShop.code, 0);
assert.equal(linkedShop.data?.businessShopId, 'business-shop-main');
assert.equal(linkedShop.data?.businessPlatformId, 'business-platform-douyin');
assert.equal(linkedShop.data?.platform, 'DOUYIN');
assert.equal(linkedShop.data?.displayName, '极享新店');
const duplicateBusinessShop = await service.createShop({
  businessShopId: 'business-shop-main', shopKey: 'jx-linked-copy', aliases: [], active: true,
}, actor);
assert.equal(duplicateBusinessShop.code, 409);
assert.match(duplicateBusinessShop.message, /已接入/);

const attachedLegacyShop = await service.updateShop('shop-legacy-unlinked', {
  businessShopId: 'business-shop-legacy',
  aliases: ['极享官方店'],
}, actor);
assert.equal(attachedLegacyShop.code, 0);
assert.equal(attachedLegacyShop.data?.businessShopId, 'business-shop-legacy');
assert.equal(attachedLegacyShop.data?.displayName, '极享智能体统一店');

nextShopUpdateUniqueConflict = true;
const concurrentAttach = await service.updateShop('shop-off', {
  businessShopId: 'business-shop-race', aliases: [],
}, actor);
assert.equal(concurrentAttach.code, 409);
assert.match(concurrentAttach.message, /已接入/);

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

for (const [lockedState, expectedCode, expectedError] of [
  ['MISSING', 404, 'SHOP_BINDING_NOT_FOUND'],
  ['INACTIVE', 409, 'SHOP_BINDING_UNAVAILABLE'],
] as const) {
  const writesBeforeLockedValidation = catalogWriteCalls;
  const mappingReadsBeforeLockedValidation = mappingReadCalls;
  nextLockedShopState = lockedState;
  const changedAfterPrecheck = await service.saveMapping({
    shopBindingId: 'shop-1', platformProductId: `DY-${lockedState}`,
    platformProductName: `锁内状态-${lockedState}`, aliases: [],
    osProductId: 'prod-taojin', active: true,
  }, actor);
  assert.equal(changedAfterPrecheck.code, expectedCode, '店铺预检后的最新锁内状态必须决定写入结果');
  assert.equal(changedAfterPrecheck.errorCode, expectedError);
  assert.equal(mappingReadCalls, mappingReadsBeforeLockedValidation, '锁内店铺无效时不得扫描别名冲突');
  assert.equal(catalogWriteCalls, writesBeforeLockedValidation, '锁内店铺无效时不得写映射');
}

const savedMapping = await service.saveMapping({
  shopBindingId: 'shop-1', platformProductId: 'DY-100',
  platformProductName: '  淘金ＡＩ   多模态  ', aliases: ['读书卡', ' 读书卡 '],
  osProductId: 'prod-taojin', active: true,
}, actor);
assert.equal(savedMapping.code, 0);
assert.equal(savedMapping.data?.osProductName, '淘金AI');
assert.deepEqual(savedMapping.data?.aliases, ['淘金ai 多模态', '读书卡']);

products.push({ id: 'prod-other', name: '其他产品', price: 399, isActive: true });
mappings.push({
  id: 'map-disabled-shop-alias', shopBindingId: 'shop-off', platformIdentityKey: 'name:停用店专属别名',
  platformProductId: null, platformSkuId: null, platformProductName: '停用店商品', aliases: ['停用店专属别名'],
  osProductId: 'prod-other', osProductName: '其他产品', active: true,
  confirmedById: 'admin-1', confirmedByName: '管理员', confirmedAt: new Date(),
});
const disabledShopAlias = await service.resolveForIntake({
  platform: 'DOUYIN', shopBindingId: 'shop-1', pageShopDisplayName: '极享智能体',
  facts: { platformProductName: '停用店专属别名' },
});
assert.equal(disabledShopAlias.code, 0);
assert.equal(disabledShopAlias.data?.resolution.status, 'UNMATCHED', '停用店铺的映射不得参与公司范围匹配');
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
  platform: 'DOUYIN',
  shopBindingId: 'shop-1',
  pageShopDisplayName: '极享官方店',
  facts: { platformProductId: 'DY-100', platformProductName: '淘金AI 多模态', paymentAmount: 349 },
});
assert.equal(matched.code, 0);
assert.equal(matched.data?.resolution.status, 'MATCHED');
assert.deepEqual(matched.data?.product, { id: 'prod-taojin', name: '淘金AI', referencePrice: 299 });
assert.deepEqual(matched.data?.priceDifference, {
  paymentAmount: 349, osReferencePrice: 299, amount: 50, differs: true,
});

const unmatched = await service.resolveForIntake({
  platform: 'DOUYIN', shopBindingId: 'shop-1',
  pageShopDisplayName: '极享智能体',
  facts: { platformProductName: '完全未配置商品', paymentAmount: 299 },
});
assert.equal(unmatched.code, 0, '未匹配商品仍允许继续入库');
assert.equal(unmatched.data?.resolution.status, 'UNMATCHED');
assert.equal(unmatched.data?.product, null);

const catalogWriteCallsBeforePreview = catalogWriteCalls;
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

const excessivePaymentPrecision = await service.previewProductMapping({
  platform: 'DOUYIN', shopBindingId: 'shop-1', pageShopDisplayName: '极享官方店',
  platformProductId: 'DY-100', platformProductName: '淘金AI 多模态', paymentAmount: 299.001,
  paymentAt: '2026-08-08T19:34:20+08:00',
});
assert.equal(excessivePaymentPrecision.code, 400);
assert.equal(excessivePaymentPrecision.errorCode, 'INVALID_INPUT');
assert.match(excessivePaymentPrecision.message, /最多两位小数/);

const inexactDisplayedCents = await service.previewProductMapping({
  platform: 'DOUYIN', shopBindingId: 'shop-1', pageShopDisplayName: '极享官方店',
  platformProductId: 'DY-100', platformProductName: '淘金AI 多模态',
  paymentAmount: 298.99999999999994, paymentAt: '2026-08-08T19:34:20+08:00',
});
assert.equal(inexactDisplayedCents.code, 400, '超过两位小数的浮点近似值不得静默四舍五入');
assert.match(inexactDisplayedCents.message, /最多两位小数/);

const authoritativeUnmatched = await service.previewProductMapping({
  platform: 'DOUYIN', shopBindingId: 'shop-1', pageShopDisplayName: '极享智能体',
  platformProductName: '完全未配置商品', paymentAmount: 188,
  paymentAt: '2026-08-08T19:34:20+08:00',
});
assert.equal(authoritativeUnmatched.code, 0);
assert.deepEqual(authoritativeUnmatched.data?.productResolution, {
  status: 'UNMATCHED', rawProductName: '完全未配置商品',
});

const zeroPaymentPreview = await service.previewProductMapping({
  platform: 'DOUYIN', shopBindingId: 'shop-1', pageShopDisplayName: '极享智能体',
  platformProductName: '完全未配置商品', paymentAmount: 0,
  paymentAt: '2026-08-08T19:34:20+08:00',
});
assert.equal(zeroPaymentPreview.code, 0, '精确0元实付是允许的业务事实');
assert.equal(zeroPaymentPreview.data?.facts.paymentAmount, 0);

const optionalFactsPreview = await service.previewProductMapping({
  platform: 'DOUYIN', shopBindingId: 'shop-1', pageShopDisplayName: undefined,
});
assert.equal(optionalFactsPreview.code, 0, '页面店铺、商品、实付和付款时间缺失不应阻断入OS预检');
assert.deepEqual(optionalFactsPreview.data?.productResolution, { status: 'UNMATCHED', rawProductName: '' });

for (const [label, invalidFacts, expectedMessage] of [
  ['无效实付', { platformProductName: '商品', paymentAmount: Number.NaN }, /实付金额/],
  ['无效付款时间', { platformProductName: '商品', paymentAmount: 299, paymentAt: 'not-a-time' }, /付款时间/],
] as const) {
  const beforeWrites = catalogWriteCalls;
  const invalidPreview = await service.previewProductMapping({
    platform: 'DOUYIN', shopBindingId: 'shop-1', pageShopDisplayName: '极享智能体',
    ...invalidFacts,
  } as any);
  assert.equal(invalidPreview.code, 400, `${label}时不得静默录入错误快照`);
  assert.equal(invalidPreview.errorCode, 'INVALID_INPUT');
  assert.match(invalidPreview.message, expectedMessage);
  assert.equal(catalogWriteCalls, beforeWrites, `${label}时不得写目录`);
}

const previewMismatch = await service.previewProductMapping({
  platform: 'DOUYIN', shopBindingId: 'shop-1', pageShopDisplayName: '其他店铺',
  platformProductName: '淘金AI 多模态', paymentAmount: 299,
  paymentAt: '2026-08-08T19:34:20+08:00',
});
assert.equal(previewMismatch.code, 409);
assert.equal(previewMismatch.errorCode, 'SHOP_CONTEXT_MISMATCH');

for (const pageShopDisplayName of [undefined, '   ']) {
  const previewMissingShopContext = await service.previewProductMapping({
    platform: 'DOUYIN', shopBindingId: 'shop-1', pageShopDisplayName,
    platformProductName: '淘金AI 多模态', paymentAmount: 299,
    paymentAt: '2026-08-08T19:34:20+08:00',
  });
  assert.equal(previewMissingShopContext.code, 0, '页面店铺未识别时以客服绑定店铺为准');
}

const previewUnavailable = await service.previewProductMapping({
  platform: 'DOUYIN', shopBindingId: 'shop-off', pageShopDisplayName: '旧店铺',
  platformProductName: '淘金AI 多模态', paymentAmount: 299,
  paymentAt: '2026-08-08T19:34:20+08:00',
});
assert.equal(previewUnavailable.code, 409);
assert.equal(previewUnavailable.errorCode, 'SHOP_BINDING_UNAVAILABLE');

const previewWrongPlatformBinding = await service.previewProductMapping({
  platform: 'DOUYIN', shopBindingId: 'shop-other-platform', pageShopDisplayName: '微信店铺',
  platformProductName: '淘金AI 多模态', paymentAmount: 299,
  paymentAt: '2026-08-08T19:34:20+08:00',
});
assert.equal(previewWrongPlatformBinding.code, 409);
assert.equal(previewWrongPlatformBinding.errorCode, 'SHOP_BINDING_UNAVAILABLE');

mappings.push({
  id: 'map-preview-conflict', shopBindingId: 'shop-1', platformIdentityKey: 'product:DY-100',
  platformProductId: 'DY-100', platformSkuId: null, platformProductName: '冲突映射', aliases: ['冲突映射'],
  osProductId: 'prod-other', osProductName: '其他产品', active: true,
  confirmedById: 'admin-1', confirmedByName: '管理员', confirmedAt: new Date(),
});
const previewConflict = await service.previewProductMapping({
  platform: 'DOUYIN', shopBindingId: 'shop-1', pageShopDisplayName: '极享智能体',
  platformProductId: 'DY-100', platformProductName: '淘金AI 多模态', paymentAmount: 299,
  paymentAt: '2026-08-08T19:34:20+08:00',
});
assert.equal(previewConflict.code, 409);
assert.equal(previewConflict.errorCode, 'PRODUCT_CONFIG_CONFLICT');
mappings.splice(mappings.findIndex((mapping) => mapping.id === 'map-preview-conflict'), 1);
assert.equal(catalogWriteCalls, catalogWriteCallsBeforePreview, '权威预览服务不得触发任何目录写操作；其依赖合同中不存在预留或线索创建能力');

console.log('browser catalog service: ok');
