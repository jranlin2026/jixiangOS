import assert from 'node:assert/strict';
import { normalizePlatformProductName, resolveBrowserProduct } from './browserProductMatcher';

const products = [
  { id: 'prod-taojin', name: '淘金AI', price: 299, isActive: true },
  { id: 'prod-other', name: '其他产品', price: 299, isActive: true },
];

const taojinMapping = {
  id: 'map-1', shopBindingId: 'shop-1', platformIdentityKey: 'product:DY-100',
  platformProductId: 'DY-100', platformProductName: '淘金AI 多模态创作智能体 读书卡',
  aliases: [], osProductId: 'prod-taojin', osProductName: '淘金AI', active: true,
};

const missingShopContext = resolveBrowserProduct({
  facts: { platformProductId: 'DY-100' },
  products,
  mappings: [taojinMapping, { ...taojinMapping, id: 'map-2', shopBindingId: 'shop-2' }],
});
assert.equal(missingShopContext.status, 'CONFIG_CONFLICT', '缺少店铺上下文时，跨店铺映射不能静默命中商品');
if (missingShopContext.status === 'CONFIG_CONFLICT') {
  assert.match(missingShopContext.message, /店铺绑定/, '缺少店铺上下文的冲突必须说明原因');
  assert.match(missingShopContext.message, /shop-1.*map-1/, '冲突必须包含首个受影响的店铺和映射 ID');
  assert.match(missingShopContext.message, /shop-2.*map-2/, '冲突必须包含第二个受影响的店铺和映射 ID');
  assert.match(missingShopContext.message, /修正/, '冲突必须告诉操作员修正映射');
}

assert.deepEqual(resolveBrowserProduct({
  shopBindingId: 'shop-1',
  facts: { platformProductId: 'DY-100', platformProductName: '淘金AI 多模态创作智能体 读书卡', paymentAmount: 299 },
  products,
  mappings: [taojinMapping],
}), {
  status: 'MATCHED', method: 'PLATFORM_PRODUCT_ID',
  osProductId: 'prod-taojin', osProductName: '淘金AI', osReferencePrice: 299,
}, '平台商品 ID 映射必须优先于名称或价格');

assert.deepEqual(resolveBrowserProduct({
  shopBindingId: 'shop-1',
  facts: { platformSkuId: 'SKU-100-A', platformProductName: '完全不同的名称' },
  products,
  mappings: [{ ...taojinMapping, platformProductId: undefined, platformSkuId: 'SKU-100-A' }],
}), {
  status: 'MATCHED', method: 'PLATFORM_SKU_ID',
  osProductId: 'prod-taojin', osProductName: '淘金AI', osReferencePrice: 299,
}, 'SKU ID 映射必须在别名和完全同名之前匹配');

assert.equal(resolveBrowserProduct({
  facts: { platformProductName: '完全不同的名称', paymentAmount: 299 }, products, mappings: [],
}).status, 'UNMATCHED', '相同价格不能触发商品匹配');

assert.deepEqual(resolveBrowserProduct({
  shopBindingId: 'shop-1',
  facts: { platformProductName: '  淘金AI　学习卡 ' },
  products,
  mappings: [{ ...taojinMapping, aliases: ['淘金ai 学习卡'] }],
}), {
  status: 'MATCHED', method: 'SHOP_ALIAS',
  osProductId: 'prod-taojin', osProductName: '淘金AI', osReferencePrice: 299,
}, '同店铺别名规范化后必须命中映射');

assert.equal(resolveBrowserProduct({
  shopBindingId: 'shop-2',
  facts: { platformProductName: '淘金AI 学习卡' },
  products,
  mappings: [{ ...taojinMapping, aliases: ['淘金AI 学习卡'] }],
}).status, 'UNMATCHED', '其他店铺的别名不能泄漏到当前店铺');

assert.deepEqual(resolveBrowserProduct({
  facts: { platformProductName: ' ｔＡｏｊｉｎＡＩ ' },
  products: [...products, { id: 'prod-fullwidth', name: 'taojinai', price: 199, isActive: true }],
  mappings: [],
}), {
  status: 'MATCHED', method: 'EXACT_OS_NAME',
  osProductId: 'prod-fullwidth', osProductName: 'taojinai', osReferencePrice: 199,
}, '唯一启用 OS 产品完全同名时必须匹配');

assert.equal(resolveBrowserProduct({
  shopBindingId: 'shop-1',
  facts: { platformProductId: 'DY-100', platformProductName: '淘金AI' },
  products,
  mappings: [{ ...taojinMapping, active: false }],
}).status, 'MATCHED', '停用映射不能阻止后续唯一 OS 完全同名匹配');

assert.equal(resolveBrowserProduct({
  shopBindingId: 'shop-1',
  facts: { platformProductId: 'DY-100', platformProductName: '淘金AI' },
  products: products.map((product) => product.id === 'prod-taojin' ? { ...product, isActive: false } : product),
  mappings: [taojinMapping],
}).status, 'UNMATCHED', '停用 OS 产品不能被映射命中');

const conflictingMappings = resolveBrowserProduct({
  shopBindingId: 'shop-1',
  facts: { platformProductId: 'DY-100' },
  products,
  mappings: [taojinMapping, { ...taojinMapping, id: 'map-2', osProductId: 'prod-other', osProductName: '其他产品' }],
});
assert.equal(conflictingMappings.status, 'CONFIG_CONFLICT', '同一平台商品映射到不同 OS 产品必须暴露配置冲突');
if (conflictingMappings.status === 'CONFIG_CONFLICT') {
  assert.match(conflictingMappings.message, /shop-1.*map-1/, '配置冲突必须列出第一个受影响映射');
  assert.match(conflictingMappings.message, /shop-1.*map-2/, '配置冲突必须列出第二个受影响映射');
  assert.match(conflictingMappings.message, /修正/, '配置冲突必须告诉操作员修正映射');
}

assert.deepEqual(resolveBrowserProduct({ facts: { platformProductName: '  ' }, products, mappings: [] }), {
  status: 'UNMATCHED', rawProductName: '  ',
}, '空商品名不能通过完全同名回退匹配');

assert.equal(normalizePlatformProductName('　淘金AI\n学习卡  '), '淘金ai 学习卡', '商品名规范化必须处理全角和连续空白');

console.log('browser product matcher: ok');
