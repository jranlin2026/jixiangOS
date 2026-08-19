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
