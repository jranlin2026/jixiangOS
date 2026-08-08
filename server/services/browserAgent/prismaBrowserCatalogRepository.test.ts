import assert from 'node:assert/strict';
import { createPrismaBrowserCatalogRepository } from './prismaBrowserCatalogRepository';

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
