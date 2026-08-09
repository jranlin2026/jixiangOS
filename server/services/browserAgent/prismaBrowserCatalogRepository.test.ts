import assert from 'node:assert/strict';
import { businessPlatformCode, createPrismaBrowserCatalogRepository, matchLegacyBindingToBusinessShop, uniqueLegacyBusinessShopMatches } from './prismaBrowserCatalogRepository';

assert.equal(businessPlatformCode('抖音小店'), 'DOUYIN');
assert.equal(businessPlatformCode('抖店'), 'DOUYIN');
assert.equal(businessPlatformCode('微信小店'), 'WECHAT');
assert.equal(businessPlatformCode('快手小店'), 'KUAISHOU');
assert.equal(businessPlatformCode('小红书电商'), 'XIAOHONGSHU');

const directory = [
  { id: 'business-shop-1', platformId: 'platform-douyin', platformCode: 'DOUYIN', platformName: '抖音小店', name: '极享智能体', active: true },
  { id: 'business-shop-2', platformId: 'platform-wechat', platformCode: 'WECHAT', platformName: '微信小店', name: '极享智能体', active: true },
];
assert.equal(matchLegacyBindingToBusinessShop({ platform: 'DOUYIN', displayName: ' 极享智能体 ' }, directory)?.id, 'business-shop-1');
assert.equal(matchLegacyBindingToBusinessShop({ platform: 'DOUYIN', displayName: '极享' }, directory), null, '不允许模糊匹配店铺');
assert.equal(matchLegacyBindingToBusinessShop({ platform: 'DOUYIN', displayName: '极享 智能体' }, directory), null, '自动归并必须是去掉首尾空白后的完全一致');
assert.equal(matchLegacyBindingToBusinessShop({ platform: 'OTHER', displayName: '极享智能体' }, directory), null, '不允许跨平台匹配');
assert.deepEqual(uniqueLegacyBusinessShopMatches([
  { platform: 'DOUYIN', displayName: '极享智能体' },
  { platform: 'DOUYIN', displayName: '极享智能体' },
], directory), [null, null], '多个旧绑定匹配同一权威店铺时必须交给管理员处理');

let lockedRows: Array<{ id: string; active: number }> = [];
const lockQueries: string[] = [];
const transaction = {
  browserShopBinding: {}, browserProductMapping: {}, browserLeadSync: {}, businessRecord: {},
  async $queryRaw(query: { sql?: string }) {
    lockQueries.push(String(query.sql || ''));
    return structuredClone(lockedRows);
  },
};
const repository = createPrismaBrowserCatalogRepository({
  ...transaction,
  async $transaction(callback: (client: typeof transaction) => Promise<unknown>) {
    return callback(transaction);
  },
} as any);

const missing = await repository.withShopMappingLock('shop-missing', async (_mappingRepository, lockedShop) => lockedShop);
assert.equal(missing, null, '锁查询无行时必须向服务显式报告店铺不存在');

lockedRows = [{ id: 'shop-inactive', active: 0 }];
const inactive = await repository.withShopMappingLock('shop-inactive', async (_mappingRepository, lockedShop) => lockedShop);
assert.deepEqual(inactive, { id: 'shop-inactive', active: false }, '行锁必须返回事务内的最新停用状态');

lockedRows = [{ id: 'shop-active', active: 1 }];
const active = await repository.withShopMappingLock('shop-active', async (_mappingRepository, lockedShop) => lockedShop);
assert.deepEqual(active, { id: 'shop-active', active: true });
assert.equal(lockQueries.length, 3);
for (const query of lockQueries) {
  assert.match(query, /SELECT id, active FROM browser_shop_bindings/i);
  assert.match(query, /FOR UPDATE/i);
}

console.log('prisma browser catalog shop lock: ok');
