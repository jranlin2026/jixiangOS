import assert from 'node:assert/strict';
import { resolveDeviceBrand } from './deviceBrand';

for (const [input, title] of [
  ['苹果', 'Apple'],
  ['荣耀', 'HONOR'],
  ['华为', 'Huawei'],
  ['小米', 'Xiaomi'],
  ['OPPO', 'OPPO'],
  ['vivo', 'Vivo'],
  ['三星', 'Samsung'],
  ['联想', 'Lenovo'],
] as const) {
  const brand = resolveDeviceBrand(input);
  assert.ok(brand.path, `${input}应解析为品牌图标`);
  assert.match(brand.title, new RegExp(title, 'i'));
}

const fallback = resolveDeviceBrand('其他品牌');
assert.equal(fallback.path, undefined);
assert.equal(fallback.fallbackLabel, '其');
