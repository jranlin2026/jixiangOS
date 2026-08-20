import assert from 'node:assert/strict';
import { resolveCarrierBrand } from './carrierBrand';

for (const [input, title, variant] of [
  ['移动', '中国移动', 'mobile'],
  ['中国联通', '中国联通', 'unicom'],
  ['电信', '中国电信', 'telecom'],
  ['中国广电', '中国广电', 'broadcast'],
] as const) {
  const brand = resolveCarrierBrand(input);
  assert.equal(brand.title, title);
  assert.equal(brand.variant, variant);
}

const fallback = resolveCarrierBrand('海外运营商');
assert.equal(fallback.variant, 'fallback');
assert.equal(fallback.fallbackLabel, '海');

assert.deepEqual(
  { hex: resolveCarrierBrand('移动').hex, secondaryHex: resolveCarrierBrand('移动').secondaryHex },
  { hex: '0085CC', secondaryHex: '95C11F' },
  '中国移动应使用标准蓝绿配色',
);
assert.equal(resolveCarrierBrand('电信').hex, '02489D', '中国电信应使用标准蓝色');
assert.equal(resolveCarrierBrand('联通').hex, 'DB2C1C', '中国联通应使用标准红色');
