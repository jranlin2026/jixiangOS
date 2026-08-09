import assert from 'node:assert/strict';
import { referencedBusinessShopDeletion } from './businessShopDirectoryGuard';

const current = [
  { id: 'platform-douyin', name: '抖音小店', isActive: true },
  { id: 'shop-linked', parentId: 'platform-douyin', name: '极享智能体', isActive: true },
  { id: 'shop-free', parentId: 'platform-douyin', name: '测试店', isActive: true },
];

assert.equal(referencedBusinessShopDeletion(current, current, new Set(['shop-linked'])), null);
assert.equal(referencedBusinessShopDeletion(current, current.filter((item) => item.id !== 'shop-free'), new Set(['shop-linked'])), null);
assert.equal(referencedBusinessShopDeletion(current, current.filter((item) => item.id !== 'shop-linked'), new Set(['shop-linked']))?.id, 'shop-linked');

console.log('business shop directory delete guard: ok');
